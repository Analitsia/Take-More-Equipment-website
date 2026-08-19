-- What the machines on an order cost us, while somebody is deciding what to
-- charge for them.
--
-- ── Why there is no cost column on order_lines ────────────────────────────
--
-- The obvious design is to snapshot the cost onto the line the way the asking
-- price is snapshotted. It is wrong here, for the same reason item_economics
-- exists as a view and margin is never a stored column: item_costs rows persist
-- for a sold machine and are never deleted, so reading them live is both
-- truthful and automatically equal to what item_analytics says about the same
-- machine. A snapshot would be a second copy of a number that can disagree with
-- its own ledger — and a second row-level surface to get the RLS right on.
--
-- The one thing a snapshot would buy is "what did we BELIEVE the cost was at
-- the time", and item_costs.created_at plus the activity log already answer it.
--
-- ── The guards ────────────────────────────────────────────────────────────
--
-- Both views are `security_invoker = true` AND carry `app.can_see_costs()`, for
-- the two separate reasons written into 20260809090500_money_kpis.sql: invoker
-- makes the reader's RLS on item_costs apply, and the guard makes the refusal
-- total rather than a set of rows that sum to zero and read as "free".
--
-- Today can_see_costs() is every approved account (20260819090100). The guards
-- stay anyway — they are what makes re-restricting one line rather than a
-- migration.
--
-- CREATE OR REPLACE VIEW RESETS security_invoker. Restate it on every edit.


-- ---------------------------------------------------------------------------
-- Per machine on the order
-- ---------------------------------------------------------------------------
-- The groupings are a presentation of the same ledger item_analytics reports,
-- not a different one: cost_total_cents here must equal item_analytics.cost_cents
-- for the same machine. If either grouping is ever changed, change both.
create view public.order_line_economics
with (security_invoker = true) as
select
  l.order_id,
  l.id      as line_id,
  l.item_id,
  l.position,
  i.sku,
  i.title,
  i.status,
  l.list_price_cents,
  l.retail_price_cents,
  l.sold_price_cents,

  -- What we paid to get it: the hammer price and the auction house's cut.
  c.purchase as cost_purchase_cents,
  -- What we paid to make it sellable: the workshop figure the intake form
  -- collects, plus anything itemised as parts or labour afterwards.
  c.refurb   as cost_refurb_cents,
  -- Everything else, including what it cost US to transport it in — which is
  -- not, and must never be confused with, what the customer pays for delivery.
  c.other    as cost_other_cents,
  c.total    as cost_total_cents

from public.order_lines l
join public.items i on i.id = l.item_id
left join lateral (
  select
    coalesce(sum(x.amount_cents) filter (
      where x.kind in ('auction', 'buyers_premium')), 0)::bigint as purchase,
    coalesce(sum(x.amount_cents) filter (
      where x.kind in ('workshop', 'parts', 'labour')), 0)::bigint as refurb,
    coalesce(sum(x.amount_cents) filter (
      where x.kind in ('transport', 'other')), 0)::bigint as other,
    coalesce(sum(x.amount_cents), 0)::bigint as total
  from public.item_costs x
  where x.item_id = l.item_id
) c on true
where (select app.can_see_costs());

comment on view public.order_line_economics is
  'Costs read live from item_costs, never snapshotted. cost_total_cents must '
  'equal item_analytics.cost_cents for the same machine.';


-- ---------------------------------------------------------------------------
-- The order as a whole
-- ---------------------------------------------------------------------------
-- LEFT JOIN, so an order with no machines on it yet still returns a row of
-- zeroes. The sale screen needs somewhere to put its totals before the first
-- line exists, and "no row" would render as "no costs" rather than "nothing
-- added yet".
create view public.order_economics
with (security_invoker = true) as
select
  o.id   as order_id,
  o.code,
  o.status,
  count(e.line_id)::integer                                  as line_count,

  coalesce(sum(e.list_price_cents), 0)::bigint               as list_total_cents,
  coalesce(sum(coalesce(e.retail_price_cents, 0)), 0)::bigint as retail_total_cents,

  coalesce(sum(e.cost_purchase_cents), 0)::bigint            as cost_purchase_cents,
  coalesce(sum(e.cost_refurb_cents), 0)::bigint              as cost_refurb_cents,
  coalesce(sum(e.cost_other_cents), 0)::bigint               as cost_other_cents,
  coalesce(sum(e.cost_total_cents), 0)::bigint               as cost_total_cents,

  o.sold_total_cents,
  o.delivery_fee_cents,
  o.charged_total_cents,

  -- Margin on the MACHINES. The delivery fee is excluded on both sides: we
  -- charge it and we also pay a driver, and since what the driver costs is not
  -- recorded anywhere, including only the income half would report a profit on
  -- delivery that nobody has measured.
  (coalesce(o.sold_total_cents, 0) - coalesce(sum(e.cost_total_cents), 0))::bigint
                                                             as margin_cents
from public.orders o
left join public.order_line_economics e on e.order_id = o.id
where (select app.can_see_costs())
group by
  o.id, o.code, o.status,
  o.sold_total_cents, o.delivery_fee_cents, o.charged_total_cents;

comment on view public.order_economics is
  'One row per order. margin_cents is on the machines only — the delivery fee '
  'is income against an unrecorded cost, so it is reported beside the margin '
  'and never inside it.';

revoke all on public.order_line_economics, public.order_economics from anon, authenticated;
grant select on public.order_line_economics, public.order_economics to authenticated;
