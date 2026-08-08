-- Did the nightly sweep run, and what did it do?
--
-- apps/ops/vercel.json registers /api/match at 04:00 daily. On failure the route
-- wrote one console.error and returned a 500 — to a caller that is Vercel's
-- scheduler, which does not read 500s to anybody. The job could have failed
-- every night for a month and the first symptom would have been a customer
-- asking why nobody told them the machine they wanted came in.
--
-- ── Why this table AND Sentry check-ins, rather than one of them ──────────
--
-- They answer different questions and neither is sufficient:
--
--   This table answers "what did the sweep DO?" — a business fact, queryable
--   next to the data it produced, visible in ops where Carlo already looks.
--   But it structurally CANNOT see a job that never fired: a job that does not
--   run writes no row, and no row looks exactly like an empty table.
--
--   Sentry Cron Monitors answer "did it run AT ALL?" — the only mechanism here
--   that alerts on absence rather than on failure. Two lines, given Sentry is
--   already wired for errors.
--
-- /api/health reads this table and is the third leg: an external pinger against
-- it catches the case neither can see, which is the ops app being down.

create table public.cron_runs (
  id  bigint generated always as identity primary key,

  -- 'stock_match' today. A text column rather than an enum because adding a job
  -- should not need a migration.
  job text not null,

  started_at  timestamptz not null default now(),
  finished_at timestamptz,

  -- Null while running. The three states are distinguishable on purpose:
  -- null = in flight or died mid-run, true = finished, false = failed.
  ok      boolean,
  result  jsonb,
  error   text
);

comment on table public.cron_runs is
  'One row per scheduled-job run. Written by the service key only; there is no '
  'insert policy for anyone. A row with a null finished_at is either in flight '
  'or was killed mid-run — /api/health treats both as stale.';

-- The only query anything runs against this: newest run of one job.
create index cron_runs_job_recent_idx on public.cron_runs (job, started_at desc);

revoke all on public.cron_runs from anon, authenticated;
alter table public.cron_runs enable row level security;

create policy "staff read cron runs"
  on public.cron_runs for select
  to authenticated
  using ((select app.is_staff()));

-- No insert, update or delete policy for anyone, deliberately. Rows arrive only
-- from the service key, which bypasses RLS — the same stance activity_log takes,
-- and for the same reason: a log that the application can rewrite is not a log.
grant select on public.cron_runs to authenticated;
