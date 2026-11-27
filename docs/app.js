// Clubhub - GitHub Pages demo version.
// Same features as the Flask app, but everything runs in the browser and the whole
// database is one JSON file in the GitHub repo (see config.js). Saving a change commits
// that file through the GitHub API using a personal access token entered in Settings.
// NOT SECURE: the file is public and logins are checked in the browser. Testing only.
"use strict";

const CFG = window.CLUBHUB_CONFIG;
const API = `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.path}`;
const RAW = `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${CFG.branch}/${CFG.path}`;

const ROLES = ["player", "coach", "staff"];
const KINDS = {
  sport: ["match", "training", "tournament", "other"],
  social: ["party", "meal", "meeting", "trip", "other"],
};
const CLUB_COLOR = "#8e24aa";

let DB = null; // the loaded data
let ME = null; // the logged-in user

// ---------------------------------------------------------------- small helpers
const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDT = (d) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDT = (v) => v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11, 16)}` : "";
const today = () => isoDate(new Date());
const nextId = (list) => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;

function flash(msg, cat = "ok") {
  $("#flash").innerHTML = `<div class="flash ${cat}">${esc(msg)}</div>`;
  window.scrollTo(0, 0);
}
function clearFlash() { $("#flash").innerHTML = ""; }

// Navigate, then show a message on the new page.
let pendingFlash = null;
function go(hash, msg) {
  pendingFlash = msg || null;
  if (location.hash === hash) { route(); showPending(); } else location.hash = hash;
}
function showPending() { if (pendingFlash) { flash(pendingFlash); pendingFlash = null; } }

async function hashPassword(salt, password) {
  const bytes = new TextEncoder().encode(salt + ":" + password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------- GitHub storage
const token = () => store.get("clubhub_token");

function b64ToText(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function textToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function fetchRemote() {
  // With a token: the API gives fresh data plus the file "sha" needed to save.
  if (token()) {
    const res = await fetch(`${API}?ref=${CFG.branch}&t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (res.ok) {
      const j = await res.json();
      return { data: JSON.parse(b64ToText(j.content)), sha: j.sha };
    }
    if (res.status === 401) flash("Your GitHub token was refused. Check it in Settings.", "error");
  }
  // Without a token: read the public raw file (may be up to ~5 minutes behind).
  const res = await fetch(`${RAW}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load data (${res.status}). Is ${CFG.path} on the ${CFG.branch} branch?`);
  return { data: await res.json(), sha: null };
}

// Apply a change to the freshest copy of the data and commit it. Retries on conflicts,
// so two people saving at the same time don't overwrite each other.
async function save(message, change) {
  if (!token()) {
    flash("Viewing only: add a GitHub token in Settings to save changes.", "error");
    return false;
  }
  $("#saving").hidden = false;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, sha } = await fetchRemote();
      if (!sha) throw new Error("Could not read the data file with your token.");
      const result = await change(data);
      if (result === false) return false;
      const res = await fetch(API, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json",
                   "Content-Type": "application/json" },
        body: JSON.stringify({ message: `[clubhub demo] ${message}`, branch: CFG.branch, sha,
                               content: textToB64(JSON.stringify(data, null, 1)) }),
      });
      if (res.ok) {
        DB = data;
        refreshMe();
        return true;
      }
      if (res.status !== 409 && res.status !== 422) {
        throw new Error(`GitHub refused the save (${res.status}). Check your token's permissions.`);
      }
    }
    throw new Error("Someone else is saving at the same time. Please try again.");
  } catch (err) {
    flash(err.message, "error");
    return false;
  } finally {
    $("#saving").hidden = true;
  }
}

// ---------------------------------------------------------------- data helpers
const userById = (id) => DB.users.find((u) => u.id === id);
const teamById = (id) => DB.teams.find((t) => t.id === id);
const eventById = (id) => DB.events.find((e) => e.id === id);
const roleIn = (teamId, userId = ME?.id) =>
  DB.members.find((m) => m.team_id === teamId && m.user_id === userId)?.role || null;
const myTeamIds = () => DB.members.filter((m) => m.user_id === ME.id).map((m) => m.team_id);

function refreshMe() {
  const id = Number(store.get("clubhub_user"));
  ME = (DB && id && userById(id)) || null;
}

// Permissions (same rules as clubhub/permissions.py)
const isAdmin = () => !!ME?.is_admin;
const canManageTeam = (teamId) => isAdmin() || ["coach", "staff"].includes(roleIn(teamId));
const manageableTeamIds = () => isAdmin() ? DB.teams.map((t) => t.id)
  : DB.members.filter((m) => m.user_id === ME.id && m.role !== "player").map((m) => m.team_id);
const canCreateEvents = () => isAdmin() || manageableTeamIds().length > 0;
const canManageEvent = (e) => isAdmin() ||
  (e.team_id == null ? e.created_by === ME.id : canManageTeam(e.team_id));
const canRsvp = (e) => e.team_id == null || isAdmin() || roleIn(e.team_id) != null;

function rsvpCounts(eventId) {
  const c = { yes: 0, maybe: 0, no: 0 };
  DB.rsvps.forEach((r) => { if (r.event_id === eventId) c[r.status]++; });
  return c;
}
const myRsvp = (eventId) => DB.rsvps.find((r) => r.event_id === eventId && r.user_id === ME.id)?.status;

// ---------------------------------------------------------------- shared UI pieces
function teamBadge(e) {
  const t = e.team_id ? teamById(e.team_id) : null;
  return t ? `<span class="badge" style="background:${esc(t.color)}">${esc(t.name)}</span>`
           : `<span class="badge club">Whole club</span>`;
}

function rsvpButtons(e) {
  if (!canRsvp(e)) return "";
  const mine = myRsvp(e.id);
  const b = (s, label) => `<button data-rsvp="${s}" data-event="${e.id}" class="r-${s} ${mine === s ? "on" : ""}">${label}</button>`;
  return `<div class="rsvp">${b("yes", "✓ In")}${b("maybe", "? Maybe")}${b("no", "✗ Out")}</div>`;
}

function eventCard(e) {
  const c = rsvpCounts(e.id);
  return `<article class="card event ${esc(e.category)}">
    <a href="#/events/${e.id}" class="event-main">
      <div class="when"><strong>${e.starts_at.slice(8, 10)}/${e.starts_at.slice(5, 7)}</strong>
        <small>${e.starts_at.slice(11, 16)}</small></div>
      <div class="what">
        <div class="title">${esc(e.title)}${e.opponent ? " vs " + esc(e.opponent) : ""}</div>
        <div class="meta">${teamBadge(e)}
          <span class="cat ${esc(e.category)}">${esc(e.category)} · ${esc(e.kind)}</span>
          ${e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}</div>
        <div class="counts">✓ ${c.yes} · ? ${c.maybe} · ✗ ${c.no}</div>
      </div>
    </a>${rsvpButtons(e)}</article>`;
}

const options = (items, selected) => items.map(([v, label]) =>
  `<option value="${esc(v)}" ${String(v) === String(selected ?? "") ? "selected" : ""}>${esc(label)}</option>`).join("");

// ---------------------------------------------------------------- views
const views = {};

views.login = () => `<div class="narrow"><h1>Log in</h1>
  <form class="form" data-form="login">
    <label>Email <input type="email" name="email" required autocomplete="email"></label>
    <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn">Log in</button></form>
  <p>No account? <a href="#/register">Register</a></p>
  <p class="muted small">Demo: admin@clubhub.local, coach@clubhub.local or player@clubhub.local, password demo1234.</p>
  <p class="small"><a href="#/settings">Settings (GitHub token)</a></p></div>`;

views.register = () => `<div class="narrow"><h1>Create your account</h1>
  ${token() ? "" : `<div class="flash error">Registering saves to GitHub, so this device needs a token first. <a href="#/settings">Add one in Settings</a>.</div>`}
  <form class="form" data-form="register">
    <label>Full name <input name="name" required></label>
    <label>Email <input type="email" name="email" required></label>
    <label>Password <input type="password" name="password" required minlength="6"></label>
    <button class="btn">Register</button></form>
  <p>Already registered? <a href="#/login">Log in</a></p></div>`;

views.settings = () => `<h1>Settings</h1>
  <div class="card">
    <p><strong>Saving changes</strong> needs a GitHub token with write access to the
      <code>${esc(CFG.owner)}/${esc(CFG.repo)}</code> repo. Without one, the app is view only.</p>
    <p class="small muted">Create one on GitHub: Settings → Developer settings → Fine-grained tokens →
      Generate new token. Repository access: only <code>${esc(CFG.repo)}</code>.
      Permissions: <em>Contents: Read and write</em>. The token is stored only in this browser.</p>
    <p class="small muted">Anyone holding this token can change files in the repo, so only share it with people you trust.</p>
    <form class="form" data-form="token">
      <label>GitHub token <input name="token" type="password" placeholder="github_pat_…" value="${esc(token() || "")}"></label>
      <div class="row-form"><button class="btn">Save token</button>
        <button type="button" class="btn ghost" data-action="forget-token">Remove token</button></div>
    </form>
    <p class="small">Status: ${token() ? "token set, changes are saved to GitHub" : "no token, view only"}</p>
  </div>
  <p class="small muted">Data file: <a href="https://github.com/${esc(CFG.owner)}/${esc(CFG.repo)}/blob/${esc(CFG.branch)}/${esc(CFG.path)}" target="_blank" rel="noopener">${esc(CFG.path)}</a>
    · <button class="linkbtn" style="color:var(--blue)" data-action="reload">Reload data</button></p>`;

views.home = () => {
  const mine = new Set(myTeamIds());
  const events = DB.events
    .filter((e) => e.starts_at >= today() && (e.team_id == null || mine.has(e.team_id)))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 10);
  const teams = DB.teams.filter((t) => mine.has(t.id));
  return `<h1>Hi ${esc(ME.name.split(" ")[0])} 👋</h1>
    ${token() ? "" : `<div class="flash">View only on this device. <a href="#/settings">Add a GitHub token</a> to save changes.</div>`}
    <section><h2>My teams</h2>
      ${teams.length ? `<div class="chips">${teams.map((t) => `<a class="chip" style="border-color:${esc(t.color)}" href="#/teams/${t.id}">${esc(t.name)} <small>(${esc(roleIn(t.id))})</small></a>`).join("")}</div>`
        : `<p class="muted">You are not on any team yet. Ask a coach or admin to add you.</p>`}</section>
    <section><div class="row-between"><h2>Upcoming for me</h2><a href="#/calendar?mine=1">Calendar →</a></div>
      ${events.map(eventCard).join("") || `<p class="muted">No upcoming events.</p>`}</section>`;
};

views.calendar = (params) => {
  const now = new Date();
  let [y, m] = (params.get("month") || "").split("-").map(Number);
  if (!y || !m) { y = now.getFullYear(); m = now.getMonth() + 1; }
  const teamId = Number(params.get("team")) || null;
  const category = params.get("category") || "";
  const mineOnly = params.get("mine") === "1";
  const first = new Date(y, m - 1, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  const last = new Date(y, m, 0);
  const end = new Date(last); end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const mine = new Set(myTeamIds());
  const events = DB.events.filter((e) => {
    const d = e.starts_at.slice(0, 10);
    return d >= isoDate(start) && d <= isoDate(end) &&
      (!teamId || e.team_id === teamId) && (!category || e.category === category) &&
      (!mineOnly || e.team_id == null || mine.has(e.team_id));
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const byDay = {};
  events.forEach((e) => (byDay[e.starts_at.slice(0, 10)] ||= []).push(e));
  const ym = (yy, mm) => { const d = new Date(yy, mm - 1, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const link = (month) => {
    const p = new URLSearchParams({ month });
    if (teamId) p.set("team", teamId);
    if (category) p.set("category", category);
    if (mineOnly) p.set("mine", "1");
    return `#/calendar?${p}`;
  };
  let cells = "";
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    cells += `<a href="javascript:void(0)" data-jump="d-${key}" class="cal-day ${d.getMonth() !== m - 1 ? "out" : ""} ${key === today() ? "today" : ""}">
      <span class="num">${d.getDate()}</span>
      ${(byDay[key] || []).map((e) => `<span class="cal-ev ${esc(e.category)}" style="--c:${esc(teamById(e.team_id)?.color || CLUB_COLOR)}" title="${esc(e.title)}"><span class="t">${e.starts_at.slice(11, 16)} ${esc(e.title)}</span></span>`).join("")}
    </a>`;
  }
  const monthKey = ym(y, m);
  let lastDay = "", agenda = "";
  events.filter((e) => e.starts_at.startsWith(monthKey)).forEach((e) => {
    const d = e.starts_at.slice(0, 10);
    if (d !== lastDay) {
      lastDay = d;
      agenda += `<h3 id="d-${d}" class="agenda-day">${d.slice(8, 10)}/${d.slice(5, 7)}
        ${canCreateEvents() ? `<a class="small" href="#/events/new?date=${d}">+ add</a>` : ""}</h3>`;
    }
    agenda += eventCard(e);
  });
  const monthName = first.toLocaleString("en", { month: "long", year: "numeric" });
  return `<div class="row-between cal-head">
      <a class="btn small ghost" href="${link(ym(y, m - 1))}">‹</a><h1>${monthName}</h1>
      <a class="btn small ghost" href="${link(ym(y, m + 1))}">›</a></div>
    <form class="filters" data-filter="calendar">
      <input type="hidden" name="month" value="${monthKey}">
      <select name="team"><option value="">All teams + club</option>${options(DB.teams.map((t) => [t.id, t.name]), teamId)}</select>
      <select name="category">${options([["", "Sport & social"], ["sport", "Sport"], ["social", "Social"]], category)}</select>
      <label class="check"><input type="checkbox" name="mine" value="1" ${mineOnly ? "checked" : ""}> Only mine</label>
      <a href="#/calendar" class="small">Today</a></form>
    <div class="cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((n) => `<div class="cal-dow">${n}</div>`).join("")}${cells}</div>
    <p class="legend small">${DB.teams.map((t) => `<span><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>`).join("")}
      <span><span class="dot" style="background:${CLUB_COLOR}"></span>Whole club</span></p>
    <h2>Agenda</h2>${agenda || `<p class="muted">No events this month.</p>`}`;
};

views.events = (params) => {
  const category = params.get("category") || "";
  const teamId = Number(params.get("team")) || null;
  const past = params.get("past") === "1";
  const list = DB.events.filter((e) =>
    (!category || e.category === category) && (!teamId || e.team_id === teamId) &&
    (past ? e.starts_at < today() : e.starts_at >= today()))
    .sort((a, b) => past ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at));
  return `<div class="row-between"><h1>${past ? "Past events" : "Upcoming events"}</h1>
      ${canCreateEvents() ? `<a class="btn" href="#/events/new">+ New event</a>` : ""}</div>
    <form class="filters" data-filter="events">
      <select name="category">${options([["", "Sport & social"], ["sport", "Sport only"], ["social", "Social only"]], category)}</select>
      <select name="team"><option value="">All teams</option>${options(DB.teams.map((t) => [t.id, t.name]), teamId)}</select>
      <label class="check"><input type="checkbox" name="past" value="1" ${past ? "checked" : ""}> Past</label></form>
    ${list.map(eventCard).join("") || `<p class="muted">No events found.</p>`}`;
};

views.eventDetail = (id) => {
  const e = eventById(id);
  if (!e) return `<p>Event not found.</p>`;
  const invited = e.team_id
    ? DB.members.filter((m) => m.team_id === e.team_id).map((m) => ({ ...userById(m.user_id), role: m.role }))
    : DB.users.map((u) => ({ ...u, role: null }));
  const groups = { yes: [], maybe: [], no: [], none: [] };
  invited.filter((p) => p.id).sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => {
    const s = DB.rsvps.find((r) => r.event_id === e.id && r.user_id === p.id)?.status;
    groups[s || "none"].push(p);
  });
  const list = (arr) => `<ul>${arr.map((p) => `<li>${esc(p.name)}${p.role && p.role !== "player" ? ` <small>(${esc(p.role)})</small>` : ""}</li>`).join("")}</ul>`;
  return `<div class="row-between"><h1>${esc(e.title)}${e.opponent ? " vs " + esc(e.opponent) : ""}</h1>
      ${canManageEvent(e) ? `<a class="btn small ghost" href="#/events/${e.id}/edit">Edit</a>` : ""}</div>
    <div class="card"><p>${teamBadge(e)} <span class="cat ${esc(e.category)}">${esc(e.category)} · ${esc(e.kind)}</span></p>
      <p>🕒 ${fmtDT(e.starts_at)}${e.ends_at ? " → " + fmtDT(e.ends_at) : ""}</p>
      ${e.location ? `<p>📍 ${esc(e.location)}</p>` : ""}
      ${e.description ? `<p class="pre">${esc(e.description)}</p>` : ""}</div>
    <h2>Are you in?</h2>
    ${canRsvp(e) ? rsvpButtons(e) : `<p class="muted">Only members of ${esc(teamById(e.team_id)?.name)} can answer.</p>`}
    <h2>Availability</h2>
    <div class="avail">
      <div><h3 class="t-yes">✓ In (${groups.yes.length})</h3>${list(groups.yes)}</div>
      <div><h3 class="t-maybe">? Maybe (${groups.maybe.length})</h3>${list(groups.maybe)}</div>
      <div><h3 class="t-no">✗ Out (${groups.no.length})</h3>${list(groups.no)}</div>
      <div><h3 class="muted">No answer (${groups.none.length})</h3>${list(groups.none)}</div></div>`;
};

views.eventForm = (id, params) => {
  const e = id ? eventById(id) : {
    category: params.get("category") || "sport",
    team_id: Number(params.get("team")) || null,
    starts_at: params.get("date") ? params.get("date") + "T18:00" : "",
  };
  if (!e) return `<p>Event not found.</p>`;
  if (id ? !canManageEvent(e) : !canCreateEvents()) return `<p>You can't edit events here.</p>`;
  const teams = DB.teams.filter((t) => manageableTeamIds().includes(t.id));
  const kindOpts = Object.entries(KINDS).flatMap(([cat, ks]) => ks.map((k) =>
    `<option value="${k}" data-cat="${cat}" ${k === e.kind ? "selected" : ""}>${k}</option>`)).join("");
  return `<h1>${id ? "Edit event" : "New event"}</h1>
    <form class="form" data-form="event" data-id="${id || ""}" id="event-form">
      <label>Title <input name="title" required value="${esc(e.title)}" placeholder="Training, League match, Club party..."></label>
      <fieldset class="seg"><legend>Type</legend>
        <label><input type="radio" name="category" value="sport" ${e.category !== "social" ? "checked" : ""}> ⚽ Sport</label>
        <label><input type="radio" name="category" value="social" ${e.category === "social" ? "checked" : ""}> 🎉 Social</label></fieldset>
      <label>Kind <select name="kind" id="kind">${kindOpts}</select></label>
      <label>Team <select name="team_id">
        ${isAdmin() ? `<option value="">Whole club (everyone invited)</option>` : ""}
        ${options(teams.map((t) => [t.id, t.name]), e.team_id)}</select></label>
      <div class="two">
        <label>Starts <input type="datetime-local" name="starts_at" required value="${esc(e.starts_at)}"></label>
        <label>Ends <input type="datetime-local" name="ends_at" value="${esc(e.ends_at)}"></label></div>
      <label>Location <input name="location" value="${esc(e.location)}"></label>
      <label class="sport-only">Opponent <input name="opponent" value="${esc(e.opponent)}" placeholder="For matches"></label>
      <label>Details <textarea name="description" rows="3">${esc(e.description)}</textarea></label>
      ${id ? "" : `<label>Repeat weekly for <input type="number" name="repeat_weeks" min="0" max="52" value="0" class="num"> more weeks</label>`}
      <button class="btn">Save</button></form>
    ${id ? `<div class="danger-zone"><button class="btn danger" data-action="delete-event" data-id="${id}">Delete event</button></div>` : ""}`;
};

views.teams = () => `<div class="row-between"><h1>Teams</h1>
    ${isAdmin() ? `<a class="btn" href="#/teams/new">+ New team</a>` : ""}</div>
  ${DB.teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => {
    const n = DB.members.filter((m) => m.team_id === t.id).length;
    const r = roleIn(t.id);
    return `<a class="card team-row" href="#/teams/${t.id}" style="border-left-color:${esc(t.color)}">
      <div><strong>${esc(t.name)}</strong> <span class="muted">${esc(t.sport)}</span></div>
      <div class="muted">${n} members${r ? " · you: " + esc(r) : ""}</div></a>`;
  }).join("") || `<p class="muted">No teams yet.</p>`}`;

views.teamForm = (id) => {
  const t = id ? teamById(id) : { name: "", sport: "", color: "#1e88e5" };
  if (!t) return `<p>Team not found.</p>`;
  if (id ? !canManageTeam(id) : !isAdmin()) return `<p>You can't edit this team.</p>`;
  return `<h1>${id ? "Edit team" : "New team"}</h1>
    <form class="form" data-form="team" data-id="${id || ""}">
      <label>Name <input name="name" required value="${esc(t.name)}"></label>
      <label>Sport <input name="sport" placeholder="Football, Basketball..." value="${esc(t.sport)}"></label>
      <label>Color <input type="color" name="color" value="${esc(t.color)}"></label>
      <button class="btn">Save</button></form>
    ${id && isAdmin() ? `<div class="danger-zone"><button class="btn danger" data-action="delete-team" data-id="${id}">Delete team</button></div>` : ""}`;
};

views.teamDetail = (id) => {
  const t = teamById(id);
  if (!t) return `<p>Team not found.</p>`;
  const manage = canManageTeam(id);
  const order = { coach: 0, staff: 1, player: 2 };
  const roster = DB.members.filter((m) => m.team_id === id)
    .map((m) => ({ ...m, user: userById(m.user_id) })).filter((m) => m.user)
    .sort((a, b) => order[a.role] - order[b.role] || a.user.name.localeCompare(b.user.name));
  const inTeam = new Set(roster.map((m) => m.user_id));
  const others = DB.users.filter((u) => !inTeam.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
  const events = DB.events.filter((e) => e.team_id === id && e.starts_at >= today())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 10);
  const rows = roster.map((m) => manage
    ? `<tr><td><a href="#/members/${m.user_id}">${esc(m.user.name)}</a></td>
        <td colspan="3"><form class="inline-edit" data-form="member-update" data-team="${id}" data-user="${m.user_id}">
          <select name="role">${options(ROLES.map((r) => [r, r]), m.role)}</select>
          <input name="position" value="${esc(m.position)}" placeholder="Position">
          <input name="jersey_number" value="${esc(m.jersey_number)}" placeholder="#" class="num">
          <button class="btn small ghost">Save</button></form></td>
        <td><button class="btn small danger" data-action="remove-member" data-team="${id}" data-user="${m.user_id}">Remove</button></td></tr>`
    : `<tr><td><a href="#/members/${m.user_id}">${esc(m.user.name)}</a></td><td>${esc(m.role)}</td>
        <td>${esc(m.position)}</td><td>${esc(m.jersey_number)}</td></tr>`).join("");
  return `<div class="row-between"><h1><span class="dot" style="background:${esc(t.color)}"></span> ${esc(t.name)}</h1>
      ${manage ? `<a class="btn small ghost" href="#/teams/${id}/edit">Edit</a>` : ""}</div>
    <p class="muted">${esc(t.sport)} · ${roster.length} members</p>
    <section><h2>Roster</h2><div class="table-wrap"><table class="roster">
      <thead><tr><th>Name</th><th>Role</th><th>Position</th><th>#</th>${manage ? "<th></th>" : ""}</tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="muted">Nobody on this roster yet.</td></tr>`}</tbody></table></div>
    ${manage ? `<h3>Add a member</h3>${others.length ? `<form class="form row-form" data-form="member-add" data-team="${id}">
        <select name="user_id" required><option value="">Choose a club member…</option>${options(others.map((u) => [u.id, `${u.name} (${u.email})`]))}</select>
        <select name="role">${options(ROLES.map((r) => [r, r]), "player")}</select>
        <input name="position" placeholder="Position"><input name="jersey_number" placeholder="#" class="num">
        <button class="btn">Add</button></form>` : `<p class="muted">Every club member is already on this team.</p>`}
      ${isAdmin() ? `<p class="small"><a href="#/members/new">+ Create a new club member</a></p>` : ""}` : ""}</section>
    <section><div class="row-between"><h2>Upcoming events</h2>
      ${manage ? `<a class="btn small" href="#/events/new?team=${id}">+ Event</a>` : ""}</div>
      ${events.map(eventCard).join("") || `<p class="muted">No upcoming events.</p>`}
      <p><a href="#/calendar?team=${id}">See this team in the calendar →</a></p></section>`;
};

views.members = () => {
  const users = DB.users.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="row-between"><h1>Club members (${users.length})</h1>
      ${isAdmin() ? `<a class="btn" href="#/members/new">+ Add member</a>` : ""}</div>
    <input type="search" id="member-filter" placeholder="Search members…" class="search">
    <div id="member-list">${users.map((u) => {
      const teams = DB.members.filter((m) => m.user_id === u.id).map((m) => teamById(m.team_id)?.name).filter(Boolean).join(", ");
      return `<a class="card member-row" href="#/members/${u.id}" data-search="${esc((u.name + " " + u.email + " " + teams).toLowerCase())}">
        <div><strong>${esc(u.name)}</strong>${u.is_admin ? ` <span class="badge club">admin</span>` : ""}</div>
        <div class="muted small">${esc(teams || "No team")}</div></a>`;
    }).join("")}</div>`;
};

views.profile = (id) => {
  const u = userById(id);
  if (!u) return `<p>Member not found.</p>`;
  const teams = DB.members.filter((m) => m.user_id === id).map((m) => ({ ...m, team: teamById(m.team_id) })).filter((m) => m.team);
  return `<div class="row-between"><h1>${esc(u.name)}</h1>
      ${u.id === ME.id ? `<a class="btn small ghost" href="#/me">Edit my profile</a>` : ""}</div>
    <div class="card"><p>✉️ <a href="mailto:${esc(u.email)}">${esc(u.email)}</a></p>
      ${u.phone ? `<p>📞 <a href="tel:${esc(u.phone)}">${esc(u.phone)}</a></p>` : ""}
      <p class="muted small">Member since ${esc(u.created_at)}${u.is_admin ? " · club admin" : ""}</p></div>
    <h2>Teams</h2>
    ${teams.map((m) => `<a class="card team-row" style="border-left-color:${esc(m.team.color)}" href="#/teams/${m.team.id}">
      <strong>${esc(m.team.name)}</strong> <span class="muted">${esc(m.role)}${m.position ? " · " + esc(m.position) : ""}${m.jersey_number ? " · #" + esc(m.jersey_number) : ""}</span></a>`).join("")
      || `<p class="muted">Not on any team.</p>`}
    ${isAdmin() && u.id !== ME.id ? `<h2>Admin</h2><div class="row-form">
      <button class="btn ghost" data-action="toggle-admin" data-id="${u.id}">${u.is_admin ? "Remove admin rights" : "Make club admin"}</button>
      <button class="btn danger" data-action="delete-user" data-id="${u.id}">Delete member</button></div>` : ""}`;
};

views.me = () => `<h1>My profile</h1>
  <form class="form" data-form="me">
    <label>Name <input name="name" required value="${esc(ME.name)}"></label>
    <label>Phone <input name="phone" type="tel" value="${esc(ME.phone)}"></label>
    <label>Email <input value="${esc(ME.email)}" disabled></label>
    <fieldset><legend>Change password (optional)</legend>
      <label>Current password <input type="password" name="current_password"></label>
      <label>New password <input type="password" name="new_password" minlength="6"></label></fieldset>
    <button class="btn">Save</button></form>
  <p class="small"><a href="#/settings">Settings (GitHub token)</a></p>`;

views.newMember = () => isAdmin() ? `<h1>Add a club member</h1>
  <p class="muted">A temporary password will be generated. Share it with the member so they can log in.</p>
  <form class="form" data-form="new-member">
    <label>Full name <input name="name" required></label>
    <label>Email <input type="email" name="email" required></label>
    <label>Phone <input type="tel" name="phone"></label>
    <button class="btn">Create member</button></form>` : `<p>Only admins can add members.</p>`;

// ---------------------------------------------------------------- router
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = hash.split("?");
  const params = new URLSearchParams(qs || "");
  const parts = path.split("/").filter(Boolean);
  const num = (i) => Number(parts[i]);
  const publicPages = { login: views.login, register: views.register, settings: views.settings };

  if (!ME && !publicPages[parts[0]]) { location.hash = "#/login"; return; }

  let html;
  if (publicPages[parts[0]]) html = publicPages[parts[0]]();
  else if (!parts.length) html = views.home();
  else if (parts[0] === "calendar") html = views.calendar(params);
  else if (parts[0] === "events") {
    if (!parts[1]) html = views.events(params);
    else if (parts[1] === "new") html = views.eventForm(null, params);
    else if (parts[2] === "edit") html = views.eventForm(num(1), params);
    else html = views.eventDetail(num(1));
  } else if (parts[0] === "teams") {
    if (!parts[1]) html = views.teams();
    else if (parts[1] === "new") html = views.teamForm(null);
    else if (parts[2] === "edit") html = views.teamForm(num(1));
    else html = views.teamDetail(num(1));
  } else if (parts[0] === "members") {
    if (!parts[1]) html = views.members();
    else if (parts[1] === "new") html = views.newMember();
    else html = views.profile(num(1));
  } else if (parts[0] === "me") html = views.me();
  else html = `<p>Page not found.</p>`;

  $("#view").innerHTML = html;
  renderChrome();
  afterRender();
}

function renderChrome() {
  const links = [["#/", "Home"], ["#/calendar", "Calendar"], ["#/events", "Events"], ["#/teams", "Teams"], ["#/members", "Members"]];
  $("#topnav").innerHTML = ME ? links.map(([h, l]) => `<a href="${h}">${l}</a>`).join("") : "";
  $("#bottomnav").hidden = !ME;
  document.body.style.paddingBottom = ME ? "" : "0";
  $("#topright").innerHTML = (deferredPrompt ? `<button id="install-btn" class="btn small">Install app</button>` : "") +
    (ME ? `<a href="#/members/${ME.id}" class="me">${esc(ME.name.split(" ")[0])}</a>
           <button class="linkbtn" data-action="logout">Log out</button>` : "");
}

function afterRender() {
  const form = $("#event-form");
  if (form) {
    const kind = $("#kind");
    const sync = () => {
      const cat = form.querySelector("input[name=category]:checked").value;
      let firstVisible = null, ok = false;
      for (const o of kind.options) {
        const show = o.dataset.cat === cat;
        o.hidden = !show; o.disabled = !show;
        if (show && !firstVisible) firstVisible = o;
        if (show && o.selected) ok = true;
      }
      if (!ok && firstVisible) firstVisible.selected = true;
      form.querySelectorAll(".sport-only").forEach((el) => (el.hidden = cat !== "sport"));
    };
    form.querySelectorAll("input[name=category]").forEach((r) => r.addEventListener("change", sync));
    sync();
  }
  const filter = $("#member-filter");
  if (filter) filter.addEventListener("input", () => {
    const q = filter.value.toLowerCase();
    document.querySelectorAll("#member-list [data-search]").forEach((el) => (el.hidden = !el.dataset.search.includes(q)));
  });
}

// ---------------------------------------------------------------- form handlers
const forms = {};

forms.login = async (f) => {
  const email = f.email.trim().toLowerCase();
  const u = DB.users.find((x) => x.email === email);
  if (!u || (await hashPassword(u.salt, f.password)) !== u.pw) return flash("Wrong email or password.", "error");
  store.set("clubhub_user", u.id);
  refreshMe();
  location.hash = "#/";
};

forms.register = async (f) => {
  const email = f.email.trim().toLowerCase();
  const salt = randomHex(8);
  const pw = await hashPassword(salt, f.password);
  let newId = null, first = false;
  const ok = await save(`register ${email}`, (d) => {
    if (d.users.some((u) => u.email === email)) { flash("An account with this email already exists.", "error"); return false; }
    first = d.users.length === 0;
    newId = nextId(d.users);
    d.users.push({ id: newId, name: f.name.trim(), email, phone: "", salt, pw, is_admin: first, created_at: today() });
  });
  if (ok) {
    store.set("clubhub_user", newId);
    refreshMe();
    go("#/", "Welcome to Clubhub!" + (first ? " You are the club admin." : ""));
  }
};

forms.token = (f) => {
  store.set("clubhub_token", f.token.trim() || null);
  flash(f.token.trim() ? "Token saved on this device." : "Token removed.");
  loadData();
};

forms.event = async (f, el) => {
  const id = Number(el.dataset.id) || null;
  const teamId = Number(f.team_id) || null;
  if (!f.title.trim()) return flash("Title is required.", "error");
  if (f.ends_at && f.ends_at < f.starts_at) return flash("The end must be after the start.", "error");
  if (teamId == null && !isAdmin()) return flash("Only club admins can create club-wide events. Pick a team.", "error");
  if (teamId != null && !manageableTeamIds().includes(teamId)) return flash("You cannot create events for this team.", "error");
  const kind = KINDS[f.category]?.includes(f.kind) ? f.kind : "other";
  const fields = { title: f.title.trim(), category: f.category, kind, team_id: teamId,
    starts_at: f.starts_at, ends_at: f.ends_at || null, location: f.location.trim(),
    opponent: f.opponent.trim(), description: f.description.trim() };
  let targetId = id;
  const repeat = Math.max(0, Math.min(Number(f.repeat_weeks) || 0, 52));
  const ok = await save(id ? `edit event ${id}` : `new event ${fields.title}`, (d) => {
    if (id) {
      const e = d.events.find((x) => x.id === id);
      if (!e) return false;
      Object.assign(e, fields);
      return;
    }
    const start = new Date(fields.starts_at), end = fields.ends_at ? new Date(fields.ends_at) : null;
    for (let w = 0; w <= repeat; w++) {
      const s = new Date(start); s.setDate(s.getDate() + 7 * w);
      const en = end ? new Date(end) : null; if (en) en.setDate(en.getDate() + 7 * w);
      const nid = nextId(d.events);
      if (w === 0) targetId = nid;
      d.events.push({ ...fields, id: nid, starts_at: isoDT(s), ends_at: en ? isoDT(en) : null, created_by: ME.id });
    }
  });
  if (ok) { go(`#/events/${targetId}`, id ? "Event updated." : repeat ? `${repeat + 1} events created.` : "Event created."); }
};

forms.team = async (f, el) => {
  const id = Number(el.dataset.id) || null;
  if (!f.name.trim()) return flash("Team name is required.", "error");
  let targetId = id;
  const ok = await save(id ? `edit team ${id}` : `new team ${f.name}`, (d) => {
    const fields = { name: f.name.trim(), sport: f.sport.trim(), color: f.color || "#1e88e5" };
    if (id) Object.assign(d.teams.find((t) => t.id === id) || {}, fields);
    else { targetId = nextId(d.teams); d.teams.push({ id: targetId, ...fields }); }
  });
  if (ok) { go(`#/teams/${targetId}`, id ? "Team updated." : "Team created."); }
};

forms["member-add"] = async (f, el) => {
  const teamId = Number(el.dataset.team), userId = Number(f.user_id);
  if (!userId) return flash("Pick a member to add.", "error");
  const role = ROLES.includes(f.role) ? f.role : "player";
  const ok = await save(`add member ${userId} to team ${teamId}`, (d) => {
    d.members = d.members.filter((m) => !(m.team_id === teamId && m.user_id === userId));
    d.members.push({ team_id: teamId, user_id: userId, role, position: f.position.trim(), jersey_number: f.jersey_number.trim() });
  });
  if (ok) { go(location.hash, "Member added to the roster."); }
};

forms["member-update"] = async (f, el) => {
  const teamId = Number(el.dataset.team), userId = Number(el.dataset.user);
  const ok = await save(`update member ${userId} in team ${teamId}`, (d) => {
    const m = d.members.find((x) => x.team_id === teamId && x.user_id === userId);
    if (!m) return false;
    Object.assign(m, { role: ROLES.includes(f.role) ? f.role : "player", position: f.position.trim(), jersey_number: f.jersey_number.trim() });
  });
  if (ok) { go(location.hash, "Member updated."); }
};

forms.me = async (f) => {
  if (!f.name.trim()) return flash("Name is required.", "error");
  let pwUpdate = null;
  if (f.new_password) {
    if ((await hashPassword(ME.salt, f.current_password)) !== ME.pw) return flash("Current password is wrong.", "error");
    if (f.new_password.length < 6) return flash("New password must be at least 6 characters.", "error");
    const salt = randomHex(8);
    pwUpdate = { salt, pw: await hashPassword(salt, f.new_password) };
  }
  const ok = await save(`update profile ${ME.id}`, (d) => {
    const u = d.users.find((x) => x.id === ME.id);
    Object.assign(u, { name: f.name.trim(), phone: f.phone.trim() }, pwUpdate || {});
  });
  if (ok) { go(`#/members/${ME.id}`, "Profile saved."); }
};

forms["new-member"] = async (f) => {
  const email = f.email.trim().toLowerCase();
  const temp = randomHex(4);
  const salt = randomHex(8);
  const pw = await hashPassword(salt, temp);
  let newId;
  const ok = await save(`add member ${email}`, (d) => {
    if (d.users.some((u) => u.email === email)) { flash("An account with this email already exists.", "error"); return false; }
    newId = nextId(d.users);
    d.users.push({ id: newId, name: f.name.trim(), email, phone: f.phone.trim(), salt, pw, is_admin: false, created_at: today() });
  });
  if (ok) { go(`#/members/${newId}`, `Member created. Temporary password: ${temp} (share it with them).`); }
};

// ---------------------------------------------------------------- button actions
const actions = {};
actions.logout = () => { store.set("clubhub_user", null); ME = null; location.hash = "#/login"; };
actions.reload = () => loadData();
actions["forget-token"] = () => { store.set("clubhub_token", null); flash("Token removed."); loadData(); };

actions["delete-event"] = async (el) => {
  const id = Number(el.dataset.id);
  if (!confirm("Delete this event?")) return;
  if (await save(`delete event ${id}`, (d) => {
    d.events = d.events.filter((e) => e.id !== id);
    d.rsvps = d.rsvps.filter((r) => r.event_id !== id);
  })) { go("#/events", "Event deleted."); }
};

actions["delete-team"] = async (el) => {
  const id = Number(el.dataset.id);
  if (!confirm("Delete this team and all its events?")) return;
  if (await save(`delete team ${id}`, (d) => {
    const gone = new Set(d.events.filter((e) => e.team_id === id).map((e) => e.id));
    d.teams = d.teams.filter((t) => t.id !== id);
    d.members = d.members.filter((m) => m.team_id !== id);
    d.events = d.events.filter((e) => !gone.has(e.id));
    d.rsvps = d.rsvps.filter((r) => !gone.has(r.event_id));
  })) { go("#/teams", "Team deleted."); }
};

actions["remove-member"] = async (el) => {
  const teamId = Number(el.dataset.team), userId = Number(el.dataset.user);
  if (!confirm(`Remove ${userById(userId)?.name} from ${teamById(teamId)?.name}?`)) return;
  if (await save(`remove member ${userId} from team ${teamId}`, (d) => {
    d.members = d.members.filter((m) => !(m.team_id === teamId && m.user_id === userId));
  })) { go(location.hash, "Member removed from the roster."); }
};

actions["toggle-admin"] = async (el) => {
  const id = Number(el.dataset.id);
  if (await save(`toggle admin ${id}`, (d) => {
    const u = d.users.find((x) => x.id === id); if (u) u.is_admin = !u.is_admin;
  })) { go(location.hash, "Admin rights updated."); }
};

actions["delete-user"] = async (el) => {
  const id = Number(el.dataset.id);
  if (!confirm(`Delete ${userById(id)?.name}?`)) return;
  if (await save(`delete member ${id}`, (d) => {
    d.users = d.users.filter((u) => u.id !== id);
    d.members = d.members.filter((m) => m.user_id !== id);
    d.rsvps = d.rsvps.filter((r) => r.user_id !== id);
  })) { go("#/members", "Member deleted."); }
};

async function setRsvp(eventId, status) {
  const current = myRsvp(eventId);
  const next = current === status ? null : status; // tap again to clear
  if (await save(`rsvp ${status} event ${eventId}`, (d) => {
    d.rsvps = d.rsvps.filter((r) => !(r.event_id === eventId && r.user_id === ME.id));
    if (next) d.rsvps.push({ event_id: eventId, user_id: ME.id, status: next });
  })) { const y = window.scrollY; route(); window.scrollTo(0, y); }
}

// ---------------------------------------------------------------- event wiring
document.addEventListener("submit", async (ev) => {
  const el = ev.target;
  const name = el.dataset.form;
  if (!name || !forms[name]) return;
  ev.preventDefault();
  clearFlash();
  const data = Object.fromEntries(new FormData(el).entries());
  const btn = el.querySelector("button:not([type=button])");
  if (btn) btn.disabled = true;
  try { await forms[name](data, el); } finally { if (btn) btn.disabled = false; }
});

document.addEventListener("change", (ev) => {
  const form = ev.target.closest("form[data-filter]");
  if (!form) return;
  const p = new URLSearchParams();
  for (const [k, v] of new FormData(form).entries()) if (v) p.set(k, v);
  location.hash = `#/${form.dataset.filter}?${p}`;
});

document.addEventListener("click", async (ev) => {
  const rsvp = ev.target.closest("[data-rsvp]");
  if (rsvp) { ev.preventDefault(); clearFlash(); return setRsvp(Number(rsvp.dataset.event), rsvp.dataset.rsvp); }
  const jump = ev.target.closest("[data-jump]");
  if (jump) { ev.preventDefault(); document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: "smooth" }); return; }
  const act = ev.target.closest("[data-action]");
  if (act && actions[act.dataset.action]) { ev.preventDefault(); clearFlash(); return actions[act.dataset.action](act); }
  if (ev.target.id === "install-btn" && deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    renderChrome();
  }
});

window.addEventListener("hashchange", () => { clearFlash(); route(); showPending(); });

// ---------------------------------------------------------------- PWA
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; renderChrome(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));

// ---------------------------------------------------------------- start
async function loadData() {
  try {
    DB = (await fetchRemote()).data;
    refreshMe();
    route();
  } catch (err) {
    $("#view").innerHTML = `<h1>Could not load the club data</h1><p>${esc(err.message)}</p>
      <p><button class="btn" data-action="reload">Try again</button> <a href="#/settings">Settings</a></p>`;
  }
}
loadData();
