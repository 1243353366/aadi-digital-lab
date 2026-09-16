/* Aadi's Digital Lab — post.js
   Renders a single post (?slug=...) plus its comments, and posts new comments. */

(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var slug = (params.get("slug") || "").replace(/[^a-z0-9-]/gi, "");

  var titleEl = document.getElementById("post-title");
  var dateEl = document.getElementById("post-date");
  var bodyEl = document.getElementById("post-body");
  var commentsEl = document.getElementById("comments-list");
  var form = document.getElementById("comment-form");
  var msgEl = document.getElementById("comment-msg");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) :
      d.toLocaleString(undefined, {
        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
      });
  }

  function setMsg(text, ok) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = "form-msg " + (ok ? "ok" : "err");
  }

  function paragraphs(text) {
    return esc(text)
      .split(/\n{2,}/)
      .map(function (p) { return "<p>" + p.replace(/\n/g, "<br>") + "</p>"; })
      .join("");
  }

  function renderComments(comments) {
    if (!comments || comments.length === 0) {
      commentsEl.innerHTML = '<p class="post-excerpt">No comments yet — start the conversation.</p>';
      return;
    }
    commentsEl.innerHTML = comments.map(function (c) {
      return (
        '<div class="comment">' +
          '<p class="comment-author">' + esc(c.author) + "</p>" +
          '<p class="comment-meta">' + esc(fmtDate(c.created_at)) + "</p>" +
          '<p class="comment-body">' + esc(c.body) + "</p>" +
        "</div>"
      );
    }).join("");
  }

  function loadComments() {
    fetch("/api/post/" + encodeURIComponent(slug) + "/comments")
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(renderComments)
      .catch(function () {
        commentsEl.innerHTML = '<p class="post-excerpt">Comments are unavailable right now.</p>';
      });
  }

  function loadPost() {
    fetch("/api/post/" + encodeURIComponent(slug))
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (post) {
        document.title = post.title + " — Aadi's Digital Lab";
        titleEl.textContent = post.title;
        dateEl.textContent = fmtDate(post.created_at);
        bodyEl.innerHTML = paragraphs(post.content);
        loadComments();
      })
      .catch(function () {
        titleEl.textContent = "Post not found";
        dateEl.textContent = "";
        bodyEl.innerHTML =
          '<p class="status-note">This post doesn\'t exist — it may have been moved, or the ' +
          "blog database isn't connected yet (see README.md for the D1 setup).</p>";
        if (form) form.hidden = true;
      });
  }

  if (!slug) {
    titleEl.textContent = "No post selected";
    bodyEl.innerHTML = '<p class="status-note">Open a post from the <a href="blog.html">blog index</a>.</p>';
    if (form) form.hidden = true;
    return;
  }

  loadPost();

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var author = document.getElementById("comment-author").value.trim();
      var body = document.getElementById("comment-body").value.trim();

      if (!author || !body) {
        setMsg("Name and comment are both required.", false);
        return;
      }

      setMsg("Posting…", true);
      fetch("/api/post/" + encodeURIComponent(slug) + "/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: author, body: body })
      })
        .then(function (res) {
          if (res.status === 201) {
            form.reset();
            setMsg("Comment posted. Thanks!", true);
            loadComments();
          } else {
            return res.json().then(function (data) {
              setMsg((data && data.error) || "Could not post the comment.", false);
            });
          }
        })
        .catch(function () {
          setMsg("Could not reach the server. Try again in a moment.", false);
        });
    });
  }
})();
