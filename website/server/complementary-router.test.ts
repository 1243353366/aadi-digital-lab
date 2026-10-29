import { describe, expect, it, vi, beforeEach } from "vitest";
import { sampleAssessment } from "../shared/sample";
const state = vi.hoisted(() => ({ enabled: true, approved: true, quota: vi.fn(), grant: vi.fn(), explain: vi.fn() }));
vi.mock("./compass/guards", () => ({ hash: (s: string) => s, issuePlanningToken: vi.fn(), consumePlanningGrant: state.grant, consumeComplementaryQuota: state.quota }));
vi.mock("./compass/complementary", () => ({ complementaryStatus: () => ({ enabled: state.enabled, keyless: true, companyUseApproved: state.approved }), explainMethod: state.explain }));
import { appRouter } from "./routers";
function caller(role?: "admin" | "user") {
  return appRouter.createCaller({ user: role ? { id: 1, openId: "fixture", role, name: "Test administrator", email: "admin@example.com", loginMethod: "test", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } : null, req: { headers: {}, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as any, res: {} as any });
}
const request = { assessment: { ...sampleAssessment }, executionMode: "director" as const, externalProcessingAuthorized: true as const, externalConsentVersion: "compass-complementary-external-v1" as const, token: "x".repeat(64), timestamp: Date.now(), idempotencyKey: "narrative-request-with-32-characters" };
beforeEach(() => { state.enabled = true; state.approved = true; state.quota.mockReset(); state.grant.mockReset(); state.explain.mockReset(); state.explain.mockResolvedValue({ text: "Optional explanation", model: "fixture", warning: "Human review required" }); });
describe("keyless complementary gateway", () => {
  it("does not make company endpoints anonymous", async () => {
    await expect(caller().compass.complementary(request)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller("user").compass.complementary(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.explain).not.toHaveBeenCalled();
  });
  it("requires separate purpose consent and rejects request credential injection", async () => {
    await expect(caller("admin").compass.complementary({ ...request, externalProcessingAuthorized: false as true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("admin").compass.complementary({ ...request, apiKey: "untrusted" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.explain).not.toHaveBeenCalled();
  });
  it("refuses high-risk assessments and removed training/capability requests", async () => {
    await expect(caller("admin").compass.complementary({ ...request, assessment: { ...sampleAssessment, confidentialInfoIncluded: true } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("admin").compass.complementary({ ...request, assessment: { ...sampleAssessment, trainingUseAuthorized: true } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("admin").compass.complementary({ ...request, assessment: { ...sampleAssessment, requestedCapabilities: ["host.shell"] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.explain).not.toHaveBeenCalled();
  });
  it("preserves the disabled skeleton and no operator approval means no model call", async () => {
    state.enabled = false;
    await expect(caller("admin").compass.complementary(request)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    state.enabled = true; state.approved = false;
    await expect(caller("admin").compass.complementary(request)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(state.explain).not.toHaveBeenCalled();
  });
  it("enforces durable pool quotas before model execution", async () => {
    state.quota.mockRejectedValueOnce(new Error("quota refusal"));
    await expect(caller("admin").compass.complementary(request)).rejects.toThrow();
    expect(state.grant).toHaveBeenCalled();
    expect(state.explain).not.toHaveBeenCalled();
  });
  it("uses the same baseline for either mode without changing its decision", async () => {
    for (const executionMode of ["director", "agent"] as const) {
      const result = await caller("admin").compass.complementary({ ...request, executionMode });
      expect(result.capabilitiesExpanded).toBe(false);
      expect(result.text).toBe("Optional explanation");
      expect(state.quota).toHaveBeenCalledWith(1);
    }
  });
});
