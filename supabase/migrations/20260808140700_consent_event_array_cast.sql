-- `v_given || 'email'` does not append to a text[].
--
-- The literal is of unknown type, so Postgres resolves the operator as
-- anyarray || anyarray and then fails to parse 'email' as an array — at RUNTIME,
-- inside the trigger, which meant the previous migration applied cleanly and
-- broke the storefront enquiry form instead of the deploy. Only ever visible by
-- actually capturing a lead, which is why the smoke test does.
--
-- array_append is unambiguous and cannot be re-resolved by a future planner.

create or replace function app.log_consent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_given    text[] := '{}';
  v_withdrew text[] := '{}';
  v_source   text   := nullif(btrim(coalesce(new.consent_source, '')), '');
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
    v_given := array_append(v_given, 'email');
  elsif old.email_consent_at is not null and new.email_consent_at is null then
    v_withdrew := array_append(v_withdrew, 'email');
  end if;

  if old.whatsapp_consent_at is null and new.whatsapp_consent_at is not null then
    v_given := array_append(v_given, 'WhatsApp');
  elsif old.whatsapp_consent_at is not null and new.whatsapp_consent_at is null then
    v_withdrew := array_append(v_withdrew, 'WhatsApp');
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
