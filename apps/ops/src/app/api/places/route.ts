import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/supabase";
import { reportError } from "@takemore/observability";

/**
 * What address did they mean?
 *
 * Google's Places Autocomplete, so a salesperson types "19 6th" and picks the
 * road off a list instead of spelling out a suburb they have only heard over
 * the phone. The string that comes back is what /api/distance then measures to,
 * which is the point: a chosen suggestion is an address Google already knows it
 * can route to, so the distance lookup stops failing on typos and shorthand.
 *
 * ── Same first line as /api/distance, for the same reason ─────────────────
 *
 * `await requireStaff()`, before anything reaches Google. Without it this is an
 * open proxy to a metered API on our key, and autocomplete is the worse of the
 * two to leave open: it bills per keystroke-batch rather than per order.
 *
 * ── It is a convenience, never a requirement ──────────────────────────────
 *
 * Every failure here returns an empty list, and the field it feeds stays an
 * ordinary text box. No key, Places not enabled, a farm road nobody has mapped,
 * the API down — in all four the salesperson types the address exactly as they
 * do today and the fee is identical. Nothing downstream can tell the difference.
 *
 * ── Cost, and why it is shaped this way ───────────────────────────────────
 *
 * "Autocomplete Requests" is an Essentials SKU: 10,000 free events a month.
 * A debounced field spends roughly four of those per address entered, so a few
 * dozen orders a day sits near 2,500 — comfortably inside the free tier. The
 * debounce lives in the client component; this route is deliberately dumb so
 * there is one place to reason about how often it is called.
 */

export const dynamic = "force-dynamic";

const AUTOCOMPLETE_ENDPOINT = "https://places.googleapis.com/v1/places:autocomplete";

/**
 * Cape Town, roughly. Not a secret and not a business fact — the warehouse
 * suburb is printed on the website's contact page. It biases suggestions toward
 * the metro so "Main Road" offers the one twenty minutes away before the one in
 * Johannesburg. `includedRegionCodes` is the hard filter; this is only a nudge.
 */
const BIAS_CENTRE = { latitude: -33.87, longitude: 18.51 };

/**
 * 50km is the ceiling Places allows, and asking for more is a 400 rather than a
 * clamp — which is how this was found. It covers the metro and the near Winelands;
 * a delivery to Stellenbosch still resolves, it is just not nudged for.
 */
const BIAS_RADIUS_METRES = 50_000;

type Suggestion = { main: string; secondary: string; text: string };

export async function POST(request: NextRequest) {
  await requireStaff();

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ suggestions: [], reason: "not-configured" });
  }

  let input = "";
  try {
    const body = (await request.json()) as { input?: unknown };
    input = typeof body.input === "string" ? body.input.trim() : "";
  } catch {
    input = "";
  }

  // Below three characters every suggestion is noise, and it would still be a
  // billed request. The client debounces too; this is the backstop.
  if (input.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const response = await fetch(AUTOCOMPLETE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["za"],
        languageCode: "en-ZA",
        locationBias: {
          circle: { center: BIAS_CENTRE, radius: BIAS_RADIUS_METRES },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      // A 403 here is the ordinary state until Places API is enabled on the key
      // and is not worth waking anybody for. Anything else might be.
      if (response.status !== 403) {
        reportError(new Error(`Places autocomplete ${response.status}`), {
          where: "api/places",
        });
      }
      return NextResponse.json({ suggestions: [], reason: "unavailable" });
    }

    const data = (await response.json()) as {
      suggestions?: {
        placePrediction?: {
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }[];
    };

    const suggestions: Suggestion[] = (data.suggestions ?? [])
      .map((entry) => {
        const prediction = entry.placePrediction;
        const text = prediction?.text?.text ?? "";
        return {
          // The full string is what gets written into the field and later
          // measured, so it is the one that has to be complete. The split
          // pair is only how the row is drawn.
          text,
          main: prediction?.structuredFormat?.mainText?.text ?? text,
          secondary: prediction?.structuredFormat?.secondaryText?.text ?? "",
        };
      })
      .filter((suggestion) => suggestion.text.length > 0)
      .slice(0, 5);

    return NextResponse.json({ suggestions });
  } catch (error) {
    reportError(error, { where: "api/places" });
    return NextResponse.json({ suggestions: [], reason: "unavailable" });
  }
}
