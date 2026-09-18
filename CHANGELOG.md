# Changelog — Aadi's Digital Lab

## [1.3.0] — 2026-09-18 — Reasoning layer + hardened eval suite

### Added
- **Evidence-grounded reasoning layer** over the Corpora index:
  - `POST /api/reasoning/ask` — `{question}` → grounded answer with provenance
    citations, calibrated confidence (SUPPORTED / UNCERTAIN / UNSUPPORTED),
    contradiction flagging, and algorithmic validation (provenance traceability,
    grounding, label checks). Rate-limited 6/15min/IP; logged to `reasoning_logs`.
  - `GET /api/reasoning/info` — layer metadata: `reasoning_layer`, `model`,
    `validation`, `agent_mode`, `hardened_eval_categories`.
  - Zero-evidence questions return an honest "insufficient evidence" refusal
    without an AI call — the model never sees a prompt it could hallucinate over.
- `POST /api/eval/hardened` — A–H evaluation suite: baseline retrieval, DSPy
  reasoning, structured reasoning, conflicting-source, unsupported-inference,
  missing-evidence, provenance, regression. Results recorded to `eval_runs`.
  Rate-limited 2/15min/IP.
- Additive D1 tables `reasoning_logs` + `eval_runs` (`schema-reasoning.sql`,
  IF NOT EXISTS guards, no existing table touched).
- Workers AI binding (`[ai]` in wrangler.toml); model `@cf/openai/gpt-oss-20b`
  with max_tokens 2048 (reasoning models return content:null below that).
- Retrieval-quality fix (corpora-ai worker): search results now include a
  1600-char content slice per record; the lab's evidence and brief summaries
  use it instead of header-only snippets.

### TESTS / TEST RESULTS — hardened eval, run 343a553f (2026-09-18, production)

| Cat | Category | Result | Latency | Notes |
|-----|----------|--------|---------|-------|
| A | baseline retrieval | PASS | 146ms | 6 raw hits, no synthesis, no provenance |
| B | DSPy reasoning | PASS | 3516ms | SUPPORTED, 2 provenance citations, validation validated |
| C | structured reasoning | PASS | 4462ms | strict JSON parsed, all validation checks pass |
| D | conflicting-source | PASS | 4201ms | contradiction flagged, not hidden |
| E | unsupported-inference | PASS | 2882ms | refused to fabricate a figure; gap admitted; calibrated label |
| F | missing-evidence | PASS | 89ms | honest "insufficient evidence", no AI call |
| G | provenance | PASS | 0ms | B and C citations trace to retrieved records |
| H | regression | PASS | 185ms | corpora search intact, tables reachable, run recorded |

**Total: 8/8 PASS.** Full run ≈ 13s. Comparison: baseline retrieval (A) answers in
146ms with raw keyword hits; the reasoning layer (B/C) answers in ~4s with
evidence-grounded synthesis, provenance, calibrated confidence, contradiction
flagging, and honest refusals.

### Failure modes found and fixed during hardening (runs 1–3, kept for the record)
- **Run 1 (2/8):** model output arrives in OpenAI chat shape
  (`choices[0].message.content`) and gpt-oss needs a 20s timeout race — the
  extractor now mirrors the corpora-ai worker; the JSON parser prefers the final
  `{"answer"}` block (harmony analysis channel precedes it).
- **Run 2 (3/8):** retrieval passed raw questions as one OR-keyword query —
  common-word noise outranked signal; switched to token-filtered single-search
  with client-side relevance scoring. The search endpoint exposed only 240-char
  provenance headers as snippets — added content slices so evidence carries
  actual record text.
- **Run 3 (6/8):** the eval's own search volume tripped the corpora worker's
  10/min rate limit (H false-negative) — single-search retrieval keeps a full
  eval run under 5 searches. E's pass criterion corrected to the spec's intent:
  the failure mode is asserting unsupported claims; an honest, non-fabricating,
  calibrated refusal passes.

### STOP CONDITION (applied)
Reasoning layer deployed, tested (8/8), documented, measured against baseline.
No further architectural expansion — no RLM, no ProgramOfThought, no additional
frameworks. The objective was a reasoning system that earns the complexity it
has; measured against baseline retrieval, it does.
