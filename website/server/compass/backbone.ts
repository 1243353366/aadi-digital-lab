import { runCompass } from "./core/director";
import { CONSENT_VERSION } from "./core/recommendation-engine";

export const CORPORA_SOURCE = {
  repository: "https://github.com/1243353366/corpora-ai",
  commit: "9c92e79df7f4d53371c8b62c7b340c4c3a9bdbc2",
  directorExtension: "https://github.com/1243353366/aadi-digital-lab/commit/9b893da72826115fa187e6bdaf5979262540f57e",
};

export function runWithBackbone(assessment: Record<string, unknown>, executionMode: "director" | "agent") {
  // The original Corpora/Compass engine is vendored server-side; no request
  // sends company information to GitHub, a research endpoint, or an LLM.
  const result = runCompass(assessment, { executionMode });
  const signals = [
    { from: "Authorized intake", to: "Corpora Core", kind: "purpose-gated-context", status: "validated" },
    { from: "Corpora Core", to: "Planning Agent", kind: "objective-and-evidence", status: "delivered" },
    ...(executionMode === "director" ? [{ from: "Planning Agent", to: "Director", kind: "traceable-decision-brief", status: "reviewed" }] : []),
    { from: executionMode === "director" ? "Director" : "Planning Agent", to: "Human decision owner", kind: "proposed-plan", status: "awaiting-human-decision" },
  ];
  return {
    ...result,
    nervousSystem: {
      name: "Corpora Core",
      version: "corpora-backbone-v1",
      source: CORPORA_SOURCE,
      transport: "in-process, request-scoped",
      consentVersion: CONSENT_VERSION,
      evidenceStatus: "Submitter-supplied; not independently verified",
      dataPersistence: "No company information or generated plans retained",
      signals,
      capabilitiesExpanded: false,
      externalActionsExecuted: 0,
    },
  };
}
