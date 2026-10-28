import test from "node:test";
import assert from "node:assert/strict";
import { handleCompass } from "../api/compass.js";

class FakeD1 {
  constructor() {
    this.users = new Map([[1, { id: 1, username: "admin", role: "admin" }], [2, { id: 2, username: "author", role: "author" }]]);
    this.sessions = new Map(); this.tokens = new Map(); this.idempotency = new Map(); this.rate = [];
  }
  prepare(sql) { return new FakeStatement(this, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}
class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, " ").trim(); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    const q = this.sql;
    if (q.startsWith("SELECT user_id, expires_at FROM sessions")) return this.db.sessions.get(this.args[0]) || null;
    if (q.startsWith("SELECT id, username, role FROM users")) return this.db.users.get(this.args[0]) || null;
    if (q.startsWith("SELECT COUNT(*) AS n FROM rate_limits")) {
      const [ip, endpoint, since] = this.args;
      return { n: this.db.rate.filter((row) => row.ip === ip && row.endpoint === endpoint && row.created_at > since).length };
    }
    if (q.startsWith("DELETE FROM compass_request_tokens") && q.includes("RETURNING")) {
      const [hash, userId, now] = this.args, row = this.db.tokens.get(hash);
      if (!row || row.user_id !== userId || row.expires_at <= now) return null;
      this.db.tokens.delete(hash); return { token_hash: hash };
    }
    return null;
  }
  async run() {
    const q = this.sql, a = this.args, now = Date.now();
    if (q.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
    if (q.startsWith("DELETE FROM compass_request_tokens WHERE expires_at")) {
      for (const [key, row] of this.db.tokens) if (row.expires_at <= a[0]) this.db.tokens.delete(key);
    } else if (q.startsWith("INSERT INTO compass_request_tokens")) {
      this.db.tokens.set(a[0], { user_id: a[1], expires_at: a[2] });
    } else if (q.startsWith("DELETE FROM compass_idempotency WHERE expires_at")) {
      for (const [key, row] of this.db.idempotency) if (row.expires_at <= a[0]) this.db.idempotency.delete(key);
    } else if (q.startsWith("INSERT OR IGNORE INTO compass_idempotency")) {
      if (this.db.idempotency.has(a[0])) return { meta: { changes: 0 } };
      this.db.idempotency.set(a[0], { user_id: a[1], expires_at: a[2] }); return { meta: { changes: 1 } };
    } else if (q.startsWith("INSERT INTO rate_limits")) {
      this.db.rate.push({ ip: a[0], endpoint: a[1], created_at: a[2] });
    } else if (q.startsWith("DELETE FROM rate_limits")) {
      this.db.rate = this.db.rate.filter((row) => row.created_at >= a[0]);
    } else if (q.startsWith("DELETE FROM sessions WHERE token_hash")) this.db.sessions.delete(a[0]);
    return { meta: { changes: 1 }, now };
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
}
async function fixture(role = "admin") {
  const db = new FakeD1(), session = `session-${role}`;
  const user = role === "admin" ? db.users.get(1) : db.users.get(2);
  db.sessions.set(await sha256(session), { user_id: user.id, expires_at: new Date(Date.now() + 60_000).toISOString() });
  return { db, session, user };
}
function context(db, path, { method = "GET", session, headers = {}, body } = {}) {
  const request = new Request(`https://lab.example${path}`, {
    method, body,
    headers: { "CF-Connecting-IP": "198.51.100.6", ...(session ? { Cookie: `adl_session=${session}` } : {}), ...headers },
  });
  return { request, env: { DB: db } };
}
async function token(db, session) {
  const response = await handleCompass(context(db, "/api/compass/request-token", { session }));
  assert.equal(response.status, 200); return (await response.json()).token;
}
const input = {
  projectName: "Onboarding redesign", budget: 175000, currency: "USD", budgetDisclosure: "approximate", budgetPeriod: "project", budgetFlexibility: "fixed",
  window: "3-6-months", urgency: "firm", objectives: "Reduce customer onboarding time without increasing support demand.", companyGoals: "Improve retention.",
  departmentGoals: "Reduce avoidable support work.", teamGoals: "Deliver maintainable improvements with clear ownership.", constraints: "Keep billing online.",
  hierarchy: "matrix", approvalLoad: "medium", scopeCertainty: "medium", changeFrequency: "high", deliveryCadence: "biweekly", compliance: "medium",
  teamSize: 8, availablePersonnel: 6, distribution: "hybrid", stakeholderAccess: "high", dependencyLevel: "high", interruptionLevel: "medium", preference: "none",
  dataUseAuthorized: true, submitterName: "Jordan Lee", submitterWorkEmail: "jordan@example.com", authorityRole: "project-owner", decisionOwnerName: "Morgan Chen", decisionOwnerRole: "VP Operations", capabilities: ["cross-functional", "dedicated"],
};
async function post(db, session, path, body = input, extras = {}) {
  const requestToken = extras.requestToken ?? await token(db, session);
  return handleCompass(context(db, path, {
    method: "POST", session, body: extras.body ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json", Origin: "https://lab.example", "X-Request-Token": requestToken, "X-Request-Timestamp": String(Date.now()), "X-Idempotency-Key": extras.idempotency ?? crypto.randomUUID(), ...extras.headers },
  }));
}

test("health is public and no-store", async () => {
  const { db } = await fixture();
  const response = await handleCompass(context(db, "/api/compass/health"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).orchestration.modes, ["director", "agent"]);
});
test("request token requires an authenticated admin", async () => {
  const { db } = await fixture();
  assert.equal((await handleCompass(context(db, "/api/compass/request-token"))).status, 401);
  const author = await fixture("author");
  assert.equal((await handleCompass(context(author.db, "/api/compass/request-token", { session: author.session }))).status, 403);
});
test("planning rejects missing token and cross-origin requests before execution", async () => {
  const { db, session } = await fixture();
  const missing = await handleCompass(context(db, "/api/compass/recommend", { method: "POST", session, body: JSON.stringify(input), headers: { "Content-Type": "application/json", Origin: "https://lab.example" } }));
  assert.equal(missing.status, 403);
  const cross = await post(db, session, "/api/compass/recommend", input, { headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } });
  assert.equal(cross.status, 403);
});
test("invalid consent preserves the Compass 422 validation response", async () => {
  const { db, session } = await fixture();
  const response = await post(db, session, "/api/compass/recommend", { ...input, dataUseAuthorized: false });
  const data = await response.json(); assert.equal(response.status, 422); assert.ok(data.fields.dataUseAuthorized);
});
test("both explicit modes run and cannot be overridden by body mode", async () => {
  for (const mode of ["director", "agent"]) {
    const { db, session } = await fixture();
    const response = await post(db, session, `/api/compass/${mode}/recommend`, { ...input, executionMode: mode === "director" ? "agent" : "director" });
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.orchestration.executionMode, mode); assert.equal(data.mode, "transparent-model"); assert.equal(data.ai, null);
  }
});
test("a consumed request token cannot be replayed", async () => {
  const { db, session } = await fixture(), requestToken = await token(db, session);
  assert.equal((await post(db, session, "/api/compass/recommend", input, { requestToken })).status, 200);
  assert.equal((await post(db, session, "/api/compass/recommend", input, { requestToken })).status, 403);
});
test("invalid JSON MIME and streaming oversize payload are rejected", async () => {
  const { db, session } = await fixture();
  const mime = await post(db, session, "/api/compass/recommend", input, { headers: { "Content-Type": "text/plain" } });
  assert.equal(mime.status, 415);
  const large = await post(db, session, "/api/compass/recommend", input, { body: "x".repeat(32 * 1024 + 1) });
  assert.equal(large.status, 413);
});

test("company authorization does not substitute for a signed-in admin", async () => {
  const { db } = await fixture();
  assert.equal((await handleCompass(context(db, "/api/compass/director/recommend", { method: "POST", body: JSON.stringify(input) }))).status, 401);
  const author = await fixture("author");
  assert.equal((await handleCompass(context(author.db, "/api/compass/agent/recommend", { method: "POST", session: author.session, body: JSON.stringify(input) }))).status, 403);
});

test("one-time token cannot move between sessions belonging to the same user", async () => {
  const { db, session } = await fixture();
  const requestToken = await token(db, session);
  const otherSession = "another-admin-session";
  db.sessions.set(await sha256(otherSession), { user_id: 1, expires_at: new Date(Date.now() + 60_000).toISOString() });
  assert.equal((await post(db, otherSession, "/api/compass/recommend", input, { requestToken })).status, 403);
});

test("idempotency is shared across Director and Agent modes", async () => {
  const { db, session } = await fixture();
  const idempotency = crypto.randomUUID();
  assert.equal((await post(db, session, "/api/compass/director/recommend", input, { idempotency })).status, 200);
  assert.equal((await post(db, session, "/api/compass/agent/recommend", input, { idempotency })).status, 409);
});

test("changing IP addresses does not bypass the account burst quota", async () => {
  const { db, session } = await fixture();
  for (let index = 0; index < 9; index++) {
    const response = await post(db, session, "/api/compass/recommend", input, { headers: { "CF-Connecting-IP": `198.51.100.${index + 10}` } });
    assert.equal(response.status, index < 8 ? 200 : 429);
  }
});

test("admin session cannot authorize training or shell execution", async () => {
  const { db, session } = await fixture();
  assert.equal((await post(db, session, "/api/compass/recommend", { ...input, trainingUseAuthorized: true })).status, 422);
  assert.equal((await post(db, session, "/api/compass/recommend", { ...input, requestedCapabilities: ["host.shell"] })).status, 403);
});
