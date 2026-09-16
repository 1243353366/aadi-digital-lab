import { json, getCookie, sha256Hex, SESSION_COOKIE } from "../_shared.js";

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (db) {
    try {
      const token = getCookie(context.request, SESSION_COOKIE);
      if (token) {
        const tokenHash = await sha256Hex(token);
        await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
      }
    } catch (err) { /* clear the cookie regardless */ }
  }
  return json({ ok: true }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,
  });
}
