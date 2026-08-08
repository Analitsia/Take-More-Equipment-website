-- Carry the subcategory through to the storefront.
--
-- Dropped and recreated rather than CREATE OR REPLACE'd: replace can only append
-- columns to the end of a view, and the subcategory belongs beside the category
-- it hangs off rather than stranded after the tag array. Nothing else in the
-- schema selects from this view, so the drop is free.
--
-- `security_invoker = true` is restated below and is load-bearing — without it
-- the view runs as its owner and stops enforcing RLS on its base tables
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
-- LEFT, unlike the category above: a subcategory is optional and no publish rule
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

revoke all on public.public_items from anon, authenticated;
grant select on public.public_items to anon, authenticated;
