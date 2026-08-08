-- Subcategories — the second level of the catalogue tree.
--
-- A lookup table for the same reason `categories` is one: staff will want a
-- seventh subcategory on a Tuesday and should not need a migration and a deploy
-- to get it.

create table public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  slug        text not null unique,
  name        text not null,
  position    integer not null default 0,
  active      boolean not null default true,

  -- Names only have to be unique inside their parent: "Tables & Benches" under
  -- Storage and a future "Tables" under Preparation are different things.
  unique (category_id, name),
  -- Not redundant with the primary key: it is the target the composite foreign
  -- key on items below needs, and it is what makes that constraint expressible.
  unique (id, category_id)
);

comment on table public.subcategories is
  'Second level of the catalogue tree. Slugs are prefixed with the parent '
  'category because the column is globally unique — two parents may both want '
  'a "tables" child.';

revoke all on public.subcategories from anon, authenticated;
alter table public.subcategories enable row level security;

create index subcategories_category_position_idx
  on public.subcategories (category_id, position) where active;


-- ---------------------------------------------------------------------------
-- items.subcategory_id
-- ---------------------------------------------------------------------------
-- The foreign key is COMPOSITE, and that is the whole point of it. A plain
-- reference to subcategories(id) would happily let a Refrigeration item carry a
-- "Fryers" subcategory; pointing at (id, category_id) means the database itself
-- refuses the mismatch, so the pair can never drift apart no matter which app
-- writes it.
--
-- MATCH SIMPLE (the default) treats the constraint as satisfied whenever either
-- column is NULL, which is exactly right here — a draft is created empty and
-- fills in over the course of an intake, so both must be legal on their own.
alter table public.items
  add column subcategory_id uuid,

  add constraint items_subcategory_matches_category
    foreign key (subcategory_id, category_id)
    references public.subcategories (id, category_id),

  -- No ON DELETE action, matching category_id's `on delete restrict`: a
  -- subcategory that is in use should refuse to disappear rather than silently
  -- empty a field on live stock.

  -- Closes the one gap MATCH SIMPLE leaves: a subcategory with no category at
  -- all would otherwise pass the composite key unchecked.
  add constraint items_subcategory_needs_category
    check (subcategory_id is null or category_id is not null);

create index items_subcategory_idx on public.items (subcategory_id)
  where deleted_at is null;


-- ---------------------------------------------------------------------------
-- Policies — mirrored from categories
-- ---------------------------------------------------------------------------
create policy "anyone reads active subcategories"
  on public.subcategories for select to anon, authenticated using (active);

create policy "managers manage subcategories"
  on public.subcategories for all to authenticated
  using ((select app.at_least('manager')))
  with check ((select app.at_least('manager')));

grant select on public.subcategories to anon, authenticated;
grant insert, update, delete on public.subcategories to authenticated;

-- The column grant is the second lock on the public path, and a new column is
-- NOT covered by the grant list written in the items migration. Without this the
-- storefront's view — which runs with security_invoker, as the anon role — reads
-- a permission error rather than a subcategory.
grant select (subcategory_id) on public.items to anon;


-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
-- Two or three per category. Kept deliberately short: a subcategory nobody
-- filters by is a subcategory that costs intake time, and the list has to stay
-- scannable in a dropdown held at arm's length in a warehouse.
insert into public.subcategories (category_id, slug, name, position)
select c.id, s.slug, s.name, s.position
from (values
  ('cooking',       'cooking-ovens-combis',        'Ovens & Combis',        1),
  ('cooking',       'cooking-ranges-cooktops',     'Ranges & Cooktops',     2),
  ('cooking',       'cooking-fryers-griddles',     'Fryers & Griddles',     3),

  ('refrigeration', 'refrigeration-under-counter', 'Under-counter',         1),
  ('refrigeration', 'refrigeration-upright',       'Uprights & Freezers',   2),
  ('refrigeration', 'refrigeration-display',       'Display & Merchandiser', 3),

  ('preparation',   'preparation-mixers',          'Mixers',                1),
  ('preparation',   'preparation-slicers',         'Slicers & Processors',  2),
  ('preparation',   'preparation-counters',        'Prep Counters',         3),

  ('wash-up',       'wash-up-dishwashers',         'Dishwashers',           1),
  ('wash-up',       'wash-up-glasswashers',        'Glasswashers',          2),
  ('wash-up',       'wash-up-sinks',               'Sinks & Tables',        3),

  ('bakery',        'bakery-deck-ovens',           'Deck Ovens',            1),
  ('bakery',        'bakery-provers',              'Provers',               2),
  ('bakery',        'bakery-dough',                'Dough Equipment',       3),

  ('storage',       'storage-shelving',            'Shelving',              1),
  ('storage',       'storage-tables',              'Tables & Benches',      2),
  ('storage',       'storage-trolleys',            'Trolleys & Racks',      3)
) as s(category_slug, slug, name, position)
join public.categories c on c.slug = s.category_slug
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------------
-- One canonical cost per kind
-- ---------------------------------------------------------------------------
-- The intake form now shows the auction price and the workshop price as fixed
-- boxes rather than as options in a dropdown, which means each has to be a
-- single value that can be corrected in place — not another row appended to the
-- ledger every time somebody re-blurs the field.
--
-- SECURITY DEFINER for the same reason record_item_cost() is: a `staff` account
-- may write costs and may not read them, so it cannot run the "is there already
-- a row?" query that an upsert needs. Deleting and re-inserting inside the
-- definer context does the whole job without ever handing back a readable row.
create or replace function public.set_item_cost(
  p_item_id      uuid,
  p_kind         public.cost_kind,
  p_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER bypasses RLS, so this is the only thing standing between
  -- any signed-in user and the cost ledger. Do not remove it.
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  delete from public.item_costs where item_id = p_item_id and kind = p_kind;

  -- A cleared box means "there is no such cost", which is a delete and not a
  -- zero — a stored R0 would read as a machine that was free.
  if p_amount_cents is not null and p_amount_cents > 0 then
    insert into public.item_costs (item_id, kind, amount_cents, created_by)
    values (p_item_id, p_kind, p_amount_cents, (select auth.uid()));
  end if;
end;
$$;

revoke all on function public.set_item_cost(uuid, public.cost_kind, bigint)
  from public, anon;
grant execute on function public.set_item_cost(uuid, public.cost_kind, bigint)
  to authenticated;
