/* Lab Console — GitHub telemetry with hand-rolled SVG charts.
   Public GitHub API only, no dependencies, everything escaped on render. */
import { esc } from "./api.js";

const GH_USER = "1243353366";
const GH_REPO = "aadi-digital-lab";

const $ = (id) => document.getElementById(id);

async function gh(url) {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

function fail(el, what) {
  el.innerHTML = `<p class="status-note">GitHub is rate-limiting or unreachable — ${esc(what)} paused. Try again in a minute.</p>`;
}

/* ---------- helpers ---------- */
function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ---------- repo stats ---------- */
async function loadRepoStats() {
  const el = $("repo-stats");
  try {
    const r = await gh(`/repos/${GH_USER}/${GH_REPO}`);
    el.innerHTML = `
      <div class="stat-card"><p class="stat-num">${r.stargazers_count ?? 0}</p><p class="stat-label">Stars</p></div>
      <div class="stat-card"><p class="stat-num">${r.forks_count ?? 0}</p><p class="stat-label">Forks</p></div>
      <div class="stat-card"><p class="stat-num">${r.open_issues_count ?? 0}</p><p class="stat-label">Open issues</p></div>
      <div class="stat-card"><p class="stat-num">${r.watchers_count ?? r.subscribers_count ?? 0}</p><p class="stat-label">Watchers</p></div>
      <div class="stat-card stat-wide"><p class="stat-num">${esc((r.description || "—").slice(0, 90))}</p><p class="stat-label">${esc(r.full_name)} · updated ${esc(relTime(r.pushed_at))} · ${esc((r.license && r.license.spdx_id) || "no license")}</p></div>`;
  } catch { fail(el, "repository stats"); }
}

/* ---------- commit activity chart ---------- */
function barChart(weeks) {
  const W = 720, H = 200, PAD = 24;
  const totals = weeks.map((w) => w.total || 0);
  const max = Math.max(1, ...totals);
  const bw = (W - PAD * 2) / weeks.length;
  let bars = "";
  let labels = "";
  weeks.forEach((w, i) => {
    const h = Math.max(1, (H - PAD * 2) * ((w.total || 0) / max));
    const x = PAD + i * bw;
    bars += `<rect x="${(x + 1).toFixed(1)}" y="${(H - PAD - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--accent)"><title>${w.total || 0} commits · week of ${new Date(w.week * 1000).toLocaleDateString()}</title></rect>`;
    if (i % 8 === 0) {
      labels += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart-label">${new Date(w.week * 1000).toLocaleDateString(undefined, { month: "short" })}</text>`;
    }
  });
  const grid = [0, 0.5, 1].map((f) =>
    `<line x1="${PAD}" x2="${W - PAD}" y1="${(H - PAD - (H - 2 * PAD) * f).toFixed(1)}" y2="${(H - PAD - (H - 2 * PAD) * f).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3 4"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Commits per week, last ${weeks.length} weeks">${grid}${bars}${labels}</svg>`;
}

async function loadCommitChart() {
  const el = $("commit-chart");
  try {
    const weeks = await gh(`/repos/${GH_USER}/${GH_REPO}/stats/commit-activity`);
    if (!Array.isArray(weeks) || !weeks.length) {
      el.innerHTML = `<p class="status-note">GitHub is still computing statistics for this repository — check back in a minute.</p>`;
      return;
    }
    const total = weeks.reduce((n, w) => n + (w.total || 0), 0);
    el.innerHTML = `<p class="post-meta">${total} commits in the last ${weeks.length} weeks · peak ${Math.max(...weeks.map((w) => w.total || 0))}/week</p>` + barChart(weeks);
  } catch { fail(el, "commit chart"); }
}

/* ---------- language mix ---------- */
async function loadRepos() {
  const gridEl = $("repo-grid");
  const langEl = $("lang-bars");
  let repos;
  try {
    repos = await gh(`/users/${GH_USER}/repos?per_page=100&sort=pushed`);
  } catch {
    fail(gridEl, "repository list");
    fail(langEl, "language mix");
    return;
  }

  /* language bars */
  const counts = {};
  for (const r of repos) if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
  const langs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...langs.map((l) => l[1]));
  if (langs.length) {
    langEl.innerHTML = langs.map(([name, count]) => `
      <div class="lang-row">
        <span class="lang-name">${esc(name)}</span>
        <span class="lang-bar"><span class="lang-fill" style="width:${(count / maxCount) * 100}%"></span></span>
        <span class="lang-count">${count}</span>
      </div>`).join("");
  } else {
    langEl.innerHTML = `<p class="status-note">No public language data yet.</p>`;
  }

  /* repo cards */
  const sorted = [...repos].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
  gridEl.innerHTML = sorted.slice(0, 6).map((r) => `
    <a class="repo-card" href="${esc(r.html_url)}" target="_blank" rel="noopener">
      <p class="repo-name">${esc(r.name)}</p>
      <p class="repo-desc">${esc(r.description ? r.description.slice(0, 140) : "No description — read the code.")}</p>
      <p class="repo-meta"><span>${esc(r.language || "—")}</span> &middot; <span>&#9733; ${r.stargazers_count ?? 0}</span> &middot; <span>pushed ${esc(relTime(r.pushed_at))}</span></p>
    </a>`).join("") + (sorted.length > 6
      ? `<a class="repo-card repo-more" href="https://github.com/${GH_USER}?tab=repositories" target="_blank" rel="noopener">All ${sorted.length} repositories &rarr;</a>`
      : "");
}

/* ---------- recent activity ---------- */
function eventLine(e) {
  const repo = `<a href="https://github.com/${esc(e.repo.name)}" target="_blank" rel="noopener">${esc(e.repo.name)}</a>`;
  switch (e.type) {
    case "PushEvent": {
      const n = (e.payload.size || (e.payload.commits || []).length) ?? 1;
      return `Pushed ${n} commit${n === 1 ? "" : "s"} to ${repo}`;
    }
    case "CreateEvent": return `Created ${esc(e.payload.ref_type || "repository")}${e.payload.ref ? ` <span class="post-meta">${esc(e.payload.ref)}</span>` : ""} in ${repo}`;
    case "WatchEvent": return `Starred ${repo}`;
    case "ForkEvent": return `Forked ${repo}`;
    case "ReleaseEvent": return `Published a release in ${repo}`;
    case "IssuesEvent": return `${esc((e.payload.action || "touched") + " an issue in")} ${repo}`;
    case "PullRequestEvent": return `${esc((e.payload.action || "touched") + " a pull request in")} ${repo}`;
    case "PublicEvent": return `Open-sourced ${repo}`;
    default: return `${esc(e.type.replace(/Event$/, ""))} in ${repo}`;
  }
}

async function loadEvents() {
  const el = $("events");
  try {
    const events = await gh(`/users/${GH_USER}/events/public?per_page=8`);
    if (!Array.isArray(events) || !events.length) {
      el.innerHTML = `<p class="status-note">No public activity recorded yet.</p>`;
      return;
    }
    el.innerHTML = `<ul class="event-list">` + events.map((e) => `
      <li class="event-item"><span>${eventLine(e)}</span><span class="post-meta">${esc(relTime(e.created_at))}</span></li>`).join("") + `</ul>`;
  } catch { fail(el, "activity feed"); }
}

loadRepoStats();
loadCommitChart();
loadRepos();
loadEvents();
