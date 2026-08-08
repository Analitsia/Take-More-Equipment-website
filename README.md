# Take More Equipment — Website

Public storefront for Take More Catering Equipment (Pty) Ltd, Cape Town.
Architecture and build phases: [`docs/architecture.md`](docs/architecture.md).

## Status

**Phase 1 MVP.** The page is built and styled, and stock now comes from Supabase.
Remaining placeholders, all of which must go before the domain is pointed here:

- Phone, email and address in `apps/web/src/data/site.ts` are placeholders. Every
  CTA on the site — the WhatsApp link on each item, the number in the footer —
  currently points at an invented number.
- Stats in `About.tsx` (600+ restored, 50% saving) are unverified.
- The privacy notice at `/privacy` is accurate about what the system does, but
  needs the company registration number and the appointed Information Officer's
  name filled in. Every enquiry form links to it, which POPIA s18 requires.

Testimonials are real and stay as they are.

## The CRM and outreach

Enquiries are captured (`/wanted`, the closing band on the homepage, and a form
on every item page), stored as people with wants, and matched against new stock.
See [`supabase/README.md`](supabase/README.md) for the schema and the rules that
sit in it.

Nothing sends until it is configured. The queue at `ops/outreach` works on day
one via one-tap WhatsApp links — the staff member is the sender — and email
turns on when these are set on the **ops** Vercel project:

| Variable | Needed for | Notes |
|---|---|---|
| `RESEND_API_KEY` | any email at all | until this exists, only the WhatsApp suggestions can be sent, and the UI says so |
| `RESEND_MARKETING_FROM` | the sender line | put marketing on its own subdomain (`news.`), so a newsletter complaint cannot damage delivery of anything transactional. Verify SPF, DKIM and DMARC on it before the first send |
| `RESEND_REPLY_TO` | replies | the address a customer's "yes please hold it" reaches |
| `CRON_SECRET` | the nightly sweep | Vercel sets this itself when you add the cron; `apps/ops/vercel.json` already declares it at 04:00 |

`NEXT_PUBLIC_STOREFRONT_URL` is already set and is what puts the right link in
every message and unsubscribe footer.

## Layout

```
apps/web/          Next.js App Router storefront  → Vercel
docs/              architecture + decisions
```

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

Do not run `npm run build` while `npm run dev` is running — both use the same
`.next` directory and the build overwrites the dev server's assets, which breaks
the stylesheet until you delete `.next` and restart.

## Deploying

`main` is the production branch. Every push to `main` deploys to production on
Vercel automatically.

Work on a branch and open a PR — Vercel builds a preview URL for each one:

```bash
git checkout -b feature/real-stock-photos
# ...changes...
git push -u origin feature/real-stock-photos
```

Merge to `main` when the preview looks right.

### Vercel project settings

The Vercel project's **Root Directory must be `apps/web`**. This is a monorepo;
with the root directory left at `.`, the build succeeds but Vercel looks for
`.next/routes-manifest.json` at the repo root and the deploy fails. When
`apps/ops` is added it gets its own Vercel project with root directory
`apps/ops`, so the two apps deploy independently.
