// Evidence-grounded reasoning layer over the Corpora index.
// Pipeline: retrieve evidence from corpora-ai -> synthesize with Workers AI
// (strict JSON, provenance-cited, contradiction-flagging) -> algorithmic
// validation (provenance traceability, grounding, confidence classification)
// -> log to reasoning_logs. When evidence is empty the layer answers
// "insufficient evidence" honestly instead of letting the model invent.

import { json, rateLimit } from "./_shared.js";

const CORPORA_ORIGIN = "https://corpora-ai.aadishankar1999.workers.dev";
const MODEL = "@cf/openai/gpt-oss-20b"; // reasoning model: needs max_tokens >= 2048
const CONFIDENCE = ["SUPPORTED", "UNCERTAIN", "UNSUPPORTED"];

const SYSTEM_PROMPT = `You are the evidence-grounded reasoning layer of a research corpus. Answer ONLY from the provided evidence records.

Rules:
1. Ground every factual claim in the evidence. In "provenance", copy each cited record title EXACTLY as written in the EVIDENCE RECORD headers, as "record title (source)".
2. Classify confidence as exactly one of: SUPPORTED (fully backed by evidence), UNCERTAIN (partially backed, ambiguous, or the evidence answers only part of the question - then say what IS supported and what is missing), UNSUPPORTED (only when the evidence is entirely unrelated to the question). Prefer SUPPORTED + UNCERTAIN over asserting UNSUPPORTED claims with confidence.
3. If the evidence records conflict with each other, you MUST list the conflict under "contradictions" - flag contradictions, never hide them.
4. If the evidence is insufficient, answer "Insufficient evidence" and describe what IS available.
5. Never invent facts, numbers, or citations.

Return STRICT JSON only, no markdown fences:
{"answer": "...", "confidence": "SUPPORTED|UNCERTAIN|UNSUPPORTED", "contradictions": ["..."], "provenance": ["record title (source)"]}`;

export const EVAL_CATEGORIES = [
  { id: "A", name: "baseline retrieval" },
  { id: "B", name: "DSPy reasoning" },
  { id: "C", name: "structured reasoning" },
  { id: "D", name: "conflicting-source" },
  { id: "E", name: "unsupported-inference" },
  { id: "F", name: "missing-evidence" },
  { id: "G", name: "provenance" },
  { id: "H", name: "regression" },
];

async function searchCorpora(q, timeoutMs = 8000) {
  const res = await fetch(CORPORA_ORIGIN + "/api/corpora/search?q=" + encodeURIComponent(q), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error("corpora search failed");
  return data; // { ok, count, results: [{ title, source, snippet, ... }] }
}

const STOPWORDS = new Set([
  "what", "which", "who", "when", "where", "does", "doesnt", "the", "and", "for",
  "with", "about", "from", "this", "that", "used", "use", "are", "how", "why",
  "into", "its", "was", "were", "been", "have", "has", "had", "your", "there",
]);

// Ranked retrieval: ONE combined OR-query (endpoint caps at 5 terms), then
// client-side scoring by how many terms each record actually matches, so
// relevant records outrank one-word noise. Stays well under the corpora
// worker's 10 searches/minute rate limit.
async function retrieveEvidence(question) {
  const tokens = question.toLowerCase().replace(/[^a-z0-9& ]+/g, " ")
    .split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)).slice(0, 5);
  if (tokens.length === 0) return [];
  let data = null;
  try { data = await searchCorpora(tokens.join(" ")); } catch { data = null; }
  if (!data || !data.results || !data.results.length) return [];
  const scored = data.results.map((r) => {
    const hay = (String(r.title) + " " + String(r.keywords || "") + " " + String(r.content || r.snippet || "")).toLowerCase();
    const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    return { score, rec: r };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 5).map((e) => e.rec);
}

function evidenceBlocks(records) {
  return records
    .map((r, i) => `EVIDENCE RECORD ${i + 1}: "${r.title}" (source: ${r.source})\n${(r.content || r.snippet || "").slice(0, 1800)}`)
    .join("\n\n");
}

function parseModelJson(text) {
  let t = String(text || "").trim().replace(/```(json)?/gi, "");
  // Reasoning models may emit an analysis channel before the final JSON;
  // the answer object is the LAST {"answer"...} block in the output.
  const keyIdx = t.lastIndexOf('{"answer"');
  if (keyIdx !== -1) {
    const end = t.lastIndexOf("}");
    if (end > keyIdx) {
      try {
        const parsed = JSON.parse(t.slice(keyIdx, end + 1));
        if (typeof parsed.answer === "string") return { ...parsed, parse_ok: true };
      } catch {}
    }
  }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (typeof parsed.answer === "string") return { ...parsed, parse_ok: true };
    } catch {}
  }
  // Fallback: treat the raw text as the answer, marked unstructured.
  return {
    answer: t.slice(0, 2000),
    confidence: "UNCERTAIN",
    contradictions: [],
    provenance: [],
    parse_ok: false,
  };
}

// Core pipeline. opts.evidence overrides retrieval (used by the eval suite);
// opts.skipLog prevents the eval fixtures from polluting reasoning_logs.
export async function runReasoning(env, question, opts = {}) {
  const started = Date.now();
  let evidence = opts.evidence || [];
  let retrieval_note = "eval fixture evidence";

  if (!opts.evidence) {
    evidence = await retrieveEvidence(question);
    retrieval_note = "corpora-ai ranked token retrieval (top 5)";
  }

  // Honesty path: no evidence -> say so. The model never sees a prompt it
  // could hallucinate over, and no AI call is wasted.
  if (evidence.length === 0) {
    return {
      answer: "Insufficient evidence: the indexed corpora contain no records matching this question.",
      confidence: "UNSUPPORTED",
      provenance: [],
      contradictions: [],
      validation: { status: "validated", provenance_ok: true, grounding_ok: true, confidence_ok: true, no_evidence_honesty: true },
      evidence: [],
      evidence_count: 0,
      retrieval: retrieval_note,
      model: null,
      latency_ms: Date.now() - started,
    };
  }

  const userPrompt = evidenceBlocks(evidence) + "\n\nQUESTION: " + question +
    "\n\nReturn strict JSON per the system rules.";

  let parsed = null;
  try {
    // Same race the corpora-ai worker uses: gpt-oss can run long.
    const result = await Promise.race([
      env.AI.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2048, // gpt-oss reasoning models return content:null below this
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("ai-timeout")), 20000)),
    ]);
    // Models answer as plain text, { response }, or OpenAI chat shape;
    // reasoning models put final text in content and thinking in reasoning_content.
    const msg = result && result.choices && result.choices[0] && result.choices[0].message;
    const raw = typeof result === "string" ? result
      : (msg && msg.content) || (msg && msg.reasoning_content)
        || (result && result.response) || (result && result.message && result.message.content) || "";
    parsed = parseModelJson(raw);
  } catch {
    parsed = { answer: "", confidence: "UNSUPPORTED", provenance: [], contradictions: [], parse_ok: false, ai_error: true };
  }

  // Algorithmic validation, independent of the model's own claims.
  const titles = evidence.map((r) => String(r.title).toLowerCase());
  const sources = evidence.map((r) => String(r.source).toLowerCase());
  const prov = Array.isArray(parsed.provenance) ? parsed.provenance.map(String) : [];
  const provenance_ok = prov.length > 0 && prov.every((p) => {
    const pl = p.toLowerCase();
    return titles.some((t) => pl.includes(t) || t.includes(pl)) ||
           sources.some((s) => pl.includes(s) || s.includes(pl));
  });
  const answerText = String(parsed.answer || "").toLowerCase();
  const grounding_ok = provenance_ok || titles.some((t) => answerText.includes(t.slice(0, 30)));
  const confidence_ok = CONFIDENCE.includes(parsed.confidence);
  const checks = [provenance_ok, grounding_ok, confidence_ok];
  const failed = ["provenance", "grounding", "confidence"].filter((_, i) => !checks[i]);
  const validation = {
    status: failed.length ? "flagged: " + failed.join("+") : "validated",
    provenance_ok, grounding_ok, confidence_ok,
    structured: parsed.parse_ok !== false,
  };

  return {
    answer: String(parsed.answer || "").slice(0, 4000),
    confidence: parsed.confidence || "UNSUPPORTED",
    provenance: prov,
    contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions.map(String) : [],
    validation,
    evidence: evidence.map((r) => ({ title: r.title, source: r.source })),
    evidence_count: evidence.length,
    retrieval: retrieval_note,
    model: MODEL,
    latency_ms: Date.now() - started,
  };
}

// GET /api/reasoning/info — layer metadata: what is deployed and how it validates.
export async function onRequestGet(context) {
  const db = context.env.DB;
  let corpus_records = null;
  try {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM corpora").first();
    corpus_records = r ? r.n : null;
  } catch {}
  return json({
    ok: true,
    reasoning_layer: "evidence-grounded reasoning v1 (retrieve -> synthesize -> validate -> log)",
    model: MODEL,
    ai_binding: !!context.env.AI,
    validation: {
      provenance_check: "every cited source must trace to a retrieved evidence record",
      grounding_check: "the answer must reference evidence actually returned by retrieval",
      confidence_classification: CONFIDENCE,
      no_evidence_honesty: "zero evidence returns an insufficient-evidence answer without an AI call",
    },
    agent_mode: "evidence-grounded agent: retrieval-augmented, provenance-cited, contradiction-flagging, refuses to invent",
    hardened_eval_categories: EVAL_CATEGORIES,
    corpus: { source: "corpora-ai worker (shared D1 blog_db)", records: corpus_records },
    endpoints: { ask: "POST /api/reasoning/ask (6/15min/IP)", eval: "POST /api/eval/hardened (2/15min/IP)" },
  });
}

// POST /api/reasoning/ask — { question } -> grounded answer + provenance.
export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);
  if (!(await rateLimit(db, context.request, "reasoning-ask", 6))) {
    return json({ error: "Rate limit: 6 reasoning requests per 15 minutes." }, 429);
  }
  if (!context.env.AI) return json({ error: "Workers AI binding not configured." }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 300) {
    return json({ error: "Question must be 3-300 characters." }, 400);
  }

  const result = await runReasoning(context.env, question);
  try {
    await db.prepare(
      `INSERT INTO reasoning_logs (question, answer, confidence, evidence_count, evidence_titles, provenance, contradictions, validation_status, agent_mode, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).bind(
      question, result.answer, result.confidence, result.evidence_count,
      result.evidence.map((e) => e.title).join(" | ").slice(0, 1000),
      result.provenance.join(" | ").slice(0, 1000),
      result.contradictions.join(" | ").slice(0, 1000),
      result.validation.status, result.latency_ms
    ).run();
  } catch {}
  return json({ ok: true, question, ...result });
}
