-- One message per WANT, not one message per person.
--
-- lead_interests has always been one row per thing somebody is looking for —
-- that split is the oldest deliberate decision in the CRM, and the comment at
-- the top of 20260808140100_leads.sql explains why. What was missing is that
-- outreach never carried the same idea through: outreach_messages recorded WHO
-- and WHICH MACHINE, and nothing at all about which of that person's wants the
-- machine was supposed to answer.
--
-- Three things fell out of that gap, and all three are wrong for a customer who
-- asked about a fryer in March and a cold room in June:
--
--   1. The matcher held one pending suggestion PER PERSON. A cold room arriving
--      while the fryer draft was still in the queue queued nothing at all.
--   2. The seven-day cap was PER PERSON. Send the fryer email today and the cold
--      room email cannot go out until next week, even though it is a completely
--      different conversation.
--   3. The draft could only recover "their own words" by pulling the quoted
--      fragment back out of the reason string, so the wording of a personal
--      email depended on a regex over a sentence built for a different purpose.
--
-- After this migration the unit of outreach is (person, want). Two wants and two
-- matching machines produce two separate emails, each one about a single machine
-- and quoting the sentence that machine actually answers. One want and six
-- fryers still produces exactly one message, which is the behaviour the pending
-- guard was protecting in the first place.
--
-- What does NOT change: the outreach_once index. It still says one message per
-- person per machine per channel, ever, which is what stops two near-duplicate
-- wants ("fryer", "deep fryer") turning one machine into two emails.


-- ---------------------------------------------------------------------------
-- Which want this message answers
-- ---------------------------------------------------------------------------
-- Nullable, and it has to be: a newsletter answers no particular want, and rows
-- written before this migration cannot always be attributed to one. Every guard
-- below therefore treats a null as "this belongs to the whole person" and falls
-- back to the old per-person behaviour for it, which is the conservative
-- direction — an un-attributable pending message keeps blocking exactly as much
-- as it used to.
--
-- `on delete set null` rather than cascade: deleting a want must not delete the
-- evidence that we emailed somebody. The timeline outlives the interest.
alter table public.outreach_messages
  add column interest_id uuid references public.lead_interests (id) on delete set null;

comment on column public.outreach_messages.interest_id is
  'The lead_interests row this message answers. Null for a newsletter, and for '
  'rows written before this column existed. The matcher dedupes and rate-limits '
  'on this rather than on lead_id, so a person with two different wants can be '
  'told about two different machines.';

create index outreach_messages_interest_idx
  on public.outreach_messages (interest_id)
  where interest_id is not null;


-- ---------------------------------------------------------------------------
-- Attribute the messages that already exist
-- ---------------------------------------------------------------------------
-- Without this, every queued suggestion on the day of deploy has a null
-- interest_id, and the new per-want guards would read them as blocking the
-- whole person — correct but pessimistic, and it would stay that way until the
-- queue was worked. Re-deriving the want is cheap and uses the same precedence
-- the matcher does: an exact subcategory match beats a category match beats
-- nothing, oldest want first as the tie-break.
--
-- Best-effort by design. A message whose lead has since had every interest
-- deleted keeps its null, and the guards below handle that case.
with attributed as (
  select distinct on (m.id)
    m.id as message_id,
    li.id as interest_id
  from public.outreach_messages m
  join public.items i on i.id = m.item_id
  join public.lead_interests li on li.lead_id = m.lead_id
  where m.item_id is not null
    and m.interest_id is null
  order by
    m.id,
    (case
       when li.subcategory_id is not null and li.subcategory_id = i.subcategory_id then 2
       when li.category_id is not null and li.category_id = i.category_id then 1
       else 0
     end) desc,
    li.created_at
)
update public.outreach_messages m
   set interest_id = a.interest_id
  from attributed a
 where m.id = a.message_id;


-- ---------------------------------------------------------------------------
-- The matcher, rewritten around the want
-- ---------------------------------------------------------------------------
-- Same scoring, same floor, same budget grace, same reason string. The three
-- changes are all in the WHERE clause, plus interest_id on the insert.
create or replace function public.match_item_to_leads(p_item_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      public.items;
  v_doc_words text[];
  v_item_tags uuid[];
  v_queued    integer := 0;
begin
  -- Reachable two ways: a signed-in staff member changing an item's stage, and
  -- the nightly sweep running with the service key, which has no auth.uid() at
  -- all. Anyone else fails at the grant — execute is revoked from public and
  -- never given to anon.
  if (select auth.uid()) is not null and not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if not found then return 0; end if;

  -- Three reasons not to tell anybody about this machine, all of them cheap to
  -- check and all of them embarrassing to get wrong: it is deleted, it is not
  -- on the website, or it has no price. Messaging someone about a machine they
  -- cannot look at is worse than not messaging them.
  if v_item.deleted_at is not null then return 0; end if;
  if v_item.published_at is null then return 0; end if;
  if coalesce(v_item.list_price_cents, 0) <= 0 then return 0; end if;

  v_doc_words := tsvector_to_array(
    to_tsvector('english'::regconfig, concat_ws(' ',
      v_item.title, v_item.brand, v_item.model,
      v_item.description, v_item.capacity, v_item.power))
  );

  select coalesce(array_agg(tag_id), '{}'::uuid[])
    into v_item_tags
  from public.item_tags where item_id = p_item_id;

  with base as (
    select
      l.id  as lead_id,
      li.id as interest_id,
      li.description,

      -- WhatsApp first where it is available: it is where this business already
      -- talks to its customers, and in the one-tap era it costs nothing.
      case
        when app.lead_is_reachable(l, 'whatsapp') then 'whatsapp'::public.outreach_channel
        when app.lead_is_reachable(l, 'email')    then 'email'::public.outreach_channel
      end as channel,

      case
        when li.subcategory_id is not null and li.subcategory_id = v_item.subcategory_id then 50
        when li.category_id is not null and li.category_id = v_item.category_id then 30
        else 0
      end as taxonomy_score,

      (select count(*)::int
         from public.lead_interest_tags lit
        where lit.interest_id = li.id and lit.tag_id = any(v_item_tags)) as shared_tags,

      (select count(*)::int
         from unnest(tsvector_to_array(li.search_vector)) as w
        where w = any(v_doc_words)) as shared_words,

      (select count(*)::int
         from public.lead_interests prev
         join public.items pi on pi.id = prev.item_id
        where prev.lead_id = l.id
          and prev.item_id is not null
          and pi.subcategory_id is not null
          and pi.subcategory_id = v_item.subcategory_id) as prior_looks

    from public.leads l
    join public.lead_interests li on li.lead_id = l.id and li.active
    where
      (app.lead_is_reachable(l, 'whatsapp') or app.lead_is_reachable(l, 'email'))

      -- Budget, with ten percent of grace. Somebody who said "under R20 000"
      -- will absolutely look at R21 500, and a hard ceiling silently loses real
      -- sales — which is the expensive kind of correctness.
      and (li.budget_max_cents is null
           or v_item.list_price_cents <= (li.budget_max_cents * 11) / 10)

      -- condition_grade is declared A, B, C, so BETTER SORTS EARLIER. "At least
      -- a B" therefore means the item's grade must be <= 'B'. It reads
      -- backwards; it is right.
      and (li.min_grade is null
           or (v_item.condition_grade is not null and v_item.condition_grade <= li.min_grade))

      -- Never pitch somebody the exact machine they already enquired about.
      and (li.item_id is null or li.item_id <> p_item_id)

      -- One pending suggestion per WANT. A delivery of six fryers still puts
      -- exactly one draft in front of staff for the person who wanted a fryer —
      -- which is what this guard has always been for — but a cold room arriving
      -- the same afternoon is a different want and gets its own draft.
      --
      -- The null branch is the compatibility case: a pending message nobody can
      -- attribute to a want still blocks the whole person, exactly as before.
      and not exists (
        select 1 from public.outreach_messages m
        where m.item_id is not null
          and m.state = 'queued'
          and (m.interest_id = li.id or (m.interest_id is null and m.lead_id = l.id)))

      -- The frequency cap, also per want. Seven days between messages about the
      -- same thing is the line between "they remembered what I wanted" and
      -- "unsubscribe"; seven days between messages about two different things
      -- is just a slow business. Newsletters carry no interest_id, so they still
      -- quiet the whole person for a week — which is the behaviour that was
      -- there before and is worth keeping.
      and not exists (
        select 1 from public.outreach_messages m
        where m.state = 'sent'
          and m.sent_at > now() - interval '7 days'
          and (m.interest_id = li.id or (m.interest_id is null and m.lead_id = l.id)))

      -- And the backstop, because "per want" is only as sane as the wants staff
      -- record. Somebody who has six interests on file is not getting six emails
      -- in a week no matter how well every one of them matches. Mirrored by
      -- OUTREACH_WEEKLY_CEILING in packages/core/src/leads.ts, which is what the
      -- ops app checks at the moment a human presses send.
      and (select count(*) from public.outreach_messages m
            where m.lead_id = l.id
              and m.state = 'sent'
              and m.sent_at > now() - interval '7 days') < 3
  ),

  ranked as (
    select
      b.*,
      b.taxonomy_score
        + b.shared_tags * 15
        -- Capped: forty shared stopwords is not four hundred points of signal.
        + least(b.shared_words * 8, 24)
        + case when b.prior_looks > 0 then 25 else 0 end
      as score
    from base b
    where b.channel is not null
  ),

  -- The floor. A bare category match scores 30 and must not clear it on its own,
  -- or every new fryer messages everybody who ever said the word "cooking".
  --
  -- DISTINCT ON is still per LEAD and not per interest, and that is deliberate:
  -- this function handles ONE machine, and one machine is one message. If two of
  -- somebody's wants both match this fryer, they hear about the fryer once, from
  -- whichever want fits it best. Two messages require two machines.
  best as (
    select distinct on (lead_id) *
    from ranked
    where score >= 40
    order by lead_id, score desc, interest_id
  )

  insert into public.outreach_messages
    (lead_id, interest_id, item_id, channel, reason, match_score)
  select
    b.lead_id,
    b.interest_id,
    p_item_id,
    b.channel,
    concat_ws(' · ',
      case
        when b.taxonomy_score = 50 then 'Wants exactly this type'
        when b.taxonomy_score = 30 then 'Wants this category'
      end,
      case when b.shared_tags > 0
        then b.shared_tags || ' matching ' ||
             case when b.shared_tags = 1 then 'feature' else 'features' end end,
      case when b.shared_words > 0 then 'their own words match this machine' end,
      case when b.prior_looks > 0 then 'looked at one like it before' end,
      case when b.description <> '' then '"' || left(b.description, 90) || '"' end
    ),
    b.score
  from best b
  -- Absorbs the repeat run, the concurrent run, and the machine this person has
  -- already been told about. See the outreach_once index.
  on conflict do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;

comment on function public.match_item_to_leads(uuid) is
  'Queue outreach suggestions for one item, one per person, attributed to the '
  'want it answers. Safe to call repeatedly — the outreach_once index makes it '
  'idempotent. Returns the number newly queued.';


-- ---------------------------------------------------------------------------
-- Who wants this, right now
-- ---------------------------------------------------------------------------
-- Two columns added, so the panel on an item's page can offer to write to
-- somebody rather than only telling staff to phone them:
--
--   interest_id  which want this person's score came from, so the email can
--                quote the right sentence and be rate-limited against the right
--                thing.
--   can_email    whether an unsolicited email is allowed at all. The panel
--                itself stays deliberately looser than the matcher — no
--                frequency cap, no score floor, and somebody who never ticked a
--                box is still shown, because phoning them is service rather
--                than direct marketing. This column is what lets the UI offer
--                the phone number and withhold the send button.
--
-- Dropped and recreated rather than replaced: the OUT parameter list changes,
-- and CREATE OR REPLACE cannot do that.
drop function if exists public.leads_wanting_item(uuid);

create function public.leads_wanting_item(p_item_id uuid)
returns table (
  lead_id     uuid,
  interest_id uuid,
  full_name   text,
  phone       text,
  email       text,
  description text,
  score       integer,
  can_email   boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
-- The OUT parameters above share names with columns this body selects. Telling
-- plpgsql to prefer the column removes any chance of an ambiguity error at
-- runtime rather than at deploy time, which is when it would actually hurt.
#variable_conflict use_column
declare
  v_item      public.items;
  v_doc_words text[];
  v_item_tags uuid[];
begin
  select * into v_item from public.items where id = p_item_id;
  if not found then return; end if;

  v_doc_words := tsvector_to_array(
    to_tsvector('english'::regconfig, concat_ws(' ',
      v_item.title, v_item.brand, v_item.model,
      v_item.description, v_item.capacity, v_item.power))
  );

  select coalesce(array_agg(tag_id), '{}'::uuid[])
    into v_item_tags
  from public.item_tags where item_id = p_item_id;

  return query
  with scored as (
    select
      l.id        as lead_id,
      li.id       as interest_id,
      l.full_name as full_name,
      l.phone     as phone,
      l.email     as email,
      li.description as description,
      (case
         when li.subcategory_id is not null and li.subcategory_id = v_item.subcategory_id then 50
         when li.category_id is not null and li.category_id = v_item.category_id then 30
         else 0
       end
       + (select count(*)::int from public.lead_interest_tags lit
            where lit.interest_id = li.id and lit.tag_id = any(v_item_tags)) * 15
       + least((select count(*)::int from unnest(tsvector_to_array(li.search_vector)) as w
                  where w = any(v_doc_words)) * 8, 24))::integer as score,
      app.lead_is_reachable(l, 'email'::public.outreach_channel) as can_email
    from public.leads l
    join public.lead_interests li on li.lead_id = l.id and li.active
    where l.deleted_at is null
  ),
  -- One row per person, showing their strongest reason for wanting this.
  best as (
    select distinct on (s.lead_id) s.*
    from scored s
    where s.score >= 30
    order by s.lead_id, s.score desc
  )
  select b.lead_id, b.interest_id, b.full_name, b.phone, b.email,
         b.description, b.score, b.can_email
  from best b
  order by b.score desc, b.full_name;
end;
$$;

revoke all on function public.leads_wanting_item(uuid) from public, anon;
grant execute on function public.leads_wanting_item(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- The same question, the other way round
-- ---------------------------------------------------------------------------
-- leads_wanting_item() answers "a machine arrived, who wanted one". This answers
-- "somebody is on the phone, what have we got for them" — and it is what makes
-- a deliberate, one-person, one-machine email possible without waiting for the
-- nightly sweep to notice.
--
-- Same scoring as the matcher minus the prior_looks bonus, which is a property
-- of the person rather than of this pairing, and the same floor as
-- leads_wanting_item (30, not 40): a human is reading this list and choosing,
-- so it may be looser than the thing that queues messages unattended.
--
-- Only stock that is actually for sale. "We have one, it will be ready in a
-- fortnight" is a promise for a human to make from the item's own page, not a
-- suggestion to put in front of somebody as though it were available.
create or replace function public.stock_matching_interest(p_interest_id uuid)
returns table (
  item_id          uuid,
  title            text,
  brand            text,
  slug             text,
  list_price_cents bigint,
  condition_grade  public.condition_grade,
  score            integer,
  already_told     boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_interest public.lead_interests;
  v_want     text[];
  v_tags     uuid[];
begin
  select * into v_interest from public.lead_interests where id = p_interest_id;
  if not found then return; end if;

  v_want := tsvector_to_array(v_interest.search_vector);

  select coalesce(array_agg(tag_id), '{}'::uuid[])
    into v_tags
  from public.lead_interest_tags where interest_id = p_interest_id;

  return query
  with scored as (
    select
      i.id, i.title, i.brand, i.slug, i.list_price_cents, i.condition_grade,
      (case
         when v_interest.subcategory_id is not null
              and v_interest.subcategory_id = i.subcategory_id then 50
         when v_interest.category_id is not null
              and v_interest.category_id = i.category_id then 30
         else 0
       end
       + (select count(*)::int from public.item_tags it
            where it.item_id = i.id and it.tag_id = any(v_tags)) * 15
       + least((select count(*)::int
                  from unnest(tsvector_to_array(
                    to_tsvector('english'::regconfig, concat_ws(' ',
                      i.title, i.brand, i.model, i.description, i.capacity, i.power)))) as w
                 where w = any(v_want)) * 8, 24))::integer as score
    from public.items i
    where i.deleted_at is null
      and i.published_at is not null
      and i.status = 'listed'
      and coalesce(i.list_price_cents, 0) > 0
      -- Not the machine they enquired about in the first place.
      and (v_interest.item_id is null or i.id <> v_interest.item_id)
      and (v_interest.budget_max_cents is null
           or i.list_price_cents <= (v_interest.budget_max_cents * 11) / 10)
      and (v_interest.min_grade is null
           or (i.condition_grade is not null and i.condition_grade <= v_interest.min_grade))
  )
  select
    s.id, s.title, s.brand, s.slug, s.list_price_cents, s.condition_grade, s.score,
    -- Anything but `failed` counts as told, matching the outreach_once index:
    -- a suggestion a human skipped was a decision, not a gap.
    exists (
      select 1 from public.outreach_messages m
      where m.lead_id = v_interest.lead_id
        and m.item_id = s.id
        and m.state <> 'failed'
    ) as already_told
  from scored s
  where s.score >= 30
  order by s.score desc, s.list_price_cents nulls last
  limit 12;
end;
$$;

comment on function public.stock_matching_interest(uuid) is
  'Live stock that answers one recorded want, best first. The read behind the '
  '"we have something for them" panel on a lead page — the mirror image of '
  'leads_wanting_item().';

revoke all on function public.stock_matching_interest(uuid) from public, anon;
grant execute on function public.stock_matching_interest(uuid) to authenticated;
