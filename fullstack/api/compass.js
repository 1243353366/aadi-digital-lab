import { runCompass } from "../../compass/src/director.js";
import { requireAdmin, json, rateLimit, randomHex, sha256Hex } from "./_shared.js";

const MAX_BODY_BYTES = 32 * 1024;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const TIMESTAMP_SKEW_MS = 2 * 60 * 1000;
const NO_STORE = { "Cache-Control": "no-store" };

const reply = (data, status = 200) => json(data, status, NO_STORE);

function noStore(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

function sameOrigin(request) {
  const site = (request.headers.get("Sec-Fetch-Site") || "").toLowerCase();
  if (site === "cross-site") return false;
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function sessionBinding(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)adl_session=([^;]*)/);
  return match ? match[1] : "";
}

function requestError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function readJson(request) {
  const mime = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (mime !== "application/json") throw requestError("UNSUPPORTED_MEDIA_TYPE");
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    throw requestError("PAYLOAD_TOO_LARGE");
  }
  const reader = request.body && request.body.getReader ? request.body.getReader() : null;
  if (!reader) throw requestError("INVALID_JSON");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw requestError("PAYLOAD_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw requestError("INVALID_JSON"); }
}

async function ensureTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS compass_request_tokens(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS compass_idempotency(key_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires_at INTEGER NOT NULL)").run();
}

async function allowTokenRequest(db, request, user) {
  const accountRequest = new Request(request.url, { headers: { "CF-Connecting-IP": `account:${user.id}` } });
  const checks = await Promise.all([
    rateLimit(db, request, "compass-token", 30, 60_000),
    rateLimit(db, accountRequest, "compass-token-account", 30, 60_000),
  ]);
  return checks.every(Boolean);
}

async function allowPlanningRequest(db, request, user) {
  const accountRequest = new Request(request.url, { headers: { "CF-Connecting-IP": `account:${user.id}` } });
  const checks = await Promise.all([
    rateLimit(db, request, "compass-planning-burst", 8, 10_000),
    rateLimit(db, accountRequest, "compass-planning-account-burst", 8, 10_000),
    rateLimit(db, request, "compass-planning-minute", 30, 60_000),
    rateLimit(db, accountRequest, "compass-planning-account-minute", 30, 60_000),
  ]);
  return checks.every(Boolean);
}

async function authenticatedAdmin(context) {
  const { user, error } = await requireAdmin(context);
  return error ? { user: null, error: noStore(error) } : { user, error: null };
}

async function issueToken(context) {
  const db = context.env && context.env.DB;
  if (!db) return reply({ error: "Service unavailable" }, 503);
  const auth = await authenticatedAdmin(context);
  if (auth.error) return auth.error;
  if (!sameOrigin(context.request)) return reply({ error: "Request origin is not allowed." }, 403);
  await ensureTables(db);
  if (!(await allowTokenRequest(db, context.request, auth.user))) return reply({ error: "Too many token requests." }, 429);
  const now = Date.now();
  const token = randomHex(32);
  const tokenHash = await sha256Hex(`${auth.user.id}:${sessionBinding(context.request)}:${token}`);
  await db.prepare("DELETE FROM compass_request_tokens WHERE expires_at <= ?").bind(now).run();
  await db.prepare("INSERT INTO compass_request_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .bind(tokenHash, auth.user.id, now + TOKEN_TTL_MS).run();
  return reply({ ok: true, token, expiresInSeconds: TOKEN_TTL_MS / 1000 });
}

function validTimestamp(value) {
  return /^\d{10,16}$/.test(value || "") && Math.abs(Date.now() - Number(value)) <= TIMESTAMP_SKEW_MS;
}

function validIdempotencyKey(value) {
  return /^[A-Za-z0-9_-]{20,128}$/.test(value || "") ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

async function consumeRequestToken(db, request, user) {
  const token = request.headers.get("X-Request-Token") || "";
  if (!token || !validTimestamp(request.headers.get("X-Request-Timestamp"))) return false;
  const tokenHash = await sha256Hex(`${user.id}:${sessionBinding(request)}:${token}`);
  const used = await db.prepare(
    "DELETE FROM compass_request_tokens WHERE token_hash = ? AND user_id = ? AND expires_at > ? RETURNING token_hash"
  ).bind(tokenHash, user.id, Date.now()).first();
  return !!used;
}

async function consumeIdempotencyKey(db, request, user) {
  const key = request.headers.get("X-Idempotency-Key") || "";
  if (!validIdempotencyKey(key)) return { valid: false, inserted: false };
  const now = Date.now();
  const keyHash = await sha256Hex(`${user.id}:${key}`);
  await db.prepare("DELETE FROM compass_idempotency WHERE expires_at <= ?").bind(now).run();
  const result = await db.prepare(
    "INSERT OR IGNORE INTO compass_idempotency(key_hash,user_id,expires_at) VALUES(?,?,?)"
  ).bind(keyHash, user.id, now + TOKEN_TTL_MS).run();
  return { valid: true, inserted: Number(result && result.meta && result.meta.changes) === 1 };
}

function compassFailure(error) {
  if (error && error.code === "VALIDATION_ERROR") {
    return reply({ error: "Some request fields are missing or invalid.", fields: error.fields || {} }, 422);
  }
  if (error && error.code === "CAPABILITY_DENIED") {
    return reply({ error: "Requested capability is not allowed.", deniedCapabilities: Array.isArray(error.denied) ? error.denied.slice(0, 32) : [] }, 403);
  }
  if (error && error.code === "UNSUPPORTED_MEDIA_TYPE") return reply({ error: "Content-Type must be application/json." }, 415);
  if (error && error.code === "PAYLOAD_TOO_LARGE") return reply({ error: "Payload too large." }, 413);
  if (error && error.code === "INVALID_JSON") return reply({ error: "Invalid JSON body." }, 400);
  return reply({ error: "The request could not be completed." }, 500);
}

async function recommend(context, forcedMode) {
  const db = context.env && context.env.DB;
  if (!db) return reply({ error: "Service unavailable" }, 503);
  const auth = await authenticatedAdmin(context);
  if (auth.error) return auth.error;
  if (!sameOrigin(context.request)) return reply({ error: "Request origin is not allowed." }, 403);
  try {
    await ensureTables(db);
    if (!(await consumeRequestToken(db, context.request, auth.user))) {
      return reply({ error: "A fresh one-time request token and timestamp are required." }, 403);
    }
    const idempotency = await consumeIdempotencyKey(db, context.request, auth.user);
    if (!idempotency.valid || !idempotency.inserted) {
      return reply({ error: "A unique idempotency key is required for each recommendation request." }, 409);
    }
    if (!(await allowPlanningRequest(db, context.request, auth.user))) return reply({ error: "Too many recommendation requests." }, 429);
    const input = await readJson(context.request);
    const executionMode = forcedMode || input.executionMode || "director";
    const result = runCompass(input, { executionMode });
    return reply({
      ...result,
      ok: true,
      mode: "transparent-model",
      ai: null,
      perspective: null,
      authenticatedPrincipal: { username: auth.user.username, role: auth.user.role },
    });
  } catch (error) {
    return compassFailure(error);
  }
}

export async function handleCompass(context) {
  try {
    const { request } = context;
    const path = new URL(request.url).pathname;
    if (path === "/api/compass/health") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405);
      return reply({
        ok: true,
        service: "lab-compass",
        orchestration: { version: "compass-director-agent-v1", modes: ["director", "agent"] },
        authRequired: true,
        aiAssist: { configured: false },
      });
    }
    if (path === "/api/compass/request-token") {
      if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405);
      return issueToken(context);
    }
    if (path === "/api/compass/director/recommend") {
      if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
      return recommend(context, "director");
    }
    if (path === "/api/compass/agent/recommend") {
      if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
      return recommend(context, "agent");
    }
    if (path === "/api/compass/recommend") {
      if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
      return recommend(context, null);
    }
    return reply({ error: "Not found" }, 404);
  } catch {
    return reply({ error: "The request could not be completed." }, 500);
  }
}
