create extension if not exists "pgcrypto";

create table if not exists sensor_health (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  last_reading_at timestamptz,
  last_successful_post_at timestamptz,
  consecutive_failures int default 0,
  sensor_status text default 'UNKNOWN' check (sensor_status in ('ONLINE', 'OFFLINE', 'UNKNOWN')),
  signal_strength_dbm int,
  current_ssid text,
  current_ip_address text,
  device_ip_address text,
  device_id text,
  mac_address text,
  firmware_version text,
  setup_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists environment_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  light_condition text not null check (light_condition in ('Present', 'Not Present')),
  water_type text not null check (water_type in ('Distilled Water', 'Tap Water', 'River Water', 'Lake Water', 'Ground Water', 'Other')),
  container_type text not null check (container_type in ('Glass', 'Plastic', 'Beaker', 'Bottle', 'Laboratory Tube', 'Other')),
  water_volume_ml numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists monitoring_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'stopped')),
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);

alter table sensor_health
  add column if not exists current_ssid text,
  add column if not exists current_ip_address text,
  add column if not exists device_ip_address text,
  add column if not exists device_id text,
  add column if not exists mac_address text,
  add column if not exists firmware_version text,
  add column if not exists setup_mode boolean not null default false;

alter table water_readings
  add column if not exists light_condition text,
  add column if not exists water_type text,
  add column if not exists container_type text,
  add column if not exists water_volume_ml numeric,
  add column if not exists monitoring_session_id uuid references monitoring_sessions(id) on delete set null;

create index if not exists sensor_health_device_id_idx on sensor_health (device_id);
create index if not exists sensor_health_mac_address_idx on sensor_health (mac_address);
create index if not exists sensor_health_user_idx on sensor_health (user_id);
create index if not exists environment_settings_user_idx on environment_settings (user_id);
create index if not exists monitoring_sessions_user_status_idx on monitoring_sessions (user_id, status);
create unique index if not exists monitoring_sessions_one_active_user_idx
  on monitoring_sessions (user_id)
  where status = 'active';

alter table sensor_health enable row level security;
alter table environment_settings enable row level security;
alter table monitoring_sessions enable row level security;

drop policy if exists "Users can read their own sensor health" on sensor_health;
create policy "Users can read their own sensor health"
  on sensor_health for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own sensor health" on sensor_health;
create policy "Users can update their own sensor health"
  on sensor_health for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own environment settings" on environment_settings;
create policy "Users can read their own environment settings"
  on environment_settings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own environment settings" on environment_settings;
create policy "Users can insert their own environment settings"
  on environment_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own environment settings" on environment_settings;
create policy "Users can update their own environment settings"
  on environment_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own monitoring sessions" on monitoring_sessions;
create policy "Users can read their own monitoring sessions"
  on monitoring_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own monitoring sessions" on monitoring_sessions;
create policy "Users can insert their own monitoring sessions"
  on monitoring_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own monitoring sessions" on monitoring_sessions;
create policy "Users can update their own monitoring sessions"
  on monitoring_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table sensor_health;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table monitoring_sessions;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
