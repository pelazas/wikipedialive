# Contribution Guidelines for Agents

## Scope discipline

1. Keep changes tightly scoped to requested behavior.
2. Do not mix unrelated refactors with feature or bug fixes.
3. Preserve existing payload contracts unless explicitly changing downstream consumers.

## Reliability rules

1. Never let AI parse failures crash `/ingest`.
2. Keep request handling deterministic for invalid input (`400` on invalid JSON).
3. Maintain `request_id` propagation in logs for traceability.
4. Prefer null-safe defaults over throwing when optional fields are missing.

## Performance and cost guardrails

1. Be cautious adjusting `MIN_CHAR_CHANGE` or `QUALITY_SCORE_MIN`; lower thresholds can multiply AI and DB cost.
2. Keep AI prompts concise and JSON-only.
3. Avoid additional external calls in hot path unless justified.

## Security rules

1. Never log secrets (`SUPABASE_SERVICE_ROLE_KEY`, tokens).
2. Keep service role usage server-side only.
3. Avoid storing unnecessary sensitive user data.

## Validation checklist before finalizing

1. `docker compose up --build` starts without runtime errors.
2. `GET /health` returns success.
3. `POST /ingest` returns enriched JSON for a valid sample payload.
4. If DB enabled, insert succeeds for score above threshold.
5. If DB disabled, worker still returns enriched output and logs clear insert error.

## Documentation rule

If you change behavior in filtering, enrichment, DB schema, or retention, update `.codex` docs in same change.
