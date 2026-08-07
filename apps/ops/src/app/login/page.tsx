import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/supabase";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  // Already signed in — no reason to show a login form.
  if (await currentStaff()) redirect("/");

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
            Stock intake, workshop and publishing. Staff accounts only — there is
            no public sign-up.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
