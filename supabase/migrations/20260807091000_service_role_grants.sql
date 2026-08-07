-- Grants for service_role (the secret key).
--
-- WHY THIS IS A SEPARATE MIGRATION
-- --------------------------------
-- This project was created with "Automatically expose new tables" turned OFF,
-- which is the right setting — it disables the ALTER DEFAULT PRIVILEGES that
-- would otherwise hand every new public table to anon and authenticated the
-- moment it is created, and it is what makes the deliberate per-table grants in
-- the earlier migrations meaningful rather than decorative.
--
-- The same switch also withholds the default grants to `service_role`, which
-- the earlier migrations did not compensate for. The result was a secret key
-- that could authenticate but could not read or write a single table — the
-- seed script, the RLS test harness and the revalidation webhook all failed
-- with "permission denied".
--
-- service_role is the admin identity: it carries BYPASSRLS and exists to do the
-- things policies are meant to stop everyone else doing. Blanket DML is correct
-- for it. The security boundary is that the key never leaves a server
-- environment — see packages/db/src/admin.ts, which enforces that at build time.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;

-- The SKU sequence and the role helpers live in `app`.
grant usage on schema app to service_role;
grant all privileges on all sequences in schema app to service_role;
grant all privileges on all routines in schema app to service_role;

-- Future tables added by later migrations, so this does not have to be
-- remembered every time.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;
