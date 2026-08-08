# Take More Equipment

Storefront and operations platform for Take More Catering Equipment (Pty) Ltd,
Cape Town. The ERP is the product; the website is a read-projection of it.

- Architecture and build phases: [`docs/architecture.md`](docs/architecture.md)
- Day-to-day operations: [`docs/runbook.md`](docs/runbook.md)
- What still has to be filled in: [`docs/launch-checklist.md`](docs/launch-checklist.md)
- Schema and the rules that live in it: [`supabase/README.md`](supabase/README.md)

## Status

**Buildable, deployable, and not yet launched.** Every mechanism is in place;
what is missing is real-world facts.

Nothing unverified reaches a visitor. Every public claim the site makes — the
phone number, the statistics, the testimonials, the blog figures, the photography
— lives in [`apps/web/src/data/launch.ts`](apps/web/src/data/launch.ts) with a
record of whether anybody has checked it, and only publishes once somebody has.
Unverified content simply does not render, and the layout closes up around it.

Three things enforce that, none of which is a comment asking somebody to
remember:

| Enforcement | What it stops |
|---|---|
| `npm run check:launch` in CI, on every push | A stock-photo URL anywhere in the storefront source; a fact marked verified that was never changed; a malformed phone number; an undocumented environment variable |
| A throw at module load in `launch.ts` | A **production build** with placeholder contact details. The deploy fails, naming what is missing |
| A database trigger | A published item whose only photograph is a stand-in |

> **On the nine customer testimonials:** every one of them is invented. They are
> in the repository, unverified, and none of them render. An earlier version of
> this README said they were real — it was wrong, and the code comment saying
> otherwise was right. See the launch checklist before publishing any of them.

## Layout

```
apps/web/          Next.js storefront            → Vercel (root dir: apps/web)
apps/ops/          Next.js staff ERP             → Vercel (root dir: apps/ops)
packages/core/     Domain rules. Zero runtime dependencies
packages/db/       Supabase clients + generated types
packages/ui/       Tokens, form primitives, Tailwind preset
packages/observability/  reportError(), Sentry wiring, cron check-ins
supabase/          Hand-written migrations, applied in filename order
scripts/           Operational scripts and the test harnesses
docs/              Architecture, runbook, launch checklist
```

npm workspaces, no Turborepo — see `supabase/README.md` for why.
Node 22.18+ (`.nvmrc` pins 24).

## Local development

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev                    # storefront on :3000
npm run dev --workspace=@takemore/ops   # ops on :3001
```

Do not run `npm run build` while `npm run dev` is running — both use the same
`.next` directory, and the build overwrites the dev server's assets.

## Checks

```bash
npm run typecheck        # every workspace
npm run check:launch     # is the site telling the truth? No credentials needed
npm run check:secrets    # no credential-shaped strings in tracked files
npm test                 # RLS + parity + lead loop + email. Needs .env.local
npm run check:launch:db  # placeholder media and dead photos on live stock
```

`test:pages` and `test:match` need the ops app running, so they are not in
`npm test` — CI starts a server for them.

**The live suites write to the production database.** They create throwaway
accounts under `@takemore.test` and clean up in a `finally`.

## CI

- **`ci.yml`** — every push and pull request. Typecheck, launch gate, secret
  scan, both builds. **No secrets required**: the builds run against a
  deliberately unreachable Supabase URL, which works because every build-time
  read in the storefront tolerates a dead database.
- **`live.yml`** — pushes to `main` and manual dispatch only. The suites that
  need a real project. Never on a pull request, because a fork gets no secrets.

Git hooks (husky): `pre-commit` scans staged files for credentials and runs the
launch gate; `pre-push` runs typecheck and the launch gate. `tsc` is deliberately
not in `pre-commit` — it cannot be scoped to staged files, and a slow hook is a
hook people bypass.

## The CRM and outreach

Enquiries are captured (`/wanted`, the closing band on the homepage, and a form
on every item page), stored as people with wants, and matched against new stock
nightly at 04:00.

Both public forms are behind Cloudflare Turnstile. **In production they refuse
every submission until it is configured** — deliberately, so an unprotected form
cannot ship silently. `GET /api/health` reports `turnstileConfigured`.

Nothing sends by email until Resend is configured; the one-tap WhatsApp queue
works on day one, with the staff member as the sender. Campaign sends go through
a preview of the actual email, and cannot be sent twice — the duplicate guard is
a conditional claim in SQL, not a disabled button.

See the [runbook](docs/runbook.md) for the variables and the sending flow.

## Deploying

`main` is the production branch; every push to it deploys. Work on a branch and
open a PR — Vercel builds a preview for each one, and CI has to pass.

Each app is its own Vercel project, with **Root Directory set to its own
directory** (`apps/web` / `apps/ops`). With the root left at `.` the build
succeeds and the deploy then fails looking for a manifest at the repository root.

A production deploy will refuse to build while the contact details in
`launch.ts` are still placeholders. That is the system working — see
[`docs/launch-checklist.md`](docs/launch-checklist.md).
