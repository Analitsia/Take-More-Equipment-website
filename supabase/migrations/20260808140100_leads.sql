-- People, what they are looking for, and everything we have said to them.
--
-- Four tables, and the split between the first two is the whole design:
--
--   leads            one row per PERSON, however many times they enquire
--   lead_interests   one row per THING THEY WANT, however many they want
--
-- Collapsing those into one table is the obvious shortcut and it breaks on the
-- first real customer, who asks about a fryer in March and a cold room in June.
-- Either you overwrite March or you create a second Sipho. Both are wrong.


-- ---------------------------------------------------------------------------
-- The person
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),

  full_name     text,
  email         text,
  phone         text,
  -- Generated, not written. See app.normalise_za_phone() for why one spelling
  -- matters; this column is what the unique index below can actually sit on.
  phone_e164    text generated always as (app.normalise_za_phone(phone)) stored,
  birthday      date,
  business_name text,

  source public.lead_source not null default 'walk_in',
  status public.lead_status not null default 'new',

  -- What a worker scribbles down. Free text on purpose — the structured version
  -- of "what do they want" is lead_interests, and this is for everything else:
  -- "runs the kitchen at the Spur in Claremont", "only collects on Saturdays".
  notes text,
  -- The escape hatch for a field nobody has thought of yet, so wanting to
  -- record one more thing about a customer is not a migration.
  extra jsonb not null default '{}'::jsonb,

  -- -- Consent (POPIA s69) -------------------------------------------------
  -- Timestamps rather than booleans, because "did they agree" is a weaker
  -- question than "when, and to what". A regulator asks the second one.
  email_consent_at    timestamptz,
  whatsapp_consent_at timestamptz,
  -- Free text describing where the tick came from: 'website:product-form',
  -- 'counter: signed intake slip', 'phone: agreed on call 2026-08-14'.
  consent_source      text,
  -- Objecting is one-way and outranks both timestamps above. Every send path
  -- filters on this in SQL, never in the UI.
  unsubscribed_at     timestamptz,
  -- Lets someone unsubscribe from an email link without an account and without
  -- us putting their address in a URL, which would leak it to every referrer
  -- and analytics script on the way through.
  unsubscribe_token   uuid not null default gen_random_uuid(),

  owner_id          uuid references auth.users (id) on delete set null,
  last_contacted_at timestamptz,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  -- A lead with no way to reach them is a note, not a lead. Enforced on the raw
  -- columns rather than phone_e164 so an unparseable number still saves — a
  -- human can fix a typo, but not one that was refused at the door.
  constraint leads_reachable check (email is not null or phone is not null),
  constraint leads_email_shape check (
    email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

comment on table public.leads is
  'One row per person. Identity is email-or-phone, enforced by the partial '
  'unique indexes below, so a repeat enquirer enriches a row instead of '
  'minting a second one.';

comment on column public.leads.birthday is
  'Only the month and day are ever compared — staff will rarely know the year '
  'and must not be blocked on it. Put any year in; nothing reads it.';

comment on column public.leads.unsubscribed_at is
  'Set once and honoured everywhere. Clearing it is possible but audited: see '
  'the leads_log_consent_change trigger.';

revoke all on public.leads from anon, authenticated;
alter table public.leads enable row level security;

-- Identity. Partial so that a soft-deleted row does not hold an address hostage
-- forever — if someone is erased and comes back, they can be re-entered.
create unique index leads_email_key on public.leads (lower(btrim(email)))
  where email is not null and deleted_at is null;
create unique index leads_phone_key on public.leads (phone_e164)
  where phone_e164 is not null and deleted_at is null;

create index leads_status_idx on public.leads (status) where deleted_at is null;
create index leads_created_idx on public.leads (created_at desc);
create unique index leads_unsubscribe_token_key on public.leads (unsubscribe_token);
-- date_part is immutable over a date, unlike to_char, so this one can be an
-- index rather than a seq scan every time someone opens the birthday list.
create index leads_birthday_idx on public.leads (date_part('month', birthday))
  where birthday is not null and deleted_at is null;

create trigger leads_touch
  before update on public.leads
  for each row execute function app.touch_updated_at();


-- ---------------------------------------------------------------------------
-- What they are looking for
-- ---------------------------------------------------------------------------
-- Structured AND unstructured, deliberately both.
--
-- The structured half uses the catalogue's own vocabulary — the same categories,
-- subcategories and tags staff already have to pick before an item may be
-- published. That is what turns stock matching into a join instead of a
-- research project.
--
-- The unstructured half is the customer's own words, and it is not decoration:
-- it is what a worker reads at the counter before saying hello, and it is what
-- goes into the message when a match lands. "Something to keep drinks cold for
-- the taxi rank shop" tells you more than `category_id = refrigeration` ever will.
create table public.lead_interests (
  id      uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,

  category_id    uuid references public.categories (id) on delete set null,
  subcategory_id uuid,
  -- The specific machine they asked about, when there was one. Nulled rather
  -- than cascaded if it is ever hard-deleted — the want outlives the unit.
  item_id        uuid references public.items (id) on delete set null,

  budget_max_cents bigint check (budget_max_cents >= 0),
  min_grade        public.condition_grade,

  description text not null default '',
  -- Two-argument to_tsvector with an explicit config: the one-argument form
  -- reads default_text_search_config and is therefore STABLE, which a generated
  -- column will not accept.
  search_vector tsvector
    generated always as (to_tsvector('english'::regconfig, description)) stored,

  -- A want that has been satisfied stops matching without being deleted, so the
  -- history of what this customer has looked for stays readable.
  active               boolean not null default true,
  fulfilled_at         timestamptz,
  fulfilled_by_item_id uuid references public.items (id) on delete set null,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The same composite key items uses, and for the same reason: an interest in
  -- "Refrigeration / Combi Ovens" is not a thing a customer can want.
  constraint lead_interests_subcategory_matches_category
    foreign key (subcategory_id, category_id)
    references public.subcategories (id, category_id),
  constraint lead_interests_subcategory_needs_category
    check (subcategory_id is null or category_id is not null)
);

revoke all on public.lead_interests from anon, authenticated;
alter table public.lead_interests enable row level security;

create index lead_interests_lead_idx on public.lead_interests (lead_id);
create index lead_interests_category_idx on public.lead_interests (category_id) where active;
create index lead_interests_subcategory_idx on public.lead_interests (subcategory_id) where active;
create index lead_interests_item_idx on public.lead_interests (item_id);
create index lead_interests_search_idx on public.lead_interests using gin (search_vector);

create trigger lead_interests_touch
  before update on public.lead_interests
  for each row execute function app.touch_updated_at();


-- Facets, mirroring item_tags exactly. "Gas", "three-phase" and "under-counter"
-- are how catering buyers describe what they need, and the vocabulary is
-- already seeded — so the matcher can compare like with like.
create table public.lead_interest_tags (
  interest_id uuid not null references public.lead_interests (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  primary key (interest_id, tag_id)
);

revoke all on public.lead_interest_tags from anon, authenticated;
alter table public.lead_interest_tags enable row level security;

create index lead_interest_tags_tag_idx on public.lead_interest_tags (tag_id);


-- ---------------------------------------------------------------------------
-- Everything we have said to them
-- ---------------------------------------------------------------------------
-- Append-only by convention and by policy: there is no update policy below, so
-- the timeline cannot be quietly rewritten. This is simultaneously the "what
-- did we last talk about" panel and the record POPIA expects you to be able to
-- produce on request.
create table public.lead_events (
  id      uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind    public.lead_event_kind not null,
  body    text,
  item_id uuid references public.items (id) on delete set null,
  -- Null for anything the public site or a cron did. That is information, not
  -- a gap: it distinguishes "the system sent this" from "Thabo sent this".
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on public.lead_events from anon, authenticated;
alter table public.lead_events enable row level security;

create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc);
create index lead_events_item_idx on public.lead_events (item_id) where item_id is not null;


-- ---------------------------------------------------------------------------
-- Two triggers that keep the record honest
-- ---------------------------------------------------------------------------

-- "When did we last speak to this person" is the column the counter screen sorts
-- on and the frequency cap reads. Deriving it from the timeline rather than
-- asking every caller to remember to set it means it cannot drift.
create or replace function app.touch_lead_contacted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind in ('call', 'visit', 'email_sent', 'whatsapp_sent', 'match_sent') then
    update public.leads
      set last_contacted_at = new.created_at
      where id = new.lead_id
        and (last_contacted_at is null or last_contacted_at < new.created_at);
  end if;
  return new;
end;
$$;

create trigger lead_events_touch_contacted
  after insert on public.lead_events
  for each row execute function app.touch_lead_contacted();


-- Consent changing is the one edit on this table that a regulator would ask
-- about, so it writes its own evidence. Re-subscribing someone is allowed —
-- people do phone up and ask to be put back on — but it can never be silent.
create or replace function app.log_consent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.unsubscribed_at is null and new.unsubscribed_at is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (new.id, 'unsubscribed', 'Opted out of marketing.', (select auth.uid()));

  elsif old.unsubscribed_at is not null and new.unsubscribed_at is null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      new.id,
      'consent_given',
      'Opt-out reversed — ' || coalesce(new.consent_source, 'no source recorded'),
      (select auth.uid())
    );

  elsif (old.email_consent_at is distinct from new.email_consent_at
      or old.whatsapp_consent_at is distinct from new.whatsapp_consent_at)
    and (new.email_consent_at is not null or new.whatsapp_consent_at is not null)
  then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      new.id,
      'consent_given',
      coalesce(new.consent_source, 'Consent updated'),
      (select auth.uid())
    );
  end if;

  return new;
end;
$$;

create trigger leads_log_consent_change
  after update on public.leads
  for each row execute function app.log_consent_change();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- No anon policy and no anon grant on any of these four tables. The public site
-- reaches them through public.capture_lead() in the next migration, which is
-- SECURITY DEFINER and returns void — the same shape, and the same reasoning, as
-- record_item_cost(). There is nothing here to widen by mistake.
--
-- Every approved staff member reads and writes leads. That is the point of the
-- feature: the person at the counter is usually not a manager, and a CRM they
-- cannot open is a CRM nobody uses. What is restricted is BULK action —
-- newsletters and export — and that restriction lives on outreach_campaigns in
-- a later migration, because that is where the blast radius actually is.

create policy "staff read leads"
  on public.leads for select
  to authenticated
  using ((select app.is_staff()));

create policy "staff add leads"
  on public.leads for insert
  to authenticated
  with check ((select app.is_staff()));

create policy "staff update leads"
  on public.leads for update
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

-- Soft delete is an update and available to everyone above. A hard delete drops
-- the timeline with it, so it stays with the owner.
create policy "owner deletes leads"
  on public.leads for delete
  to authenticated
  using ((select app.is_owner()));

grant select, insert, update, delete on public.leads to authenticated;


create policy "staff read interests"
  on public.lead_interests for select
  to authenticated
  using ((select app.is_staff()));

create policy "staff write interests"
  on public.lead_interests for all
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

grant select, insert, update, delete on public.lead_interests to authenticated;


create policy "staff manage interest tags"
  on public.lead_interest_tags for all
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

grant select, insert, update, delete on public.lead_interest_tags to authenticated;


create policy "staff read the timeline"
  on public.lead_events for select
  to authenticated
  using ((select app.is_staff()));

create policy "staff add to the timeline"
  on public.lead_events for insert
  to authenticated
  with check ((select app.is_staff()));

-- Note the absence of update and delete policies. An audit trail that can be
-- edited is not one.
grant select, insert on public.lead_events to authenticated;

grant execute on function
  app.touch_lead_contacted(),
  app.log_consent_change()
to authenticated;
