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

  drop policy if exists "public read media" on storage.objects;
  create policy "public read media" on storage.objects
    for select
    using (bucket_id = 'media');

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
