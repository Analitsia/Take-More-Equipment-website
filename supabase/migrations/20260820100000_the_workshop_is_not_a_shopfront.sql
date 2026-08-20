-- A machine in the workshop does not go on the website.
--
-- 20260808120000_four_stages.sql put `refurbishing` on the site deliberately —
-- "advertised while we work on it" — and that turned out to be a pricing
-- decision dressed up as a display one. While a unit is on the bench nobody
-- knows what the repair will cost, so the asking price on its card is a guess.
-- A guess published to the internet is one a buyer will hold us to: they arrive
-- with the screenshot, the parts came to more than anyone expected, and the
-- choice left is to sell at a loss or argue with somebody who is quoting our own
-- page back at us.
--
-- So the workshop is where a price is decided, not where it is advertised. Three
-- statements make that true, and they are deliberately three rather than one:
--
--   1. THE GATE REFUSES IT. app.enforce_publish_requirements() now treats the
--      stage as one of the things an item needs before it can go live, next to
--      the photo and the price.
--
--   2. THE STATUS TRIGGER TAKES IT DOWN. Sending a live machine back to the
--      bench unpublishes it in the same statement, the way leaving `sold`
--      already clears sold_at. Without this the gate would only govern the way
--      IN, and a listed machine that went back for more work would stay up.
--
--   3. WHAT IS ALREADY UP COMES DOWN. The backfill at the end, once.
--
-- packages/core/src/status.ts carries the same rule as `live: false` on the
-- workshop stage, which is what makes the ops app's stage buttons do this
-- without anyone being refused — setStage() sees a stage that is not live and
-- takes the machine off the site as part of the move.
--
-- WHAT THIS DOES NOT CHANGE: a machine on the bench can still be sold. Somebody
-- sees it in the yard and wants it, and 20260819110100 went to some trouble to
-- make that path work and remember where the machine came from. Selling it is a
-- conversation with a price in it. Advertising it is not.


-- ---------------------------------------------------------------------------
-- 1. The stage is a publish requirement
-- ---------------------------------------------------------------------------
-- Restated in full from 20260809090000_no_placeholders_on_published.sql. Only
-- the block at the end is new; diff the two files to see it.
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

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. Going back to the bench takes it off the site
-- ---------------------------------------------------------------------------
-- Restated in full from 20260808100000_reversible_sale.sql. Only the
-- published_at block is new.
--
-- Clearing published_at from inside this trigger is safe where SETTING it would
-- not be: app.enforce_publish_requirements() fires first (Postgres orders BEFORE
-- triggers by name) and short-circuits unless published_at is transitioning from
-- null, so a value set here would sail past the gate meant to validate it. There
-- is nothing to validate on the way down.
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

  -- Back to the bench, off the site. The ops app already does this out loud
  -- through setStage(), which says so in the notice; this is what makes it true
  -- for every other way a machine can get there — void_order() putting one back
  -- where it came from, or somebody moving it by hand.
  if new.status = 'refurbishing' then
    new.published_at := null;
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Whatever is up there now, on the bench, comes down
-- ---------------------------------------------------------------------------
-- One statement, once. Everything published while `refurbishing` was a live
-- stage is exactly the stock this rule exists to hide: priced before the repair
-- was costed. The slug and the row are untouched — only the publication — so
-- tapping "For sale" puts each one back at the same URL.
update public.items
   set published_at = null
 where status = 'refurbishing'
   and published_at is not null;


comment on column public.items.published_at is
  'When this went on the public site. Null means it is not on it. The stage decides: only `listed` is live, and a machine on the bench is refused by app.enforce_publish_requirements() — see 20260820100000.';
