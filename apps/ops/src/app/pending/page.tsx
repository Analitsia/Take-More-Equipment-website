import { redirect } from "next/navigation";
import { staffState } from "@/lib/supabase";
import SignOutButton from "@/components/SignOutButton";
import ApprovalWatcher from "./ApprovalWatcher";

/**
 * Waiting to be let in.
 *
 * This screen exists because a valid session and permission to use the app are
 * now different things. Without it, someone who has just requested access signs
 * in perfectly successfully, is bounced back to /login because they are not
 * staff yet, and reasonably concludes their password is wrong.
 *
 * force-dynamic because the whole page is a question about a row that changes
 * outside this request — a cached copy of "not yet" is exactly the wrong thing
 * to hold on to.
 */
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const state = await staffState();

  if (state.state === "anonymous") redirect("/login");
  // The moment the owner approves, the poll below lands here and leaves.
  if (state.state === "active") redirect("/");
  // Approved once and since deactivated. Not a pending request, and telling
  // them to keep waiting would be a lie.
  if (state.state === "revoked") redirect("/login?revoked=1");

  const requested = new Date(state.requestedAt);

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12">
      <ApprovalWatcher />

      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-5 h-1 rounded-full bg-accent" />
          <span className="text-accent uppercase text-xs tracking-wider">Take More</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-medium tracking-tight leading-tight">
          Waiting on the owner
        </h1>

        <p className="text-sm font-light text-muted mt-3 leading-relaxed">
          Your request is in. As soon as it is approved this page lets you
          through on its own — you do not need to do anything, and there is no
          email to look for.
        </p>

        <dl className="mt-6 bg-card border border-border rounded-2xl divide-y divide-white/5">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-xs font-light text-muted">Name</dt>
            <dd className="text-sm font-light truncate">{state.fullName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-xs font-light text-muted">Email</dt>
            <dd className="text-sm font-light truncate">{state.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-xs font-light text-muted">Requested</dt>
            <dd className="text-sm font-light">
              {requested.toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "short",
              })}
              {" · "}
              {requested.toLocaleTimeString("en-ZA", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </dd>
          </div>
        </dl>

        <p className="text-[11px] font-light text-muted mt-5 leading-relaxed">
          Waiting longer than you expected? Ask the owner to check Team — your
          request is sitting at the top of it.
        </p>

        <div className="mt-5">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
