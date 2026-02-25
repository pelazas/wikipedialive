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

export default function MetricsBar({ metrics }) {
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
      </div>
    </section>
  );
}
