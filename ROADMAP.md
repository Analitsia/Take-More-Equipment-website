# Roadmap — Take-More-Equipment-website

Scope only. Read on demand; this file is not loaded automatically.

## Now
- **Set `GOOGLE_MAPS_API_KEY` and `BUSINESS_ORIGIN_ADDRESS` on the ops Vercel project.**
  Until then the order screen asks the salesperson to type the kilometres, which works and
  prices identically — the fee is computed from whatever distance is stored, by a trigger.
- Decide whether the item code should stay visible to the public. `public_items` still
  exposes `sku`, and now that codes are short and sequential, `A021` tells a visitor this is
  the twenty-first machine the business ever took in. The storefront renders it nowhere, so
  removing it is a view and a grant.
- Work `docs/launch-checklist.md`. Verify readiness with `npm run check:launch` and
  `npm run check:launch:db` rather than by eye.

## Shipped, August 2026
- **Short item codes.** `A042` instead of `TME-2608-0417`, so a code can be written on a
  machine with a marker and read back with one hand. All 32 existing machines were
  renumbered to `A001`–`A032`; `app.sku_renumber_2026` holds the old-to-new map permanently.
  `/items/[id]/label` prints one.
- **Costs visible to everyone.** `app.can_see_costs()` is now any approved account rather
  than manager and above. The structure is untouched, so re-restricting it is one function
  body — see the note in `20260819090100_everyone_sees_costs.sql`.
- **Orders.** An in-person sale screen: pick or capture the customer, add machines by code,
  see the cost floor and the new-price anchor while negotiating, quote delivery by distance,
  record what was actually agreed and whether it came by card machine or transfer. Payment
  is recorded, never processed.
- **The revenue figures became true.** `confirm_order_paid()` is the first thing in this
  codebase ever to write `items.sale_price_cents`. Every money view already read
  `coalesce(sale_price_cents, list_price_cents)`, so until now the dashboard reported
  *asking* prices and called them revenue, and a discount was invisible to the business that
  gave it. No view changed.
- **`npm run test:schema`.** Builds every migration against a real Postgres with no Docker,
  no project and no credentials, then drives the whole sale. The only suite that can catch a
  broken migration before it reaches something that matters.

## Known broken, and not by this work

- **`npm run test:leads` fails one assertion**: *"a machine answering their OTHER want
  still gets through"*. A person with two recorded wants should get a suggestion for each;
  the second one is being suppressed by the first one's pending draft, which is exactly what
  `20260811120000_a_message_for_each_want.sql` was written to prevent.

  Deterministic — three runs, same failure. Confirmed **not** caused by the August 2026
  work: none of those migrations mention `match_item_to_leads`, `run_stock_match`,
  `outreach_messages` or `lead_interests`; `scripts/test-lead-loop.mjs` is untouched; and
  building the schema with and without them produces identical matcher behaviour.

  Worth an hour on its own. The consequence in the business is real but quiet: a customer
  who asked for two different machines only ever hears about one of them.

## Later, not started
- A card machine or bank feed that reconciles itself against `orders`. Today somebody reads
  a slip and ticks a box.
- VAT, if Take More registers. Adding it after the fact means recalculating sales already
  recorded, so it is more work than it looks.
- Deposits and part payments. An order is paid or it is not.
- A receipt or invoice to hand the customer.
- Shelf-space efficiency on the dashboard. Its spec in `docs/architecture.md` is stale —
  dimensions became centimetres in `20260808090300`.

## Not doing
- Anything that puts a secret, internal business data, or a reference to another of Carlos's
  businesses into this repo. It is **public**.
- Barcodes. Considered and dropped in August 2026: a Code128 label needs a thermal printer,
  a ribbon, a scanner and a bridge between a browser and a USB device, and it buys speed at
  a counter that serves a handful of customers a day. The short code does the same job with
  a marker. Nothing here blocks a scanner later — a scanner is a keyboard, and
  `app.normalise_item_code()` already reads what it would type.

Updated: 2026-08-19
