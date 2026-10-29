import type { NextFunction, Request, RequestHandler, Response } from "express";

/** A minimum structural view of the authenticated user needed at this boundary. */
export type IngressPrincipal = { role?: unknown } | null;

export type ResolvePrincipal = (
  req: Request,
  res: Response
) => IngressPrincipal | Promise<IngressPrincipal>;

export type IngressOptions = {
  /**
   * Resolves the principal before a sensitive tRPC mutation reaches a body
   * parser. Callers should derive this from the application's normal context
   * factory rather than from request headers.
   */
  resolvePrincipal?: ResolvePrincipal;
  /** Injectable only to make window-boundary behavior deterministic in tests. */
  clock?: () => number;
  /** Host names (not origins) which may address this server. */
  allowedHosts?: readonly string[];
};

const DEFAULT_ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"] as const;
const API_PREFIX = "/api/";
const TRPC_PREFIX = "/api/trpc/";
const MAX_CONTENT_LENGTH = 64 * 1024;
const MAX_ACTIVE_API_REQUESTS = 8;
const MAX_TRACKED_IPS = 1024;
const PER_IP_REQUESTS_PER_WINDOW = 20;
const GLOBAL_REQUESTS_PER_WINDOW = 120;
const WINDOW_MS = 60_000;

const protectedProcedures = new Set([
  "compass.analyze",
  "compass.scannerReview",
  "compass.complementary",
  "compass.requestToken",
]);

type WindowCounter = {
  startedAt: number;
  count: number;
};

type HeaderCheck = { status: number } | { status: null };
type ProcedureCheck = "none" | "protected" | "malformed";

/**
 * Parse only an HTTP authority. This deliberately excludes paths, credentials,
 * comma-separated values, and non-numeric ports before URL normalisation.
 */
function parseAuthority(value: unknown, allowPort: boolean): string | null {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    return null;
  }

  // These characters cannot appear in a single Host authority and may cause
  // URL parsing to interpret a value as a different component.
  if (/[\s,/@?#\\]/.test(value)) return null;

  let hostnamePart: string;
  let port: string | undefined;

  if (value.startsWith("[")) {
    const match = /^(\[[0-9a-fA-F:.]+\])(?::([0-9]+))?$/.exec(value);
    if (!match) return null;
    hostnamePart = match[1];
    port = match[2];
  } else {
    const match = /^([^:]+?)(?::([0-9]+))?$/.exec(value);
    if (!match) return null;
    hostnamePart = match[1];
    port = match[2];
  }

  if (!allowPort && port !== undefined) return null;
  if (port !== undefined) {
    const numericPort = Number(port);
    if (!Number.isSafeInteger(numericPort) || numericPort > 65_535) return null;
  }

  try {
    const parsed = new URL(`http://${value}`);
    if (
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.hostname === ""
    ) {
      return null;
    }

    // Keep the syntactic check above rather than relying on URL.port: URL
    // normalises default ports (for example, :80) to an empty string.
    void hostnamePart;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function requestPath(req: Request): string {
  const url = req.originalUrl || req.url || "";
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function isApiRequest(req: Request): boolean {
  return requestPath(req).startsWith(API_PREFIX);
}

function headerCheck(req: Request): HeaderCheck {
  const contentLength = req.headers["content-length"];
  const transferEncoding = req.headers["transfer-encoding"];
  const contentEncoding = req.headers["content-encoding"];

  // API request bodies must use a single, explicit Content-Length. Refusing
  // Transfer-Encoding avoids request-framing ambiguity across proxy layers.
  if (transferEncoding !== undefined) return { status: 400 };

  if (contentLength !== undefined) {
    if (typeof contentLength !== "string" || !/^[0-9]+$/.test(contentLength)) {
      return { status: 400 };
    }

    const size = Number(contentLength);
    if (!Number.isSafeInteger(size)) return { status: 400 };
    if (size > MAX_CONTENT_LENGTH) return { status: 413 };
  }

  if (
    contentEncoding !== undefined &&
    (typeof contentEncoding !== "string" || contentEncoding.trim().toLowerCase() !== "identity")
  ) {
    return { status: 415 };
  }

  return { status: null };
}

function protectedProcedureCheck(req: Request): ProcedureCheck {
  if (req.method !== "POST") return "none";

  const rawPath = requestPath(req);
  if (!rawPath.startsWith(TRPC_PREFIX)) return "none";

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return "malformed";
  }

  if (!decodedPath.startsWith(TRPC_PREFIX)) return "none";
  const procedures = decodedPath.slice(TRPC_PREFIX.length).split(",");
  return procedures.some(procedure => protectedProcedures.has(procedure))
    ? "protected"
    : "none";
}

function sendRejected(res: Response, status: number): void {
  if (res.headersSent || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end('{"error":"Request rejected"}');
}

/**
 * Install before every body parser. It validates the Host header for all
 * requests, while API-only resource accounting keeps static assets unaffected.
 */
export function createIngress({
  resolvePrincipal = async () => null,
  clock = Date.now,
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
}: IngressOptions = {}): RequestHandler {
  const trustedHosts = new Set(
    allowedHosts
      .map(host => parseAuthority(host, false))
      .filter((host): host is string => host !== null)
  );
  const ipWindows = new Map<string, WindowCounter>();
  let globalWindow: WindowCounter = { startedAt: clock(), count: 0 };
  let activeRequests = 0;

  function pruneExpiredIpWindows(now: number): void {
    ipWindows.forEach((counter, ip) => {
      if (now >= counter.startedAt + WINDOW_MS) ipWindows.delete(ip);
    });
  }

  function resetGlobalWindowIfExpired(now: number): void {
    if (now >= globalWindow.startedAt + WINDOW_MS) {
      globalWindow = { startedAt: now, count: 0 };
    }
  }

  /** Returns false without mutating rate state when a request may not proceed. */
  function rateMayProceed(ip: string, now: number): boolean {
    pruneExpiredIpWindows(now);
    resetGlobalWindowIfExpired(now);

    const current = ipWindows.get(ip);
    if (!current && ipWindows.size >= MAX_TRACKED_IPS) return false;
    if (current && current.count >= PER_IP_REQUESTS_PER_WINDOW) return false;
    return globalWindow.count < GLOBAL_REQUESTS_PER_WINDOW;
  }

  function consumeRate(ip: string, now: number): void {
    // No await occurs between rateMayProceed and this function. Retain the
    // defensive expiry handling so each state transition remains self-contained.
    pruneExpiredIpWindows(now);
    resetGlobalWindowIfExpired(now);

    let current = ipWindows.get(ip);
    if (!current) {
      current = { startedAt: now, count: 0 };
      ipWindows.set(ip, current);
    }
    current.count += 1;
    globalWindow.count += 1;
  }

  function acquireActive(res: Response): boolean {
    if (activeRequests >= MAX_ACTIVE_API_REQUESTS) return false;

    activeRequests += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
    };

    // Both events can fire for a completed connection, so release is explicitly
    // idempotent. It also covers clients that disconnect during authentication.
    res.once("finish", release);
    res.once("close", release);
    return true;
  }

  async function handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    const host = parseAuthority(req.headers.host, true);
    if (!host || !trustedHosts.has(host)) {
      sendRejected(res, 403);
      return;
    }

    if (!isApiRequest(req)) {
      try {
        next();
      } catch {
        sendRejected(res, 500);
      }
      return;
    }

    const headers = headerCheck(req);
    if (headers.status !== null) {
      sendRejected(res, headers.status);
      return;
    }

    // Never use req.ip or forwarding headers here: unless a caller has a
    // separately trusted proxy boundary, the connected peer is the only input
    // that cannot be supplied by an API client.
    const peerIp = req.socket?.remoteAddress;
    if (typeof peerIp !== "string" || peerIp.length === 0) {
      sendRejected(res, 429);
      return;
    }

    const now = clock();
    if (!rateMayProceed(peerIp, now)) {
      sendRejected(res, 429);
      return;
    }

    if (!acquireActive(res)) {
      sendRejected(res, 503);
      return;
    }
    consumeRate(peerIp, now);

    const procedure = protectedProcedureCheck(req);
    if (procedure === "malformed") {
      sendRejected(res, 400);
      return;
    }

    if (procedure === "protected") {
      let principal: IngressPrincipal;
      try {
        principal = await resolvePrincipal(req, res);
      } catch {
        sendRejected(res, 401);
        return;
      }

      if (!principal || typeof principal !== "object") {
        sendRejected(res, 401);
        return;
      }
      if (principal.role !== "admin") {
        sendRejected(res, 403);
        return;
      }
    }

    try {
      next();
    } catch {
      sendRejected(res, 500);
    }
  }

  return (req, res, next) => {
    void handle(req, res, next).catch(() => sendRejected(res, 500));
  };
}
