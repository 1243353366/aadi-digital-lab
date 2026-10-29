import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { sampleAssessment } from "../../shared/sample";
import { methodologyCatalog } from "./core/recommendation-engine";
import { runWithBackbone, CORPORA_SOURCE } from "./backbone";
import { consumePlanningGrant, consumeComplementaryQuota, hash, issuePlanningToken } from "./guards";
import { reviewScannerSummary, scannerSummarySchema } from "./scanner";
import { complementaryStatus, explainMethod } from "./complementary";

const planningProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Company assessments require an authorized workspace administrator." });
  return next({ ctx });
});

function checkOrigin(req: any) {
  if (req.headers["sec-fetch-site"] === "cross-site") throw new TRPCError({ code: "FORBIDDEN", message: "Cross-site planning requests are not allowed." });
  const origin = req.headers.origin;
  const host = String(req.headers.host || "").trim();
  if (origin) {
    try {
      if (process.env.PUBLIC_ORIGIN) {
        if (new URL(origin).origin !== new URL(process.env.PUBLIC_ORIGIN).origin) throw new Error("origin");
      } else if (!host || new URL(origin).host !== host) throw new Error("origin");
    }
    catch { throw new TRPCError({ code: "FORBIDDEN", message: "The request origin is not allowed." }); }
  }
}

export const compassRouter = router({
  info: publicProcedure.query(() => ({ source: CORPORA_SOURCE, engine: "Transparent, rule-based planning", storage: "No company assessments or plans retained", training: false, actions: false })),
  complementaryInfo: planningProcedure.query(() => complementaryStatus()),
  complementary: planningProcedure.input(z.object({
    assessment: z.record(z.string(), z.unknown()),
    executionMode: z.enum(["director", "agent"]),
    externalProcessingAuthorized: z.literal(true),
    externalConsentVersion: z.literal("compass-complementary-external-v1"),
    token: z.string().min(32).max(128), timestamp: z.number(),
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{20,128}$/),
  }).strict()).mutation(async ({ ctx, input }) => {
    checkOrigin(ctx.req);
    if (Buffer.byteLength(JSON.stringify(input.assessment), "utf8") > 32 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "The assessment must be smaller than 32 KB." });
    if (input.assessment.confidentialInfoIncluded === true || (Array.isArray(input.assessment.highRiskCategories) && input.assessment.highRiskCategories.length)) throw new TRPCError({ code: "FORBIDDEN", message: "High-risk assessments are not eligible for this external layer." });
    if (!complementaryStatus().enabled || !complementaryStatus().companyUseApproved) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The optional gateway is disabled or not approved by the operator." });
    await consumePlanningGrant({ userId: ctx.user.id, session: hash(String(ctx.req.headers.cookie || "")), token: input.token, timestamp: input.timestamp, idempotencyKey: input.idempotencyKey, ip: ctx.req.ip || ctx.req.socket.remoteAddress || "unknown" });
    await consumeComplementaryQuota(ctx.user.id);
    try {
      // Rebuild server-side, so a supplied/fabricated brief cannot direct the API.
      const baseline = runWithBackbone(input.assessment, input.executionMode);
      const narrative = await explainMethod(baseline, { principalId: `account:${ctx.user.id}`, idempotencyKey: input.idempotencyKey, externalProcessingAuthorized: input.externalProcessingAuthorized });
      return { ...narrative, consentVersion: input.externalConsentVersion, suggestedMethod: baseline.recommendation.name, externalProcessingPerformed: true, capabilitiesExpanded: false };
    } catch (error: any) {
      if (error?.code === "CAPABILITY_DENIED") throw new TRPCError({ code: "FORBIDDEN", message: "The requested capability is not allowed." });
      if (error?.code === "VALIDATION_ERROR" || error?.code === "INVALID_INPUT") throw new TRPCError({ code: "BAD_REQUEST", message: "Review the assessment and required authorizations." });
      if (["RATE_LIMITED", "BUSY"].includes(error?.code)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Optional narrative capacity is protected. Retry later." });
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The optional narrative is unavailable. The original decision brief remains valid for human review." });
    }
  }),
  methods: publicProcedure.query(() => methodologyCatalog()),
  demo: publicProcedure.input(z.object({ executionMode: z.enum(["director", "agent"]).default("director") })).query(({ input }) => ({ ...runWithBackbone(sampleAssessment, input.executionMode), isDemo: true })),
  requestToken: planningProcedure.mutation(async ({ ctx }) => {
    checkOrigin(ctx.req);
    return issuePlanningToken(ctx.user.id, hash(String(ctx.req.headers.cookie || "")));
  }),
  scannerReview: planningProcedure.input(z.object({
    summary: scannerSummarySchema,
    purposeAuthorized: z.literal(true),
    token: z.string().min(32).max(128),
    timestamp: z.number(),
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{20,128}$/),
  })).mutation(async ({ ctx, input }) => {
    checkOrigin(ctx.req);
    await consumePlanningGrant({ userId: ctx.user.id, session: hash(String(ctx.req.headers.cookie || "")), token: input.token, timestamp: input.timestamp, idempotencyKey: input.idempotencyKey, ip: ctx.req.ip || ctx.req.socket.remoteAddress || "unknown" });
    return reviewScannerSummary(input.summary, ctx.user.name || "Authorized workspace administrator");
  }),
  analyze: planningProcedure.input(z.object({
    assessment: z.record(z.string(), z.unknown()),
    executionMode: z.enum(["director", "agent"]),
    token: z.string().min(32).max(128),
    timestamp: z.number(),
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{20,128}$/),
  })).mutation(async ({ ctx, input }) => {
    checkOrigin(ctx.req);
    if (Buffer.byteLength(JSON.stringify(input.assessment), "utf8") > 32 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "The assessment must be smaller than 32 KB." });
    await consumePlanningGrant({ userId: ctx.user.id, session: hash(String(ctx.req.headers.cookie || "")), token: input.token, timestamp: input.timestamp, idempotencyKey: input.idempotencyKey, ip: ctx.req.ip || ctx.req.socket.remoteAddress || "unknown" });
    try {
      return { ...runWithBackbone(input.assessment, input.executionMode), isDemo: false, authenticatedPrincipal: { name: ctx.user.name, role: ctx.user.role } };
    } catch (error: any) {
      if (error?.code === "CAPABILITY_DENIED") throw new TRPCError({ code: "FORBIDDEN", message: "The requested capability is outside the planning policy." });
      if (error?.code === "VALIDATION_ERROR") throw new TRPCError({ code: "BAD_REQUEST", message: Object.values(error.fields || {}).join(" ") || "Review the assessment and authorization fields." });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The assessment could not be completed. No external action was performed." });
    }
  }),
});
