/* Admin dashboard: hash-router SPA over the JSON API.
   Routes: #/posts (default) · #/new · #/edit/:slug · #/settings */
import { esc, fmtDate, useAuth, useLogout, usePosts, usePost, useCreatePost, useUpdatePost, useDeletePost, changePassword } from "../api.js";

const view = document.getElementById("view");
const navLinks = document.querySelectorAll(".admin-links a[data-route]");

let user = null;

/* ---------- toasts ---------- */
function toast(message, kind = "ok") {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.classList.add("out"); }, 3200);
  setTimeout(() => { el.remove(); }, 3600);
}

/* ---------- router ---------- */
function setActiveLink(route) {
  navLinks.forEach((a) => a.classList.toggle("active", a.dataset.route === route));
}

async function route() {
  const hash = location.hash || "#/posts";
  const parts = hash.replace(/^#\//, "").split("/");

  if (parts[0] === "new") { setActiveLink("new"); renderEditor(null); return; }
  if (parts[0] === "settings") { setActiveLink("settings"); renderSettings(); return; }
  if (parts[0] === "edit" && parts[1]) { setActiveLink(null); renderEditor(decodeURIComponent(parts[1])); return; }
  setActiveLink("posts");
  renderPostList();
}

/* ---------- posts list ---------- */
async function renderPostList() {
  view.innerHTML = `<p class="status-note">Loading posts&hellip;</p>`;
  let posts;
  try {
    posts = await usePosts();
  } catch {
    view.innerHTML = `<div class="admin-card"><h1>Posts</h1><p class="status-note err">The API isn't reachable. Is the D1 database bound?</p></div>`;
    return;
  }

  const rows = posts.map((p) => `
    <tr>
      <td><a class="row-title" href="#/edit/${encodeURIComponent(p.slug)}">${esc(p.title)}</a></td>
      <td class="row-date">${esc(fmtDate(p.created_at))}</td>
      <td class="row-actions">
        <a class="btn btn-ghost btn-sm" href="../post.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">View</a>
        <button class="btn btn-ghost btn-sm" data-edit="${esc(p.slug)}" type="button">Edit</button>
        <button class="btn btn-danger btn-sm" data-del="${p.id}" type="button">Delete</button>
      </td>
    </tr>`).join("");

  view.innerHTML = `
    <div class="admin-card">
      <div class="admin-head">
        <h1>Posts</h1>
        <a class="btn btn-primary" href="#/new">New post</a>
      </div>
      ${posts.length ? `
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Title</th><th>Published</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>` : `
        <p class="status-note">No posts yet. Write the first one.</p>`}
    </div>`;

  view.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = `#/edit/${encodeURIComponent(b.dataset.edit)}`; }));

  view.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this post? Comments and likes go with it.")) return;
      try {
        await useDeletePost(Number(b.dataset.del));
        toast("Post deleted");
        renderPostList();
      } catch (err) {
        toast(err.message || "Delete failed", "err");
      }
    }));
}

/* ---------- editor ---------- */
function slugify(text) {
  return String(text).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function renderEditor(slug) {
  let post = null;
  if (slug) {
    view.innerHTML = `<p class="status-note">Loading post&hellip;</p>`;
    try {
      post = await usePost(slug);
    } catch {
      view.innerHTML = `<div class="admin-card"><p class="status-note err">Couldn't load that post.</p><p><a class="btn btn-ghost" href="#/posts">&larr; Back to posts</a></p></div>`;
      return;
    }
  }

  view.innerHTML = `
    <div class="admin-card">
      <div class="admin-head">
        <h1>${post ? "Edit post" : "New post"}</h1>
        <a class="btn btn-ghost" href="#/posts">&larr; Back</a>
      </div>
      <form id="editor-form">
        <div class="field">
          <label for="f-title">Title</label>
          <input id="f-title" type="text" maxlength="200" required value="${post ? esc(post.title) : ""}">
        </div>
        <div class="field">
          <label for="f-slug">Slug <span class="post-meta">(URL — auto-generated from the title if left alone)</span></label>
          <input id="f-slug" type="text" value="${post ? esc(post.slug) : ""}" pattern="[a-z0-9-]*">
        </div>
        <div class="field">
          <label for="f-tags">Tags <span class="post-meta">(comma separated, up to 10)</span></label>
          <input id="f-tags" type="text" value="${post ? esc((post.tags || []).join(", ")) : ""}" placeholder="osint, research">
        </div>
        <div class="field">
          <label for="f-content">Content <span class="post-meta">(plain text — blank line starts a new paragraph)</span></label>
          <textarea id="f-content" rows="14" required>${post ? esc(post.content) : ""}</textarea>
        </div>
        <button class="btn btn-primary" type="submit">${post ? "Save changes" : "Publish"}</button>
        <p id="editor-msg" class="status-note" hidden></p>
      </form>
    </div>`;

  const titleEl = document.getElementById("f-title");
  const slugEl = document.getElementById("f-slug");
  let slugTouched = Boolean(post);
  slugEl.addEventListener("input", () => { slugTouched = slugEl.value.trim() !== ""; });

  titleEl.addEventListener("input", () => {
    if (!slugTouched) slugEl.value = slugify(titleEl.value);
  });

  document.getElementById("editor-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("editor-msg");
    const payload = {
      title: titleEl.value.trim(),
      slug: slugEl.value.trim() || slugify(titleEl.value),
      content: document.getElementById("f-content").value,
      tags: document.getElementById("f-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (post) payload.id = post.id;
    msg.hidden = true;
    try {
      if (post) {
        await useUpdatePost(payload);
        toast("Post updated");
      } else {
        const created = await useCreatePost(payload);
        toast("Post published");
        location.hash = `#/edit/${encodeURIComponent(created.slug)}`;
        return;
      }
    } catch (err) {
      msg.textContent = err.message || "Save failed";
      msg.className = "status-note err";
      msg.hidden = false;
      return;
    }
    msg.className = "status-note ok";
    msg.textContent = "Saved.";
    msg.hidden = false;
  });
}

/* ---------- settings ---------- */
function renderSettings() {
  view.innerHTML = `
    <div class="admin-card">
      <h1>Settings</h1>
      <p class="post-meta">Signed in as <strong>${esc(user.username)}</strong> (${esc(user.role)}).</p>

      <h2>Change password</h2>
      <form id="pw-form" class="admin-pw">
        <div class="field">
          <label for="p-current">Current password</label>
          <input id="p-current" type="password" autocomplete="current-password" required>
        </div>
        <div class="field">
          <label for="p-next">New password <span class="post-meta">(at least 8 characters)</span></label>
          <input id="p-next" type="password" autocomplete="new-password" minlength="8" required>
        </div>
        <div class="field">
          <label for="p-confirm">Confirm new password</label>
          <input id="p-confirm" type="password" autocomplete="new-password" minlength="8" required>
        </div>
        <button class="btn btn-primary" type="submit">Change password</button>
        <p id="pw-msg" class="status-note" hidden></p>
      </form>
    </div>`;

  document.getElementById("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("pw-msg");
    const current = document.getElementById("p-current").value;
    const next = document.getElementById("p-next").value;
    const confirmPass = document.getElementById("p-confirm").value;
    msg.hidden = true;

    if (next !== confirmPass) {
      msg.textContent = "New passwords don't match.";
      msg.className = "status-note err";
      msg.hidden = false;
      return;
    }
    try {
      await changePassword(current, next);
      toast("Password changed — signing you back in");
      setTimeout(async () => {
        await useLogout();
        location.assign("../login.html");
      }, 1200);
    } catch (err) {
      msg.textContent = err.message || "Password change failed";
      msg.className = "status-note err";
      msg.hidden = false;
    }
  });
}

/* ---------- boot ---------- */
document.getElementById("logout-btn").addEventListener("click", async () => {
  await useLogout().catch(() => {});
  location.assign("../login.html");
});

window.addEventListener("hashchange", route);

(async () => {
  try {
    const res = await useAuth();
    user = res.user;
  } catch {
    location.replace("../login.html");
    return;
  }
  route();
})();
