# Start Here

## What this project is

`wikipedialive` is a real-time pipeline that:

1. Listens to Wikimedia recent changes.
2. Filters for high-signal edits.
3. Enriches each edit with AI (geo + topic).
4. Stores enriched rows in Supabase.

The frontend is planned but not implemented in this repo.

## Fast component map

- `ingestion/ingest_wikistream.py`: Streams and filters events, POSTs candidates to worker.
- `worker/src/index.js`: Accepts `/ingest`, runs Cloudflare AI prompts, inserts into Supabase.
- `infra/*.sql`: Schema/view/retention SQL scripts.
- `supabase/functions/purge_old_edits/index.ts`: Edge function for retention deletes.
- `docker-compose.yml`: Local multi-service runner (ingestion + worker).

## Golden path (end-to-end)

1. Ingestion receives event from `https://stream.wikimedia.org/v2/stream/recentchange`.
2. `filter_event()` applies bot/type/minor/wiki/namespace/title-size checks.
3. Candidate payload is sent to `POST /ingest` on worker.
4. Worker runs two AI prompts using `env.AI`.
5. Worker builds enriched object and computes `quality_score = abs(change_size)`.
6. If `quality_score >= QUALITY_SCORE_MIN`, worker inserts row into `public.edits`.
7. Response returns enriched JSON regardless of insert success.

## Before you change anything

1. Identify whether your change affects ingestion filtering, enrichment, or persistence.
2. Check for threshold coupling: `MIN_CHAR_CHANGE` (ingestion) vs `QUALITY_SCORE_MIN` (worker).
3. Keep payload contract stable unless you also update all consumers.
4. Prefer small, reversible edits with clear logs.
