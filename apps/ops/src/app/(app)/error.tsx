"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@takemore/observability";

/**
 * What a worker sees when something breaks.
 *
 * Until this file existed, anything that threw — a page, a server action, a
 * query against a table that is not there yet — put a raw Next.js error screen
 * in front of whoever pressed the button. In development that is a stack trace;
 * in production it is a blank page saying an error occurred. Neither tells a
 * person holding a phone in a warehouse what to do next, and both teach them
 * that the tool is unreliable in a way they cannot act on.
 *
 * So: one sentence about what happened, a button that retries, and a way back
 * to somewhere that works. The technical detail is still available — it goes to
 * Sentry, and the digest is printed so it can be quoted — but it is not the
 * headline.
 *
 * This catches everything below (app), which is the whole tool. It deliberately
 * does not catch the root layout; that would need global-error.tsx, and a
 * failure that far up means the shell itself is broken.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { where: "ops/app-boundary", digest: error.digest });
  }, [error]);

  // PostgREST says "Could not find the table 'public.orders' in the schema
  // cache" when a deploy has landed ahead of its migration. It is the single
  // most likely thing to go wrong on the day a feature ships, and the raw
  // wording sends people looking for a bug in the app instead of a migration
  // that has not been run.
  const missingSchema =
    /schema cache|does not exist|Could not find the table/i.test(error.message);

  return (
    <div className="max-w-lg mx-auto py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-card border border-border mx-auto
                      flex items-center justify-center text-status-sold mb-4">
        <iconify-icon icon="solar:danger-triangle-linear" width="20" height="20" noobserver="" />
      </div>

      <h1 className="text-xl font-medium tracking-tight">
        {missingSchema ? "This part of the app is not ready yet" : "That did not work"}
      </h1>

      <p className="text-sm font-light text-muted mt-2 leading-relaxed">
        {missingSchema
          ? "The screen has shipped but the database change behind it has not been applied. Nothing is broken and nothing was lost — this part simply cannot work until somebody runs the migration."
          : "Something went wrong on our side. Nothing you typed has been lost unless the screen says otherwise."}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
        <button
          type="button"
          onClick={reset}
          className="bg-accent text-background rounded-xl px-4 py-2.5 text-sm font-medium
                     hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border border-border text-white/85 rounded-xl px-4 py-2.5 text-sm font-medium
                     hover:border-white/25 hover:text-white transition-colors"
        >
          Back to the dashboard
        </Link>
      </div>

      {/* Quotable rather than prominent. "It said 4f2a1c" is the difference
          between a bug report somebody can act on and "it broke". */}
      {error.digest && (
        <p className="text-[11px] font-light text-muted/70 mt-6 tabular-nums">
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
