-- A published item must have a photograph of the actual machine.
--
-- 20260807090400_item_media.sql said, in a comment:
--
--     "The CHECK below means a placeholder cannot be smuggled in as real
--      photography, so CI can assert production holds none."
--
-- The CHECK is real and does what it says: a row is either a Storage path that
-- is not a placeholder, or an external URL that is. What was missing is the
-- other half of that sentence. Nothing asserted anything, because there was no
-- CI — and worse, the publish gate counted `kind = 'photo'` without caring
-- whether the photo was real. So an item could go live on an Unsplash stock
-- shot and every constraint in the schema was satisfied.
--
-- Two changes here, and the second is the one that actually closes it:
--
--   1. The publish gate now counts only real photographs.
--   2. A trigger on item_media refuses to attach a placeholder to an item that
--      is already published — otherwise you could publish with a real photo,
--      delete it, and add a stock one afterwards.
--
-- scripts/check-launch-ready.mjs --db asserts the same two properties from
-- outside, so the claim is now made in three places that cannot disagree: the
-- database refuses it, CI checks the database, and the storefront never renders
-- an unverified image in the first place.


-- ---------------------------------------------------------------------------
-- 1. The publish gate counts real photographs only
-- ---------------------------------------------------------------------------
-- Restated in full from 20260807090400_item_media.sql. Only the photo_count
-- query at the end differs; diff the two files to see it.
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

  -- THE CHANGE. `storage_path is not null` is the whole of it: the CHECK
  -- constraint guarantees a Storage path and a placeholder flag are mutually
  -- exclusive, so requiring a path is exactly requiring a real photograph.
  -- `and not is_placeholder` is redundant against that constraint and is stated
  -- anyway, because a reader should not have to go and look the constraint up
  -- to know this is safe.
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

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. A placeholder may not be attached to something already published
-- ---------------------------------------------------------------------------
-- Without this, the gate above is a one-time check at the moment of publishing
-- and says nothing about the hour afterwards.
--
-- SECURITY DEFINER so the items lookup is not subject to the caller's own
-- visibility. A staff member can see every item anyway, but the rule should not
-- depend on that continuing to be true.
create or replace function app.refuse_placeholder_on_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_placeholder then
    return new;
  end if;

  if exists (
    select 1 from public.items i
    where i.id = new.item_id
      and i.published_at is not null
      and i.deleted_at is null
  ) then
    raise exception 'That is a stand-in image, and this item is already live. Upload a photograph of the actual machine.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger item_media_refuse_placeholder_on_published
  before insert or update on public.item_media
  for each row execute function app.refuse_placeholder_on_published();


-- ---------------------------------------------------------------------------
-- 3. Say plainly what the invariant now is
-- ---------------------------------------------------------------------------
comment on column public.item_media.is_placeholder is
  'A stand-in image, not a photograph of this machine. Cannot coexist with a '
  'storage_path (see item_media_source_check), cannot be attached to a '
  'published item (see item_media_refuse_placeholder_on_published), and cannot '
  'satisfy the publish gate. Asserted from outside by '
  'scripts/check-launch-ready.mjs --db.';
