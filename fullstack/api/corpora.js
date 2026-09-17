// Ask Corpora — server-side proxy to the Corpora AI worker's search endpoint.
// Keeps the hook same-origin (no CORS/CSP surface) and the frontend lean.

import { json, SEC_HEADERS, rateLimit } from "./_shared.js";

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

// POST /api/corpora/summarize — instead of dumping every matching record,
// ask Corpora AI for one brief summary of what the query hits.
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (db && !(await rateLimit(db, context.request, "corpora-summarize", 6))) {
    return json({ error: "Rate limit: 6 summaries per 15 minutes." }, 429);
  }
  let body = {};
  try { body = await context.request.json(); } catch { /* fall through to empty q */ }
  const q = (typeof body.q === "string" ? body.q : "").trim().slice(0, 200);
  if (!q) return json({ error: "Parameter 'q' is required." }, 400);
  try {
    const searchRes = await fetch(CORPORA_ORIGIN + "/api/corpora/search?q=" + encodeURIComponent(q), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const search = await searchRes.json();
    if (!searchRes.ok || !search.ok) throw new Error("upstream");
    if (!search.count) return json({ ok: true, q, count: 0, summary: null, topics: [] });
    const text = search.results
      .map((r) => r.title + " (" + r.source + "): " + (r.snippet || ""))
      .join("\n\n").slice(0, 6000);
    const aiRes = await fetch(CORPORA_ORIGIN + "/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(25000),
    });
    const analysis = await aiRes.json();
    return json({
      ok: true, q, count: search.count,
      summary: (analysis.ai && analysis.ai.summary) || null,
      topics: (analysis.ai && analysis.ai.topics) || [],
    });
  } catch {
    return json({ error: "Corpora AI is unreachable right now." }, 502);
  }
}
