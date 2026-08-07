-- Staff accounts, and the role helpers every RLS policy in this schema calls.

create table public.staff_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) > 0),
  role       public.app_role not null default 'staff',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.staff_profiles is
  'One row per person who can sign in to ops. Signup is disabled at the project '
  'level, so a row here is the only way an account becomes useful.';

-- Supabase applies ALTER DEFAULT PRIVILEGES granting new public tables to anon
-- and authenticated. Every table in this schema revokes first and grants back
-- deliberately, so a policy gap is not also a grant gap.
revoke all on public.staff_profiles from anon, authenticated;
alter table public.staff_profiles enable row level security;

-- Policy predicates read `active` and `role`; the PK covers user_id.
create index staff_profiles_role_idx on public.staff_profiles (role) where active;


-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
-- These read staff_profiles rather than a JWT claim, deliberately.
--
-- Supabase's custom-access-token hook is the faster route — the role travels in
-- the token and costs nothing to check — but a token is only re-issued on
-- refresh, so a demoted manager keeps manager access for up to an hour. On a
-- team of three, where the demotion that matters is "this person has left",
-- reading the table is the correct trade: always current, and cheap enough that
-- the difference is unmeasurable at this scale.
--
-- Every policy wraps these in `(select ...)` so Postgres evaluates them once per
-- statement as an InitPlan instead of once per candidate row.
--
-- SECURITY DEFINER is not optional here. The policies ON staff_profiles call
-- these functions, and these functions read staff_profiles — as INVOKER that is
-- an infinite recursion, which Postgres reports as a policy-recursion error the
-- first time anyone signs in. Running as the owner bypasses RLS on the read and
-- breaks the cycle.

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
$$;

create or replace function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.staff_role() is not null
$$;

-- Enum comparison, which works because app_role was declared in ascending
-- privilege order.
create or replace function app.at_least(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.staff_role() >= required, false)
$$;

create or replace function app.can_see_costs()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.at_least('manager')
$$;

create or replace function app.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.staff_role() = 'owner', false)
$$;


-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger staff_profiles_touch
  before update on public.staff_profiles
  for each row execute function app.touch_updated_at();


-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Anyone signed in and active can see who else is on the team — the ops UI
-- attributes every item and every activity row to a person.
create policy "staff read the team"
  on public.staff_profiles for select
  to authenticated
  using ((select app.is_staff()));

-- Only the owner adds, promotes, demotes or deactivates. Deliberately not
-- "manager": the ability to grant yourself cost visibility is the whole
-- privilege ladder in one column.
create policy "owner manages the team"
  on public.staff_profiles for all
  to authenticated
  using ((select app.is_owner()))
  with check ((select app.is_owner()));

-- A person may correct their own name. They may not promote themselves, and the
-- WITH CHECK — not a column grant — is what stops them.
--
-- A column-level `grant update (full_name)` would be the obvious move and is
-- wrong here: grants are checked before policies, so the same restriction would
-- also stop the owner from changing anyone's role. Instead the new row must
-- carry the role the actor already has, which is unsatisfiable for anyone
-- trying to escalate. A deactivated account fails it too — app.staff_role()
-- returns null for them, and `role = null` is null, not true.
create policy "staff update their own name"
  on public.staff_profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and role = (select app.staff_role()));

grant select, insert, update, delete on public.staff_profiles to authenticated;

-- Explicit rather than relying on the default EXECUTE-to-PUBLIC on new
-- functions, which a hardening pass could reasonably revoke later and take
-- every policy in the schema down with it.
grant execute on function
  app.staff_role(),
  app.is_staff(),
  app.at_least(public.app_role),
  app.can_see_costs(),
  app.is_owner(),
  app.touch_updated_at()
to authenticated;

-- NOTE: the first owner cannot be created through these policies — there is no
-- owner yet to satisfy them. Insert that row once with the service key (or the
-- SQL editor, which bypasses RLS), then every later account is created from
-- inside the ops app. See the Supabase setup steps in the build plan.
