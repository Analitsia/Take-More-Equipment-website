import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createPublicClient } from "@takemore/db";
import { reportError } from "@takemore/observability";
import { site } from "@/data/site";

/**
 * The opt-out, and it has to be this easy.
 *
 * POPIA s69 requires an opt-out in every marketing message and that it be
 * honoured; Gmail and Yahoo require one-click unsubscribe (RFC 8058) from bulk
 * senders. Both are satisfied by a link that needs no account, no login and no
 * "are you sure" — the token in the URL is the whole authorisation.
 *
 * Note what is NOT in the URL: an email address. A link like this travels
 * through mail clients, link-scanners and referrer headers, and an address in a
 * query string is an address you have published.
 */

export const metadata: Metadata = {
  title: "Unsubscribe — Take More",
  robots: { index: false, follow: false },
};

// The token makes every visit unique, so there is nothing worth caching, and a
// cached "done" page shown to the next person would be actively wrong.
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let done = false;
  if (token) {
    const client = createPublicClient();
    const { data, error } = await client.rpc("unsubscribe", { p_token: token });
    // A failed opt-out is the one failure here that has legal weight: the
    // person asked to be left alone and the system did not record it. The token
    // is deliberately not passed to the reporter — it identifies the customer.
    if (error) reportError(error, { where: "web/unsubscribe" });
    done = data === true;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="solid" />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 md:px-12 py-16 md:py-28">
        <div className="max-w-xl">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-5 h-1 rounded-full bg-accent" />
            <span className="text-accent uppercase text-xs tracking-wider font-normal">
              {done ? "Done" : "Unsubscribe"}
            </span>
          </div>

          {done ? (
            <>
              <h1 className="text-3xl md:text-5xl font-medium tracking-tighter leading-[1.1] mb-6">
                You are off the list.
              </h1>
              <p className="text-muted font-light text-sm md:text-base leading-relaxed mb-4">
                We will not send you any more equipment updates. It takes effect
                immediately — nothing further is queued.
              </p>
              <p className="text-muted font-light text-sm leading-relaxed">
                If you are in the middle of buying something from us, that conversation
                carries on as normal. This only stops the marketing.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl md:text-5xl font-medium tracking-tighter leading-[1.1] mb-6">
                That link is not valid.
              </h1>
              <p className="text-muted font-light text-sm md:text-base leading-relaxed mb-4">
                It may have been cut in half by your email app — they sometimes wrap long
                links. Try opening it again from the original message.
              </p>
              <p className="text-muted font-light text-sm leading-relaxed">
                Or just reply to any message from us, or WhatsApp {site.phone}, and we
                will take you off by hand. Either works.
              </p>
            </>
          )}

          <Link
            href="/"
            className="inline-flex items-center gap-3 mt-10 text-sm font-light hover:text-accent transition-colors pb-2 border-b border-white/10 hover:border-accent"
          >
            <span>Back to the stock</span>
            <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
