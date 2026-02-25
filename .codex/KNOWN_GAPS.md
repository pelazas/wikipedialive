# Known Gaps and Risks

## Product/implementation gaps

1. Frontend is not implemented in this repository.
2. No automated tests currently exist.
3. Local compose does not include Supabase service container; uses external Supabase.

## Technical risks

1. LLM responses may be non-JSON; current code catches errors but enrichment quality can degrade.
2. AI category output is unconstrained beyond prompt instruction; model can still drift.
3. Two separate thresholds (`MIN_CHAR_CHANGE` and `QUALITY_SCORE_MIN`) can diverge and confuse expected throughput.
4. Stream payload shape changes from Wikimedia could break assumptions if not monitored.

## Recommended next improvements

1. Add contract tests for `POST /ingest` and AI parse fallbacks.
2. Add schema migration source-of-truth for `public.edits` table definition.
3. Enforce category normalization server-side (map unknown labels to `Other` or null).
4. Add minimal observability metrics (ingested count, filtered count, insert success/failure).
