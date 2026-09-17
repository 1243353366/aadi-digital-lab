import { json, pbkdf2Hex, randomHex, sha256Hex, SESSION_COOKIE, SESSION_TTL_SECONDS, rateLimit } from "../_shared.js";

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound. Bind a D1 database as DB in your Pages project." }, 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!username || !password) return json({ error: "Username and password are required" }, 400);

  // Brute-force protection: max 8 login attempts per IP per 15 minutes.
  if (!(await rateLimit(db, context.request, "login", 8))) {
    return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  }

  const user = await db
    .prepare("SELECT id, username, role, password_hash, salt FROM users WHERE username = ?")
    .bind(username).first();

  // Always run the KDF so timing does not reveal whether the user exists.
  const hash = await pbkdf2Hex(password, user ? user.salt : "0000000000000000");
  if (!user || hash !== user.password_hash) {
    return json({ error: "Invalid username or password" }, 401);
  }

  // Fresh session token; only its SHA-256 hash is stored.
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()),
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(tokenHash, user.id, expiresAt),
  ]);

  return json({ user: { id: user.id, username: user.username, role: user.role } }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
  });
}
