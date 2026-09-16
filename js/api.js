/* Aadi's Digital Lab — frontend data layer.
   Thin async "hooks" over the JSON API. No dependencies, ES modules. */

const JSON_HEADERS = { "Content-Type": "application/json" };

async function handle(res) {
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON error body */ }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

/* ---------- helpers ---------- */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function excerpt(text, len = 180) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len).trimEnd() + "\u2026" : t;
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch (e) { return iso; }
}

export function visitorId() {
  let id = null;
  try { id = localStorage.getItem("adl-visitor"); } catch (e) {}
  if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    id = (crypto.randomUUID ? crypto.randomUUID() : "v-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    try { localStorage.setItem("adl-visitor", id); } catch (e) {}
  }
  return id;
}

/* ---------- public reads ---------- */
export function usePosts(params = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.tag) qs.set("tag", params.tag);
  const suffix = qs.toString() ? "?" + qs.toString() : "";
  return fetch("/api/posts" + suffix).then(handle);
}

export function usePost(slug) {
  return fetch(`/api/post/${encodeURIComponent(slug)}`).then(handle);
}

export function useTags() {
  return fetch("/api/tags").then(handle);
}

export function useComments(slug) {
  return fetch(`/api/post/${encodeURIComponent(slug)}/comments`).then(handle);
}

export function useLikes(slug) {
  return fetch(`/api/post/${encodeURIComponent(slug)}/like`).then(handle);
}

/* ---------- public writes ---------- */
export function useCreateComment(slug, author, body) {
  return fetch(`/api/post/${encodeURIComponent(slug)}/comments`, {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ author, body }),
  }).then(handle);
}

export function useLike(slug) {
  return fetch(`/api/post/${encodeURIComponent(slug)}/like`, {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ visitor: visitorId() }),
  }).then(handle);
}

/* ---------- auth ---------- */
export function useLogin(username, password) {
  return fetch("/api/auth/login", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ username, password }),
  }).then(handle);
}

export function useLogout() {
  return fetch("/api/auth/logout", { method: "POST" }).then(handle);
}

export function useAuth() {
  return fetch("/api/auth/me").then(handle);
}

export function changePassword(current, next) {
  return fetch("/api/auth/password", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ current_password: current, new_password: next }),
  }).then(handle);
}

/* ---------- admin writes ---------- */
export function useCreatePost(post) {
  return fetch("/api/posts/create", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify(post),
  }).then(handle);
}

export function useUpdatePost(post) {
  return fetch("/api/posts/update", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify(post),
  }).then(handle);
}

export function useDeletePost(id) {
  return fetch("/api/posts/delete", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ id }),
  }).then(handle);
}
