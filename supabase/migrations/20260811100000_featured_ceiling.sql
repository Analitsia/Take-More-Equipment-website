-- At most eight machines can be highlighted on the homepage at once.
--
-- The number lives in packages/core/src/featured.ts and is repeated here,
-- because a trigger cannot import TypeScript. It is the same arrangement the
-- status table and the publish gate already use: the rule is enforced where it
-- cannot be avoided, and mirrored where the UI needs to draw it.
--
-- ══ What counts ═══════════════════════════════════════════════════════════
--
-- Every featured, undeleted item — published or not. Counting only live ones
-- would let nine drafts sit flagged and turn publishing the ninth into a
-- failure at the worst possible moment, or worse, silently into a ninth card.
-- `featured` therefore means "one of the eight highlight slots", a thing a
-- worker can hold while a machine is still being photographed, and the count in
-- ops reads the same way.
--
-- ══ What this does not promise ════════════════════════════════════════════
--
-- Two people featuring a ninth machine in the same instant can both pass this
-- check — it counts rows, and counting is not atomic against a concurrent
-- insert without a table lock that costs more than the problem it solves. The
-- storefront draws at most eight regardless (see MAX_FEATURED), so the losing
-- case is a flag nobody sees rather than a broken homepage. Said out loud here
-- so nobody later reads this trigger as a guarantee it is not.

create or replace function app.enforce_featured_ceiling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken integer;
begin
  -- Only when a machine is actually taking a slot it did not already hold.
  -- Editing the title of an item that is already featured must not be a
  -- ninth-slot request, and neither must deleting one.
  if not (new.featured and new.deleted_at is null) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.featured and old.deleted_at is null then
    return new;
  end if;

  select count(*) into taken
  from public.items
  where featured
    and deleted_at is null
    and id <> new.id;

  if taken >= 8 then
    raise exception
      'The homepage shows eight highlights at most, and eight are already chosen. Un-feature another machine first.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Fires before the publish gate and the status machine, though it depends on
-- neither — see the ordering note in 20260807090400_item_media.sql, which this
-- name slots into alphabetically:
--   items_before_write < items_enforce_featured_ceiling
--     < items_enforce_publish_requirements < items_enforce_status_transition
create trigger items_enforce_featured_ceiling
  before insert or update on public.items
  for each row execute function app.enforce_featured_ceiling();


-- Any excess that predates this rule loses its flag, newest first, so the
-- database starts out agreeing with the constraint it now carries. A no-op on
-- a database that was already within the limit.
with ranked as (
  select id, row_number() over (order by published_at desc nulls last, created_at desc) as rank
  from public.items
  where featured and deleted_at is null
)
update public.items i
   set featured = false
  from ranked r
 where i.id = r.id
   and r.rank > 8;
