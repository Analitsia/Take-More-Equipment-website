-- The shelf code goes away.
--
-- items.location_code was a free-text bin reference — "A2-01", "W-BAY-2" — that
-- three surfaces read and one form wrote. It was built on the assumption that
-- stock would be filed by shelf. It is not, and there is no plan to: machines
-- are found by walking the floor and reading the sticker, which is what the
-- short code and the printed label are for.
--
-- An optional column nobody fills is not free. It is a field on the edit form
-- that a new starter has to decide about, a fragment of every search subtitle
-- that has to be read past, and a second place a machine claims to be. Removed
-- rather than left blank, so there is nothing to half-maintain.
--
-- Nothing here was ever public: location_code was withheld from the anon column
-- grant in 20260807090300_items.sql, so no storefront page, feed or API
-- response loses a field. This is internal-only surface coming off.
--
-- Order matters below. Both search functions name the column in their bodies,
-- and a plpgsql body is not checked until it runs — so dropping the column
-- first would leave two functions that parse fine and fail on the next
-- keystroke in the search box. They are redefined first, then the column goes.


-- ---------------------------------------------------------------------------
-- The command palette
-- ---------------------------------------------------------------------------
-- Restated in full from 20260819090200_search_by_short_code.sql. Exactly one
-- line differs: the location_code branch of the item WHERE clause is gone. Diff
-- the two files to confirm it.

create or replace function public.search_everything(
  p_query text,
  p_limit integer default 12
)
returns table (
  kind     text,   -- 'item' | 'lead'
  id       uuid,
  title    text,   -- what to show on the first line
  subtitle text,   -- what to show underneath
  badge    text,   -- status, for the pill on the right
  rank     integer -- lower sorts first; see the CASE ladders below
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_needle text := btrim(coalesce(p_query, ''));
  v_like   text;
  v_limit  integer := least(greatest(coalesce(p_limit, 12), 1), 50);
  -- Null unless what was typed is a code, which is the common case. Everything
  -- below that mentions it is guarded on that null rather than on a length or a
  -- shape, so there is exactly one place that decides what a code looks like.
  v_code   text := app.normalise_item_code(p_query);
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  -- Two characters is the floor. One character matches most of the database and
  -- is never what somebody meant. A code survives it: the shortest form anyone
  -- can type is a letter and a digit.
  if length(v_needle) < 2 then
    return;
  end if;

  -- Fold accents and escape the LIKE metacharacters, so a customer whose note
  -- contains a percent sign cannot turn their own name into a wildcard.
  v_like := '%' || replace(replace(replace(
              lower(extensions.unaccent(v_needle)),
              '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  (
    -- ── Stock ──────────────────────────────────────────────────────────────
    select
      'item'::text,
      i.id,
      i.title,
      concat_ws(' · ', i.sku, nullif(concat_ws(' ', i.brand, i.model), ''))::text,
      i.status::text,
      -- A code is somebody reading a label off a machine. It is never ambiguous
      -- and always what they meant, so it outranks everything — including a
      -- model number that happens to contain the same four characters, which is
      -- the one collision a short code buys.
      case
        when v_code is not null and i.sku = v_code                       then 0
        when lower(extensions.unaccent(i.sku))   like v_like             then 1
        when lower(extensions.unaccent(i.title)) like v_like             then 2
        else 3
      end
    from public.items i
    where i.deleted_at is null
      and (
        (v_code is not null and i.sku = v_code)
        or lower(extensions.unaccent(i.sku))                  like v_like escape '\'
        or lower(extensions.unaccent(i.title))                like v_like escape '\'
        or lower(extensions.unaccent(coalesce(i.brand, '')))  like v_like escape '\'
        or lower(extensions.unaccent(coalesce(i.model, '')))  like v_like escape '\'
        or lower(i.slug)                                      like v_like escape '\'
      )
    limit v_limit
  )
  union all
  (
    -- ── People ─────────────────────────────────────────────────────────────
    select
      'lead'::text,
      l.id,
      coalesce(nullif(btrim(l.full_name), ''), l.email, l.phone, 'Someone')::text,
      concat_ws(' · ', nullif(l.business_name, ''), l.email, l.phone)::text,
      l.status::text,
      case
        when lower(coalesce(l.email, '')) = lower(v_needle)                     then 0
        when lower(extensions.unaccent(coalesce(l.full_name, ''))) like v_like  then 1
        else 2
      end
    from public.leads l
    where l.deleted_at is null
      and (
        lower(extensions.unaccent(coalesce(l.full_name, '')))     like v_like escape '\'
        or lower(coalesce(l.email, ''))                           like v_like escape '\'
        or lower(coalesce(l.phone, ''))                           like v_like escape '\'
        or lower(coalesce(l.phone_e164, ''))                      like v_like escape '\'
        or lower(extensions.unaccent(coalesce(l.business_name, ''))) like v_like escape '\'
        or lower(extensions.unaccent(coalesce(l.notes, '')))      like v_like escape '\'
      )
    limit v_limit
  )
  order by 6, 3
  limit v_limit;
end;
$$;

revoke all on function public.search_everything(text, integer) from public, anon;
grant execute on function public.search_everything(text, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- The picker at the till
-- ---------------------------------------------------------------------------
-- Restated in full from 20260819100400_sellable_search.sql. Two things differ:
-- the subtitle is now brand and model alone, and the location_code branch of
-- the WHERE clause is gone.
--
-- The subtitle keeps concat_ws + nullif even with one argument left. It reads
-- as belt and braces on a single value, and it is: what it actually buys is
-- that the next person adding a fragment adds it to a list, rather than
-- discovering on the day that an empty brand renders a leading separator.

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


-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Unconditional, not `if exists`: this migration is the only thing that removes
-- it, and a silent no-op would hide a database that had drifted from the
-- migrations. Deliberately NOT `cascade` — nothing depends on the column, and
-- if something does by the time this runs, the right outcome is a failed
-- migration and a person reading it, not a quiet cascade through objects
-- nobody listed.
--
-- The values go with it. They were shelf references for machines that are still
-- on the floor and still findable by their code; there is nothing here to
-- archive first.

alter table public.items drop column location_code;
