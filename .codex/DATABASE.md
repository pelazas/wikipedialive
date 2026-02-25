# Database and Retention

## Main table

The worker writes to `public.edits`.

Worker insert payload fields:

- `request_id` (text)
- `title` (text)
- `url` (text)
- `username` (text)
- `comment` (text)
- `change_size` (integer)
- `timestamp` (numeric or timestamp-compatible value from stream)
- `category` (text, AI output)
- `lat` / `lon` (numeric, AI output)
- `country` (text, AI output)
- `quality_score` (integer, absolute change size)
- `raw` (json/jsonb copy of source payload)

Recommended operational columns:

- `id` primary key
- `created_at` default `now()`

## Schema update script

`infra/supabase_schema_updates.sql` adds:

- `quality_score` column if missing
- index on `quality_score`

## Leaderboard view

`infra/supabase_views.sql` defines `public.edits_top_week`:

- Includes rows from last 7 days by `created_at`
- Orders by `abs(change_size)` descending
- Limits to top 200

## Retention options

Option A (DB cron): `infra/supabase_retention.sql`

- Daily delete of rows older than 30 days.
- Optional weekly pruning to top 200 from last 7 days.

Option B (Edge function): `supabase/functions/purge_old_edits/index.ts`

- HTTP function deletes rows where `created_at < cutoff`.
- `RETENTION_DAYS` env var controls cutoff.

Use one retention strategy intentionally; avoid duplicate schedules running with conflicting policies.
