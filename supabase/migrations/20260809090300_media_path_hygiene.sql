-- Closing draft-photo ENUMERATION, which is a different thing from draft-photo
-- disclosure, and the only one of the two that can actually be closed here.
--
-- ══ The fact that decides this whole migration ════════════════════════════
--
-- `item-media` is a PUBLIC bucket. Supabase serves a public bucket from
--
--     /storage/v1/object/public/item-media/<path>
--
-- and THAT ENDPOINT DOES NOT EVALUATE storage.objects SELECT POLICIES AT ALL.
--
-- This matters because the obvious fix here is wrong. Rewriting the read policy
-- to join public.items and require `published_at is not null` looks like it
-- closes the draft-photo hole. It protects nothing while the bucket is public.
-- It would pass code review, ship, change no behaviour whatsoever, and leave
-- behind a comment claiming a guarantee that does not exist — which is the
-- exact failure mode this whole branch of work is cleaning up elsewhere.
--
-- ══ Why the bucket stays public ═══════════════════════════════════════════
--
-- Making it private is the only way to close disclosure, and it costs more than
-- it buys. 20260807090800_storage.sql predicted this and was right:
--
--   · apps/web/src/lib/stock.ts builds /object/public/ and
--     /render/image/public/ URLs for every card, every gallery frame and every
--     OG tag. All of them 400 immediately.
--   · The replacement is signed URLs, which expire. getStock is
--     unstable_cache(revalidate: 300) and /stock/[slug] is statically
--     prerendered — a signature baked into a prerendered page dies while the
--     page it is in lives on.
--   · The CDN cache key becomes per-signature, so the hit rate collapses and
--     every visitor pulls originals through the transformer.
--   · WhatsApp and Facebook scrape an OG image once and cache it for days.
--     Expiring OG URLs means link previews rot — and WhatsApp previews are how
--     this business shares stock.
--
-- The written-down trade-off was sound. An unpublished item's photos are
-- fetchable by somebody who is TOLD the object path. They are photos of a
-- fryer.
--
-- ══ But there is a real hole, and this closes it ══════════════════════════
--
--     using (bucket_id = 'item-media')
--
-- granted `select` on storage.objects to ANON. `list` DOES go through RLS. So
-- with nothing but the publishable key that every visitor already has:
--
--     supabase.storage.from('item-media').list('items')
--
-- returned every object in the bucket, drafts included. That is not "fetchable
-- by anyone who knows the path" — that is handing over the paths. Discovery,
-- not disclosure, and it is the half that was never a decision.
--
-- After this migration: the public CDN URL is untouched, so ISR, image
-- transforms and OG previews all behave exactly as before, and the bucket can
-- no longer be enumerated by anyone who is not staff.
--
-- VERIFIED, NOT ASSUMED: packages/db/tests/rls.test.mjs asserts both halves —
-- anon list() is refused, and a published item's public URL still returns 200.
-- Given how easy it was to write a policy that changes nothing, that test is
-- the deliverable here and this SQL is the implementation detail.


-- ---------------------------------------------------------------------------
-- 1. Anon loses the object API. The CDN path is unaffected.
-- ---------------------------------------------------------------------------
drop policy if exists "item media is publicly readable" on storage.objects;

create policy "staff read item media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'item-media' and (select app.is_staff()));


-- ---------------------------------------------------------------------------
-- 2. Writes are scoped to the two prefixes this system actually uses
-- ---------------------------------------------------------------------------
-- `items/` is the existing convention: items/<item_id>/<uuid>.<ext>, which keeps
-- one machine's media together and makes a cascade delete a prefix delete.
--
-- `site/` is new, and naming it here is the point: the storefront's hero and
-- workshop photographs need somewhere to live, and they should go through the
-- same bucket and the same transform pipeline as item photography rather than
-- acquiring a second mechanism. Declaring it in the policy makes that an
-- explicit decision instead of something a future upload path does by accident.
--
-- Anything outside those two prefixes is a mistake, and a staff account with a
-- compromised session should not be able to fill the bucket with unrelated
-- objects at paths nothing will ever clean up.

drop policy if exists "staff upload item media" on storage.objects;
drop policy if exists "staff replace item media" on storage.objects;
drop policy if exists "staff delete item media" on storage.objects;

create policy "staff upload item media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'item-media'
    and (select app.is_staff())
    and (storage.foldername(name))[1] in ('items', 'site')
  );

create policy "staff replace item media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'item-media'
    and (select app.is_staff())
    and (storage.foldername(name))[1] in ('items', 'site')
  )
  with check (
    bucket_id = 'item-media'
    and (select app.is_staff())
    and (storage.foldername(name))[1] in ('items', 'site')
  );

-- Delete is deliberately NOT prefix-scoped: if something ever does land outside
-- the convention, staff must be able to clear it up. A constraint that prevents
-- tidying is a constraint that gets dropped.
create policy "staff delete item media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-media' and (select app.is_staff()));
