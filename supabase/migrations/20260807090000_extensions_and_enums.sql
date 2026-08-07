-- Extensions, schemas and the domain vocabulary.
--
-- Enums live in their own migration because `alter type ... add value` cannot
-- run in the same transaction that created the type, and the Supabase CLI wraps
-- each migration file in one transaction. Adding a status later therefore means
-- a new file, not an edit to this one.

create extension if not exists unaccent with schema extensions;

-- Internal helpers live here rather than in `public`. PostgREST only exposes the
-- schemas it is configured with (`public`, `graphql_public`), so nothing in
-- `app` is callable over HTTP no matter how the grants drift later.
--
-- USAGE still has to be granted to `authenticated`, and that is not a hole:
-- RLS policy expressions are evaluated as the querying user, so a policy that
-- calls app.is_staff() fails with "permission denied for schema app" unless the
-- caller can reach it. Schema visibility and API exposure are different things.
create schema if not exists app;
revoke all on schema app from public, anon;
grant usage on schema app to authenticated;


-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
-- DECLARATION ORDER IS LOAD-BEARING. Postgres compares enum values by the order
-- they were declared, so `role >= 'manager'` is a valid privilege test and
-- app.at_least() is a one-liner. Never insert a value into the middle of this
-- list — `alter type ... add value ... before/after` exists precisely because
-- position carries meaning here.
create type public.app_role as enum ('staff', 'manager', 'owner');


-- ---------------------------------------------------------------------------
-- The item lifecycle
-- ---------------------------------------------------------------------------
-- Mirrored by TRANSITIONS in packages/core/src/status.ts. The legal moves
-- between these values are data, not code — see item_status_transitions.
create type public.item_status as enum (
  'intake',
  'refurbishing',
  'ready',
  'listed',
  'reserved',
  'sold',
  'handed_over'
);

-- A grade is a pricing input, not a label, so it is a closed vocabulary and a
-- new grade is a deliberate schema change. Expect this one to move eventually
-- (someone will want "A+" or "for parts"); when it does, it needs its own file.
create type public.condition_grade as enum ('A', 'B', 'C');

create type public.media_kind as enum ('photo', 'video');

create type public.cost_kind as enum (
  'auction',
  'buyers_premium',
  'transport',
  'parts',
  'labour',
  'other'
);

create type public.activity_action as enum (
  'created',
  'updated',
  'status_changed',
  'published',
  'unpublished',
  'price_changed',
  'deleted'
);
