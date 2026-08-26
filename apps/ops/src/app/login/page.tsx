import { redirect } from "next/navigation";
import { staffState } from "@/lib/supabase";
import LoginForm from "./LoginForm";
import SignOutButton from "@/components/SignOutButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ revoked?: string }>;
}) {
  const state = await staffState();

  // Already signed in — no reason to show a login form. Someone mid-request
  // goes to the screen that explains where their request has got to, not back
  // to a form they have already successfully filled in.
  if (state.state === "active") redirect("/");
  if (state.state === "pending") redirect("/pending");

  // Set when a session survives an account being turned off. Without this the
  // person is dropped on a login form with no explanation, tries the password
  // that used to work, and is told it is wrong.
  const { revoked: flagged } = await searchParams;
  // Either the redirect said so, or the session in the cookie says so on its
  // own — the second case is a deactivated person opening the app directly.
  const revoked = !!flagged || state.state === "revoked";

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-5 h-1 rounded-full bg-accent" />
            <span className="text-accent uppercase text-xs tracking-wider">
              Take More
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight leading-tight">
            Operations
          </h1>
          <p className="text-sm font-light text-muted mt-2 leading-relaxed">
            Stock intake, workshop, sales and publishing. New to the team? Ask
            the owner to make you an account.
          </p>
        </div>

        {revoked && (
          <p className="text-xs font-light text-muted bg-card border border-border rounded-xl px-3 py-2.5 mb-5 leading-relaxed">
            Your access to this app has been turned off. Speak to the owner if
            that is not what you expected.
            {state.state === "revoked" && (
              <span className="block mt-2">
                <SignOutButton compact />
              </span>
            )}
          </p>
        )}

        <LoginForm />
      </div>
    </main>
  );
}
