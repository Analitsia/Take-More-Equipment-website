import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "../../unsubscribe/actions";

/**
 * RFC 8058 one-click unsubscribe — the URL in the List-Unsubscribe header.
 *
 * Gmail and Yahoo POST here with the body `List-Unsubscribe=One-Click` when
 * somebody presses the button in their mail client. That is a deliberate act
 * by the recipient, so it opts out at once. A GET — a mail client or a
 * scanner opening the header URL in a browser — is sent to the page, which
 * shows a button and acts only on that; a GET must never opt anybody out.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const done = token ? await unsubscribeByToken(token) : false;
  return new NextResponse(done ? "Unsubscribed." : "That link is not valid.", {
    status: done ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const target = new URL("/unsubscribe", request.nextUrl.origin);
  if (token) target.searchParams.set("token", token);
  return NextResponse.redirect(target, 303);
}
