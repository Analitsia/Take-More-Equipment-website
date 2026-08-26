"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalisePhone } from "@takemore/core";
import { Button, Field, Input, Panel } from "@takemore/ui";
import {
  approveRequest,
  inviteStaff,
  rejectRequest,
  resetPassword,
  setActive,
} from "./actions";

/**
 * Who is on the team — and, since 20260819110000, nothing about ranks.
 *
 * There used to be a role picker on every row and another one on the form. They
 * are gone because the thing they chose is gone: everybody signed in can do
 * everything. What is left on this screen is the only distinction that remains,
 * and it is not a rank — it is the door. Somebody is on the team or they are
 * not, and the owner is who decides.
 *
 * That makes this the most consequential screen in the app. Every cost, every
 * margin and every sale is visible to anybody who gets past it.
 */

type Member = {
  user_id: string;
  full_name: string;
  /** From auth, read by the owner's page only. Null if it could not be read. */
  email: string | null;
  active: boolean;
  approved_at: string | null;
  created_at: string;
};

type Issued = { email: string; password: string; name: string; phone: string };

/**
 * Every server action here is awaited from a phone that may be walking behind
 * a container. A rejected promise used to leave the button spinning for ever;
 * now it lands as a sentence, and the busy flag is always cleared.
 */
const OFFLINE = "Could not reach the server. Check the connection and try again.";

export default function TeamManager({
  requests,
  members,
  currentUserId,
}: {
  requests: Member[];
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      const result = await inviteStaff(email, name);
      if (!result.ok) return setError(result.error);
      setIssued({
        email: email.trim().toLowerCase(),
        password: result.password!,
        name: name.trim(),
        phone,
      });
      setEmail("");
      setName("");
      setPhone("");
      router.refresh();
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Nobody can put themselves in this queue any more — the request form is
          gone from the login screen — so this exists for anyone who was already
          in it when that changed. It vanishes entirely when it is empty. */}
      {requests.length > 0 && (
        <Panel
          title="Asking to join"
          subtitle="They already have a password. Letting them in is all that is left."
          className="border-accent/40"
        >
          <ul className="divide-y divide-white/5">
            {requests.map((request) => (
              <AccessRequest
                key={request.user_id}
                request={request}
                onError={setError}
                onDone={() => router.refresh()}
              />
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Everyone" subtitle="Everybody here can do everything.">
        <ul className="divide-y divide-white/5">
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              isSelf={member.user_id === currentUserId}
              onError={setError}
              onIssued={setIssued}
              onDone={() => router.refresh()}
            />
          ))}
        </ul>
      </Panel>

      <Panel
        title="Add someone"
        subtitle="You type their email. The system makes a password for you to send them."
      >
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sipho Ndlovu" />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sipho@takemoreequipment.co.za"
              />
            </Field>
          </div>

          <Field
            label="WhatsApp number"
            hint="optional — it is only used to open the message, never stored"
          >
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="082 123 4567"
              inputMode="tel"
            />
          </Field>

          {error && <p className="text-xs text-status-sold">{error}</p>}

          <Button onClick={invite} loading={busy} disabled={!email.trim() || !name.trim()}>
            Create the account
          </Button>
        </div>
      </Panel>

      {/* Below the form rather than inside it, so a password issued from a row
          above lands in the same place as one issued by the form. */}
      {issued && <Handover issued={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

/**
 * One person on the team. Two buttons, both the owner's: in or out, and a new
 * password for somebody who lost theirs.
 *
 * The email is shown because it is what the owner types into the form and what
 * the person types into the login screen — "which of these is the account
 * Thabo cannot get into" is not answerable from a name.
 */
function MemberRow({
  member,
  isSelf,
  onError,
  onIssued,
  onDone,
}: {
  member: Member;
  isSelf: boolean;
  onError: (message: string | null) => void;
  onIssued: (issued: Issued) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<"active" | "password" | null>(null);

  async function toggleActive() {
    setBusy("active");
    onError(null);
    try {
      const result = await setActive(member.user_id, !member.active);
      if (!result.ok) onError(result.error);
      else onDone();
    } catch {
      onError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  async function newPassword() {
    const sure = window.confirm(
      `Give ${member.full_name} a new password? The old one stops working straight away.`
    );
    if (!sure) return;

    setBusy("password");
    onError(null);
    try {
      const result = await resetPassword(member.user_id);
      if (!result.ok) return onError(result.error);
      onIssued({
        email: member.email ?? "",
        password: result.password!,
        name: member.full_name,
        phone: "",
      });
    } catch {
      onError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-light ${member.active ? "" : "text-muted line-through"}`}>
          {member.full_name}
          {isSelf && <span className="text-[11px] text-muted ml-2 no-underline">you</span>}
        </p>
        {member.email && (
          <p className="text-[11px] font-light text-muted truncate">{member.email}</p>
        )}
      </div>

      {/* Deactivate is the whole vocabulary of this screen: in, or out. Somebody
          who leaves keeps their name on every log entry from when they worked
          here, which is why the row stays. The password button is for the day
          somebody's phone is lost, and is only offered while they are in. */}
      {!isSelf && (
        <div className="flex items-center gap-3 shrink-0">
          {member.active && (
            <button
              type="button"
              onClick={newPassword}
              disabled={busy !== null}
              className="text-xs font-light text-muted hover:text-white transition-colors whitespace-nowrap disabled:opacity-40"
            >
              {busy === "password" ? "Making…" : "New password"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleActive}
            disabled={busy !== null}
            className="text-xs font-light text-muted hover:text-white transition-colors whitespace-nowrap disabled:opacity-40"
          >
            {busy === "active" ? "Saving…" : member.active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * The password, once.
 *
 * There is no reset-by-email flow in this app, so this box is the only time
 * this string exists anywhere a person can read it. If it is lost, the owner
 * issues another from the row above — which is survivable, and much better
 * than a reset link nobody maintains.
 *
 * The WhatsApp button is a plain link to wa.me with the message pre-typed. It
 * sends nothing by itself: it opens WhatsApp with the words already there and a
 * human presses send. Nothing about the number is stored — it is used to build
 * this link and then it is gone with the page.
 */
function Handover({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState(issued.phone);

  // Wherever this app is being used from is where the new person signs in.
  // A hard-coded host was wrong the day the domain changed.
  const site = typeof window !== "undefined" ? window.location.origin : "";

  const message =
    `Hi ${issued.name.split(" ")[0] || "there"} — here is your login for Take More Ops.\n\n` +
    `Website: ${site}\n` +
    `Email: ${issued.email}\n` +
    `Password: ${issued.password}\n\n` +
    `Please change the password once you are in: tap your name, then Change password.`;

  // wa.me wants digits only, no plus. normalisePhone gives E.164 or null, and
  // null is the answer for half a number typed while somebody reads it out —
  // in which case there is simply no button and the text is there to copy.
  const e164 = normalisePhone(phone);
  const wa = e164 ? `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` : null;

  return (
    <div className="bg-background border border-accent/40 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent mb-2">
            Password for {issued.name} — shown once, send it now
          </p>
          <p className="text-sm font-light break-all">{issued.email}</p>
          <p className="text-sm font-medium tracking-tight break-all">{issued.password}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="text-[11px] font-light text-muted hover:text-white transition-colors shrink-0"
        >
          Done
        </button>
      </div>

      {!issued.phone && (
        <Field label="WhatsApp number" hint="optional — only used to open the message">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="082 123 4567"
            inputMode="tel"
          />
        </Field>
      )}

      <div className="flex flex-wrap gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent text-background rounded-xl px-3 py-2
                       text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <iconify-icon icon="mdi:whatsapp" width="15" height="15" noobserver="" />
            Send on WhatsApp
          </a>
        )}

        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              // Insecure origin or permission refused. The text is on screen.
            }
          }}
          className="inline-flex items-center gap-2 border border-border text-white/85 rounded-xl
                     px-3 py-2 text-xs font-medium hover:border-white/25 transition-colors"
        >
          {copied ? "Copied" : "Copy the message"}
        </button>
      </div>

      <p className="text-[11px] font-light text-muted">
        Ask them to change it once they are in — their name, then Change password.
      </p>
    </div>
  );
}

/**
 * One person waiting at the door, from before requests were turned off.
 *
 * Reject asks first. It deletes the account, which is the one irreversible
 * button on this screen, and it sits two centimetres from the one that lets
 * them in.
 */
function AccessRequest({
  request,
  onError,
  onDone,
}: {
  request: Member;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const asked = new Date(request.created_at);

  async function run(action: "approve" | "reject") {
    if (action === "reject") {
      const sure = window.confirm(
        `Turn away ${request.full_name}? Their account is deleted and they would have to ask again.`
      );
      if (!sure) return;
    }

    setBusy(action);
    onError(null);
    try {
      const result =
        action === "approve"
          ? await approveRequest(request.user_id)
          : await rejectRequest(request.user_id);
      if (!result.ok) onError(result.error);
      else onDone();
    } catch {
      onError(OFFLINE);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="py-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-light truncate">{request.full_name}</p>
        <p className="text-[11px] font-light text-muted">
          {request.email ? `${request.email} · ` : ""}
          asked {asked.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => run("approve")}
          loading={busy === "approve"}
          disabled={busy !== null}
          className="px-3 py-1.5 text-xs"
        >
          Let them in
        </Button>

        <Button
          variant="danger"
          onClick={() => run("reject")}
          loading={busy === "reject"}
          disabled={busy !== null}
          className="px-3 py-1.5 text-xs"
        >
          Reject
        </Button>
      </div>
    </li>
  );
}
