-- Run this in the Supabase project's SQL editor.

create table if not exists kv_store (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table kv_store enable row level security;

-- Every "create policy" below is preceded by a matching "drop policy if
-- exists" so this whole file is safe to run again later (e.g. to pick up
-- new sections added after your first setup) without "already exists"
-- errors on the parts you've already applied.

-- Public can read everything (standings, schedule, stats, etc. are public).
drop policy if exists "public read" on kv_store;
create policy "public read" on kv_store
  for select
  using (true);

-- Only an authenticated (logged-in) user can write.
drop policy if exists "authenticated insert" on kv_store;
create policy "authenticated insert" on kv_store
  for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated update" on kv_store;
create policy "authenticated update" on kv_store
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated delete" on kv_store;
create policy "authenticated delete" on kv_store
  for delete
  to authenticated
  using (true);

-- Admin accounts are created manually in Supabase Auth (Authentication ->
-- Users -> Add user). Public sign-up is left disabled by default in a new
-- Supabase project; leave it that way (Authentication -> Providers -> Email
-- -> "Allow new users to sign up" should stay off) so random visitors can't
-- register as admins.
--
-- Accounts log in with a username instead of an email address: when you
-- create the account in the Supabase dashboard, put
-- "<username>@admin.local" (all lowercase) in the Email field instead of a
-- real address — the app strips the "@admin.local" back off in the login
-- form. Nothing is ever sent to that address; it only has to satisfy
-- Supabase Auth's requirement that the field be email-shaped.

-- Roles table: who can do what. UI-level enforcement only (every admin
-- account still shares the same database write access via the policies
-- above — this table drives which buttons/tabs the app shows each person,
-- not a database-level restriction on which kv_store keys they can touch).
create table if not exists admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  role text not null check (role in ('site_owner', 'commissioner', 'board', 'stat_mod', 'media')),
  updated_at timestamptz default now()
);

alter table admin_roles enable row level security;

-- Any logged-in admin can read the roles list (needed so the app knows its
-- own role, and so Site Owners can see who has what on the Manage Admins
-- screen).
drop policy if exists "authenticated read roles" on admin_roles;
create policy "authenticated read roles" on admin_roles
  for select
  to authenticated
  using (true);

-- Only a Site Owner can grant, change, or revoke a role.
drop policy if exists "site owners insert roles" on admin_roles;
create policy "site owners insert roles" on admin_roles
  for insert
  to authenticated
  with check (exists (select 1 from admin_roles r where r.user_id = auth.uid() and r.role = 'site_owner'));

drop policy if exists "site owners update roles" on admin_roles;
create policy "site owners update roles" on admin_roles
  for update
  to authenticated
  using (exists (select 1 from admin_roles r where r.user_id = auth.uid() and r.role = 'site_owner'))
  with check (exists (select 1 from admin_roles r where r.user_id = auth.uid() and r.role = 'site_owner'));

drop policy if exists "site owners delete roles" on admin_roles;
create policy "site owners delete roles" on admin_roles
  for delete
  to authenticated
  using (exists (select 1 from admin_roles r where r.user_id = auth.uid() and r.role = 'site_owner'));

-- Bootstrapping the first Site Owner: the policies above mean nobody can
-- INSERT a row through the app until a Site Owner already exists (a
-- deliberate chicken-and-egg — otherwise any admin could grant themselves
-- Site Owner). Create the very first one by hand, once, in the SQL editor
-- (which runs as the table owner and bypasses RLS):
--
--   insert into admin_roles (user_id, username, role)
--   values ('<paste the user''s UUID from Authentication -> Users>', '<their username>', 'site_owner');
--
-- Every Site Owner after that can be granted from the app's Manage Admins
-- screen instead.
