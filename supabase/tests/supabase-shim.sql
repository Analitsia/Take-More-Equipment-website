-- A Supabase-shaped floor for a bare Postgres, so the real migrations can run
-- against one with no Docker, no project and no credentials.
--
--   npm run test:schema
--
-- This is NOT a model of Supabase. It is the smallest set of objects that
-- supabase/migrations actually reaches for — grep the directory for `auth.`,
-- `storage.` and `extensions.` and this is the answer. Anything a migration
-- starts depending on has to be added here, and that friction is deliberate:
-- a migration reaching into a Supabase internal is worth noticing.
--
-- The one real approximation is unaccent(). PGlite does not ship the extension,
-- so the function below folds the accents this business actually meets in
-- customer names. `npm run test:parity` is what checks the real one, against
-- the real database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- The real unaccent() folds diacritics. This is enough of it for the ILIKE
-- searches to be exercised; the parity suite is what checks the real one.
create or replace function extensions.unaccent(text) returns text
language sql immutable as $fn$
  select translate($1,
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜñÑçÇ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNcC')
$fn$;

create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
grant usage on schema auth to anon, authenticated, service_role;

-- Null unless a test sets it, which is what a service-key or migration context
-- looks like to the policies.
create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;

create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $fn$ select string_to_array($1, '/') $fn$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
