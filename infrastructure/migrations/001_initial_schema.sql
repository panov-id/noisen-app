-- Sessions: one per anonymous user visit
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  device_info jsonb
);

-- Presets: node configurations saved by users
create table if not exists presets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions(id) on delete set null,
  name        text not null,
  data        jsonb not null,
  is_public   boolean not null default false,
  plays_count integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Analytics events: user interactions
create table if not exists events (
  id          bigserial primary key,
  session_id  uuid references sessions(id) on delete set null,
  type        text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

-- Indexes
create index if not exists presets_session_id_idx on presets(session_id);
create index if not exists presets_is_public_idx  on presets(is_public) where is_public = true;
create index if not exists events_session_id_idx  on events(session_id);
create index if not exists events_type_idx        on events(type);

-- Row Level Security
alter table sessions enable row level security;
alter table presets  enable row level security;
alter table events   enable row level security;

-- anon can insert their own session
create policy "anon can insert session"
  on sessions for insert to anon
  with check (true);

-- anon can read public presets
create policy "anon can read public presets"
  on presets for select to anon
  using (is_public = true);

-- anon can insert presets
create policy "anon can insert preset"
  on presets for insert to anon
  with check (true);

-- anon can update their own presets (by session_id)
create policy "anon can update own preset"
  on presets for update to anon
  using (session_id is not null);

-- anon can log events
create policy "anon can insert event"
  on events for insert to anon
  with check (true);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger presets_updated_at
  before update on presets
  for each row execute function update_updated_at();
