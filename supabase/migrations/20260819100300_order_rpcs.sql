-- The four things that can happen to an order.
--
-- All SECURITY DEFINER, and every one of them opens with an app.is_staff()
-- check. DEFINER bypasses RLS entirely, so that line is the only thing standing
-- between any signed-in user and the sales ledger — the same sentence
-- record_item_cost() writes about itself, and it is just as load-bearing here.
--
-- Why RPCs at all, when the policies would allow most of this directly: a sale
-- is several writes that are only correct together. Marking machines sold
-- without recording the money, or recording the money without marking the
-- machines, are both worse than refusing. One function, one transaction.
--
-- And why there is no partial-edit family — no set_order_total(), no
-- move_line_price() — is the same reason: exactly one code path in this system
-- is allowed to decide what a machine sold for, so there is exactly one place
-- to read when the number looks wrong.


-- ---------------------------------------------------------------------------
-- add_order_line — put a machine on the order and hold it
-- ---------------------------------------------------------------------------
-- Takes a code OR an id, because the two ways into the picker are typing `a42`
-- and clicking a row, and resolving the typed one in SQL means the refusal
-- ("no machine has that code") comes from the thing that knows, rather than
-- from a guess in the browser.
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

  -- Anything not already sold can be sold, including a machine still in the
  -- workshop — somebody sees it half-finished and wants it, and that is a real
  -- sale the system should not be in the way of.
  if v_item.status = 'sold' then
    raise exception '% has already been sold.', v_item.sku using errcode = 'check_violation';
  end if;

  -- The advisory half of "one machine, one sale". The binding half is the row
  -- lock in confirm_order_paid(); this exists so the salesperson finds out now
  -- rather than at the till.
  select o.code into v_clash
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where l.item_id = v_item.id
    and l.order_id <> p_order_id
    and o.status in ('draft', 'paid')
  limit 1;

  if v_clash is not null then
    raise exception '% is already on order %.', v_item.sku, v_clash
      using errcode = 'unique_violation';
  end if;

  select coalesce(max(position), -1) + 1 into v_next
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    order_id, item_id, list_price_cents, retail_price_cents, position
  ) values (
    p_order_id, v_item.id,
    coalesce(v_item.list_price_cents, 0),
    v_item.retail_price_cents,
    v_next
  );

  -- Held, and off the website in the same breath. A machine somebody is
  -- standing next to must stop being purchasable by a stranger on the internet
  -- immediately, not when the payment clears.
  --
  -- reserved_until stays null on purpose: it exists for a future auto-expiry
  -- job, and a machine a customer is looking at should not be released by a
  -- timer. Removing the line puts it back, and an abandoned draft is visible in
  -- the orders list, which is the intended way this gets noticed.
  update public.items
     set status = 'reserved', published_at = null
   where id = v_item.id
     and status <> 'reserved';

  return jsonb_build_object(
    'item_id', v_item.id,
    'sku',     v_item.sku,
    'title',   v_item.title
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- confirm_order_paid — the money has arrived
-- ---------------------------------------------------------------------------
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

  -- THE lock. Everything before this is advisory; this is what makes two
  -- salespeople settling the same machine at the same moment impossible rather
  -- than merely unlikely. FOR UPDATE with a join locks rows in both tables.
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

  -- Re-checked under the lock, because the draft-time check in add_order_line()
  -- was true when it ran and says nothing about now.
  select o.code into v_clash
  from public.order_lines l
  join public.order_lines l2 on l2.item_id = l.item_id and l2.order_id <> p_order_id
  join public.orders o on o.id = l2.order_id and o.status = 'paid'
  where l.order_id = p_order_id
  limit 1;

  if v_clash is not null then
    raise exception 'One of these machines was sold on order % a moment ago.', v_clash
      using errcode = 'unique_violation';
  end if;

  -- ── Allocation ────────────────────────────────────────────────────────────
  -- The discount was given on the order, but revenue is reported per machine,
  -- so the total has to be split. Pro-rata by asking price: a machine that was
  -- 60% of the ask carries 60% of the discount, which is the only split that
  -- leaves each unit's margin percentage recognisable.
  --
  -- floor() every line and put the remainder — at most (lines - 1) cents — on
  -- the last one, so the parts sum to the whole EXACTLY. A rounding scheme that
  -- can be a cent out is a dashboard that disagrees with a bank statement.
  for v_line in
    select id, item_id, list_price_cents
    from public.order_lines
    where order_id = p_order_id
    order by position, id
  loop
    v_index := v_index + 1;

    if v_index = v_lines then
      -- The last line absorbs whatever is left, which is also the whole answer
      -- in the common case of a single machine: no arithmetic, no rounding.
      v_alloc := p_sold_total_cents - v_running;
    elsif v_list_sum > 0 then
      v_alloc := (p_sold_total_cents * v_line.list_price_cents) / v_list_sum;
    else
      -- Nothing on the order had a price. Split it evenly rather than refuse —
      -- it is a legitimate state (a machine can be sold before it is priced)
      -- and the salesperson has already agreed a number with the customer.
      v_alloc := p_sold_total_cents / v_lines;
    end if;

    v_running := v_running + v_alloc;

    update public.order_lines set sold_price_cents = v_alloc where id = v_line.id;

    -- One statement, three facts. app.enforce_status_transition() validates the
    -- edge against item_status_transitions and stamps sold_at; it does not
    -- touch sale_price_cents on the way IN (only on the way out), so setting
    -- both here is safe.
    --
    -- Clearing published_at in the same statement is safe where SETTING it
    -- would not be: app.enforce_publish_requirements() short-circuits unless
    -- published_at is transitioning from null, which is exactly why setStage()
    -- has to do a publish as a separate write and does not have to do this one.
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

  -- One event for the order, not one per machine — a timeline is read by a
  -- person, and three lines saying the same thing on the same afternoon is
  -- noise. item_id is left null on a multi-line order rather than naming an
  -- arbitrary one of them.
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

  -- lead_status.customer means money changed hands. Until now nothing in the
  -- system could honestly set it, because nothing knew when that had happened.
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
-- void_order — it did not happen after all
-- ---------------------------------------------------------------------------
-- Left at `staff`, which contradicts a first instinct and is the position
-- 20260808100000_reversible_sale.sql already argued and adopted for un-selling
-- an item: a wrong number nobody can correct is worse than a correction anyone
-- can audit, and every void is stamped with an actor in activity_log. Making
-- undo cost more than do is how a record quietly stays wrong.
create or replace function public.void_order(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_items uuid[];
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why. A voided order with no reason is a number nobody can explain later.'
      using errcode = 'check_violation';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_order.status = 'void' then
    raise exception 'This order is already void.' using errcode = 'check_violation';
  end if;

  select array_agg(item_id) into v_items
  from public.order_lines where order_id = p_order_id;

  -- sold -> listed is a legal edge at the staff role, and the status trigger
  -- NULLs BOTH sold_at and sale_price_cents on the way out of sold. That is not
  -- incidental — it is the fix 20260808100000 made deliberately, and it means
  -- the achieved price disappears with the sale that produced it and the money
  -- views correct themselves with no further code.
  --
  -- published_at is NOT set here. Setting it inside a definer function would
  -- sail past the publish gate, which fires before the status trigger; the
  -- server action re-publishes afterwards through setStage(), which knows the
  -- two-step dance and reports the machines that could not go back up.
  update public.items
     set status = 'listed'
   where id = any(coalesce(v_items, '{}'::uuid[]))
     and status = 'sold';

  -- The quote was real, so list_price_cents stays. What it sold for did not
  -- happen, so that goes.
  update public.order_lines set sold_price_cents = null where order_id = p_order_id;

  update public.orders
     set status      = 'void',
         voided_at   = now(),
         void_reason = btrim(p_reason)
   where id = p_order_id;

  -- Appended, not corrected. lead_events has no update or delete policy at all
  -- by design, so the 'purchased' row stays and this sits underneath it — which
  -- is what actually happened, in the order it happened.
  if v_order.lead_id is not null and v_order.status = 'paid' then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (v_order.lead_id, 'note',
            v_order.code || ' voided: ' || btrim(p_reason),
            (select auth.uid()));
  end if;

  return jsonb_build_object('code', v_order.code, 'items', to_jsonb(coalesce(v_items, '{}'::uuid[])));
end;
$$;


-- ---------------------------------------------------------------------------
-- reopen_order — the total was typed wrong
-- ---------------------------------------------------------------------------
-- Manager and above, unlike void. Voiding says "this sale did not happen",
-- which is a fact anybody at the counter can know. Reopening says "it happened
-- for a different amount", which rewrites revenue that has already been
-- reported, and that is a different kind of act.
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

  select array_agg(item_id) into v_items
  from public.order_lines where order_id = p_order_id;

  -- Back to reserved rather than listed: the customer is still buying, the
  -- number was just wrong. The status trigger clears sold_at and
  -- sale_price_cents on the way out of sold, which is the point.
  update public.items
     set status = 'reserved'
   where id = any(coalesce(v_items, '{}'::uuid[]))
     and status = 'sold';

  update public.order_lines set sold_price_cents = null where order_id = p_order_id;

  -- Back to draft. The before-write trigger refuses paid -> draft while any
  -- machine on the order is still sold, and the un-sell above has already
  -- happened, so this passes — not because the function is trusted, but because
  -- the condition the trigger cares about is genuinely no longer true. Clearing
  -- the payment fields satisfies orders_draft_carries_no_payment in the same
  -- statement.
  update public.orders
     set status            = 'draft',
         sold_total_cents  = null,
         payment_method    = null,
         payment_reference = null,
         paid_at           = null
   where id = p_order_id;

  -- Say on the timeline that this happened.
  --
  -- Without it, re-confirming writes a SECOND 'purchased' entry identical to
  -- the first, and the customer's history reads as two sales of the same order
  -- — which is how a person ends up being told they bought a fryer twice. The
  -- entries cannot be removed (lead_events has no update or delete policy, by
  -- design), so the fix is to explain the second one rather than hide it.
  if v_order.lead_id is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      v_order.lead_id,
      'note',
      v_order.code || ' reopened to correct the amount — it was R'
        || round(coalesce(v_order.sold_total_cents, 0) / 100.0)::bigint,
      (select auth.uid())
    );
  end if;

  return jsonb_build_object('code', v_order.code, 'items', to_jsonb(coalesce(v_items, '{}'::uuid[])));
end;
$$;


revoke all on function public.add_order_line(uuid, text, uuid)                                    from public, anon;
revoke all on function public.confirm_order_paid(uuid, bigint, public.payment_method, text)       from public, anon;
revoke all on function public.void_order(uuid, text)                                              from public, anon;
revoke all on function public.reopen_order(uuid)                                                  from public, anon;

grant execute on function public.add_order_line(uuid, text, uuid)                                 to authenticated;
grant execute on function public.confirm_order_paid(uuid, bigint, public.payment_method, text)    to authenticated;
grant execute on function public.void_order(uuid, text)                                           to authenticated;
grant execute on function public.reopen_order(uuid)                                               to authenticated;
