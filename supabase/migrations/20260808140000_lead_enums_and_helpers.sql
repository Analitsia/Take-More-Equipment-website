-- The vocabulary for people, as opposed to machines.
--
-- Enums live in their own file for the same reason the item ones do: `alter type
-- ... add value` cannot run in the transaction that created the type, and every
-- migration file here runs in one transaction. Adding a lead source later means
-- a new file, not an edit to this one.


-- ---------------------------------------------------------------------------
-- Where a lead came from
-- ---------------------------------------------------------------------------
-- This is not a funnel stage and not a marketing channel — it is the answer to
-- "how did this row come to exist", which is the question POPIA asks when you
-- want to rely on the existing-customer exception in section 69. A `walk_in`
-- whose details were taken at a sale can be marketed to under that exception;
-- a `website_general` cannot, and needs a ticked box. Keeping them apart in the
-- data is what makes that provable rather than remembered.
create type public.lead_source as enum (
  'walk_in',
  'phone',
  'whatsapp',
  'website_product',
  'website_general',
  'referral',
  'auction',
  'import'
);

-- Deliberately short. A four-word pipeline someone will actually keep current
-- beats a nine-stage one that everybody ignores after a fortnight.
--
-- `customer` is the one that carries weight beyond reporting: it is the flag
-- that says money changed hands, which is half of the section 69 test.
create type public.lead_status as enum (
  'new',
  'working',
  'customer',
  'dormant'
);

-- The timeline. Every one of these is something a human did or something the
-- system did on their behalf, and together they are both the "what did we last
-- say to this person" panel and the audit trail.
create type public.lead_event_kind as enum (
  'note',
  'enquiry',
  'call',
  'visit',
  'email_sent',
  'whatsapp_sent',
  'match_sent',
  'purchased',
  'consent_given',
  'unsubscribed'
);

create type public.outreach_channel as enum ('email', 'whatsapp');

create type public.outreach_state as enum ('queued', 'sent', 'skipped', 'failed');


-- ---------------------------------------------------------------------------
-- One phone number, one spelling
-- ---------------------------------------------------------------------------
-- The same person will be written down as 082 123 4567 by one worker, +27 82
-- 123 4567 by another and 0821234567 by the website form. Unless those collapse
-- to one string they are three customers, and a CRM with three rows for one
-- person is worse than no CRM — staff stop trusting it and go back to their own
-- phones, which is the failure this whole feature exists to fix.
--
-- IMMUTABLE is not decoration: leads.phone_e164 is a generated column over this
-- function, and a generated column requires an immutable expression. It is also
-- what lets a unique index sit on the result.
--
-- CAUTION: changing the logic below does NOT recompute rows already stored.
-- After any edit, force it with `update public.leads set phone = phone` — the
-- generated column is recalculated on every write of the row.
create or replace function app.normalise_za_phone(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  with parsed as (
    select
      -- A leading + is the only non-digit in the input that carries meaning.
      -- Everything else — spaces, dashes, brackets, and the (0) in the
      -- +27 (0)82 form people copy off letterheads — is noise.
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
  )
  select case
    when digits = '' then null

    -- Already international, either because they typed the + or because the
    -- length can only be explained by a country code. Left exactly as given:
    -- Take More sells to people who cross the border for a deal, and rewriting
    -- a Namibian number into +27 would make it undiallable.
    when plus or length(digits) > 10 then '+' || digits

    -- 0821234567 and 0215550134 — South African national form. The trunk 0 is
    -- dropped, never kept: +2708… is not a number.
    when length(digits) = 10 and digits like '0%' then '+27' || substring(digits from 2)

    -- 821234567 — the trunk 0 left off, which is how people say it aloud and
    -- how it arrives from a phone keypad more often than you would think.
    when length(digits) = 9 then '+27' || digits

    -- A five-digit fragment or a mistyped extension. Inventing a country code
    -- for it would mint a false identity that two real people could collide on,
    -- so it stays null and the row is identified by its email instead.
    else null
  end
  from trunk
$$;

comment on function app.normalise_za_phone(text) is
  'Canonical E.164 for a South African number, or null if the input cannot be '
  'dialled. Twinned with normalisePhone() in packages/core/src/phone.ts and '
  'pinned by packages/core/tests/parity.test.mjs.';

grant execute on function app.normalise_za_phone(text) to authenticated, anon;
