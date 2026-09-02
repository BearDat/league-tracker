create table if not exists bot_team_emoji (
  emoji_id text primary key,
  emoji_name text not null,
  team_id text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists bot_team_emoji_team_idx on bot_team_emoji (team_id);

create table if not exists bot_pending (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'pending',
  channel_id text not null,
  message_id text not null,
  guild_id text,
  author_tag text,
  raw_text text not null,
  parsed jsonb not null,
  reasons jsonb not null default '[]'::jsonb,
  dm_message_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  error text
);

create index if not exists bot_pending_status_idx on bot_pending (status, created_at desc);
create unique index if not exists bot_pending_message_idx on bot_pending (message_id, kind);

create table if not exists bot_processed (
  message_id text primary key,
  kind text not null,
  outcome text not null,
  detail text,
  processed_at timestamptz not null default now()
);

create table if not exists bot_channel_cursor (
  channel_id text primary key,
  last_message_id text,
  updated_at timestamptz not null default now()
);

alter table bot_team_emoji enable row level security;
alter table bot_pending enable row level security;
alter table bot_processed enable row level security;
alter table bot_channel_cursor enable row level security;

drop policy if exists "authenticated read emoji" on bot_team_emoji;
create policy "authenticated read emoji" on bot_team_emoji for select to authenticated using (true);

drop policy if exists "authenticated read pending" on bot_pending;
create policy "authenticated read pending" on bot_pending for select to authenticated using (true);

drop policy if exists "authenticated update pending" on bot_pending;
create policy "authenticated update pending" on bot_pending for update to authenticated using (true) with check (true);

drop policy if exists "authenticated insert emoji" on bot_team_emoji;
create policy "authenticated insert emoji" on bot_team_emoji for insert to authenticated with check (true);

drop policy if exists "authenticated update emoji" on bot_team_emoji;
create policy "authenticated update emoji" on bot_team_emoji for update to authenticated using (true) with check (true);

drop policy if exists "authenticated delete emoji" on bot_team_emoji;
create policy "authenticated delete emoji" on bot_team_emoji for delete to authenticated using (true);

drop policy if exists "authenticated read cursor" on bot_channel_cursor;
create policy "authenticated read cursor" on bot_channel_cursor for select to authenticated using (true);
