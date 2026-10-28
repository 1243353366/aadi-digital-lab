// @ts-nocheck
import { runPlanningAgent, PLANNING_AGENT_ID } from "./planning-agent";

export const ORCHESTRATION_VERSION = "compass-director-agent-v1";
const TRACE_FIELDS = Object.freeze(["evidence", "interpretation", "recommendation", "action", "owner", "dependency", "successCriterion"]);

export function reviewTraceability(traces) {
  return Array.isArray(traces) && traces.length > 0 && traces.every(item => TRACE_FIELDS.every(key => typeof item[key] === "string" && item[key].trim().length > 0));
}

export function reviewPlanningBrief(brief) {
  const hasText = (value) => typeof value === "string" && value.trim().length > 0;
  const traces = Array.isArray(brief.traceableRecommendations) ? brief.traceableRecommendations : [];
  const authorizedPurposes = brief.authorization.selectedPurposes;
  const checks = [
    { id: "purpose", label: "Company-planning purpose is explicitly authorized", passed: brief.authorization.requiredCompanyUse.granted === true && authorizedPurposes.includes("recommendations-plans-delivery-frameworks") },
    { id: "traceability", label: "Every recommendation has evidence, action, owner, dependency, and a success criterion", passed: reviewTraceability(traces) },
    { id: "quarterly-scope", label: "Quarterly output matches its separately authorized scope", passed: Boolean(brief.quarterlyPlan) === (brief.authorization.quarterlyPlanning.granted === true) },
    { id: "accountability", label: "An accountable human decision owner is named", passed: hasText(brief.accountability.decisionOwner.name) && hasText(brief.accountability.decisionOwner.role) },
    { id: "capability-subset", label: "Agent capabilities are a subset of the policy grant", passed: brief.agentRun.delegatedCapabilities.every((capability) => brief.capabilityReceipt.granted.includes(capability)) },
    { id: "no-actions", label: "No external actions were executed", passed: brief.agentRun.externalActionsExecuted === 0 }
  ];
  const warnings = [];
  const workforce = brief.project.workforce;
  if (!workforce.availablePersonnel) warnings.push("Available personnel were not specified. Confirm capacity before committing to the launch plan.");
  else if (workforce.availablePersonnel < brief.project.teamSize) warnings.push(`Only ${workforce.availablePersonnel} of the ${brief.project.teamSize} relevant team members are reported available. Reduce parallel commitments or resolve the capacity gap.`);
  if (brief.project.budget.disclosure === "none") warnings.push("No budget was disclosed. Confirm a spending ceiling before funding the work packages.");
  else if (brief.project.budget.period !== "project") warnings.push(`The stated ${brief.project.budget.period} budget is not a verified project-wide spending envelope. Confirm the period-to-project allocation.`);
  if (brief.alternatives[0] && brief.recommendation.fitScore - brief.alternatives[0].score < 5) warnings.push("The leading methods fit similarly. Use a bounded pilot and the stated tradeoffs rather than treating the ranking as decisive.");
  if (brief.authorization.confidentialInformation.declared) warnings.push("High-risk information was declared. The approver record is an attestation, not independent identity verification or a legal waiver; organizational review remains necessary.");
  for (const check of checks) if (!check.passed) warnings.push(`Review failed: ${check.label}. Do not act until this is resolved.`);

  const decisionOwner = brief.accountability.decisionOwner;
  const riskRegister = brief.organizationAnalysis.problems.map((problem, index) => {
    return {
      id: `risk-${String(index + 1).padStart(2, "0")}`,
      risk: problem.signal,
      evidence: problem.evidence,
      objectiveImpact: problem.objectiveImpact,
      owner: decisionOwner.name,
      action: `Have the decision owner assign a mitigation owner, needed-by date, and evidence review for: ${problem.signal}.`,
      successCriterion: "A mitigation owner and review date are recorded, and the decision owner accepts evidence that the objective impact is controlled."
    };
  });
  const workPackages = traces.map((trace, index) => ({
    id: `work-${String(index + 1).padStart(2, "0")}`,
    recommendationId: `rec-${String(index + 1).padStart(2, "0")}`,
    title: trace.action,
    owner: trace.owner,
    dependency: trace.dependency,
    successCriterion: trace.successCriterion,
    status: "proposed-not-executed"
  }));

  return {
    status: warnings.length ? "needs-human-review" : "ready-for-human-review",
    checks,
    warnings,
    riskRegister,
    workPackages,
    decisionGate: {
      owner: decisionOwner,
      requiredAction: "Validate the evidence, confirm budget and staffing, resolve review warnings, and explicitly approve a bounded plan outside this application before anyone acts."
    },
    notes: [
      "The Director performs deterministic coordination and checks; it is not an independent LLM or a verified auditor.",
      "Evidence is supplied by the submitter and has not been independently verified.",
      "Named roles and approvers are attestations, not authenticated organizational entitlements.",
      "Work packages and risks are proposed planning artifacts, not live tasks or executed actions."
    ]
  };
}

export function runCompass(input, { executionMode } = {}) {
  const selectedMode = executionMode ?? input?.executionMode ?? "director";
  if (!["director", "agent"].includes(selectedMode)) {
    const error = new Error("Choose Director + Agent or Agent only.");
    error.code = "VALIDATION_ERROR";
    error.fields = { executionMode: "Execution mode must be director or agent." };
    throw error;
  }
  // Fixed registry: only the shared planning agent can be selected. No user-defined agents, tools, or recursion.
  const output = runPlanningAgent(input);
  const { agentRun, ...brief } = output;
  const review = selectedMode === "director" ? reviewPlanningBrief(output) : null;
  const steps = [
    { stage: "Validate consent and narrow capabilities", owner: "Server policy", status: "completed" },
    { stage: "Analyze objectives and build the decision brief", owner: "Compass Planning Agent", status: "completed" },
    ...(review ? [{ stage: "Review traceability, scope, resources, and risks", owner: "Compass Director", status: "completed" }] : []),
    { stage: "Decide whether to act", owner: brief.accountability.decisionOwner.name, status: "awaiting-human-decision" }
  ];
  return {
    ...brief,
    orchestration: {
      version: ORCHESTRATION_VERSION,
      runId: globalThis.crypto.randomUUID(),
      executionMode: selectedMode,
      agent: { id: PLANNING_AGENT_ID, name: agentRun.name, engine: agentRun.engine, invocations: 1, delegatedCapabilities: agentRun.delegatedCapabilities },
      director: review ? { id: "compass-director-v1", name: "Compass Director", status: review.status } : null,
      steps,
      safety: { externalActionsExecuted: 0, nonTransitiveGrants: true }
    },
    directorReview: review
  };
}
