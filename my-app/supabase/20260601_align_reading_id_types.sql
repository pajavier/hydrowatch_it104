do $$
declare
  water_reading_id_type text;
  table_name text;
  constraint_name text;
  target_type text;
begin
  select a.atttypid::regtype::text
    into water_reading_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'water_readings'
    and a.attname = 'id'
    and not a.attisdropped;

  if water_reading_id_type is null then
    raise exception 'water_readings.id was not found.';
  end if;

  if water_reading_id_type in ('bigint', 'integer') then
    target_type := water_reading_id_type;
  elsif water_reading_id_type = 'uuid' then
    create extension if not exists "pgcrypto";
    target_type := 'uuid';
    alter table water_readings
      alter column id set default gen_random_uuid();
  else
    raise exception 'Unsupported water_readings.id type: %', water_reading_id_type;
  end if;

  foreach table_name in array array['predictions', 'alerts', 'system_logs']
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    if not exists (
      select 1
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and a.attname = 'reading_id'
        and not a.attisdropped
    ) then
      if table_name = 'predictions' then
        execute format('alter table public.%I add column reading_id %s', table_name, target_type);
      else
        continue;
      end if;
    end if;

    for constraint_name in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = table_name
        and con.contype = 'f'
        and exists (
          select 1
          from unnest(con.conkey) column_attnum
          join pg_attribute attr
            on attr.attrelid = con.conrelid
           and attr.attnum = column_attnum
          where attr.attname = 'reading_id'
        )
    loop
      execute format('alter table public.%I drop constraint %I', table_name, constraint_name);
    end loop;

    execute format('alter table public.%I alter column reading_id drop not null', table_name);

    if target_type in ('bigint', 'integer') then
      execute format(
        'alter table public.%I alter column reading_id type %s using case when reading_id is null then null when reading_id::text ~ ''^[0-9]+$'' then reading_id::text::%s else null end',
        table_name,
        target_type,
        target_type
      );
    else
      execute format(
        'alter table public.%I alter column reading_id type uuid using case when reading_id is null then null when reading_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then reading_id::text::uuid else null end',
        table_name
      );
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (reading_id) references public.water_readings(id) on delete cascade',
      table_name,
      table_name || '_reading_id_fkey'
    );
  end loop;
end $$;

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
