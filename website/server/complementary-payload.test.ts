import { describe, expect, it, vi, afterEach } from "vitest";
import { sampleAssessment } from "../shared/sample";
import { runWithBackbone } from "./compass/backbone";
const complete = vi.hoisted(() => vi.fn(async () => ({ text: "Fixture", model: "fixture", warning: "Untrusted" })));
vi.mock("../../integrations/freellmapi/adapter.js", () => ({ createFreeLlmLayer: () => ({ status: () => ({ enabled: true, keyless: true }), complete }) }));
import { explainMethod } from "./compass/complementary";
afterEach(() => vi.unstubAllEnvs());
describe("minimal complementary prompt", () => {
  it("does not serialize the assessment or whole decision brief", async () => {
    vi.stubEnv("FREELLMAPI_COMPANY_USE_APPROVED", "1");
    const baseline = runWithBackbone({ ...sampleAssessment, projectName: "PRIVATE-PROJECT", submitterName: "Private Submitter", decisionOwnerName: "Private Owner", companyGoals: "PRIVATE-COMPANY-GOAL", objectives: "PRIVATE-OBJECTIVE reduce onboarding delays and improve outcomes." }, "director");
    await explainMethod(baseline, { principalId: "account:1", idempotencyKey: "fixture-idempotency-32-characters", externalProcessingAuthorized: true });
    const prompt = complete.mock.calls.at(-1)![0].prompt;
    for (const secret of ["PRIVATE-PROJECT", "Private Submitter", "Private Owner", "PRIVATE-COMPANY-GOAL", "PRIVATE-OBJECTIVE", sampleAssessment.submitterWorkEmail]) expect(prompt).not.toContain(secret);
    expect(Object.keys(JSON.parse(prompt))).toEqual(["task", "method", "description", "strengths", "cautions"]);
  });
  it("requires explicit operator approval even if endpoint is enabled", async () => {
    vi.stubEnv("FREELLMAPI_COMPANY_USE_APPROVED", "0");
    await expect(explainMethod(runWithBackbone(sampleAssessment, "agent"), { principalId: "account:1", idempotencyKey: "fixture-idempotency-32-characters", externalProcessingAuthorized: true })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});
