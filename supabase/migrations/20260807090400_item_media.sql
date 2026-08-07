-- Photos and video, and the gate that stops a half-built item reaching the site.

create table public.item_media (
  id      uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  kind    public.media_kind not null default 'photo',

  -- Exactly one of these is set. Real media lives in Storage and has a path;
  -- a stand-in (the Unsplash shots the mock catalogue used) has a URL and is
  -- flagged. The CHECK below means a placeholder cannot be smuggled in as real
  -- photography, so CI can assert production holds none.
  storage_path   text,
  external_url   text,
  is_placeholder boolean not null default false,

  position         integer not null default 0,
  alt_text         text,
  width            integer check (width  > 0),
  height           integer check (height > 0),
  duration_seconds numeric(6,2) check (duration_seconds > 0),
  created_at       timestamptz not null default now(),

  constraint item_media_source_check check (
       (storage_path is not null and external_url is null and not is_placeholder)
    or (external_url is not null and storage_path is null and is_placeholder)
  )
);

comment on column public.item_media.position is
  'Display order. The lowest-positioned photo is the card image; there is no '
  'separate is_primary flag to fall out of sync with it.';

revoke all on public.item_media from anon, authenticated;
alter table public.item_media enable row level security;

-- Drives both the gallery query and the RLS policy below.
create index item_media_item_position_idx on public.item_media (item_id, position, id);


-- ---------------------------------------------------------------------------
-- The publish gate
-- ---------------------------------------------------------------------------
-- Mirrored by publishChecklist() in packages/core/src/publish.ts, which draws
-- the checklist in the ops app so a worker sees what is missing before tapping
-- rather than after.
--
-- Note this makes "insert an already-published item" impossible when there are
-- no photos yet — correct, and it means even the seed script follows the real
-- path: create the draft, attach media, then publish.
-- SECURITY DEFINER so the photo count sees every row regardless of the caller's
-- visibility — the gate must be the same gate for everyone.
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

  -- The house style runs to roughly four hundred characters. Forty is not that
  -- standard; it is the floor below which the detail page has an empty column.
  if coalesce(length(btrim(new.description)), 0) < 40 then
    raise exception 'An item needs a description of at least 40 characters before it can be published'
      using errcode = 'check_violation';
  end if;

  select count(*) into photo_count
  from public.item_media
  where item_id = new.id and kind = 'photo';

  if photo_count = 0 then
    raise exception 'An item needs at least one photo before it can be published'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Postgres fires BEFORE triggers in alphabetical order by trigger name, so this
-- runs after `items_before_write` and sees the final title and slug. That
-- ordering is implicit and worth knowing before anyone renames a trigger:
--   items_before_write  <  items_enforce_publish_requirements  <  items_enforce_status_transition
create trigger items_enforce_publish_requirements
  before insert or update on public.items
  for each row execute function app.enforce_publish_requirements();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy "public reads media of published items"
  on public.item_media for select
  to anon
  using (exists (
    select 1 from public.items i
    where i.id = item_id
      and i.published_at is not null
      and i.deleted_at is null
  ));

create policy "staff read all media"
  on public.item_media for select
  to authenticated
  using ((select app.is_staff()));

create policy "staff manage media"
  on public.item_media for all
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

grant select on public.item_media to anon;
grant select, insert, update, delete on public.item_media to authenticated;
