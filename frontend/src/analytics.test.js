import test from "node:test";
import assert from "node:assert/strict";
import { buildCountryHeatRows, buildTopicCounts } from "./analytics.js";

const NOW = Date.UTC(2026, 1, 25, 17, 0, 0);
const MINUTE_MS = 60 * 1000;

function event({ minAgo, country = null, category = "Other" }) {
  return {
    created_at: new Date(NOW - minAgo * MINUTE_MS).toISOString(),
    timestamp: Math.floor((NOW - minAgo * MINUTE_MS) / 1000),
    country,
    category
  };
}

test("buildCountryHeatRows ranks countries and groups empty country as Unknown", () => {
  const events = [
    event({ minAgo: 2, country: "France" }),
    event({ minAgo: 4, country: "France" }),
    event({ minAgo: 6, country: "Japan" }),
    event({ minAgo: 9, country: "" }),
    event({ minAgo: 12, country: null })
  ];

  const rows = buildCountryHeatRows(events, NOW, { topN: 5, activeWindowMin: 60 });

  assert.equal(rows[0].country, "France");
  assert.equal(rows[0].count, 2);
  assert.equal(rows[1].country, "Unknown");
  assert.equal(rows[1].count, 2);
  assert.equal(rows[2].country, "Japan");
  assert.equal(rows[2].count, 1);
});

test("buildCountryHeatRows computes bar percentages proportional to max count", () => {
  const events = [
    event({ minAgo: 1, country: "A" }),
    event({ minAgo: 2, country: "A" }),
    event({ minAgo: 3, country: "A" }),
    event({ minAgo: 4, country: "A" }),
    event({ minAgo: 5, country: "B" }),
    event({ minAgo: 6, country: "B" })
  ];

  const rows = buildCountryHeatRows(events, NOW, { topN: 2, activeWindowMin: 60 });
  const a = rows.find((row) => row.country === "A");
  const b = rows.find((row) => row.country === "B");

  assert.equal(a.barPct, 100);
  assert.equal(b.barPct, 50);
});

test("hotspot is true when short-window activity spikes over normalized baseline", () => {
  const events = [
    event({ minAgo: 1, country: "Brazil" }),
    event({ minAgo: 2, country: "Brazil" }),
    event({ minAgo: 3, country: "Brazil" }),
    event({ minAgo: 9, country: "Brazil" }),
    event({ minAgo: 14, country: "Brazil" })
  ];

  const [row] = buildCountryHeatRows(events, NOW, {
    topN: 1,
    shortWindowMin: 5,
    baselineWindowMin: 30,
    multiplier: 2,
    minShortCount: 3
  });

  assert.equal(row.country, "Brazil");
  assert.equal(row.hotspot, true);
});

test("hotspot is false when short-window minimum sample is not met", () => {
  const events = [
    event({ minAgo: 1, country: "Spain" }),
    event({ minAgo: 2, country: "Spain" }),
    event({ minAgo: 7, country: "Spain" }),
    event({ minAgo: 8, country: "Spain" })
  ];

  const [row] = buildCountryHeatRows(events, NOW, {
    topN: 1,
    shortWindowMin: 5,
    baselineWindowMin: 30,
    multiplier: 2,
    minShortCount: 3
  });

  assert.equal(row.hotspot, false);
});

test("buildTopicCounts returns counts inside selected window only", () => {
  const events = [
    event({ minAgo: 2, category: "Sports" }),
    event({ minAgo: 7, category: "Sports" }),
    event({ minAgo: 10, category: "Politics" }),
    event({ minAgo: 80, category: "Science" })
  ];

  const counts15m = buildTopicCounts(events, NOW, 15);
  assert.equal(counts15m.get("Sports"), 2);
  assert.equal(counts15m.get("Politics"), 1);
  assert.equal(counts15m.get("Science") || 0, 0);
});
