-- Every move in the workshop flow gets an inverse, at the same price.
--
-- THE RULE, and the only one worth remembering here: for every transition A -> B
-- there is a transition B -> A, and both cost the same role. Nothing in the
-- lifecycle is a one-way door, so anyone exploring the buttons can always put
-- the machine back exactly where they found it — and anyone who CAN create a
-- given mess can always clear it up without going to find their boss.
--
-- That last part is what actually removes the bottleneck. Asymmetric roles were
-- the real trap: a staff member could send a machine to the workshop but needed
-- a manager to bring it back, so in practice the record just stayed wrong.
--
-- What is NOT being done: letting any status jump straight to any other. The
-- one-step-at-a-time shape is what makes the board mean something — it is how
-- you can see that four machines are stuck in the workshop. With every edge now
-- bidirectional, the furthest any state is from any other is three clicks, all
-- of them visible on screen, so the shape costs nothing in navigability.
--
-- The two gaps that were left after making the sale reversible:
insert into public.item_status_transitions (from_status, to_status, min_role, label) values
  -- Skipped the workshop by mistake. Previously you had to route through
  -- refurbishing to undo a decision that was made in one tap.
  ('ready', 'intake',   'staff',   'Back to intake'),
  -- The mirror of reserved -> sold. Without it, confirming a sale too early
  -- could only be undone by dropping all the way back to listed, which threw
  -- away the reservation and the buyer it was being held for.
  ('sold',  'reserved', 'manager', 'Back to reserved')
on conflict (from_status, to_status) do nothing;

-- And the two that cost more to undo than to do.
update public.item_status_transitions
   set min_role = 'staff'
 where (from_status, to_status) in (
   -- Mirrors intake -> refurbishing, which is staff.
   ('refurbishing', 'intake'),
   -- Mirrors ready -> listed, which is staff. Taking a machine off sale is the
   -- move most likely to be needed in a hurry, and it was the one that needed
   -- the most seniority.
   ('listed', 'ready')
 );
