-- A soft delete is a delete, and the timeline should say so.
--
-- Deleting an item from ops sets `deleted_at` and clears `published_at` in one
-- update. It never issues a DELETE — an item that was live has been indexed and
-- linked to, and the row is what keeps its costs, its activity and any outreach
-- that referenced it from losing their subject.
--
-- The consequence nobody noticed until there was a button for it: the only
-- branch of this trigger that writes a 'deleted' row is the DELETE branch, which
-- nothing reaches. The history of a machine somebody removed read
--
--     TM-0012 unpublished
--
-- and stopped there — indistinguishable from taking a listing down to fix a
-- typo, which is the one thing a delete must not look like.
--
-- Two changes, both about the log telling the truth:
--
--   · setting deleted_at now logs 'deleted'
--   · the unpublish it implies is NOT logged as its own event. The rule stated
--     in 20260807090600 — one UPDATE can be several events, each gets a row — is
--     about events that are independently true. Coming off the site is not
--     independently true here; it is what deleting means. Logged separately it
--     reads as two things happening to a machine that one thing happened to.
--
-- Restated in full because `create or replace function` has no patch form.
-- Diff against 20260807090600_activity_log.sql to see only what moved.

create or replace function app.log_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor    uuid := (select auth.uid());
  deleting boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, after)
    values (actor, 'item', new.id, 'created', new.sku || ' created',
            jsonb_build_object('sku', new.sku, 'title', new.title));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before)
    values (actor, 'item', old.id, 'deleted', old.sku || ' deleted',
            jsonb_build_object('sku', old.sku, 'title', old.title));
    return old;
  end if;

  -- One UPDATE can be several events — publishing a machine and listing it for
  -- sale in the same save is normal. Each gets its own row rather than the
  -- first one winning, because the timeline is the point.

  deleting := old.deleted_at is null and new.deleted_at is not null;

  -- `before` carries what it was when it went, so the row says what was removed
  -- rather than only that something was. The stage and the live-ness are the two
  -- facts anyone asks about afterwards.
  if deleting then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before)
    values (actor, 'item', new.id, 'deleted', new.sku || ' deleted',
            jsonb_build_object('sku', new.sku, 'title', new.title,
                               'status', old.status,
                               'published_at', old.published_at));
  end if;

  if old.status is distinct from new.status then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before, after)
    values (actor, 'item', new.id, 'status_changed',
            new.sku || ': ' || old.status || ' → ' || new.status,
            jsonb_build_object('status', old.status),
            jsonb_build_object('status', new.status));
  end if;

  if not deleting then
    if old.published_at is null and new.published_at is not null then
      insert into public.activity_log (actor_id, entity, entity_id, action, summary, after)
      values (actor, 'item', new.id, 'published', new.sku || ' published',
              jsonb_build_object('published_at', new.published_at, 'slug', new.slug));
    elsif old.published_at is not null and new.published_at is null then
      insert into public.activity_log (actor_id, entity, entity_id, action, summary, before)
      values (actor, 'item', new.id, 'unpublished', new.sku || ' unpublished',
              jsonb_build_object('published_at', old.published_at));
    end if;
  end if;

  if old.list_price_cents is distinct from new.list_price_cents then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before, after)
    values (actor, 'item', new.id, 'price_changed', new.sku || ' repriced',
            jsonb_build_object('list_price_cents', old.list_price_cents),
            jsonb_build_object('list_price_cents', new.list_price_cents));
  end if;

  return new;
end;
$$;
