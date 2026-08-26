-- Only `listed` is live — now true in the database, not only in the app.
--
-- docs/architecture.md has said since August 2026 that a machine is on the
-- website only while it is For sale. The ops app honours that: setStage()
-- clears published_at on the way to Reserved or Sold, and confirm_order_paid()
-- clears it on a sale. But the status trigger itself only cleared it on the way
-- back to the workshop (20260820100000), so a status written any other way — a
-- SQL update, a script, a future screen — left a sold machine on the site with
-- its NEGOTIATED price showing: sale_price_cents is a column of public_items,
-- and once a machine is sold that column is what the customer actually paid.
--
-- The rule is now one line in one place: leaving `listed` takes the machine
-- off the site. Coming back to `listed` does not put it back on — publishing
-- is its own deliberate write through the publish gate, exactly as before.

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

  -- Off the site the moment it stops being For sale, whichever way it left.
  -- The ops app says so out loud through setStage(); this is what makes it
  -- true for a SQL update, a script, or a screen that has not been written.
  if new.status <> 'listed' then
    new.published_at := null;
  end if;

  return new;
end;
$$;

-- Anything already in that state is corrected once, here, so the rule and the
-- data agree from the moment this applies.
update public.items
set published_at = null
where status <> 'listed'
  and published_at is not null;


-- ---------------------------------------------------------------------------
-- The publish gate refuses the other direction too: a machine that is not For
-- sale cannot be put on the site. Restated in full from 20260820100000; only
-- the block after the workshop check is new.
-- ---------------------------------------------------------------------------
create or replace function app.enforce_publish_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count integer;
  publishing  boolean;
begin
  publishing := new.published_at is not null
                and (tg_op = 'INSERT' or old.published_at is null);

  if not publishing then
    return new;
  end if;

  if coalesce(length(btrim(new.title)), 0) < 3 or new.title = 'Untitled item' then
    raise exception 'An item needs a title before it can be published'
      using errcode = 'check_violation';
  end if;

  if new.category_id is null then
    raise exception 'An item needs a category before it can be published'
      using errcode = 'check_violation';
  end if;

  if new.condition_grade is null then
    raise exception 'An item needs a condition grade before it can be published'
      using errcode = 'check_violation';
  end if;

  if coalesce(new.list_price_cents, 0) <= 0 then
    raise exception 'An item needs an asking price before it can be published'
      using errcode = 'check_violation';
  end if;

  if coalesce(length(btrim(new.description)), 0) < 40 then
    raise exception 'An item needs a description of at least 40 characters before it can be published'
      using errcode = 'check_violation';
  end if;

  select count(*) into photo_count
  from public.item_media
  where item_id = new.id
    and kind = 'photo'
    and storage_path is not null
    and not is_placeholder;

  if photo_count = 0 then
    raise exception 'An item needs at least one photo of the actual machine before it can be published'
      using errcode = 'check_violation';
  end if;

  -- THE NEW RULE, and it is last on purpose rather than first.
  --
  -- Cheapest check first would be the usual instinct — it is one comparison
  -- against a column already in hand. But this list is also the order a worker
  -- meets the problems in, and every check above it is something they can fix
  -- where they are standing. This one is not a missing field; it is the whole
  -- machine being in the wrong place. It reads better as the last word than as
  -- the thing that hides a missing photograph.
  --
  -- In the ops app it is nearly unreachable, which is the point: the stage
  -- button moves the machine to `listed` and publishes as its own second write,
  -- so by the time this runs the stage is already right. What this catches is
  -- the other doors — SQL by hand, a seed script, a future action that forgets.
  if new.status = 'refurbishing' then
    raise exception 'This machine is in the workshop. Move it to For sale once the repair is priced — until then the asking price is a guess.'
      using errcode = 'check_violation';
  end if;

  -- And the other side of the same rule (20260826140000): a machine that is
  -- reserved or sold is not for sale, so it cannot go on the site either.
  -- Without this, a sold machine could be republished with the price the
  -- customer actually paid showing in public_items.sale_price_cents.
  if new.status <> 'listed' then
    raise exception 'Only a machine that is For sale can go on the website.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
