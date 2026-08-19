-- Everybody signed in sees what a machine cost.
--
-- The original rule was that `staff` types the auction price in at intake and
-- can never read it back — item_costs exists as its own table for exactly that
-- reason, because RLS is row-level and cannot hide a column from one signed-in
-- user while showing it to another (see the header of 20260807090300_items.sql).
--
-- That rule was built for a business with employees. This one is a family
-- business where everyone does everything, and the person standing at the
-- counter negotiating a price is the person who most needs to know the floor.
-- A salesperson who cannot see cost cannot give a discount safely; they can
-- only guess, and the guess is the expensive part.
--
-- So the restriction is lifted, and NOTHING ELSE MOVES. Costs stay in their own
-- table, every view keeps its guard, and the ops app keeps skipping the fetch
-- for anyone the guard would refuse. That is what makes this reversible: the
-- day a non-family employee is hired, this function goes back to
-- `app.at_least('manager')` and every policy and view follows, because none of
-- them ever tested the rank themselves.
--
-- What is now load-bearing instead: /team. Approval into the ops app is the
-- only thing between somebody and the margins.
--
-- Superseded here: 20260807090100_staff_and_helpers.sql:82-90.

create or replace function app.can_see_costs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff()
$$;

comment on function app.can_see_costs() is
  'Any approved staff account. Was manager and above until 20260819090100 — a '
  'family business where everyone negotiates. Tighten HERE to re-restrict; the '
  'four item_costs policies, item_economics, the three money_* views and '
  'item_analytics all call this rather than testing the rank themselves.';
