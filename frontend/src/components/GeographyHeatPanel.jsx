import React from "react";

export default function GeographyHeatPanel({ rows }) {
  return (
    <article className="dock-card">
      <div className="dock-headline">
        <h2>Geography Heat</h2>
        <span>Last 60m</span>
      </div>

      <div className="geo-list">
        {rows.length === 0 ? <p className="geo-empty">No country activity yet.</p> : null}
        {rows.map((row) => (
          <div key={row.country} className="geo-row">
            <div className="geo-row-head">
              <strong>{row.country}</strong>
              <span>{row.count}</span>
            </div>
            <div className="geo-bar-track">
              <div className="geo-bar-fill" style={{ width: `${row.barPct}%` }} />
            </div>
            {row.hotspot ? <span className="hotspot-badge">New hotspot</span> : null}
          </div>
        ))}
      </div>
    </article>
  );
}
