(() => {
  const STORAGE_KEY = "kathy-health-v1";

  const defaultState = () => ({
    onboarded: false,
    profileName: "Kathy",
    meds: [],
    doses: [], // { id, medId, date, timeSlot, status: taken|skipped, at }
    symptoms: [],
    vitals: [],
    appointments: [],
    providers: [],
    doctorNotes: "",
    remindersEnabled: false,
  });

  let state = load();
  let currentPanel = "today";
  let sheetMode = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return { ...defaultState(), ...JSON.parse(raw) };
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const [y, m, day] = iso.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(hhmm) {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function openSheet(title, bodyHtml, mode) {
    sheetMode = mode;
    $("#sheet-title").textContent = title;
    $("#sheet-body").innerHTML = bodyHtml;
    $("#sheet").hidden = false;
  }

  function closeSheet() {
    $("#sheet").hidden = true;
    sheetMode = null;
  }

  function showApp() {
    $("#view-welcome").hidden = true;
    $("#topbar").hidden = false;
    $("#main").hidden = false;
    $("#tabbar").hidden = false;
    navigate(currentPanel);
  }

  function showWelcome() {
    $("#view-welcome").hidden = false;
    $("#topbar").hidden = true;
    $("#main").hidden = true;
    $("#tabbar").hidden = true;
  }

  function navigate(panel) {
    currentPanel = panel;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav === panel));
    $$(".panel-view").forEach((v) => {
      v.hidden = v.dataset.panel !== panel;
    });
    renderPanel(panel);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function todaysMedSlots() {
    const date = todayISO();
    const slots = [];
    for (const med of state.meds) {
      if (!med.active) continue;
      for (const time of med.times || []) {
        const dose = state.doses.find(
          (d) => d.medId === med.id && d.date === date && d.timeSlot === time
        );
        slots.push({
          key: `${med.id}:${time}`,
          med,
          time,
          status: dose ? dose.status : "pending",
          doseId: dose ? dose.id : null,
        });
      }
    }
    slots.sort((a, b) => a.time.localeCompare(b.time));
    return slots;
  }

  function setDoseStatus(medId, timeSlot, status) {
    const date = todayISO();
    const existing = state.doses.find(
      (d) => d.medId === medId && d.date === date && d.timeSlot === timeSlot
    );
    if (existing) {
      existing.status = status;
      existing.at = new Date().toISOString();
    } else {
      state.doses.push({
        id: uid(),
        medId,
        date,
        timeSlot,
        status,
        at: new Date().toISOString(),
      });
    }
    // prune old dose logs (>90 days)
    const cutoff = Date.now() - 90 * 86400000;
    state.doses = state.doses.filter((d) => new Date(d.date).getTime() > cutoff);
    save();
  }

  function nextAppointment() {
    const today = todayISO();
    return state.appointments
      .filter((a) => a.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  }

  function latestVital(type) {
    return state.vitals
      .filter((v) => v.type === type)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
  }

  function renderPanel(panel) {
    const map = {
      today: renderToday,
      meds: renderMeds,
      feel: renderFeel,
      numbers: renderNumbers,
      care: renderCare,
      settings: renderSettings,
    };
    map[panel]?.();
  }

  function renderToday() {
    const el = $("#view-today");
    const slots = todaysMedSlots();
    const pending = slots.filter((s) => s.status === "pending");
    const next = nextAppointment();
    const recentFeel = [...state.symptoms].sort((a, b) => b.at.localeCompare(a.at))[0];

    el.innerHTML = `
      <div class="panel-head">
        <div class="greeting">${greeting()}, ${escapeHtml(state.profileName)}</div>
        <h1>Today</h1>
        <p>${formatDate(todayISO())} · ${pending.length ? `${pending.length} med${pending.length === 1 ? "" : "s"} still due` : slots.length ? "All meds logged" : "No meds scheduled"}</p>
      </div>
      <div class="stack">
        <div class="section-label">Medications</div>
        ${
          slots.length
            ? slots
                .map(
                  (s) => `
            <button type="button" class="item ${s.status !== "pending" ? "done" : ""}" data-action="toggle-dose" data-med="${s.med.id}" data-time="${s.time}" data-status="${s.status}">
              <span class="item-check" aria-hidden="true">${s.status === "taken" ? "✓" : s.status === "skipped" ? "–" : ""}</span>
              <span class="item-body">
                <p class="item-title">${escapeHtml(s.med.name)}</p>
                <p class="item-meta">${formatTime(s.time)}${s.med.dose ? ` · ${escapeHtml(s.med.dose)}` : ""}${s.status === "skipped" ? " · skipped" : ""}</p>
              </span>
            </button>`
                )
                .join("")
            : `<div class="empty"><strong>No meds yet</strong>Add a medication to see today’s checklist.</div>`
        }
        <div class="section-label">Quick</div>
        <div class="quick-grid">
          <button type="button" class="quick-btn" data-action="log-feel"><span>How I feel</span><small>Log a symptom</small></button>
          <button type="button" class="quick-btn" data-action="log-vital"><span>Numbers</span><small>BP, weight, more</small></button>
        </div>
        <div class="section-label">Up next</div>
        ${
          next
            ? `<button type="button" class="item" data-action="goto-care">
                <span class="item-body">
                  <p class="item-title">${escapeHtml(next.title)}</p>
                  <p class="item-meta">${formatDate(next.date)}${next.time ? ` · ${formatTime(next.time)}` : ""}${next.place ? ` · ${escapeHtml(next.place)}` : ""}</p>
                </span>
                <span class="pill">Care</span>
              </button>`
            : `<div class="empty"><strong>No upcoming visits</strong>Add an appointment under Care.</div>`
        }
        ${
          recentFeel
            ? `<p class="muted">Last feel log: ${escapeHtml(recentFeel.label)} · severity ${recentFeel.severity}/10 · ${relTime(recentFeel.at)}</p>`
            : ""
        }
      </div>
    `;
  }

  function renderMeds() {
    const el = $("#view-meds");
    const meds = [...state.meds].sort((a, b) => a.name.localeCompare(b.name));
    el.innerHTML = `
      <div class="panel-head">
        <h1>Meds</h1>
        <p>Schedule, doses, and today’s taken / skipped log.</p>
      </div>
      <div class="stack">
        <div class="row-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="add-med">Add medication</button>
        </div>
        ${
          meds.length
            ? meds
                .map(
                  (m) => `
            <button type="button" class="item" data-action="edit-med" data-id="${m.id}">
              <span class="item-body">
                <p class="item-title">${escapeHtml(m.name)}${m.active ? "" : " <span class=\"pill warn\">paused</span>"}</p>
                <p class="item-meta">${escapeHtml(m.dose || "Dose not set")} · ${(m.times || []).map(formatTime).join(", ") || "No times"}</p>
                ${m.notes ? `<p class="item-meta">${escapeHtml(m.notes)}</p>` : ""}
              </span>
            </button>`
                )
                .join("")
            : `<div class="empty"><strong>Start your list</strong>Add prescriptions and vitamins Kathy takes.</div>`
        }
      </div>
    `;
  }

  function renderFeel() {
    const el = $("#view-feel");
    const list = [...state.symptoms].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
    el.innerHTML = `
      <div class="panel-head">
        <h1>Feel</h1>
        <p>Capture how the day feels — for you and for the doctor.</p>
      </div>
      <div class="stack">
        <div class="row-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="log-feel">Log how I feel</button>
        </div>
        ${
          list.length
            ? list
                .map(
                  (s) => `
            <div class="item" style="cursor:default">
              <span class="item-body">
                <p class="item-title">${escapeHtml(s.label)} <span class="pill">${s.severity}/10</span></p>
                <p class="item-meta">${relTime(s.at)}${s.note ? ` · ${escapeHtml(s.note)}` : ""}</p>
              </span>
            </div>`
                )
                .join("")
            : `<div class="empty"><strong>Nothing logged yet</strong>Tap “Log how I feel” when something stands out.</div>`
        }
      </div>
    `;
  }

  function renderNumbers() {
    const el = $("#view-numbers");
    const types = [
      { type: "bp", label: "Blood pressure", unit: "" },
      { type: "weight", label: "Weight", unit: "lb" },
      { type: "glucose", label: "Glucose", unit: "mg/dL" },
      { type: "hr", label: "Heart rate", unit: "bpm" },
    ];
    const recent = [...state.vitals].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
    el.innerHTML = `
      <div class="panel-head">
        <h1>Numbers</h1>
        <p>Blood pressure, weight, glucose, and heart rate.</p>
      </div>
      <div class="stack">
        <div class="row-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="log-vital">Add reading</button>
        </div>
        <div class="section-label">Latest</div>
        <div class="item" style="cursor:default;display:block">
          ${types
            .map((t) => {
              const v = latestVital(t.type);
              return `<div class="stat-line"><span>${t.label}</span><strong>${v ? formatVital(v) : "—"}</strong></div>`;
            })
            .join("")}
        </div>
        <div class="section-label">History</div>
        ${
          recent.length
            ? recent
                .map(
                  (v) => `
            <div class="item" style="cursor:default">
              <span class="item-body">
                <p class="item-title">${escapeHtml(labelForVital(v.type))}</p>
                <p class="item-meta">${formatVital(v)} · ${relTime(v.at)}</p>
              </span>
            </div>`
                )
                .join("")
            : `<div class="empty"><strong>No readings yet</strong>Add a blood pressure or weight when you measure.</div>`
        }
      </div>
    `;
  }

  function renderCare() {
    const el = $("#view-care");
    const appts = [...state.appointments].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    const providers = state.providers;
    el.innerHTML = `
      <div class="panel-head">
        <h1>Care</h1>
        <p>Appointments, people on the care team, and notes for next visit.</p>
      </div>
      <div class="stack">
        <div class="row-actions">
          <button type="button" class="btn btn-primary btn-sm" data-action="add-appt">Add appointment</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="add-provider">Add provider</button>
        </div>
        <div class="section-label">Appointments</div>
        ${
          appts.length
            ? appts
                .map(
                  (a) => `
            <button type="button" class="item" data-action="edit-appt" data-id="${a.id}">
              <span class="item-body">
                <p class="item-title">${escapeHtml(a.title)}</p>
                <p class="item-meta">${formatDate(a.date)}${a.time ? ` · ${formatTime(a.time)}` : ""}${a.place ? ` · ${escapeHtml(a.place)}` : ""}</p>
              </span>
            </button>`
                )
                .join("")
            : `<div class="empty"><strong>No appointments</strong>Keep clinic visits here so Today can remind you.</div>`
        }
        <div class="section-label">Care team</div>
        ${
          providers.length
            ? providers
                .map(
                  (p) => `
            <button type="button" class="item" data-action="edit-provider" data-id="${p.id}">
              <span class="item-body">
                <p class="item-title">${escapeHtml(p.name)}</p>
                <p class="item-meta">${escapeHtml(p.role || "Provider")}${p.phone ? ` · ${escapeHtml(p.phone)}` : ""}</p>
              </span>
            </button>`
                )
                .join("")
            : `<div class="empty"><strong>No providers yet</strong>Save doctor or clinic contacts.</div>`
        }
        <div class="section-label">For the doctor</div>
        <label class="field">Questions & notes
          <textarea id="doctor-notes" placeholder="Symptoms to mention, questions to ask…">${escapeHtml(state.doctorNotes || "")}</textarea>
        </label>
        <button type="button" class="btn btn-secondary btn-sm" data-action="save-notes">Save notes</button>
      </div>
    `;
  }

  function renderSettings() {
    const el = $("#view-settings");
    el.innerHTML = `
      <div class="panel-head">
        <h1>Settings</h1>
        <p>Name, privacy, and data on this iPhone.</p>
      </div>
      <div class="stack">
        <label class="field">Display name
          <input id="profile-name" value="${escapeHtml(state.profileName)}" maxlength="40" />
        </label>
        <button type="button" class="btn btn-secondary btn-sm" data-action="save-profile">Save name</button>
        <div class="section-label">Privacy</div>
        <p class="muted">Kathy Health keeps everything on this device. There is no account and no cloud backup in this version. Clearing browser or app data removes records.</p>
        <p><a class="linkish" href="./docs/privacy.html">Privacy policy</a> · <a class="linkish" href="./docs/disclaimer.html">Health disclaimer</a></p>
        <div class="section-label">Data</div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="export-data">Export JSON backup</button>
        <button type="button" class="btn btn-danger btn-sm" data-action="reset-data">Erase all data</button>
        <p class="muted">Version 1.0.0 · Kathy Health</p>
      </div>
    `;
  }

  function medForm(med) {
    const m = med || { name: "", dose: "", times: ["08:00"], notes: "", active: true };
    const times = (m.times && m.times.length ? m.times : ["08:00"]).join(", ");
    return `
      <form class="form" id="med-form" data-id="${m.id || ""}">
        <label class="field">Name
          <input name="name" required maxlength="80" value="${escapeHtml(m.name)}" placeholder="e.g. Metformin" />
        </label>
        <label class="field">Dose
          <input name="dose" maxlength="60" value="${escapeHtml(m.dose || "")}" placeholder="e.g. 500 mg" />
        </label>
        <label class="field">Times (comma-separated, 24h or HH:MM)
          <input name="times" required value="${escapeHtml(times)}" placeholder="08:00, 20:00" />
        </label>
        <label class="field">Notes / refill
          <textarea name="notes" maxlength="240" placeholder="Pharmacy, refill date…">${escapeHtml(m.notes || "")}</textarea>
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:10px">
          <input type="checkbox" name="active" ${m.active !== false ? "checked" : ""} style="width:auto" />
          Active on Today checklist
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save medication</button>
        ${m.id ? `<button type="button" class="btn btn-ghost btn-block" data-action="delete-med" data-id="${m.id}">Delete</button>` : ""}
      </form>
    `;
  }

  function feelForm() {
    const chips = ["Pain", "Fatigue", "Mood", "Sleep", "Dizziness", "Nausea", "Other"];
    return `
      <form class="form" id="feel-form">
        <div class="chip-row" id="feel-chips">
          ${chips.map((c, i) => `<button type="button" class="chip ${i === 0 ? "on" : ""}" data-chip="${c}">${c}</button>`).join("")}
        </div>
        <label class="field">Label
          <input name="label" id="feel-label" required maxlength="60" value="Pain" />
        </label>
        <div class="severity">
          <span>Severity · <span class="severity-val" id="sev-val">5</span>/10</span>
          <input type="range" name="severity" id="feel-sev" min="1" max="10" value="5" />
        </div>
        <label class="field">Note
          <textarea name="note" maxlength="240" placeholder="Optional detail"></textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save</button>
      </form>
    `;
  }

  function vitalForm() {
    return `
      <form class="form" id="vital-form">
        <label class="field">Type
          <select name="type">
            <option value="bp">Blood pressure</option>
            <option value="weight">Weight (lb)</option>
            <option value="glucose">Glucose (mg/dL)</option>
            <option value="hr">Heart rate (bpm)</option>
          </select>
        </label>
        <div class="field-row" id="bp-fields">
          <label class="field">Systolic
            <input name="sys" type="number" inputmode="numeric" min="60" max="250" placeholder="120" />
          </label>
          <label class="field">Diastolic
            <input name="dia" type="number" inputmode="numeric" min="30" max="150" placeholder="80" />
          </label>
        </div>
        <label class="field" id="single-field" hidden>Value
          <input name="value" type="number" inputmode="decimal" step="0.1" />
        </label>
        <label class="field">Note
          <input name="note" maxlength="120" placeholder="Optional" />
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save reading</button>
      </form>
    `;
  }

  function apptForm(appt) {
    const a = appt || { title: "", date: todayISO(), time: "09:00", place: "", note: "" };
    return `
      <form class="form" id="appt-form" data-id="${a.id || ""}">
        <label class="field">Title
          <input name="title" required maxlength="80" value="${escapeHtml(a.title)}" placeholder="Dr. visit" />
        </label>
        <div class="field-row">
          <label class="field">Date
            <input name="date" type="date" required value="${escapeHtml(a.date)}" />
          </label>
          <label class="field">Time
            <input name="time" type="time" value="${escapeHtml(a.time || "")}" />
          </label>
        </div>
        <label class="field">Place
          <input name="place" maxlength="100" value="${escapeHtml(a.place || "")}" />
        </label>
        <label class="field">Note
          <textarea name="note" maxlength="240">${escapeHtml(a.note || "")}</textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save</button>
        ${a.id ? `<button type="button" class="btn btn-ghost btn-block" data-action="delete-appt" data-id="${a.id}">Delete</button>` : ""}
      </form>
    `;
  }

  function providerForm(p) {
    const x = p || { name: "", role: "", phone: "", note: "" };
    return `
      <form class="form" id="provider-form" data-id="${x.id || ""}">
        <label class="field">Name
          <input name="name" required maxlength="80" value="${escapeHtml(x.name)}" />
        </label>
        <label class="field">Role
          <input name="role" maxlength="60" value="${escapeHtml(x.role || "")}" placeholder="Primary care, cardiology…" />
        </label>
        <label class="field">Phone
          <input name="phone" maxlength="40" value="${escapeHtml(x.phone || "")}" inputmode="tel" />
        </label>
        <label class="field">Note
          <textarea name="note" maxlength="200">${escapeHtml(x.note || "")}</textarea>
        </label>
        <button type="submit" class="btn btn-primary btn-block">Save</button>
        ${x.id ? `<button type="button" class="btn btn-ghost btn-block" data-action="delete-provider" data-id="${x.id}">Delete</button>` : ""}
      </form>
    `;
  }

  function parseTimes(raw) {
    return raw
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map(normalizeTime)
      .filter(Boolean);
  }

  function normalizeTime(t) {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  function labelForVital(type) {
    return { bp: "Blood pressure", weight: "Weight", glucose: "Glucose", hr: "Heart rate" }[type] || type;
  }

  function formatVital(v) {
    if (v.type === "bp") return `${v.sys}/${v.dia}`;
    if (v.type === "weight") return `${v.value} lb`;
    if (v.type === "glucose") return `${v.value} mg/dL`;
    if (v.type === "hr") return `${v.value} bpm`;
    return String(v.value ?? "");
  }

  function relTime(iso) {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cycleDose(medId, time, status) {
    const next = status === "pending" ? "taken" : status === "taken" ? "skipped" : "pending";
    if (next === "pending") {
      state.doses = state.doses.filter(
        (d) => !(d.medId === medId && d.date === todayISO() && d.timeSlot === time)
      );
      save();
    } else {
      setDoseStatus(medId, time, next);
    }
    toast(next === "taken" ? "Marked taken" : next === "skipped" ? "Marked skipped" : "Cleared");
    renderPanel(currentPanel);
  }

  // Events
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action], [data-nav], [data-close-sheet], [data-chip]");
    if (!t) return;

    if (t.matches("[data-close-sheet]")) {
      closeSheet();
      return;
    }

    if (t.dataset.nav) {
      navigate(t.dataset.nav);
      return;
    }

    if (t.dataset.chip) {
      $$("#feel-chips .chip").forEach((c) => c.classList.toggle("on", c === t));
      const label = $("#feel-label");
      if (label) label.value = t.dataset.chip === "Other" ? "" : t.dataset.chip;
      if (t.dataset.chip === "Other" && label) label.focus();
      return;
    }

    const action = t.dataset.action;
    if (!action) return;

    if (action === "toggle-dose") {
      cycleDose(t.dataset.med, t.dataset.time, t.dataset.status);
    } else if (action === "add-med") {
      openSheet("Add medication", medForm(), "med");
    } else if (action === "edit-med") {
      const med = state.meds.find((m) => m.id === t.dataset.id);
      openSheet("Edit medication", medForm(med), "med");
    } else if (action === "delete-med") {
      if (confirm("Delete this medication?")) {
        state.meds = state.meds.filter((m) => m.id !== t.dataset.id);
        save();
        closeSheet();
        toast("Medication removed");
        renderPanel("meds");
      }
    } else if (action === "log-feel") {
      openSheet("How I feel", feelForm(), "feel");
      const sev = $("#feel-sev");
      const val = $("#sev-val");
      sev?.addEventListener("input", () => {
        val.textContent = sev.value;
      });
    } else if (action === "log-vital") {
      openSheet("Add reading", vitalForm(), "vital");
      const type = $("select[name=type]");
      const syncVitalFields = () => {
        const bp = type.value === "bp";
        $("#bp-fields").hidden = !bp;
        $("#single-field").hidden = bp;
      };
      type?.addEventListener("change", syncVitalFields);
      syncVitalFields();
    } else if (action === "add-appt") {
      openSheet("Add appointment", apptForm(), "appt");
    } else if (action === "edit-appt") {
      const a = state.appointments.find((x) => x.id === t.dataset.id);
      openSheet("Edit appointment", apptForm(a), "appt");
    } else if (action === "delete-appt") {
      if (confirm("Delete this appointment?")) {
        state.appointments = state.appointments.filter((a) => a.id !== t.dataset.id);
        save();
        closeSheet();
        renderPanel("care");
      }
    } else if (action === "add-provider") {
      openSheet("Add provider", providerForm(), "provider");
    } else if (action === "edit-provider") {
      const p = state.providers.find((x) => x.id === t.dataset.id);
      openSheet("Edit provider", providerForm(p), "provider");
    } else if (action === "delete-provider") {
      if (confirm("Delete this provider?")) {
        state.providers = state.providers.filter((p) => p.id !== t.dataset.id);
        save();
        closeSheet();
        renderPanel("care");
      }
    } else if (action === "goto-care") {
      navigate("care");
    } else if (action === "save-notes") {
      state.doctorNotes = $("#doctor-notes")?.value || "";
      save();
      toast("Notes saved");
    } else if (action === "save-profile") {
      state.profileName = ($("#profile-name")?.value || "Kathy").trim() || "Kathy";
      save();
      toast("Name saved");
    } else if (action === "export-data") {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kathy-health-backup-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Backup ready");
    } else if (action === "reset-data") {
      if (confirm("Erase all Kathy Health data on this device?")) {
        state = defaultState();
        state.onboarded = true;
        save();
        toast("Data erased");
        navigate("today");
      }
    }
  });

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    e.preventDefault();

    if (form.id === "med-form") {
      const fd = new FormData(form);
      const times = parseTimes(String(fd.get("times") || ""));
      if (!times.length) {
        toast("Add at least one valid time");
        return;
      }
      const payload = {
        name: String(fd.get("name") || "").trim(),
        dose: String(fd.get("dose") || "").trim(),
        times,
        notes: String(fd.get("notes") || "").trim(),
        active: form.querySelector('[name="active"]').checked,
      };
      const id = form.dataset.id;
      if (id) {
        const med = state.meds.find((m) => m.id === id);
        Object.assign(med, payload);
      } else {
        state.meds.push({ id: uid(), ...payload });
      }
      save();
      closeSheet();
      toast("Medication saved");
      navigate(currentPanel === "today" ? "today" : "meds");
    }

    if (form.id === "feel-form") {
      const fd = new FormData(form);
      state.symptoms.unshift({
        id: uid(),
        label: String(fd.get("label") || "").trim(),
        severity: Number(fd.get("severity") || 5),
        note: String(fd.get("note") || "").trim(),
        at: new Date().toISOString(),
      });
      state.symptoms = state.symptoms.slice(0, 200);
      save();
      closeSheet();
      toast("Feel log saved");
      if (currentPanel === "feel" || currentPanel === "today") renderPanel(currentPanel);
      else navigate("feel");
    }

    if (form.id === "vital-form") {
      const fd = new FormData(form);
      const type = String(fd.get("type"));
      const entry = {
        id: uid(),
        type,
        note: String(fd.get("note") || "").trim(),
        at: new Date().toISOString(),
      };
      if (type === "bp") {
        entry.sys = Number(fd.get("sys"));
        entry.dia = Number(fd.get("dia"));
        if (!entry.sys || !entry.dia) {
          toast("Enter both numbers");
          return;
        }
      } else {
        entry.value = Number(fd.get("value"));
        if (!entry.value) {
          toast("Enter a value");
          return;
        }
      }
      state.vitals.unshift(entry);
      state.vitals = state.vitals.slice(0, 300);
      save();
      closeSheet();
      toast("Reading saved");
      navigate("numbers");
    }

    if (form.id === "appt-form") {
      const fd = new FormData(form);
      const payload = {
        title: String(fd.get("title") || "").trim(),
        date: String(fd.get("date") || ""),
        time: String(fd.get("time") || ""),
        place: String(fd.get("place") || "").trim(),
        note: String(fd.get("note") || "").trim(),
      };
      const id = form.dataset.id;
      if (id) Object.assign(state.appointments.find((a) => a.id === id), payload);
      else state.appointments.push({ id: uid(), ...payload });
      save();
      closeSheet();
      toast("Appointment saved");
      navigate("care");
    }

    if (form.id === "provider-form") {
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get("name") || "").trim(),
        role: String(fd.get("role") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        note: String(fd.get("note") || "").trim(),
      };
      const id = form.dataset.id;
      if (id) Object.assign(state.providers.find((p) => p.id === id), payload);
      else state.providers.push({ id: uid(), ...payload });
      save();
      closeSheet();
      toast("Provider saved");
      navigate("care");
    }
  });

  $("#btn-start")?.addEventListener("click", () => {
    state.onboarded = true;
    save();
    showApp();
  });

  $("#btn-settings")?.addEventListener("click", () => navigate("settings"));

  window.addEventListener("scroll", () => {
    $("#topbar")?.classList.toggle("scrolled", window.scrollY > 4);
  }, { passive: true });

  // Seed a gentle starter if empty after onboard — only when meds empty and user just started? Skip auto seed.
  // Expose for tests
  window.KathyHealth = {
    getState: () => structuredClone(state),
    setState: (s) => {
      state = { ...defaultState(), ...s };
      save();
    },
    reset: () => {
      state = defaultState();
      save();
    },
    todaysMedSlots,
    parseTimes,
    normalizeTime,
  };

  if (state.onboarded) showApp();
  else showWelcome();
})();
