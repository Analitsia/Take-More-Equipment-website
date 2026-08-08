-- Closing two holes in the enquiry form's abuse ceilings, and one in consent.
--
-- READ THIS FIRST: the function below is 20260808140200_lead_capture.sql's
-- capture_lead(), restated in full with sections 4, 5, 6 and 7 changed. plpgsql
-- has no way to patch a function body, so a full `create or replace` is the only
-- option. DIFF THE TWO FILES rather than reading this one cold.
--
-- ── Hole 1: the ceiling counted something that does not always happen ──────
--
-- The global ceiling counted rows in lead_interests. But section 7 only inserts
-- an interest when there is an item, a category or a message to record — so an
-- enquiry carrying nothing but an email address created a `leads` row and a
-- `lead_events` row and never touched the counter. A script posting bare email
-- addresses could run all day against a limit it never incremented.
--
-- The fix is to count the thing that happens on EVERY call: section 8 writes
-- exactly one lead_events row with kind = 'enquiry' and actor_id null,
-- unconditionally, and `actor_id is null` is this schema's established marker
-- for "not a staff member" (see 20260808140800_lead_event_actor_is_staff.sql).
-- Strictly stronger than what it replaces, and simpler.
--
-- ── Hole 2: creating people was not capped at all ──────────────────────────
--
-- The per-person ceiling only applies once a person is FOUND. A script that
-- varies the email address creates a brand-new lead every call and is bounded
-- only by the global ceiling. A second ceiling on lead creation closes it,
-- placed after the identity lookup so a returning customer is never refused by
-- a limit meant for strangers.
--
-- ── And a consent bug, found while restating this ──────────────────────────
--
-- Section 6 said, in its own comment, "Only ever granted here, never revoked."
-- The code did the opposite. `case when p_email_consent then ... end` with no
-- ELSE evaluates to NULL, so a visitor who ticked WhatsApp but not email had
-- their existing email_consent_at WIPED — silently destroying the record of a
-- consent they had previously given. Under POPIA that record is the evidence
-- for every marketing email already sent to them. Fixed below with an explicit
-- ELSE on both branches.
--
-- ── What is deliberately NOT here ─────────────────────────────────────────
--
-- A table of IP addresses. The original comment declined to hold them for POPIA
-- reasons and that reasoning still stands. Cloudflare Turnstile now sits in
-- front of this form (see packages/core/src/turnstile.ts), which is the right
-- shape of defence: it proves a human without us storing anything about them.


-- ---------------------------------------------------------------------------
-- Indexes the new counts need
-- ---------------------------------------------------------------------------
-- Both ceilings run on every single enquiry, so neither may be a sequential
-- scan. Partial, because both only ever ask about anonymous recent rows.

create index if not exists lead_events_anonymous_recent_idx
  on public.lead_events (created_at desc)
  where actor_id is null and kind = 'enquiry';

create index if not exists leads_website_recent_idx
  on public.leads (created_at desc)
  where source in ('website_product', 'website_general');


-- ---------------------------------------------------------------------------
-- capture_lead
-- ---------------------------------------------------------------------------
-- The signature must stay byte-identical to the original: same parameter names,
-- types, order and defaults. Postgres treats a different signature as a new
-- OVERLOAD rather than a replacement, and PostgREST would then pick between two
-- functions unpredictably. scripts/test-lead-loop.mjs asserts there is exactly
-- one capture_lead in pg_proc for precisely this reason.
create or replace function public.capture_lead(
  p_email            text,
  p_name             text default null,
  p_phone            text default null,
  p_message          text default '',
  p_item_slug        text default null,
  p_category_slug    text default null,
  p_from_product     boolean default false,
  p_email_consent    boolean default false,
  p_whatsapp_consent boolean default false,
  p_budget_max_cents bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(btrim(nullif(p_email, '')));
  v_phone    text := app.normalise_za_phone(p_phone);
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_message  text := btrim(coalesce(p_message, ''));

  v_lead_id        uuid;
  v_item_id        uuid;
  v_category_id    uuid;
  v_subcategory_id uuid;
  v_item_title     text;
  v_item_price     bigint;

  v_source public.lead_source;
  v_now    timestamptz := now();
  v_recent integer;

  v_take_email boolean := false;
  v_take_phone boolean := false;
begin
  -- -- 1. Reachability ------------------------------------------------------
  if v_email is null and v_phone is null then
    raise exception 'We need an email address or a phone number to reply to.'
      using errcode = 'check_violation';
  end if;

  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address does not look right.'
      using errcode = 'check_violation';
  end if;

  -- Length ceilings. p_message was unbounded and is concatenated into
  -- lead_events.body in section 8, so a megabyte of text became a megabyte of
  -- timeline entry that a staff member then has to scroll past. Generous enough
  -- that no real person writing about their kitchen will ever meet them.
  if length(v_message) > 4000 then
    raise exception 'That message is longer than we can take — please shorten it, or WhatsApp us.'
      using errcode = 'check_violation';
  end if;

  if v_name is not null and length(v_name) > 200 then
    raise exception 'That name is longer than we can take.'
      using errcode = 'check_violation';
  end if;

  -- -- 2. The source is ours to decide, not the caller's --------------------
  -- A client that could name its own lead_source could claim 'walk_in', and
  -- 'walk_in' is half the evidence for relying on the existing-customer
  -- exception in POPIA s69. The wire carries a boolean; the lawful basis is
  -- assigned here.
  v_source := case when p_from_product then 'website_product' else 'website_general' end;

  -- -- 3. Resolve the machine from its slug, server-side --------------------
  -- The browser never sends an id. It sends the slug that is already in the URL
  -- it is standing on, and this looks it up among PUBLISHED items only — so a
  -- hostile client cannot attach a stranger to an unlisted machine, and cannot
  -- probe for one either, because a miss is indistinguishable from a general
  -- enquiry from out here.
  if p_item_slug is not null then
    select i.id, i.category_id, i.subcategory_id, i.title, i.list_price_cents
      into v_item_id, v_category_id, v_subcategory_id, v_item_title, v_item_price
    from public.items i
    where i.slug = p_item_slug
      and i.published_at is not null
      and i.deleted_at is null;
  end if;

  if v_category_id is null and p_category_slug is not null then
    select c.id into v_category_id
    from public.categories c
    where c.slug = p_category_slug and c.active;
  end if;

  -- -- 4. Abuse ceilings ----------------------------------------------------
  -- CHANGED. Counts lead_events rather than lead_interests, because section 7
  -- is conditional and section 8 is not. See the header of this file.
  select count(*) into v_recent
  from public.lead_events
  where actor_id is null
    and kind = 'enquiry'
    and created_at > v_now - interval '1 hour';

  if v_recent >= 100 then
    raise exception 'We are getting a lot of enquiries right now — please try again shortly, or WhatsApp us.'
      using errcode = 'too_many_connections';
  end if;

  -- -- 5. Find the person, or make them --------------------------------------
  select l.id into v_lead_id
  from public.leads l
  where l.deleted_at is null
    and (
      (v_email is not null and lower(btrim(l.email)) = v_email)
      or (v_phone is not null and l.phone_e164 = v_phone)
    )
  order by l.created_at
  limit 1;

  if v_lead_id is null then
    -- NEW. The ceiling on inventing people, checked only on the path that
    -- invents one. Thirty brand-new website enquirers in a single hour is far
    -- past this business's real traffic and still absorbs a genuine spike —
    -- a post going around, or the first day of a sale.
    select count(*) into v_recent
    from public.leads
    where created_at > v_now - interval '1 hour'
      and source in ('website_product', 'website_general');

    if v_recent >= 30 then
      raise exception 'We are getting a lot of enquiries right now — please try again shortly, or WhatsApp us.'
        using errcode = 'too_many_connections';
    end if;

    insert into public.leads (full_name, email, phone, source, notes)
    values (v_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''), v_source, null)
    returning id into v_lead_id;

  else
    -- Per-person ceiling. Somebody asking about three machines in an afternoon
    -- is a good customer; twenty is a loop.
    --
    -- CHANGED, same reason as section 4: counted on the timeline, which is
    -- always written, rather than on interests, which are not.
    select count(*) into v_recent
    from public.lead_events
    where lead_id = v_lead_id
      and actor_id is null
      and kind = 'enquiry'
      and created_at > v_now - interval '1 hour';

    if v_recent >= 10 then
      raise exception 'We already have your enquiry — we will be in touch shortly.'
        using errcode = 'too_many_connections';
    end if;

    -- Adopt a contact detail only if no other row already holds it. Without
    -- this guard the partial unique index rejects the entire enquiry over a
    -- field we did not need, and the visitor sees a failure for what is
    -- actually a successful capture.
    if v_email is not null and not exists (
      select 1 from public.leads x
      where lower(btrim(x.email)) = v_email and x.deleted_at is null and x.id <> v_lead_id
    ) then
      v_take_email := true;
    end if;

    if v_phone is not null and not exists (
      select 1 from public.leads x
      where x.phone_e164 = v_phone and x.deleted_at is null and x.id <> v_lead_id
    ) then
      v_take_phone := true;
    end if;

    -- COALESCE puts the existing value first everywhere: a form fills blanks,
    -- it never overwrites what a person who actually spoke to this customer
    -- typed in.
    update public.leads
      set full_name = coalesce(full_name, v_name),
          email     = case when v_take_email then coalesce(email, v_email) else email end,
          phone     = case when v_take_phone
                           then coalesce(phone, nullif(btrim(coalesce(p_phone, '')), ''))
                           else phone end
      where id = v_lead_id;
  end if;

  -- -- 6. Consent ------------------------------------------------------------
  -- Only ever granted here, never revoked, and only from an explicit true.
  --
  -- CHANGED — and this was a bug, not a tidy-up. Both branches previously had
  -- no ELSE, and a `case` that falls through returns NULL. So a visitor who
  -- ticked WhatsApp but left email unticked had their email_consent_at set to
  -- NULL: the record of a consent they had already given, erased by a form that
  -- was not asking about it. That record is the evidence for every marketing
  -- email already sent to that person. The ELSE clauses are what make the
  -- comment above true.
  --
  -- An existing opt-out is still deliberately NOT reversed by a web form.
  -- Someone who objected and has now ticked a box is a conversation for a human
  -- to have and record, not something a POST should be able to undo.
  if p_email_consent or p_whatsapp_consent then
    update public.leads
      set email_consent_at    = case when p_email_consent
                                     then coalesce(email_consent_at, v_now)
                                     else email_consent_at end,
          whatsapp_consent_at = case when p_whatsapp_consent
                                     then coalesce(whatsapp_consent_at, v_now)
                                     else whatsapp_consent_at end,
          consent_source      = coalesce(
            consent_source,
            'website:' || case when p_from_product then 'product-form' else 'general-form' end
          )
      where id = v_lead_id;
  end if;

  -- -- 7. What they want -----------------------------------------------------
  -- Skipped when there is genuinely nothing to record. An interest row with no
  -- item, no category and no words matches nothing and would only pad the
  -- customer's page with blanks; the event below still records that they asked.
  --
  -- This conditional is what made the old ceiling in section 4 skippable. It is
  -- correct and stays; the ceiling moved instead.
  if v_item_id is not null or v_category_id is not null or v_message <> '' then
    insert into public.lead_interests (
      lead_id, category_id, subcategory_id, item_id,
      budget_max_cents, description, created_by
    )
    values (
      v_lead_id, v_category_id, v_subcategory_id, v_item_id,
      -- What they were looking at is the best guess at what they will spend,
      -- until a human asks. Overridden by p_budget_max_cents when the form
      -- actually asked the question.
      coalesce(p_budget_max_cents, v_item_price),
      v_message,
      null
    );
  end if;

  -- -- 8. The timeline -------------------------------------------------------
  -- Unconditional, which is what makes it the right thing for the ceilings in
  -- sections 4 and 5 to count. If this ever becomes conditional, those ceilings
  -- stop working — say so here rather than leaving it to be rediscovered.
  insert into public.lead_events (lead_id, kind, body, item_id, actor_id)
  values (
    v_lead_id,
    'enquiry',
    case
      when v_item_title is not null and v_message <> ''
        then 'Website enquiry about ' || v_item_title || ' — "' || v_message || '"'
      when v_item_title is not null
        then 'Website enquiry about ' || v_item_title
      when v_message <> ''
        then 'Website enquiry — "' || v_message || '"'
      else 'Website enquiry'
    end,
    v_item_id,
    -- Null: nobody on the team did this. See the column comment on
    -- lead_events.actor_id.
    null
  );
end;
$$;

comment on function public.capture_lead is
  'The storefront enquiry form. Upserts the person on email-or-phone, resolves '
  'the item from its slug among published stock only, and records consent as '
  'given rather than assumed. Abuse ceilings count lead_events, which is '
  'written on every call, rather than lead_interests, which is not.';

-- Restated for self-containment: `create or replace` preserves privileges, but
-- scripts/apply-migrations.mjs replays every file against a fresh project and
-- this file should stand alone there too.
revoke all on function public.capture_lead(
  text, text, text, text, text, text, boolean, boolean, boolean, bigint
) from public;
grant execute on function public.capture_lead(
  text, text, text, text, text, text, boolean, boolean, boolean, bigint
) to anon, authenticated;
