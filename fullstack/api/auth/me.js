import { json, getUserFromRequest } from "../_shared.js";

export async function onRequestGet(context) {
  const user = await getUserFromRequest(context);
  if (!user) return json({ error: "Not signed in" }, 401);
  return json({ user });
}
