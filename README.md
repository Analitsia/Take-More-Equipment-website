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

Testimonials are real and stay as they are.

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
