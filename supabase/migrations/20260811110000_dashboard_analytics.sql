-- The two views behind the unified Dashboard.
--
-- Today, Board and Money were three destinations answering one question badly
-- between them: Today counted units, Board arranged them by workshop stage, and
-- Money aggregated by category only. None of them could answer "what is our
-- rotation on under-counter fridges, and what did the workshop spend getting
-- them out the door" — the question the people scaling this business actually
-- ask.
--
-- ── Why per-row and not more aggregates ───────────────────────────────────
--
-- money_by_category already exists and is fine at what it does. Extending that
-- pattern to answer the new question means a view per grouping: by
-- subcategory, by cost kind, by cost kind per subcategory, each again filtered
-- by period. That is a combinatorial pile of SQL and a round trip every time
-- somebody touches a dropdown.
--
-- These two views emit one row per item and one row per recorded want instead,
-- carrying every dimension the dashboard slices on. The browser groups them.
-- One query serves every filter combination, and changing a filter is instant
-- because nothing is fetched. At this business's size — hundreds of machines,
-- thousands of leads — that is a small payload; the day it stops being one, the
-- fix is to push the grouping back into SQL behind the same shape, not to
-- redesign the page.
--
-- ── Two things both views inherit, and must not lose ──────────────────────
--
-- 1. `security_invoker = true`, on both. Without it a view runs as its OWNER
--    and silently bypasses RLS on the tables underneath — the classic way this
--    design leaks, called out in the item_economics and money_kpis headers for
--    the same reason. `create or replace view` RESETS the option, so any future
--    edit must restate it.
--
-- 2. item_analytics carries the `app.can_see_costs()` guard the other money
--    views carry. A staff account cannot read cost rows, so an unguarded
--    aggregate would sum to zero and present a margin equal to the whole asking
--    price. Not a leak — something worse, a confidently wrong number. The guard
--    makes it return nothing at all, and the dashboard renders its
--    without-costs variant instead of a page of lies.
--
--    lead_demand carries no such guard: every approved staff member may already
--    read every lead, and there is nothing in it they cannot see on the Clients
--    page. RLS on `leads` is what decides, exactly as it does there.


-- ---------------------------------------------------------------------------
-- item_analytics — one row per machine, every dimension the dashboard slices on
-- ---------------------------------------------------------------------------
-- Sold and unsold in the same relation, deliberately, for the reason
-- money_by_category gives: "fryers make good margin" and "we have eleven fryers
-- nobody wants" are the same decision, and separating them is how somebody ends
-- up reading one without the other. `is_sold` is the discriminator; every
-- money column below states which side of it it belongs to.
create view public.item_analytics
with (security_invoker = true) as
select
  i.id                                       as item_id,
  i.sku,
  i.title,
  i.status,
  i.arrived_at,
  i.sold_at,
  i.created_at,
  i.published_at,

  cat.id                                     as category_id,
  coalesce(cat.name, 'Uncategorised')        as category,
  sub.id                                     as subcategory_id,
  -- Not 'Uncategorised': a machine can legitimately sit in a category with no
  -- second level chosen, and calling that the same thing as having no category
  -- would merge two different states in the dashboard's own grouping.
  coalesce(sub.name, 'Unspecified')          as subcategory,

  (i.sold_at is not null)                    as is_sold,

  -- The price this unit is carrying: what it sold for, or failing that what it
  -- is asking. Present on unsold stock too, which is what makes "margin at
  -- asking" expressible without a second view.
  coalesce(i.sale_price_cents, i.list_price_cents, 0)::bigint as price_cents,

  -- Revenue is money that has actually arrived. An unsold machine contributes
  -- nothing to it however confident its asking price looks.
  case when i.sold_at is not null
       then coalesce(i.sale_price_cents, i.list_price_cents, 0)
       else 0 end::bigint                    as revenue_cents,

  -- ── The cost ledger, split by kind ──────────────────────────────────────
  -- The dashboard's cost breakdown is the reason this view exists at all.
  -- `transport` is what the intake form calls delivery; the column is named
  -- for the concept the reader has, not for the enum label.
  costs.total                                as cost_cents,
  costs.auction                              as cost_auction_cents,
  costs.workshop                             as cost_workshop_cents,
  costs.delivery                             as cost_delivery_cents,
  costs.parts                                as cost_parts_cents,
  costs.labour                               as cost_labour_cents,
  costs.premium                              as cost_premium_cents,
  costs.other                                as cost_other_cents,
  costs.labour_hours,

  -- Margin, both senses. Realised is only real once sold; unrealised is what
  -- the floor is currently promising. Keeping them in separate columns stops
  -- the browser adding a hope to a fact.
  case when i.sold_at is not null
       then coalesce(i.sale_price_cents, i.list_price_cents, 0) - costs.total
       else 0 end::bigint                    as margin_cents,
  case when i.sold_at is null
       then coalesce(i.sale_price_cents, i.list_price_cents, 0) - costs.total
       else 0 end::bigint                    as unrealised_margin_cents,
  -- Capital parked in this unit right now. Zero once it has sold.
  case when i.sold_at is null then costs.total else 0 end::bigint
                                             as tied_up_cents,

  -- ── Rotation ────────────────────────────────────────────────────────────
  -- Two different questions that look like one. days_to_sale is history and
  -- only exists for sold units; days_on_shelf is the clock still running on
  -- everything else. Averaging them together would flatter a floor full of
  -- machines that have not moved, because the ones that never sell never
  -- contribute a days_to_sale at all.
  case when i.sold_at is not null then (i.sold_at::date - i.arrived_at) end
                                             as days_to_sale,
  case when i.sold_at is null then (current_date - i.arrived_at) end
                                             as days_on_shelf
from public.items i
left join public.categories cat    on cat.id = i.category_id
left join public.subcategories sub on sub.id = i.subcategory_id
left join lateral (
  select
    coalesce(sum(c.amount_cents), 0)::bigint                                   as total,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'auction'), 0)::bigint as auction,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'workshop'), 0)::bigint as workshop,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'transport'), 0)::bigint as delivery,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'parts'), 0)::bigint   as parts,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'labour'), 0)::bigint  as labour,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'buyers_premium'), 0)::bigint as premium,
    coalesce(sum(c.amount_cents) filter (where c.kind = 'other'), 0)::bigint   as other,
    coalesce(sum(c.labour_hours), 0)::numeric                                  as labour_hours
  from public.item_costs c
  where c.item_id = i.id
) costs on true
where i.deleted_at is null
  and (select app.can_see_costs());

comment on view public.item_analytics is
  'One row per machine with category, subcategory, the cost ledger split by '
  'kind, margin and rotation. The dashboard groups these in the browser so a '
  'filter change costs no round trip. Empty for staff accounts by design — see '
  'the can_see_costs guard.';


-- ---------------------------------------------------------------------------
-- lead_demand — one row per recorded want, plus the people who want nothing yet
-- ---------------------------------------------------------------------------
-- The LEFT JOIN onto lead_interests is the load-bearing part. An inner join
-- would silently drop every customer who has not had a want written down, which
-- is most walk-ins on the day they are met — and the dashboard would report a
-- client base smaller than the Clients page lists, from the same data, on the
-- same screen.
--
-- So a lead with no interests appears once with null dimensions, and a lead
-- with three appears three times. Counting people therefore means counting
-- DISTINCT lead_id, always. Counting wants means counting interest_id. They are
-- different questions and the dashboard asks both.
create view public.lead_demand
with (security_invoker = true) as
select
  l.id                                     as lead_id,
  li.id                                    as interest_id,

  li.category_id,
  cat.name                                 as category,
  li.subcategory_id,
  sub.name                                 as subcategory,
  li.budget_max_cents,

  l.status                                 as lead_status,
  l.source                                 as lead_source,
  l.created_at                             as lead_created_at,
  l.last_contacted_at,

  -- Money changed hands. Half of the POPIA s69 test, and the numerator of the
  -- only conversion rate on the dashboard.
  (l.status = 'customer')                  as is_customer,
  -- Reachable for marketing: consent given on at least one channel and not
  -- withdrawn. Objecting outranks consent, which is why it is an AND and not
  -- two separate columns somebody could read one of.
  ((l.email_consent_at is not null or l.whatsapp_consent_at is not null)
    and l.unsubscribed_at is null)         as contactable,
  (l.unsubscribed_at is not null)          as unsubscribed
from public.leads l
left join public.lead_interests li on li.lead_id = l.id and li.active
left join public.categories cat    on cat.id = li.category_id
left join public.subcategories sub on sub.id = li.subcategory_id
where l.deleted_at is null;

comment on view public.lead_demand is
  'One row per active recorded want, plus one row per lead with no want at all. '
  'Count DISTINCT lead_id for people and interest_id for wants — a lead with '
  'three interests appears three times.';


-- ---------------------------------------------------------------------------
-- Grants — same shape as the money views
-- ---------------------------------------------------------------------------
-- No anon grant on either. RLS plus security_invoker does the real work; these
-- revokes mean a mistake in a policy is still not reachable without a session.
revoke all on public.item_analytics from anon, authenticated;
revoke all on public.lead_demand     from anon, authenticated;

grant select on public.item_analytics to authenticated;
grant select on public.lead_demand     to authenticated;
