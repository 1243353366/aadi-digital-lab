/* Login page logic. */
import { useLogin, useAuth } from "./api.js";

const form = document.getElementById("login-form");
const msg = document.getElementById("login-msg");
const btn = document.getElementById("login-btn");

// Already signed in? Go straight to the dashboard.
useAuth()
  .then(() => { location.replace("admin/"); })
  .catch(() => { /* not signed in — stay */ });

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.hidden = true;
  btn.disabled = true;
  btn.textContent = "Signing in\u2026";
  try {
    await useLogin(form.username.value.trim(), form.password.value);
    location.assign("admin/");
  } catch (err) {
    msg.textContent = err.message || "Sign-in failed.";
    msg.className = "status-note err";
    msg.hidden = false;
    btn.disabled = false;
    btn.textContent = "Sign in";
  }
});
