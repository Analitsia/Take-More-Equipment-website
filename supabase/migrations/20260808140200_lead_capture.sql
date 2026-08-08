-- The only door the public site has into the lead tables.
--
-- No anon policy and no anon grant exists on leads, lead_interests or
-- lead_events, and none is added here. The storefront calls these two functions
-- instead — SECURITY DEFINER, schema-qualified throughout, and returning as
-- little as possible.
--
-- Both return something other than the row they touched, deliberately. PostgREST
-- defaults to `Prefer: return=representation`, which makes an insert also a
-- select; an anonymous insert that reads its own row back is one `on conflict`
-- away from being an oracle that confirms whether a given email is in the
-- database. record_item_cost() avoids this for costs; the same applies with
-- more force to other people's contact details.


-- ---------------------------------------------------------------------------
-- capture_lead
-- ---------------------------------------------------------------------------
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
  --
  -- Category, subcategory and a sensible budget ceiling all fall out of that one
  -- lookup, which is what makes the product-page form a single box for the
  -- visitor and a fully classified interest for the matcher.
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
  -- Crude on purpose. The honeypot in the form catches the ordinary bot; this
  -- catches the one that got past it, without a rate-limiting service or a
  -- table of IP addresses we would then have to justify holding.
  select count(*) into v_recent
  from public.lead_interests
  where created_by is null and created_at > v_now - interval '1 hour';

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
    insert into public.leads (full_name, email, phone, source, notes)
    values (v_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''), v_source, null)
    returning id into v_lead_id;

  else
    -- Per-person ceiling. Somebody asking about three machines in an afternoon
    -- is a good customer; twenty is a loop.
    select count(*) into v_recent
    from public.lead_interests
    where lead_id = v_lead_id and created_at > v_now - interval '1 hour';

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
  -- An existing opt-out is deliberately NOT reversed by a web form. Someone who
  -- objected and has now ticked a box is a conversation for a human to have and
  -- record, not something a POST should be able to undo — and the event written
  -- below is what puts it in front of staff.
  if p_email_consent or p_whatsapp_consent then
    update public.leads
      set email_consent_at    = case when p_email_consent
                                     then coalesce(email_consent_at, v_now) end,
          whatsapp_consent_at = case when p_whatsapp_consent
                                     then coalesce(whatsapp_consent_at, v_now) end,
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
  'given rather than assumed.';

revoke all on function public.capture_lead(
  text, text, text, text, text, text, boolean, boolean, boolean, bigint
) from public;
grant execute on function public.capture_lead(
  text, text, text, text, text, text, boolean, boolean, boolean, bigint
) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- unsubscribe
-- ---------------------------------------------------------------------------
-- Token in, done. No account, no login, and no email address in the URL — a
-- one-click unsubscribe link travels through mail clients, proxies and referrer
-- headers, and an address in the query string is an address you have published.
--
-- Returns a boolean so a mistyped or truncated link can say so rather than
-- cheerfully confirming an unsubscribe that did not happen. Guessing a v4 uuid
-- is not a threat model; telling someone their opt-out worked when it did not
-- very much is.
create or replace function public.unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.leads
    set unsubscribed_at = coalesce(unsubscribed_at, now())
    where unsubscribe_token = p_token
      and deleted_at is null
    returning id into v_id;

  -- Idempotent: a second click on the same link is still a success, because
  -- from the person's point of view it is.
  return v_id is not null;
end;
$$;

revoke all on function public.unsubscribe(uuid) from public;
grant execute on function public.unsubscribe(uuid) to anon, authenticated;
