create extension if not exists "pgcrypto";

create table if not exists water_readings (
  id uuid primary key default gen_random_uuid(),
  turbidity numeric not null,
  water_level numeric not null,
  flow_rate numeric not null,
  status text not null,
  prediction text not null,
  prediction_confidence numeric not null,
  source text not null default 'simulated',
  created_at timestamptz not null default now()
);

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
