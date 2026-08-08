-- Consent events, written for a person to read.
--
-- The first version logged consent_source verbatim, so a customer's timeline
-- read "website:product-form" — true, and useless to the worker looking at it.
-- It also said nothing about WHICH channel was agreed to, which is the one
-- detail that matters: consent under POPIA s69 is specific, and "they opted in"
-- is not an answer to "opted in to what".
--
-- Withdrawal of a single channel is now logged too. Somebody who says "email me
-- but stop the WhatsApps" has not unsubscribed, and until now that left no
-- trace at all.

create or replace function app.log_consent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_given    text[] := '{}';
  v_withdrew text[] := '{}';
  v_source   text   := coalesce(nullif(btrim(new.consent_source), ''), null);
begin
  -- A full opt-out outranks everything else on the row and is logged alone.
  if old.unsubscribed_at is null and new.unsubscribed_at is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (new.id, 'unsubscribed', 'Opted out of all marketing.', (select auth.uid()));
    return new;
  end if;

  if old.unsubscribed_at is not null and new.unsubscribed_at is null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      new.id,
      'consent_given',
      'Opt-out reversed' || coalesce(' — ' || v_source, ' — no source recorded'),
      (select auth.uid())
    );
    return new;
  end if;

  if old.email_consent_at is null and new.email_consent_at is not null then
    v_given := v_given || 'email';
  elsif old.email_consent_at is not null and new.email_consent_at is null then
    v_withdrew := v_withdrew || 'email';
  end if;

  if old.whatsapp_consent_at is null and new.whatsapp_consent_at is not null then
    v_given := v_given || 'WhatsApp';
  elsif old.whatsapp_consent_at is not null and new.whatsapp_consent_at is null then
    v_withdrew := v_withdrew || 'WhatsApp';
  end if;

  if array_length(v_given, 1) is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      new.id,
      'consent_given',
      'Agreed to ' || array_to_string(v_given, ' and ') || ' updates'
        || coalesce(' — ' || v_source, ''),
      (select auth.uid())
    );
  end if;

  if array_length(v_withdrew, 1) is not null then
    insert into public.lead_events (lead_id, kind, body, actor_id)
    values (
      new.id,
      'unsubscribed',
      'Stopped ' || array_to_string(v_withdrew, ' and ') || ' updates',
      (select auth.uid())
    );
  end if;

  return new;
end;
$$;
