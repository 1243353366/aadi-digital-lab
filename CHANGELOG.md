# Changelog — Aadi's Digital Lab

## [Security branch] — 2026-10-28 — Recovery, machine-state, and indicator trust

Changes are isolated to `security/scanner-recovery-trust-boundaries`; `main` and hosting are not changed. Added ownership-bound non-recursive cleanup of current-process scanner copies, non-destructive reporting of stale candidates, bounded descriptor-aware browser snapshots, group-state change warnings, and read-only SQLite opens that cannot create vanished evidence. Partial acquisition records are retained on failure. No system rollback/remediation capability is introduced.

Indicator update/scan acceptance is anchored to approved source/revision/hash records in the trusted application release, not a digest or approval assertion from mutable source/cache data. Latest/shrink options do not authorize unapproved content. The package manifest is separately approved by the launcher; reproducible vendoring records the upstream commit and local patch digest. Integrity is not claimed to establish publisher authenticity or semantic correctness.

Added synthetic adversarial tests, a before/after cleanup demonstration, a dedicated no-scan CI job, and retained all original license/NOTICE and author/source credits. See [security changes](scanner/SECURITY-CHANGELOG.md) and [demonstration and limits](scanner/SECURITY-DEMONSTRATION.md). Native Windows protections are not certified by Linux tests; unsupported hardened snapshot operations fail closed and retained private copies are reported.

## [1.5.1] — 2026-10-28 — Separate scanner-on-scanner audit and credits

Added `python3 scanner/audit_scanner.py`: package integrity plus 42 synthetic matcher, evidence, and coverage checks, with a separate audit report and no device scanning. The original live scanner, indicator bytes, scan results, and website interpretation are unchanged. Added five audit safety regressions to the existing six launcher tests and credited verified authors, upstream contributors, research publishers, and optional rule authors in the root README. The audit does not claim to eliminate detection errors or certify a device as safe.

## [1.5.0] — 2026-10-28 — Planning Studio website + local scanner

Added the complete responsive `website/` source with guided company intake, both execution modes, a request-scoped Corpora backbone, traceable recommendations, delivery plans, framework search, governance pages, and a synthetic public demo. Private processing remains administrator-only with database-backed short-lived guards and independent purpose gates.

Added `python3 scanner/compass_scan.py`: a real standard scan on the runner's current live computer, starting only after explicit terminal consent. Zero-Breach-Toolkit 0.1.9 is pinned with provenance checks and license notices. Reports stay local. Optional website review accepts only allowlisted sharing-summary counts/status under separate authorization; no raw evidence, training, or host execution capability is granted to agents. Added website and no-scan launcher regression tests. No real device was scanned during development, and no hosting deployment was performed. Deploy-on-push is now limited to actual `fullstack/` changes.

## [1.4.0] — 2026-10-28 — Compass Director + Agent integration

Added the original Compass 2.2 planning module as `compass/` and mounted its frontend at `/compass/` without replacing the blog, research, Corpora, or evidence-grounded reasoning features. The same planning agent supports Director-coordinated and standalone modes. Director review generates proposed work/risk artifacts and a human decision gate, not external actions.

Added an isolated, authenticated admin-only `/api/compass/*` gateway with purpose and high-risk validation, shared replay/idempotency protection, request limits, and no company-assessment persistence or external AI/retrieval calls. Added Node regression tests, frontend syncing, and credential-free local Worker smoke configuration. Existing license boundaries are preserved.

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
