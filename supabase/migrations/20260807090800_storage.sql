-- The item-media bucket.
--
-- Public, not private, and that is a decision rather than a shortcut:
--   * product photos are public by definition once an item is listed;
--   * signed URLs expire, which would break ISR — a cached page would start
--     serving dead image links some hours after it was generated;
--   * the public path is CDN-cached and accepts the image-transformation
--     parameters that give us card/detail/OG sizes from one upload.
--
-- The trade-off, written down here so it is not rediscovered as a surprise in a
-- security review two years from now: an UNPUBLISHED item's photos are
-- fetchable by anyone who knows the object UUID. They are photos of a fryer.
-- Acceptable — but it is a decision.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-media',
  'item-media',
  true,
  -- 50 MB. Photos arrive compressed client-side to a few hundred KB; this
  -- ceiling exists for the one-minute video clip.
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do nothing;


-- Reads are open, matching the public bucket.
create policy "item media is publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'item-media');

-- Writes are staff only. Path convention is items/<item_id>/<uuid>.<ext>, which
-- keeps everything for one machine together and makes a cascade delete a prefix
-- delete.
create policy "staff upload item media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-media' and (select app.is_staff()));

create policy "staff replace item media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'item-media' and (select app.is_staff()))
  with check (bucket_id = 'item-media' and (select app.is_staff()));

create policy "staff delete item media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-media' and (select app.is_staff()));
