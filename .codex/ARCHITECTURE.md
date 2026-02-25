# Architecture

## Services

## Ingestion (Python)

File: `ingestion/ingest_wikistream.py`

Responsibilities:

- Opens SSE connection to Wikimedia recent change stream.
- Filters noisy edits.
- Sends candidate edit payload to worker endpoint.
- Logs candidate and enriched responses.

Key filter rules:

- Exclude `bot == true`
- Keep `type in {"edit","new"}`
- Exclude `minor == true`
- Keep only `wiki == "enwiki"`
- Keep main namespace (`id == 0`)
- Exclude known non-article title prefixes (`User:`, `Talk:`, `Template:`, etc.)
- Keep only large edits (`abs(new-old) >= MIN_CHAR_CHANGE`, default `3000`)

## Worker (Cloudflare Worker)

File: `worker/src/index.js`

Endpoints:

- `GET /health` -> `{ ok: true }`
- `POST /ingest` -> enrich + optional insert + return enriched JSON

Worker logic:

1. Validate request JSON.
2. Build geo and classification prompts from title + comment.
3. Run AI model twice (`@cf/meta/llama-3.1-8b-instruct`).
4. Parse JSON outputs; if parse/model fails, fallback to null fields + error text.
5. Compute `quality_score = abs(change_size)`.
6. If Supabase env vars exist and score threshold passes, insert into `public.edits`.

## Persistence (Supabase)

Expected table: `public.edits` with fields used by worker:

- `request_id`, `title`, `url`, `username`, `comment`, `change_size`
- `timestamp`, `category`, `lat`, `lon`, `country`
- `quality_score`, `raw`, `created_at`

Related SQL artifacts:

- `infra/supabase_schema_updates.sql` (quality_score column + index)
- `infra/supabase_views.sql` (`edits_top_week` leaderboard view)
- `infra/supabase_retention.sql` (pg_cron retention jobs)

Retention alternative:

- `supabase/functions/purge_old_edits/index.ts` (HTTP-triggered delete by age)

## Runtime topology

Local compose:

- `ingestion` container posts to `http://worker:8787/ingest`
- `worker` runs `wrangler dev` with env passed via `.dev.vars`

Cloud deployment intent:

- Ingestion can run anywhere with network access to worker endpoint.
- Worker runs on Cloudflare with AI binding and Supabase credentials.
