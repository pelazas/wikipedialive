-- Top edits from the last 7 days (for leaderboard)
create or replace view public.edits_top_week as
select
  id,
  request_id,
  title,
  url,
  username,
  comment,
  change_size,
  timestamp,
  category,
  lat,
  lon,
  country,
  quality_score,
  created_at
from public.edits
where created_at >= now() - interval '7 days'
order by abs(change_size) desc
limit 200;
