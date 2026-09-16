// Shared helpers for all Pages Functions. The underscore prefix keeps
// this file out of the routing table.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function randomHex(nBytes = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(nBytes)));
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

// Same parameters the seed admin uses: PBKDF2-SHA256, 100k iterations, 32 bytes.
export async function pbkdf2Hex(password, saltHex, iterations = 100000) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    key, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

export function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export const SESSION_COOKIE = "adl_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

// Resolves the signed-in user from the session cookie, or null.
export async function getUserFromRequest(context) {
  const db = context.env.DB;
  if (!db) return null;
  const token = getCookie(context.request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const session = await db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .bind(tokenHash).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  const user = await db
    .prepare("SELECT id, username, role FROM users WHERE id = ?")
    .bind(session.user_id).first();
  return user || null;
}

export async function requireUser(context) {
  const user = await getUserFromRequest(context);
  if (!user) return { user: null, error: json({ error: "Not signed in" }, 401) };
  return { user, error: null };
}

export async function requireAdmin(context) {
  const { user, error } = await requireUser(context);
  if (error) return { user: null, error };
  if (user.role !== "admin") return { user: null, error: json({ error: "Admin required" }, 403) };
  return { user, error: null };
}
