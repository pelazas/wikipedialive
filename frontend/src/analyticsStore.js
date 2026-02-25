const MINUTE_MS = 60 * 1000;
const DEFAULT_RETENTION_MS = 60 * MINUTE_MS;
const DEFAULT_PRUNE_INTERVAL_MS = 5000;

function parseEventTimeMs(event) {
  if (!event) {
    return null;
  }

  if (typeof event.created_at === "string") {
    const createdAtMs = Date.parse(event.created_at);
    if (Number.isFinite(createdAtMs)) {
      return createdAtMs;
    }
  }

  const ts = event.timestamp;
  if (typeof ts === "number" && Number.isFinite(ts)) {
    // Ingest pipeline emits seconds, but this guards accidental millisecond input.
    return ts > 1e12 ? ts : ts * 1000;
  }

  return null;
}

function lowerBound(items, targetMs) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (items[mid].timeMs < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function toWindow(items, startMs, endMs) {
  const startIdx = lowerBound(items, startMs);
  const endIdx = lowerBound(items, endMs);
  return items.slice(startIdx, endIdx).map((entry) => entry.event);
}

export function createAnalyticsStore({
  retentionMs = DEFAULT_RETENTION_MS,
  pruneIntervalMs = DEFAULT_PRUNE_INTERVAL_MS
} = {}) {
  let buffer = [];
  let pruneTimer = null;
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function prune(nowMs = Date.now()) {
    const cutoffMs = nowMs - retentionMs;
    const firstValidIdx = lowerBound(buffer, cutoffMs);
    if (firstValidIdx > 0) {
      buffer = buffer.slice(firstValidIdx);
      notify();
    }
    return buffer.length;
  }

  function ingest(event, nowMs = Date.now()) {
    const eventTimeMs = parseEventTimeMs(event);
    if (!Number.isFinite(eventTimeMs)) {
      return false;
    }

    const cutoffMs = nowMs - retentionMs;
    if (eventTimeMs < cutoffMs) {
      prune(nowMs);
      return false;
    }

    prune(nowMs);

    // Realtime inserts are usually append-only by time, but keep insertion ordered.
    if (buffer.length === 0 || buffer[buffer.length - 1].timeMs <= eventTimeMs) {
      buffer.push({ timeMs: eventTimeMs, event });
    } else {
      const idx = lowerBound(buffer, eventTimeMs);
      buffer.splice(idx, 0, { timeMs: eventTimeMs, event });
    }

    notify();
    return true;
  }

  function getBuffer(nowMs = Date.now()) {
    prune(nowMs);
    return buffer.map((entry) => entry.event);
  }

  function selectLast15m(nowMs = Date.now()) {
    prune(nowMs);
    return toWindow(buffer, nowMs - 15 * MINUTE_MS, nowMs + 1);
  }

  function selectLast60m(nowMs = Date.now()) {
    prune(nowMs);
    return toWindow(buffer, nowMs - 60 * MINUTE_MS, nowMs + 1);
  }

  function selectPrevious15m(nowMs = Date.now()) {
    prune(nowMs);
    return toWindow(buffer, nowMs - 30 * MINUTE_MS, nowMs - 15 * MINUTE_MS);
  }

  function selectPrevious60m(nowMs = Date.now()) {
    prune(nowMs);
    return toWindow(buffer, nowMs - 120 * MINUTE_MS, nowMs - 60 * MINUTE_MS);
  }

  function subscribe(listener) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  function reset() {
    buffer = [];
    notify();
  }

  if (pruneIntervalMs > 0) {
    pruneTimer = setInterval(() => {
      prune(Date.now());
    }, pruneIntervalMs);
    if (typeof pruneTimer.unref === "function") {
      pruneTimer.unref();
    }
  }

  return {
    ingest,
    prune,
    getBuffer,
    selectLast15m,
    selectLast60m,
    selectPrevious15m,
    selectPrevious60m,
    subscribe,
    reset
  };
}

export const analyticsStore = createAnalyticsStore();
