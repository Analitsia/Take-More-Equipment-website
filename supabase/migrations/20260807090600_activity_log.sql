-- Who changed what, when.
--
-- Written by triggers rather than by application code, because application code
-- forgets. Every path that can change an item — the ops app, an RPC, a repair
-- someone runs in the SQL editor — lands here without having to remember to.

create table public.activity_log (
  id        bigint generated always as identity primary key,
  actor_id  uuid references auth.users (id) on delete set null,
  entity    text not null,
  entity_id uuid not null,
  action    public.activity_action not null,
  summary   text,
  -- Only the fields the action is about, not whole rows. Keeps the table small
  -- and the ops timeline readable.
  before    jsonb,
  after     jsonb,
  created_at timestamptz not null default now()
);

revoke all on public.activity_log from anon, authenticated;
alter table public.activity_log enable row level security;

create index activity_log_entity_idx
  on public.activity_log (entity, entity_id, created_at desc);
create index activity_log_recent_idx
  on public.activity_log (created_at desc);

-- Readable by any staff member: "moved to Ready by Sipho, two days ago" is
-- operational context, and nothing sensitive reaches this table — items carries
-- no cost columns, and cost rows are never logged here.
create policy "staff read activity"
  on public.activity_log for select
  to authenticated
  using ((select app.is_staff()));

-- No insert, update or delete policy for anyone. Rows arrive only through the
-- SECURITY DEFINER trigger below, so the log cannot be edited after the fact.
grant select on public.activity_log to authenticated;


create or replace function app.log_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
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

  if old.status is distinct from new.status then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before, after)
    values (actor, 'item', new.id, 'status_changed',
            new.sku || ': ' || old.status || ' → ' || new.status,
            jsonb_build_object('status', old.status),
            jsonb_build_object('status', new.status));
  end if;

  if old.published_at is null and new.published_at is not null then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, after)
    values (actor, 'item', new.id, 'published', new.sku || ' published',
            jsonb_build_object('published_at', new.published_at, 'slug', new.slug));
  elsif old.published_at is not null and new.published_at is null then
    insert into public.activity_log (actor_id, entity, entity_id, action, summary, before)
    values (actor, 'item', new.id, 'unpublished', new.sku || ' unpublished',
            jsonb_build_object('published_at', old.published_at));
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

create trigger items_log_activity
  after insert or update or delete on public.items
  for each row execute function app.log_item_activity();
