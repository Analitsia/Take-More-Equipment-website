import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/supabase";
import { deliveryFeeCents } from "@takemore/core";
import { reportError } from "@takemore/observability";

/**
 * How far is it, and what does that cost?
 *
 * Google's Routes API, from the warehouse to whatever address the salesperson
 * typed, and then the delivery rule applied to the answer.
 *
 * ── The most important line in this file ──────────────────────────────────
 *
 * `await requireStaff()`, first. Without it this route is an open proxy to a
 * metered Google API on our key: anybody who found the URL could point a script
 * at it and the first anyone would know is the bill. Restricting the key in
 * Google Cloud to the Routes API is the second lock, not the first.
 *
 * ── It never blocks a sale ────────────────────────────────────────────────
 *
 * Three things can go wrong and none of them is fatal, because the distance is
 * an editable field with or without this route. A farm road that Google cannot
 * resolve is a normal thing for a person to type, and the driver knows the road
 * better than the API does anyway — so the honest answer to every failure is
 * "type the kilometres", which is a supported path rather than a degraded one.
 *
 *   no key configured   503, and the UI simply never offers the lookup
 *   no route found      200 with km: null — the address, not the service
 *   timeout / quota     200 with km: null, and Sentry hears about it
 *
 * ── Why TRAFFIC_UNAWARE ───────────────────────────────────────────────────
 *
 * A delivery fee has to be deterministic. The same address must quote the same
 * price on a Tuesday morning as on a Sunday night, or two customers compare
 * notes and one of them is right to be annoyed.
 */

export const dynamic = "force-dynamic";

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

export async function POST(request: NextRequest) {
  await requireStaff();

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const origin = process.env.BUSINESS_ORIGIN_ADDRESS;

  if (!key || !origin) {
    // Same posture as revalidateStorefront() with no secret configured: say so
    // plainly and let the caller carry on, rather than failing loudly about a
    // convenience nobody has set up yet.
    return NextResponse.json(
      { km: null, reason: "not-configured" },
      { status: 503 }
    );
  }

  let address = "";
  try {
    const body = (await request.json()) as { address?: unknown };
    address = typeof body.address === "string" ? body.address.trim() : "";
  } catch {
    address = "";
  }

  if (address.length < 4) {
    return NextResponse.json({ km: null, reason: "no-address" }, { status: 400 });
  }

  try {
    const response = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // The field mask is not decoration: Routes bills by what you ask for,
        // and this asks for one number.
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        regionCode: "ZA",
        languageCode: "en-ZA",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      reportError(new Error(`Routes API ${response.status}`), { where: "api/distance" });
      return NextResponse.json({ km: null, reason: "unavailable" });
    }

    const data = (await response.json()) as { routes?: { distanceMeters?: number }[] };
    const metres = data.routes?.[0]?.distanceMeters;

    if (typeof metres !== "number") {
      // Google answered, and the answer is "there is no route to that".
      return NextResponse.json({ km: null, reason: "unresolvable" });
    }

    // One decimal, because orders.delivery_km is numeric(6,1) and a figure the
    // screen shows should be the figure the database will keep.
    const km = Math.round(metres / 100) / 10;

    return NextResponse.json({ km, feeCents: deliveryFeeCents(km), source: "google" });
  } catch (error) {
    reportError(error, { where: "api/distance" });
    return NextResponse.json({ km: null, reason: "unavailable" });
  }
}
