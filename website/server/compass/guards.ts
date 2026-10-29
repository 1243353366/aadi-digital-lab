import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { planningGuards, planningRates } from "../../drizzle/schema";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const TTL = 10 * 60_000;

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The secure planning gateway is temporarily unavailable." });
  return db;
}

async function quota(identity: string, name: string, max: number, windowMs: number) {
  const db = await database();
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const keyHash = hash(`${identity}:${name}:${bucket}`);
  await db.insert(planningRates).values({ keyHash, count: 1, expiresAt: new Date((bucket + 2) * windowMs) })
    .onDuplicateKeyUpdate({ set: { count: sql`${planningRates.count} + 1` } });
  const rows = await db.select().from(planningRates).where(eq(planningRates.keyHash, keyHash)).limit(1);
  if (!rows[0] || rows[0].count > max) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Planning capacity is protected. Please wait a minute and try again." });
}

export async function issuePlanningToken(userId: number, session: string) {
  await quota(`account:${userId}`, "tokens", 30, 60_000);
  const db = await database();
  await db.delete(planningGuards).where(lt(planningGuards.expiresAt, new Date()));
  await db.delete(planningRates).where(lt(planningRates.expiresAt, new Date()));
  const token = randomBytes(32).toString("base64url");
  await db.insert(planningGuards).values({ keyHash: hash(`token:${userId}:${session}:${token}`), userId, kind: "token", expiresAt: new Date(Date.now() + TTL) });
  return { token, expiresAt: Date.now() + TTL };
}

export async function consumePlanningGrant(args: { userId: number; session: string; token: string; timestamp: number; idempotencyKey: string; ip: string }) {
  if (!Number.isFinite(args.timestamp) || Math.abs(Date.now() - args.timestamp) > 120_000) throw new TRPCError({ code: "FORBIDDEN", message: "A fresh request timestamp is required." });
  const db = await database();
  const keyHash = hash(`token:${args.userId}:${args.session}:${args.token}`);
  const deleted = await db.delete(planningGuards).where(and(eq(planningGuards.keyHash, keyHash), eq(planningGuards.userId, args.userId), eq(planningGuards.kind, "token"), gt(planningGuards.expiresAt, new Date())));
  if (deleted[0].affectedRows !== 1) throw new TRPCError({ code: "FORBIDDEN", message: "This request token is expired, invalid, or already used." });
  try {
    await db.insert(planningGuards).values({ keyHash: hash(`idempotency:${args.userId}:${args.idempotencyKey}`), userId: args.userId, kind: "idempotency", expiresAt: new Date(Date.now() + TTL) });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY" || error?.cause?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "This assessment request was already submitted." });
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The secure planning gateway is temporarily unavailable." });
  }
  await quota(`account:${args.userId}`, "planning-burst", 8, 10_000);
  await quota(`account:${args.userId}`, "planning-minute", 30, 60_000);
  await quota(`ip:${args.ip}`, "planning-minute", 90, 60_000);
}

export async function consumeComplementaryQuota(userId: number) {
  await quota(`account:${userId}`, "complementary-minute", 2, 60_000);
  await quota(`account:${userId}`, "complementary-hour", 10, 3_600_000);
  // A shared pool ceiling is stricter than multiplying allowance by 7 keys.
  // One database must be shared by all replicas for this guarantee to hold.
  await quota("workspace:shared", "complementary-pool-hour", 10, 3_600_000);
}
