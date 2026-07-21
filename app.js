/* ============================================================
   THE GROW VISTA — Team Management System
   Created by Ahmad Tech Lead
   Client-side SPA · localStorage persistence
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Storage keys ---------- */
  const K = {
    users: "gv_users",
    att: "gv_attendance",
    tasks: "gv_tasks",
    leaves: "gv_leaves",
    session: "gv_session",
  };
  const LEAVE_EMAIL = "info@thegrowvista.com";

  /* ---------- Utils ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  const load = (k, def) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }
    catch { return def; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- Secure-ish password hashing ---------- */
  async function hashPw(pw) {
    const salt = "growvista::v1";
    try {
      const enc = new TextEncoder().encode(salt + pw);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fallback (non-crypto) — only if SubtleCrypto unavailable
      let h = 0x811c9dc5; const s = salt + pw;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return ("00000000" + (h >>> 0).toString(16)).slice(-8).repeat(8);
    }
  }

  /* ---------- Date helpers ---------- */
  const now = () => new Date();
  const isoDate = (d = new Date()) => {
    const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  };
  function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function fmtDateLong(d) {
    return new Date(d).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  function durationHrs(a, b) {
    if (!a || !b) return null;
    return (new Date(b) - new Date(a)) / 3600000;
  }
  function fmtDur(hrs) {
    if (hrs == null) return "—";
    const h = Math.floor(hrs), m = Math.round((hrs - h) * 60);
    return `${h}h ${m}m`;
  }
  function daysBetween(a, b) {
    const d = Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
    return d > 0 ? d : 0;
  }

  /* ---------- App state ---------- */
  let USERS = [], ATT = [], TASKS = [], LEAVES = [];
  let ME = null;
  let currentView = "dashboard";

  function refresh() {
    USERS = load(K.users, []);
    ATT = load(K.att, []);
    TASKS = load(K.tasks, []);
    LEAVES = load(K.leaves, []);
  }

  /* ---------- Seed default admin ---------- */
  async function seed() {
    let users = load(K.users, null);
    if (!users || users.length === 0) {
      const admin = {
        id: uid(), name: "Administrator", username: "admin",
        email: LEAVE_EMAIL, passHash: await hashPw("admin123"),
        role: "admin", canAssignTasks: true, active: true, createdAt: new Date().toISOString(),
      };
      save(K.users, [admin]);
    }
    if (load(K.att, null) == null) save(K.att, []);
    if (load(K.tasks, null) == null) save(K.tasks, []);
    if (load(K.leaves, null) == null) save(K.leaves, []);
  }

  /* ---------- Toast ---------- */
  function toast(msg, type = "good") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    const icon = type === "good" ? "✅" : type === "bad" ? "⚠️" : type === "warn" ? "🔔" : "ℹ️";
    el.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
    $("#toastStack").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(30px)"; el.style.transition = "all .3s"; setTimeout(() => el.remove(), 320); }, 3200);
  }

  /* ---------- Modal ---------- */
  function openModal(title, bodyHtml, onMount) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    $("#modalOverlay").hidden = false;
    if (onMount) onMount($("#modalBody"));
  }
  function closeModal() { $("#modalOverlay").hidden = true; $("#modalBody").innerHTML = ""; }

  /* ---------- Auth ---------- */
  function getUser(id) { return USERS.find(u => u.id === id) || null; }

  async function doLogin(username, password) {
    refresh();
    const u = USERS.find(x => x.username.toLowerCase() === username.toLowerCase());
    if (!u) return { ok: false, msg: "No account found with that username." };
    if (u.active === false) return { ok: false, msg: "This account has been deactivated. Contact an admin." };
    const h = await hashPw(password);
    if (h !== u.passHash) return { ok: false, msg: "Incorrect password. Please try again." };
    save(K.session, u.id);
    clockIn(u.id);
    return { ok: true, user: u };
  }

  function clockIn(userId) {
    refresh();
    const today = isoDate();
    const open = ATT.find(a => a.userId === userId && a.date === today && !a.signOut);
    if (!open) {
      ATT.push({ id: uid(), userId, date: today, signIn: new Date().toISOString(), signOut: null });
      save(K.att, ATT);
    }
  }
  function clockOut(userId) {
    refresh();
    const open = ATT.filter(a => a.userId === userId && !a.signOut).sort((a, b) => new Date(b.signIn) - new Date(a.signIn))[0];
    if (open) { open.signOut = new Date().toISOString(); save(K.att, ATT); }
  }
  function currentShift(userId) {
    return ATT.filter(a => a.userId === userId && !a.signOut).sort((a, b) => new Date(b.signIn) - new Date(a.signIn))[0] || null;
  }

  function doLogout() {
    if (ME) clockOut(ME.id);
    localStorage.removeItem(K.session);
    ME = null;
    showLogin();
    toast("You are clocked out. See you next shift!", "good");
  }

  /* ---------- Permissions ---------- */
  const isAdmin = () => ME && ME.role === "admin";
  const canAssign = () => ME && (ME.role === "admin" || ME.canAssignTasks === true);

  /* ============================================================
     VIEWS
     ============================================================ */
  const TITLES = { dashboard: "Dashboard", attendance: "Attendance", tasks: "Tasks", leave: "Leave", users: "Users", profile: "My Profile" };

  function render() {
    refresh();
    ME = getUser(load(K.session, null));
    if (!ME) { showLogin(); return; }
    $("#viewTitle").textContent = TITLES[currentView] || "";
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === currentView));
    const c = $("#content");
    if (currentView === "dashboard") c.innerHTML = viewDashboard();
    else if (currentView === "attendance") c.innerHTML = viewAttendance();
    else if (currentView === "tasks") c.innerHTML = viewTasks();
    else if (currentView === "leave") c.innerHTML = viewLeave();
    else if (currentView === "users") c.innerHTML = isAdmin() ? viewUsers() : viewNoAccess();
    else if (currentView === "profile") c.innerHTML = viewProfile();
    bindViewEvents();
    updateChrome();
  }

  function updateChrome() {
    $("#userChipName").textContent = ME.name;
    $("#userChipRole").textContent = ME.role === "admin" ? "Administrator" : (ME.canAssignTasks ? "Team Lead" : "Member");
    const av = $("#userAvatar");
    av.textContent = ME.name.trim().charAt(0).toUpperCase();
    av.classList.toggle("yellow", ME.role === "admin");
    $$(".admin-only").forEach(el => el.hidden = !isAdmin());
    const shift = currentShift(ME.id);
    const sp = $("#shiftStatus");
    sp.classList.toggle("on", !!shift);
    $("#shiftStatusText").textContent = shift ? "On shift" : "Off shift";
  }

  /* ---------- Dashboard ---------- */
  function viewDashboard() {
    const shift = currentShift(ME.id);
    const myTasks = TASKS.filter(t => t.assignedTo === ME.id);
    const openTasks = myTasks.filter(t => t.status !== "done");
    const myLeaves = LEAVES.filter(l => l.userId === ME.id);
    const todayAtt = ATT.filter(a => a.userId === ME.id && a.date === isoDate());
    const greeting = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();

    let adminStats = "";
    if (isAdmin()) {
      const onShift = USERS.filter(u => currentShift(u.id)).length;
      const pendingLeaves = LEAVES.filter(l => l.status === "pending").length;
      const allOpenTasks = TASKS.filter(t => t.status !== "done").length;
      adminStats = `
        <h3 class="section-title">Company overview</h3>
        <div class="card-grid">
          ${statCard("👥", USERS.filter(u=>u.active!==false).length, "Active employees", "rgba(91,147,214,.12)", "#E7F0FB")}
          ${statCard("🟢", onShift, "Currently on shift", "rgba(31,169,113,.12)", "#E7F7F0")}
          ${statCard("📋", allOpenTasks, "Open tasks", "rgba(230,197,22,.16)", "#FCF4D2")}
          ${statCard("✈️", pendingLeaves, "Pending leave requests", "rgba(107,79,208,.12)", "#EEE9FB")}
        </div>`;
    }

    return `
      <div class="hero-card">
        <div class="hero-inner">
          <div class="hero-greet">${greeting},</div>
          <div class="hero-name">${esc(ME.name)} 👋</div>
          <div class="hero-sub">${fmtDateLong(new Date())}</div>
          <div class="hero-actions">
            <div class="hero-clock">🕒 <span id="heroClock">--:--:--</span></div>
            ${shift
              ? `<span class="hero-clock" style="background:rgba(31,169,113,.25);border-color:rgba(255,255,255,.4)">🟢 On shift since ${fmtTime(shift.signIn)}</span>
                 <button class="btn btn-yellow" id="dashClockOut">Clock out now</button>`
              : `<button class="btn btn-yellow" id="dashClockIn">🟢 Clock in</button>`}
          </div>
        </div>
      </div>

      <h3 class="section-title">Your snapshot</h3>
      <div class="card-grid">
        ${statCard("✓", openTasks.length, "Open tasks assigned to you", "rgba(91,147,214,.12)", "#E7F0FB")}
        ${statCard("📅", todayAtt.length, "Sessions logged today", "rgba(31,169,113,.12)", "#E7F7F0")}
        ${statCard("⏱", fmtDur(totalHoursToday(ME.id)), "Hours today", "rgba(230,197,22,.16)", "#FCF4D2")}
        ${statCard("✈️", myLeaves.length, "Leave requests", "rgba(107,79,208,.12)", "#EEE9FB")}
      </div>

      ${adminStats}

      <h3 class="section-title">Tasks needing attention</h3>
      ${openTasks.length ? `<div class="task-list">${openTasks.slice(0, 5).map(taskItemHtml).join("")}</div>`
        : `<div class="card card-pad empty"><div class="big">🎉</div>No open tasks. You're all caught up!</div>`}
    `;
  }

  function totalHoursToday(userId) {
    const today = isoDate();
    let sum = 0;
    ATT.filter(a => a.userId === userId && a.date === today).forEach(a => {
      const end = a.signOut || new Date().toISOString();
      const d = durationHrs(a.signIn, end); if (d) sum += d;
    });
    return sum;
  }

  function statCard(ico, val, label, accent, icobg) {
    return `<div class="stat-card" style="--accent:${accent}">
      <div class="stat-ico" style="background:${icobg}">${ico}</div>
      <div class="stat-val">${esc(val)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`;
  }

  /* ---------- Attendance ---------- */
  function viewAttendance() {
    const shift = currentShift(ME.id);
    const mine = ATT.filter(a => a.userId === ME.id).sort((a, b) => new Date(b.signIn) - new Date(a.signIn));

    const adminSection = isAdmin() ? `
      <h3 class="section-title">Team attendance — today</h3>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Employee</th><th>Status</th><th>Clock in</th><th>Clock out</th><th>Duration</th></tr></thead>
          <tbody>
            ${USERS.filter(u=>u.active!==false).map(u => {
              const rec = ATT.filter(a => a.userId === u.id && a.date === isoDate()).sort((a,b)=>new Date(b.signIn)-new Date(a.signIn))[0];
              const on = rec && !rec.signOut;
              return `<tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td>${rec ? (on ? `<span class="badge green">● On shift</span>` : `<span class="badge gray">Clocked out</span>`) : `<span class="badge red">Absent</span>`}</td>
                <td>${rec ? fmtTime(rec.signIn) : "—"}</td>
                <td>${rec && rec.signOut ? fmtTime(rec.signOut) : "—"}</td>
                <td>${rec ? fmtDur(durationHrs(rec.signIn, rec.signOut || new Date().toISOString())) : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : "";

    return `
      <div class="page-head">
        <div><h2>Attendance</h2><p>Your clock-in happens automatically at login and clock-out at logout.</p></div>
        ${shift
          ? `<button class="btn btn-danger" id="attClockOut">Clock out</button>`
          : `<button class="btn btn-primary" id="attClockIn">🟢 Clock in</button>`}
      </div>

      <div class="grid-2">
        <div class="card card-pad">
          <div class="stat-ico" style="background:${shift ? "#E7F7F0" : "#EEF2F7"}">${shift ? "🟢" : "⚪"}</div>
          <div class="stat-val" style="font-size:22px">${shift ? "On shift" : "Off shift"}</div>
          <div class="stat-label">${shift ? "Since " + fmtTime(shift.signIn) + " today" : "Not clocked in"}</div>
        </div>
        <div class="card card-pad">
          <div class="stat-ico" style="background:#FCF4D2">⏱</div>
          <div class="stat-val" style="font-size:22px">${fmtDur(totalHoursToday(ME.id))}</div>
          <div class="stat-label">Total hours logged today</div>
        </div>
      </div>

      <h3 class="section-title">My attendance history</h3>
      ${mine.length ? `<div class="table-wrapper">
        <table>
          <thead><tr><th>Date</th><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            ${mine.map(a => `<tr>
              <td><strong>${fmtDate(a.signIn)}</strong></td>
              <td>${fmtTime(a.signIn)}</td>
              <td>${a.signOut ? fmtTime(a.signOut) : "—"}</td>
              <td>${fmtDur(durationHrs(a.signIn, a.signOut || new Date().toISOString()))}</td>
              <td>${a.signOut ? `<span class="badge gray">Complete</span>` : `<span class="badge green">● Active</span>`}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="card card-pad empty"><div class="big">📅</div>No attendance records yet.</div>`}

      ${adminSection}
    `;
  }

  /* ---------- Tasks ---------- */
  function viewTasks() {
    const canSee = isAdmin();
    const assignable = canAssign();
    const mine = TASKS.filter(t => t.assignedTo === ME.id);
    const assignedByMe = TASKS.filter(t => t.assignedBy === ME.id && t.assignedTo !== ME.id);

    return `
      <div class="page-head">
        <div><h2>Tasks</h2><p>${assignable ? "Assign work to your team and track progress." : "Your assigned tasks and their status."}</p></div>
        ${assignable ? `<button class="btn btn-primary" id="newTaskBtn">＋ New task</button>` : ""}
      </div>

      <div class="tabs" id="taskTabs">
        <button class="tab active" data-tab="mine">Assigned to me (${mine.length})</button>
        ${assignable ? `<button class="tab" data-tab="byme">Assigned by me (${assignedByMe.length})</button>` : ""}
        ${canSee ? `<button class="tab" data-tab="all">All tasks (${TASKS.length})</button>` : ""}
      </div>

      <div id="taskPanel">${renderTaskList(mine, "mine")}</div>
    `;
  }

  function renderTaskList(list, mode) {
    if (!list.length) return `<div class="card card-pad empty"><div class="big">📋</div>No tasks here yet.</div>`;
    const order = { high: 0, medium: 1, low: 2 };
    const sorted = [...list].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;
      return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
    });
    return `<div class="task-list">${sorted.map(t => taskItemHtml(t, mode)).join("")}</div>`;
  }

  function taskItemHtml(t, mode) {
    const done = t.status === "done";
    const assignee = getUser(t.assignedTo);
    const assigner = getUser(t.assignedBy);
    const canEdit = isAdmin() || t.assignedBy === ME.id;
    const canToggle = t.assignedTo === ME.id || canEdit;
    const prBadge = t.priority === "high" ? "red" : t.priority === "low" ? "gray" : "yellow";
    const stBadge = done ? "green" : t.status === "in_progress" ? "blue" : "gray";
    const stTxt = done ? "Done" : t.status === "in_progress" ? "In progress" : "To do";
    const overdue = t.dueDate && !done && new Date(t.dueDate) < new Date(isoDate());
    return `<div class="task-item" data-id="${t.id}">
      <div class="task-check ${done ? "done" : ""}" data-act="toggle" data-id="${t.id}" ${canToggle ? "" : 'style="cursor:default;opacity:.5"'}>${done ? "✓" : ""}</div>
      <div class="task-main">
        <div class="task-title ${done ? "done" : ""}">${esc(t.title)}</div>
        ${t.desc ? `<div class="task-desc">${esc(t.desc)}</div>` : ""}
        <div class="task-meta">
          <span class="badge ${stBadge}">${stTxt}</span>
          <span class="badge ${prBadge}">${esc(t.priority)} priority</span>
          ${t.dueDate ? `<span class="badge ${overdue ? "red" : "blue"}">📅 ${overdue ? "Overdue · " : ""}${fmtDate(t.dueDate)}</span>` : ""}
          ${mode !== "mine" ? `<span class="badge purple">➡ ${esc(assignee ? assignee.name : "Unknown")}</span>` : ""}
          <span class="badge gray">by ${esc(assigner ? assigner.name : "—")}</span>
        </div>
      </div>
      <div class="row-actions">
        ${(t.assignedTo === ME.id && !done) ? `<button class="btn btn-outline btn-sm" data-act="advance" data-id="${t.id}">${t.status === "todo" ? "Start" : "Complete"}</button>` : ""}
        ${canEdit ? `<button class="btn btn-outline btn-sm" data-act="edit" data-id="${t.id}">Edit</button>` : ""}
        ${canEdit ? `<button class="btn btn-danger btn-sm" data-act="delete" data-id="${t.id}">Delete</button>` : ""}
      </div>
    </div>`;
  }

  function taskModal(existing) {
    const others = USERS.filter(u => u.active !== false);
    const opts = others.map(u => `<option value="${u.id}" ${existing && existing.assignedTo === u.id ? "selected" : ""}>${esc(u.name)}${u.id === ME.id ? " (me)" : ""}</option>`).join("");
    openModal(existing ? "Edit task" : "New task", `
      <form id="taskForm">
        <div class="form-grid">
          <label class="field full"><span>Task title *</span><input type="text" id="tTitle" required maxlength="120" value="${existing ? esc(existing.title) : ""}" placeholder="e.g. Prepare Q3 report"></label>
          <label class="field full"><span>Description</span><textarea id="tDesc" maxlength="1000" placeholder="Details, context, links...">${existing ? esc(existing.desc || "") : ""}</textarea></label>
          <label class="field"><span>Assign to *</span><select id="tAssignee" required>${opts}</select></label>
          <label class="field"><span>Priority</span><select id="tPriority">
            <option value="low" ${existing && existing.priority==="low"?"selected":""}>Low</option>
            <option value="medium" ${!existing||existing.priority==="medium"?"selected":""}>Medium</option>
            <option value="high" ${existing && existing.priority==="high"?"selected":""}>High</option>
          </select></label>
          <label class="field"><span>Due date</span><input type="date" id="tDue" value="${existing && existing.dueDate ? existing.dueDate : ""}"></label>
          ${existing ? `<label class="field"><span>Status</span><select id="tStatus">
            <option value="todo" ${existing.status==="todo"?"selected":""}>To do</option>
            <option value="in_progress" ${existing.status==="in_progress"?"selected":""}>In progress</option>
            <option value="done" ${existing.status==="done"?"selected":""}>Done</option>
          </select></label>` : ""}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Create task"}</button>
        </div>
      </form>
    `, (body) => {
      body.querySelector("#taskForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const title = $("#tTitle").value.trim();
        if (!title) return;
        const data = {
          title,
          desc: $("#tDesc").value.trim(),
          assignedTo: $("#tAssignee").value,
          priority: $("#tPriority").value,
          dueDate: $("#tDue").value || null,
        };
        refresh();
        if (existing) {
          const t = TASKS.find(x => x.id === existing.id);
          Object.assign(t, data);
          t.status = $("#tStatus").value;
          save(K.tasks, TASKS);
          toast("Task updated.");
        } else {
          TASKS.push({ id: uid(), ...data, status: "todo", assignedBy: ME.id, createdAt: new Date().toISOString() });
          save(K.tasks, TASKS);
          toast("Task created and assigned.");
        }
        closeModal(); render();
      });
    });
  }

  /* ---------- Leave ---------- */
  function viewLeave() {
    const mine = LEAVES.filter(l => l.userId === ME.id).sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
    const adminSection = isAdmin() ? `
      <h3 class="section-title">All leave requests</h3>
      ${LEAVES.length ? `<div class="table-wrapper"><table>
        <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>${[...LEAVES].sort((a,b)=>new Date(b.appliedAt)-new Date(a.appliedAt)).map(l => {
          const u = getUser(l.userId);
          return `<tr>
            <td><strong>${esc(u ? u.name : "—")}</strong></td>
            <td>${esc(l.type)}</td>
            <td>${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}</td>
            <td>${l.days}</td>
            <td style="max-width:200px">${esc(l.reason)}</td>
            <td>${leaveBadge(l.status)}</td>
            <td><div class="row-actions">
              ${l.status === "pending" ? `<button class="btn btn-outline btn-sm" data-act="approve" data-id="${l.id}">Approve</button>
              <button class="btn btn-danger btn-sm" data-act="reject" data-id="${l.id}">Reject</button>` : ""}
            </div></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>` : `<div class="card card-pad empty"><div class="big">✈️</div>No leave requests in the system.</div>`}
    ` : "";

    return `
      <div class="page-head">
        <div><h2>Leave</h2><p>Apply for leave — a request email is prepared to ${esc(LEAVE_EMAIL)}.</p></div>
        <button class="btn btn-primary" id="applyLeaveBtn">＋ Apply for leave</button>
      </div>

      <div class="help-note">📧 When you submit a request, your email app opens with a pre-filled message to <strong>${esc(LEAVE_EMAIL)}</strong>. The request is also saved to your leave history below.</div>

      <h3 class="section-title">My leave history</h3>
      ${mine.length ? `<div class="table-wrapper"><table>
        <thead><tr><th>Applied</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
        <tbody>${mine.map(l => `<tr>
          <td>${fmtDate(l.appliedAt)}</td>
          <td>${esc(l.type)}</td>
          <td>${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}</td>
          <td>${l.days}</td>
          <td style="max-width:220px">${esc(l.reason)}</td>
          <td>${leaveBadge(l.status)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<div class="card card-pad empty"><div class="big">🌴</div>You haven't applied for any leave yet.</div>`}

      ${adminSection}
    `;
  }

  function leaveBadge(s) {
    if (s === "approved") return `<span class="badge green">Approved</span>`;
    if (s === "rejected") return `<span class="badge red">Rejected</span>`;
    return `<span class="badge yellow">Pending</span>`;
  }

  function leaveModal() {
    const todayStr = isoDate();
    openModal("Apply for leave", `
      <form id="leaveForm">
        <div class="form-grid">
          <label class="field"><span>Leave type *</span><select id="lType" required>
            <option>Annual Leave</option><option>Sick Leave</option><option>Casual Leave</option>
            <option>Unpaid Leave</option><option>Emergency Leave</option><option>Work From Home</option>
          </select></label>
          <label class="field"><span>&nbsp;</span><div class="field" style="gap:0"><span style="font-size:12px;color:var(--muted)">Sent to</span><strong style="color:var(--blue-deep)">${esc(LEAVE_EMAIL)}</strong></div></label>
          <label class="field"><span>Start date *</span><input type="date" id="lStart" required min="${todayStr}" value="${todayStr}"></label>
          <label class="field"><span>End date *</span><input type="date" id="lEnd" required min="${todayStr}" value="${todayStr}"></label>
          <label class="field full"><span>Reason *</span><textarea id="lReason" required maxlength="600" placeholder="Briefly describe your reason for leave..."></textarea></label>
        </div>
        <div id="leaveErr" class="form-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Submit &amp; open email</button>
        </div>
      </form>
    `, (body) => {
      body.querySelector("#leaveForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const type = $("#lType").value;
        const start = $("#lStart").value, end = $("#lEnd").value;
        const reason = $("#lReason").value.trim();
        const err = $("#leaveErr");
        if (new Date(end) < new Date(start)) { err.hidden = false; err.textContent = "End date cannot be before start date."; return; }
        if (!reason) { err.hidden = false; err.textContent = "Please provide a reason."; return; }
        const days = daysBetween(start, end);
        refresh();
        const rec = { id: uid(), userId: ME.id, type, startDate: start, endDate: end, days, reason, status: "pending", appliedAt: new Date().toISOString() };
        LEAVES.push(rec); save(K.leaves, LEAVES);

        // Build mailto
        const subject = `Leave Request — ${ME.name} (${type})`;
        const bodyTxt =
`Dear The Grow Vista Team,

I would like to request leave with the following details:

Employee: ${ME.name}
Email: ${ME.email}
Leave Type: ${type}
From: ${start}
To: ${end}
Total Days: ${days}

Reason:
${reason}

Kind regards,
${ME.name}`;
        const mailto = `mailto:${LEAVE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyTxt)}`;
        closeModal(); render();
        toast("Leave request saved. Opening your email app...", "good");
        window.location.href = mailto;
      });
    });
  }

  /* ---------- Users (admin) ---------- */
  function viewUsers() {
    return `
      <div class="page-head">
        <div><h2>Users</h2><p>Create and manage employee accounts and task-assignment permissions.</p></div>
        <button class="btn btn-primary" id="newUserBtn">＋ Add user</button>
      </div>
      <div class="toolbar">
        <div class="grow"><input class="search-input" id="userSearch" placeholder="🔍 Search by name, username or email..."></div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Employee</th><th>Username</th><th>Email</th><th>Role</th><th>Can assign tasks</th><th>Status</th><th></th></tr></thead>
          <tbody id="userTableBody">${userRows(USERS)}</tbody>
        </table>
      </div>
    `;
  }

  function userRows(list) {
    if (!list.length) return `<tr><td colspan="7"><div class="empty">No users found.</div></td></tr>`;
    return list.map(u => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px">
        <div class="avatar ${u.role==="admin"?"yellow":""}" style="width:34px;height:34px;font-size:13px">${esc(u.name.charAt(0).toUpperCase())}</div>
        <strong>${esc(u.name)}</strong></div></td>
      <td>${esc(u.username)}</td>
      <td>${esc(u.email)}</td>
      <td><span class="pill-role ${u.role}">${u.role}</span></td>
      <td>${u.role==="admin" ? `<span class="badge green">Always</span>` : (u.canAssignTasks ? `<span class="badge green">Yes</span>` : `<span class="badge gray">No</span>`)}</td>
      <td>${u.active===false ? `<span class="badge red">Inactive</span>` : `<span class="badge green">Active</span>`}</td>
      <td><div class="row-actions">
        <button class="btn btn-outline btn-sm" data-act="editUser" data-id="${u.id}">Edit</button>
        ${u.id !== ME.id ? `<button class="btn btn-danger btn-sm" data-act="delUser" data-id="${u.id}">Delete</button>` : ""}
      </div></td>
    </tr>`).join("");
  }

  function userModal(existing) {
    openModal(existing ? "Edit user" : "Add new user", `
      <form id="userForm">
        <div class="form-grid">
          <label class="field"><span>Full name *</span><input type="text" id="uName" required maxlength="60" value="${existing ? esc(existing.name) : ""}"></label>
          <label class="field"><span>Username *</span><input type="text" id="uUsername" required maxlength="30" value="${existing ? esc(existing.username) : ""}" ${existing ? "readonly" : ""}></label>
          <label class="field full"><span>Email *</span><input type="email" id="uEmail" required value="${existing ? esc(existing.email) : ""}"></label>
          <label class="field"><span>Role</span><select id="uRole">
            <option value="user" ${!existing||existing.role==="user"?"selected":""}>Member</option>
            <option value="admin" ${existing&&existing.role==="admin"?"selected":""}>Admin</option>
          </select></label>
          <label class="field"><span>Password ${existing ? "(leave blank to keep)" : "*"}</span><input type="text" id="uPass" ${existing?"":"required"} minlength="4" placeholder="${existing ? "••••••" : "min 4 characters"}"></label>
          <label class="field full" style="flex-direction:row;align-items:center;gap:10px;background:#F5F9FD;padding:12px;border-radius:11px;border:1px solid var(--line)">
            <input type="checkbox" id="uCanAssign" style="width:18px;height:18px" ${existing && existing.canAssignTasks ? "checked" : ""}>
            <span style="font-weight:600;color:var(--navy-2)">Allow this user to assign tasks to others</span>
          </label>
          ${existing ? `<label class="field full" style="flex-direction:row;align-items:center;gap:10px;background:#F5F9FD;padding:12px;border-radius:11px;border:1px solid var(--line)">
            <input type="checkbox" id="uActive" style="width:18px;height:18px" ${existing.active!==false?"checked":""}>
            <span style="font-weight:600;color:var(--navy-2)">Account active (can log in)</span>
          </label>` : ""}
        </div>
        <div id="userErr" class="form-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${existing ? "Save changes" : "Create user"}</button>
        </div>
      </form>
    `, (body) => {
      body.querySelector("#userForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const err = $("#userErr");
        const name = $("#uName").value.trim();
        const username = $("#uUsername").value.trim();
        const email = $("#uEmail").value.trim();
        const role = $("#uRole").value;
        const pass = $("#uPass").value;
        const canAssignTasks = $("#uCanAssign").checked;
        refresh();
        if (!existing && USERS.some(u => u.username.toLowerCase() === username.toLowerCase())) {
          err.hidden = false; err.textContent = "That username is already taken."; return;
        }
        if (existing) {
          const u = USERS.find(x => x.id === existing.id);
          u.name = name; u.email = email; u.role = role; u.canAssignTasks = canAssignTasks;
          u.active = $("#uActive").checked;
          if (pass) u.passHash = await hashPw(pass);
          save(K.users, USERS);
          toast("User updated.");
        } else {
          USERS.push({ id: uid(), name, username, email, passHash: await hashPw(pass), role, canAssignTasks, active: true, createdAt: new Date().toISOString() });
          save(K.users, USERS);
          toast("User created successfully.");
        }
        closeModal(); render();
      });
    });
  }

  /* ---------- Profile ---------- */
  function viewProfile() {
    const mine = ATT.filter(a => a.userId === ME.id);
    const totalSessions = mine.length;
    const totalHours = mine.reduce((s, a) => s + (durationHrs(a.signIn, a.signOut || new Date().toISOString()) || 0), 0);
    const myLeaves = LEAVES.filter(l => l.userId === ME.id);
    const myTasks = TASKS.filter(t => t.assignedTo === ME.id);
    const doneTasks = myTasks.filter(t => t.status === "done").length;

    return `
      <div class="page-head"><div><h2>My Profile</h2><p>Your account details and activity summary.</p></div></div>
      <div class="grid-2">
        <div class="card card-pad">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px">
            <div class="avatar ${ME.role==="admin"?"yellow":""}" style="width:64px;height:64px;font-size:26px;border-radius:18px">${esc(ME.name.charAt(0).toUpperCase())}</div>
            <div><div style="font-size:20px;font-weight:800;color:var(--navy)">${esc(ME.name)}</div>
            <span class="pill-role ${ME.role}">${ME.role}</span></div>
          </div>
          <div class="info-row"><span class="k">Username</span><span class="v">${esc(ME.username)}</span></div>
          <div class="info-row"><span class="k">Email</span><span class="v">${esc(ME.email)}</span></div>
          <div class="info-row"><span class="k">Task permission</span><span class="v">${ME.role==="admin"||ME.canAssignTasks ? "Can assign tasks" : "Standard member"}</span></div>
          <div class="info-row"><span class="k">Member since</span><span class="v">${fmtDate(ME.createdAt)}</span></div>
          <button class="btn btn-outline btn-block" id="changePwBtn" style="margin-top:18px">🔒 Change my password</button>
        </div>
        <div>
          <div class="card-grid" style="grid-template-columns:1fr 1fr">
            ${statCard("📅", totalSessions, "Total sessions", "rgba(91,147,214,.12)", "#E7F0FB")}
            ${statCard("⏱", fmtDur(totalHours), "Total hours logged", "rgba(230,197,22,.16)", "#FCF4D2")}
            ${statCard("✓", `${doneTasks}/${myTasks.length}`, "Tasks completed", "rgba(31,169,113,.12)", "#E7F7F0")}
            ${statCard("✈️", myLeaves.length, "Leave requests", "rgba(107,79,208,.12)", "#EEE9FB")}
          </div>
        </div>
      </div>
    `;
  }

  function changePwModal() {
    openModal("Change password", `
      <form id="pwForm">
        <label class="field"><span>Current password *</span><input type="password" id="pwCur" required></label>
        <label class="field" style="margin-top:12px"><span>New password *</span><input type="password" id="pwNew" required minlength="4"></label>
        <label class="field" style="margin-top:12px"><span>Confirm new password *</span><input type="password" id="pwConf" required></label>
        <div id="pwErr" class="form-error" hidden style="margin-top:12px"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Update password</button>
        </div>
      </form>
    `, (body) => {
      body.querySelector("#pwForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const err = $("#pwErr");
        const cur = await hashPw($("#pwCur").value);
        refresh(); const u = getUser(ME.id);
        if (cur !== u.passHash) { err.hidden = false; err.textContent = "Current password is incorrect."; return; }
        if ($("#pwNew").value !== $("#pwConf").value) { err.hidden = false; err.textContent = "New passwords do not match."; return; }
        u.passHash = await hashPw($("#pwNew").value);
        save(K.users, USERS);
        closeModal(); toast("Password updated successfully.");
      });
    });
  }

  function viewNoAccess() {
    return `<div class="card card-pad empty"><div class="big">🔒</div>You don't have permission to view this page.</div>`;
  }

  /* ============================================================
     EVENT BINDING
     ============================================================ */
  function bindViewEvents() {
    // Dashboard clock buttons
    const dci = $("#dashClockIn"); if (dci) dci.onclick = () => { clockIn(ME.id); toast("Clocked in. Have a great shift!"); render(); };
    const dco = $("#dashClockOut"); if (dco) dco.onclick = () => { clockOut(ME.id); toast("Clocked out for now."); render(); };
    const aci = $("#attClockIn"); if (aci) aci.onclick = () => { clockIn(ME.id); toast("Clocked in."); render(); };
    const aco = $("#attClockOut"); if (aco) aco.onclick = () => { clockOut(ME.id); toast("Clocked out."); render(); };

    // Tasks
    const nt = $("#newTaskBtn"); if (nt) nt.onclick = () => taskModal(null);
    const taskTabs = $("#taskTabs");
    if (taskTabs) {
      taskTabs.onclick = (e) => {
        const tab = e.target.closest(".tab"); if (!tab) return;
        $$(".tab", taskTabs).forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const mode = tab.dataset.tab;
        let list;
        if (mode === "mine") list = TASKS.filter(t => t.assignedTo === ME.id);
        else if (mode === "byme") list = TASKS.filter(t => t.assignedBy === ME.id && t.assignedTo !== ME.id);
        else list = TASKS;
        $("#taskPanel").innerHTML = renderTaskList(list, mode);
      };
    }
    const taskPanel = $("#taskPanel") || $("#content");
    // delegate task actions on content
    $("#content").addEventListener("click", taskDelegate);

    // Leave
    const al = $("#applyLeaveBtn"); if (al) al.onclick = leaveModal;

    // Users
    const nu = $("#newUserBtn"); if (nu) nu.onclick = () => userModal(null);
    const us = $("#userSearch");
    if (us) us.oninput = () => {
      const q = us.value.toLowerCase();
      const filtered = USERS.filter(u => (u.name + u.username + u.email).toLowerCase().includes(q));
      $("#userTableBody").innerHTML = userRows(filtered);
    };

    // Profile
    const cpw = $("#changePwBtn"); if (cpw) cpw.onclick = changePwModal;
  }

  // Single delegated handler for dynamic actions
  function taskDelegate(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act, id = btn.dataset.id;
    refresh();

    if (act === "toggle" || act === "advance") {
      const t = TASKS.find(x => x.id === id); if (!t) return;
      const canToggle = t.assignedTo === ME.id || isAdmin() || t.assignedBy === ME.id;
      if (!canToggle) return;
      if (act === "toggle") t.status = t.status === "done" ? "todo" : "done";
      else t.status = t.status === "todo" ? "in_progress" : "done";
      save(K.tasks, TASKS); render();
      toast(t.status === "done" ? "Task completed! 🎉" : "Task updated.");
    } else if (act === "edit") {
      const t = TASKS.find(x => x.id === id); if (t) taskModal(t);
    } else if (act === "delete") {
      const t = TASKS.find(x => x.id === id); if (!t) return;
      confirmModal("Delete task?", `Are you sure you want to delete "<strong>${esc(t.title)}</strong>"? This cannot be undone.`, () => {
        TASKS = TASKS.filter(x => x.id !== id); save(K.tasks, TASKS); render(); toast("Task deleted.", "warn");
      });
    } else if (act === "editUser") {
      const u = getUser(id); if (u) userModal(u);
    } else if (act === "delUser") {
      const u = getUser(id); if (!u) return;
      confirmModal("Delete user?", `Delete <strong>${esc(u.name)}</strong>? Their attendance, tasks and leave records remain but they can no longer log in.`, () => {
        USERS = USERS.filter(x => x.id !== id); save(K.users, USERS); render(); toast("User deleted.", "warn");
      });
    } else if (act === "approve" || act === "reject") {
      const l = LEAVES.find(x => x.id === id); if (!l) return;
      l.status = act === "approve" ? "approved" : "rejected";
      save(K.leaves, LEAVES); render();
      toast(`Leave ${l.status}.`, act === "approve" ? "good" : "warn");
    }
  }

  function confirmModal(title, msg, onYes) {
    openModal(title, `
      <p style="color:var(--navy-2);font-size:15px;line-height:1.6">${msg}</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" data-close>Cancel</button>
        <button type="button" class="btn btn-danger" id="confirmYes">Yes, proceed</button>
      </div>
    `, (body) => { body.querySelector("#confirmYes").onclick = () => { onYes(); closeModal(); }; });
  }

  /* ============================================================
     SHELL / NAV
     ============================================================ */
  function showLogin() {
    $("#appView").hidden = true;
    $("#loginView").hidden = false;
    $("#loginUser").value = ""; $("#loginPass").value = "";
    $("#loginError").hidden = true;
    // show default admin hint only if the default admin still exists untouched
    refresh();
    const admin = USERS.find(u => u.username === "admin");
    $("#loginHint").innerHTML = admin
      ? `First time here? Default admin — <strong>admin</strong> / <strong>admin123</strong> (change it after login).`
      : "";
  }

  function showApp() {
    $("#loginView").hidden = true;
    $("#appView").hidden = false;
    currentView = "dashboard";
    render();
  }

  function bindGlobal() {
    // Login form
    $("#loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#loginError");
      const res = await doLogin($("#loginUser").value.trim(), $("#loginPass").value);
      if (!res.ok) { err.hidden = false; err.textContent = res.msg; return; }
      ME = res.user;
      showApp();
      toast(`Welcome, ${ME.name}! You're clocked in.`, "good");
    });

    // Password toggles
    $$(".pw-toggle").forEach(btn => btn.onclick = () => {
      const inp = document.getElementById(btn.dataset.target);
      inp.type = inp.type === "password" ? "text" : "password";
    });

    // Nav
    $("#mainNav").addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item"); if (!item) return;
      currentView = item.dataset.view;
      render();
      closeSidebar();
    });

    // Logout
    $("#logoutBtn").onclick = () => confirmModal("Clock out & log out?", "You'll be clocked out of your current shift and returned to the login screen.", doLogout);

    // Modal close
    $("#modalClose").onclick = closeModal;
    $("#modalOverlay").addEventListener("click", (e) => {
      if (e.target === $("#modalOverlay")) closeModal();
      if (e.target.closest("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    // Sidebar mobile
    $("#menuBtn").onclick = openSidebar;
    $("#sidebarBackdrop").onclick = closeSidebar;
  }

  function openSidebar() { $("#sidebar").classList.add("open"); $("#sidebarBackdrop").classList.add("show"); }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarBackdrop").classList.remove("show"); }

  /* ---------- Live clock ---------- */
  function tickClock() {
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const lc = $("#liveClock"); if (lc) lc.textContent = t;
    const hc = $("#heroClock"); if (hc) hc.textContent = t;
  }

  /* ============================================================
     INIT
     ============================================================ */
  async function init() {
    await seed();
    refresh();
    $("#yearNow").textContent = new Date().getFullYear();
    bindGlobal();
    tickClock(); setInterval(tickClock, 1000);

    const sessionId = load(K.session, null);
    ME = getUser(sessionId);
    if (ME && ME.active !== false) showApp();
    else { localStorage.removeItem(K.session); showLogin(); }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
