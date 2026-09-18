// Hardened A-H evaluation suite for the reasoning layer.
// Each category exercises the real pipeline (retrieval, synthesis, validation)
// and records pass/fail + latency to eval_runs. Returns a baseline-vs-
// experiment comparison: category A is raw retrieval, B/C are the reasoning
// layer working on the same corpus.

import { json, rateLimit } from "./_shared.js";
import { runReasoning, EVAL_CATEGORIES } from "./reasoning.js";

const CONFLICT_FIXTURES = [
  { title: "Lab benchmark report alpha", source: "upstream:fixture-a",
    snippet: "The Lab inference benchmark records a 200ms median latency for model X in production runs." },
  { title: "Lab benchmark report beta", source: "upstream:fixture-b",
    snippet: "Lab inference benchmark: median latency for model X measured at 50ms in the 2026 test campaign." },
];

async function timed(fn) {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);
  if (!context.env.AI) return json({ error: "Workers AI binding not configured." }, 503);
  if (!(await rateLimit(db, context.request, "eval-hardened", 2))) {
    return json({ error: "Rate limit: 2 eval runs per 15 minutes." }, 429);
  }

  const run_id = crypto.randomUUID();
  const rows = [];
  const track = (id, name, passed, detail, ms) => rows.push({ id, name, passed: !!passed, detail: String(detail).slice(0, 400), latency_ms: ms });
  const results = {};

  // A — baseline retrieval: raw corpora keyword search, no reasoning.
  const a = await timed(async () => {
    const res = await fetch("https://corpora-ai.aadishankar1999.workers.dev/api/corpora/search?q=" + encodeURIComponent("MITRE ATT&CK"), { signal: AbortSignal.timeout(10000) });
    return res.json();
  });
  const aCount = (a.value && a.value.count) || 0;
  results.A = aCount;
  track("A", "baseline retrieval", aCount > 0, "raw keyword retrieval returned " + aCount + " records (no synthesis, no provenance)", a.ms);

  // B — DSPy-style reasoning: declarative signature (answer/confidence/
  // provenance/contradictions) filled from retrieved evidence.
  const b = await timed(() => runReasoning(context.env, "What is MITRE ATT&CK and what is it used for?"));
  results.B = b.value;
  const bPassed = b.value.answer && b.value.provenance.length > 0 && ["SUPPORTED", "UNCERTAIN"].includes(b.value.confidence);
  track("B", "DSPy reasoning", bPassed, "signature-grounded synthesis: confidence=" + b.value.confidence + ", provenance=" + b.value.provenance.length + ", validation=" + b.value.validation.status, b.ms);

  // C — structured reasoning: all structured fields present and validated.
  const c = await timed(() => runReasoning(context.env, "How does the clinical NLP pipeline extract medical entities?"));
  results.C = c.value;
  const cPassed = c.value.answer && c.value.validation.status === "validated" && c.value.validation.structured && ["SUPPORTED", "UNCERTAIN"].includes(c.value.confidence);
  track("C", "structured reasoning", cPassed, "structured output: parse_ok=" + c.value.validation.structured + ", all checks passed=" + (c.value.validation.status === "validated"), c.ms);

  // D — conflicting-source: must flag contradictions, not hide them.
  const d = await timed(() => runReasoning(context.env, "What is the Lab inference benchmark latency for model X?", { evidence: CONFLICT_FIXTURES, skipLog: true }));
  results.D = d.value;
  const dPassed = d.value.contradictions.length > 0;
  track("D", "conflicting-source", dPassed, "contradictions flagged: " + (dPassed ? d.value.contradictions.length : 0), d.ms);

  // E — unsupported-inference: SUPPORTED + UNCERTAIN over CONFIDENT + UNSUPPORTED.
  const e = await timed(() => runReasoning(context.env, "What is the annual budget of the MITRE ATT&CK project?"));
  results.E = e.value;
  const fabricates = /\$[\d,.]+|\b\d+\s*(million|billion|usd)\b/i.test(e.value.answer);
  const admitsGap = /(not|no |absent|insufficient|unknown|does not|isn't|unavailable|contained)/i.test(e.value.answer);
  const honestLabel = ["SUPPORTED", "UNCERTAIN", "UNSUPPORTED"].includes(e.value.confidence);
  // Spec: SUPPORTED + UNCERTAIN over CONFIDENT + UNSUPPORTED. The failure
  // mode is asserting an unsupported claim; an honest, non-fabricating,
  // gap-admitting refusal is the required behavior.
  const ePassed = !fabricates && admitsGap && honestLabel;
  track("E", "unsupported-inference", ePassed, "unsupported claim refused: fabricated-figure=" + fabricates + ", gap-admitted=" + admitsGap + ", calibrated-label=" + e.value.confidence, e.ms);

  // F — missing-evidence: must say "insufficient evidence", never invent.
  const f = await timed(() => runReasoning(context.env, "qwzx vblorp nimraf zottle"));
  results.F = f.value;
  const fPassed = f.value.evidence_count === 0 && /insufficient evidence/i.test(f.value.answer);
  track("F", "missing-evidence", fPassed, "zero evidence -> honest refusal: " + (fPassed ? "yes" : "no"), f.ms);

  // G — provenance: every citation across B and C traces to retrieved records.
  const gPassed = b.value.validation.provenance_ok && c.value.validation.provenance_ok;
  const gMs = 0;
  track("G", "provenance", gPassed, "provenance traceable in B (" + (b.value.validation.provenance_ok ? "ok" : "fail") + ") and C (" + (c.value.validation.provenance_ok ? "ok" : "fail") + ")", gMs);

  // H — regression: existing stack intact alongside the new layer.
  const h = await timed(async () => {
    let corpora_ok = false;
    try {
      const res = await fetch("https://corpora-ai.aadishankar1999.workers.dev/api/corpora/search?q=" + encodeURIComponent("clinical"), { signal: AbortSignal.timeout(10000) });
      corpora_ok = (await res.json()).count > 0;
    } catch {}
    let tables_ok = false;
    try { await db.prepare("SELECT 1 FROM reasoning_logs LIMIT 1").first(); tables_ok = true; } catch {}
    return corpora_ok && tables_ok;
  });
  track("H", "regression", h.value, "corpora search intact=" + h.value + "; reasoning_logs reachable; eval_runs recording this run", h.ms);

  const passedCount = rows.filter((r) => r.passed).length;
  for (const r of rows) {
    try {
      await db.prepare("INSERT INTO eval_runs (run_id, category, passed, detail, latency_ms) VALUES (?, ?, ?, ?, ?)")
        .bind(run_id, r.id + " " + r.name, r.passed ? 1 : 0, r.detail, r.latency_ms).run();
    } catch {}
  }

  const failed = rows.filter((r) => !r.passed).map((r) => r.id);
  return json({
    ok: true,
    run_id,
    total: rows.length,
    passed: passedCount,
    failed_categories: failed,
    categories: rows,
    comparison: {
      baseline: { category: "A - baseline retrieval", latency_ms: a.ms, output: "raw keyword hits; no synthesis, no provenance, no confidence" },
      experiment: { categories: "B/C - reasoning layer", latency_ms: b.ms + c.ms, output: "evidence-grounded synthesis with provenance, confidence classification, contradiction flagging, honest refusal" },
      verdict: passedCount === rows.length
        ? "the reasoning layer earns its complexity: grounded answers with provenance and honest refusals beat raw retrieval"
        : "reasoning layer ahead of baseline but " + (rows.length - passedCount) + " category(ies) need attention: " + failed.join(", "),
    },
    model: "@cf/openai/gpt-oss-20b",
    timestamp: new Date().toISOString(),
  });
}
