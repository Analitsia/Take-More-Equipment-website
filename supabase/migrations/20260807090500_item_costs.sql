-- What each machine cost us, and what we make on it.
--
-- This table exists separately from `items` for one reason: a `staff` account
-- types the auction price in at intake and must not be able to read it back.
-- Postgres RLS is row-level, and every signed-in worker is the same
-- `authenticated` Postgres role, so hiding a column from one of them and not
-- another is not expressible. A separate table makes it a row problem, which
-- RLS solves in three lines.
--
-- It also buys an auditable ledger instead of two opaque numbers: the intake
-- form still shows two boxes, and a manager can itemise later.

create table public.item_costs (
  id      uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  kind    public.cost_kind not null,
  amount_cents bigint not null check (amount_cents >= 0),
  note    text,
  -- Only meaningful for `labour`, but cheap to carry and it is what the
  -- shelf-space and workshop-throughput KPIs will want.
  labour_hours numeric(5,2) check (labour_hours >= 0),
  incurred_on  date not null default current_date,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

revoke all on public.item_costs from anon, authenticated;
alter table public.item_costs enable row level security;

create index item_costs_item_idx on public.item_costs (item_id);


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- No anon policy at all, and no anon grant. Cost is unreachable from the public
-- app by construction — there is nothing to widen by mistake.

create policy "managers read costs"
  on public.item_costs for select
  to authenticated
  using ((select app.can_see_costs()));

-- Staff write costs they cannot read. That asymmetry is the point.
--
-- SHARP EDGE: PostgREST defaults to `Prefer: return=representation`, which
-- makes every insert also a select — so `.insert().select()` from a staff
-- account returns a 403 that looks exactly like a broken policy, and the
-- instinctive fix (add a SELECT policy) quietly undoes this whole design. Use
-- public.record_item_cost() below, which returns void and cannot trip it.
create policy "staff record costs"
  on public.item_costs for insert
  to authenticated
  with check ((select app.is_staff()));

create policy "managers correct costs"
  on public.item_costs for update
  to authenticated
  using ((select app.can_see_costs()))
  with check ((select app.can_see_costs()));

create policy "managers remove costs"
  on public.item_costs for delete
  to authenticated
  using ((select app.can_see_costs()));

grant select, insert, update, delete on public.item_costs to authenticated;


-- ---------------------------------------------------------------------------
-- The safe write path
-- ---------------------------------------------------------------------------
create or replace function public.record_item_cost(
  p_item_id      uuid,
  p_kind         public.cost_kind,
  p_amount_cents bigint,
  p_note         text default null,
  p_labour_hours numeric default null,
  p_incurred_on  date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER bypasses RLS, so this check is the only thing standing
  -- between any signed-in user and the cost ledger. Do not remove it.
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  insert into public.item_costs
    (item_id, kind, amount_cents, note, labour_hours, incurred_on, created_by)
  values
    (p_item_id, p_kind, p_amount_cents, p_note, p_labour_hours,
     coalesce(p_incurred_on, current_date), (select auth.uid()));
end;
$$;

revoke all on function public.record_item_cost(uuid, public.cost_kind, bigint, text, numeric, date)
  from public, anon;
grant execute on function public.record_item_cost(uuid, public.cost_kind, bigint, text, numeric, date)
  to authenticated;


-- ---------------------------------------------------------------------------
-- Economics
-- ---------------------------------------------------------------------------
-- Margin is never a stored column. It is this view and the matching functions
-- in packages/core/src/margin.ts, computed from the ledger and the price, so it
-- cannot drift behind an edit someone forgot to propagate.
--
-- `security_invoker = true` is load-bearing: without it the view runs as its
-- owner and silently bypasses RLS on item_costs, which is the classic way this
-- exact design leaks. `create or replace view` RESETS this option, so any later
-- edit must restate it — a CI test pins it.
--
-- The can_see_costs() guard in the WHERE clause is belt to that braces. Without
-- it a staff account would see every item with a total cost of zero (their cost
-- rows are invisible, so the aggregate is empty) and therefore a margin equal to
-- the full asking price — not a leak, but a confidently wrong number, which is
-- worse than no number.
create view public.item_economics
with (security_invoker = true) as
select
  i.id   as item_id,
  i.sku,
  i.slug,
  i.title,
  i.status,
  i.arrived_at,
  i.sold_at,
  i.list_price_cents,
  i.sale_price_cents,
  coalesce(sum(c.amount_cents), 0)::bigint as total_cost_cents,
  coalesce(i.sale_price_cents, i.list_price_cents)
    - coalesce(sum(c.amount_cents), 0)::bigint as margin_cents,
  case
    when coalesce(i.sale_price_cents, i.list_price_cents) > 0
      then round(
        ((coalesce(i.sale_price_cents, i.list_price_cents)
          - coalesce(sum(c.amount_cents), 0)::numeric)
         / coalesce(i.sale_price_cents, i.list_price_cents)) * 100, 1)
  end as margin_percent,
  case
    when i.sold_at is not null
      then (i.sold_at::date - i.arrived_at)
  end as days_to_sale
from public.items i
left join public.item_costs c on c.item_id = i.id
where i.deleted_at is null
  and (select app.can_see_costs())
group by i.id;

revoke all on public.item_economics from anon, authenticated;
grant select on public.item_economics to authenticated;
