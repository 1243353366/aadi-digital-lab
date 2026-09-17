// Ask Corpora — server-side proxy to the Corpora AI worker's search endpoint.
// Keeps the hook same-origin (no CORS/CSP surface) and the frontend lean.

import { json, SEC_HEADERS } from "./_shared.js";

const CORPORA_ORIGIN = "https://corpora-ai.aadishankar1999.workers.dev";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "Parameter 'q' is required." }, 400);
  if (q.length > 200) return json({ error: "Query too long: 200 characters max." }, 400);
  try {
    const upstream = await fetch(CORPORA_ORIGIN + "/api/corpora/search?q=" + encodeURIComponent(q), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...SEC_HEADERS },
    });
  } catch {
    return json({ error: "Corpora AI is unreachable right now." }, 502);
  }
}
