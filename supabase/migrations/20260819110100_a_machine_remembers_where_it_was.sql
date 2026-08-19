-- A machine that comes off an order goes back where it came from.
--
-- Putting a machine on an order marks it `reserved` and takes it off the
-- website, which is right — somebody is standing next to it. Taking it back off
-- put it in `listed`, always, because nothing remembered anything else. So:
--
--   A fryer is IN THE WORKSHOP, half stripped. A customer sees it and wants it.
--   The salesperson adds it to an order. The sale falls through. The fryer is
--   now "For sale" on the board, while still in pieces on the bench.
--
-- The customer never sees it — the publish gate refuses a machine with no
-- photograph — so this was never a wrong price or a wrong promise. It was the
-- board lying to the workshop, which is the sort of thing that gets fixed by
-- somebody noticing, until the day nobody notices.
--
-- The fix is one column. The line remembers what the machine was doing when it
-- was picked up, and every path that puts it back reads that instead of
-- guessing: removeLine() and discardOrder() in the ops app, and void_order()
-- here.
--
-- reopen_order() is deliberately NOT changed. It puts machines back to
-- `reserved` because the customer is still buying and only the amount was
-- wrong — that is a different question from "this sale is not happening", and
-- it already has the right answer.


-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Nullable, and every reader coalesces to 'listed'. Lines written before today
-- genuinely do not know, and 'listed' is what they would have got anyway, so
-- the old behaviour is the fallback rather than an error.
alter table public.order_lines
  add column if not exists held_from_status public.item_status;

comment on column public.order_lines.held_from_status is
  'What the machine was doing before this line reserved it. Written by '
  'add_order_line(), read by void_order() and by the ops app when a line is '
  'removed. Null on lines written before 20260819110100 — readers fall back to '
  '''listed'', which is what those lines used to get unconditionally.';


-- ---------------------------------------------------------------------------
-- Where to put a machine back, safely
-- ---------------------------------------------------------------------------
-- app.enforce_status_transition() refuses any edge that is not in
-- item_status_transitions, and the enum still carries three values from before
-- the four-stage model ('intake', 'ready', 'handed_over') that have no rows
-- there. A machine sitting in one of those and remembered as such would make
-- cancelling an order raise instead of cancelling it.
--
-- So the remembered status is a preference, not an instruction: if the edge is
-- not legal from where the machine is now, it goes to 'listed' as before. A
-- cancellation must never fail because of where a machine used to be.
create or replace function app.restore_status(
  p_current public.item_status,
  p_held    public.item_status
)
returns public.item_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_held is null                then 'listed'::public.item_status
    when p_held = p_current            then p_current
    when exists (
      select 1 from public.item_status_transitions t
      where t.from_status = p_current and t.to_status = p_held
    )                                  then p_held
    else 'listed'::public.item_status
  end
$$;

grant execute on function app.restore_status(public.item_status, public.item_status)
  to authenticated;


-- ---------------------------------------------------------------------------
-- add_order_line — now writes down where the machine was
-- ---------------------------------------------------------------------------
-- Restated in full from 20260819100300_order_rpcs.sql. The only differences are
-- the column in the INSERT and the two lines of comment above it; diff the two
-- files to see it.
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
  limit 1;

  if v_clash is not null then
    raise exception '% is already on order %.', v_item.sku, v_clash
      using errcode = 'unique_violation';
  end if;

  select coalesce(max(position), -1) + 1 into v_next
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    order_id, item_id, list_price_cents, retail_price_cents, position,
    -- Read from the row fetched BEFORE the update below, which is the whole
    -- point: after that statement the machine is `reserved` and there is
    -- nothing left to remember.
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
-- void_order — puts each machine back where it was
-- ---------------------------------------------------------------------------
-- Restated in full from 20260819100300_order_rpcs.sql. What changed:
--
--   * the blanket `set status = 'listed' where status = 'sold'` became a loop
--     that restores each line to app.restore_status(), and now also picks up
--     machines sitting in `reserved` — which is what an order that was never
--     paid leaves behind, and which the old version left for the ops app to
--     tidy up afterwards.
--   * the return carries `restore`, so the caller knows which stage to ask
--     setStage() for rather than assuming 'listed'.
--
-- `items` is still in the return, unchanged, because scripts/test-order-loop.mjs
-- and the ops app both read it.
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
  v_order   public.orders%rowtype;
  v_items   uuid[] := '{}';
  v_restore jsonb  := '[]'::jsonb;
  v_line    record;
  v_back    public.item_status;
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

  -- One pass, in line order, locking each machine as it goes.
  --
  -- sold -> anywhere is a legal edge at any approved account, and the status
  -- trigger NULLs BOTH sold_at and sale_price_cents on the way out of sold.
  -- That is not incidental — it is the fix 20260808100000 made deliberately,
  -- and it means the achieved price disappears with the sale that produced it
  -- and the money views correct themselves with no further code.
  --
  -- published_at is NOT set here. Setting it inside a definer function would
  -- sail past the publish gate, which fires before the status trigger; the
  -- server action re-publishes afterwards through setStage(), which knows the
  -- two-step dance and reports the machines that could not go back up.
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

    -- Only a machine this order is actually holding. One that somebody has
    -- since moved to the workshop by hand is left alone: they knew where it
    -- was, and this function did not.
    if v_line.current_status in ('sold', 'reserved') and v_back <> v_line.current_status then
      update public.items set status = v_back where id = v_line.item_id;
    end if;

    v_restore := v_restore || jsonb_build_object(
      'item_id', v_line.item_id,
      'status',  case
                   when v_line.current_status in ('sold', 'reserved') then v_back
                   else v_line.current_status
                 end
    );
  end loop;

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

  return jsonb_build_object(
    'code',    v_order.code,
    'items',   to_jsonb(v_items),
    'restore', v_restore
  );
end;
$$;
