-- One search box for the whole ops app.
--
-- Somebody at the counter has a machine in their hands and a person in front of
-- them, and no idea whether what they want is under Stock or under Clients. The
-- answer should be "type it", not "pick the right list first".
--
-- ── Why SECURITY INVOKER and not DEFINER ──────────────────────────────────
--
-- This is a search over items AND leads, and it runs as the caller. Every RLS
-- policy on both tables applies exactly as it would to a direct query — so a
-- pending account (approved_at null, app.staff_role() returns null) gets an
-- empty result set here for the same reason it gets one everywhere else, and
-- this function cannot become a way around a policy somebody tightened later.
--
-- The guard at the top is belt to that braces, and gives a clear refusal rather
-- than a silently empty list.
--
-- ── On matching ───────────────────────────────────────────────────────────
--
-- Deliberately NOT full-text search. tsvector is built for prose, and this
-- corpus is SKUs, model numbers, surnames and phone numbers — where a stemmer
-- actively hurts ("Rational" and "rationals" should not merge, "CFC-0042"
-- should not be three tokens). ILIKE over an unaccented haystack is the right
-- tool: it matches mid-word, which is what somebody typing "0042" or "ndlov"
-- expects, and unaccent means "Görtz" is found by typing "Gortz".
--
-- Cost is acceptable and bounded: this searches a few thousand rows at most,
-- from a form that fires on a keystroke debounce, with a hard LIMIT. If the
-- floor ever reaches a size where this is slow, the fix is a trigram index
-- (pg_trgm), not a rewrite.

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
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  -- Two characters is the floor. One character matches most of the database and
  -- is never what somebody meant.
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
      -- An exact SKU is somebody reading a label off a machine. It is never
      -- ambiguous and always what they meant, so it outranks everything.
      case
        when lower(i.sku) = lower(v_needle)                              then 0
        when lower(extensions.unaccent(i.sku))   like v_like             then 1
        when lower(extensions.unaccent(i.title)) like v_like             then 2
        else 3
      end
    from public.items i
    where i.deleted_at is null
      and (
        lower(extensions.unaccent(i.sku))                    like v_like escape '\'
        or lower(extensions.unaccent(i.title))               like v_like escape '\'
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

comment on function public.search_everything is
  'One search across stock and people for the ops command palette. SECURITY '
  'INVOKER, so every RLS policy on items and leads applies unchanged and a '
  'pending account sees nothing.';

revoke all on function public.search_everything(text, integer) from public, anon;
grant execute on function public.search_everything(text, integer) to authenticated;
