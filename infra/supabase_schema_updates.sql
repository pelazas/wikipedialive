-- Add quality_score column (if not already added)
alter table public.edits
  add column if not exists quality_score integer;

create index if not exists edits_quality_score_idx on public.edits (quality_score);
create unique index if not exists edits_request_id_uidx on public.edits (request_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edits_timestamp_positive_chk'
  ) then
    alter table public.edits
      add constraint edits_timestamp_positive_chk
      check ("timestamp" > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edits_quality_score_non_negative_chk'
  ) then
    alter table public.edits
      add constraint edits_quality_score_non_negative_chk
      check (quality_score is null or quality_score >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edits_category_allowed_chk'
  ) then
    alter table public.edits
      add constraint edits_category_allowed_chk
      check (
        category is null or category in ('Sports', 'Politics', 'Science', 'Conflict', 'Pop Culture')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edits_lat_range_chk'
  ) then
    alter table public.edits
      add constraint edits_lat_range_chk
      check (lat is null or (lat >= -90 and lat <= 90));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'edits_lon_range_chk'
  ) then
    alter table public.edits
      add constraint edits_lon_range_chk
      check (lon is null or (lon >= -180 and lon <= 180));
  end if;
end $$;
