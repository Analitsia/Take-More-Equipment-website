-- What anonymous visitors are allowed to see.
--
-- `security_invoker = true` on every view here is load-bearing. Without it a
-- view runs as its owner (postgres) and bypasses RLS on its base tables
-- entirely — it keeps working, it just stops enforcing anything, and the only
-- thing between a draft and the internet becomes the WHERE clause. A CI test
-- pins the option, because `create or replace view` RESETS it to false.
--
-- With it on, these views are ergonomics rather than security: the real
-- protection is the anon SELECT policy on items plus the column grants, and
-- the fact that cost lives in a table anon has no grant on at all.

create view public.public_items
with (security_invoker = true) as
select
  i.id,
  i.sku,
  i.slug,
  i.title,
  i.brand,
  i.model,
  c.slug as category_slug,
  c.name as category_name,
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


create view public.public_item_media
with (security_invoker = true) as
select
  m.id,
  m.item_id,
  m.kind,
  m.storage_path,
  m.external_url,
  m.position,
  m.alt_text,
  m.width,
  m.height,
  m.duration_seconds
from public.item_media m
join public.items i on i.id = m.item_id
where i.published_at is not null
  and i.deleted_at is null
order by m.position, m.id;


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
  count(i.id) as item_count
from public.categories c
left join public.items i
  on i.category_id = c.id
 and i.published_at is not null
 and i.deleted_at is null
where c.active
group by c.id;


revoke all on public.public_items, public.public_item_media, public.public_categories
  from anon, authenticated;
grant select on public.public_items, public.public_item_media, public.public_categories
  to anon, authenticated;
