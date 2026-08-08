-- Asking to join, and the owner saying yes.
--
-- Until now an account existed because the owner made it in /team and read a
-- generated password down the phone. That works for the first three people and
-- stops working immediately after: the owner has to be present, at a computer,
-- at the moment someone new starts.
--
-- The flow this migration supports instead: a new person opens the ops app,
-- chooses their own email and password, and waits. The owner sees the request
-- in /team and approves or rejects it. Approval is the only gate, and it takes
-- effect on that person's next page load — no email, no link to click, no
-- second password to hand over.
--
-- WHY A NEW COLUMN AND NOT `active`
-- ---------------------------------
-- `active = false` already means something specific and different: somebody who
-- had access and no longer does. Overloading it would make a person who left
-- last month indistinguishable from a person asking to start tomorrow — the
-- Team screen could not tell them apart, and the ex-employee would be shown a
-- "waiting for approval" message that will never resolve.
--
-- So the two questions get two columns, and each keeps one meaning:
--
--   approved_at is null   nobody has decided about this person yet
--   active = false        somebody decided, and has since revoked it

alter table public.staff_profiles
  add column approved_at timestamptz;

comment on column public.staff_profiles.approved_at is
  'When an owner granted access. Null means the row is an unactioned request. '
  'Independent of `active`, which is revocation after the fact.';

-- Every row that exists today was inserted by an owner (through /team) or by
-- the bootstrap script, so all of them are already approved. Backdating to
-- created_at rather than now() keeps "approved" and "created" honest for the
-- accounts that predate this column.
update public.staff_profiles set approved_at = created_at;

-- The owner's queue: unactioned requests, oldest first.
create index staff_profiles_pending_idx on public.staff_profiles (created_at)
  where approved_at is null;


-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
-- One function, and every RLS policy in the schema inherits the change.
--
-- app.staff_role() is what is_staff(), at_least(), can_see_costs() and
-- is_owner() are all built on, and those four are what every policy on items,
-- item_media, item_costs, activity_log and staff_profiles actually calls. Adding
-- the condition here means an unapproved account cannot read a machine, write a
-- cost or see the team — not because each of those policies was remembered, but
-- because none of them can see a role for that person at all.
--
-- The body is otherwise untouched, including SECURITY DEFINER, which is still
-- load-bearing: the policies on staff_profiles call this, and this reads
-- staff_profiles.
create or replace function app.staff_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.staff_profiles
  where user_id = (select auth.uid())
    and active
    and approved_at is not null
$$;


-- ---------------------------------------------------------------------------
-- Seeing your own request
-- ---------------------------------------------------------------------------
-- A pending user has no role, so "staff read the team" refuses them — which
-- would leave the waiting screen unable to read the very row it is waiting on,
-- and unable to tell "your request is pending" from "you were rejected".
--
-- Policies are OR'd, so this adds exactly one row to what anyone can see: their
-- own. No function call in the predicate, so there is no recursion to break.
create policy "a person may read their own profile"
  on public.staff_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

-- NOTE ON SELF-APPROVAL, which this deliberately does not open:
-- the existing "staff update their own name" policy carries
-- `with check (... and role = (select app.staff_role()))`. For a pending user
-- that function now returns null, `role = null` evaluates to null rather than
-- true, and the update is refused. A pending account can therefore read its row
-- and change nothing about it. Approval is an owner-only write, as it was.
