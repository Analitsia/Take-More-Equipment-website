alter table public.orders add column purchase_option text check (purchase_option in ('immediate','layby','reservation','hire','payjustnow','asset_finance'));
update public.orders set purchase_option=case when kind='hire' then 'hire' when payment_method='payjustnow' then 'payjustnow' else sale_plan end;

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

    -- Draft quotes may change modality without releasing their stock holds.
    if new.kind is distinct from old.kind
       and (old.status <> 'draft' or old.sold_by is not null or old.plan_confirmed_at is not null) then
      raise exception 'A confirmed order cannot change purchase option.' using errcode = 'check_violation';
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

create function public.choose_purchase_option(p_order_id uuid, p_option text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  if p_option is null or p_option not in ('immediate','layby','reservation','hire','payjustnow','asset_finance') then
    raise exception 'Choose a purchase option.';
  end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status<>'draft' or o.sold_by is not null or o.plan_confirmed_at is not null
     or exists(select 1 from public.order_receipts where order_id=p_order_id) then
    raise exception 'This order cannot change its purchase option.';
  end if;
  if o.lead_id is null or not exists(select 1 from public.order_lines where order_id=p_order_id) then
    raise exception 'Add items and a customer first.';
  end if;
  perform app.refuse_unsellable_lines(p_order_id);
  update public.orders set
    kind=case when p_option='hire' then 'hire' else 'sale' end,
    sale_plan=case when p_option='hire' then null when p_option='payjustnow' then 'immediate' else p_option end,
    purchase_option=p_option,
    payment_method=null,
    payment_reference=null,
    sold_total_cents=case when o.kind='sale' and p_option<>'hire' then o.sold_total_cents else null end,
    hire_start=null,hire_end=null,
    plan_start=null,plan_months=null,plan_payment_day=null,plan_deposit_cents=null,plan_final_due=null
  where id=p_order_id;
end $$;
revoke all on function public.choose_purchase_option(uuid,text) from public,anon;
grant execute on function public.choose_purchase_option(uuid,text) to authenticated;

create function app.guard_purchase_option() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.purchase_option is distinct from old.purchase_option
    and (old.status<>'draft' or old.sold_by is not null or old.plan_confirmed_at is not null) then
    raise exception 'A confirmed order cannot change purchase option.';
  end if;
  if new.purchase_option is not null and (
    (new.purchase_option='hire' and (new.kind<>'hire' or new.sale_plan is not null)) or
    (new.purchase_option<>'hire' and (new.kind<>'sale' or new.sale_plan is distinct from
      case when new.purchase_option='payjustnow' then 'immediate' else new.purchase_option end))
  ) then raise exception 'Purchase option and agreement terms must match.'; end if;
  if new.status='paid' and new.purchase_option='payjustnow' and new.payment_method<>'payjustnow' then
    raise exception 'Confirm the payment received from PayJustNow.';
  end if;
  return new;
end $$;
create trigger zz_guard_purchase_option before insert or update on public.orders for each row execute function app.guard_purchase_option();
revoke all on function app.guard_purchase_option() from public,anon,authenticated;
