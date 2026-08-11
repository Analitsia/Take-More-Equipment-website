# Runbook

What to do when something needs doing. Written for whoever is holding the phone,
not for whoever wrote the code.

For what the system *is*, see [`architecture.md`](architecture.md). For what still
has to be filled in before the domain is pointed here, see
[`launch-checklist.md`](launch-checklist.md).

---

## Getting a new staff member working

1. **They ask.** They open the ops URL, tap **Request access**, and choose their
   own password. This creates a real account that can sign in and do absolutely
   nothing — every RLS policy in the schema refuses an unapproved profile.
2. **The owner approves.** A badge appears on **Team**. Tap it, pick their role,
   approve. It takes effect on their next request; they do not have to sign out.
3. **They are in.** The waiting screen updates on its own.

**Roles.** `staff` see everything except money. `manager` adds costs, margin and
the ability to send a campaign to the whole list. `owner` adds team management
and deletion. Costs are the real line: a staff account can *write* a cost and
cannot *read* one back, which is deliberate.

**If nobody can request access**, the queue is full — twelve outstanding
requests. Approve or reject some. The cap is in
`supabase/migrations/20260809090200_access_requests.sql`, not in the app.

**If one person cannot request access** but others can, they have tried more than
three times in a day, or too many requests have come from their connection in the
last hour. Both clear on their own. An owner can also create the account directly.

---

## When the nightly match goes quiet

The stock-match job runs at **04:00 SAST** and queues an outreach suggestion for
every customer whose recorded want a newly-listed machine matches. It is declared
in `apps/ops/vercel.json`.

**How you find out it stopped:**

| Signal | Where |
|---|---|
| A red strip on the ops dashboard | Only appears when the last run failed, never finished, or is over 26 hours old |
| `GET /api/health` returns 503 | Wire a free pinger at it — this is the only check that survives the app being down |
| A Sentry cron alert | If Sentry is configured. The only one that fires on the job never starting |

**What to do, in order:**

1. **Look at the ledger.** Ops → the dashboard strip says which of the three it
   is: failed, never finished, or stale. The full history is in the `cron_runs`
   table.
2. **Run it by hand.** Ops → Outreach → *Run match now* (manager and up). If that
   works, the job is fine and the *scheduler* did not fire — check the Vercel
   cron log.
3. **If the manual run fails too**, the failure is in `run_stock_match()` and the
   detail is in Sentry and in `cron_runs.error`. The endpoint deliberately does
   not return it: `/api/match` is reachable by anyone who guesses a secret, and
   raw Postgres errors name tables.
4. **Nothing is lost while it is down.** The matcher is idempotent — the
   `outreach_once` index absorbs repeats — so a sweep that missed three nights
   catches up completely on the next successful run. Customers are not being told
   about new stock automatically in the meantime; the WhatsApp queue in Outreach
   still works by hand.

**Curl it directly:**

```bash
curl -s -H "x-revalidate-secret: $REVALIDATE_SECRET" https://<ops-host>/api/match
# {"queued":3,"at":"2026-08-09T04:00:12.000Z"}
```

---

## Telling one person about one machine

Everything below is per **want**, not per person. Somebody who asked for a fryer
in March and a cold room in June has two wants on their record, and the system
treats them as two separate conversations.

**Where the button is:**

| You are looking at | Where |
|---|---|
| A customer | Ops → Everyone → their page. Each want lists the stock that answers it, with *Email them about it* |
| A machine you are pricing | Ops → Stock → the item → *who wants one of these*, with *Email them about this one* |
| The queue the matcher built | Ops → Outreach. Same email, drafted for you, editable before it goes |

All three send the identical email through the identical code path, so the
deliberate route is never the lenient one. It carries the machine's photographs
inline, a link to each of its clips, and a link to its page on the website.

**One email is about one machine, always.** Two matching machines for two
different wants produce two emails, each quoting the sentence it answers. That
is deliberate: "we also have this other thing" is a catalogue.

**How often somebody can be written to:**

| Rule | Number |
|---|---|
| Messages about the same want | One every 7 days |
| Messages of any kind, per person | 3 in a rolling 7 days |
| Drafts waiting in the queue, per want | 1 |

The newsletter counts against all three, so a customer who got the monthly list
on Monday will not also get a match email on Tuesday. The numbers live in
`match_item_to_leads()` and in `packages/core/src/leads.ts`; changing one without
the other means the queue and the send button disagree.

When somebody is blocked, the app says so and tells you to phone them instead —
which is not marketing and has no cap on it.

---

## When the website looks wrong

**Stock is stale.** The storefront caches for 300 seconds and ops pings
`/api/revalidate` on every change. If a change has not appeared after five
minutes, the webhook is failing — it is fire-and-forget by design and logs a
warning rather than blocking the save. Check `REVALIDATE_SECRET` matches on both
Vercel projects.

**A photo is broken.** Run `npm run check:launch:db`. It HEADs every published
photograph and names any that do not resolve — usually a Storage object deleted
while its row survived.

**A section has vanished** (testimonials, the Journal, the stats row). That is the
launch manifest working: nothing unverified renders. Run `npm run check:launch`
to see what is being withheld and why.

**A production deploy failed with "PRODUCTION BUILD REFUSED".** Also working —
the contact details in `apps/web/src/data/launch.ts` are still the mockup ones.
See the launch checklist.

---

## When a form stops accepting submissions

Both public forms (the storefront enquiry, the ops access request) are behind
Cloudflare Turnstile, and **in production they refuse everything when Turnstile
is not configured**. That is deliberate — a form that silently loses its bot
protection is the failure this system is built to prevent — but it means a deploy
without the keys takes the enquiry form offline.

Check `GET /api/health` → `turnstileConfigured`. If false, set
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` on both Vercel
projects and redeploy.

Local development, preview deployments and CI all pass without the keys.

---

## Sending the newsletter

1. Ops → Outreach → **What came in**. Machines currently listed are shown, with
   everything published since the last send ticked.
2. Write a subject and an intro. Save it as a draft.
3. **Preview & send.** This renders the actual email — the same template that
   sends, not a mock-up — with the sender line, the subject, the recipient count
   and both the HTML and plain-text versions. It warns about machines that have
   sold since you picked them.
4. Send from inside the preview.

**It cannot be undone, and it cannot be sent twice.** The duplicate protection is
a conditional `draft → sending` claim in SQL, so two people tapping at once
results in one send. The preview is the guard against the other failure: sending
the wrong thing once.

**Nobody receives it who has not agreed.** The audience is resolved at send time
from consent timestamps, never stored as a list — so somebody who unsubscribes
between drafting and sending is excluded automatically.

---

## Running the tests

```bash
npm run typecheck        # every workspace
npm run check:launch     # no credentials needed. Runs in CI on every push
npm run check:secrets    # no credential-shaped strings in tracked files

npm test                 # RLS + parity + lead loop + email. Needs .env.local
npm run check:launch:db  # placeholder media and dead photos on live stock

# These need the ops app running (npm run dev --workspace=@takemore/ops)
npm run test:pages
npm run test:match
```

**The live suites write to the production database.** They create throwaway
accounts under `@takemore.test`, publish and delete items, and clean up in a
`finally`. That is why they run on push to `main` and on demand, and not on a
schedule — see `.github/workflows/live.yml`.

---

## Applying a database change

```bash
npm run db:apply -- --dry-run   # what would run
npm run db:apply                # run it
npm run db:types                # regenerate packages/db/src/types.generated.ts
npm run typecheck               # the types just changed under the apps
```

Migrations are hand-written SQL in `supabase/migrations/`, applied in filename
order via the Management API rather than `supabase db push` — see
`supabase/README.md` for why. **Filenames must sort after the last applied one.**

Never edit a migration that has been applied. Write another one.

---

## Rotating a key

| Key | Where | Then |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API Keys | Both Vercel projects, `.env.local`, GitHub secrets |
| `RESEND_API_KEY` | Resend dashboard | Ops Vercel project only |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | Both Vercel projects |
| `REVALIDATE_SECRET` | Any long random string | **Both projects, together** — they must match |
| `ACCESS_REQUEST_IP_PEPPER` | Any long random string | Ops only. Changing it resets the per-IP throttle; nothing else |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Tokens | `.env.local` and GitHub secrets. Not needed at runtime |

If a key has been committed, **rotate it — do not just delete the commit.**
`npm run check:secrets` scans tracked files, and the pre-commit hook runs it
against staged changes.

---

## The three things this system will not let you do

Worth knowing so they read as design rather than as bugs:

1. **Publish an item without a photograph of the actual machine.** A stock image
   will not satisfy the publish gate, and one cannot be attached to something
   already live.
2. **Deploy to production with placeholder contact details.** The build fails,
   with a message naming what is missing.
3. **Ship a stock photo URL anywhere in the storefront source.** CI fails. The
   one exception is `apps/web/src/data/launch.ts`, where they are quarantined
   and never rendered.
