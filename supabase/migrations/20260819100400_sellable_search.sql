-- The picker at the till.
--
-- A sibling of search_everything() rather than an argument on it, because the
-- two want opposite things and a boolean would eventually get the wrong
-- default. The command palette MUST find a sold machine — somebody is looking
-- up what a fryer went for last March. The till MUST NOT be able to add one.
-- One function each is two clear rules; one function with a flag is one rule
-- and a footgun.
--
-- The load-bearing parts are copied verbatim from 20260809090600: the
-- app.is_staff() guard, the two-character floor, unaccent, and the escaping
-- that stops a percent sign in a machine's title becoming a wildcard. What
-- differs is the filter, the ranking's first rung, and the columns — it returns
-- the prices the till needs so that adding a line is one round trip and not two.

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
  -- The code of a live order this machine is already on, if any. Returned
  -- rather than filtered out: a salesperson who cannot find a machine assumes
  -- the search is broken, whereas one who sees "on ORD-0009" knows to go and
  -- ask. add_order_line() is what actually refuses it.
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
      nullif(concat_ws(' ', i.brand, i.model), ''),
      nullif(i.location_code, '')
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
      and (p_order_id is null or o.id <> p_order_id)
    limit 1
  ) live on true
  where i.deleted_at is null
    -- Anything not already sold. A machine still in the workshop is a machine
    -- somebody can walk in and buy, and refusing that would be the software
    -- disagreeing with the business.
    and i.status <> 'sold'
    and (
      (v_code is not null and i.sku = v_code)
      or lower(extensions.unaccent(i.sku))                  like v_like escape '\'
      or lower(extensions.unaccent(i.title))                like v_like escape '\'
      or lower(extensions.unaccent(coalesce(i.brand, '')))  like v_like escape '\'
      or lower(extensions.unaccent(coalesce(i.model, '')))  like v_like escape '\'
      or lower(coalesce(i.location_code, ''))               like v_like escape '\'
    )
  order by 9, 3
  limit v_limit;
end;
$$;

comment on function public.search_sellable_items(text, integer, uuid) is
  'The order screen''s product picker. Everything not already sold, ranked with '
  'an exact code first. SECURITY INVOKER, so items RLS applies unchanged.';

revoke all on function public.search_sellable_items(text, integer, uuid) from public, anon;
grant execute on function public.search_sellable_items(text, integer, uuid) to authenticated;
