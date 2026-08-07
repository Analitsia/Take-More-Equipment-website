-- The six categories and nine tags the storefront already ships with.
--
-- This is reference data, not sample data: the application does not function
-- without it, so it belongs in a migration rather than in seed.sql. The 17 mock
-- items are the opposite — sample data, local and preview only, and they never
-- reach production.
--
-- Icons and blurbs are lifted verbatim from the `categoryMeta` map in
-- apps/web/src/data/equipment.ts so the category tiles render identically after
-- the swap.

insert into public.categories (slug, name, icon, blurb, position) values
  ('cooking',       'Cooking',       'solar:fire-linear',             'Ranges, combis, fryers, griddles',   1),
  ('refrigeration', 'Refrigeration', 'solar:fridge-linear',           'Under-counters, uprights, display',  2),
  ('preparation',   'Preparation',   'solar:scissors-linear',         'Mixers, slicers, prep counters',     3),
  ('wash-up',       'Wash-Up',       'solar:washing-machine-linear',  'Dishwashers, sinks, racks',          4),
  ('bakery',        'Bakery',        'solar:chef-hat-linear',         'Deck ovens, provers, dough rollers', 5),
  ('storage',       'Storage',       'solar:box-linear',              'Tables, shelving, trolleys, rails',  6)
on conflict (slug) do nothing;

-- Kept short on purpose — the filter panel stops being scannable past about a
-- dozen, and a tag nobody filters by is a tag that costs intake time.
insert into public.tags (slug, name, position) values
  ('gas',           'Gas',           1),
  ('electric',      'Electric',      2),
  ('countertop',    'Countertop',    3),
  ('under-counter', 'Under-counter', 4),
  ('mobile',        'Mobile',        5),
  ('pass-through',  'Pass-through',  6),
  ('glass-door',    'Glass door',    7),
  ('three-phase',   'Three-phase',   8),
  ('heavy-duty',    'Heavy-duty',    9)
on conflict (slug) do nothing;
