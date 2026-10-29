// Complementary narrative only; the policy/scoring brains remain authoritative.
import { createFreeLlmLayer } from "../../../integrations/freellmapi/adapter.js";
const layer = createFreeLlmLayer();

export function complementaryStatus() {
  return { ...layer.status(), companyUseApproved: process.env.FREELLMAPI_COMPANY_USE_APPROVED === "1", purpose: "Optional generic delivery-method explanation; never executes actions" };
}

export async function explainMethod(baseline: any, args: {
  principalId: string; idempotencyKey: string; externalProcessingAuthorized: boolean;
}) {
  if (process.env.FREELLMAPI_COMPANY_USE_APPROVED !== "1") {
    const error = new Error("Operator approval of the gateway's complete provider pool is required.") as Error & { code: string };
    error.code = "NOT_CONFIGURED";
    throw error;
  }
  // Never serialize the assessment or the entire baseline. Names, emails,
  // budget, goals, evidence, scan reports and high-risk records are excluded.
  const method = baseline.recommendation;
  const prompt = JSON.stringify({
    task: "Explain this suggested delivery method, its general tradeoffs and questions a human should validate. Do not propose new evidence or replace the supplied approach.",
    method: String(method.name).slice(0, 100),
    description: String(method.description).slice(0, 800),
    strengths: method.tradeoffs.strengths.slice(0, 3).map((s: string) => s.slice(0, 250)),
    cautions: method.tradeoffs.watchouts.slice(0, 3).map((s: string) => s.slice(0, 250)),
  });
  return layer.complete({ ...args, prompt });
}
