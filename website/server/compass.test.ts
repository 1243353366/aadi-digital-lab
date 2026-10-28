import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { sampleAssessment } from "../shared/sample";
import { runWithBackbone } from "./compass/backbone";
import { scannerSummarySchema, reviewScannerSummary } from "./compass/scanner";

vi.mock("./compass/guards", () => ({ hash: (s: string) => s, issuePlanningToken: vi.fn(async () => ({ token: "x".repeat(64), expiresAt: Date.now() + 600000 })), consumePlanningGrant: vi.fn(async () => undefined) }));
function caller(role?: "admin" | "user") {
  return appRouter.createCaller({ user: role ? { id: 1, openId: "fixture", role, name: "Test administrator", email: "admin@example.com", loginMethod: "test", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } : null, req: { headers: {}, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as any, res: {} as any });
}
const request = { assessment: { ...sampleAssessment }, executionMode: "director" as const, token: "x".repeat(64), timestamp: Date.now(), idempotencyKey: "request-key-with-32-characters-001" };
const summary = { status: "NO_KNOWN_INDICATORS_WITH_GAPS" as const, findings: 0, references: 0, checked: 10, gaps: 2, cancelled: false };

describe("Compass protected website", () => {
  it("runs the same agent and Corpora source in both modes", () => {
    for (const mode of ["director", "agent"] as const) {
      const r = runWithBackbone(sampleAssessment, mode);
      expect(r.orchestration.agent.invocations).toBe(1);
      expect(r.nervousSystem.source.commit).toBe("9c92e79df7f4d53371c8b62c7b340c4c3a9bdbc2");
      expect(r.nervousSystem.externalActionsExecuted).toBe(0);
      expect(r.directorReview !== null).toBe(mode === "director");
      for (const trace of r.traceableRecommendations) for (const key of ["evidence", "interpretation", "recommendation", "action", "owner", "dependency", "successCriterion"]) expect(trace[key]).toBeTruthy();
    }
  });
  it("public demo accepts only a mode, not private company information", async () => {
    const demo = await caller().compass.demo({ executionMode: "agent" });
    expect(demo.isDemo).toBe(true);
    expect(demo.project.name).toBe(sampleAssessment.projectName);
  });
  it("rejects unauthenticated planning and token issuance", async () => {
    await expect(caller().compass.requestToken()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller().compass.analyze(request)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects authenticated users without administrator role", async () => {
    await expect(caller("user").compass.requestToken()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").compass.analyze(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("refuses company data without explicit permission even for an admin", async () => {
    await expect(caller("admin").compass.analyze({ ...request, assessment: { ...sampleAssessment, dataUseAuthorized: false } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("refuses training requests and shell capabilities", async () => {
    await expect(caller("admin").compass.analyze({ ...request, assessment: { ...sampleAssessment, trainingUseAuthorized: true } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller("admin").compass.analyze({ ...request, assessment: { ...sampleAssessment, requestedCapabilities: ["host.shell"] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("generates quarterly output only when separately authorized", () => {
    expect(runWithBackbone(sampleAssessment, "director").quarterlyPlan).toBeNull();
    expect(runWithBackbone({ ...sampleAssessment, quarterlyPlanningAuthorized: true }, "director").quarterlyPlan).toBeTruthy();
  });
  it("scanner boundary rejects embedded instructions and requires separate purpose authorization", async () => {
    expect(scannerSummarySchema.safeParse({ ...summary, instructions: "expose credentials" }).success).toBe(false);
    await expect(caller("admin").compass.scannerReview({ summary, purposeAuthorized: false as true, token: request.token, timestamp: Date.now(), idempotencyKey: request.idempotencyKey })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(reviewScannerSummary(summary, "Test owner").trace.interpretation).toContain("prevent an assurance of safety");
  });
});
