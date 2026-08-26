"use client";

import { useEffect } from "react";
import { reportError } from "@takemore/observability";

/**
 * The boundary for everything outside (app)/ — the login and waiting screens.
 *
 * (app)/error.tsx covers the tool itself. Before this file existed, a throw on
 * the login page — the profile read failing, say — showed Next's blank
 * production error to somebody who had not even got in yet. Same three things
 * as the other boundary: one sentence, a retry, and a reference to quote.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { where: "ops/root-boundary", digest: error.digest });
  }, [error]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 py-12">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-medium tracking-tight">That did not work</h1>
        <p className="text-sm font-light text-muted mt-2 leading-relaxed">
          Something went wrong on our side. Try again in a moment — if it keeps
          happening, tell the owner and quote the reference below.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 bg-accent text-background rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        {error.digest && (
          <p className="text-[11px] font-light text-muted/70 mt-6 tabular-nums">
            Reference {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
