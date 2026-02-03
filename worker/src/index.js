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

    const geoPrompt = [
      "You are a geo-tagging assistant.",
      "Given a Wikipedia article title and edit comment, return a JSON object with:",
      '{ "lat": number, "lon": number, "country": string }',
      "Only return JSON. No extra text.",
      "",
      `Article: "${title}"`,
      `Summary: "${comment}"`
    ].join("\n");

    const classPrompt = [
      "You are a topic classification assistant.",
      "Given a Wikipedia article title and edit comment, return JSON with:",
      '{ "category": "Sports"|"Politics"|"Science"|"Conflict"|"Pop Culture" }',
      "Only return JSON. No extra text.",
      "",
      `Article: "${title}"`,
      `Summary: "${comment}"`
    ].join("\n");

    let geoResult = { lat: null, lon: null, country: null };
    let classResult = { category: null };

    try {
      const geoResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: geoPrompt
      });

      const geoText = typeof geoResponse === "string" ? geoResponse : geoResponse?.response;
      geoResult = JSON.parse(geoText);
    } catch (err) {
      geoResult = { lat: null, lon: null, country: null, error: String(err) };
    }

    try {
      const classResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        prompt: classPrompt
      });

      const classText = typeof classResponse === "string" ? classResponse : classResponse?.response;
      classResult = JSON.parse(classText);
    } catch (err) {
      classResult = { category: null, error: String(err) };
    }

    const enriched = {
      ...payload,
      geo: geoResult,
      classification: classResult
    };

    console.log(`[ENRICHED:${requestId}]`, enriched);

    // Insert into Supabase if configured
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      }

      const row = {
        request_id: payload?.request_id || null,
        title: payload?.title || null,
        url: payload?.url || null,
        username: payload?.user || null,
        comment: payload?.comment || null,
        change_size: payload?.change_size ?? null,
        timestamp: payload?.timestamp ?? null,
        category: classResult?.category ?? null,
        lat: geoResult?.lat ?? null,
        lon: geoResult?.lon ?? null,
        country: geoResult?.country ?? null,
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
        console.log(`[SUPABASE:${requestId}] Insert failed ${insertResponse.status}: ${errorText}`);
      }
    } catch (err) {
      console.log(`[SUPABASE:${requestId}] Insert error: ${String(err)}`);
    }

    return new Response(JSON.stringify(enriched), {
      headers: { "content-type": "application/json" }
    });
  }
};
