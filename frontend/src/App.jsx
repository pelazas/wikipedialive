import React, { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import MetricsBar from "./components/MetricsBar";
import TrendingTopicsPanel from "./components/TrendingTopicsPanel";
import GeographyHeatPanel from "./components/GeographyHeatPanel";
import { buildCountryHeatRows, buildTopicCounts, eventTimeMs, inLastWindow } from "./analytics";
import { supabase } from "./supabase";

const CATEGORY_COLORS = {
  Politics: "#ff4f4f",
  Science: "#39b7ff",
  Sports: "#45d681",
  Conflict: "#ff8a3d",
  "Pop Culture": "#ffd84d",
  Other: "#c0c8d6"
};
const CATEGORY_ORDER = ["Politics", "Science", "Sports", "Conflict", "Pop Culture", "Other"];

const MAX_FEED = 140;
const FEED_RENDER_LIMIT = 40;
const MAX_GLOBE_POINTS = 240;
const MAX_RECENT_EVENTS = 5000;
const RECENT_RETENTION_MIN = 120;
const METRIC_WINDOW_MIN = 15;
const SPARK_WINDOW_MIN = 60;
const SPARK_BUCKETS = 20;
const ACTIVITY_WINDOW_MIN = 30;
const ACTIVITY_BUCKETS = 30;
const RING_LIFE_MS = 4500;
const DEFAULT_GLOBE_VIEW = { lat: 20, lng: 0, altitude: 1.45 };
const LAND_GEOJSON_URL = "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson";
const OCEAN_TEXTURE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024"><rect width="100%" height="100%" fill="#3f87ff"/></svg>'
)}`;

function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
}

function shapeEdit(row) {
  return {
    request_id: row.request_id,
    title: row.title,
    url: row.url,
    username: row.username,
    comment: row.comment,
    category: row.category || "Other",
    lat: row.lat,
    lon: row.lon,
    country: row.country,
    change_size: row.change_size,
    quality_score: row.quality_score,
    created_at: row.created_at,
    timestamp: row.timestamp
  };
}

function pruneRecentEvents(events, nowMs) {
  const cutoff = nowMs - RECENT_RETENTION_MIN * 60 * 1000;
  const filtered = events.filter((event) => {
    const t = eventTimeMs(event);
    return t !== null && t >= cutoff && t <= nowMs;
  });
  if (filtered.length <= MAX_RECENT_EVENTS) {
    return filtered;
  }
  return filtered.slice(filtered.length - MAX_RECENT_EVENTS);
}

function hasGeo(event) {
  return Number.isFinite(event?.lat) && Number.isFinite(event?.lon);
}

function isInsertSuccess(event) {
  const hasKeys = Boolean(event?.request_id && event?.title && event?.url);
  return hasKeys && eventTimeMs(event) !== null;
}

function toPercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

function avgChange(events) {
  const nums = events
    .map((event) => event?.change_size)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .map((value) => Math.abs(value));

  if (nums.length === 0) {
    return null;
  }
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function buildBuckets(events, nowMs, totalMinutes, bucketCount) {
  const totalMs = totalMinutes * 60 * 1000;
  const bucketMs = totalMs / bucketCount;
  const start = nowMs - totalMs;
  const buckets = Array.from({ length: bucketCount }, () => []);

  for (const event of events) {
    const ts = eventTimeMs(event);
    if (!Number.isFinite(ts) || ts < start || ts > nowMs) {
      continue;
    }
    const rawIdx = Math.floor((ts - start) / bucketMs);
    const idx = Math.min(bucketCount - 1, Math.max(0, rawIdx));
    buckets[idx].push(event);
  }
  return buckets;
}

function buildPointElement(edit) {
  const root = document.createElement("div");
  root.className = "globe-point";
  if (edit?.isActive) {
    root.classList.add("is-active", "is-visible");
  }
  root.style.setProperty("--point-color", categoryColor(edit?.category));

  const avatar = document.createElement("img");
  avatar.className = "globe-point-avatar";
  avatar.alt = edit?.username || "Editor";
  avatar.src = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(edit?.username || edit?.request_id || "wiki")}`;

  const pulse = document.createElement("span");
  pulse.className = "globe-point-pulse";

  const tooltip = document.createElement("div");
  tooltip.className = "globe-point-tooltip";

  const title = document.createElement("strong");
  title.textContent = edit?.title || "Unknown article";
  const meta = document.createElement("small");
  meta.textContent = `${edit?.category || "Other"} | ${edit?.country || "Unknown"} | ${edit?.change_size > 0 ? "+" : ""}${edit?.change_size || 0}`;
  const byline = document.createElement("small");
  byline.textContent = `by ${edit?.username || "Unknown"}`;

  tooltip.appendChild(title);
  tooltip.appendChild(meta);
  tooltip.appendChild(byline);
  root.appendChild(avatar);
  root.appendChild(pulse);
  root.appendChild(tooltip);

  root.addEventListener("mouseenter", () => root.classList.add("is-visible"));
  root.addEventListener("mouseleave", () => {
    if (!root.classList.contains("is-active")) {
      root.classList.remove("is-visible");
    }
  });

  return root;
}

export default function App() {
  const globeRef = useRef(null);
  const selectedCategoryRef = useRef("All");
  const hoveredFeedIdRef = useRef(null);

  const configureGlobeControls = () => {
    const controls = globeRef.current?.controls?.();
    if (!controls) {
      return;
    }

    // Keep drag-to-rotate interaction, but disable wheel zoom.
    controls.enableZoom = false;
    controls.zoomSpeed = 0;
  };

  const [latestEdits, setLatestEdits] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [rings, setRings] = useState([]);
  const [landPolygons, setLandPolygons] = useState([]);
  const [viewport, setViewport] = useState({ width: 1200, height: 760 });
  const [error, setError] = useState("");
  const [focusedPointId, setFocusedPointId] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [trendWindow, setTrendWindow] = useState("15m");

  const focusEditOnGlobe = (edit, options = {}) => {
    const shouldAddRing = Boolean(options.addRing);
    const force = Boolean(options.force);
    if (!edit?.request_id) {
      return;
    }

    if (!force && focusedPointId === edit.request_id) {
      return;
    }

    setFocusedPointId(edit.request_id);

    if (!Number.isFinite(edit.lat) || !Number.isFinite(edit.lon)) {
      return;
    }

    globeRef.current?.pointOfView({ lat: edit.lat, lng: edit.lon, altitude: 1.8 }, 1200);

    if (shouldAddRing) {
      const ring = {
        id: `${edit.request_id}-${Date.now()}`,
        lat: edit.lat,
        lon: edit.lon,
        category: edit.category,
        createdAtMs: Date.now()
      };
      setRings((prev) => [ring, ...prev].slice(0, MAX_GLOBE_POINTS));
    }
  };

  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadLand() {
      try {
        const response = await fetch(LAND_GEOJSON_URL);
        if (!response.ok) {
          return;
        }
        const geojson = await response.json();
        if (mounted && Array.isArray(geojson?.features)) {
          setLandPolygons(geojson.features);
        }
      } catch {
        // Keep rendering even if this fetch fails.
      }
    }
    loadLand();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      globeRef.current?.pointOfView(DEFAULT_GLOBE_VIEW, 0);
      configureGlobeControls();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setError("Missing Supabase env vars: set VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY or SUPABASE_URL/SUPABASE_ANON_KEY");
      return undefined;
    }

    let active = true;

    async function bootstrap() {
      const cutoffIso = new Date(Date.now() - SPARK_WINDOW_MIN * 60 * 1000).toISOString();
      const [latestRes, recentRes] = await Promise.all([
        supabase
          .from("edits")
          .select("request_id,title,url,username,comment,category,lat,lon,country,change_size,quality_score,created_at,timestamp")
          .order("created_at", { ascending: false })
          .limit(MAX_FEED),
        supabase
          .from("edits")
          .select("request_id,title,url,username,comment,category,lat,lon,country,change_size,quality_score,created_at,timestamp")
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: false })
          .limit(MAX_RECENT_EVENTS)
      ]);

      if (!active) {
        return;
      }
      if (latestRes.error || recentRes.error) {
        setError(latestRes.error?.message || recentRes.error?.message || "Failed to fetch data");
        return;
      }

      const latest = (latestRes.data || []).map(shapeEdit);
      const recent = (recentRes.data || []).map(shapeEdit);
      setLatestEdits(latest);
      setRecentEvents(pruneRecentEvents(recent, Date.now()));
    }

    bootstrap();

    const channel = supabase
      .channel("edits_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "edits" },
        (payload) => {
          const next = shapeEdit(payload.new);
          const matchesFilter =
            selectedCategoryRef.current === "All" || next.category === selectedCategoryRef.current;
          const isHoverLocked = hoveredFeedIdRef.current !== null;

          setLatestEdits((prev) => [next, ...prev].slice(0, MAX_FEED));
          setRecentEvents((prev) => pruneRecentEvents([next, ...prev], Date.now()));

          if (matchesFilter && !isHoverLocked) {
            focusEditOnGlobe(next, { addRing: true });
          } else if (Number.isFinite(next.lat) && Number.isFinite(next.lon)) {
            const ring = {
              id: `${next.request_id}-${Date.now()}`,
              lat: next.lat,
              lon: next.lon,
              category: next.category,
              createdAtMs: Date.now()
            };
            setRings((prev) => [ring, ...prev].slice(0, MAX_GLOBE_POINTS));
          }
        }
      )
      .subscribe();

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setRings((prev) => prev.filter((ring) => now - ring.createdAtMs < RING_LIFE_MS));
    }, 600);

    return () => {
      active = false;
      clearInterval(cleanupInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredEdits = useMemo(() => {
    if (selectedCategory === "All") {
      return latestEdits;
    }
    return latestEdits.filter((edit) => edit.category === selectedCategory);
  }, [latestEdits, selectedCategory]);

  useEffect(() => {
    if (!focusedPointId) {
      return;
    }
    if (!filteredEdits.some((edit) => edit.request_id === focusedPointId)) {
      setFocusedPointId(null);
    }
  }, [focusedPointId, filteredEdits]);

  const globePoints = useMemo(() => {
    return filteredEdits
      .filter((edit) => Number.isFinite(edit.lat) && Number.isFinite(edit.lon))
      .slice(0, MAX_GLOBE_POINTS)
      .map((edit) => ({ ...edit, isActive: edit.request_id === focusedPointId }));
  }, [filteredEdits, focusedPointId]);

  const trendWindowMin = trendWindow === "15m" ? 15 : 60;
  const topicCounts = useMemo(
    () => buildTopicCounts(recentEvents, nowMs, trendWindowMin),
    [recentEvents, nowMs, trendWindowMin]
  );

  const previousTopicCounts = useMemo(() => {
    const counts = new Map();
    const start = nowMs - trendWindowMin * 2 * 60 * 1000;
    const end = nowMs - trendWindowMin * 60 * 1000;

    for (const event of recentEvents) {
      const t = eventTimeMs(event);
      if (t === null || t < start || t >= end) {
        continue;
      }
      const category = event.category || "Other";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return counts;
  }, [recentEvents, nowMs, trendWindowMin]);

  const topicChips = useMemo(() => {
    const rows = CATEGORY_ORDER.map((category) => {
      const count = topicCounts.get(category) || 0;
      const previous = previousTopicCounts.get(category) || 0;
      return { category, count, delta: count - previous };
    }).sort((a, b) => b.count - a.count);

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return [{ category: "All", count: total, delta: 0 }, ...rows];
  }, [topicCounts, previousTopicCounts]);

  const geographyRows = useMemo(
    () => buildCountryHeatRows(recentEvents, nowMs, { topN: 5 }),
    [recentEvents, nowMs]
  );

  const metrics = useMemo(() => {
    const inWindow = recentEvents.filter((event) => inLastWindow(event, nowMs, METRIC_WINDOW_MIN));
    const buckets = buildBuckets(recentEvents, nowMs, SPARK_WINDOW_MIN, SPARK_BUCKETS);
    const bucketMinutes = SPARK_WINDOW_MIN / SPARK_BUCKETS;

    return [
      {
        id: "events-min",
        label: "Events/min",
        value: inWindow.length > 0 ? inWindow.length / METRIC_WINDOW_MIN : null,
        format: (value) => value.toFixed(1),
        sparkline: buckets.map((bucket) => bucket.length / bucketMinutes)
      },
      {
        id: "pct-filtered",
        label: "% filtered",
        value: toPercent(inWindow.filter((event) => !hasGeo(event)).length, inWindow.length),
        format: (value) => `${value.toFixed(1)}%`,
        sparkline: buckets.map((bucket) => toPercent(bucket.filter((event) => !hasGeo(event)).length, bucket.length))
      },
      {
        id: "avg-change",
        label: "Avg change",
        value: avgChange(inWindow),
        format: (value) => `${Math.round(value)}`,
        sparkline: buckets.map((bucket) => avgChange(bucket))
      },
      {
        id: "insert-success",
        label: "Insert success",
        value: toPercent(inWindow.filter((event) => isInsertSuccess(event)).length, inWindow.length),
        format: (value) => `${value.toFixed(1)}%`,
        sparkline: buckets.map((bucket) => toPercent(bucket.filter((event) => isInsertSuccess(event)).length, bucket.length))
      }
    ];
  }, [recentEvents, nowMs]);

  const activityBuckets = useMemo(() => {
    const buckets = buildBuckets(recentEvents, nowMs, ACTIVITY_WINDOW_MIN, ACTIVITY_BUCKETS);
    return buckets.map((bucket) => bucket.length);
  }, [recentEvents, nowMs]);

  const globeWidth = Math.max(560, Math.floor(viewport.width * 0.72));
  const globeHeight = Math.max(480, Math.floor(viewport.height * 0.86));

  return (
    <div className="app-shell">
      <div className="aurora-bg" />
      <MetricsBar metrics={metrics} activityBuckets={activityBuckets} />

      <aside className="feed-panel">
        <h1>Wikipedia Live</h1>
        <p className="panel-subtitle">Latest edits</p>
        {error ? <div className="error-banner">{error}</div> : null}

        <div className="feed-list">
          {filteredEdits.slice(0, FEED_RENDER_LIMIT).map((edit) => (
            <article
              className="feed-item"
              key={edit.request_id}
              onMouseEnter={() => {
                hoveredFeedIdRef.current = edit.request_id;
                focusEditOnGlobe(edit, { force: true });
              }}
              onMouseLeave={() => {
                if (hoveredFeedIdRef.current === edit.request_id) {
                  hoveredFeedIdRef.current = null;
                }
              }}
            >
              <div className="feed-topline">
                <span className="dot" style={{ backgroundColor: categoryColor(edit.category) }} />
                <span className="category">{edit.category || "Other"}</span>
                <span className="delta">{edit.change_size > 0 ? "+" : ""}{edit.change_size}</span>
              </div>
              <a className="title" href={edit.url} target="_blank" rel="noreferrer">
                {edit.title}
              </a>
              <p className="meta">{edit.username || "Unknown"}</p>
            </article>
          ))}
        </div>
      </aside>

      <main
        className="globe-stage"
        onPointerDown={() => setFocusedPointId(null)}
        onWheel={() => setFocusedPointId(null)}
      >
        <Globe
          ref={globeRef}
          onGlobeReady={configureGlobeControls}
          width={globeWidth}
          height={globeHeight}
          globeImageUrl={OCEAN_TEXTURE}
          backgroundColor="rgba(0,0,0,0)"
          showAtmosphere
          atmosphereColor="#9acbff"
          atmosphereAltitude={0.12}
          polygonsData={landPolygons}
          polygonCapColor={(d) => {
            const name = d?.properties?.name || d?.properties?.NAME || "";
            return name === "Antarctica" || name === "Greenland" ? "#f4f7ff" : "#72c26b";
          }}
          polygonSideColor={() => "#63ae5d"}
          polygonStrokeColor={() => "#eaf2ff"}
          polygonAltitude={0.004}
          pointsData={globePoints}
          pointLat="lat"
          pointLng="lon"
          pointAltitude={0.01}
          pointRadius={0.06}
          pointColor={(d) => categoryColor(d.category)}
          htmlElementsData={globePoints}
          htmlLat="lat"
          htmlLng="lon"
          htmlAltitude={0.03}
          htmlElement={(d) => buildPointElement(d)}
          htmlTransitionDuration={700}
          ringsData={rings}
          ringLat="lat"
          ringLng="lon"
          ringColor={(d) => [categoryColor(d.category), "rgba(0,0,0,0)"]}
          ringMaxRadius={6}
          ringPropagationSpeed={2.5}
          ringRepeatPeriod={RING_LIFE_MS}
        />
      </main>

      <section className="weekly-strip">
        <div className="dock-grid">
          <TrendingTopicsPanel
            topicChips={topicChips}
            selectedCategory={selectedCategory}
            onSelectCategory={(category) => {
              setSelectedCategory((current) => (current === category ? "All" : category));
            }}
            trendWindow={trendWindow}
            onTrendWindowChange={setTrendWindow}
          />
          <GeographyHeatPanel rows={geographyRows} />
        </div>
      </section>
    </div>
  );
}
