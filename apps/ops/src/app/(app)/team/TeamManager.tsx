"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@takemore/core";
import { Button, Field, Input, Panel, Select } from "@takemore/ui";
import { inviteStaff, setActive, setRole } from "./actions";

type Member = {
  user_id: string;
  full_name: string;
  role: AppRole;
  active: boolean;
};

export default function TeamManager({
  members,
  currentUserId,
}: {
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
