export const ANALYTICS_WINDOW_MS = 5 * 60 * 1000;
export const ANALYTICS_REFRESH_MS = 10 * 1000;

function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function toUnixMs(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: values below 1e12 are treated as seconds.
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function editTimestampMs(edit) {
  return (
    toUnixMs(edit?.created_at) ??
    toUnixMs(edit?.timestamp) ??
    toUnixMs(edit?.event_time) ??
    null
  );
}

export function selectActiveWindowEdits(edits, nowMs, windowMs = ANALYTICS_WINDOW_MS) {
  const cutoff = nowMs - windowMs;
  return (Array.isArray(edits) ? edits : []).filter((edit) => {
    const ts = editTimestampMs(edit);
    return typeof ts === "number" && ts >= cutoff && ts <= nowMs;
  });
}

export function computeEventsPerMinute(edits, windowMs = ANALYTICS_WINDOW_MS) {
  if (windowMs <= 0) {
    return 0;
  }
  const count = Array.isArray(edits) ? edits.length : 0;
  return count / (windowMs / 60_000);
}

export function computeClassifiedPercent(edits) {
  const rows = Array.isArray(edits) ? edits : [];
  if (rows.length === 0) {
    return 0;
  }
  const classified = rows.filter((edit) => {
    const value = edit?.category;
    return typeof value === "string" && value.trim() !== "";
  }).length;
  return (classified / rows.length) * 100;
}

export function computeAverageAbsoluteChangeSize(edits) {
  const rows = (Array.isArray(edits) ? edits : [])
    .map((edit) => parseNumeric(edit?.change_size))
    .filter((value) => typeof value === "number");

  if (rows.length === 0) {
    return 0;
  }

  const total = rows.reduce((sum, changeSize) => sum + Math.abs(changeSize), 0);
  return total / rows.length;
}

export function parseSummaryCounters(input) {
  if (!input) {
    return null;
  }

  if (typeof input === "object") {
    const seen = parseNumeric(input.seen);
    const filtered = parseNumeric(input.filtered);
    const dbInsertOk = parseNumeric(input.db_insert_ok);
    const dbInsertFailed = parseNumeric(input.db_insert_failed);
    const enrichedOk = parseNumeric(input.enriched_ok);
    const enrichedFailed = parseNumeric(input.enriched_failed);

    const hasAny =
      seen !== null ||
      filtered !== null ||
      dbInsertOk !== null ||
      dbInsertFailed !== null ||
      enrichedOk !== null ||
      enrichedFailed !== null;

    if (!hasAny) {
      return null;
    }

    return {
      seen,
      filtered,
      db_insert_ok: dbInsertOk,
      db_insert_failed: dbInsertFailed,
      enriched_ok: enrichedOk,
      enriched_failed: enrichedFailed
    };
  }

  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parseSummaryCounters(parsed);
  } catch {
    // Continue with key=value parser.
  }

  const counters = {};
  const re = /\b(seen|filtered|enriched_ok|enriched_failed|db_insert_ok|db_insert_failed)=(-?\d+)\b/g;
  let match = re.exec(trimmed);
  while (match) {
    counters[match[1]] = Number(match[2]);
    match = re.exec(trimmed);
  }

  return Object.keys(counters).length > 0 ? parseSummaryCounters(counters) : null;
}

export function computeFilteredPercent(summaryCounters) {
  const counters = parseSummaryCounters(summaryCounters);
  if (!counters) {
    return null;
  }

  const seen = parseNumeric(counters.seen);
  const filtered = parseNumeric(counters.filtered);
  if (seen === null || filtered === null || seen <= 0) {
    return null;
  }

  return (filtered / seen) * 100;
}

export function computeInsertSuccessRate(summaryCounters) {
  const counters = parseSummaryCounters(summaryCounters);
  if (!counters) {
    return null;
  }

  const ok = parseNumeric(counters.db_insert_ok);
  const failed = parseNumeric(counters.db_insert_failed);
  if (ok === null || failed === null) {
    return null;
  }

  const total = ok + failed;
  if (total <= 0) {
    return null;
  }
  return (ok / total) * 100;
}

export function buildAnalyticsSnapshot({
  edits,
  summaryCounters,
  nowMs = Date.now(),
  windowMs = ANALYTICS_WINDOW_MS
}) {
  const activeWindowEdits = selectActiveWindowEdits(edits, nowMs, windowMs);

  return {
    generatedAtMs: nowMs,
    windowMs,
    windowStartMs: nowMs - windowMs,
    totalEdits: activeWindowEdits.length,
    eventsPerMinute: computeEventsPerMinute(activeWindowEdits, windowMs),
    classifiedPercent: computeClassifiedPercent(activeWindowEdits),
    averageAbsoluteChangeSize: computeAverageAbsoluteChangeSize(activeWindowEdits),
    filteredPercent: computeFilteredPercent(summaryCounters),
    insertSuccessRate: computeInsertSuccessRate(summaryCounters)
  };
}
