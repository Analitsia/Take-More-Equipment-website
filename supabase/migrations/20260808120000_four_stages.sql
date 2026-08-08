-- Four stages, and any of them reachable from any other.
--
-- The seven-state lifecycle described a workshop process. What the business
-- actually needs to answer is narrower and blunter: can somebody buy this today,
-- and is it on the website? That is four states, and every one of them is one
-- tap from every other:
--
--   For sale        listed         on the website
--   In the workshop refurbishing   on the website — advertised while we work on it
--   Reserved        reserved       off the website, held for a buyer
--   Sold            sold           off the website
--
-- `intake`, `ready` and `handed_over` are retired. They stay in the enum because
-- Postgres cannot drop an enum value without rebuilding the type and every
-- column that uses it, and because the activity log still refers to them by
-- name. Nothing can reach them any more: they appear in no transition, and the
-- column default below no longer produces one.
--
-- ORDER MATTERS IN THIS FILE. The rows are migrated FIRST, while the old
-- transitions are still in place to authorise those moves — the status trigger
-- reads that table on every write, so emptying it first would make the
-- migration illegal by its own rules.

update public.items set status = 'refurbishing' where status = 'intake';
update public.items set status = 'listed'       where status = 'ready';
update public.items set status = 'sold'         where status = 'handed_over';

-- A machine that has just arrived is a machine in the workshop. There is no
-- separate "arrived but untouched" state any more, because nobody was acting on
-- the difference.
alter table public.items alter column status set default 'refurbishing';


-- ---------------------------------------------------------------------------
-- The machine, as a complete graph
-- ---------------------------------------------------------------------------
-- Every stage reaches every other stage directly, and every move costs `staff`.
-- This is a deliberate reversal of the one-step-at-a-time design: that shape
-- existed to make the board describe a process, and a process nobody follows is
-- just an obstacle. Symmetry is now automatic rather than something a test has
-- to police pair by pair — with a complete graph at a single role, every move is
-- its own inverse's equal by construction.
--
-- The trigger is unchanged and still refuses anything absent from this table,
-- which is what keeps the retired statuses unreachable.
delete from public.item_status_transitions;

insert into public.item_status_transitions (from_status, to_status, min_role, label) values
  ('listed',       'refurbishing', 'staff', 'In the workshop'),
  ('listed',       'reserved',     'staff', 'Reserved'),
  ('listed',       'sold',         'staff', 'Sold'),

  ('refurbishing', 'listed',       'staff', 'For sale'),
  ('refurbishing', 'reserved',     'staff', 'Reserved'),
  ('refurbishing', 'sold',         'staff', 'Sold'),

  ('reserved',     'listed',       'staff', 'For sale'),
  ('reserved',     'refurbishing', 'staff', 'In the workshop'),
  ('reserved',     'sold',         'staff', 'Sold'),

  ('sold',         'listed',       'staff', 'For sale'),
  ('sold',         'refurbishing', 'staff', 'In the workshop'),
  ('sold',         'reserved',     'staff', 'Reserved');
