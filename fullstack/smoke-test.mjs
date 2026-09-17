#!/usr/bin/env node
/* Smoke test for Aadi's Digital Lab — zero dependencies, Node 18+.
 *
 * Table-driven: each row names a critical endpoint, the request it makes,
 * and the response it expects. Any mismatch fails LOUDLY with the exact
 * request, what was expected, and what actually came back. Exit code 1
 * on any failure, so CI or a shell loop can treat non-zero as "site down".
 *
 * Usage:
 *   node smoke-test.mjs                       # against production
 *   SMOKE_BASE=http://localhost:8788 node smoke-test.mjs   # against local dev
 *   node smoke-test.mjs --ratelimit           # also burn the login rate limit (429 test)
 */

const BASE = (process.env.SMOKE_BASE || "https://aadi-digital-lab-fullstack.aadishankar1999.workers.dev").replace(/\/+$/, "");
const EXPECTED_REPO = "1243353366/aadi-digital-lab";
const WITH_RATELIMIT = process.argv.includes("--ratelimit");

/* ---------- checks ---------- */

const checks = [
  {
    name: "deployment identity — home page serves the app",
    request: { url: `${BASE}/` },
    expect: { status: 200, bodyIncludes: "Aadi" },
  },
  {
    name: `expected GitHub repo — console is wired to ${EXPECTED_REPO}`,
    request: { url: `${BASE}/js/console.js` },
    expect: { status: 200, bodyIncludesAll: ['GH_USER = "1243353366"', 'GH_REPO = "aadi-digital-lab"'] },
  },
  {
    name: "posts API — returns the seeded posts",
    request: { url: `${BASE}/api/posts` },
    expect: { status: 200, bodyIncludes: "The OSINT checklist I actually use" },
  },
  {
    name: "search — q=checklist finds the OSINT post",
    request: { url: `${BASE}/api/posts?q=checklist` },
    expect: { status: 200, bodyIncludes: "The OSINT checklist I actually use" },
  },
  {
    name: "search — unknown term returns empty array",
    request: { url: `${BASE}/api/posts?q=zzzznotfound` },
    expect: { status: 200, body: "[]" },
  },
  {
    name: "tag filter — tag=research returns tagged posts",
    request: { url: `${BASE}/api/posts?tag=research` },
    expect: { status: 200, bodyIncludes: "OSINT checklist" },
  },
  {
    name: "comments read — post comments endpoint responds",
    request: { url: `${BASE}/api/post/hello-from-the-lab/comments` },
    expect: { status: 200 },
  },
  {
    name: "auth gate — unauthenticated post creation is rejected",
    request: {
      url: `${BASE}/api/posts/create`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "unauthorized probe", content: "should never succeed" }),
      },
    },
    expect: { status: 401 },
  },
  {
    name: "security headers — CSP present on the home page",
    request: { url: `${BASE}/` },
    expect: { status: 200, headerIncludes: { "content-security-policy": "default-src 'self'" } },
  },
  {
    name: "security headers — nosniff on API responses",
    request: { url: `${BASE}/api/posts` },
    expect: { status: 200, headerIncludes: { "x-content-type-options": "nosniff" } },
  },
];

/* ---------- runner ---------- */

function describeRequest(url, init) {
  const method = (init && init.method) || "GET";
  return `${method} ${url}` + (init && init.body ? `  body=${init.body}` : "");
}

async function runCheck(c) {
  const res = await fetch(c.request.url, c.request.init || {});
  const actualStatus = res.status;
  const failures = [];
  const e = c.expect;

  if (e.status !== undefined && actualStatus !== e.status) {
    failures.push(`status: expected ${e.status}, got ${actualStatus}`);
  }
  if (e.headerIncludes) {
    for (const [h, needle] of Object.entries(e.headerIncludes)) {
      const val = res.headers.get(h);
      if (!val || !val.toLowerCase().includes(needle.toLowerCase())) {
        failures.push(`header ${h}: expected it to include "${needle}", got ${val ? `"${val}"` : "nothing"}`);
      }
    }
  }
  if (e.bodyIncludesAll !== undefined || e.body !== undefined || e.bodyIncludes !== undefined) {
    const body = await res.text();
    if (e.body !== undefined && body.trim() !== e.body) {
      failures.push(`body: expected exactly ${JSON.stringify(e.body)}, got ${JSON.stringify(body.slice(0, 200))}`);
    }
    if (e.bodyIncludes !== undefined && !body.includes(e.bodyIncludes)) {
      failures.push(`body: expected it to include "${e.bodyIncludes}", got ${JSON.stringify(body.slice(0, 200))}`);
    }
    for (const needle of e.bodyIncludesAll || []) {
      if (!body.includes(needle)) {
        failures.push(`body: expected it to include "${needle}", got ${JSON.stringify(body.slice(0, 200))}`);
      }
    }
  }
  return failures;
}

async function checkLoginRateLimit() {
  /* Deliberately burns 8+ bad login attempts to prove the limiter trips.
     Only runs with --ratelimit because it exhausts the sandbox IP's
     15-minute budget (and the window needs to be free to start). */
  const name = "rate limit — 9th bad login from same IP gets 429";
  const request = `${BASE}/api/auth/login (x9, wrong passwords)`;
  let saw429 = false;
  for (let i = 1; i <= 10; i++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ratelimit-probe", password: `wrong-${i}` }),
    });
    if (res.status === 429) { saw429 = true; break; }
    if (res.status !== 401) {
      return { name, request, failures: [`attempt ${i}: expected 401 (bad credentials) or 429 (limited), got ${res.status}`] };
    }
  }
  return saw429
    ? { name, request, failures: [] }
    : { name, request, failures: ["10 bad logins never hit 429 — limiter not working?"] };
}

async function main() {
  process.stdout.write(`smoke test -> ${BASE}\nexpected repo -> ${EXPECTED_REPO}\n\n`);
  let failed = 0;
  for (const c of checks) {
    process.stdout.write(`  ${c.name} ... `);
    try {
      const failures = await runCheck(c);
      if (failures.length) {
        failed++;
        console.log("FAIL");
        console.error(`\n  FAILED CHECK: ${c.name}`);
        console.error(`  REQUEST: ${describeRequest(c.request.url, c.request.init)}`);
        for (const f of failures) console.error(`  ${f}`);
        console.error("");
      } else {
        console.log("ok");
      }
    } catch (err) {
      failed++;
      console.log("FAIL");
      console.error(`\n  FAILED CHECK: ${c.name}`);
      console.error(`  REQUEST: ${describeRequest(c.request.url, c.request.init)}`);
      console.error(`  ${err}`);
      console.error("");
    }
  }
  if (WITH_RATELIMIT) {
    process.stdout.write(`  `);
    const r = await checkLoginRateLimit();
    if (r.failures.length) {
      failed++;
      console.log("FAIL");
      console.error(`\n  FAILED CHECK: ${r.name}`);
      console.error(`  REQUEST: ${r.request}`);
      for (const f of r.failures) console.error(`  ${f}`);
      console.error("");
    } else {
      console.log("ok");
    }
  }
  const total = checks.length + (WITH_RATELIMIT ? 1 : 0);
  console.error(`\n${failed ? "SMOKE TEST FAILED" : "SMOKE TEST PASSED"} — ${total - failed}/${total} checks ok`);
  process.exit(failed ? 1 : 0);
}

main();
