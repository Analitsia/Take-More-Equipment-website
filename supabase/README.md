# Database

The single source of truth for Take More. The storefront is a read-projection of
what is in here; the ops app is how it gets written.

Full reasoning lives in `docs/architecture.md` and in the build plan. This file
is the operational bit: how to get a project running and what to watch out for.

> **Status: live.** Applied to `takemore-prod` (`btiyizeyjedleeaddxuh`,
> eu-central-1) and verified end to end:
>
> | Suite | |
> |---|---|
> | `npm run test:rls` | 27 assertions — role boundaries, cost isolation, domain rules |
> | `npm run test:parity` | 11 assertions — TypeScript domain rules vs SQL |
> | `node --env-file=.env.local scripts/test-publish-loop.mjs` | 10 assertions — ops → storefront, against the live deployments |
>
> Storefront: https://take-more-equipment-website.vercel.app
> Ops: https://takemore-ops.vercel.app

## Setting up

### 1. Create the project

Supabase dashboard → organisation switcher → **Analitsia** → New project.

- Name `takemore-prod`
- Region **`af-south-1` (Cape Town)** if it appears in the list — staff and
  buyers are both in Cape Town, and it takes an ocean out of every query.
  Otherwise `eu-west-1` (Ireland).
- Generate a strong database password and save it to a password manager
  immediately. It is shown once.

Develop on Free; **Pro ($25/mo) is required before go-live.** Free pauses a
project after a week of inactivity, which for a storefront means the catalogue
disappears — and 500 MB database / 1 GB storage / 5 GB egress will not survive
real intake photography.

### 2. Keys

Settings → API Keys. Create a **publishable** key (`sb_publishable_…`) and a
**secret** key (`sb_secret_…`) — the new format, not the legacy anon /
service_role pair, which is deleted at the end of 2026.

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SECRET_KEY=sb_secret_…      # server only, never NEXT_PUBLIC_
```

### 3. Auth

Authentication → Sign In / Providers → Email: enabled, **"Allow new users to
sign up" OFF**. Accounts are created by the owner from inside the ops app; a
leaked ops URL should get you a login form and nothing else.

URL Configuration → Site URL `https://ops.takemoreequipment.co.za`, plus
redirect URLs for `http://localhost:3001/**` and the Vercel preview pattern.

### 4. Push the schema

```bash
npm run db:apply       # applies supabase/migrations in order
npm run db:types       # regenerates packages/db/src/types.generated.ts
npm test               # RLS + parity, against the live project
```

**Why `db:apply` and not `supabase db push`.** `db push` connects directly to
`db.<ref>.supabase.co`, which publishes an **AAAA record only**. On an IPv4-only
network that connection cannot be made, and the CLI's own remedy — `supabase
link`, which sets up an IPv4 pooler route — currently dies on a response-parsing
bug in CLI 2.112.0 (it chokes on the `inserted_at` timestamp format when listing
*legacy* API keys, which this project does not have).

`scripts/apply-migrations.mjs` sends the same DDL over the Management API, which
is HTTPS and needs no database password, and records each file in
`supabase_migrations.schema_migrations` so the CLI's own view stays accurate.
When the network gets IPv6 or the CLI is fixed, `db:push` is the better tool and
the script can go.

### 5. The first owner

Nothing in `staff_profiles` can be created through the policies, because they
require an owner and there isn't one yet. Bootstrap exactly once, from the SQL
editor (which bypasses RLS):

```sql
-- after creating the user in Authentication → Users → Add user
insert into public.staff_profiles (user_id, full_name, role)
values ('<the new user uuid>', 'Carlo', 'owner');
```

Every account after this one is created from inside the ops app.

### 6. Storage

The `item-media` bucket is created by migration `…090800`. Nothing to do by
hand — but note it is a **public** bucket, which means an unpublished item's
photos are fetchable by anyone who knows the object UUID. That is a decision
(they are photos of a fryer), not an oversight; the alternative, signed URLs,
expires and would break ISR.

## Local development

Requires Docker, which is not installed on the current machine.

```bash
npx supabase start     # local Postgres + Studio in Docker
npm run db:reset       # re-apply every migration from scratch
```

## Migrations

Hand-written SQL, applied in filename order, one transaction per file.

Supabase's newer [declarative schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
are deliberately **not** used here: `db diff` does not capture RLS policies,
view security settings or column privileges, which is most of what is
interesting in this schema. Versioned migrations stay authoritative.

| File | What it does |
|---|---|
| `…090000_extensions_and_enums` | `unaccent`, the `app` helper schema, every enum |
| `…090100_staff_and_helpers` | `staff_profiles` + the role helpers every policy calls |
| `…090200_reference_data` | categories, tags, the status-transition table, slug/SKU generators |
| `…090300_items` | the central table, identity triggers, the status machine, policies |
| `…090400_item_media` | photos/video and the publish gate |
| `…090500_item_costs` | the cost ledger, `record_item_cost()`, `item_economics` |
| `…090600_activity_log` | who changed what, written by trigger |
| `…090700_public_views` | `public_items`, `public_item_media`, `public_categories` |
| `…090800_storage` | the `item-media` bucket and its policies |
| `…090900_seed_reference_data` | the six categories and nine tags |
| `…140000_lead_enums_and_helpers` | the lead vocabulary and `app.normalise_za_phone()` |
| `…140100_leads` | `leads`, `lead_interests`, `lead_interest_tags`, `lead_events` + policies |
| `…140200_lead_capture` | `capture_lead()` and `unsubscribe()` — the only doors the public site has |
| `…140300_outreach` | `outreach_campaigns`, `outreach_messages`, `app.lead_is_reachable()` |
| `…140400_matching` | `match_item_to_leads()`, `run_stock_match()`, `leads_wanting_item()` |

(Only the load-bearing files are listed; the numbered fixes between them are
titled for what they fix.)

## The CRM

Two tables carry the design and the split between them is the whole thing:
`leads` is one row per PERSON, `lead_interests` is one row per THING THEY WANT.
Collapsing them is the obvious shortcut and it breaks on the first real
customer, who asks about a fryer in March and a cold room in June — either you
overwrite March or you create a second Sipho.

**Identity is email-or-phone**, enforced by partial unique indexes, so a repeat
enquiry enriches a row rather than minting a second one. `phone_e164` is a
generated column over `app.normalise_za_phone()` — that function has a twin in
`packages/core/src/phone.ts` and `npm run test:parity` fails if they disagree,
because a disagreement would silently split one customer into two rows without
erroring anywhere.

**Matching is a join.** Staff already have to pick a category, subcategory and
tags before an item may be published, and the lead form speaks the same
vocabulary, so `match_item_to_leads()` is SQL rather than a research project.
Free text is the fallback, matched on shared lexemes.

## Things that will bite

- **`alter type … add value` cannot run in the transaction that created the
  type**, and the CLI wraps each file in one. Adding a status or a role means a
  new migration file, not an edit to `…090000`.
- **`create or replace view` resets `security_invoker` to false.** The view
  keeps working; it just stops enforcing RLS. Any edit to `public_items` or
  `item_economics` must restate `with (security_invoker = true)`.
- **RLS denies by returning zero rows, not an error.** Write tests as
  `data.length === 0 && error === null`, always with a positive control in the
  same file, and always through the client SDK — the SQL editor bypasses RLS and
  will tell you comfortable lies.
- **Staff write costs they cannot read.** That means `.insert().select()` on
  `item_costs` returns a 403 from a staff account, because PostgREST defaults to
  `Prefer: return=representation`. Use `record_item_cost()`. Do not "fix" it by
  adding a SELECT policy — that undoes the whole design.
- **BEFORE trigger order on `items` is alphabetical** and load-bearing:
  `items_before_write` → `items_enforce_publish_requirements` →
  `items_enforce_status_transition`. Renaming one reorders them.
- **`anon` has no grant on any lead table, and must not get one.** The storefront
  reaches them through `capture_lead()` and `unsubscribe()`, both `SECURITY
  DEFINER`, both returning something other than the row they touched — an
  anonymous insert that reads its own row back is one `on conflict` away from
  confirming whether a given email address is in the database.
- **`outreach_once` is what makes the matcher idempotent.** It is partial on
  `state <> 'failed'`, not on `('queued','sent')`, and the difference is
  deliberate: a suggestion a human SKIPPED must keep blocking, or the nightly
  sweep re-offers exactly what they just rejected.
- **Changing `app.normalise_za_phone()` does not recompute stored numbers.**
  `leads.phone_e164` is a generated column, computed on write. After any edit,
  force it with `update public.leads set phone = phone`. Migration `…140500` is
  the worked example.
- **`condition_grade` sorts A, B, C — better is EARLIER.** So "at least a Grade
  B" is `item.condition_grade <= 'B'`. It reads backwards and it is right.

### Two things the first run caught

Both are fixed, in migrations `…091000` and `…091100`, and both are the same
class of bug — a grant that was never made because the project was configured
*not* to hand out grants automatically.

1. **`service_role` had no DML on anything.** This project was created with
   "Automatically expose new tables" **off**, which is correct: it is what makes
   the deliberate per-table grants in the earlier migrations meaningful. But it
   also withholds the default grants to `service_role`, so the secret key could
   authenticate and then read nothing. Symptom: `permission denied for table
   staff_profiles` from the admin client.

2. **`anon` could not read `items.deleted_at`,** which all three public views
   reference in their `WHERE`. Under `security_invoker = true` the caller needs
   SELECT on every column a view *touches*, not just the ones it returns — so
   the entire public catalogue returned `permission denied for table items`.
   Granting it leaks nothing: the anon policy already restricts anon to rows
   where it is null.

If you add a table or a view later and it 403s, check the grant before you touch
the policy. With automatic exposure off, nothing is granted until you say so.

## Deviation from `docs/architecture.md`

That document plans pnpm + Turborepo. This build stays on **npm workspaces**
with no Turborepo: at two apps and three source-only packages it buys task
caching we do not need, in exchange for lockfile churn during the build that
matters most. Vercel already auto-skips unchanged projects in a monorepo.
Revisit when CI builds get slow.
