const MINUTE_MS = 60 * 1000;

function toEpochMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) {
      return value;
    }
    if (value > 0) {
      return value * 1000;
    }
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function eventTimeMs(event) {
  return toEpochMs(event?.timestamp) ?? toEpochMs(event?.created_at);
}

export function inLastWindow(event, nowMs, windowMinutes) {
  const time = eventTimeMs(event);
  if (!time) {
    return false;
  }
  return time >= nowMs - windowMinutes * MINUTE_MS && time <= nowMs;
}

export function buildTopicCounts(events, nowMs, windowMinutes = 60) {
  const counts = new Map();
  for (const event of events) {
    if (!inLastWindow(event, nowMs, windowMinutes)) {
      continue;
    }
    const category = event?.category || "Other";
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return counts;
}

export function buildCountryHeatRows(events, nowMs, options = {}) {
  const topN = options.topN ?? 5;
  const activeWindowMin = options.activeWindowMin ?? 60;
  const shortWindowMin = options.shortWindowMin ?? 5;
  const baselineWindowMin = options.baselineWindowMin ?? 30;
  const multiplier = options.multiplier ?? 2;
  const minShortCount = options.minShortCount ?? 3;

  const activeStart = nowMs - activeWindowMin * MINUTE_MS;
  const shortStart = nowMs - shortWindowMin * MINUTE_MS;
  const baselineStart = shortStart - baselineWindowMin * MINUTE_MS;

  const counts = new Map();
  const shortCounts = new Map();
  const baselineCounts = new Map();

  for (const event of events) {
    const eventMs = eventTimeMs(event);
    if (!eventMs) {
      continue;
    }

    const countryRaw = event?.country;
    const country = typeof countryRaw === "string" && countryRaw.trim() ? countryRaw.trim() : "Unknown";

    if (eventMs >= activeStart && eventMs <= nowMs) {
      counts.set(country, (counts.get(country) || 0) + 1);
    }
    if (eventMs >= shortStart && eventMs <= nowMs) {
      shortCounts.set(country, (shortCounts.get(country) || 0) + 1);
    } else if (eventMs >= baselineStart && eventMs < shortStart) {
      baselineCounts.set(country, (baselineCounts.get(country) || 0) + 1);
    }
  }

  const rows = Array.from(counts.entries())
    .map(([country, count]) => {
      const shortCount = shortCounts.get(country) || 0;
      const baselineCount = baselineCounts.get(country) || 0;
      const baselineNormalized = baselineCount * (shortWindowMin / baselineWindowMin);
      const hotspot = shortCount >= minShortCount && (
        baselineCount === 0 || shortCount > multiplier * baselineNormalized
      );

      return {
        country,
        count,
        shortCount,
        baselineCount,
        hotspot
      };
    })
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
    .slice(0, topN);

  const maxCount = rows.reduce((max, row) => Math.max(max, row.count), 0);

  return rows.map((row) => ({
    ...row,
    barPct: maxCount > 0 ? Math.max(6, Math.round((row.count / maxCount) * 100)) : 0
  }));
}

