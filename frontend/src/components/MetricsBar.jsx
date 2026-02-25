import React from "react";

const FALLBACK_TEXT = "—";

function formatValue(value, formatter) {
  if (!Number.isFinite(value)) {
    return FALLBACK_TEXT;
  }
  return formatter(value);
}

function Sparkline({ points }) {
  const validPoints = points.filter((point) => Number.isFinite(point));
  if (validPoints.length < 2) {
    return (
      <svg className="metric-sparkline" viewBox="0 0 100 28" role="img" aria-hidden="true">
        <line x1="0" y1="14" x2="100" y2="14" />
      </svg>
    );
  }

  const min = Math.min(...validPoints);
  const max = Math.max(...validPoints);
  const span = max - min || 1;
  const path = points
    .map((point, idx) => {
      const x = (idx / Math.max(points.length - 1, 1)) * 100;
      const normalized = Number.isFinite(point) ? (point - min) / span : 0.5;
      const y = 24 - normalized * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg className="metric-sparkline" viewBox="0 0 100 28" role="img" aria-hidden="true">
      <polyline points={path} />
    </svg>
  );
}

function ActivityMiniChart({ buckets }) {
  const values = Array.isArray(buckets) && buckets.length > 0 ? buckets : Array.from({ length: 30 }, () => 0);
  const maxValue = Math.max(1, ...values);
  const barWidth = 100 / values.length;
  const currentMinuteCount = values[values.length - 1] || 0;
  const totalEvents = values.reduce((sum, value) => sum + value, 0);

  return (
    <article className="metric-tile metric-tile-activity" aria-label="Event activity in last 30 minutes">
      <small>Event activity</small>
      <strong>{totalEvents > 0 ? `${currentMinuteCount}/min` : FALLBACK_TEXT}</strong>
      <svg className="metric-activity-bars" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-hidden="true">
        <line x1="0" y1="27.5" x2="100" y2="27.5" />
        {values.map((value, idx) => {
          const h = (value / maxValue) * 24;
          const y = 27 - h;
          return (
            <rect
              key={`activity-${idx}`}
              x={idx * barWidth + 0.2}
              y={y}
              width={Math.max(barWidth - 0.45, 0.8)}
              height={Math.max(h, 0)}
              rx="0.4"
              className={value > 0 ? "is-active" : ""}
            />
          );
        })}
      </svg>
    </article>
  );
}

export default function MetricsBar({ metrics, activityBuckets }) {
  return (
    <section className="metrics-bar" aria-label="Live metrics">
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-tile" key={metric.id}>
            <small>{metric.label}</small>
            <strong>{formatValue(metric.value, metric.format)}</strong>
            <Sparkline points={metric.sparkline} />
          </article>
        ))}
        <ActivityMiniChart buckets={activityBuckets} />
      </div>
    </section>
  );
}
