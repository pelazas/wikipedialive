# Edits Data Contract (v1)

This contract defines the payload accepted by `POST /ingest` in the worker.

## Required fields

- `request_id`: string (UUID)
- `title`: string (non-empty)
- `url`: string (absolute URL)
- `user`: string (non-empty)
- `comment`: string (can be empty)
- `change_size`: integer
- `timestamp`: integer (Unix epoch seconds, UTC, > 0)

## Allowed fields

Only the required fields above are accepted. Unknown fields are rejected.

## Worker response enrichment

- `quality_score`: integer (`abs(change_size)`)
- `geo`: object with
  - `lat`: number in `[-90, 90]` or `null`
  - `lon`: number in `[-180, 180]` or `null`
  - `country`: non-empty string or `null`
- `classification`: object with
  - `category`: one of `Sports | Politics | Science | Conflict | Pop Culture`, otherwise `null`

## Validation behavior

- Invalid payloads are rejected at worker ingress with HTTP `422` and structured validation errors.
- Worker only calls AI and persists data after payload validation succeeds.
- Database constraints enforce category and coordinate bounds for persisted rows.
