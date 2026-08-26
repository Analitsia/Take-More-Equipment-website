# Roadmap — Take-More-Equipment-website

Scope only. Read on demand; this file is not loaded automatically.

## Now
- **Deploy.** The 2026-08-26 launch-readiness pass is applied to the database (three
  migrations) and running locally; both Vercel projects still serve the commit before it.
  Push `main` and both redeploy.
- **Set the Turnstile keys on the storefront project** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
  `TURNSTILE_SECRET_KEY`, both). Until then the enquiry form steps aside in production and
  shows WhatsApp and the phone number instead.
- **Set `CRON_SECRET` on the ops project** if it is not already there, then
  `OPS_URL=https://takemore-ops.vercel.app CRON_SECRET=… npm run test:match` to prove the
  04:00 sweep is accepted. `/api/health` says "never run" until the first one.
- **Fill the four remaining contact facts** in `apps/web/src/data/launch.ts` (email, hours,
  information officer, domain) and flip `launchState` to `"live"` before the domain points
  at Vercel. Until then those placeholders are published.
- ~~Decide whether the item code should stay visible to the public.~~ **Decided: it stays,
  and the storefront now shows it.** The code is the handle a customer and a salesperson
  share — a screenshot of a product page is unidentifiable without it, and "the fridge" is
  four machines. The cost of that is real and accepted: codes are sequential, so `A021` tells
  a visitor this is the twenty-first machine the business ever took in. If that ever matters
  more than the handle does, `app.sku_renumber_2026` holds the old-to-new map and a second
  renumbering to non-sequential codes is the fix — not hiding the column.
- Work `docs/launch-checklist.md`. Verify readiness with `npm run check:launch` and
  `npm run check:launch:db` rather than by eye.
- **Confirm the registration number against the CIPC certificate once.**
  `2026/328785/07` is what the business's own invoice INV-0014 carries, and it
  is now published on `/privacy` and printed on every invoice — evidence rather
  than a guess, but read off a document rather than off the register. Everything
  else on the invoice is set and verified; this is the one fact still worth
  seeing at source.

## Shipped, 26 August 2026 — launch-readiness pass
- **Production wiped of demo data.** Every invented machine, customer, order and invoice
  is gone; codes restart at `A001`, orders at `ORD-0001`, invoices at `INV-0015`.
- **A sale cannot be un-sold by a stray tap.** Removing a line or discarding an order is
  refused once the order is paid (`remove_order_line()`, and a checked delete in
  `discardOrder`). Paying a sale or a hire refuses a machine already sold or deleted.
- **One invoice per identical document.** Issuing the same invoice twice returns the one
  already issued instead of burning a number; the button only offers a corrected
  document when the order has changed since.
- **Hire invoices add up on paper.** Cents are printed when any figure has them, long
  orders break pages before the totals, dates print in SAST.
- **Only `listed` is live, in the database.** Leaving For sale clears `published_at`
  whichever way the status was written, and a reserved or sold machine cannot be
  republished (the negotiated price would have shown in `public_items`).
- **The newsletter is on the record.** Every campaign send writes one outreach row per
  recipient, so the seven-day cap and the customer timeline see it. A deleted person
  leaves the queue and cannot be written to. Sending twice, fast, sends once.
- **Unsubscribe is a button, not a visit.** Mail scanners opening the link no longer
  opt people out; one-click (RFC 8058) POSTs to `/api/unsubscribe`.
- **Team screen:** a deactivated person is told so on the login screen; the owner can
  issue a new password; emails show on the roster; a database blip no longer signs the
  whole team out; Sign out is per device, with Sign out everywhere on Account.
- **Stock screen:** the board says when a machine moved but could not go on the site;
  uploads time out and can be stopped and retried by photo; the last photo of a live
  listing cannot be deleted; reverting a value saves; errors read as sentences.
- **Storefront:** an honest empty-catalogue page, sitemap, robots, canonicals, Product
  JSON-LD, an OG image, a 404 and error page, "Price on request" instead of R0, and a
  failed database read no longer caches an empty site for five minutes. The enquiry
  form steps aside rather than failing when Turnstile is unconfigured.
- **Ops is installable** (manifest, icons, standalone) with baseline security headers on
  both apps; functions pinned to Frankfurt next to the database; CI builds every
  migration from zero; the live suites are manual-only.

## Shipped, August 2026

- **Something to hand the customer.** A proforma before the money and an invoice
  after it, as a PDF that prints, downloads, or goes to WhatsApp with the file
  actually attached where the phone allows it. Each machine is billed at its
  asking price with the negotiated saving on one line underneath, rather than
  each machine quietly showing its pro-rata share of the discount — the customer
  argued for that number and it belongs on the paper.

  The document is **frozen** at issue, in the transaction that numbers it.
  Rename a machine afterwards and the invoice already handed over is unchanged,
  which is the same reason `order_lines` snapshots the asking price. Correcting
  one means issuing a new one that records what it supersedes; `order_invoices`
  has no UPDATE policy and no DELETE policy at all.

  Invoice numbers continue the spreadsheet at **INV-0015** — starting at 1 would
  have minted a second INV-0014 for a different customer. Proformas run
  separately as `PRO-`, so a gap in the invoice run never has to be explained as
  "that one was a quote".

  Two things it deliberately will not do: it cannot say "tax invoice" and it
  refuses an issuer carrying a VAT number, because Take More is not a registered
  vendor and issuing one anyway is an offence rather than a formatting choice.

  Written with `pdf-lib` after `@react-pdf/renderer` proved unusable here — Next
  vendors its own React for server code (19.2-canary) while that library picks
  its reconciler from the React in `node_modules` (18.3.1), and every render
  died on a React version mismatch reported from inside a PDF library. The note
  at the top of `lib/invoice-pdf.ts` has the detail so nobody tries it again.
- **No ranks.** Everybody signed in can do everything, including correcting a paid sale.
  Adding and removing people is still the owner's, and is now the only thing that is.
  `app.at_least()` ignores its argument; restoring that one function body brings ten
  policies back with it.
- **Accounts are made, not requested.** The request-access form is gone from the login
  screen and its action refuses. Team → Add someone generates a password and offers to open
  WhatsApp with it typed out. This also closed a live bug: with no Turnstile key on the ops
  project, that form refused every request in production with "briefly unavailable".
- **An order nobody finished is not kept.** Never paid, and it is discarded outright —
  the row, its lines and its line on the timeline. Paid and then cancelled, and it stays
  for ever with its reason. Same rule for a machine draft nobody filled in.
- **A machine goes back where it came from.** `order_lines.held_from_status` remembers what
  it was doing when the order picked it up, so a fryer from the workshop bench does not come
  back marked For sale.
- **New, on a phone, asks which.** One slot in the bottom bar, two things you can start.
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

## Known broken

- Nothing at the time of writing. The `test:leads` failure recorded here earlier was the
  test counting suggestions across the whole database while demo customers who also
  wanted a stove were in it — the matcher was right. The assertions are per person now.

## Later, not started
- A card machine or bank feed that reconciles itself against `orders`. Today somebody reads
  a slip and ticks a box.
- VAT, if Take More registers. Adding it after the fact means recalculating sales already
  recorded, so it is more work than it looks.
- Deposits and part payments. An order is paid or it is not.
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

Updated: 2026-08-26
