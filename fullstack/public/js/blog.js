/* Blog list with search + tag filtering. */
import { esc, excerpt, fmtDate, usePosts, useTags } from "./api.js";

const listEl = document.getElementById("post-list");
const statusEl = document.getElementById("blog-status");
const searchEl = document.getElementById("search");
const tagCloudEl = document.getElementById("tag-cloud");

const params = new URLSearchParams(location.search);
let activeTag = params.get("tag") || "";
let query = "";
let debounceTimer = null;

function renderTagCloud(tags) {
  tagCloudEl.innerHTML = tags
    .map((t) => `<button class="tag-pill${t.name === activeTag ? " active" : ""}" data-tag="${esc(t.name)}" type="button">${esc(t.name)} <span class="tag-count">${t.count}</span></button>`)
    .join("");
}

function renderPosts(posts) {
  if (!posts.length) {
    listEl.innerHTML = `<p class="status-note">No posts${query ? ` matching “${esc(query)}”` : ""}${activeTag ? ` tagged “${esc(activeTag)}”` : ""} yet.</p>`;
    return;
  }
  listEl.innerHTML = posts.map((p) => `
    <article class="post-item">
      <a class="post-title" href="post.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a>
      <p class="post-meta">${esc(fmtDate(p.created_at))}</p>
      <p class="post-excerpt">${esc(excerpt(p.content))}</p>
    </article>`).join("");
}

async function load() {
  statusEl.hidden = false;
  statusEl.textContent = "Loading posts\u2026";
  listEl.innerHTML = "";
  try {
    const posts = await usePosts({ q: query, tag: activeTag });
    statusEl.hidden = true;
    renderPosts(posts);
  } catch (err) {
    statusEl.textContent = "The blog API isn't connected yet. Create a D1 database named blog_db, import schema.sql, and bind it as DB in your Cloudflare Pages project.";
  }
}

/* Tag pills */
useTags()
  .then((tags) => {
    if (Array.isArray(tags) && tags.length) renderTagCloud(tags);
  })
  .catch(() => { /* tag bar is optional if D1 isn't wired yet */ });

tagCloudEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tag-pill");
  if (!btn) return;
  activeTag = btn.dataset.tag === activeTag ? "" : btn.dataset.tag;
  const url = new URL(location.href);
  if (activeTag) url.searchParams.set("tag", activeTag); else url.searchParams.delete("tag");
  history.replaceState(null, "", url);
  tagCloudEl.querySelectorAll(".tag-pill").forEach((p) => p.classList.toggle("active", p.dataset.tag === activeTag));
  load();
});

/* Search (debounced) */
searchEl.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    query = searchEl.value.trim();
    load();
  }, 250);
});

load();
