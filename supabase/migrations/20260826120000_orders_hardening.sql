-- Orders hardening — the day before real salespeople start using the till.
--
-- Five things an audit found, each of them a way for two people at two phones
-- to leave the record wrong without either of them seeing an error.
--
-- ── 1. Taking a machine off an order that is no longer open ───────────────
--
-- removeLine() in the ops app deleted the line through the "staff manage draft
-- lines" policy and then put the machine back on the shelf. On a PAID order the
-- policy matches no rows, the delete "succeeds" with nothing deleted, and the
-- app carried on: the machine was un-sold and re-published while the order
-- still said it was paid for. remove_order_line() below does the whole thing in
-- one transaction under a row lock and raises a sentence when the order has
-- moved on — the same shape as add_order_line(), which is its other half.
--
-- ── 2. Reopening a hire that has already come back ────────────────────────
--
-- reopen_order() checked the status and nothing else. A returned hire is paid,
-- so it passed, and the update then tripped orders_returned_means_paid with a
-- constraint name on the screen. Its machines are back in stock and possibly
-- on another order by now; the right answer is to refuse, in words.
--
-- ── 3. Two invoice numbers for one document ───────────────────────────────
--
-- issue_invoice() minted a new number on every call, and the second call
-- superseded the first. Two taps on "Make the invoice" — a slow connection, a
-- double-tap on a phone — produced INV-0015 and INV-0016 for the same sale,
-- identical to the cent, with the customer holding whichever one went out
-- first. Now the document is built FIRST and compared with the latest one of
-- its kind for the order; if nothing on it has changed, that row is returned
-- and no number is spent. A number is only ever minted for a document that
-- says something different.
--
-- ── 4. Cents on a hire ────────────────────────────────────────────────────
--
-- A hire rate is 4 % of the asking price and very often has cents in it
-- (R1 234.50 → R49.38 a day). The line description rounded that to whole
-- rands, so the words on the invoice disagreed with the figures beside them.
-- app.rands_text() prints cents only when there are any, and every sentence
-- that quotes money in these functions goes through it.
--
-- ── 5. A machine sold by hand while it sat on an order ────────────────────
--
-- confirm_hire_paid() re-checked for a clash with another PAID order, but a
-- machine whose stage was changed to Sold by hand while the hire was open, or
-- one soft-deleted in the meantime, was not on any other order and slipped
-- through — skipped by the "leave it where they put it" branch and sent out
-- on a paid hire. confirm_order_paid() had the same gap: it would have
-- re-sold it. Both now stop on that line and name the machine.


-- ---------------------------------------------------------------------------
-- Money, in words
-- ---------------------------------------------------------------------------
-- 'R400' for a whole number of rands, 'R1234.50' otherwise. No thousands
-- grouping: this is for a line description and a timeline note, where a space
-- inside a number reads as two numbers.
create or replace function app.rands_text(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_cents is null then 'R0'
    when p_cents % 100 = 0 then 'R' || (p_cents / 100)::text
    else 'R' || (abs(p_cents) / 100)::text || '.' || lpad((abs(p_cents) % 100)::text, 2, '0')
  end
$$;

grant execute on function app.rands_text(bigint) to authenticated;


-- ---------------------------------------------------------------------------
-- remove_order_line — take a machine off, and put it back where it was
-- ---------------------------------------------------------------------------
-- The mirror of add_order_line(). Locks the order, insists it is still open,
-- deletes the line and restores the machine to the stage the line remembered,
-- through app.restore_status() exactly as void_order() and return_hire() do.
--
-- published_at is NOT set here, for the reason those two give: the publish
-- gate fires before the status trigger, so re-publishing is a second write the
-- ops app does through setStage(), which also re-runs the lead matcher for a
-- machine that has just become available again.
create or replace function public.remove_order_line(
  p_order_id uuid,
  p_item_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.orders%rowtype;
  v_held    public.item_status;
  v_current public.item_status;
  v_back    public.item_status;
  v_sku     text;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'This order is no longer open. It is %, and its machines stay where they are.', v_order.status
      using errcode = 'check_violation';
  end if;

  select l.held_from_status, i.status, i.sku
    into v_held, v_current, v_sku
  from public.order_lines l
  join public.items i on i.id = l.item_id
  where l.order_id = p_order_id and l.item_id = p_item_id
  for update of i;

  if not found then
    raise exception 'That machine is not on this order.' using errcode = 'no_data_found';
  end if;

  delete from public.order_lines where order_id = p_order_id and item_id = p_item_id;

  -- Only a machine this order is still holding goes anywhere. One that somebody
  -- moved to the workshop by hand while the order was open is left where they
  -- put it.
  v_back := case
    when v_current = 'reserved' then app.restore_status(v_current, v_held)
    else v_current
  end;

  if v_current = 'reserved' and v_back <> v_current then
    update public.items set status = v_back where id = p_item_id;
  end if;

  return jsonb_build_object(
    'code',    v_order.code,
    'item_id', p_item_id,
    'sku',     v_sku,
    'status',  v_back
  );
end;
$$;

revoke all on function public.remove_order_line(uuid, uuid) from public, anon;
grant execute on function public.remove_order_line(uuid, uuid) to authenticated;

comment on function public.remove_order_line(uuid, uuid) is
  'The other half of add_order_line(): takes a machine off an OPEN order and '
  'puts it back in the stage the line remembered. Refuses, in words, once the '
  'order has been paid or cancelled.';


-- ---------------------------------------------------------------------------
-- reopen_order — restated from 20260819100300_order_rpcs.sql
-- ---------------------------------------------------------------------------
-- One check added: a returned hire stays closed.
create or replace function public.reopen_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_items uuid[];
begin
  if not app.at_least('manager') then
    raise exception 'Reopening a paid order needs the manager role.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Only a paid order can be reopened. This one is %.', v_order.status
      using errcode = 'check_violation';
  end if;
  -- Its machines are back in stock — and may be on somebody else's order by
  -- now. Reopening would hold them again for dates that have passed.
  if v_order.hire_returned_at is not null then
    raise exception 'A returned hire cannot be reopened. Its machines are already back in stock.'
      using errcode = 'check_violation';
  end if;

  select array_agg(item_id) into v_items
  from public.order_lines where order_id = p_order_id;

  update public.items
     set status = 'reserved'
   where id = any(coalesce(v_items, '{}'::uuid[]))
     and status = 'sold';

  update public.order_lines set sold_price_cents = null where order_id = p_order_id;

  update public.orders
     set status            = 'draft',
         sold_total_cents  = null,
         payment_method    = null,
         payment_reference = null,
         paid_at           = null
   where id = p_order_id;

  if v_order.lead_id is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      v_order.lead_id,
      'note',
      v_order.code || ' reopened to correct the amount — it was '
        || app.rands_text(coalesce(v_order.sold_total_cents, 0)),
      (select auth.uid())
    );
  end if;

  return jsonb_build_object('code', v_order.code, 'items', to_jsonb(coalesce(v_items, '{}'::uuid[])));
end;
$$;


-- ---------------------------------------------------------------------------
-- issue_invoice — restated from 20260826090000_a_machine_can_be_hired.sql
-- ---------------------------------------------------------------------------
-- Two changes. The document is compared with the latest one of its kind before
-- a number is minted, and returned as-is when nothing on it differs — see the
-- header. And the hire line description prints cents when the rate has them.
--
-- "Nothing differs" means the whole frozen document apart from the three
-- fields that are always new — number, issued_at, due_at. That is stricter
-- than comparing totals, on purpose: a corrected phone number or a renamed
-- machine IS a different piece of paper, and the customer should get it.
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
  v_latest     public.order_invoices%rowtype;
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
                         || ' at ' || app.rands_text(public.hire_daily_rate_cents(l.list_price_cents)) || '/day',
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

  -- Everything that is a fact about the sale, and nothing that is a fact about
  -- this particular issuing. The number and the dates are added once it is
  -- known that a new document is actually needed.
  v_document := jsonb_build_object(
    'kind',       p_kind,
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

  select * into v_latest
  from public.order_invoices
  where order_id = p_order_id and kind = p_kind
  order by issued_at desc, number desc
  limit 1;

  -- The same document already exists. Hand it back rather than minting a
  -- twin: a second number for an identical piece of paper is exactly what an
  -- accountant reading the invoice run cannot explain.
  if v_latest.id is not null
     and v_latest.total_cents = v_total
     and (v_latest.document - 'number' - 'issued_at' - 'due_at') = v_document then
    return jsonb_build_object(
      'id',          v_latest.id,
      'number',      v_latest.number,
      'kind',        p_kind,
      'total_cents', v_latest.total_cents,
      'supersedes',  null,
      'reused',      true
    );
  end if;

  v_supersedes := v_latest.id;
  v_number     := app.next_document_number(p_kind);

  v_document := v_document || jsonb_build_object(
    'number',    v_number,
    'issued_at', v_issued,
    'due_at',    case
                   when p_kind = 'invoice' then coalesce(v_order.paid_at, v_issued)
                   else v_issued + make_interval(days => v_terms)
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
      || ' · ' || app.rands_text(v_total)
      || case when p_kind = 'proforma' then ' · awaiting payment' else '' end,
    (select auth.uid())
  );

  return jsonb_build_object(
    'id',          v_id,
    'number',      v_number,
    'kind',        p_kind,
    'total_cents', v_total,
    'supersedes',  v_supersedes,
    'reused',      false
  );
end;
$$;

comment on function public.issue_invoice(uuid, text, jsonb) is
  'Freezes one order into one document. The only writer of order_invoices. '
  'Returns the existing document, and mints no number, when nothing on it '
  'would differ from the latest one of its kind. Refuses an unconfigured or '
  'placeholder issuer, and any issuer carrying a VAT number.';


-- ---------------------------------------------------------------------------
-- The machine that was sold by hand — one check, used by both payment RPCs
-- ---------------------------------------------------------------------------
-- Called under the FOR UPDATE lock the callers already take on their lines
-- and items, so what it sees is what will be written.
create or replace function app.refuse_unsellable_lines(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sku     text;
  v_deleted boolean;
begin
  select i.sku, i.deleted_at is not null
    into v_sku, v_deleted
  from public.order_lines l
  join public.items i on i.id = l.item_id
  where l.order_id = p_order_id
    and (i.status = 'sold' or i.deleted_at is not null)
  order by l.position, l.id
  limit 1;

  if found then
    if v_deleted then
      raise exception '% has been deleted — take it off this order first.', v_sku
        using errcode = 'check_violation';
    else
      raise exception '% has been sold — take it off this order first.', v_sku
        using errcode = 'check_violation';
    end if;
  end if;
end;
$$;

grant execute on function app.refuse_unsellable_lines(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- confirm_order_paid — restated from 20260826090000_a_machine_can_be_hired.sql
-- ---------------------------------------------------------------------------
-- One line added, under the lock: a machine already sold or deleted stops the
-- sale and is named.
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

  perform app.refuse_unsellable_lines(p_order_id);

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
      || ' · ' || app.rands_text(p_sold_total_cents + v_order.delivery_fee_cents)
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
-- confirm_hire_paid — restated from 20260826090000_a_machine_can_be_hired.sql
-- ---------------------------------------------------------------------------
-- The "leave it where they put it" branch used to swallow a machine that had
-- been sold by hand. Now that is a refusal, before any line is written.
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

  perform app.refuse_unsellable_lines(p_order_id);

  for v_line in
    select l.id, l.item_id, l.list_price_cents, i.status
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id
    order by l.position, l.id
  loop
    v_fee   := public.hire_fee_cents(v_line.list_price_cents, v_days);
    v_total := v_total + v_fee;

    update public.order_lines set sold_price_cents = v_fee where id = v_line.id;

    -- Held, and stays held. A machine somebody moved to the workshop by hand
    -- while the order was open is left where they put it; a sold one was
    -- refused above.
    if v_line.status <> 'reserved' then
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

  insert into public.lead_events (lead_id, kind, body, item_id, actor_id)
  values (
    v_order.lead_id,
    'note',
    v_order.code || ' · hire · ' || v_lines || ' machine' || case when v_lines = 1 then '' else 's' end
      || ' · ' || v_days || ' day' || case when v_days = 1 then '' else 's' end
      || ' · ' || app.rands_text(v_total + v_order.delivery_fee_cents)
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
    'days',                v_days,
    'sold_total_cents',    v_total,
    'delivery_fee_cents',  v_order.delivery_fee_cents,
    'charged_total_cents', v_total + v_order.delivery_fee_cents
  );
end;
$$;
