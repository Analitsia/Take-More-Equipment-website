-- Hire — a machine goes out, earns by the day, and comes back.
--
-- Until now an order could only sell. Take More also rents equipment out —
-- a fryer for a weekend market, a bain-marie for a function — and the only
-- place that could be written down was orders.notes, which prints on the
-- invoice and is read by nobody else. The machine was marked sold or not
-- marked at all, and the figure was worked out on a calculator.
--
-- ── The rule ──────────────────────────────────────────────────────────────
--
-- The hire rate is derived from the asking price, not negotiated:
--
--   daily rate            = 4 % of the asking price
--   days 1–7              = full daily rate
--   day 8 onwards         = daily rate less 15 %
--
--   R10 000 machine → R400 a day → 10 days = 7 × R400 + 3 × R340 = R3 820
--
-- One function, public.hire_fee_cents(), and a TypeScript twin in
-- packages/core/src/hire.ts so the screen can show the figure as the dates
-- are typed. The parity suite pins the two to each other the way it pins the
-- delivery fee.
--
-- ── What a hire is NOT ────────────────────────────────────────────────────
--
-- A hire never marks a machine `sold` and never writes items.sale_price_cents.
-- Every money view counts revenue off sold_at, and a machine that comes back
-- next week has not been sold; letting hire income into those figures would
-- report a fryer as sold three times and still on the shelf. The income lives
-- on the ORDER — sold_total_cents, charged_total_cents — which is what the
-- orders list and the invoice already read. The dashboard's per-machine views
-- do not see it, and that is a known gap rather than an accident.
--
-- The machine stays `reserved` — off the website, held — from the moment it is
-- added until somebody taps "returned", at which point it goes back to
-- whatever it was doing before, through the same app.restore_status() path
-- void_order() uses. No new item status, no new transition rows.
--
-- ── Why `kind` is text and not an enum ────────────────────────────────────
--
-- Same reason as delivery_km_source and order_invoices.kind: an enum needs its
-- own migration file to ever grow, and a CHECK does the same job here.


-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists kind text not null default 'sale'
    check (kind in ('sale', 'hire')),
  add column if not exists hire_start date,
  add column if not exists hire_end   date,
  -- Stamped by return_hire() and by nothing else. Null on a hire still out.
  add column if not exists hire_returned_at timestamptz;

comment on column public.orders.kind is
  'sale: the machines are sold and leave for good. hire: they go out for the '
  'period between hire_start and hire_end, earn public.hire_fee_cents() each, '
  'and come back. Chosen when the order is opened; frozen once it has lines.';

comment on column public.orders.hire_end is
  'The day the machines are due back, INCLUSIVE. Same day as hire_start is one '
  'day of hire, not zero — see app.hire_days().';

alter table public.orders
  -- The dates have to make sense whenever both are present.
  add constraint orders_hire_dates_in_order check (
    hire_start is null or hire_end is null or hire_end >= hire_start
  ),
  -- A paid hire without a period has no price. Same shape as
  -- orders_paid_is_complete: demanded at the moment it matters.
  add constraint orders_hire_is_complete check (
    kind <> 'hire' or status <> 'paid' or (hire_start is not null and hire_end is not null)
  ),
  -- A sale carries none of this. The before-write trigger clears the fields
  -- when the kind flips back, so this is the assertion rather than the
  -- mechanism.
  add constraint orders_sale_has_no_hire_fields check (
    kind = 'hire' or (hire_start is null and hire_end is null and hire_returned_at is null)
  ),
  -- Nothing can come back that never went out.
  add constraint orders_returned_means_paid check (
    hire_returned_at is null or status <> 'draft'
  );

-- "What is out on hire right now" is the question the orders list asks.
create index if not exists orders_on_hire_idx
  on public.orders (hire_end)
  where kind = 'hire' and status = 'paid' and hire_returned_at is null;


-- ---------------------------------------------------------------------------
-- The arithmetic, in one place
-- ---------------------------------------------------------------------------
-- Inclusive: out on the 1st, back on the 1st is one day.
create or replace function app.hire_days(p_start date, p_end date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start is null or p_end is null or p_end < p_start then null
    else (p_end - p_start) + 1
  end
$$;

grant execute on function app.hire_days(date, date) to authenticated;

-- 4 % of the asking price, to the cent, rounded half up. Positive inputs only,
-- so Postgres round() (half away from zero) and JavaScript Math.round() (half
-- toward +infinity) agree — which is what lets the screen and the ledger show
-- the same number.
create or replace function public.hire_daily_rate_cents(p_list_cents bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_list_cents is null or p_list_cents <= 0 then 0::bigint
    else round(p_list_cents * 4 / 100.0)::bigint
  end
$$;

-- The first seven days at the full rate, every day after that at 85 % of it.
-- The discounted rate is rounded on its own — round(daily × 0.85), not
-- round(list × 0.034) — so a customer can be told "R400 a day, R340 after a
-- week" and the total is exactly those two numbers multiplied out.
create or replace function public.hire_fee_cents(p_list_cents bigint, p_days integer)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_days is null or p_days <= 0 then 0::bigint
    else
      public.hire_daily_rate_cents(p_list_cents) * least(p_days, 7)
      + round(public.hire_daily_rate_cents(p_list_cents) * 85 / 100.0)::bigint
        * greatest(p_days - 7, 0)
  end
$$;

revoke all on function public.hire_daily_rate_cents(bigint) from public, anon;
revoke all on function public.hire_fee_cents(bigint, integer) from public, anon;
grant execute on function public.hire_daily_rate_cents(bigint) to authenticated;
grant execute on function public.hire_fee_cents(bigint, integer) to authenticated;

comment on function public.hire_fee_cents(bigint, integer) is
  '4% of the asking price per day for days 1-7, then 15% off the daily rate. '
  'Twinned with hireFeeCents() in packages/core/src/hire.ts and pinned by the '
  'schema and parity suites. confirm_hire_paid() is the only writer of the '
  'figure this produces.';


-- ---------------------------------------------------------------------------
-- orders_before_write — restated from 20260819100100_orders.sql
-- ---------------------------------------------------------------------------
-- What changed: the kind is frozen once the order has lines, a sale sheds its
-- hire fields, and a draft hire never carries a typed total — its total is
-- computed at the moment of payment and nowhere else.
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
    new.code       := old.code;
    new.created_at := old.created_at;
    new.created_by := old.created_by;

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

    -- A machine was added under one set of rules; switching the rules
    -- underneath it would re-price a line that was quoted. Take the machines
    -- off first, or open another order.
    if new.kind is distinct from old.kind
       and exists (select 1 from public.order_lines where order_id = new.id) then
      raise exception
        'This order already has machines on it. Take them off before changing it between a sale and a hire.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.kind = 'sale' then
    new.hire_start       := null;
    new.hire_end         := null;
    new.hire_returned_at := null;
  elsif new.status = 'draft' then
    -- The hire total is never typed. It is computed by confirm_hire_paid()
    -- from the dates and the asking prices, in the same statement that moves
    -- the status — so a draft hire has nothing to remember here.
    new.sold_total_cents := null;
  end if;

  new.delivery_fee_cents := case
    when new.delivery then public.delivery_fee_cents(new.delivery_km)
    else 0
  end;

  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- The activity log — restated from 20260819100100_orders.sql
-- ---------------------------------------------------------------------------
-- A paid hire says so, and a return gets a line of its own. Still not one
-- cost figure in here; the total is a price the customer was told.
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
    values (actor, 'order', new.id, 'created',
            new.code || case when new.kind = 'hire' then ' opened as a hire' else ' opened' end,
            jsonb_build_object('code', new.code, 'kind', new.kind));
    return new;
  end if;

  if new.status is distinct from old.status then
    money := 'R' || round(coalesce(new.charged_total_cents, 0) / 100.0)::bigint;

    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before, after)
    values (
      actor, 'order', new.id, 'status_changed',
      case new.status
        when 'paid' then new.code || ' paid · ' || money
                         || case when new.kind = 'hire'
                              then ' · hire ' || app.hire_days(new.hire_start, new.hire_end) || ' day'
                                   || case when app.hire_days(new.hire_start, new.hire_end) = 1 then '' else 's' end
                              else '' end
                         || ' · ' || replace(coalesce(new.payment_method::text, 'unknown'), '_', ' ')
        when 'void' then new.code || ' voided'
                         || coalesce(': ' || nullif(btrim(new.void_reason), ''), '')
        else new.code || ' reopened'
      end,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status, 'code', new.code, 'kind', new.kind)
    );
  end if;

  if new.hire_returned_at is not null and old.hire_returned_at is null then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, after)
    values (actor, 'order', new.id, 'updated', new.code || ' returned',
            jsonb_build_object('code', new.code, 'returned_at', new.hire_returned_at));
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- add_order_line — restated from 20260819110100
-- ---------------------------------------------------------------------------
-- One difference: a machine that went out on hire and has COME BACK is free
-- to go on another order. Before this, a paid hire held it for ever.
create or replace function public.add_order_line(
  p_order_id uuid,
  p_code     text default null,
  p_item_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_code   text := app.normalise_item_code(p_code);
  v_item   public.items%rowtype;
  v_clash  text;
  v_next   integer;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'This order is already %. Machines can only be added while it is open.', v_status
      using errcode = 'check_violation';
  end if;

  if p_item_id is not null then
    select * into v_item from public.items where id = p_item_id and deleted_at is null;
  elsif v_code is not null then
    select * into v_item from public.items where sku = v_code and deleted_at is null;
  else
    raise exception '% is not a machine code. They look like A042.', coalesce(nullif(btrim(p_code), ''), '(nothing)')
      using errcode = 'check_violation';
  end if;

  if not found then
    raise exception 'No machine has the code %.', coalesce(v_code, p_item_id::text)
      using errcode = 'no_data_found';
  end if;

  if v_item.status = 'sold' then
    raise exception '% has already been sold.', v_item.sku using errcode = 'check_violation';
  end if;

  select o.code into v_clash
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where l.item_id = v_item.id
    and l.order_id <> p_order_id
    and o.status in ('draft', 'paid')
    and not (o.kind = 'hire' and o.hire_returned_at is not null)
  limit 1;

  if v_clash is not null then
    raise exception '% is already on order %.', v_item.sku, v_clash
      using errcode = 'unique_violation';
  end if;

  select coalesce(max(position), -1) + 1 into v_next
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    order_id, item_id, list_price_cents, retail_price_cents, position,
    held_from_status
  ) values (
    p_order_id, v_item.id,
    coalesce(v_item.list_price_cents, 0),
    v_item.retail_price_cents,
    v_next,
    v_item.status
  );

  update public.items
     set status = 'reserved', published_at = null
   where id = v_item.id
     and status <> 'reserved';

  return jsonb_build_object(
    'item_id', v_item.id,
    'sku',     v_item.sku,
    'title',   v_item.title,
    'held_from_status', v_item.status
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- search_sellable_items — restated from 20260819120000_no_shelf_codes.sql
-- ---------------------------------------------------------------------------
-- The on_order column stops naming a hire that has been returned, to match
-- what add_order_line() now refuses.
create or replace function public.search_sellable_items(
  p_query    text,
  p_limit    integer default 10,
  p_order_id uuid default null
)
returns table (
  id                 uuid,
  sku                text,
  title              text,
  subtitle           text,
  status             text,
  list_price_cents   bigint,
  retail_price_cents bigint,
  on_order           text,
  rank               integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_needle text := btrim(coalesce(p_query, ''));
  v_like   text;
  v_limit  integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_code   text := app.normalise_item_code(p_query);
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  if length(v_needle) < 2 then
    return;
  end if;

  v_like := '%' || replace(replace(replace(
              lower(extensions.unaccent(v_needle)),
              '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    i.id,
    i.sku,
    i.title,
    concat_ws(' · ',
      nullif(concat_ws(' ', i.brand, i.model), '')
    )::text,
    i.status::text,
    i.list_price_cents,
    i.retail_price_cents,
    live.code,
    case
      when v_code is not null and i.sku = v_code                       then 0
      when lower(extensions.unaccent(i.sku))   like v_like             then 1
      when lower(extensions.unaccent(i.title)) like v_like             then 2
      else 3
    end
  from public.items i
  left join lateral (
    select o.code
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    where l.item_id = i.id
      and o.status in ('draft', 'paid')
      and not (o.kind = 'hire' and o.hire_returned_at is not null)
      and (p_order_id is null or o.id <> p_order_id)
    limit 1
  ) live on true
  where i.deleted_at is null
    and i.status <> 'sold'
    and (
      (v_code is not null and i.sku = v_code)
      or lower(extensions.unaccent(i.sku))                  like v_like escape '\'
      or lower(extensions.unaccent(i.title))                like v_like escape '\'
      or lower(extensions.unaccent(coalesce(i.brand, '')))  like v_like escape '\'
      or lower(extensions.unaccent(coalesce(i.model, '')))  like v_like escape '\'
    )
  order by 9, 3
  limit v_limit;
end;
$$;


-- ---------------------------------------------------------------------------
-- confirm_order_paid — restated from 20260819100300_order_rpcs.sql
-- ---------------------------------------------------------------------------
-- One line added: it refuses a hire. Two RPCs, one per kind, each refusing the
-- other's — so there is still exactly one code path that decides what a
-- machine SOLD for, and exactly one that decides what it EARNED.
create or replace function public.confirm_order_paid(
  p_order_id         uuid,
  p_sold_total_cents bigint,
  p_method           public.payment_method,
  p_reference        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders%rowtype;
  v_lines    integer;
  v_list_sum bigint;
  v_clash    text;
  v_line     record;
  v_alloc    bigint;
  v_running  bigint := 0;
  v_index    integer := 0;
  v_items    uuid[] := '{}';
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_order.kind <> 'sale' then
    raise exception 'This is a hire, not a sale. Use confirm_hire_paid().'
      using errcode = 'check_violation';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'This order is already %.', v_order.status using errcode = 'check_violation';
  end if;
  if v_order.lead_id is null then
    raise exception 'An order needs a customer before it can be paid.' using errcode = 'check_violation';
  end if;
  if coalesce(p_sold_total_cents, 0) <= 0 then
    raise exception 'What did the machines sell for? The total cannot be zero.'
      using errcode = 'check_violation';
  end if;

  perform 1
  from public.order_lines l
  join public.items i on i.id = l.item_id
  where l.order_id = p_order_id
  for update;

  select count(*), coalesce(sum(list_price_cents), 0)
    into v_lines, v_list_sum
  from public.order_lines where order_id = p_order_id;

  if v_lines = 0 then
    raise exception 'There are no machines on this order.' using errcode = 'check_violation';
  end if;

  select o.code into v_clash
  from public.order_lines l
  join public.order_lines l2 on l2.item_id = l.item_id and l2.order_id <> p_order_id
  join public.orders o on o.id = l2.order_id and o.status = 'paid'
  where l.order_id = p_order_id
    and not (o.kind = 'hire' and o.hire_returned_at is not null)
  limit 1;

  if v_clash is not null then
    raise exception 'One of these machines was sold on order % a moment ago.', v_clash
      using errcode = 'unique_violation';
  end if;

  for v_line in
    select id, item_id, list_price_cents
    from public.order_lines
    where order_id = p_order_id
    order by position, id
  loop
    v_index := v_index + 1;

    if v_index = v_lines then
      v_alloc := p_sold_total_cents - v_running;
    elsif v_list_sum > 0 then
      v_alloc := (p_sold_total_cents * v_line.list_price_cents) / v_list_sum;
    else
      v_alloc := p_sold_total_cents / v_lines;
    end if;

    v_running := v_running + v_alloc;

    update public.order_lines set sold_price_cents = v_alloc where id = v_line.id;

    update public.items
       set status           = 'sold',
           sale_price_cents = v_alloc,
           published_at     = null
     where id = v_line.item_id;

    v_items := v_items || v_line.item_id;
  end loop;

  update public.orders
     set status            = 'paid',
         sold_total_cents  = p_sold_total_cents,
         payment_method    = p_method,
         payment_reference = nullif(btrim(p_reference), ''),
         paid_at           = now(),
         sold_by           = (select auth.uid())
   where id = p_order_id;

  insert into public.lead_events (lead_id, kind, body, item_id, actor_id)
  values (
    v_order.lead_id,
    'purchased',
    v_order.code || ' · ' || v_lines || ' machine' || case when v_lines = 1 then '' else 's' end
      || ' · R' || round((p_sold_total_cents + v_order.delivery_fee_cents) / 100.0)::bigint
      || case when v_order.delivery then ' · delivered' else '' end,
    case when v_lines = 1 then v_items[1] else null end,
    (select auth.uid())
  );

  update public.leads
     set status = 'customer'
   where id = v_order.lead_id
     and status <> 'customer';

  return jsonb_build_object(
    'code',                v_order.code,
    'items',               to_jsonb(v_items),
    'sold_total_cents',    p_sold_total_cents,
    'delivery_fee_cents',  v_order.delivery_fee_cents,
    'charged_total_cents', p_sold_total_cents + v_order.delivery_fee_cents
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- confirm_hire_paid — the money for the period has arrived
-- ---------------------------------------------------------------------------
-- No total is passed in. It is computed here, from the dates on the order and
-- the asking price frozen on each line, and written to sold_total_cents in the
-- same statement that moves the status — so what the customer paid and what
-- the rule says are the same number by construction.
--
-- The machines are NOT sold. They stay `reserved`, off the website, until
-- return_hire() brings them back. items.sale_price_cents is untouched, so the
-- per-machine money views see nothing — see the header.
create or replace function public.confirm_hire_paid(
  p_order_id  uuid,
  p_method    public.payment_method,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders%rowtype;
  v_days   integer;
  v_lines  integer;
  v_total  bigint := 0;
  v_fee    bigint;
  v_clash  text;
  v_line   record;
  v_items  uuid[] := '{}';
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_order.kind <> 'hire' then
    raise exception 'This is a sale, not a hire. Use confirm_order_paid().'
      using errcode = 'check_violation';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'This order is already %.', v_order.status using errcode = 'check_violation';
  end if;
  if v_order.lead_id is null then
    raise exception 'A hire needs a customer before it can be paid.' using errcode = 'check_violation';
  end if;

  v_days := app.hire_days(v_order.hire_start, v_order.hire_end);
  if v_days is null then
    raise exception 'A hire needs the day it goes out and the day it comes back.'
      using errcode = 'check_violation';
  end if;

  perform 1
  from public.order_lines l
  join public.items i on i.id = l.item_id
  where l.order_id = p_order_id
  for update;

  select count(*) into v_lines from public.order_lines where order_id = p_order_id;
  if v_lines = 0 then
    raise exception 'There are no machines on this hire.' using errcode = 'check_violation';
  end if;

  -- Re-checked under the lock, as confirm_order_paid() does: sold on another
  -- order, or out on a hire that has not come back.
  select o.code into v_clash
  from public.order_lines l
  join public.order_lines l2 on l2.item_id = l.item_id and l2.order_id <> p_order_id
  join public.orders o on o.id = l2.order_id and o.status = 'paid'
  where l.order_id = p_order_id
    and not (o.kind = 'hire' and o.hire_returned_at is not null)
  limit 1;

  if v_clash is not null then
    raise exception 'One of these machines went out on order % a moment ago.', v_clash
      using errcode = 'unique_violation';
  end if;

  for v_line in
    select l.id, l.item_id, l.list_price_cents, i.status
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id
    order by l.position, l.id
  loop
    v_fee   := public.hire_fee_cents(v_line.list_price_cents, v_days);
    v_total := v_total + v_fee;

    -- What this machine earned, in the column the screen already reads as
    -- "Sold for". Per machine so the invoice can print one line each.
    update public.order_lines set sold_price_cents = v_fee where id = v_line.id;

    -- Held, and stays held. A machine somebody moved to the workshop by hand
    -- while the order was open is left where they put it.
    if v_line.status <> 'reserved' and v_line.status <> 'sold' then
      update public.items set status = 'reserved', published_at = null where id = v_line.item_id;
    end if;

    v_items := v_items || v_line.item_id;
  end loop;

  if v_total <= 0 then
    raise exception 'None of these machines has an asking price, so the hire has no rate. Price them first.'
      using errcode = 'check_violation';
  end if;

  update public.orders
     set status            = 'paid',
         sold_total_cents  = v_total,
         payment_method    = p_method,
         payment_reference = nullif(btrim(p_reference), ''),
         paid_at           = now(),
         sold_by           = (select auth.uid())
   where id = p_order_id;

  -- 'note' rather than 'purchased': the timeline's purchased entry means a
  -- machine changed hands for good, and a hire is the thing that did not.
  insert into public.lead_events (lead_id, kind, body, item_id, actor_id)
  values (
    v_order.lead_id,
    'note',
    v_order.code || ' · hire · ' || v_lines || ' machine' || case when v_lines = 1 then '' else 's' end
      || ' · ' || v_days || ' day' || case when v_days = 1 then '' else 's' end
      || ' · R' || round((v_total + v_order.delivery_fee_cents) / 100.0)::bigint
      || case when v_order.delivery then ' · delivered' else '' end,
    case when v_lines = 1 then v_items[1] else null end,
    (select auth.uid())
  );

  -- Money changed hands. That is what the status means.
  update public.leads
     set status = 'customer'
   where id = v_order.lead_id
     and status <> 'customer';

  return jsonb_build_object(
    'code',                v_order.code,
    'items',               to_jsonb(v_items),
    'days',                v_days,
    'sold_total_cents',    v_total,
    'delivery_fee_cents',  v_order.delivery_fee_cents,
    'charged_total_cents', v_total + v_order.delivery_fee_cents
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- return_hire — the machines are back
-- ---------------------------------------------------------------------------
-- The same restore loop void_order() runs, for the same reason: the line
-- remembers where the machine was before this order picked it up, and that is
-- where it goes. published_at is NOT set here — the publish gate fires before
-- the status trigger — so the ops app re-publishes through setStage() and
-- reports the machines that could not go back up.
create or replace function public.return_hire(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.orders%rowtype;
  v_items   uuid[] := '{}';
  v_restore jsonb  := '[]'::jsonb;
  v_line    record;
  v_back    public.item_status;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_order.kind <> 'hire' then
    raise exception 'This is a sale. Sold machines do not come back.' using errcode = 'check_violation';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'This hire is %. Only a paid hire can be returned.', v_order.status
      using errcode = 'check_violation';
  end if;
  if v_order.hire_returned_at is not null then
    raise exception 'These machines already came back on %.', to_char(v_order.hire_returned_at, 'DD Mon YYYY')
      using errcode = 'check_violation';
  end if;

  for v_line in
    select l.item_id, l.held_from_status, i.status as current_status
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id
    order by l.position, l.id
    for update of i
  loop
    v_items := v_items || v_line.item_id;
    v_back  := app.restore_status(v_line.current_status, v_line.held_from_status);

    if v_line.current_status = 'reserved' and v_back <> v_line.current_status then
      update public.items set status = v_back where id = v_line.item_id;
    end if;

    v_restore := v_restore || jsonb_build_object(
      'item_id', v_line.item_id,
      'status',  case when v_line.current_status = 'reserved' then v_back else v_line.current_status end
    );
  end loop;

  update public.orders
     set hire_returned_at = now()
   where id = p_order_id;

  if v_order.lead_id is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (v_order.lead_id, 'note',
            v_order.code || ' · hire returned',
            (select auth.uid()));
  end if;

  return jsonb_build_object(
    'code',    v_order.code,
    'items',   to_jsonb(v_items),
    'restore', v_restore
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- issue_invoice — restated from 20260820110000_a_document_to_hand_the_customer.sql
-- ---------------------------------------------------------------------------
-- On a hire, each line is the machine's hire fee for the period, quantity one,
-- and there is no adjustment line: nothing was negotiated off anything. The
-- document gains a `hire` block with the dates and the day count, which the
-- renderer prints under the machines. Everything else is unchanged.
create or replace function public.issue_invoice(
  p_order_id uuid,
  p_kind     text,
  p_issuer   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order      public.orders%rowtype;
  v_lead       public.leads%rowtype;
  v_days       integer;
  v_lines      jsonb;
  v_count      integer;
  v_subtotal   bigint;
  v_agreed     bigint;
  v_adjustment bigint;
  v_delivery   jsonb;
  v_hire       jsonb;
  v_fee        bigint;
  v_total      bigint;
  v_number     text;
  v_supersedes uuid;
  v_terms      integer;
  v_issued     timestamptz := now();
  v_document   jsonb;
  v_id         uuid;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('proforma', 'invoice') then
    raise exception '% is not a kind of document this issues.', coalesce(p_kind, '(nothing)')
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_issuer ->> 'legal_name'), '') = ''
     or coalesce(btrim(p_issuer ->> 'registration_number'), '') = ''
     or coalesce(btrim(p_issuer ->> 'address'), '') = '' then
    raise exception
      'The business details for the invoice are not configured. Set BUSINESS_LEGAL_NAME, BUSINESS_REGISTRATION_NUMBER and BUSINESS_TRADING_ADDRESS.'
      using errcode = 'check_violation';
  end if;

  if p_issuer ->> 'registration_number' !~ '^[0-9]{4}/[0-9]{6}/[0-9]{2}$'
     or p_issuer ->> 'registration_number' ~ '^0{4}/0{6}/0{2}$' then
    raise exception
      'BUSINESS_REGISTRATION_NUMBER is not a CIPC registration number. It looks like 2026/328785/07, and it must be this company''s own.'
      using errcode = 'check_violation';
  end if;

  if p_issuer ? 'vat_number' then
    raise exception
      'This system issues invoices, not tax invoices, and cannot show VAT. Registering for VAT means recalculating sales already recorded — do that work before setting a VAT number.'
      using errcode = 'feature_not_supported';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;

  if v_order.status = 'void' then
    raise exception 'This sale was cancelled. There is nothing to invoice.'
      using errcode = 'check_violation';
  end if;

  if p_kind = 'invoice' and v_order.status <> 'paid' then
    raise exception 'Record the payment first. Until then it is a proforma, not an invoice.'
      using errcode = 'check_violation';
  end if;
  if p_kind = 'proforma' and v_order.status <> 'draft' then
    raise exception 'This order is already paid. Issue the invoice instead.'
      using errcode = 'check_violation';
  end if;

  if v_order.lead_id is null then
    raise exception 'An invoice needs somebody to be addressed to. Put the customer on the order first.'
      using errcode = 'check_violation';
  end if;

  select * into v_lead from public.leads where id = v_order.lead_id;

  if v_order.kind = 'hire' then
    v_days := app.hire_days(v_order.hire_start, v_order.hire_end);
    if v_days is null then
      raise exception 'A hire needs the day it goes out and the day it comes back before it can be invoiced.'
        using errcode = 'check_violation';
    end if;

    select
      jsonb_agg(
        jsonb_build_object(
          'code',        i.sku,
          'description', btrim(concat_ws(' ', i.brand, i.title))
                         || ' · hire, ' || v_days || ' day' || case when v_days = 1 then '' else 's' end
                         || ' at R' || round(public.hire_daily_rate_cents(l.list_price_cents) / 100.0)::bigint || '/day',
          'qty',         1,
          'unit_cents',  public.hire_fee_cents(l.list_price_cents, v_days),
          'total_cents', public.hire_fee_cents(l.list_price_cents, v_days)
        )
        order by l.position, l.id
      ),
      count(*),
      coalesce(sum(public.hire_fee_cents(l.list_price_cents, v_days)), 0)
    into v_lines, v_count, v_subtotal
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id;

    v_hire := jsonb_build_object('start', v_order.hire_start, 'end', v_order.hire_end, 'days', v_days);
  else
    select
      jsonb_agg(
        jsonb_build_object(
          'code',        i.sku,
          'description', btrim(concat_ws(' ', i.brand, i.title)),
          'qty',         1,
          'unit_cents',  l.list_price_cents,
          'total_cents', l.list_price_cents
        )
        order by l.position, l.id
      ),
      count(*),
      coalesce(sum(l.list_price_cents), 0)
    into v_lines, v_count, v_subtotal
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id;

    v_hire := null;
  end if;

  if coalesce(v_count, 0) = 0 then
    raise exception 'There are no machines on this order to invoice.'
      using errcode = 'check_violation';
  end if;

  v_agreed     := coalesce(v_order.sold_total_cents, v_subtotal);
  v_adjustment := v_agreed - v_subtotal;
  v_fee        := v_order.delivery_fee_cents;
  v_total      := v_agreed + v_fee;

  if v_order.sold_total_cents is not null and v_total <> v_order.charged_total_cents then
    raise exception
      'The invoice total (%) does not match what the order says the customer pays (%). Refusing to issue.',
      v_total, v_order.charged_total_cents
      using errcode = 'check_violation';
  end if;

  v_delivery := case
    when v_order.delivery then jsonb_build_object(
      'address',   v_order.delivery_address,
      'km',        v_order.delivery_km,
      'fee_cents', v_fee
    )
    else null
  end;

  v_terms := greatest(coalesce((p_issuer ->> 'terms_days')::integer, 0), 0);

  v_number := app.next_document_number(p_kind);

  select id into v_supersedes
  from public.order_invoices
  where order_id = p_order_id and kind = p_kind
  order by issued_at desc, number desc
  limit 1;

  v_document := jsonb_build_object(
    'kind',       p_kind,
    'number',     v_number,
    'issued_at',  v_issued,
    'due_at',     case
                    when p_kind = 'invoice' then coalesce(v_order.paid_at, v_issued)
                    else v_issued + make_interval(days => v_terms)
                  end,
    'order_code', v_order.code,
    'issuer',     p_issuer,
    'customer',   jsonb_build_object(
                    'name',     v_lead.full_name,
                    'business', v_lead.business_name,
                    'phone',    v_lead.phone,
                    'email',    v_lead.email,
                    'address',  v_lead.billing_address
                  ),
    'lines',      v_lines,
    'hire',       v_hire,
    'note',       nullif(btrim(coalesce(v_order.notes, '')), ''),
    'subtotal_cents',   v_subtotal,
    'adjustment_cents', v_adjustment,
    'delivery',         v_delivery,
    'total_cents',      v_total,
    'payment',    case
                    when v_order.status = 'paid' then jsonb_build_object(
                      'method',    v_order.payment_method,
                      'reference', v_order.payment_reference,
                      'paid_at',   v_order.paid_at
                    )
                    else null
                  end
  );

  insert into public.order_invoices (order_id, kind, number, document, total_cents, supersedes, issued_by)
  values (p_order_id, p_kind, v_number, v_document, v_total, v_supersedes, (select auth.uid()))
  returning id into v_id;

  insert into public.lead_events (lead_id, kind, body, actor_id)
  values (
    v_order.lead_id,
    'note',
    v_number || ' issued for ' || v_order.code
      || ' · R' || round(v_total / 100.0)::bigint
      || case when p_kind = 'proforma' then ' · awaiting payment' else '' end,
    (select auth.uid())
  );

  return jsonb_build_object(
    'id',          v_id,
    'number',      v_number,
    'kind',        p_kind,
    'total_cents', v_total,
    'supersedes',  v_supersedes
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.confirm_hire_paid(uuid, public.payment_method, text) from public, anon;
revoke all on function public.return_hire(uuid)                                    from public, anon;
grant execute on function public.confirm_hire_paid(uuid, public.payment_method, text) to authenticated;
grant execute on function public.return_hire(uuid)                                    to authenticated;
