import express, { type Express } from "express";
import { createServer, type Server } from "node:http";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createIngress, type IngressPrincipal } from "./compass/ingress";

type RequestResult = {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
};

type TestServer = {
  app: Express;
  server: Server;
  port: number;
  close: () => Promise<void>;
};

const servers: TestServer[] = [];

async function startApp(
  principal: IngressPrincipal | (() => IngressPrincipal | Promise<IngressPrincipal>) = null,
  setup?: (app: Express, state: { parserCalls: () => number; handlerCalls: () => number }) => void
): Promise<TestServer & { parserCalls: () => number; handlerCalls: () => number }> {
  const app = express();
  let parserCount = 0;
  let handlerCount = 0;
  const resolvePrincipal = async () =>
    typeof principal === "function" ? principal() : principal;

  app.use(createIngress({ resolvePrincipal }));
  app.use((req, res, next) => {
    parserCount += 1;
    express.json({ limit: "64kb" })(req, res, next);
  });
  app.post("/api/trpc/*", (_req, res) => {
    handlerCount += 1;
    res.status(200).json({ ok: true });
  });
  app.get("/api/public", (_req, res) => {
    handlerCount += 1;
    res.status(200).json({ ok: true });
  });

  setup?.(app, {
    parserCalls: () => parserCount,
    handlerCalls: () => handlerCount,
  });

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP listener");

  const testServer: TestServer = {
    app,
    server,
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
  servers.push(testServer);
  return { ...testServer, parserCalls: () => parserCount, handlerCalls: () => handlerCount };
}

function request(
  port: number,
  {
    method = "POST",
    path = "/api/trpc/compass.analyze",
    body,
    headers = {},
  }: {
    method?: string;
    path?: string;
    body?: string;
    headers?: http.OutgoingHttpHeaders;
  } = {}
): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers,
        agent: false,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers });
        });
      }
    );
    req.once("error", reject);
    req.end(body);
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()));
});

describe("createIngress", () => {
  it("authorizes protected procedures before the JSON parser consumes a 64 KiB request", async () => {
    const app = await startApp(null);
    const payload = JSON.stringify({ payload: "x".repeat(65_000) });
    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(64 * 1024);

    const result = await request(app.port, {
      body: payload,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
      },
    });

    expect(result.status).toBe(401);
    expect(app.parserCalls()).toBe(0);
    expect(app.handlerCalls()).toBe(0);
  });

  it("rejects an authenticated non-administrator before parsing and admits an administrator", async () => {
    const body = JSON.stringify({ allowed: true });
    const userApp = await startApp({ role: "user" });
    const userResult = await request(userApp.port, {
      body,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    });

    expect(userResult.status).toBe(403);
    expect(userApp.parserCalls()).toBe(0);
    expect(userApp.handlerCalls()).toBe(0);

    const adminApp = await startApp({ role: "admin" });
    const adminResult = await request(adminApp.port, {
      body,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(body)) },
    });

    expect(adminResult.status).toBe(200);
    expect(adminApp.parserCalls()).toBe(1);
    expect(adminApp.handlerCalls()).toBe(1);
  });

  it("recognizes protected procedures in URI-decoded tRPC batches", async () => {
    const app = await startApp(null);
    const result = await request(app.port, {
      path: "/api/trpc/system.health%2Ccompass.analyze",
      body: "{}",
      headers: { "content-type": "application/json", "content-length": "2" },
    });

    expect(result.status).toBe(401);
    expect(app.parserCalls()).toBe(0);
    expect(app.handlerCalls()).toBe(0);
  });

  it("rejects API payload headers before principal resolution", async () => {
    let authCalls = 0;
    const app = await startApp(() => {
      authCalls += 1;
      return { role: "admin" };
    });

    const tooLarge = await request(app.port, {
      body: "x".repeat(65_537),
      headers: { "content-length": "65537" },
    });
    const compressed = await request(app.port, {
      body: "{}",
      headers: { "content-encoding": "gzip", "content-length": "2" },
    });
    const transferEncoded = await request(app.port, {
      method: "GET",
      path: "/api/public",
      headers: { "transfer-encoding": "chunked" },
    });

    expect(tooLarge.status).toBe(413);
    expect(compressed.status).toBe(415);
    expect(transferEncoded.status).toBe(400);
    expect(authCalls).toBe(0);
    expect(app.parserCalls()).toBe(0);
    expect(app.handlerCalls()).toBe(0);
  });

  it("enforces the host allowlist for all requests", async () => {
    const app = await startApp({ role: "admin" });
    const result = await request(app.port, {
      method: "GET",
      path: "/not-an-api-route",
      headers: { host: "wrong.example", "x-forwarded-host": "localhost" },
    });

    expect(result.status).toBe(403);
  });

  it("does not trust client forwarding headers when applying the per-peer rate limit", async () => {
    const app = await startApp({ role: "admin" });

    for (let index = 0; index < 20; index += 1) {
      const result = await request(app.port, {
        method: "GET",
        path: "/api/public",
        headers: { "x-forwarded-for": `198.51.100.${index + 1}` },
      });
      expect(result.status).toBe(200);
    }

    const refused = await request(app.port, {
      method: "GET",
      path: "/api/public",
      headers: { "x-forwarded-for": "203.0.113.99" },
    });

    expect(refused.status).toBe(429);
    expect(app.handlerCalls()).toBe(20);
  });

  it("limits active API requests and releases each connection exactly once", async () => {
    const releaseHeldRequests: Array<() => void> = [];
    let heldHandlerCalls = 0;
    const started: Array<Promise<void>> = [];
    const notifyStarted: Array<() => void> = [];

    const app = await startApp(
      { role: "admin" },
      expressApp => {
        expressApp.get("/api/hold", (_req, res) => {
          heldHandlerCalls += 1;
          notifyStarted.shift()?.();
          releaseHeldRequests.push(() => res.end('{"ok":true}'));
        });
      }
    );

    // A separate app route registered after the test harness's /api/public
    // route still receives /api/hold. Each request remains active in the route.
    const heldRequests = Array.from({ length: 8 }, () => {
      started.push(
        new Promise<void>(resolve => {
          notifyStarted.push(resolve);
        })
      );
      return request(app.port, { method: "GET", path: "/api/hold" });
    });
    await Promise.all(started);

    const ninth = await request(app.port, { method: "GET", path: "/api/public" });
    expect(ninth.status).toBe(503);
    expect(heldHandlerCalls).toBe(8);

    // Release every held route response, then prove a later API operation can
    // acquire a slot. (The response finish and close events both fire.)
    releaseHeldRequests.forEach(release => release());
    await Promise.all(heldRequests);

    const retry = await request(app.port, { method: "GET", path: "/api/public" });
    expect(retry.status).toBe(200);
  });
});
