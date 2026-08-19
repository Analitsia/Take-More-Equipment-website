-- Orders — what a machine actually sold for, and to whom.
--
-- Until now a sale was one click: items.status moved to 'sold' and a trigger
-- stamped sold_at. Nothing recorded who bought it, nothing recorded what they
-- paid, and — the buried one — NOTHING IN THE OPS APP HAS EVER WRITTEN
-- items.sale_price_cents. Every money view computes revenue as
-- `coalesce(sale_price_cents, list_price_cents)`, so with the sale price always
-- null, every revenue and margin figure on the dashboard has been the ASKING
-- price. A discount was invisible to the business that gave it.
--
-- confirm_order_paid() in 20260819100300 is the first writer of that column.
-- The money views do not change; they become true.
--
-- ── The delivery charge is not a cost ─────────────────────────────────────
--
-- cost_kind already has 'transport', and the dashboard surfaces it as
-- `cost_delivery_cents`. That is what WE paid to bring a machine in, and it is
-- subtracted from margin. What a customer pays us to take one away is
-- orders.delivery_fee_cents and must never be written into item_costs. They are
-- opposite signs with the same English word attached, which is exactly the kind
-- of thing that gets conflated once and then reported wrong for a year.


-- ---------------------------------------------------------------------------
-- What delivery costs, in one place
-- ---------------------------------------------------------------------------
-- R250 covers the first ten kilometres; every kilometre past that is R10.
-- A part-kilometre is charged as a whole one — ceil(), not round(), so the
-- customer is never quoted less than the driver spends.
--
--   0 km → R250   ·   10 km → R250   ·   10.1 km → R260   ·   100 km → R1 150
--
-- Public rather than app-schema because /api/distance calls it over PostgREST:
-- the first fee the salesperson is shown then comes from the same expression
-- that will eventually be stored, instead of from a second one that agrees
-- until somebody edits one of them.
create or replace function public.delivery_fee_cents(p_km numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_km is null then 0::bigint
    when p_km <= 10   then 25000::bigint
    else 25000::bigint + (ceil(p_km - 10) * 1000)::bigint
  end
$$;

revoke all on function public.delivery_fee_cents(numeric) from public, anon;
grant execute on function public.delivery_fee_cents(numeric) to authenticated;

comment on function public.delivery_fee_cents(numeric) is
  'R250 up to 10 km, then R10 per whole kilometre. Twinned with '
  'deliveryFeeCents() in packages/core/src/delivery.ts and pinned by the '
  'parity suite. orders.delivery_fee_cents is recomputed from this on every '
  'write, so it is never a number anybody typed.';


-- ---------------------------------------------------------------------------
-- Order numbers
-- ---------------------------------------------------------------------------
-- ORD-0007. Said out loud to a customer and written on a delivery note, so it
-- is sequential and readable rather than a uuid. Unlike an item code it never
-- has to fit on a sticker, so there is no reason to compress it.
create sequence if not exists app.order_code_seq as bigint start 1;

create or replace function app.next_order_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'ORD-' || lpad(nextval('app.order_code_seq')::text, 4, '0')
$$;

grant execute on function app.next_order_code() to authenticated;


-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique default app.next_order_code(),

  -- Nullable, but required before the order can be paid — see
  -- orders_paid_is_complete. A salesperson scans machines while the customer is
  -- still talking, and a form that demands a name first is a form that gets
  -- filled in with "walk in". The CHECK makes "everything is on record" true at
  -- the moment it matters instead of at the moment it is inconvenient.
  --
  -- RESTRICT rather than SET NULL: a person who has bought something cannot be
  -- hard-deleted while the order remembers them. Soft delete is unaffected.
  lead_id uuid references public.leads (id) on delete restrict,

  status public.order_status not null default 'draft',

  -- The GOODS total: what the machines sold for after whatever discount was
  -- given. NOT the delivery, deliberately — only this figure can be allocated
  -- back to items.sale_price_cents, and folding a logistics charge into it
  -- would inflate every per-unit margin in item_analytics with money that was
  -- never a machine.
  sold_total_cents bigint check (sold_total_cents >= 0),

  delivery           boolean not null default false,
  delivery_address   text,
  delivery_km        numeric(6,1) check (delivery_km >= 0),
  -- 'google' or 'manual'. Which one it was is the only way to audit a fee that
  -- later looks wrong, and the manual path is a supported answer rather than a
  -- degraded one: the driver knows the road better than the API does.
  delivery_km_source text check (delivery_km_source in ('google', 'manual')),
  -- Never written by a caller. app.orders_before_write() recomputes it from
  -- delivery_km on every write, which is what stops a stale fee surviving a
  -- corrected distance.
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),

  -- What the customer hands over. Generated so that the goods total, the
  -- delivery fee and the total on the screen cannot drift apart.
  charged_total_cents bigint
    generated always as (coalesce(sold_total_cents, 0) + delivery_fee_cents) stored,

  payment_method    public.payment_method,
  -- The card machine's slip number, or the EFT reference. Free text on purpose:
  -- it is a string somebody copies off a receipt, not an identifier we own.
  payment_reference text,
  paid_at           timestamptz,
  sold_by           uuid references auth.users (id) on delete set null,

  notes       text,
  voided_at   timestamptz,
  void_reason text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A paid order is a record of money. All four of these are things somebody
  -- would have to know to reconcile it against a bank statement, so a paid
  -- order missing any of them is not a record, it is a gap.
  constraint orders_paid_is_complete check (
    status <> 'paid' or (
      paid_at is not null
      and payment_method is not null
      and lead_id is not null
      and sold_total_cents is not null
      and sold_total_cents > 0
    )
  ),

  -- Delivery without an address is a promise nobody can keep, and without a
  -- distance it has no price.
  constraint orders_delivery_is_complete check (
    not delivery or (
      coalesce(btrim(delivery_address), '') <> ''
      and delivery_km is not null
    )
  ),

  -- An open order cannot be carrying a payment. This is what makes reopening
  -- safe to express as an ordinary update: reopen_order() clears these three in
  -- the same statement that moves the status, and anything that tried to reopen
  -- an order while leaving the takings attached is refused here rather than
  -- becoming an order that is simultaneously open and paid for.
  --
  -- sold_total_cents is deliberately NOT in this list. The salesperson types a
  -- figure while negotiating, and a draft is allowed to remember it.
  constraint orders_draft_carries_no_payment check (
    status <> 'draft' or (
      paid_at is null and payment_method is null and payment_reference is null
    )
  )
);

comment on table public.orders is
  'One in-person sale. Payment is RECORDED here, never processed — the card '
  'machine and the bank move the money.';

revoke all on public.orders from anon, authenticated;
alter table public.orders enable row level security;

create index orders_status_idx  on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_lead_idx    on public.orders (lead_id) where lead_id is not null;
-- The dashboard's "what did we take this month" question.
create index orders_paid_idx    on public.orders (paid_at desc) where paid_at is not null;


-- ---------------------------------------------------------------------------
-- order_lines
-- ---------------------------------------------------------------------------
create table public.order_lines (
  id       uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- RESTRICT: a machine on an order cannot be hard-deleted out from under it.
  item_id  uuid not null references public.items (id) on delete restrict,

  -- Snapshotted when the machine was added, so repricing it next week cannot
  -- rewrite what this customer was quoted. An order is a record of what
  -- happened, not a live view of a catalogue. Both figures are already public
  -- on the storefront, so neither is a cost leak.
  list_price_cents   bigint not null check (list_price_cents >= 0),
  retail_price_cents bigint check (retail_price_cents >= 0),

  -- This machine's share of the discounted goods total. Filled by
  -- confirm_order_paid() and by nothing else, which is what keeps one code path
  -- in the whole system able to decide what something sold for.
  sold_price_cents bigint check (sold_price_cents >= 0),

  position   integer not null default 0,
  created_at timestamptz not null default now(),

  -- No quantity column. Every item is one physical unit — that is the premise
  -- the whole schema rests on — so adding the same machine twice is a mistake
  -- and this is the error message for it.
  unique (order_id, item_id)
);

comment on table public.order_lines is
  'One machine on one order, with the asking price frozen at the moment it was '
  'added. No cost columns: order_line_economics reads item_costs live.';

revoke all on public.order_lines from anon, authenticated;
alter table public.order_lines enable row level security;

create index order_lines_order_idx on public.order_lines (order_id);
create index order_lines_item_idx  on public.order_lines (item_id);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function app.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.code       := coalesce(nullif(btrim(new.code), ''), app.next_order_code());
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    -- Identity and authorship are write-once, exactly as items_before_write()
    -- treats sku. An order number is said out loud to a customer.
    new.code       := old.code;
    new.created_at := old.created_at;
    new.created_by := old.created_by;

    -- A paid order goes back to draft only once its machines are no longer
    -- sold, which is precisely what reopen_order() does before it touches this
    -- row. Stated as the condition rather than as a flag the sanctioned caller
    -- sets: an escape hatch would be a hole anybody could use, whereas this
    -- refuses exactly the thing that is actually wrong — an order saying it is
    -- open while items.sale_price_cents still records what it sold for.
    if old.status = 'paid' and new.status = 'draft'
       and exists (
         select 1
         from public.order_lines l
         join public.items i on i.id = l.item_id
         where l.order_id = new.id and i.status = 'sold'
       ) then
      raise exception
        'A paid order cannot be edited back into a draft while its machines are still sold. Use reopen_order().'
        using errcode = 'check_violation';
    end if;

    if old.status = 'void' and new.status <> 'void' then
      raise exception 'A voided order stays voided. Start a new one.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The fee is derived, never entered. Recomputing it here means a corrected
  -- distance cannot leave yesterday's price behind it, and no caller — not the
  -- UI, not a script, not a hand-written update — can put a number in this
  -- column that the rule would not produce.
  new.delivery_fee_cents := case
    when new.delivery then public.delivery_fee_cents(new.delivery_km)
    else 0
  end;

  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_before_write
before insert or update on public.orders
for each row execute function app.orders_before_write();


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create policy "staff read orders"
on public.orders for select to authenticated
using ((select app.is_staff()));

create policy "staff open an order"
on public.orders for insert to authenticated
with check ((select app.is_staff()));

-- USING sees the row as it was; WITH CHECK sees it as it will be. Restricting
-- USING to 'draft' therefore permits draft → paid and draft → void, while
-- freezing a PAID order against any ordinary update at all.
--
-- That is the point. Changing the record of money already taken has to go
-- through void_order() or reopen_order(), which un-sell the machines in the
-- same transaction — because the alternative is a total edited on the order
-- while items.sale_price_cents still says what it said before, and two numbers
-- that disagree about one sale.
create policy "staff work a draft order"
on public.orders for update to authenticated
using ((select app.is_staff()) and status = 'draft')
with check ((select app.is_staff()));

create policy "owner deletes orders"
on public.orders for delete to authenticated
using ((select app.is_owner()));

create policy "staff read order lines"
on public.order_lines for select to authenticated
using ((select app.is_staff()));

-- Lines move only while the order they belong to is still open.
create policy "staff manage draft lines"
on public.order_lines for all to authenticated
using (
  (select app.is_staff())
  and exists (select 1 from public.orders o where o.id = order_id and o.status = 'draft')
)
with check (
  (select app.is_staff())
  and exists (select 1 from public.orders o where o.id = order_id and o.status = 'draft')
);

grant select, insert, update, delete on public.orders      to authenticated;
grant select, insert, update, delete on public.order_lines to authenticated;

-- No anon policy and no anon grant on either table, and there is no reason
-- there ever should be: an order is not something the storefront can see.


-- ---------------------------------------------------------------------------
-- The activity log
-- ---------------------------------------------------------------------------
-- Reuses the existing activity_action values. Adding an enum value would need
-- its own migration file (alter type cannot share a transaction with its use),
-- and there is nothing an order does that 'created' and 'status_changed' do not
-- already describe. lib/activity.ts has a fallback branch for entities that are
-- not items, so these render without a code change.
--
-- NOT ONE COST FIGURE GOES IN HERE. activity_log is readable by every staff
-- member and always has been, on the stated basis that "nothing sensitive
-- reaches this table". The charged total is a price the customer was told, so
-- it is fine; what the machine cost us is not, and this is the easiest place in
-- the schema to undo the cost wall by accident.
create or replace function app.log_order_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  money text;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, after)
    values (actor, 'order', new.id, 'created', new.code || ' opened',
            jsonb_build_object('code', new.code));
    return new;
  end if;

  if new.status is distinct from old.status then
    money := 'R' || round(coalesce(new.charged_total_cents, 0) / 100.0)::bigint;

    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before, after)
    values (
      actor, 'order', new.id, 'status_changed',
      case new.status
        when 'paid' then new.code || ' paid · ' || money || ' · '
                         || replace(coalesce(new.payment_method::text, 'unknown'), '_', ' ')
        when 'void' then new.code || ' voided'
                         || coalesce(': ' || nullif(btrim(new.void_reason), ''), '')
        else new.code || ' reopened'
      end,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'code', new.code)
    );
  end if;

  return new;
end;
$$;

create trigger orders_log_activity
after insert or update on public.orders
for each row execute function app.log_order_activity();
