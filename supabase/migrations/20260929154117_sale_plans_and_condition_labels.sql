-- Existing A/B/C values retain their meaning; New sorts above Like New.
alter type public.condition_grade add value if not exists 'N' before 'A';
alter type public.payment_method add value if not exists 'payjustnow';

alter table public.orders
  add column sale_plan text check (sale_plan in ('immediate','layby','reservation','asset_finance')),
  add column plan_start date,
  add column plan_months integer check (plan_months in (2,3)),
  add column plan_payment_day integer check (plan_payment_day between 1 and 31),
  add column plan_deposit_cents bigint check (plan_deposit_cents >= 0),
  add column plan_final_due date,
  add column plan_confirmed_at timestamptz;
-- Existing orders predate the mandatory choice. New drafts have no default.
update public.orders set sale_plan='immediate' where kind='sale';

create table public.order_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  entry_kind text not null check (entry_kind in ('payment','refund')),
  method public.payment_method not null,
  reference text not null check (length(btrim(reference)) > 0),
  received_on date not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  request_id uuid not null unique
);
alter table public.order_receipts enable row level security;
revoke all on public.order_receipts from public, anon, authenticated;
grant select on public.order_receipts to authenticated;
create policy "staff read receipts" on public.order_receipts for select to authenticated using (app.is_staff());
create index order_receipts_order_idx on public.order_receipts(order_id);

-- Enforce the rules even for direct API calls and the existing sale RPCs.
create function app.guard_sale_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare paid bigint;
begin
  if tg_op='DELETE' then
    if old.plan_confirmed_at is not null then raise exception 'Cancel this agreement instead of deleting its history.'; end if;
    return old;
  end if;
  if new.kind='hire' then
    if new.sale_plan is not null and (tg_op='INSERT' or old.kind='hire') then raise exception 'Sale terms do not apply to a hire.'; end if;
    new.sale_plan:=null;
  end if;
  if tg_op='UPDATE' and old.plan_confirmed_at is not null then
    if row(new.sale_plan,new.plan_start,new.plan_months,new.plan_payment_day,new.plan_deposit_cents,new.plan_final_due,new.plan_confirmed_at,new.sold_total_cents,new.lead_id,new.kind)
      is distinct from row(old.sale_plan,old.plan_start,old.plan_months,old.plan_payment_day,old.plan_deposit_cents,old.plan_final_due,old.plan_confirmed_at,old.sold_total_cents,old.lead_id,old.kind) then
      raise exception 'Confirmed terms are fixed. Cancel and create a new agreement to change them.';
    end if;
    if new.status='draft' and new.delivery_fee_cents is distinct from old.delivery_fee_cents then
      select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0) into paid from public.order_receipts where order_id=new.id;
      if paid>0 and new.sold_total_cents+new.delivery_fee_cents<=paid then raise exception 'The revised total must stay above money already received. Cancel and correct the agreement if a refund is needed.'; end if;
    end if;
    if old.status='paid' and new.status='draft' then raise exception 'A paid payment plan cannot be reopened. Cancel it and retain the payment history.'; end if;
  end if;
  if new.kind='sale' and new.status='paid' then
    if new.sale_plan is null then raise exception 'Choose the sale terms first.'; end if;
    if new.sale_plan<>'immediate' then
      select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0) into paid from public.order_receipts where order_id=new.id;
      if new.plan_confirmed_at is null or paid<>new.sold_total_cents+new.delivery_fee_cents then
        raise exception 'Record the actual payments until the outstanding balance is zero.';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger zz_guard_sale_plan before insert or update or delete on public.orders for each row execute function app.guard_sale_plan();

create function app.guard_plan_lines() returns trigger language plpgsql security definer set search_path='' as $$
declare oid uuid; confirmed timestamptz;
begin
  oid:=case when tg_op='INSERT' then new.order_id else old.order_id end;
  select plan_confirmed_at into confirmed from public.orders where id=oid for update;
  if confirmed is not null and (tg_op<>'UPDATE' or row(new.order_id,new.item_id,new.list_price_cents,new.retail_price_cents,new.position) is distinct from row(old.order_id,old.item_id,old.list_price_cents,old.retail_price_cents,old.position)) then
    raise exception 'Items on a confirmed payment plan are fixed. Cancel the agreement to release them.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_plan_lines before insert or update or delete on public.order_lines for each row execute function app.guard_plan_lines();

create function public.save_sale_plan(p_order_id uuid,p_plan text,p_total bigint default null,p_start date default null,p_months integer default null,p_day integer default null,p_deposit bigint default null,p_due date default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; final_date date;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.kind<>'sale' or o.status<>'draft' or o.plan_confirmed_at is not null then raise exception 'This sale cannot change its terms.'; end if;
  if p_plan not in ('immediate','layby','reservation','asset_finance') or p_plan is null then raise exception 'Choose the sale terms.'; end if;
  if p_plan='immediate' then
    update public.orders set sale_plan=p_plan,plan_start=null,plan_months=null,plan_payment_day=null,plan_deposit_cents=null,plan_final_due=null where id=p_order_id;
    return;
  end if;
  if o.lead_id is null or not exists(select 1 from public.order_lines where order_id=p_order_id) then raise exception 'Add a customer and items first.'; end if;
  perform app.refuse_unsellable_lines(p_order_id);
  if p_total is null or p_total<=0 or p_start is null or p_start>(now() at time zone 'Africa/Johannesburg')::date then raise exception 'Enter a positive agreed price and a start date no later than today.'; end if;
  if p_deposit is null or p_deposit<0 or p_deposit>=p_total+o.delivery_fee_cents then raise exception 'The initial payment must be below the total. Use a normal sale for payment in full.'; end if;
  if p_plan='layby' then
    if p_months is null or p_months not in (2,3) or p_day is null or p_day not between 1 and 31 then raise exception 'Choose two or three months and a payment day.'; end if;
    final_date := (date_trunc('month',p_start)+make_interval(months=>p_months))::date;
    final_date := final_date + (least(p_day,extract(day from (final_date+interval '1 month - 1 day'))::integer)-1);
  elsif p_plan='reservation' then
    if p_deposit<>ceil(p_total/2.0) then raise exception 'A seven-day reservation requires a 50%% deposit.'; end if;
    final_date:=p_start+7;
  else
    if p_due is null or p_due<p_start then raise exception 'Enter the agreed final payment date.'; end if;
    final_date:=p_due;
  end if;
  update public.orders set sale_plan=p_plan,sold_total_cents=p_total,plan_start=p_start,
    plan_months=case when p_plan='layby' then p_months end,
    plan_payment_day=case when p_plan='layby' then p_day end,
    plan_deposit_cents=p_deposit,plan_final_due=final_date,plan_confirmed_at=now()
    where id=p_order_id;
end $$;

create function public.record_order_receipt(p_order_id uuid,p_amount bigint,p_method public.payment_method,p_reference text,p_date date,p_request_id uuid,p_refund boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; net bigint; result jsonb; previous public.order_receipts%rowtype;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  select * into previous from public.order_receipts where request_id=p_request_id;
  if found then
    if previous.order_id<>p_order_id or previous.amount_cents<>p_amount or previous.method<>p_method or previous.reference<>btrim(p_reference) or previous.received_on<>p_date or (previous.entry_kind='refund')<>p_refund then raise exception 'This request was already used for a different payment.'; end if;
    return jsonb_build_object('code',o.code,'items','[]'::jsonb);
  end if;
  if o.plan_confirmed_at is null then raise exception 'Confirm the sale terms first.'; end if;
  if p_refund is null or p_amount is null or p_amount<=0 or p_method is null or coalesce(btrim(p_reference),'')='' or p_request_id is null or p_date is null or p_date<o.plan_start or p_date>(now() at time zone 'Africa/Johannesburg')::date then raise exception 'Enter the actual amount, method, reference and payment date.'; end if;
  select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0) into net from public.order_receipts where order_id=p_order_id;
  if p_refund then
    if o.status<>'void' or p_amount>net then raise exception 'Refunds are recorded against cancelled plans, up to the amount received.'; end if;
  else
    if o.status<>'draft' or p_amount>o.charged_total_cents-net then raise exception 'This payment exceeds the outstanding balance or the order is closed.'; end if;
    perform app.refuse_unsellable_lines(p_order_id);
  end if;
  insert into public.order_receipts(order_id,amount_cents,entry_kind,method,reference,received_on,recorded_by,request_id)
    values(p_order_id,p_amount,case when p_refund then 'refund' else 'payment' end,p_method,btrim(p_reference),p_date,auth.uid(),p_request_id);
  if not p_refund and net+p_amount=o.charged_total_cents then
    result:=public.confirm_order_paid(p_order_id,o.sold_total_cents,p_method,p_reference);
  else
    result:=jsonb_build_object('code',o.code,'items','[]'::jsonb);
  end if;
  return result;
end $$;
revoke all on function public.save_sale_plan(uuid,text,bigint,date,integer,integer,bigint,date) from public,anon;
revoke all on function public.record_order_receipt(uuid,bigint,public.payment_method,text,date,uuid,boolean) from public,anon;
grant execute on function public.save_sale_plan(uuid,text,bigint,date,integer,integer,bigint,date) to authenticated;
grant execute on function public.record_order_receipt(uuid,bigint,public.payment_method,text,date,uuid,boolean) to authenticated;

-- Only the validating RPC can set plan terms; ordinary draft edits retain
-- their existing column permissions and RLS rules.
revoke insert, update on public.orders from authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name),',') into cols
  from information_schema.columns where table_schema='public' and table_name='orders'
    and column_name not in ('sale_plan','plan_start','plan_months','plan_payment_day','plan_deposit_cents','plan_final_due','plan_confirmed_at');
  execute 'grant insert ('||cols||'), update ('||cols||') on public.orders to authenticated';
end $$;

revoke all on function app.guard_sale_plan() from public, anon, authenticated;
revoke all on function app.guard_plan_lines() from public, anon, authenticated;
