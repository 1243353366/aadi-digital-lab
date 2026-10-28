import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { sampleAssessment } from "../../shared/sample";
import { methodologyCatalog } from "./core/recommendation-engine";
import { runWithBackbone, CORPORA_SOURCE } from "./backbone";
import { consumePlanningGrant, hash, issuePlanningToken } from "./guards";
import { reviewScannerSummary, scannerSummarySchema } from "./scanner";

const planningProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Company assessments require an authorized workspace administrator." });
  return next({ ctx });
});

function checkOrigin(req: any) {
  if (req.headers["sec-fetch-site"] === "cross-site") throw new TRPCError({ code: "FORBIDDEN", message: "Cross-site planning requests are not allowed." });
  const origin = req.headers.origin;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (origin && host) {
    try { if (new URL(origin).host !== host) throw new Error("origin"); }
    catch { throw new TRPCError({ code: "FORBIDDEN", message: "The request origin is not allowed." }); }
  }
}

export const compassRouter = router({
  info: publicProcedure.query(() => ({ source: CORPORA_SOURCE, engine: "Transparent, rule-based planning", storage: "No company assessments or plans retained", training: false, actions: false })),
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
