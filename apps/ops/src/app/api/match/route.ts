import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@takemore/db/admin";

/**
 * The nightly sweep.
 *
 * Every live machine is re-matched against every recorded want. Not because the
 * publish path is unreliable, but because the things it cannot see happen all
 * the time: a category filled in an hour after the item went up, a customer
 * captured five minutes after the machine was listed, a deploy that landed
 * mid-publish.
 *
 * Same shape as the storefront's 300-second cache expiry sitting behind the
 * revalidate webhook — one eager path, one patient one, and the patient one is
 * what makes the eager one allowed to fail quietly.
 *
 * Idempotent by construction: the outreach_once index absorbs every repeat, so
 * running this hourly, nightly or twice by accident produces the same queue.
 *
 * Wire it up in Vercel with a cron on this path. Vercel signs its own cron
 * requests with CRON_SECRET; the REVALIDATE_SECRET header is accepted too so
 * the loop can be exercised by hand from a terminal.
 */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = request.headers.get("authorization") ?? "";
    if (safeEqual(header, `Bearer ${cronSecret}`)) return true;
  }

  const shared = process.env.REVALIDATE_SECRET;
  if (shared) {
    const provided =
      request.headers.get("x-revalidate-secret") ??
      request.nextUrl.searchParams.get("secret") ??
      "";
    if (safeEqual(provided, shared)) return true;
  }

  return false;
}

async function run(request: NextRequest) {
  if (!process.env.CRON_SECRET && !process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  // The admin client, because a cron has no signed-in user. run_stock_match()
  // is SECURITY DEFINER and refuses any caller that HAS a uid but is not staff,
  // so this path is reachable only by something holding the secret key — which
  // never leaves the server.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_stock_match");

  if (error) {
    console.error("run_stock_match failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ queued: data ?? 0, at: new Date().toISOString() });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
