/* Single post view: content, tags, likes, comments. */
import { esc, fmtDate, usePost, useLikes, useLike, useComments, useCreateComment } from "./api.js";

const slug = new URLSearchParams(location.search).get("slug") || "";
const statusEl = document.getElementById("post-status");
const bodyEl = document.getElementById("post-body");
const titleEl = document.getElementById("post-title");
const dateEl = document.getElementById("post-date");
const tagsEl = document.getElementById("post-tags");
const contentEl = document.getElementById("post-content");
const likeBtn = document.getElementById("like-btn");
const likeCount = document.getElementById("like-count");
const commentsEl = document.getElementById("comments");
const commentForm = document.getElementById("comment-form");
const commentMsg = document.getElementById("comment-msg");

function renderContent(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderComments(list) {
  if (!list.length) {
    commentsEl.innerHTML = `<p class="status-note">No comments yet — say something.</p>`;
    return;
  }
  commentsEl.innerHTML = list.map((c) => `
    <div class="comment">
      <p class="comment-head"><strong>${esc(c.author)}</strong> <span class="post-meta">&middot; ${esc(fmtDate(c.created_at))}</span></p>
      <p class="comment-body">${esc(c.body)}</p>
    </div>`).join("");
}

function setLikeUI(count, liked) {
  likeCount.textContent = String(count);
  likeBtn.classList.toggle("liked", liked);
  likeBtn.setAttribute("aria-pressed", liked ? "true" : "false");
}

async function loadComments() {
  try {
    renderComments(await useComments(slug));
  } catch {
    commentsEl.innerHTML = `<p class="status-note">Comments unavailable right now.</p>`;
  }
}

async function loadLikes() {
  try {
    const { count } = await useLikes(slug);
    setLikeUI(count, false);
  } catch { /* keep 0 */ }
}

async function init() {
  if (!slug) {
    statusEl.textContent = "No post selected.";
    return;
  }
  try {
    const post = await usePost(slug);
    document.title = `${post.title} — Aadi's Digital Lab`;
    titleEl.textContent = post.title;
    dateEl.textContent = fmtDate(post.created_at);
    tagsEl.innerHTML = (post.tags || []).map((t) =>
      `<a class="tag-pill" href="blog.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("");
    contentEl.innerHTML = renderContent(post.content);
    statusEl.hidden = true;
    bodyEl.hidden = false;
    loadComments();
    loadLikes();
  } catch (err) {
    statusEl.textContent = err.message === "Not found" ? "Post not found." : "Couldn't load this post — is the D1 database bound?";
  }
}

likeBtn.addEventListener("click", async () => {
  likeBtn.disabled = true;
  try {
    const { count, liked } = await useLike(slug);
    setLikeUI(count, liked);
  } catch { /* silent */ }
  likeBtn.disabled = false;
});

commentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const author = commentForm.author.value.trim();
  const body = commentForm.body.value.trim();
  commentMsg.hidden = true;
  try {
    await useCreateComment(slug, author, body);
    commentForm.reset();
    commentMsg.textContent = "Comment posted.";
    commentMsg.className = "status-note ok";
    commentMsg.hidden = false;
    loadComments();
  } catch (err) {
    commentMsg.textContent = err.message || "Couldn't post the comment.";
    commentMsg.className = "status-note err";
    commentMsg.hidden = false;
  }
});

init();
