-- The KPI views behind the Money dashboard. Phase 6 of docs/architecture.md.
--
-- The Money page was two totals and a flat table, while the architecture doc
-- scoped "revenue, gross margin per unit and category, days-to-sale (rotation),
-- sell-through rate". item_economics already delivered per-unit margin and
-- days-to-sale; these three views add the aggregates.
--
-- ── Two things every view here inherits, and must not lose ────────────────
--
-- 1. `security_invoker = true`, on every one. Without it a view runs as its
--    OWNER and silently bypasses RLS on item_costs — which is the classic way
--    this exact design leaks, and is called out in the item_economics header
--    for the same reason. `create or replace view` RESETS the option, so any
--    future edit must restate it.
--
-- 2. The `app.can_see_costs()` guard in each WHERE clause. A staff account
--    cannot read cost rows, so an unguarded aggregate would sum to zero and
--    present a margin equal to the entire asking price. Not a leak — something
--    worse, a confidently wrong number on a page headed "Money".
--
-- Costs are the reason these are views and not stored columns: margin is
-- derived from the ledger and the price, so it cannot drift behind an edit
-- somebody forgot to propagate.


-- ---------------------------------------------------------------------------
-- money_by_month — the trend line
-- ---------------------------------------------------------------------------
-- Keyed on sold_at, so a month's row is what was SOLD in it, not what happened
-- to be standing in the warehouse. Unsold stock has no month and is excluded;
-- money_position below is where unsold stock is accounted for.
create view public.money_by_month
with (security_invoker = true) as
select
  date_trunc('month', i.sold_at)::date          as month,
  count(*)::integer                             as units_sold,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents)), 0)::bigint
                                                as revenue_cents,
  coalesce(sum(costs.total), 0)::bigint         as cost_cents,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents)), 0)::bigint
    - coalesce(sum(costs.total), 0)::bigint     as margin_cents,
  -- Rounded to one decimal, matching item_economics.margin_percent, so the
  -- summary and the per-unit table cannot appear to disagree over rounding.
  case
    when coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents)), 0) > 0
      then round(
        ((coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents)), 0)
          - coalesce(sum(costs.total), 0))::numeric
         / coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents)), 0)) * 100, 1)
  end                                           as margin_percent,
  round(avg(i.sold_at::date - i.arrived_at)::numeric, 1) as avg_days_to_sale
from public.items i
left join lateral (
  select coalesce(sum(c.amount_cents), 0)::bigint as total
  from public.item_costs c
  where c.item_id = i.id
) costs on true
where i.deleted_at is null
  and i.sold_at is not null
  and (select app.can_see_costs())
group by 1;

comment on view public.money_by_month is
  'Revenue, cost and margin by month of sale. Unsold stock is absent by '
  'construction — see money_position for that.';


-- ---------------------------------------------------------------------------
-- money_by_category — where the margin actually comes from
-- ---------------------------------------------------------------------------
-- Sold and unsold in the same row, deliberately. "Fryers make good margin" and
-- "we have eleven fryers nobody wants" are the same decision, and splitting them
-- across two views is how somebody ends up reading one without the other.
create view public.money_by_category
with (security_invoker = true) as
select
  coalesce(cat.name, 'Uncategorised')            as category,
  cat.id                                         as category_id,
  count(*)::integer                              as units_total,
  count(*) filter (where i.sold_at is not null)::integer  as units_sold,
  count(*) filter (where i.sold_at is null
                     and i.status <> 'sold')::integer     as units_in_stock,

  -- Sell-through: of everything we have taken in for this category, what share
  -- has left. The single most useful number for deciding what to buy next.
  case
    when count(*) > 0
      then round((count(*) filter (where i.sold_at is not null))::numeric
                 / count(*)::numeric * 100, 1)
  end                                            as sell_through_percent,

  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents))
             filter (where i.sold_at is not null), 0)::bigint as revenue_cents,
  coalesce(sum(costs.total) filter (where i.sold_at is not null), 0)::bigint
                                                 as cost_cents,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents))
             filter (where i.sold_at is not null), 0)::bigint
    - coalesce(sum(costs.total) filter (where i.sold_at is not null), 0)::bigint
                                                 as margin_cents,

  -- Capital currently parked in this category. The number that answers
  -- "why is there no cash" better than any of the others here.
  coalesce(sum(costs.total) filter (where i.sold_at is null), 0)::bigint
                                                 as tied_up_cents,
  round(avg(i.sold_at::date - i.arrived_at) filter (where i.sold_at is not null)::numeric, 1)
                                                 as avg_days_to_sale
from public.items i
left join public.categories cat on cat.id = i.category_id
left join lateral (
  select coalesce(sum(c.amount_cents), 0)::bigint as total
  from public.item_costs c
  where c.item_id = i.id
) costs on true
where i.deleted_at is null
  and (select app.can_see_costs())
group by cat.id, cat.name;


-- ---------------------------------------------------------------------------
-- money_position — the single-row summary
-- ---------------------------------------------------------------------------
-- One row, so the page's tile strip is one query rather than five reduces over
-- a list the browser had to be sent first.
--
-- `aged_stock_cents` is the one to watch: capital in units that arrived more
-- than ninety days ago and have not sold. On a floor of one-of-one machines
-- that is the number that quietly grows while every other number looks fine.
create view public.money_position
with (security_invoker = true) as
select
  count(*) filter (where i.sold_at is null and i.status <> 'sold')::integer
                                                     as units_in_stock,
  coalesce(sum(costs.total) filter (where i.sold_at is null), 0)::bigint
                                                     as tied_up_cents,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents) - costs.total)
             filter (where i.sold_at is null), 0)::bigint
                                                     as unrealised_margin_cents,

  count(*) filter (where i.sold_at is not null)::integer      as units_sold_all_time,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents))
             filter (where i.sold_at is not null), 0)::bigint as revenue_all_time_cents,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents) - costs.total)
             filter (where i.sold_at is not null), 0)::bigint as margin_all_time_cents,

  count(*) filter (where i.sold_at >= now() - interval '30 days')::integer
                                                     as units_sold_30d,
  coalesce(sum(coalesce(i.sale_price_cents, i.list_price_cents) - costs.total)
             filter (where i.sold_at >= now() - interval '30 days'), 0)::bigint
                                                     as margin_30d_cents,

  round(avg(i.sold_at::date - i.arrived_at) filter (where i.sold_at is not null)::numeric, 1)
                                                     as avg_days_to_sale,

  count(*) filter (
    where i.sold_at is null
      and i.status <> 'sold'
      and i.arrived_at < current_date - 90
  )::integer                                         as aged_units,
  coalesce(sum(costs.total) filter (
    where i.sold_at is null
      and i.status <> 'sold'
      and i.arrived_at < current_date - 90
  ), 0)::bigint                                      as aged_stock_cents
from public.items i
left join lateral (
  select coalesce(sum(c.amount_cents), 0)::bigint as total
  from public.item_costs c
  where c.item_id = i.id
) costs on true
where i.deleted_at is null
  and (select app.can_see_costs());

comment on view public.money_position is
  'One row. The Money page tile strip, so the summary is a query rather than a '
  'reduce over every row the browser had to be sent first.';


-- ---------------------------------------------------------------------------
-- Grants — same shape as item_economics
-- ---------------------------------------------------------------------------
-- No anon grant on any of them. RLS on the underlying item_costs plus
-- security_invoker does the real work; these revokes mean a mistake in a policy
-- is still not reachable without a session.
revoke all on public.money_by_month    from anon, authenticated;
revoke all on public.money_by_category from anon, authenticated;
revoke all on public.money_position    from anon, authenticated;

grant select on public.money_by_month    to authenticated;
grant select on public.money_by_category to authenticated;
grant select on public.money_position    to authenticated;
