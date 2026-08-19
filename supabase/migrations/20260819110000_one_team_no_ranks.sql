-- One team. No ranks.
--
-- Take More is a family business of a handful of people who all do everything:
-- the person who books a machine in is the person who sells it and the person
-- who negotiates the price. Three ranks described a shape this business does
-- not have, and the cost of that was not theoretical — it was a screen that
-- refused somebody who was standing at the counter needing to do the thing.
--
-- This is the same move 20260819090100 made for costs, applied to the rest:
-- ONE FUNCTION BODY, and every policy and RPC follows, because none of them
-- ever tested a rank themselves. What opens, exactly:
--
--   categories, subcategories, tags        create, rename, delete
--   outreach_campaigns                     run a campaign
--   access_requests                        read the queue
--   public.reopen_order()                  correct the amount on a paid sale
--
-- That last one is the only one worth pausing on. Reopening rewrites revenue
-- that has already been reported, which is why it was held back — but the
-- alternative in a business this size is a wrong number that waits for one
-- person to come back from lunch, and every reopen is stamped with an actor in
-- activity_log and explains itself on the customer's timeline. A correction
-- anybody can make and everybody can see beats a correction nobody can make.
--
-- ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────
--
-- app.is_owner() is untouched, and it still guards two things:
--
--   staff_profiles      who may sign in at all — adding people, deactivating
--                       them, and the role column itself
--   the DELETE policies on items, leads, orders and outreach_messages
--
-- Neither is a rank in the sense being removed here. The first is the door to
-- the building, and it is the only thing standing between somebody and every
-- cost and margin in the business now that costs are visible to everyone; the
-- owner is the person who adds people anyway, so nothing about the day's work
-- goes through it. The second is a HARD delete, which no screen in the ops app
-- calls — the app soft-deletes, and any approved account always could.
--
-- ── PUTTING RANKS BACK ────────────────────────────────────────────────────
--
-- Restore the body below to `select coalesce(app.staff_role() >= required,
-- false)` and every gate above returns, in one statement. That is the whole
-- reason the column, the enum and the calls are left standing rather than
-- ripped out: the day a non-family employee is hired, this is a one-line
-- decision instead of a migration.
--
-- Superseded here: 20260807090100_staff_and_helpers.sql:82-90.

create or replace function app.at_least(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- `required` is deliberately still in the signature and deliberately unused.
  -- Dropping the parameter would mean rewriting ten policies and two functions
  -- to call something else, which is exactly the blast radius this shape exists
  -- to avoid.
  select app.is_staff()
$$;

comment on function app.at_least(public.app_role) is
  'Any approved account, whatever rank was asked for. Ranks were removed in '
  '20260819110000 — a family business where everyone does everything. Restore '
  'the >= comparison HERE to bring them back; ten policies and reopen_order() '
  'all call this rather than testing the rank themselves. app.is_owner() is '
  'separate and still guards the team and the hard deletes.';
