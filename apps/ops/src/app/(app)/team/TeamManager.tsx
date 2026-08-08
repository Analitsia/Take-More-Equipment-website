"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@takemore/core";
import { Button, Field, Input, Panel, Select } from "@takemore/ui";
import { approveRequest, inviteStaff, rejectRequest, setActive, setRole } from "./actions";

type Member = {
  user_id: string;
  full_name: string;
  role: AppRole;
  active: boolean;
  approved_at: string | null;
  created_at: string;
};

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
  const [role, setNewRole] = useState<AppRole>("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    const result = await inviteStaff(email, name, role);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setIssued({ email, password: result.password! });
    setEmail("");
    setName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Requests lead the page when there are any, and vanish entirely when
          there are not — a permanently visible empty queue trains an owner to
          scroll past the one place that needs them. */}
      {requests.length > 0 && (
        <Panel
          title="Asking to join"
          subtitle="They already have a password. Approving is all that is left."
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

      <Panel title="Everyone">
        <ul className="divide-y divide-white/5">
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-light ${member.active ? "" : "text-muted line-through"}`}>
                  {member.full_name}
                  {member.user_id === currentUserId && (
                    <span className="text-[11px] text-muted ml-2">you</span>
                  )}
                </p>
              </div>

              <select
                value={member.role}
                disabled={member.user_id === currentUserId}
                onChange={async (e) => {
                  const result = await setRole(member.user_id, e.target.value as AppRole);
                  if (!result.ok) setError(result.error);
                  else router.refresh();
                }}
                className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs font-light
                           text-white/90 hover:border-white/20 focus:border-accent focus:outline-none
                           transition-colors disabled:opacity-40"
              >
                {APP_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>

              {member.user_id !== currentUserId && (
                <button
                  onClick={async () => {
                    const result = await setActive(member.user_id, !member.active);
                    if (!result.ok) setError(result.error);
                    else router.refresh();
                  }}
                  className="text-xs font-light text-muted hover:text-white transition-colors whitespace-nowrap"
                >
                  {member.active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Add someone" subtitle="They get a password you hand over. Ask them to change it.">
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sipho Ndlovu" />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                autoCapitalize="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sipho@takemoreequipment.co.za"
              />
            </Field>
          </div>

          <Field
            label="Role"
            hint={
              role === "staff"
                ? "Can take in and edit stock. Never sees costs or margin."
                : role === "manager"
                  ? "Everything staff can do, plus costs and margin."
                  : "Full access, including the team."
            }
          >
            <Select value={role} onChange={(e) => setNewRole(e.target.value as AppRole)}>
              {APP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>

          {error && <p className="text-xs text-status-sold">{error}</p>}

          <Button onClick={invite} loading={busy} disabled={!email.trim() || !name.trim()}>
            Create the account
          </Button>

          {issued && (
            <div className="bg-background border border-accent/40 rounded-xl p-4">
              <p className="text-xs font-medium text-accent mb-2">
                Shown once — copy it now
              </p>
              <p className="text-sm font-light break-all">{issued.email}</p>
              <p className="text-sm font-medium tracking-tight break-all">{issued.password}</p>
              <p className="text-[11px] font-light text-muted mt-2">
                Hand this over in person or by WhatsApp, and ask them to change it.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/**
 * One person waiting at the door.
 *
 * The role picker sits next to Approve rather than appearing after it, because
 * choosing what someone can see is part of the decision to let them in — and
 * because the difference between staff and manager here is whether they can
 * read what every machine cost.
 *
 * Reject asks first. It deletes the account, which is the one irreversible
 * button on this screen, and it sits two centimetres from Approve.
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
  const [role, setRole] = useState<AppRole>("staff");
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
    const result =
      action === "approve"
        ? await approveRequest(request.user_id, role)
        : await rejectRequest(request.user_id);
    setBusy(null);

    if (!result.ok) onError(result.error);
    else onDone();
  }

  return (
    <li className="py-3 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-light truncate">{request.full_name}</p>
        <p className="text-[11px] font-light text-muted shrink-0">
          {asked.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          disabled={busy !== null}
          className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs font-light
                     text-white/90 hover:border-white/20 focus:border-accent focus:outline-none
                     transition-colors disabled:opacity-40"
        >
          {APP_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>

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
