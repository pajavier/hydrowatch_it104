alter table water_readings
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table water_readings
  alter column user_id set default auth.uid();

alter table alerts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table alerts
  alter column user_id set default auth.uid();

alter table predictions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table predictions
  alter column user_id set default auth.uid();

alter table system_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table system_logs
  alter column user_id set default auth.uid();

create index if not exists water_readings_user_created_at_idx on water_readings (user_id, created_at);
create index if not exists alerts_user_created_at_idx on alerts (user_id, created_at);
create index if not exists predictions_user_created_at_idx on predictions (user_id, created_at);
create index if not exists system_logs_user_created_at_idx on system_logs (user_id, created_at);

alter table water_readings enable row level security;
alter table alerts enable row level security;
alter table predictions enable row level security;
alter table system_logs enable row level security;

drop policy if exists "Users can read their own water readings" on water_readings;
create policy "Users can read their own water readings"
  on water_readings for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own water readings" on water_readings;
create policy "Users can insert their own water readings"
  on water_readings for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own alerts" on alerts;
create policy "Users can read their own alerts"
  on alerts for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own alerts" on alerts;
create policy "Users can insert their own alerts"
  on alerts for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read their own predictions" on predictions;
create policy "Users can read their own predictions"
  on predictions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own predictions" on predictions;
create policy "Users can insert their own predictions"
  on predictions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from water_readings
      where water_readings.id::text = predictions.reading_id::text
        and water_readings.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read their own system logs" on system_logs;
create policy "Users can read their own system logs"
  on system_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own system logs" on system_logs;
create policy "Users can insert their own system logs"
  on system_logs for insert
  with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table water_readings;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table alerts;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table predictions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table system_logs;
exception
  when duplicate_object then null;
end $$;
