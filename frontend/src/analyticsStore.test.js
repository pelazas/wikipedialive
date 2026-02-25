import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyticsStore } from "./analyticsStore.js";

const MINUTE_MS = 60 * 1000;

function makeEvent({ id, createdAtMs }) {
  return {
    request_id: id,
    created_at: new Date(createdAtMs).toISOString(),
    timestamp: Math.floor(createdAtMs / 1000)
  };
}

test("prunes events older than 60 minutes", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const store = createAnalyticsStore({ retentionMs: 60 * MINUTE_MS, pruneIntervalMs: 0 });

  const oldEvent = makeEvent({ id: "old", createdAtMs: now - 61 * MINUTE_MS });
  const keptEvent = makeEvent({ id: "kept", createdAtMs: now - 59 * MINUTE_MS });

  assert.equal(store.ingest(oldEvent, now), false);
  assert.equal(store.ingest(keptEvent, now), true);
  assert.deepEqual(store.getBuffer(now).map((e) => e.request_id), ["kept"]);
});

test("keeps buffer bounded over time while ingesting inserts", () => {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0);
  const store = createAnalyticsStore({ retentionMs: 60 * MINUTE_MS, pruneIntervalMs: 0 });

  for (let i = 0; i < 180; i += 1) {
    const now = start + i * MINUTE_MS;
    const event = makeEvent({ id: `e-${i}`, createdAtMs: now });
    store.ingest(event, now);
  }

  const finalNow = start + 179 * MINUTE_MS;
  const ids = store.getBuffer(finalNow).map((e) => e.request_id);
  assert.equal(ids[0], "e-119");
  assert.equal(ids[ids.length - 1], "e-179");
  assert.equal(ids.length, 61);
});

test("slices window selectors correctly", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const store = createAnalyticsStore({ retentionMs: 60 * MINUTE_MS, pruneIntervalMs: 0 });

  const events = [
    { id: "p15-a", minAgo: 25 },
    { id: "p15-b", minAgo: 17 },
    { id: "l15-a", minAgo: 14 },
    { id: "l15-b", minAgo: 2 }
  ];

  for (const event of events) {
    store.ingest(makeEvent({ id: event.id, createdAtMs: now - event.minAgo * MINUTE_MS }), now);
  }

  assert.deepEqual(
    store.selectLast15m(now).map((e) => e.request_id),
    ["l15-a", "l15-b"]
  );
  assert.deepEqual(
    store.selectPrevious15m(now).map((e) => e.request_id),
    ["p15-a", "p15-b"]
  );
  assert.deepEqual(
    store.selectLast60m(now).map((e) => e.request_id),
    ["p15-a", "p15-b", "l15-a", "l15-b"]
  );
  assert.deepEqual(store.selectPrevious60m(now), []);
});

