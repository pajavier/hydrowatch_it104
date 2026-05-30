create extension if not exists "pgcrypto";

create table if not exists water_readings (
  id uuid primary key default gen_random_uuid(),
  turbidity numeric not null,
  created_at timestamptz not null default now()
);

alter table water_readings drop column if exists water_level;
alter table water_readings drop column if exists flow_rate;
alter table water_readings drop column if exists status;
alter table water_readings drop column if exists prediction;
alter table water_readings drop column if exists prediction_confidence;
alter table water_readings drop column if exists source;

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  type text not null,
  message text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  reading_id uuid references water_readings(id) on delete cascade,
  label text not null,
  confidence numeric not null,
  projected_ntu numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists system_logs (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  category text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table water_readings;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table predictions;
alter publication supabase_realtime add table system_logs;
