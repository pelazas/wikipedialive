import React from "react";

export default function TrendingTopicsPanel({
  topicChips,
  selectedCategory,
  onSelectCategory,
  trendWindow,
  onTrendWindowChange
}) {
  return (
    <article className="dock-card">
      <div className="dock-headline">
        <h2>Trending Topics</h2>
        <div className="window-toggle">
          <button
            type="button"
            className={trendWindow === "15m" ? "is-active" : ""}
            onClick={() => onTrendWindowChange("15m")}
          >
            15m
          </button>
          <button
            type="button"
            className={trendWindow === "1h" ? "is-active" : ""}
            onClick={() => onTrendWindowChange("1h")}
          >
            1h
          </button>
        </div>
      </div>

      <div className="topic-chip-row">
        {topicChips.map((chip) => (
          <button
            key={chip.category}
            type="button"
            className={`topic-chip ${selectedCategory === chip.category ? "is-active" : ""}`}
            onClick={() => onSelectCategory(chip.category)}
          >
            <span>{chip.category}</span>
            <strong>{chip.count}</strong>
            {chip.category === "All" ? null : (
              <small className={chip.delta >= 0 ? "is-positive" : "is-negative"}>
                {chip.delta >= 0 ? "+" : ""}{chip.delta}
              </small>
            )}
          </button>
        ))}
      </div>
    </article>
  );
}
