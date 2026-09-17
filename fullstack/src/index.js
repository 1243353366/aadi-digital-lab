// Aadi's Digital Lab — unified full-stack Worker.
// Static frontend is served by Workers Assets; every /api/* request is
// dispatched to the backend modules ported from the Pages Functions.
// One D1 (blog_db), one schema, one admin credential.

import * as postsList from "../api/posts.js";
import * as tagsApi from "../api/tags.js";
import * as authLogin from "../api/auth/login.js";
import * as authLogout from "../api/auth/logout.js";
import * as authMe from "../api/auth/me.js";
import * as authPassword from "../api/auth/password.js";
import * as postDetail from "../api/post/[slug]/index.js";
import * as postComments from "../api/post/[slug]/comments.js";
import * as postLike from "../api/post/[slug]/like.js";
import * as postCreate from "../api/posts/create.js";
import * as postUpdate from "../api/posts/update.js";
import * as postDelete from "../api/posts/delete.js";
import * as corporaSearch from "../api/corpora.js";
import { SEC_HEADERS } from "../api/_shared.js";

const ctx = (request, env, params) => ({ request, env, params: params || {} });
const JSON_TYPE = { "Content-Type": "application/json; charset=utf-8", ...SEC_HEADERS };
const notAllowed = () => new Response(JSON.stringify({ error: "Method not allowed" }),
  { status: 405, headers: JSON_TYPE });
const MAX_BODY_BYTES = 32 * 1024; // generous: comments cap at 2000 chars

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith("/api/") || path === "/api/") {
      // Asset-matching requests never reach the Worker; a non-API request here
      // is an unmatched route — serve the site's 404 page with a 404 status.
      if (env.ASSETS) {
        const nf = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request));
        if (nf.status === 200) return new Response(nf.body, { status: 404, headers: { ...Object.fromEntries(nf.headers), ...SEC_HEADERS } });
      }
      return new Response("Not found", { status: 404 });
    }

    try {
      if (request.method === "POST" && Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: JSON_TYPE });
    }
    if (path === "/api/posts") {
        if (method !== "GET") return notAllowed();
        return postsList.onRequestGet(ctx(request, env));
      }
      if (path === "/api/corpora") {
        if (method !== "GET") return notAllowed();
        return corporaSearch.onRequestGet(ctx(request, env));
      }
      if (path === "/api/tags") {
        if (method !== "GET") return notAllowed();
        return tagsApi.onRequestGet(ctx(request, env));
      }
      if (path === "/api/auth/login" && method === "POST") return authLogin.onRequestPost(ctx(request, env));
      if (path === "/api/auth/logout" && method === "POST") return authLogout.onRequestPost(ctx(request, env));
      if (path === "/api/auth/me" && method === "GET") return authMe.onRequestGet(ctx(request, env));
      if (path === "/api/auth/password" && method === "POST") return authPassword.onRequestPost(ctx(request, env));
      if (path === "/api/posts/create" && method === "POST") return postCreate.onRequestPost(ctx(request, env));
      if (path === "/api/posts/update" && method === "POST") return postUpdate.onRequestPost(ctx(request, env));
      if (path === "/api/posts/delete" && method === "POST") return postDelete.onRequestPost(ctx(request, env));

      let m = path.match(/^\/api\/post\/([^\/]+)\/comments$/);
      if (m) {
        const c = ctx(request, env, { slug: decodeURIComponent(m[1]) });
        if (method === "GET") return postComments.onRequestGet(c);
        if (method === "POST") return postComments.onRequestPost(c);
        return notAllowed();
      }
      m = path.match(/^\/api\/post\/([^\/]+)\/like$/);
      if (m) {
        const c = ctx(request, env, { slug: decodeURIComponent(m[1]) });
        if (method === "GET") return postLike.onRequestGet(c);
        if (method === "POST") return postLike.onRequestPost(c);
        return notAllowed();
      }
      m = path.match(/^\/api\/post\/([^\/]+)$/);
      if (m) {
        if (method !== "GET") return notAllowed();
        return postDetail.onRequestGet(ctx(request, env, { slug: decodeURIComponent(m[1]) }));
      }

      return new Response(JSON.stringify({ error: "Not found" }),
        { status: 404, headers: JSON_TYPE });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: JSON_TYPE });
    }
  },
};
