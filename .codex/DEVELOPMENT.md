# Development Workflow

## Prerequisites

- Docker + Docker Compose
- Cloudflare credentials for worker AI usage
- Supabase project + service role key (if testing inserts)

## Environment variables

Set in root `.env` (consumed by `docker-compose.yml`):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QUALITY_SCORE_MIN`

Optional ingestion var:

- `MIN_CHAR_CHANGE` (default `3000`)

## Run locally

```bash
docker compose up --build
```

Expected behavior:

- Worker starts on port `8787`
- Ingestion begins consuming live Wikimedia edits
- Candidate and enriched logs appear in compose output

## Manual checks

Health:

```bash
curl -s http://localhost:8787/health
```

Ingest smoke test:

```bash
curl -s -X POST http://localhost:8787/ingest \
  -H "content-type: application/json" \
  -d '{"request_id":"test-1","title":"Sushi","comment":"Expanded section","change_size":4500,"timestamp":1738713600}'
```

## Editing strategy

1. Change one layer at a time (ingestion, worker, or SQL).
2. If payload shape changes, update producer and consumer in same change.
3. Keep logs informative; include `request_id` whenever possible.
4. Avoid raising event volume accidentally (filter relaxations can increase cost quickly).

## No formal test suite

There are currently no automated tests in repo. For contributions, at minimum:

1. Run local health and ingest smoke tests.
2. Validate worker still handles malformed AI output safely.
3. If editing SQL, test scripts in a non-production Supabase environment first.
