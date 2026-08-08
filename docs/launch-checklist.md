# Launch checklist

Everything the software cannot work out for itself. Nothing here is a code change
— it is facts about the real world, and keys from services.

Run `npm run check:launch` at any point to see what is still outstanding. It
prints the same list, generated from the code, so this file cannot quietly drift
out of date.

---

## 1. Contact details — **blocking**

**A production build fails while these are the mockup values.** Not a warning: an
error that stops the deploy, with a message naming exactly what is missing. That
is deliberate — the mockup shipped an invented phone number on every CTA, in the
footer, and inside the POPIA privacy notice.

Edit **`apps/web/src/data/launch.ts`**, in the `contact` block. For each one, set
the real value and put today's date in `verified`:

```ts
phone: {
  value: "+27 21 555 0134",        // ← the real number
  verified: null,                  // ← "2026-08-12"
  evidence: "Ring it. It must reach the warehouse.",
  placeholder: "+27 21 555 0134",  // ← leave this alone
},
```

| Field | What it needs to be |
|---|---|
| `phone` | The number a customer should ring. Must parse as a dialable number. |
| `whatsapp` | The WhatsApp number, **digits only** — no `+`, no spaces. `wa.me` will not take anything else. |
| `email` | A real inbox somebody reads. Appears in the footer and as the POPIA contact. |
| `address` | The address a customer drives to. Street and number, not just the suburb. |
| `hours` | The hours somebody is actually there. |
| `legalName` | Exactly as registered at CIPC, `(Pty) Ltd` included. |
| `registrationNumber` | From the CIPC certificate. Must match `YYYY/NNNNNN/NN`. |
| `informationOfficer` | **A named person.** POPIA s18 requires the responsible party be identified; "the manager" is not an answer. Registered with the Information Regulator — by default the head of the business. |
| `domain` | The domain this serves from. No `https://`, no `www.`. |

> **Leave `placeholder` exactly as it is.** It is the frozen mockup value, and
> comparing against it is how "unfilled" is detected. Deleting it would let a
> verification date be set on a value nobody changed.

---

## 2. Marketing claims — withheld until verified

These do not block anything. They simply **do not appear on the site** until
somebody stands behind them, and the layout closes up around them.

In `launch.ts`, the `claims` block:

| Claim | Currently | What to check |
|---|---|---|
| `machinesRebuilt` | 600+ | A number you can defend from workshop records. If you cannot count them, do not publish it. |
| `averageSaving` | 50% | Sample sold units against their new-equivalent quotes and average honestly. |
| `warranty` | 6 months | **A promise you are legally held to.** Must match the warranty you actually issue. |
| `delivery` | 48 hours | Must match `/delivery` and what actually happens. A missed delivery promise is a refund claim. |
| `pricedBelowNewRange` | 40–60% | The range defensible across the catalogue, not the best case. Rendered as prose on `/about`. |
| `newLineCost` | R380 000 | A real, dated quote for a 60-seat line. |

---

## 3. Customer testimonials — withheld, and the legally sensitive one

**All nine quotes currently in the code are invented.** They are real-sounding
names attached to real Cape Town suburbs, saying things no customer said. None of
them render. Publishing them would be a consumer-protection and advertising-
standards problem, not a content nit.

To publish a real one, replace an entry in the `testimonials` array in
`launch.ts` and date it. Publish a quote only when **all three** are true:

- a real customer actually said it,
- you can point at where — a WhatsApp thread, an email, a Google review,
- they are content to be named as shown.

Under three verified quotes the section shows a "Proof, not adjectives" panel
instead, built only from things already true and checkable on the site. That is a
genuine alternative, not a placeholder — you are not obliged to gather nine.

**Delete the invented entries you are not going to replace.** Nothing breaks;
the array can be any length, including empty.

---

## 4. The Journal — withheld

Four posts are written and none publish. The prose is sound and describes how the
business actually works, but the rand figures in it are illustrative and are
presented to somebody deciding how to spend money.

In `launch.ts`, the `posts` array. Date one to publish it.

| Post | What needs checking |
|---|---|
| `what-a-second-hand-combi-oven-should-cost` | Every price band against current quotes. |
| `nine-checks-before-you-buy-used-equipment` | That the nine checks match what your workshop does. |
| `grade-a-b-c-what-the-letters-mean` | **Must agree exactly with `/conditions` and with the grades in ops.** This one is a promise. |
| `fitting-out-a-60-seat-kitchen` | Every figure in the worked example. The post most likely to be quoted back at you. |

With no posts published, the Journal link disappears from the navigation and
`/blog` shows an honest empty state.

---

## 5. Photography — withheld

The hero image and the `/about` workshop shot are Unsplash stock. So is every
post image. None of them render; the hero falls back to a deliberate dark surface
that the existing scrim was already designed for.

**Real photography goes in Supabase Storage**, in the `item-media` bucket under a
`site/` prefix, then its public URL goes into the `media` block in `launch.ts`.
The storage policy already permits that prefix.

- Hero: landscape, at least 2000px wide.
- `/about`: 4:3, the actual wash-up line the caption describes.

You cannot mark a stock URL as verified — the launch gate rejects that
specifically.

---

## 6. Keys and environment variables

### Cloudflare Turnstile — needed, free

Bot protection on the enquiry form and the staff access-request form.

1. Cloudflare dashboard → Turnstile → add a widget for your domain.
2. Set on **both** Vercel projects:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
3. Submit the enquiry form on the deployed site.
4. Set `security.turnstile` to `true` and dated in `launch.ts`.

> **In production, both forms refuse everything until these are set.** That is
> deliberate — an unguarded public form must not be able to ship silently — but
> it means setting these before the first production deploy, not after.
> `GET /api/health` reports `turnstileConfigured` so you can check from outside.

### Sentry — optional, free tier

With no DSN nothing initialises, errors still reach the Vercel logs, and nothing
else changes.

- `NEXT_PUBLIC_SENTRY_DSN` on both projects.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source maps. Without
  the token the build still succeeds, it just uploads no maps.
- Create a cron monitor with the slug **`stock-match`** to be told when the
  nightly job stops running. This is the only alert that fires on the job never
  starting.

Sentry is already named as a sub-processor in the privacy notice, with PII
scrubbing configured.

### Access-request throttle

- `ACCESS_REQUEST_IP_PEPPER` on the ops project. Any long random string:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  It salts the hash of a requester's IP, so the database stores a fingerprint and
  never an address — an IP is personal information under POPIA. Without it the
  per-origin throttle is inactive and says so in the logs.

### Email — only when you want to send

- `RESEND_API_KEY`
- `RESEND_MARKETING_FROM` — put marketing on its own subdomain (`news.`), and
  verify SPF, DKIM and DMARC on it before the first send.
- `RESEND_REPLY_TO`
- `BUSINESS_POSTAL_IDENTITY` — **the postal address in the footer of every
  marketing email.** It defaults to the same placeholder the website carried, so
  it needs the same fix, and it must agree with `contact.legalName` and
  `contact.address` in `launch.ts`.

### The nightly cron

- `CRON_SECRET` — Vercel sets this itself when the cron in `apps/ops/vercel.json`
  is registered. Nothing to do beyond confirming the cron exists.

---

## 7. GitHub

CI (typecheck, launch gate, both builds) needs **no secrets** and runs on every
push and pull request already.

The live suites need these as repository secrets, and skip with a warning
without them:

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ·
`SUPABASE_SECRET_KEY` · `SUPABASE_PROJECT_REF` · `SUPABASE_ACCESS_TOKEN` ·
`REVALIDATE_SECRET`

> **One decision worth making:** those suites write to the **production**
> database. They clean up after themselves, and they only run on pushes to `main`
> and on demand — never on a schedule, never on a pull request. A second Supabase
> project for testing is the right eventual answer, at which point a nightly run
> becomes sensible.

---

## 8. When it is all done

Set `launchState` to `"live"` at the bottom of `launch.ts`.

Every unverified fact stops being a warning and becomes a CI failure, so nothing
can quietly regress after cutover. Run `npm run check:launch` first — it will
tell you exactly what is left before you flip it.

---

## What is deliberately not on this list

Things that look outstanding and are not:

- **The `intake` status.** Retired, unreachable, asserted in the RLS suite.
- **Draft photos being fetchable by anyone with the exact object path.** A
  written-down, re-examined trade-off — making the bucket private would break
  ISR, CDN caching and WhatsApp link previews. Enumeration was the real hole and
  is closed. See `supabase/migrations/20260809090300_media_path_hygiene.sql`.
- **`postcss` and `sharp` audit warnings.** Both are transitive through Next 15
  and only resolvable by upgrading to Next 16, which is its own piece of work.
