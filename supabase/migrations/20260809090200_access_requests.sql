-- Making the "ask to join" form countable, and the count atomic.
--
-- ── What was wrong ────────────────────────────────────────────────────────
--
-- requestAccess() in apps/ops/src/app/login/actions.ts is unauthenticated by
-- necessity — the whole point is that the person has no account yet — and it
-- uses the ADMIN key to create a real Supabase Auth user. Its only ceiling was
-- twelve outstanding requests, counted in TypeScript:
--
--     const { count } = await admin.from("staff_profiles")...
--     if ((count ?? 0) >= MAX_PENDING) return { ok: false, ... }
--
-- Check-then-act across two round trips. Two concurrent callers both read 11
-- and both create. And there was no per-email or per-IP limit at all, so one
-- script could saturate the queue and lock out a legitimate new starter — which
-- is the actual attack, not the account creation itself.
--
-- ── Why this is split between SQL and TypeScript ──────────────────────────
--
-- Pure TypeScript cannot fix it: the fix is a lock, and locks live in the
-- database. Pure SQL cannot either: creating an auth user means calling the
-- GoTrue admin API over HTTP, and hand-rolling password hashing and identity
-- rows into auth.users is a genuinely bad idea.
--
-- So: counting and throttling move here, where they can be made atomic, and
-- createUser stays in TypeScript, where it has to be.
--
-- ── Why a ledger and not a queue ──────────────────────────────────────────
--
-- The queue of people waiting is still `staff_profiles where approved_at is
-- null`, which /team already reads and which approveRequest() already acts on.
-- This table records ATTEMPTS, which is a different thing. A second table
-- claiming to be the queue would drift from the first one, and the drift would
-- show up as an owner approving somebody who is not there.


-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table public.access_requests (
  id    uuid primary key default gen_random_uuid(),
  email text not null,

  -- sha256(ip + pepper), computed in TypeScript. NEVER the address itself.
  --
  -- An IP address is personal information under POPIA, and holding one means
  -- justifying it in the privacy notice and deleting it on request. A salted
  -- hash cannot be reversed into an address, cannot be correlated with anything
  -- outside this table, and answers the only question we actually have: "is
  -- this the same requester as a minute ago?"
  ip_hash text,

  -- 'allowed'         — the ceilings let it through; a user is being created
  -- 'too_many_pending'| 'email_throttled' | 'ip_throttled' — refused, and why
  outcome text not null,

  -- Set once the outcome is known for certain: the profile row exists, or the
  -- attempt failed and its slot should be released. Null means in flight.
  settled_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.access_requests is
  'Throttle ledger for the unauthenticated staff access-request form. Records '
  'attempts, not people — the queue of people waiting is staff_profiles with a '
  'null approved_at. Pruned to 30 days by claim_access_request().';

create index access_requests_email_recent_idx
  on public.access_requests (email, created_at desc);

create index access_requests_ip_recent_idx
  on public.access_requests (ip_hash, created_at desc)
  where ip_hash is not null;

-- The in-flight lookup: allowed, not yet settled, recent.
create index access_requests_unsettled_idx
  on public.access_requests (created_at desc)
  where outcome = 'allowed' and settled_at is null;

revoke all on public.access_requests from anon, authenticated;
alter table public.access_requests enable row level security;

-- Owners and managers can see what has been hitting the form. Nobody can write
-- through a policy: rows arrive only via the two SECURITY DEFINER functions
-- below, called with the secret key. Same stance activity_log takes.
create policy "managers read access requests"
  on public.access_requests for select
  to authenticated
  using ((select app.at_least('manager')));

grant select on public.access_requests to authenticated;


-- ---------------------------------------------------------------------------
-- claim_access_request — the ceilings, atomically
-- ---------------------------------------------------------------------------
create or replace function public.claim_access_request(
  p_email   text,
  p_ip_hash text default null
)
returns table (request_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_now     timestamptz := now();
  v_pending integer;
  v_count   integer;
  v_outcome text;
  v_id      uuid;
begin
  -- One key, held until this transaction ends, so the counts below and the
  -- insert that follows them cannot interleave with another caller's. This is
  -- the whole reason the ceiling moved out of TypeScript.
  perform pg_advisory_xact_lock(hashtext('takemore.access_request'));

  -- Housekeeping, cheap and here rather than in a cron nobody would notice had
  -- stopped. A throttle ledger holding attempts from 2029 is a POPIA liability
  -- that buys nothing.
  delete from public.access_requests where created_at < v_now - interval '30 days';

  -- How many people are waiting for an owner's attention?
  --
  -- TWO terms, and the second is not optional. The staff_profiles row is only
  -- written AFTER createUser succeeds in TypeScript, so between this function
  -- returning and that row appearing, the profile count is stale. Without the
  -- second term, ten simultaneous callers would all see the same number and all
  -- be allowed — which is the bug this function exists to fix, reintroduced one
  -- layer down.
  --
  -- The 15-minute bound means a request that crashed mid-flight releases its
  -- slot on its own rather than wedging the queue forever.
  select
    (select count(*) from public.staff_profiles where approved_at is null)
    + (select count(*) from public.access_requests
        where outcome = 'allowed'
          and settled_at is null
          and created_at > v_now - interval '15 minutes')
  into v_pending;

  if v_pending >= 12 then
    v_outcome := 'too_many_pending';

  else
    -- Per-email. A new starter who mistypes their address and tries again is
    -- fine; the same address five times in a day is not a person.
    select count(*) into v_count
    from public.access_requests
    where email = v_email and created_at > v_now - interval '24 hours';

    if v_count >= 3 then
      v_outcome := 'email_throttled';

    else
      -- Per-origin. The one that actually stops a script, since varying the
      -- email address is free and varying the source address is not.
      if p_ip_hash is not null then
        select count(*) into v_count
        from public.access_requests
        where ip_hash = p_ip_hash and created_at > v_now - interval '1 hour';

        if v_count >= 5 then
          v_outcome := 'ip_throttled';
        end if;
      end if;

      v_outcome := coalesce(v_outcome, 'allowed');
    end if;
  end if;

  -- Every attempt is recorded, refused ones included — otherwise a throttle
  -- could be reset by tripping it, which is not much of a throttle.
  insert into public.access_requests (email, ip_hash, outcome, settled_at)
  values (
    v_email,
    p_ip_hash,
    v_outcome,
    -- A refusal is already finished. Only an allowed request is in flight.
    case when v_outcome = 'allowed' then null else v_now end
  )
  returning id into v_id;

  return query select v_id, v_outcome;
end;
$$;

comment on function public.claim_access_request is
  'Atomically decides whether an access request may proceed and records the '
  'attempt. Serialised by an advisory lock, so concurrent callers cannot both '
  'pass the same ceiling. Service role only — never reachable with the '
  'publishable key.';


-- ---------------------------------------------------------------------------
-- settle_access_request — release the slot
-- ---------------------------------------------------------------------------
-- Called on both the success path and the rollback path in TypeScript. Without
-- it a failed request would hold its slot for the full 15 minutes; with it, the
-- slot is freed the moment the outcome is known.
create or replace function public.settle_access_request(
  p_request_id uuid,
  p_succeeded  boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.access_requests
     set settled_at = now(),
         outcome    = case when p_succeeded then 'allowed' else 'failed' end
   where id = p_request_id
     and settled_at is null;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The important line in this file.
--
-- Unlike capture_lead(), which anon must be able to call because the storefront
-- ships the publishable key to every visitor, these are reachable ONLY by a
-- caller holding the secret key — which is the ops server and nothing else.
-- A hostile client cannot call them directly to burn the ledger.
revoke all on function public.claim_access_request(text, text) from public, anon, authenticated;
revoke all on function public.settle_access_request(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_access_request(text, text) to service_role;
grant execute on function public.settle_access_request(uuid, boolean) to service_role;
