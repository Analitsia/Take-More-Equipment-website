-- Make a sale undoable by the person who made it.
--
-- Three things were wrong with reversing a sale, and only the first was obvious.
--
-- 1. UNDOING WAS HARDER THAN DOING. A manager could mark a machine sold but only
--    an owner could put it back; a staff member could mark one handed over but
--    only an owner could undo that. Someone who mis-taps has to go and find their
--    boss, so in practice the record just stays wrong. Every undo below now costs
--    exactly the role its matching action costs.
--
--    This is a deliberate softening of the original reasoning, which was that
--    reversing a sale rewrites revenue and should therefore be the owner's call.
--    It still rewrites revenue — but the activity log records who did it, and a
--    wrong number nobody can correct is worse than a correction anyone can audit.
--
-- 2. THE SALE PRICE SURVIVED THE REVERSAL. The trigger cleared sold_at and left
--    sale_price_cents behind, so item_economics went on computing margin against
--    a sale that did not happen — coalesce(sale_price, list_price) is the whole
--    basis of that view. Fixed in the trigger below, beside the sold_at it
--    already clears, because the two are the same fact.
--
-- 3. Putting it back on the SITE is not done here, and that is on purpose. The
--    publish gate runs in items_enforce_publish_requirements, which fires BEFORE
--    items_enforce_status_transition (Postgres orders BEFORE triggers by name).
--    Setting published_at from this trigger would therefore sail straight past
--    the gate that is supposed to check it, and a half-built item could reach
--    the website by way of an undo button. The ops action re-publishes as its
--    own write instead, where the gate sees it properly.

update public.item_status_transitions
   set min_role = 'manager'
 where from_status = 'sold' and to_status = 'listed';

update public.item_status_transitions
   set min_role = 'staff'
 where from_status = 'handed_over' and to_status = 'sold';


create or replace function app.enforce_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required public.app_role;
  actor    public.app_role;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select min_role into required
  from public.item_status_transitions
  where from_status = old.status
    and to_status   = new.status;

  if required is null then
    raise exception 'Cannot move an item from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- A null actor means there is no staff row behind this statement, which can
  -- only happen in a context that bypassed RLS entirely — the service key, a
  -- migration, the seed script. RLS has already refused every other caller, so
  -- null here means "privileged", not "anonymous".
  actor := app.staff_role();
  if actor is not null and actor < required then
    raise exception 'Moving an item from % to % requires the % role',
      old.status, new.status, required
      using errcode = 'insufficient_privilege';
  end if;

  -- Timestamps and figures that belong to the machine, not to the person
  -- clicking. Leaving a sold state un-sells it completely: the date it went and
  -- the price it went for are one fact, and half-clearing it leaves the money
  -- reporting quietly wrong rather than loudly broken.
  if new.status in ('sold', 'handed_over') then
    new.sold_at := coalesce(new.sold_at, now());
  else
    new.sold_at          := null;
    new.sale_price_cents := null;
  end if;

  if new.status <> 'reserved' then
    new.reserved_until := null;
  end if;

  return new;
end;
$$;
