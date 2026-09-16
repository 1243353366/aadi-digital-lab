/* Aadi's Digital Lab — blog.js
   Fetches posts from the Cloudflare Pages Function at /api/posts (D1-backed). */

(function () {
  "use strict";

  var listEl = document.getElementById("post-list");
  var statusEl = document.getElementById("blog-status");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function excerpt(text, len) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > len ? t.slice(0, len).trimEnd() + "…" : t;
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) :
      d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function showStatus(msg) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  fetch("/api/posts")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (posts) {
      if (!Array.isArray(posts) || posts.length === 0) {
        showStatus("No posts yet — the first one is being written.");
        return;
      }
      if (statusEl) statusEl.hidden = true;
      listEl.innerHTML = posts.map(function (p) {
        return (
          '<article class="post-item">' +
            '<a class="post-title" href="post.html?slug=' + encodeURIComponent(p.slug) + '">' + esc(p.title) + "</a>" +
            '<p class="post-meta">' + esc(fmtDate(p.created_at)) + "</p>" +
            '<p class="post-excerpt">' + esc(excerpt(p.content, 180)) + "</p>" +
          "</article>"
        );
      }).join("");
    })
    .catch(function () {
      showStatus(
        "The blog API isn't connected yet. Create a D1 database named blog_db, import schema.sql, " +
        "and bind it as DB in your Cloudflare Pages project — see README.md for the 2-minute setup."
      );
    });
})();
