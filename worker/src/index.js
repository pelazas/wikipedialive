export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" }
      });
    }

    if (request.method !== "POST" || pathname !== "/ingest") {
      return new Response("Not Found", { status: 404 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const requestId = payload?.request_id || "unknown";
    const title = payload?.title || "";
    const comment = payload?.comment || "";

    const CATEGORY_WHITELIST = new Set([
      "Sports",
      "Politics",
      "Science",
      "Conflict",
      "Pop Culture",
      "Other"
    ]);

    function normalizeCategory(rawCategory) {
      if (typeof rawCategory !== "string") {
        return "Other";
      }

      const normalized = rawCategory.trim().toLowerCase();
      const mapping = {
        sports: "Sports",
        politics: "Politics",
        science: "Science",
        conflict: "Conflict",
        "pop culture": "Pop Culture",
        popculture: "Pop Culture",
        entertainment: "Pop Culture",
        other: "Other"
      };

      const candidate = mapping[normalized] || "Other";
      return CATEGORY_WHITELIST.has(candidate) ? candidate : "Other";
    }

    function sanitizeGeo(rawGeo) {
      const lat = Number(rawGeo?.lat);
      const lon = Number(rawGeo?.lon);
      const country = typeof rawGeo?.country === "string" && rawGeo.country.trim()
        ? rawGeo.country.trim()
        : null;

      const latValid = Number.isFinite(lat) && lat >= -90 && lat <= 90;
      const lonValid = Number.isFinite(lon) && lon >= -180 && lon <= 180;

      return {
        lat: latValid ? lat : null,
        lon: lonValid ? lon : null,
        country
      };
    }

    async function runModelJsonWithRetry(prompt, fallbackResult, taskName) {
      const model = "@cf/meta/llama-3.1-8b-instruct";

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const response = await env.AI.run(model, { prompt });
          const text = typeof response === "string" ? response : response?.response;

          if (typeof text !== "string") {
            throw new Error("Model returned non-text response");
          }

          return JSON.parse(text);
        } catch (err) {
          if (attempt === 1) {
            console.log(
              `[ENRICH:${requestId}] ${taskName} attempt ${attempt} failed, retrying once: ${String(err)}`
            );
            continue;
          }

          console.log(
            `[ENRICH:${requestId}] ${taskName} failed after retry, using fallback: ${String(err)}`
          );
          return fallbackResult;
        }
      }

      return fallbackResult;
    }

    const geoPrompt = [
      "You are a geo-tagging assistant.",
      "Given a Wikipedia article title and edit comment, return a JSON object with:",
      '{ "lat": number, "lon": number, "country": string }',
      "Only return JSON. No extra text.",
      "",
      `Article: \"${title}\"`,
      `Summary: \"${comment}\"`
    ].join("\n");

    const classPrompt = [
      "You are a topic classification assistant.",
      "Given a Wikipedia article title and edit comment, return JSON with:",
      '{ "category": "Sports"|"Politics"|"Science"|"Conflict"|"Pop Culture"|"Other" }',
      "Only return JSON. No extra text.",
      "",
      `Article: \"${title}\"`,
      `Summary: \"${comment}\"`
    ].join("\n");

    const rawGeoResult = await runModelJsonWithRetry(
      geoPrompt,
      { lat: null, lon: null, country: null },
      "geo"
    );

    const rawClassResult = await runModelJsonWithRetry(
      classPrompt,
      { category: "Other" },
      "classification"
    );

    const geoResult = sanitizeGeo(rawGeoResult);
    const classResult = { category: normalizeCategory(rawClassResult?.category) };

    const qualityScore = Math.abs(payload?.change_size ?? 0);
    const qualityMin = Number(env.QUALITY_SCORE_MIN || 3000);

    const enriched = {
      ...payload,
      quality_score: qualityScore,
      geo: geoResult,
      classification: classResult
    };
    let dbInsertOutcome = null;

    console.log(`[ENRICHED:${requestId}]`, enriched);

    // Insert into Supabase if configured
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      }

      if (qualityScore < qualityMin) {
        console.log(`[SUPABASE:${requestId}] Skipping insert (quality_score ${qualityScore} < ${qualityMin})`);
      } else {
        const row = {
          request_id: payload?.request_id || null,
          title: payload?.title || null,
          url: payload?.url || null,
          username: payload?.user || null,
          comment: payload?.comment || null,
          change_size: payload?.change_size ?? null,
          timestamp: payload?.timestamp ?? null,
          category: classResult.category,
          lat: geoResult.lat,
          lon: geoResult.lon,
          country: geoResult.country,
          quality_score: qualityScore,
          raw: payload
        };

        const insertResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/edits`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "return=minimal"
          },
          body: JSON.stringify(row)
        });

        if (!insertResponse.ok) {
          const errorText = await insertResponse.text();
          dbInsertOutcome = false;
          console.log(`[SUPABASE:${requestId}] Insert failed ${insertResponse.status}: ${errorText}`);
        } else {
          dbInsertOutcome = true;
        }
      }
    } catch (err) {
      dbInsertOutcome = false;
      console.log(`[SUPABASE:${requestId}] Insert error: ${String(err)}`);
    }

    return new Response(JSON.stringify({ ...enriched, db_inserted: dbInsertOutcome }), {
      headers: { "content-type": "application/json" }
    });
  }
};
