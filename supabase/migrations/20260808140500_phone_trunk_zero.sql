-- The (0) in "+27 (0)82 123 4567".
--
-- The first version of app.normalise_za_phone() stripped the brackets, kept the
-- zero, and produced +270821234567 — while the same person written down as
-- "+27 82 123 4567" produced +27821234567. Two spellings of one number, two
-- rows, which is the exact failure the function was written to prevent.
--
-- Letterheads, Google listings and email signatures all use the (0) form, so
-- this is not a rare input. Fixed by splitting the parse in two: work out the
-- international digits first, then drop a South African trunk zero sitting
-- immediately after the country code.
--
-- The rule is applied to +27 only. Trunk-code conventions are national — some
-- countries keep a leading digit that looks just like this one — and guessing on
-- behalf of a Namibian or Zimbabwean number would break a working one.

create or replace function app.normalise_za_phone(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  with parsed as (
    select
      -- A leading + is the only non-digit in the input that carries meaning.
      btrim(coalesce(raw, '')) like '+%' as plus,
      regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as digits
  ),
  trunk as (
    select
      plus,
      -- 00 is the other way of writing +.
      case when digits like '00%' then substring(digits from 3) else digits end
        as digits
    from parsed
  ),
  intl as (
    select case
      when digits = '' then null

      -- Already international, either because they typed the + or because the
      -- length can only be explained by a country code. Kept as given: Take
      -- More sells to people who cross the border for a deal, and rewriting a
      -- Namibian number into +27 would make it undiallable.
      when plus or length(digits) > 10 then digits

      -- 0821234567 and 0215550134 — national form. The trunk 0 is dropped.
      when length(digits) = 10 and digits like '0%' then '27' || substring(digits from 2)

      -- 821234567 — the trunk 0 left off, which is how people say it aloud.
      when length(digits) = 9 then '27' || digits

      -- A short fragment or a mistyped extension. Inventing a country code for
      -- it would mint a false identity two real people could collide on, so it
      -- stays null and the row is identified by its email instead.
      else null
    end as digits
    from trunk
  )
  select case
    when digits is null then null
    -- +27 (0)82 … — a national trunk zero written inside an international
    -- number. A South African subscriber number is nine digits and never starts
    -- with zero, so 27 + 0 + nine more is unambiguous.
    when digits like '270%' and length(digits) = 12 then '+27' || substring(digits from 4)
    else '+' || digits
  end
  from intl
$$;

-- Generated columns are computed on write, never re-read, so rows stored under
-- the old logic keep the old value. Touching every row recomputes them. It is a
-- no-op today — the table was created in the same session — and it is here so
-- that the next person to edit this function has the recipe in front of them.
update public.leads set phone = phone where phone is not null;
