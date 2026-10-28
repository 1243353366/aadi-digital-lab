import { recommendProject } from "./recommendation-engine.js";
import { authorizePlanningCapabilities } from "./capability-policy.js";

export const PLANNING_AGENT_ID = "compass-planning-agent-v1";
const REQUIRED_CAPABILITIES = Object.freeze([
  "project.read", "evidence.analyze", "project.recommend", "plan.generate", "framework.generate", "result.write"
]);

export function runPlanningAgent(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const error = new Error("A structured project assessment is required.");
    error.code = "VALIDATION_ERROR";
    error.fields = { objectives: "Submit the structured project assessment, not a command or executable task." };
    throw error;
  }

  // Recompute permissions from policy, never from a user-supplied receipt or role claim.
  const capabilityReceipt = authorizePlanningCapabilities(input);
  const delegatedCapabilities = [...REQUIRED_CAPABILITIES];
  if (input.quarterlyPlanningAuthorized === true) delegatedCapabilities.push("quarterly.plan");
  if (!delegatedCapabilities.every((capability) => capabilityReceipt.granted.includes(capability))) {
    const error = new Error("Planning agent delegation exceeds the request's capability boundary.");
    error.code = "CAPABILITY_DENIED";
    error.denied = delegatedCapabilities.filter((capability) => !capabilityReceipt.granted.includes(capability));
    throw error;
  }

  // This is a transparent planning agent, not a shell/tool-using autonomous agent.
  const brief = recommendProject(input);
  return {
    ...brief,
    capabilityReceipt,
    agentRun: {
      id: PLANNING_AGENT_ID,
      name: "Compass Planning Agent",
      engine: "transparent-model",
      invocations: 1,
      delegatedCapabilities,
      externalActionsExecuted: 0
    }
  };
}
