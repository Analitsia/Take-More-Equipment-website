-- Which machine belongs in front of which person.
--
-- The whole thing is a join, and that is the point. Because staff must already
-- pick a category, a subcategory and tags before an item may be published, and
-- because the lead form speaks that same vocabulary, "who wanted one of these"
-- is a question the database can answer without anybody embedding anything.
--
-- Free text is the fallback, not the mechanism: a customer who wrote "something
-- to keep drinks cold for the shop" gets matched on shared lexemes against the
-- machine's own words. Stemming is doing real work there — "fridges" finds
-- "fridge" — and it is explainable, which matters, because a suggestion staff
-- cannot audit is one they will either rubber-stamp or ignore.


-- ---------------------------------------------------------------------------
-- match_item_to_leads
-- ---------------------------------------------------------------------------
-- Idempotent by construction. Run it on publish, run it again tonight, run it
-- twice by accident during a deploy — the `outreach_once` partial unique index
-- absorbs every repeat, so this function never needs to remember what it did
-- last time. Returns how many NEW suggestions it queued.
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

      -- One pending suggestion per person at a time. Without this, a delivery
      -- of six fryers puts six drafts in front of staff for the same customer,
      -- and whoever works the queue sends all six. Clearing the queue lets
      -- tonight's sweep surface the next-best match.
      and not exists (
        select 1 from public.outreach_messages m
        where m.lead_id = l.id and m.item_id is not null and m.state = 'queued')

      -- The frequency cap. Seven days between unsolicited messages is the line
      -- between "they remembered what I wanted" and "unsubscribe".
      and not exists (
        select 1 from public.outreach_messages m
        where m.lead_id = l.id and m.state = 'sent'
          and m.sent_at > now() - interval '7 days')
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
  -- DISTINCT ON keeps one row per person: a customer with three wants gets one
  -- message about their best-matching want, not three.
  best as (
    select distinct on (lead_id) *
    from ranked
    where score >= 40
    order by lead_id, score desc, interest_id
  )

  insert into public.outreach_messages (lead_id, item_id, channel, reason, match_score)
  select
    b.lead_id,
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
  'Queue outreach suggestions for one item. Safe to call repeatedly — the '
  'outreach_once index makes it idempotent. Returns the number newly queued.';

revoke all on function public.match_item_to_leads(uuid) from public, anon;
grant execute on function public.match_item_to_leads(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The nightly sweep
-- ---------------------------------------------------------------------------
-- The safety net for a match that never ran: a publish that happened while the
-- ops app could not reach the database, an item whose category was filled in
-- after it went live, a lead captured five minutes after the machine was
-- listed. Same shape as the storefront's 300-second cache fallback behind the
-- revalidate webhook — one eager path, one patient one, one function.
--
-- Only `listed` stock. A machine still in the workshop is on the website but
-- cannot be sold today, and "we have one, it will be ready in a fortnight" is a
-- promise for a human to make deliberately from the item's own page, not one to
-- send automatically at 03:00.
create or replace function public.run_stock_match()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       record;
  v_total integer := 0;
begin
  if (select auth.uid()) is not null and not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select id from public.items
    where published_at is not null
      and deleted_at is null
      and status = 'listed'
    order by published_at desc
  loop
    v_total := v_total + public.match_item_to_leads(r.id);
  end loop;

  return v_total;
end;
$$;

revoke all on function public.run_stock_match() from public, anon;
grant execute on function public.run_stock_match() to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Who wants this, right now
-- ---------------------------------------------------------------------------
-- The read behind the "Who wants this" panel on an item's page. Deliberately
-- looser than the matcher: no consent filter, no frequency cap, no score floor,
-- because this answers a different question. The matcher asks "who may we
-- message unprompted"; this asks "who did we promise to keep an eye out for" —
-- and a customer who never ticked a marketing box is still someone to phone.
create or replace function public.leads_wanting_item(p_item_id uuid)
returns table (
  lead_id     uuid,
  full_name   text,
  phone       text,
  email       text,
  description text,
  score       integer
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
                  where w = any(v_doc_words)) * 8, 24))::integer as score
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
  select b.lead_id, b.full_name, b.phone, b.email, b.description, b.score
  from best b
  order by b.score desc, b.full_name;
end;
$$;

revoke all on function public.leads_wanting_item(uuid) from public, anon;
grant execute on function public.leads_wanting_item(uuid) to authenticated;
