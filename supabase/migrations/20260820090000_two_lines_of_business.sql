-- Divisions — the level above the category tree.
--
-- The shop sells two different things to two different buyers: catering
-- equipment to kitchens, and furniture and decor to home stagers. Both move
-- through the same intake, the same workshop and the same storefront, so they
-- are not two systems — but a worker cataloguing a wardrobe should not be
-- scrolling past "Wash-Up" to find it, and a visitor looking for a dining table
-- should not be filtering through fryers.
--
-- So: one more level on top. Division → Category → Subcategory. Every existing
-- category becomes a child of Industrial Kitchen, which is what they already
-- were in everything but name, and nothing about an item row changes.
--
-- WHY ITEMS DO NOT GET A `division_id`
-- The division of an item is the division of its category, always, with no
-- exceptions and no way for the two to disagree. Storing it a second time on
-- `items` would create a column that can drift from the truth, and would need
-- the same composite-foreign-key trick subcategories needed to stop it. A join
-- is cheaper than an invariant nobody remembers to check.
--
-- A lookup table rather than an enum, for the same reason `categories` is one:
-- a third line of business should not need a migration and a deploy. It is
-- still a much heavier thing to add than a category — it reshapes the top of
-- the storefront — which is why only a manager may write here.

create table public.divisions (
  id       uuid primary key default gen_random_uuid(),
  slug     text not null unique,
  name     text not null unique,
  -- One line, shown under the name where the storefront gives it room.
  blurb    text,
  position integer not null default 0,
  active   boolean not null default true
);

comment on table public.divisions is
  'Top level of the catalogue tree: the lines of business the shop sells. '
  'Categories hang off this; items reach it through their category.';

create index divisions_position_idx on public.divisions (position) where active;

revoke all on public.divisions from anon, authenticated;
alter table public.divisions enable row level security;

-- Mirrored from categories: world-readable while active, manager-writable.
create policy "anyone reads active divisions"
  on public.divisions for select to anon, authenticated using (active);

create policy "managers manage divisions"
  on public.divisions for all to authenticated
  using ((select app.at_least('manager')))
  with check ((select app.at_least('manager')));

grant select on public.divisions to anon, authenticated;
grant insert, update, delete on public.divisions to authenticated;


insert into public.divisions (slug, name, blurb, position) values
  ('industrial-kitchen', 'Industrial Kitchen',
   'Refurbished catering equipment for kitchens, bakeries and bars.', 1),
  ('homestaging',        'Homestaging',
   'Furniture, lighting and decor for dressing a property.',          2)
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- categories.division_id
-- ---------------------------------------------------------------------------
-- Added nullable, backfilled, then made NOT NULL — the three-step, because the
-- six rows already in this table have no division and a bare NOT NULL would
-- refuse the migration outright.
--
-- `on delete restrict` matches items.category_id: a division with categories
-- under it should refuse to disappear rather than silently orphan them.
alter table public.categories
  add column division_id uuid references public.divisions (id) on delete restrict;

update public.categories c
   set division_id = d.id
  from public.divisions d
 where d.slug = 'industrial-kitchen'
   and c.division_id is null;

alter table public.categories
  alter column division_id set not null;

-- Names only have to be unique inside their division now, exactly as
-- subcategory names are unique inside their category. Storage under Industrial
-- Kitchen means shelving and trolleys; a future Storage under Homestaging would
-- mean sideboards, and refusing the second because the first exists is the
-- lookup table getting in the way of the business rather than describing it.
--
-- Slugs stay globally unique. They are what appears in a URL and what
-- capture_lead() resolves a storefront chip against, so two rows answering to
-- the same slug would be a genuine ambiguity rather than a tidy one.
alter table public.categories
  drop constraint categories_name_key,
  add constraint categories_name_unique_in_division unique (division_id, name);

create index categories_division_position_idx
  on public.categories (division_id, position) where active;


-- ---------------------------------------------------------------------------
-- Homestaging
-- ---------------------------------------------------------------------------
-- Six categories, two or three subcategories each — the same shape and the same
-- restraint as the kitchen side. `position` restarts at 1 within the division:
-- the storefront and the intake dropdown both order inside a division, never
-- across the two.
--
-- Icons are Iconify `solar` names and are bundled offline by `npm run icons`,
-- which greps this file precisely because category icons live in a database
-- column and appear nowhere else in the source.
insert into public.categories (division_id, slug, name, icon, blurb, position)
select d.id, c.slug, c.name, c.icon, c.blurb, c.position
from (values
  ('tables-desks',      'Tables & Desks',      'solar:bedside-table-4-linear',
   'Dining, side and console tables, desks',                        1),
  ('wardrobes-storage', 'Wardrobes & Storage', 'solar:closet-linear',
   'Wardrobes, chests of drawers, shelving units',                  2),
  ('seating',           'Seating',             'solar:armchair-2-linear',
   'Sofas, armchairs, dining and occasional chairs',                3),
  ('beds-bedroom',      'Beds & Bedroom',      'solar:bed-linear',
   'Bed frames, bases, headboards, bedsides',                       4),
  ('lighting',          'Lighting',            'solar:floor-lamp-linear',
   'Floor, table, pendant and wall lighting',                       5),
  ('decor-textiles',    'Decor & Textiles',    'solar:mirror-linear',
   'Mirrors, art, rugs, curtains, cushions',                        6)
) as c(slug, name, icon, blurb, position)
cross join public.divisions d
where d.slug = 'homestaging'
on conflict (slug) do nothing;

insert into public.subcategories (category_id, slug, name, position)
select c.id, s.slug, s.name, s.position
from (values
  ('tables-desks',      'tables-dining',            'Dining Tables',       1),
  ('tables-desks',      'tables-side-console',      'Side & Console',      2),
  ('tables-desks',      'tables-desks',             'Desks',               3),

  ('wardrobes-storage', 'wardrobes-freestanding',   'Wardrobes',           1),
  ('wardrobes-storage', 'wardrobes-drawers',        'Chests & Drawers',    2),
  ('wardrobes-storage', 'wardrobes-shelving',       'Shelving & Sideboards', 3),

  ('seating',           'seating-sofas',            'Sofas & Couches',     1),
  ('seating',           'seating-armchairs',        'Armchairs',           2),
  ('seating',           'seating-dining-chairs',    'Dining Chairs',       3),

  ('beds-bedroom',      'beds-frames',              'Beds & Frames',       1),
  ('beds-bedroom',      'beds-headboards',          'Headboards',          2),
  ('beds-bedroom',      'beds-bedsides',            'Bedside Tables',      3),

  ('lighting',          'lighting-floor',           'Floor Lamps',         1),
  ('lighting',          'lighting-table',           'Table Lamps',         2),
  ('lighting',          'lighting-ceiling',         'Pendants & Wall',     3),

  ('decor-textiles',    'decor-mirrors-art',        'Mirrors & Art',       1),
  ('decor-textiles',    'decor-rugs',               'Rugs',                2),
  ('decor-textiles',    'decor-soft-furnishing',    'Curtains & Cushions', 3)
) as s(category_slug, slug, name, position)
join public.categories c on c.slug = s.category_slug
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- The public views carry the division
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than CREATE OR REPLACE'd: replace can only
-- append columns to the end of a view, and the division belongs beside the
-- category it owns rather than stranded after the tag array. Nothing else in
-- the schema selects from either view, so the drop is free.
--
-- `security_invoker = true` is restated on both and is load-bearing — without
-- it a view runs as its owner and stops enforcing RLS on its base tables
-- entirely. A CI test pins the option precisely because it is this easy to lose.

drop view public.public_items;

create view public.public_items
with (security_invoker = true) as
select
  i.id,
  i.sku,
  i.slug,
  i.title,
  i.brand,
  i.model,
  d.slug as division_slug,
  d.name as division_name,
  c.slug as category_slug,
  c.name as category_name,
  s.slug as subcategory_slug,
  s.name as subcategory_name,
  i.condition_grade,
  i.description,
  i.workshop_notes,
  i.capacity,
  i.power,
  i.specs,
  i.width_mm,
  i.depth_mm,
  i.height_mm,
  i.weight_kg,
  i.list_price_cents,
  i.retail_price_cents,
  i.sale_price_cents,
  i.status,
  i.published_at,
  i.featured,
  i.sold_at,
  -- The badge the card renders. A handed-over machine is still "sold" to a
  -- visitor; the distinction between the two is an internal one.
  (i.status in ('sold', 'handed_over')) as sold,
  photo.storage_path as primary_image_path,
  photo.external_url as primary_image_url,
  coalesce(tags.slugs, '{}') as tag_slugs
from public.items i
-- INNER join, deliberately: the publish gate guarantees a published item has a
-- category, so this both reads correctly and asserts the invariant.
join public.categories c on c.id = i.category_id
-- Also INNER, and safe to be: categories.division_id is NOT NULL, so every
-- category that reaches this line has a division.
join public.divisions d on d.id = c.division_id
-- LEFT, unlike the two above: a subcategory is optional and no publish rule
-- demands one, so an inner join here would silently hide stock from the site.
left join public.subcategories s on s.id = i.subcategory_id
left join lateral (
  select m.storage_path, m.external_url
  from public.item_media m
  where m.item_id = i.id and m.kind = 'photo'
  order by m.position, m.id
  limit 1
) photo on true
left join lateral (
  select array_agg(t.slug order by t.position, t.slug) as slugs
  from public.item_tags it
  join public.tags t on t.id = it.tag_id
  where it.item_id = i.id
) tags on true
where i.published_at is not null
  and i.deleted_at is null;


drop view public.public_categories;

-- Category tiles, with the counts the storefront derives today.
create view public.public_categories
with (security_invoker = true) as
select
  c.id,
  c.slug,
  c.name,
  c.icon,
  c.blurb,
  c.position,
  d.slug     as division_slug,
  d.name     as division_name,
  d.position as division_position,
  count(i.id) as item_count
from public.categories c
join public.divisions d on d.id = c.division_id
left join public.items i
  on i.category_id = c.id
 and i.published_at is not null
 and i.deleted_at is null
where c.active and d.active
group by c.id, d.slug, d.name, d.position;


revoke all on public.public_items, public.public_categories from anon, authenticated;
grant select on public.public_items, public.public_categories to anon, authenticated;
