"use server";

import { createPublicClient } from "@takemore/db";
import { reportError } from "@takemore/observability";

/**
 * Record the opt-out. Called from the button on the page and from the
 * one-click POST handler — never from a GET, because mail scanners, link
 * previews and antivirus proxies open every link in an email, and each of
 * those visits used to unsubscribe the person without them knowing.
 */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const client = createPublicClient();
  const { data, error } = await client.rpc("unsubscribe", { p_token: token });
  // A failed opt-out is the one failure here that has legal weight. The token
  // is deliberately not passed to the reporter — it identifies the customer.
  if (error) reportError(error, { where: "web/unsubscribe" });
  return data === true;
}
