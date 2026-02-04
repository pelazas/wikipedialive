-- Enable pg_cron if not already enabled (Supabase dashboard: Database > Extensions)
-- create extension if not exists pg_cron;

-- Keep only the last 30 days of edits
select
  cron.schedule(
    'purge_edits_daily',
    '0 3 * * *',
    $$
      delete from public.edits
      where created_at < now() - interval '30 days';
    $$
  );

-- Optional: keep only top 200 edits from the last 7 days and delete the rest
-- This is more aggressive and overrides the 30-day rule if you enable it.
-- Uncomment if desired.
-- select
--   cron.schedule(
--     'purge_edits_weekly_top',
--     '30 3 * * 1',
--     $$
--       with ranked as (
--         select id
--         from public.edits
--         where created_at >= now() - interval '7 days'
--         order by abs(change_size) desc
--         offset 200
--       )
--       delete from public.edits where id in (select id from ranked);
--     $$
--   );
