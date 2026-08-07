-- Categories, tags, and the legal status moves.
--
-- These are lookup tables rather than enums because staff will want a seventh
-- category on a Tuesday and should not need a migration and a deploy to get it.
-- The exception is `condition_grade`, which stays an enum — see the reasoning
-- in the enums migration.

create table public.categories (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,
  name     text not null unique,
  -- Iconify name, e.g. 'solar:fire-linear'. The storefront's category tiles
  -- render this directly; it lived in a hardcoded `categoryMeta` map before.
  icon     text not null default 'solar:box-linear',
  blurb    text,
  position integer not null default 0,
  active   boolean not null default true
);

create table public.tags (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,
  name     text not null unique,
  position integer not null default 0,
  active   boolean not null default true
);

-- The status machine, as data. packages/core/src/status.ts holds the same rows
-- and a CI test asserts the two agree — the UI reads the TypeScript copy to
-- decide which buttons to draw, the trigger reads this one to decide what is
-- actually allowed.
create table public.item_status_transitions (
  from_status public.item_status not null,
  to_status   public.item_status not null,
  min_role    public.app_role not null,
  label       text not null,
  primary key (from_status, to_status)
);

create index categories_position_idx on public.categories (position) where active;
create index tags_position_idx on public.tags (position) where active;

revoke all on public.categories, public.tags, public.item_status_transitions
  from anon, authenticated;

alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.item_status_transitions enable row level security;


-- Reference data is world-readable: the storefront's filter panel and category
-- tiles are built from it, and none of it is a secret.
create policy "anyone reads active categories"
  on public.categories for select to anon, authenticated using (active);

create policy "anyone reads active tags"
  on public.tags for select to anon, authenticated using (active);

create policy "staff read every transition"
  on public.item_status_transitions for select
  to anon, authenticated using (true);

-- Adding a category reshapes the public navigation, so it is a manager's call.
create policy "managers manage categories"
  on public.categories for all to authenticated
  using ((select app.at_least('manager')))
  with check ((select app.at_least('manager')));

create policy "managers manage tags"
  on public.tags for all to authenticated
  using ((select app.at_least('manager')))
  with check ((select app.at_least('manager')));

-- Transitions are schema, not content. Changing them means changing
-- packages/core too, which means a deploy — so no write policy at all.

grant select on public.categories, public.tags, public.item_status_transitions
  to anon, authenticated;
grant insert, update, delete on public.categories, public.tags to authenticated;


-- ---------------------------------------------------------------------------
-- The legal moves
-- ---------------------------------------------------------------------------
insert into public.item_status_transitions (from_status, to_status, min_role, label) values
  ('intake',       'refurbishing', 'staff',   'Send to workshop'),
  ('intake',       'ready',        'staff',   'Already sound — skip workshop'),
  ('refurbishing', 'ready',        'staff',   'Workshop complete'),
  ('refurbishing', 'intake',       'manager', 'Back to intake'),
  ('ready',        'listed',       'staff',   'List for sale'),
  ('ready',        'refurbishing', 'staff',   'Back to workshop'),
  ('listed',       'reserved',     'staff',   'Reserve for a buyer'),
  ('listed',       'sold',         'manager', 'Mark sold'),
  ('listed',       'ready',        'manager', 'Withdraw from sale'),
  ('reserved',     'sold',         'manager', 'Confirm sale'),
  ('reserved',     'listed',       'staff',   'Release reservation'),
  ('sold',         'handed_over',  'staff',   'Handed over'),
  -- A sale that falls through after payment rewrites revenue, so it is the
  -- owner's call rather than a manager's.
  ('sold',         'listed',       'owner',   'Reverse sale'),
  ('handed_over',  'sold',         'owner',   'Undo handover');


-- ---------------------------------------------------------------------------
-- Slug and SKU generation
-- ---------------------------------------------------------------------------

-- Twin of slugify() in packages/core/src/slug.ts. The TypeScript version powers
-- the live URL preview in the intake form; this one is what actually gets
-- stored. A CI test runs both over the same fixtures.
--
-- STABLE rather than IMMUTABLE because unaccent() is itself stable — it reads a
-- dictionary. That rules this out of index expressions, which is fine; it is
-- only ever called from a trigger.
--
-- Known divergence, accepted: unaccent() folds 'ß' to 'ss' where the JavaScript
-- NFD-strip drops it. For English and Afrikaans input — ê, ë, ô, û, á — the two
-- agree, which covers everything this business will type.
create or replace function app.slugify(input text)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(input)), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    ),
    '-'
  )
$$;

-- Appends -2, -3, … until the slug is free. `exclude_id` lets an item keep its
-- own slug when its title is edited without tripping over itself.
create or replace function app.unique_slug(base text, exclude_id uuid default null)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  root      text := coalesce(nullif(app.slugify(base), ''), 'item');
  candidate text := root;
  n         integer := 1;
begin
  while exists (
    select 1 from public.items
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    n := n + 1;
    candidate := root || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- TME-2608-0417.
--
-- The counter is a sequence rather than a count of existing rows, so two
-- workers submitting intakes in the same second cannot collide. It is global
-- rather than per-month, which means the last four digits do not reset in
-- January — uniqueness is a property of the whole string, and a monotonic
-- counter is one fewer thing to get wrong. Past 9 999 it grows to five digits,
-- which SKU_PATTERN in packages/core allows for.
create sequence if not exists app.item_sku_seq as bigint start 1;

create or replace function app.next_sku()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'TME-'
       || to_char(timezone('utc', now()), 'YYMM')
       || '-'
       || lpad(nextval('app.item_sku_seq')::text, 4, '0')
$$;
