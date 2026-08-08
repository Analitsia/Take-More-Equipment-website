# Take More Equipment — Platform Architecture & Build Plan

> Status: **approved 2026-08-04**. This is the reference document for all build sessions.
> Phase 1 (website MVP) is the next session's scope.

## Context

Take More Catering Equipment (Pty) Ltd, Cape Town, buys commercial catering equipment at
auction, refurbishes it, and resells it. Today `takemoreequipment.co.za` is a single static
HTML page on Hostinger with an 841 KB screenshot embedded as base64 — effectively a
placeholder. There is no catalogue, no checkout, no operational system. Stock is tracked
outside any software.

We are building two things against one database:

1. **A premium public storefront** — branded, fast, shoppable.
2. **An ops PWA (the ERP)** — where staff intake items, photograph them, price them,
   publish them, take orders, and read their own KPIs.

### The insight that shapes everything

For a refurbisher of auction goods, **a product and an inventory unit are the same thing.**
Each unit is a one-of-one: its own photos, its own condition, its own cost basis, its own
price. There is no "SKU with 47 in stock."

This removes the hard parts of ecommerce platforms — variants, stock levels, oversell
allocation, promotions engines — and leaves the part no platform does well: the
**intake → refurb → list → sell → hand over** lifecycle with per-unit margin tracking.

So the architecture inverts the usual one: **the ERP is the product, and the website is a
read-projection of it.** A single `items.status` column drives both the warehouse board and
public visibility. One database, one truth, no sync layer.

### Decisions locked with Carlo

| Decision | Choice |
|---|---|
| Catalogue owner | Supabase Postgres, sole source of truth |
| Payments | Tiered: card + instant EFT + deposit-to-reserve |
| Fulfilment | Warehouse collection, quoted local delivery, national courier for small items |
| CRM / nurture | In-house on Postgres (no GoHighLevel) |

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | Turborepo + pnpm | Two apps share DB types and domain rules; separate repos guarantee drift |
| Framework | Next.js (App Router), TypeScript | One framework for both apps; server actions keep secrets server-side |
| Styling | Tailwind + shadcn/ui | Carlo owns design; shadcn is unstyled primitives, not a look to fight |
| DB / Auth / Storage / Realtime | Supabase | Postgres + RLS + staff auth + image storage + live board updates in one service |
| Payments | **Paystack** | One integration gives card + Instant EFT (Ozow) + Capitec Pay in ZAR, to R100k |
| Background jobs | Inngest | Durable retries for payment→WhatsApp; cron for the stock-matching engine |
| Email | Resend + React Email | Transactional receipts and nurture sends |
| WhatsApp | Meta Cloud API direct | No BSP markup; we have a developer, so skip the reseller layer |
| Courier | Bob Go | Aggregates Courier Guy, Aramex, RAM, PostNet behind one API — small items only |
| Hosting | Vercel (two projects, one repo) | Independent deploys from separate root dirs — change one app without rebuilding the other |

### Explicitly rejected

- **Shopify** — dual-write against Supabase forever, plus 0.6–2% on top of the gateway
  because Shopify Payments isn't available in SA. Uploading 12 photos of a unique item from
  a warehouse phone is also a poor flow in Shopify admin.
- **Medusa v2** — solves variants/multi-region/promotions, none of which exist here, and
  adds a second backend to operate.
- **Airtable as system of record** — no RLS, API rate limits, per-seat pricing, no
  transactional integrity. Fine as a scratchpad, wrong as truth.
- **GoHighLevel** — the nurture feature is a SQL join between leads and items. Putting
  contacts in GHL means that join crosses a network boundary and syncs both ways forever.

---

## Repository layout

```
takemore/
├─ apps/
│  ├─ web/                 # public storefront      → takemoreequipment.co.za
│  └─ ops/                 # staff PWA (the ERP)    → ops.takemoreequipment.co.za
├─ packages/
│  ├─ db/                  # generated types, typed Supabase clients
│  ├─ core/                # domain logic: status machine, SKU gen, pricing, margin
│  ├─ ui/                  # shared primitives, tokens, brand
│  └─ observability/       # reportError(), Sentry wiring, cron check-ins
├─ supabase/migrations/    # hand-written SQL, applied in filename order
└─ package.json            # npm workspaces
```

> **Amended in build.** Two things here differ from what was planned, both
> deliberately and both recorded rather than silently done:
>
> - **npm workspaces, not pnpm + Turborepo.** At two apps and four source-only
>   packages, Turborepo buys task caching this build does not need. Revisit when
>   CI builds get slow. Reasoning in `supabase/README.md`.
> - **Migrations live in `supabase/migrations/`, not in `packages/db`,** and are
>   applied over the Management API rather than `supabase db push` — the CLI
>   cannot reach `db.<ref>.supabase.co` from an IPv4-only network.
>
> `packages/observability` was added later, when it became clear that every
> failure path in both apps was a `console.error` and several were not even that.

`packages/core` is the load-bearing one. Every status transition, SKU format, and margin
calculation lives there and is imported by both apps — so the website can never disagree
with the ERP about what "sold" means. Its **zero runtime dependencies** are a real
constraint, not an accident: it is bundled into storefront client code *and* executed by
plain `node` in the parity suite. Anything needing a dependency goes elsewhere — which is
why `@takemore/observability` is its own package and why `verifyTurnstile` is a subpath
export (`@takemore/core/turnstile`) rather than part of the barrel.

---

## Data model (core tables)

**`items`** — one row per physical unit. The centre of the system.

- Identity: `id`, `sku` (e.g. `TME-2608-0417`), `slug`
- Classification: `category_id`, `subcategory_id`, `brand`, `model`, `condition_grade`
- Content: `title`, `description`, `specs` (jsonb), `dimensions_mm`, `weight_kg`
- Money: `cost_price` (auction cost, **staff-only**), `list_price`, `sale_price`
- Lifecycle: `status`, `published_at`, `arrived_at`, `sold_at`
- Ops: `location_code` (bin/shelf), `created_by`

**Two independent fields, deliberately:**
- `status` — `intake → refurbishing → ready → listed → reserved → sold → handed_over`
- `published_at` — whether the public site shows it

This is what makes Carlo's requirement work: a paid item becomes `sold` *and stays on the
site* with a SOLD badge until a human unpublishes it. Sold stock is social proof and SEO
surface; it should not vanish on payment.

**Other tables:** `item_media` (ordered photos/video), `categories`, `orders`,
`order_items`, `customers`, `leads`, `lead_interests` (tags of what a lead wanted),
`payments`, `shipments`, `activity_log`.

`cost_price` and margin columns are protected by RLS and never selected by the public app —
the storefront reads a view (`public_items`) that does not expose them.

### The one genuine concurrency risk

Items are qty=1, so two buyers can be in checkout simultaneously. Reservation must happen at
**checkout initiation**, not payment success:

```sql
UPDATE items SET status='reserved', reserved_until=now()+interval '20 minutes'
WHERE id = $1 AND status = 'listed'
RETURNING id;   -- zero rows = someone beat them to it
```

A conditional update inside a transaction. An Inngest cron releases expired holds. This is
the single most important correctness detail in the build.

---

## Payments

Paystack initialises a transaction server-side and the customer picks their channel at
Paystack's hosted checkout. Fulfilment is driven **only by the `charge.success` webhook**,
never by the browser redirect.

Three paths, chosen by item value:

| Value | Method | Cost |
|---|---|---|
| Under ~R10k | Card | 2.9% + R1.50 |
| R10k–R100k | Instant EFT (Ozow) or Capitec Pay | ~1.5%, no chargebacks |
| Any / high value | **Deposit to reserve** — 10–20% online, balance on collection | % of deposit only |

The deposit path is what makes high-ticket work. A R50k oven at full card cost bleeds
~R1,450; many SA cards also carry online limits below R50k, so card *cannot physically
complete* those sales. A R7,500 deposit locks the item, and the balance settles by manual
EFT or on-site card at handover. Manual EFT is supported natively: an
`awaiting_payment_verification` state where a staff member confirms against the bank
statement and releases the item.

Webhook handling must verify the `x-paystack-signature` HMAC, be idempotent on
`reference`, and re-verify amount against the order before marking paid.

---

## Build phases

Carlo's stated sequence is website first, then ERP. One amendment: the site has nothing to
display until items exist. So **Phase 1 ships the schema plus a minimal item-entry form**,
and Phase 2 grows that form into the full ops PWA. The website is never blocked, and the
schema is designed once rather than retrofitted.

### Phase 0 — Foundations
Monorepo, Supabase project, schema + RLS, staff auth, two Vercel projects, CI. Seed
categories from real stock.

### Phase 1 — Website MVP *(next session)*
Brand system, catalogue with faceted filtering, item detail pages built around photography,
search, enquiry form + WhatsApp CTA, SEO/OG/schema.org `Product`, plus a bare-bones
`/admin/items/new` so real stock can go live. **No checkout yet** — enquiry-driven, which is
how the business already sells.

### Phase 2 — Ops PWA (the ERP)
Installable PWA, mobile-first. Fast intake flow: photograph → classify → price → publish.
Client-side image compression before upload (warehouse phones, weak signal). Kanban board
over `status`, realtime-synced. Role-based access — cost prices visible only to owners/
managers.

### Phase 3 — Payments & orders
Paystack integration, the reservation transaction, webhook handler, order records, invoice
PDFs, the manual-EFT verification queue, staff order view with full buyer detail.

### Phase 4 — Notifications
WhatsApp Cloud API + Resend. Payment confirmation (utility template, free inside the 24h
service window), then a personalised handover message built from the buyer's checkout
answers. In-app notification when an item sells.

### Phase 5 — Lead nurture & stock matching
Capture enquiries as `leads` with `lead_interests` tags. A nightly Inngest job matches newly
published items against past interests and queues a personalised WhatsApp/email outreach for
staff approval before sending. Marketing templates cost ~R1.50 each, so approval before
send is deliberate.

### Phase 6 — Labels, barcodes, KPIs
Code128 SKU + a QR that opens the item's ops page — scan a machine in the warehouse, land on
its record. Label PDFs for a Brother QL-820NWB or Zebra ZD421. KPI dashboard from Postgres
views: revenue, gross margin per unit and category, days-to-sale (rotation), shelf-space
efficiency, sell-through rate.

> **The KPI half is built**, ahead of the labels. `money_by_month`,
> `money_by_category` and `money_position`
> (`supabase/migrations/20260809090500_money_kpis.sql`) back the Money page:
> revenue and margin by month, margin and sell-through by category, days-to-sale,
> and capital sitting in stock over ninety days old. All three are
> `security_invoker` views guarded on `app.can_see_costs()` — without that a
> staff account would see aggregates summing to zero and read them as real.
>
> Still outstanding here: labels, barcodes and the QR. **Shelf-space efficiency
> is not built and its spec above is stale** — `dimensions_mm` became centimetres
> in `20260808090300_dimensions_typed_as_centimetres.sql`.

Bob Go courier integration slots into Phase 3 or 6 depending on how soon small items ship.

---

## Security baseline

- RLS enabled on **every** public-schema table; policies use `auth.uid()`, never
  client-supplied IDs. Indexes on every column referenced in a policy.
- `service_role` key exists only in server environments — never in a client bundle, never in
  a `NEXT_PUBLIC_` var. This is the single most common way Supabase apps get breached.
- Storefront reads the `public_items` view only; cost and margin are unreachable from the
  public app by construction, not by convention.
- Paystack webhook: signature verification + idempotency + server-side amount re-check.
- Staff roles: `owner` / `manager` / `staff`, enforced in RLS rather than in the UI.
- Policies tested through the client SDK — the Supabase SQL editor bypasses RLS and will
  give false confidence.

---

## Verification

- **Schema/RLS:** query every table as an anonymous client and assert `cost_price` and
  `leads` are unreachable; assert a `staff` role cannot read cost prices. Run via the
  Supabase MCP tools against the project.
- **Reservation race:** fire two concurrent checkout initiations at one item; exactly one
  must succeed and the other must receive a clean "no longer available."
- **Payments:** Paystack test keys end-to-end for card, Instant EFT, and deposit. Replay the
  same webhook three times and assert exactly one order transition. Send a webhook with a
  bad signature and assert rejection.
- **Publish loop:** create an item in ops → confirm it appears on the site within one
  revalidation cycle → mark sold → confirm the SOLD badge shows and the item *stays* visible
  → unpublish → confirm it disappears.
- **Field test:** a staff member intakes five real items on their own phone over warehouse
  wifi, timed. If intake takes longer than ~90 seconds per item, the flow needs rework —
  adoption dies on friction here.
- **Lighthouse** on the storefront: performance and accessibility ≥ 90 on mobile.

---

## Open items for later sessions

- Brand direction, references, component style — Carlo supplies.
- Accounts/keys needed before Phase 3: Paystack (KYC approval required before EFT and
  Capitec Pay appear at checkout), Meta Business + WhatsApp sender, Resend domain, Bob Go.
- Domain/DNS cutover from Hostinger to Vercel.
- Whether buyers get accounts, or checkout stays guest-only. Guest-only is assumed for now.
- **A second Supabase project for tests.** The live suites currently write to
  production and clean up after themselves, which is why they run only on pushes
  to `main` and on demand rather than on a schedule.
- **Next 16.** The only outstanding `npm audit` findings (`postcss`, `sharp`) are
  transitive through Next 15 and not resolvable within it.
- **Real-world facts and service keys** — the whole of
  [`launch-checklist.md`](launch-checklist.md), which is what stands between this
  and a public domain.

---

## Sources

Research behind the key decisions:

- [Paystack — Pay with Bank South Africa (EFT & Capitec Pay)](https://support.paystack.com/en/articles/2132482)
- [Paystack — Transactions pricing](https://support.paystack.com/en/articles/2130306)
- [Best Payment Gateway in South Africa (2026): PayFast vs Yoco vs Peach](https://benimble.co.za/pages/blog/2026/best-payment-gateway-south-africa-2026.html)
- [Cheapest Payment Gateway South Africa 2026: 6 Providers Compared](https://www.ecommercedevelopment.co.za/cheapest-payment-gateway-south-africa/)
- [WhatsApp Business API Pricing in South Africa (2026)](https://themessengernetwork.co.za/thought-leadership/whatsapp-business-api-pricing-south-africa/)
- [Bob Go — API documentation](https://api-docs.bob.co.za/bobgo)
- [Medusa vs Shopify Plus: headless e-commerce TCO in 2026](https://gmi.software/blog/medusa-vs-shopify-plus-tco)
- [Supabase Security Checklist 2026 — RLS, Auth & API Keys](https://zeriflow.com/blog/supabase-security-checklist-before-launch)
- [Inngest vs Trigger.dev vs BullMQ for Next.js 2026](https://www.buildmvpfast.com/blog/inngest-vs-trigger-dev-vs-bullmq-background-jobs-nextjs-2026)
