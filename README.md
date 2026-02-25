# Wikipedia Live: The Pulse of Knowledge

A real-time 3D visualization of the world's editing habits on Wikipedia.

## 1. The Vision

To create a "hypnotic" second-screen experience where users watch Wikipedia evolve live. We filter the noise (bots/minor fixes) to highlight "Big Human Edits." An AI analyzes the context to place the edit on a 3D globe and categorizes it (e.g., Politics, Science, Sports), creating a color-coded map of global intellectual activity.

## 2. The Architecture

We use a Push-Pull architecture. A local Python "Feeder" pushes clean events to the Cloud, where AI enriches them before storage/display.

- **Ingestion (Python):** Listens to the Wikimedia Firehose. Filters 90% of the noise (bots, tiny edits).
- **Intelligence (Cloudflare Workers AI):** Receives "Candidate Edits." Runs 2 AI tasks:
    - **Geotagging:** "Where does this article belong?" (e.g., "Sushi" -> Japan).
    - **Classification:** "What topic is this?" (e.g., Culture, Politics).
- **Memory (Supabase):** Stores the enriched edits. Tracks the "Leaderboard" (Biggest Changes of the Week).
- **Visualization (Frontend):** React + Globe.gl. Subscribes to Supabase Realtime to render dots on the globe instantly.

## 3. Tech Stack

- **Data Source:** Wikimedia EventStreams (Server-Sent Events).
- **Ingestion:** Python (sseclient, requests).
- **AI & Logic:** Cloudflare Workers (Llama-3 or similar text-classification models).
- **Database:** Supabase (PostgreSQL + Realtime subscriptions).
- **Frontend:** React, react-globe.gl (Three.js wrapper), Tailwind CSS.

## 4. Implementation Phases

### Phase 1: The Ingestion Engine (Python)

**Goal:** Connect to the firehose and strictly filter for "quality" edits.

**Task:** Connect to `stream.wikimedia.org/v2/stream/recentchange`.

**Logic:**
- Discard `bot = True`.
- Discard `type != "edit"` or `"new"`.
- Discard length difference `< 500` bytes (ignore typo fixes).
- **Output:** A clean JSON object printed to the console (for now).

### Phase 2: The AI Analyst (Cloudflare Workers)

**Goal:** Give the raw data "Context" (Location & Category).

**Task:** Create a Worker that accepts a POST request with the article title and summary.

**AI Prompts:**
- **Input:** "Article: 'Cristiano Ronaldo', Summary: 'Updated career stats for Al Nassr'."
- **Task 1 (Geo):** Return `{ lat: 39.39, lon: -8.22, country: "Portugal" }`.
- **Task 2 (Class):** Return one of `['Sports', 'Politics', 'Science', 'Conflict', 'Pop Culture']`.

**Action:** Why Cloudflare? It runs close to the user and the AI inference is extremely cheap/fast for this volume.

### Phase 3: The Persistence Layer (Supabase)

**Goal:** Store history and enable real-time frontend updates.

**Table Structure:** `edits (id, title, diff_size, category, lat, lon, timestamp, summary)`.

**Leaderboard Logic:** A SQL View or Cron job that calculates a "Heat Score" (Size of edit * Traffic of page) to populate the "Changes of the Week" list.

### Phase 4: The "Hypnotic" Frontend

**Goal:** A UI that people want to stare at.

**Globe:** Dark mode aesthetic.

**Visual Language:**
- **Colors:** Politics (Red), Science (Blue), Sports (Green), Culture (Yellow).
- **Animation:** When an event arrives, a "ripple" expands from the location on the globe.
- **HUD:** A sleek overlay showing the "Live Feed" on the left and "Top Weekly Edits" at the bottom.

## Frontend Analytics Rules

- **Trending topic windows:** `15m` and `1h`.  
  Each topic chip shows `count` and `delta = active_window_count - previous_equal_window_count`.
- **Category filtering:** Clicking a topic chip filters both the live feed and globe pins. Clicking the active chip toggles back to `All`.
- **Geography heat panel window:** Last `60m`, top 5 countries.
- **Unknown country handling:** Empty/null country values are grouped under `Unknown`.
- **Mini-bar scaling:** `barPct = country_count / max_country_count_in_top5 * 100`.
- **Hotspot rule:** A country is marked `New hotspot` when:
  - last 5-minute count is at least `3`, and
  - last 5-minute count is greater than `2x` its previous 30-minute normalized 5-minute baseline.
