-- Everything we are about to say, and everything we have already said.
--
-- One table for the queue and the log, because they are the same row in two
-- states. A separate "sent_messages" table would need every column twice and
-- would let the two disagree about what was actually sent.


create type public.campaign_state as enum ('draft', 'sending', 'sent', 'failed');


-- ---------------------------------------------------------------------------
-- The newsletter
-- ---------------------------------------------------------------------------
-- The audience is a QUERY, not a stored list of recipients. A list would be
-- correct on the day it was built and wrong on the day it was sent — somebody
-- unsubscribes in between, and a snapshot cannot know. Storing the filter and
-- resolving it at send time means the opt-out is honoured by construction.
create table public.outreach_campaigns (
  id      uuid primary key default gen_random_uuid(),
  name    text not null check (length(btrim(name)) > 0),
  subject text not null check (length(btrim(subject)) > 0),
  -- The paragraph a human writes at the top. Below it the template renders the
  -- items in `item_ids`.
  intro   text,
  channel public.outreach_channel not null default 'email',

  -- {"category_slugs": ["refrigeration"], "only_customers": false}
  -- Empty object means everyone who has consented and not opted out.
  audience jsonb not null default '{}'::jsonb,
  -- The stock being shown off. Plain uuid[] rather than a join table: a
  -- campaign is written once and never queried by item.
  item_ids uuid[] not null default '{}',

  state public.campaign_state not null default 'draft',
  -- Filled in at send time so the numbers survive the leads later changing.
  recipient_count integer,
  sent_at timestamptz,
  sent_by uuid references auth.users (id) on delete set null,
  error   text,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on public.outreach_campaigns from anon, authenticated;
alter table public.outreach_campaigns enable row level security;

create index outreach_campaigns_state_idx on public.outreach_campaigns (state, created_at desc);

create trigger outreach_campaigns_touch
  before update on public.outreach_campaigns
  for each row execute function app.touch_updated_at();


-- ---------------------------------------------------------------------------
-- The queue and the log
-- ---------------------------------------------------------------------------
create table public.outreach_messages (
  id      uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- Set for a stock match, null for a newsletter.
  item_id uuid references public.items (id) on delete cascade,
  -- Set for a newsletter, null for a stock match. Exactly one of the two.
  campaign_id uuid references public.outreach_campaigns (id) on delete cascade,

  channel public.outreach_channel not null,

  -- Why this landed in front of staff, in words: "Wants Refrigeration /
  -- Under-counter · under R25 000 · mentioned 'drinks', 'fridge'". Shown in the
  -- queue, because a suggestion a person cannot audit is one they will either
  -- rubber-stamp or ignore, and both are failures.
  reason      text,
  match_score integer,

  -- Null until the message is composed. The draft is built in TypeScript, where
  -- the storefront URL, the brand voice and the staff member's edits live —
  -- SQL decides WHO to write to, not what to say.
  body text,

  state          public.outreach_state not null default 'queued',
  sent_at        timestamptz,
  sent_by        uuid references auth.users (id) on delete set null,
  skipped_reason text,
  error          text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint outreach_messages_target check (
    (item_id is not null and campaign_id is null)
    or (item_id is null and campaign_id is not null)
  )
);

revoke all on public.outreach_messages from anon, authenticated;
alter table public.outreach_messages enable row level security;

-- ---------------------------------------------------------------------------
-- THE index. Read this before changing anything in the matcher.
-- ---------------------------------------------------------------------------
-- One message per person per machine per channel, ever. This is what makes
-- match_item_to_leads() safe to run as often as we like — on publish, on the
-- nightly sweep, twice by accident during a deploy — and still guarantees
-- nobody is told about the same fryer twice.
--
-- `state <> 'failed'` rather than `in ('queued','sent')` is deliberate: a
-- message a human SKIPPED must keep blocking, or tonight's sweep re-queues
-- exactly the suggestion they just rejected. Only a delivery failure is worth
-- another attempt.
create unique index outreach_once
  on public.outreach_messages (lead_id, item_id, channel)
  where item_id is not null and state <> 'failed';

create index outreach_messages_queue_idx
  on public.outreach_messages (state, match_score desc) where state = 'queued';
create index outreach_messages_lead_idx on public.outreach_messages (lead_id, created_at desc);
create index outreach_messages_item_idx on public.outreach_messages (item_id) where item_id is not null;
create index outreach_messages_campaign_idx on public.outreach_messages (campaign_id) where campaign_id is not null;

create trigger outreach_messages_touch
  before update on public.outreach_messages
  for each row execute function app.touch_updated_at();


-- ---------------------------------------------------------------------------
-- Sending writes the timeline entry
-- ---------------------------------------------------------------------------
-- Derived rather than asked for, so "we messaged this person" and "the timeline
-- says we messaged this person" cannot come apart. last_contacted_at then falls
-- out of the lead_events trigger for free.
create or replace function app.log_outreach_sent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'sent' and old.state is distinct from 'sent' then
    insert into public.lead_events (lead_id, kind, body, item_id, actor_id)
    values (
      new.lead_id,
      case when new.item_id is not null then 'match_sent'::public.lead_event_kind
           when new.channel = 'whatsapp' then 'whatsapp_sent'::public.lead_event_kind
           else 'email_sent'::public.lead_event_kind end,
      coalesce(new.body, new.reason),
      new.item_id,
      coalesce(new.sent_by, (select auth.uid()))
    );
  end if;
  return new;
end;
$$;

create trigger outreach_messages_log_sent
  after update on public.outreach_messages
  for each row execute function app.log_outreach_sent();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- The split that matters: ANY staff member may send an individual match,
-- because that is a one-to-one conversation with a customer they are already
-- serving. Only a manager may create or send a CAMPAIGN, because that is the
-- action whose blast radius is the entire list. The restriction lives here
-- rather than in the ops navigation — a hidden button is a courtesy, a policy
-- is a rule.

create policy "staff read the queue"
  on public.outreach_messages for select
  to authenticated
  using ((select app.is_staff()));

create policy "staff queue a message"
  on public.outreach_messages for insert
  to authenticated
  with check ((select app.is_staff()));

create policy "staff send or skip"
  on public.outreach_messages for update
  to authenticated
  using ((select app.is_staff()))
  with check ((select app.is_staff()));

create policy "owner clears the queue"
  on public.outreach_messages for delete
  to authenticated
  using ((select app.is_owner()));

grant select, insert, update, delete on public.outreach_messages to authenticated;


create policy "staff read campaigns"
  on public.outreach_campaigns for select
  to authenticated
  using ((select app.is_staff()));

create policy "managers run campaigns"
  on public.outreach_campaigns for all
  to authenticated
  using ((select app.at_least('manager')))
  with check ((select app.at_least('manager')));

grant select, insert, update, delete on public.outreach_campaigns to authenticated;

grant execute on function app.log_outreach_sent() to authenticated;


-- ---------------------------------------------------------------------------
-- Who may be written to at all
-- ---------------------------------------------------------------------------
-- One definition of "reachable on this channel", used by the matcher, by the
-- campaign audience query and by nothing else. Written once so the opt-out can
-- never be honoured in one place and forgotten in the other.
create or replace function app.lead_is_reachable(
  p_lead public.leads,
  p_channel public.outreach_channel
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_lead.deleted_at is null
     and p_lead.unsubscribed_at is null
     and case p_channel
           when 'email'    then p_lead.email_consent_at is not null and p_lead.email is not null
           when 'whatsapp' then p_lead.whatsapp_consent_at is not null and p_lead.phone_e164 is not null
         end
$$;

grant execute on function app.lead_is_reachable(public.leads, public.outreach_channel)
  to authenticated;
