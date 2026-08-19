-- The search box learns to read a code the way a person types it.
--
-- search_everything() ranked `lower(i.sku) = lower(v_needle)` at zero, which
-- worked when a code was TME-2608-0417 — nobody abbreviates that, they paste
-- it. A four-character code gets typed by hand off a sticker, and what comes
-- out is `a42`. Under the old rule that fell through to the substring branch,
-- where it matched every machine with "a42" anywhere in a slug and ranked the
-- one it meant no higher than the rest.
--
-- app.normalise_item_code() is the same function the till uses to resolve a
-- typed code, so the search box and the order screen cannot disagree about what
-- `a42` means.
--
-- Restated in full from 20260809090600_global_search.sql. Only the item half
-- differs — one declaration, one rank branch, one WHERE clause; diff the two
-- files to see it.

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
        or lower(coalesce(i.location_code, ''))               like v_like escape '\'
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
