-- items — one row per physical unit. The centre of the system.
--
-- Note what is NOT here: cost. Every cent the business spends on a machine
-- lives in item_costs, because Postgres RLS is row-level and cannot hide a
-- column from one signed-in user while showing it to another. Moving cost to
-- its own table turns an impossible column problem into a trivial row one, and
-- makes the public projection safe by construction rather than by convention.

create table public.items (
  id    uuid primary key default gen_random_uuid(),
  sku   text not null unique,
  slug  text not null unique,

  -- Nullable on purpose. The intake form autosaves a draft on first blur so a
  -- dropped connection never loses work, which means a half-filled row must be
  -- legal. Completeness is enforced at publish, not at insert — see the publish
  -- gate in the item_media migration.
  title            text not null default 'Untitled item',
  brand            text,
  model            text,
  category_id      uuid references public.categories (id) on delete restrict,
  condition_grade  public.condition_grade,
  description      text,
  -- What the workshop actually replaced. The proof behind the grade, and it
  -- renders on the public page.
  workshop_notes   text[] not null default '{}',

  -- Promoted out of `specs` because every card renders them.
  capacity text,
  power    text,
  specs    jsonb not null default '{}'::jsonb,

  width_mm  integer check (width_mm  > 0),
  depth_mm  integer check (depth_mm  > 0),
  height_mm integer check (height_mm > 0),
  weight_kg numeric(7,2) check (weight_kg > 0),

  -- Money is integer cents everywhere. `retail_price_cents` is the comparable
  -- new price that powers the "Save 56%" anchor, not something we charge.
  list_price_cents   bigint check (list_price_cents   >= 0),
  retail_price_cents bigint check (retail_price_cents >= 0),
  sale_price_cents   bigint check (sale_price_cents   >= 0),

  -- `status` and `published_at` are INDEPENDENT, deliberately. This is what
  -- lets a sold machine stay on the site with a SOLD badge until a human takes
  -- it down: sold stock is social proof and SEO surface, and should not vanish
  -- the moment it is paid for.
  status         public.item_status not null default 'intake',
  published_at   timestamptz,
  featured       boolean not null default false,

  arrived_at     date not null default current_date,
  sold_at        timestamptz,
  reserved_until timestamptz,
  location_code  text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: an item that was live has been indexed and linked to.
  deleted_at timestamptz
);

comment on column public.items.published_at is
  'Public visibility. Independent of status — a sold item stays visible until a '
  'human unpublishes it.';

revoke all on public.items from anon, authenticated;
alter table public.items enable row level security;

-- The public list: published, not deleted, newest first.
create index items_published_idx on public.items (published_at desc)
  where published_at is not null and deleted_at is null;

-- The board and the dashboard counts.
create index items_status_idx on public.items (status) where deleted_at is null;

create index items_category_idx on public.items (category_id) where deleted_at is null;

create index items_featured_idx on public.items (featured)
  where featured and published_at is not null and deleted_at is null;

-- Released by the reservation-expiry job in a later phase.
create index items_reserved_until_idx on public.items (reserved_until)
  where reserved_until is not null;


-- ---------------------------------------------------------------------------
-- item_tags
-- ---------------------------------------------------------------------------
create table public.item_tags (
  item_id uuid not null references public.items (id) on delete cascade,
  tag_id  uuid not null references public.tags  (id) on delete cascade,
  primary key (item_id, tag_id)
);

revoke all on public.item_tags from anon, authenticated;
alter table public.item_tags enable row level security;

-- The PK covers item_id; the reverse direction drives "all fryers tagged Gas".
create index item_tags_tag_idx on public.item_tags (tag_id);


-- ---------------------------------------------------------------------------
-- Identity: SKU, slug, authorship
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because this reaches app.next_sku() (which draws from a
-- sequence in the app schema) and app.unique_slug() (which must see every
-- existing slug, published or not, to guarantee uniqueness). Running as the
-- owner avoids granting `authenticated` direct rights over either.
create or replace function app.items_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.sku  := coalesce(nullif(btrim(new.sku), ''), app.next_sku());
    new.slug := app.unique_slug(coalesce(nullif(btrim(new.slug), ''), new.title), null);
    new.created_by := coalesce(new.created_by, (select auth.uid()));

  else
    -- A published slug is frozen. The URL has been indexed, linked in WhatsApp
    -- threads and possibly printed on a label; renaming the machine must not
    -- move it. While the item is still a draft the slug tracks the title.
    if old.published_at is not null then
      new.slug := old.slug;
    elsif new.title is distinct from old.title
       or new.slug  is distinct from old.slug then
      new.slug := app.unique_slug(
        coalesce(nullif(btrim(new.slug), ''), new.title), new.id);
    end if;

    -- Identity and authorship are write-once.
    new.sku        := old.sku;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger items_before_write
  before insert or update on public.items
  for each row execute function app.items_before_write();


-- ---------------------------------------------------------------------------
-- The status machine
-- ---------------------------------------------------------------------------
-- The UI greys out impossible moves using the mirrored table in
-- packages/core/src/status.ts. This is what makes them impossible.
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

  -- Timestamps that belong to the machine, not to the person clicking.
  if new.status in ('sold', 'handed_over') then
    new.sold_at := coalesce(new.sold_at, now());
  else
    new.sold_at := null;
  end if;

  if new.status <> 'reserved' then
    new.reserved_until := null;
  end if;

  return new;
end;
$$;

create trigger items_enforce_status_transition
  before update on public.items
  for each row execute function app.enforce_status_transition();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- The public sees published, undeleted stock and nothing else. Costs are
-- unreachable from here because they are not in this table.
create policy "public reads published items"
  on public.items for select
  to anon
  using (published_at is not null and deleted_at is null);

create policy "staff read every item"
  on public.items for select
  to authenticated
  using ((select app.is_staff()));

create policy "staff create items"
  on public.items for insert
  to authenticated
  with check ((select app.is_staff()));

create policy "staff edit items"
  on public.items for update
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

-- Hard delete is the owner's alone; everyone else sets deleted_at.
create policy "owner deletes items"
  on public.items for delete
  to authenticated
  using ((select app.is_owner()));

create policy "public reads tags of published items"
  on public.item_tags for select
  to anon
  using (exists (
    select 1 from public.items i
    where i.id = item_id
      and i.published_at is not null
      and i.deleted_at is null
  ));

create policy "staff manage item tags"
  on public.item_tags for all
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.item_tags to authenticated;
grant select on public.item_tags to anon;

-- Column-level grants are the second lock on the public path. `anon` is a real
-- Postgres role (unlike our staff roles, which are rows), so a column grant
-- genuinely works here — and it keeps the internal columns unreachable even if
-- someone later widens the SELECT policy by mistake.
--
-- Withheld deliberately: arrived_at, reserved_until, location_code, created_by,
-- created_at, updated_at, deleted_at.
grant select (
  id, sku, slug, title, brand, model, category_id, condition_grade,
  description, workshop_notes, capacity, power, specs,
  width_mm, depth_mm, height_mm, weight_kg,
  list_price_cents, retail_price_cents, sale_price_cents,
  status, published_at, featured, sold_at
) on public.items to anon;
