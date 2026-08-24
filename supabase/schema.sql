-- Run this in the Supabase project's SQL editor.

create table if not exists kv_store (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table kv_store enable row level security;

-- Public can read everything (standings, schedule, stats, etc. are public).
create policy "public read" on kv_store
  for select
  using (true);

-- Only an authenticated (logged-in) user can write.
create policy "authenticated insert" on kv_store
  for insert
  to authenticated
  with check (true);

create policy "authenticated update" on kv_store
  for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated delete" on kv_store
  for delete
  to authenticated
  using (true);

-- Admin accounts are created manually in Supabase Auth (Authentication ->
-- Users -> Add user). Public sign-up is left disabled by default in a new
-- Supabase project; leave it that way (Authentication -> Providers -> Email
-- -> "Allow new users to sign up" should stay off) so random visitors can't
-- register as admins.
