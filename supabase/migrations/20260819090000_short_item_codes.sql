-- Item codes become four characters: A042.
--
-- `TME-2608-0417` was twelve characters of which four carried information, and
-- it was never written on a machine because nobody writes twelve characters on
-- a machine. The code has one job — to be copied onto a sticker by hand and
-- read back into a search box — and it was failing at it.
--
--   A001 … A999, then B001 … B999, then C001.
--
-- I, L, O and U are absent from the alphabet. On a hand-written label I and L
-- are 1, O is 0, and U is V. That leaves 22 letters and 21 978 codes, which at
-- this business's intake rate is decades.
--
-- The code carries no meaning — no category letter, no year. That is the
-- decision, not an omission: a category can change during refurb and a printed
-- label cannot. An identifier a later edit can contradict is worse than an
-- opaque one.
--
-- The COLUMN is still called `sku`. Renaming it would touch the anon grant, the
-- public_items view, search_everything, item_economics, item_analytics, the
-- generated types, three components, and the 'sku' key inside every historical
-- activity_log payload — a large blast radius for a name only the schema sees.
-- What changed is the word on screen, which is now "Code".
--
-- Supersedes the generator in 20260807090200_reference_data.sql:167-180 and the
-- security-definer restatement in 20260807091200_item_identity_defaults.sql.
-- Migrations are append-only, so those files still describe TME-2608-0417; this
-- header is the correction.


-- ---------------------------------------------------------------------------
-- The encoding, as a pure function
-- ---------------------------------------------------------------------------
-- Split from the sequence draw on purpose, following app.slugify/unique_slug
-- and app.normalise_za_phone: the pure half is what the parity suite can hammer
-- against its TypeScript twin without consuming a code per assertion. That was
-- free in a four-digit space and is not free in a 21 978-code one.
create or replace function app.encode_item_code(n bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when n is null or n < 1 or n > 22 * 999 then null
    else substr('ABCDEFGHJKMNPQRSTVWXYZ', ((n - 1) / 999)::int + 1, 1)
      || lpad((((n - 1) % 999) + 1)::text, 3, '0')
  end
$$;

comment on function app.encode_item_code(bigint) is
  '1 -> A001, 999 -> A999, 1000 -> B001, 21978 -> Z999, 21979 -> null. '
  'Twinned with formatItemCode() in packages/core/src/sku.ts.';


-- ---------------------------------------------------------------------------
-- Reading a code a human typed
-- ---------------------------------------------------------------------------
-- Somebody at the counter types `a42`. Accepting that is the difference between
-- a code that gets used and one that gets worked around, and it has to be one
-- rule rather than a regex copied into every search box — the same argument
-- that produced app.normalise_za_phone().
--
-- Null for anything that is not a code, so a caller can say "that is not a
-- code" without owning a second copy of the rule.
create or replace function app.normalise_item_code(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  with cleaned as (
    select upper(regexp_replace(coalesce(raw, ''), '[^A-Za-z0-9]', '', 'g')) as v
  )
  select case
    when v ~ '^[ABCDEFGHJKMNPQRSTVWXYZ][0-9]{1,3}$'
      then substr(v, 1, 1) || lpad(substr(v, 2), 3, '0')
  end
  from cleaned
$$;

comment on function app.normalise_item_code(text) is
  '"a42", "A 042", "a-042" and "A042" all become A042. Anything else is null. '
  'Twinned with normaliseItemCode() in packages/core/src/sku.ts.';


-- ---------------------------------------------------------------------------
-- The generator
-- ---------------------------------------------------------------------------
-- A new sequence rather than app.item_sku_seq. The old one's value is the TME
-- era plus every draft ever abandoned; starting again documents the break and
-- keeps two numbering schemes from sharing one counter.
create sequence if not exists app.item_code_seq as bigint start 1;

-- Keeps the name `next_sku` deliberately. It is the column default on
-- items.sku AND it is called from app.items_before_write(), so replacing the
-- body is one statement where renaming it would be an ALTER COLUMN plus a
-- trigger rewrite. The format changed; the concept did not.
--
-- Still SECURITY DEFINER for the reason 20260807091200 gives: a column default
-- executes as the inserting user, and that user has no rights over a sequence
-- in the app schema — nor should it.
create or replace function app.next_sku()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n    bigint;
  code text;
begin
  n := nextval('app.item_code_seq');
  code := app.encode_item_code(n);

  -- Loud and specific, naming the successor design, so that whoever meets this
  -- does not invent a fifth format under pressure. Two letters (AA001) widens
  -- to 570 000 and keeps every existing code valid as a prefix-free set.
  if code is null then
    raise exception
      'Item codes are exhausted: A001-Z999 is 21 978 machines and all of them are used. '
      'The fix is a second letter (AA001) in app.encode_item_code, not a workaround here.'
      using errcode = 'check_violation';
  end if;

  return code;
end;
$$;

grant execute on function app.next_sku()                to authenticated;
grant execute on function app.encode_item_code(bigint)  to authenticated;
grant execute on function app.normalise_item_code(text) to authenticated;


-- ---------------------------------------------------------------------------
-- Where the old codes went
-- ---------------------------------------------------------------------------
-- TME-2608-0417 exists in WhatsApp threads, in printed paperwork and in the
-- summary of every activity_log row written before today. Those log rows are
-- NOT rewritten — they say what was true when they were written, which is the
-- whole job of an append-only log, and lib/activity.ts already falls back to
-- the summary's first token when the payload has no sku.
--
-- This table is the permanent answer to "what is TME-2608-0417 now?". It costs
-- one row per machine, once. In the app schema, so PostgREST cannot see it.
--
-- It is written BEFORE the rewrite rather than after, which is also what makes
-- the rewrite itself simple: the map is computed once and then applied, so the
-- table and the column cannot disagree about what became what.
create table if not exists app.sku_renumber_2026 (
  item_id       uuid primary key references public.items (id) on delete cascade,
  old_sku       text not null unique,
  new_sku       text not null unique,
  renumbered_at timestamptz not null default now()
);

comment on table app.sku_renumber_2026 is
  'TME-YYMM-NNNN to A042, written once by 20260819090000_short_item_codes.sql.';


-- ---------------------------------------------------------------------------
-- Renumbering what is already here
-- ---------------------------------------------------------------------------
-- app.items_before_write() does `new.sku := old.sku` on every UPDATE, so a
-- plain UPDATE here would silently do nothing. The alternative — teaching that
-- trigger a session-GUC escape hatch — leaves a permanent hole in a write-once
-- rule to serve a one-time job, so the trigger comes off for the length of this
-- transaction instead.
--
-- Both `supabase db push` and scripts/apply-migrations.mjs run a file in one
-- transaction as postgres, which owns public.items, so DISABLE TRIGGER is
-- permitted. It takes ACCESS EXCLUSIVE, so no concurrent write can slip past
-- while identity is unenforced.
alter table public.items disable trigger items_before_write;

-- `where sku like 'TME-%'` is doing two jobs.
--
-- It makes a second run a no-op, which matters because this file rewrites every
-- row in the table. And it preserves the property that makes the rewrite legal
-- at all: `sku` has a NON-DEFERRABLE unique index checked per row, so shuffling
-- values within one UPDATE normally deadlocks against itself. It is safe here
-- only because A001… and TME-… are disjoint namespaces and no intermediate
-- state can collide. Restricting to the old namespace keeps that true forever.
--
-- Soft-deleted rows are included. A CHECK constraint applies to every row in
-- the table, and a deleted machine still holds its code against the unique
-- index — skipping them would fail items_sku_shape below, and would also free a
-- dead machine's code to be reissued to a live one.
--
-- Ordered by created_at so the oldest machine becomes A001, which is what a
-- person expects when they start writing labels. `id` breaks ties so the
-- mapping is reproducible on a clone.
with ordered as (
  select id, sku as old_sku, row_number() over (order by created_at, id) as n
  from public.items
  where sku like 'TME-%'
)
insert into app.sku_renumber_2026 (item_id, old_sku, new_sku)
select id, old_sku, app.encode_item_code(n) from ordered
on conflict (item_id) do nothing;

update public.items i
   set sku = m.new_sku
  from app.sku_renumber_2026 m
 where m.item_id = i.id
   and i.sku = m.old_sku;

alter table public.items enable trigger items_before_write;

-- Where the counter has to land, stated as a block because it has two failure
-- modes and both are silent.
--
-- Rewinding is the dangerous one. A code is consumed by the column default at
-- INSERT, so every draft that was later hard-deleted took one with it — count()
-- of the surviving rows is a FLOOR on the codes issued, never the total. Moving
-- the sequence back to it would hand a dead machine's code to a live one.
--
-- And an empty database must not be touched at all. setval(1, true) would make
-- the first machine ever taken in A002, with A001 never issued to anything.
do $$
declare
  renumbered bigint;
begin
  select count(*) into renumbered from app.sku_renumber_2026;

  if renumbered > 0 then
    perform setval(
      'app.item_code_seq',
      greatest(renumbered, (select last_value from app.item_code_seq)),
      true
    );
  end if;
end
$$;

-- Two triggers were left enabled through the rewrite, having been read rather
-- than assumed: app.enforce_publish_requirements() returns immediately unless
-- published_at is transitioning from null, and app.enforce_status_transition()
-- returns immediately when the status is unchanged. app.log_item_activity()
-- fires and writes nothing, because none of its branches (status, published_at,
-- list_price_cents, deleted_at) moved — which is right. A renumber is a schema
-- event, not something anybody did to a machine.
--
-- updated_at is untouched for the same reason: the trigger that stamps it is
-- items_before_write, and it was off.



-- ---------------------------------------------------------------------------
-- The shape constraint the table never had
-- ---------------------------------------------------------------------------
-- The trigger's `coalesce(nullif(btrim(new.sku), ''), app.next_sku())` means a
-- caller can still hand in an arbitrary string on insert, and nothing has ever
-- checked the format. That was survivable when the code was decoration. Now
-- that it is four characters somebody copies onto a machine, a stray lowercase
-- `a042` in the table is a bug that reaches a sticker.
--
-- A literal regex rather than a call to app.encode_item_code(): a function
-- referenced from a CHECK is executed with the inserting user's privileges, so
-- a grant change would turn into a broken table. It also has to come AFTER the
-- renumber above, which is why it is at the bottom of this file.
alter table public.items
  add constraint items_sku_shape
  check (sku ~ '^[ABCDEFGHJKMNPQRSTVWXYZ][0-9]{3}$');
