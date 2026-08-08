-- Who wrote this timeline entry.
--
-- `lead_events.actor_id` referenced auth.users, which is true but not useful:
-- PostgREST can only embed across a foreign key it can see, and there is no
-- route from auth.users to staff_profiles that it will follow. So asking for
-- the actor's NAME — which is the only thing the timeline actually wants —
-- failed with "Could not find a relationship between 'lead_events' and
-- 'staff_profiles' in the schema cache", and took the whole /leads page with it.
--
-- Pointing the column at staff_profiles instead is also the more honest
-- statement: the actor of a lead event is a member of this team, not any
-- authenticated user. Integrity with auth.users is unchanged, because
-- staff_profiles.user_id is itself a cascading foreign key onto it — deleting
-- the auth user still removes the profile, which still nulls the actor here and
-- leaves the entry standing.
--
-- Null stays meaningful and stays common: it is what the website writes when a
-- visitor enquires, and what a cron writes, because neither is a person.

alter table public.lead_events
  drop constraint lead_events_actor_id_fkey,
  add constraint lead_events_actor_id_fkey
    foreign key (actor_id) references public.staff_profiles (user_id)
    on delete set null;

comment on column public.lead_events.actor_id is
  'The staff member who did this, or null for the website and for scheduled '
  'jobs. Points at staff_profiles rather than auth.users so the timeline can '
  'embed their name in one query.';

-- The policy predicates never touch actor_id, but the timeline is read
-- newest-first per lead and now joins staff_profiles on the way out.
create index if not exists lead_events_actor_idx
  on public.lead_events (actor_id) where actor_id is not null;
