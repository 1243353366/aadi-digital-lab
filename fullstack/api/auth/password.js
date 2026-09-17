import { json, pbkdf2Hex, randomHex, requireUser , audit } from "../_shared.js";

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database not bound." }, 503);

  const { user, error: authError } = await requireUser(context);
  if (authError) return authError;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const current = String(body.current_password || "");
  const next = String(body.new_password || "");
  if (next.length < 8) return json({ error: "New password must be at least 8 characters" }, 400);

  const row = await db
    .prepare("SELECT password_hash, salt FROM users WHERE id = ?").bind(user.id).first();
  const currentHash = await pbkdf2Hex(current, row.salt);
  if (currentHash !== row.password_hash) return json({ error: "Current password is incorrect" }, 401);

  const salt = randomHex(16);
  const newHash = await pbkdf2Hex(next, salt);
  try {
    await db
      .prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
      .bind(newHash, salt, user.id).run();
    // Kill all other sessions for this user — they sign in again with the new password.
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
    await audit(db, user.username, "password_change");
  } catch (err) {
    return json({ error: "Failed to update password" }, 500);
  }
  return json({ ok: true }, 200, {
    "Set-Cookie": "adl_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  });
}
