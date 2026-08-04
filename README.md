# Take More Equipment — Website

Public storefront for Take More Catering Equipment (Pty) Ltd, Cape Town.
Architecture and build phases: [`docs/architecture.md`](docs/architecture.md).

## Status

**Phase 1 MVP.** The page is built and styled, but the content is placeholder:

- Testimonials are invented — replace or remove before real traffic.
- Phone, email and address in `apps/web/src/data/site.ts` are placeholders.
- Stock in `apps/web/src/data/equipment.ts` is mock data with fictional brands.
- Stats in `About.tsx` (600+ restored, 50% saving, 6-month warranty) are unverified.

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

<!-- deploy check -->
