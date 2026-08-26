-- Outreach is the log. All of it.
--
-- 20260808140300_outreach.sql opened with "one table for the queue and the
-- log, because they are the same row in two states". The newsletter never kept
-- that promise. sendCampaign() resolved its audience, handed the batch to Resend
-- and wrote ONE number — recipient_count — onto the campaign row. Nothing was
-- written per person. So a customer who got the monthly list on Monday had no
-- `sent` row, the seven-day cap in match_item_to_leads() and capsBlocking()
-- counted nothing, and a match email could follow on Tuesday. The runbook said
-- "the newsletter counts against all three" and it did not.
--
-- Four things, all in service of the table telling the whole truth:
--
--   1. A campaign send writes one outreach_messages row per recipient, and an
--      index makes writing it twice impossible. The timeline trigger fires on
--      INSERT as well as UPDATE, so a row born `sent` still writes its event,
--      and a newsletter row reads "Sent the newsletter: <subject>" rather than
--      quoting a body nobody typed.
--
--   2. A soft-deleted lead is removed from the queue. softDeleteLead() only ever
--      stamped deleted_at; the drafts the matcher had queued stayed in the queue
--      and could be sent to a person the business had decided to forget. That
--      is now a trigger on leads, so every path that deletes — the ops app, a
--      future import cleanup, a hand-run UPDATE — takes the drafts with it. And
--      a second trigger refuses to mark anything `sent` to a deleted lead at
--      all, which is the guard the ops app also applies, restated where it
--      cannot be forgotten.
--
--   3. `claimed_at`. Tapping Send twice, fast, sent two emails: deliverEmail()
--      read the row, sent, then wrote `sent`, and the second tap read the row
--      before the first had written. The ops app now claims the row with a
--      conditional UPDATE before it talks to Resend. A column rather than a new
--      enum value, because `alter type ... add value` cannot be used in the
--      transaction that adds it, and every migration here IS a transaction.
--
--   4. lead_demand.contactable required consent and nothing else. The Clients
--      page counted the same way, the browser filter did not, and
--      app.lead_is_reachable() — the one definition that actually gates a send
--      — has always required an address too. Consent without an address is a
--      promise that cannot be kept; the view now says so.


-- ---------------------------------------------------------------------------
-- 1. The newsletter, per person
-- ---------------------------------------------------------------------------
-- outreach_messages_target already permits (item_id null, campaign_id set), and
-- outreach_once only covers item_id rows, so campaign rows never collided with
-- it — they were simply never written. This is their own version of the same
-- rule: one row per person per newsletter.
--
-- NOT partial, unlike outreach_once, and on purpose. The ops app writes these
-- rows with `on conflict (lead_id, campaign_id) do nothing` through PostgREST,
-- which cannot spell a partial index's predicate — so the index has to be
-- inferable from the two columns alone. Match rows carry a null campaign_id,
-- and nulls are distinct to a unique index, so they are untouched by it. A
-- `failed` newsletter row is never written by anything (Resend accepts or
-- refuses a chunk whole, and only accepted addresses are recorded), so the
-- `state <> 'failed'` carve-out outreach_once needs has nothing to carve here.
create unique index if not exists outreach_campaign_once
  on public.outreach_messages (lead_id, campaign_id);

-- Restated in full because `create or replace function` has no patch form.
-- Diff against 20260808140300_outreach.sql:133-153 to see only what moved:
-- the INSERT branch, and the newsletter wording.
create or replace function app.log_outreach_sent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_subject text;
begin
  if new.state = 'sent' and (tg_op = 'INSERT' or old.state is distinct from 'sent') then
    if new.campaign_id is not null then
      select c.subject into v_subject
        from public.outreach_campaigns c
       where c.id = new.campaign_id;
    end if;

    insert into public.lead_events (lead_id, kind, body, item_id, actor_id)
    values (
      new.lead_id,
      case when new.item_id is not null then 'match_sent'::public.lead_event_kind
           when new.channel = 'whatsapp' then 'whatsapp_sent'::public.lead_event_kind
           else 'email_sent'::public.lead_event_kind end,
      case when new.campaign_id is not null
           then 'Sent the newsletter: ' || coalesce(v_subject, new.body, '')
           else coalesce(new.body, new.reason) end,
      new.item_id,
      coalesce(new.sent_by, (select auth.uid()))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_messages_log_sent on public.outreach_messages;
create trigger outreach_messages_log_sent
  after insert or update on public.outreach_messages
  for each row execute function app.log_outreach_sent();


-- ---------------------------------------------------------------------------
-- 2. A deleted person leaves the queue, and cannot be written to
-- ---------------------------------------------------------------------------
create or replace function app.retire_outreach_for_deleted_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update public.outreach_messages
       set state = 'skipped',
           skipped_reason = 'lead deleted'
     where lead_id = new.id
       and state = 'queued';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_retire_outreach on public.leads;
create trigger leads_retire_outreach
  after update of deleted_at on public.leads
  for each row execute function app.retire_outreach_for_deleted_lead();

-- The other direction: nothing goes to a deleted lead however it is asked.
-- Checked on every transition INTO `sent` and on every re-stamp of sent_at
-- (which is what a resend is), so neither the queue nor the Sent list can
-- reach a person who has been removed.
create or replace function app.refuse_outreach_to_deleted_lead()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'sent'
     and (tg_op = 'INSERT'
          or old.state is distinct from 'sent'
          or new.sent_at is distinct from old.sent_at)
     and exists (select 1 from public.leads l
                  where l.id = new.lead_id and l.deleted_at is not null)
  then
    raise exception 'That person has been deleted. Nothing sent.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_messages_refuse_deleted on public.outreach_messages;
create trigger outreach_messages_refuse_deleted
  before insert or update on public.outreach_messages
  for each row execute function app.refuse_outreach_to_deleted_lead();

grant execute on function app.retire_outreach_for_deleted_lead() to authenticated;
grant execute on function app.refuse_outreach_to_deleted_lead() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. The claim
-- ---------------------------------------------------------------------------
-- Set by the ops app immediately before it sends, with
--   update ... set claimed_at = now() where id = ? and state = 'queued'
--     and (claimed_at is null or claimed_at < now() - interval '2 minutes')
-- and the send only proceeds when that touched a row. Cleared again when the
-- send finishes either way. The two-minute window is what lets a send whose
-- process died mid-flight be tried again without anyone editing the row.
alter table public.outreach_messages
  add column if not exists claimed_at timestamptz;

comment on column public.outreach_messages.claimed_at is
  'Set by the ops app the moment a staff member''s send is accepted, before '
  'anything is handed to Resend. The conditional update that sets it is what '
  'stops two taps sending two emails. Cleared when the send finishes.';


-- ---------------------------------------------------------------------------
-- 4. Contactable means reachable
-- ---------------------------------------------------------------------------
-- Same column list, same order, so `create or replace view` is allowed to do it
-- in place. `security_invoker` restated because a replace that omits it would
-- silently turn this back into a definer view and hand every staff account a
-- way around RLS.
create or replace view public.lead_demand
with (security_invoker = true) as
select
  l.id                                     as lead_id,
  li.id                                    as interest_id,

  li.category_id,
  cat.name                                 as category,
  li.subcategory_id,
  sub.name                                 as subcategory,
  li.budget_max_cents,

  l.status                                 as lead_status,
  l.source                                 as lead_source,
  l.created_at                             as lead_created_at,
  l.last_contacted_at,

  (l.status = 'customer')                  as is_customer,
  -- Reachable for marketing on at least one channel: consent AND an address
  -- to honour it with, and no objection. The same test as
  -- app.lead_is_reachable(), spelled out because a view cannot take a row.
  (l.unsubscribed_at is null
    and ((l.email_consent_at is not null and l.email is not null)
      or (l.whatsapp_consent_at is not null and l.phone_e164 is not null)))
                                           as contactable,
  (l.unsubscribed_at is not null)          as unsubscribed
from public.leads l
left join public.lead_interests li on li.lead_id = l.id and li.active
left join public.categories cat    on cat.id = li.category_id
left join public.subcategories sub on sub.id = li.subcategory_id
where l.deleted_at is null;

comment on view public.lead_demand is
  'One row per active recorded want, plus one row per lead with no want at all. '
  'Count DISTINCT lead_id for people and interest_id for wants — a lead with '
  'three interests appears three times. contactable mirrors '
  'app.lead_is_reachable(): consent plus an address on at least one channel.';

revoke all on public.lead_demand from anon, authenticated;
grant select on public.lead_demand to authenticated;
