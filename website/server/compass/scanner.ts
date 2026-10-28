import { z } from "zod";
import { reviewTraceability } from "./core/director";

export const scannerSummarySchema = z.object({
  status: z.enum(["INDICATORS_FOUND", "NO_KNOWN_INDICATORS", "NO_KNOWN_INDICATORS_WITH_GAPS", "REFERENCES_ONLY", "REFERENCES_ONLY_WITH_GAPS", "WITHDRAWN_ONLY", "WITHDRAWN_ONLY_WITH_GAPS"]),
  findings: z.number().int().min(0).max(1000000),
  references: z.number().int().min(0).max(1000000),
  checked: z.number().int().min(0).max(1000000),
  gaps: z.number().int().min(0).max(1000000),
  cancelled: z.boolean(),
}).strict();

export function reviewScannerSummary(summary: z.infer<typeof scannerSummarySchema>, owner: string) {
  summary = scannerSummarySchema.parse(summary);
  const needsInvestigation = summary.findings > 0;
  const evidence = `The provided sharing summary reports ${summary.findings} actionable indicator matches, ${summary.references} references, ${summary.checked} checks, and ${summary.gaps} coverage gaps. Scan cancellation: ${summary.cancelled}.`;
  const output = {
    consentVersion: "scanner-summary-review-v1",
    acceptedPurposes: ["security-recommendations-only"],
    agents: ["Compass Agent — bounded security-summary module", "Compass Director"],
    status: needsInvestigation || summary.gaps || summary.cancelled ? "human-review-required" : "no-known-indicators-not-proof-of-safety",
    trace: {
      evidence,
      interpretation: needsInvestigation ? "Indicator matches warrant qualified investigation; they do not prove infection." : "No actionable match is reported. Coverage gaps and unknown indicators prevent an assurance of safety.",
      recommendation: needsInvestigation ? "Preserve the local evidence and request qualified security review." : "Review the coverage limits and use this result as one input to your security process, not a clean bill of health.",
      action: needsInvestigation ? "Keep the full report local, avoid deleting evidence, and agree a secure evidence-transfer route with a qualified analyst." : "Check the locally retained full report for skipped checks and discuss any unresolved risk with your security team.",
      owner,
      dependency: "Access to the privately retained full report and a qualified security analyst where needed.",
      successCriterion: "An accountable human reviews the findings and gaps, records a proportionate next step, and does not treat a clean summary as proof the device is safe.",
    },
    directorChecks: ["Only allowlisted aggregate status and counts received", "Security-review purpose explicitly authorized", "Raw evidence and instructions excluded", "No host, network, credential, or deployment capability granted"],
    notice: "The provided summary is unverified, not a certified scan attestation. No raw artifact, device content, or arbitrary instruction is passed to the planning agents. No external action was performed.",
  };
  const tracePassed = reviewTraceability([output.trace]);
  if (!tracePassed) throw new Error("The security recommendation failed Director traceability review.");
  output.directorChecks.push("Shared Director seven-field traceability check passed");
  return { ...output, agentRun: { module: "security-summary", invocations: 1, externalActionsExecuted: 0 }, directorReview: { traceabilityPassed: tracePassed, humanApprovalRequired: true } };
}
