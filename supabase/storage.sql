-- Run this in the Supabase project's SQL editor, once.
--
-- Creates the bucket news images and highlight clips are uploaded to. Media
-- used to be stored as base64 data URIs inside the league JSON blob in
-- kv_store, which meant every unrelated write (a bot score, an admin save)
-- carried every image with it, and made video impossible. Now the blob only
-- holds the URL and the bytes live here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read: the bucket is public so the site can render media without
-- signed URLs, matching how kv_store is publicly readable.
drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects
  for select
  using (bucket_id = 'media');

-- Only a logged-in admin can add or remove media, the same boundary the
-- kv_store write policies use.
drop policy if exists "authenticated upload media" on storage.objects;
create policy "authenticated upload media" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'media');

drop policy if exists "authenticated update media" on storage.objects;
create policy "authenticated update media" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'media')
  with check (bucket_id = 'media');

drop policy if exists "authenticated delete media" on storage.objects;
create policy "authenticated delete media" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'media');
