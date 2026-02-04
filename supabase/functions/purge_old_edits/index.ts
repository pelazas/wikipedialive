// Supabase Edge Function: purge old edits
// Deletes rows older than RETENTION_DAYS (default: 30)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const retentionDays = Number(Deno.env.get("RETENTION_DAYS") || "30");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "RETENTION_DAYS must be a positive number" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL(`${supabaseUrl}/rest/v1/edits`);
  url.searchParams.set("created_at", `lt.${cutoff}`);

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    return new Response(
      JSON.stringify({ ok: false, status: resp.status, error: text }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, cutoff, retentionDays }),
    { headers: { "content-type": "application/json" } }
  );
});
