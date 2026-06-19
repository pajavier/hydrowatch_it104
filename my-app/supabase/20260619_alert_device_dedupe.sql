alter table alerts
  add column if not exists device_id text;

create index if not exists alerts_device_dedupe_idx
  on alerts (user_id, device_id, type, severity, created_at desc);
