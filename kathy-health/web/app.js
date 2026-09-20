(function () {
  'use strict';

  const STORAGE_KEY = 'kathy_health_v1';
  const VERSION = '1.0.0';

  const defaultState = () => ({
    version: VERSION,
    onboarded: false,
    profileName: 'Kathy',
    meds: [],
    doses: [],
    symptoms: [],
    vitals: [],
    appointments: [],
    contacts: [],
    questions: [],
    importedNotes: []
  });

  let state = load();
  let route = 'today';
  let modal = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return window.KathyNotesImport.uid(prefix);
  }

  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    if (!iso) return 'Date TBD';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dueMedsForToday() {
    const day = todayISO();
    const active = state.meds.filter((m) => m.active !== false);
    const items = [];
    active.forEach((med) => {
      (med.times || ['08:00']).forEach((time) => {
        const taken = state.doses.find((d) => d.medId === med.id && d.date === day && d.time === time && d.status === 'taken');
        const skipped = state.doses.find((d) => d.medId === med.id && d.date === day && d.time === time && d.status === 'skipped');
        items.push({ med, time, status: taken ? 'taken' : skipped ? 'skipped' : 'due' });
      });
    });
    items.sort((a, b) => a.time.localeCompare(b.time));
    return items;
  }

  function nextAppointment() {
    const day = todayISO();
    return state.appointments
      .filter((a) => !a.when || a.when >= day)
      .sort((a, b) => String(a.when || '9999').localeCompare(String(b.when || '9999')))[0];
  }

  function markDose(medId, time, status) {
    const date = todayISO();
    state.doses = state.doses.filter((d) => !(d.medId === medId && d.date === date && d.time === time));
    state.doses.push({ id: uid('dose'), medId, date, time, status, at: new Date().toISOString() });
    save();
    render();
    toast(status === 'taken' ? 'Marked taken' : 'Marked skipped');
  }

  function openModal(title, bodyHtml, onSave) {
    modal = { title, bodyHtml, onSave };
    render();
  }

  function closeModal() {
    modal = null;
    render();
  }

  function renderWelcome() {
    return `
      <section class="hero-screen">
        <div class="hero-copy">
          <p class="hero-kicker">Personal care companion</p>
          <h1>Kathy’s<br>Health</h1>
          <p>Medications, symptoms, vitals, and visit notes — kept on this phone.</p>
        </div>
        <div class="hero-panel">
          <label>
            <input type="checkbox" id="acceptDisclaimer">
            <span>I understand this app organizes personal health notes. It does not diagnose, treat, or replace professional medical care. In an emergency call local emergency services.</span>
          </label>
        </div>
        <div class="hero-actions">
          <button type="button" id="btnStart" disabled>Start Kathy’s Health</button>
          <button type="button" class="secondary" id="btnImportFirst">I have notes to paste</button>
        </div>
      </section>
    `;
  }

  function renderToday() {
    const due = dueMedsForToday();
    const pending = due.filter((d) => d.status === 'due');
    const appt = nextAppointment();
    const recentSymptom = state.symptoms.slice().sort((a, b) => b.at.localeCompare(a.at))[0];
    const recentVital = state.vitals.slice().sort((a, b) => b.at.localeCompare(a.at))[0];

    return `
      <section class="section">
        <h2>Today</h2>
        <p class="lede">A calm view of what matters for ${esc(state.profileName)} right now.</p>
        <div class="stat-grid">
          <div class="stat"><strong>${pending.length}</strong><span>meds still due</span></div>
          <div class="stat"><strong>${state.appointments.length}</strong><span>care visits saved</span></div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h3>Medications</h3><button type="button" class="ghost" data-route-link="meds">All meds</button></div>
        <div class="list">
          ${due.length ? due.map((d) => `
            <article class="item ${d.status !== 'due' ? 'done' : ''}">
              <div>
                <p class="item-title">${esc(d.med.name)}${d.med.dose ? ' · ' + esc(d.med.dose) : ''}</p>
                <p class="item-meta">${formatTime(d.time)} · ${d.status === 'due' ? '<span class="badge warn">Due</span>' : d.status === 'taken' ? '<span class="badge">Taken</span>' : '<span class="badge">Skipped</span>'}</p>
              </div>
              ${d.status === 'due' ? `
                <div class="item-actions">
                  <button type="button" class="ok" data-take="${esc(d.med.id)}" data-time="${esc(d.time)}">Taken</button>
                  <button type="button" class="secondary" data-skip="${esc(d.med.id)}" data-time="${esc(d.time)}">Skip</button>
                </div>` : ''}
            </article>`).join('') : `<div class="empty">No medications yet. Add one or import notes from OneDrive / ChatGPT.</div>`}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h3>Next visit</h3><button type="button" class="ghost" data-route-link="care">Care</button></div>
        ${appt ? `
          <article class="item">
            <p class="item-title">${esc(appt.title)}</p>
            <p class="item-meta">${formatDate(appt.when)}${appt.time ? ' · ' + formatTime(appt.time) : ''}${appt.location ? ' · ' + esc(appt.location) : ''}</p>
          </article>` : `<div class="empty">No upcoming appointments saved.</div>`}
      </section>

      <section class="section">
        <div class="section-head"><h3>Quick log</h3></div>
        <div class="item-actions">
          <button type="button" data-open="symptom">Log symptom</button>
          <button type="button" class="secondary" data-open="vital">Log vital</button>
        </div>
        <p class="item-meta" style="margin-top:12px">
          ${recentSymptom ? `Latest symptom: ${esc(recentSymptom.label)} (${esc(String(recentSymptom.severity))}/5)` : 'No symptoms logged yet.'}
          ${recentVital ? `<br>Latest vital: ${esc(recentVital.kind)} ${esc(recentVital.value)}${recentVital.unit ? ' ' + esc(recentVital.unit) : ''}` : ''}
        </p>
      </section>
    `;
  }

  function renderMeds() {
    const meds = state.meds.slice().sort((a, b) => a.name.localeCompare(b.name));
    return `
      <section class="section">
        <h2>Medications</h2>
        <p class="lede">Track what to take and when. Mark doses from Today.</p>
        <button type="button" data-open="med">Add medication</button>
      </section>
      <section class="section">
        <div class="list">
          ${meds.length ? meds.map((m) => `
            <article class="item ${m.active === false ? 'done' : ''}">
              <p class="item-title">${esc(m.name)}</p>
              <p class="item-meta">${esc(m.dose || 'Dose not set')} · ${(m.times || []).map(formatTime).join(', ') || 'No schedule'}
              ${m.notes ? '<br>' + esc(m.notes) : ''}</p>
              <div class="item-actions">
                <button type="button" class="secondary" data-edit-med="${esc(m.id)}">Edit</button>
                <button type="button" class="ghost" data-toggle-med="${esc(m.id)}">${m.active === false ? 'Activate' : 'Pause'}</button>
                <button type="button" class="ghost" data-del-med="${esc(m.id)}">Delete</button>
              </div>
            </article>`).join('') : `<div class="empty">No medications yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderLog() {
    const symptoms = state.symptoms.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
    const vitals = state.vitals.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
    return `
      <section class="section">
        <h2>Log</h2>
        <p class="lede">Symptoms and vitals stay on this device.</p>
        <div class="item-actions">
          <button type="button" data-open="symptom">Add symptom</button>
          <button type="button" class="secondary" data-open="vital">Add vital</button>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Symptoms</h3></div>
        <div class="list">
          ${symptoms.length ? symptoms.map((s) => `
            <article class="item">
              <p class="item-title">${esc(s.label)}</p>
              <p class="item-meta">Severity ${esc(String(s.severity))}/5 · ${new Date(s.at).toLocaleString()}${s.notes ? '<br>' + esc(s.notes) : ''}</p>
              <button type="button" class="ghost" data-del-symptom="${esc(s.id)}">Delete</button>
            </article>`).join('') : `<div class="empty">No symptoms logged.</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Vitals</h3></div>
        <div class="list">
          ${vitals.length ? vitals.map((v) => `
            <article class="item">
              <p class="item-title">${esc(v.kind)} · ${esc(v.value)}${v.unit ? ' ' + esc(v.unit) : ''}</p>
              <p class="item-meta">${new Date(v.at).toLocaleString()}${v.notes ? '<br>' + esc(v.notes) : ''}</p>
              <button type="button" class="ghost" data-del-vital="${esc(v.id)}">Delete</button>
            </article>`).join('') : `<div class="empty">No vitals logged.</div>`}
        </div>
      </section>
    `;
  }

  function renderCare() {
    const appts = state.appointments.slice().sort((a, b) => String(a.when || '9999').localeCompare(String(b.when || '9999')));
    const contacts = state.contacts.slice().sort((a, b) => a.name.localeCompare(b.name));
    const questions = state.questions;
    return `
      <section class="section">
        <h2>Care</h2>
        <p class="lede">Appointments, people to call, and questions for the next visit.</p>
        <div class="item-actions">
          <button type="button" data-open="appt">Add appointment</button>
          <button type="button" class="secondary" data-open="contact">Add contact</button>
          <button type="button" class="secondary" data-open="question">Add question</button>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Appointments</h3></div>
        <div class="list">
          ${appts.length ? appts.map((a) => `
            <article class="item">
              <p class="item-title">${esc(a.title)}</p>
              <p class="item-meta">${formatDate(a.when)}${a.time ? ' · ' + formatTime(a.time) : ''}${a.location ? '<br>' + esc(a.location) : ''}${a.notes ? '<br>' + esc(a.notes) : ''}</p>
              <button type="button" class="ghost" data-del-appt="${esc(a.id)}">Delete</button>
            </article>`).join('') : `<div class="empty">No appointments yet.</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Care team</h3></div>
        <div class="list">
          ${contacts.length ? contacts.map((c) => `
            <article class="item">
              <p class="item-title">${esc(c.name)}</p>
              <p class="item-meta">${esc(c.role || 'Contact')}${c.phone ? ' · ' + esc(c.phone) : ''}${c.notes ? '<br>' + esc(c.notes) : ''}</p>
              <div class="item-actions">
                ${c.phone ? `<a class="button secondary" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">Call</a>` : ''}
                <button type="button" class="ghost" data-del-contact="${esc(c.id)}">Delete</button>
              </div>
            </article>`).join('') : `<div class="empty">No contacts yet.</div>`}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Ask the doctor</h3></div>
        <div class="list">
          ${questions.length ? questions.map((q) => `
            <article class="item ${q.done ? 'done' : ''}">
              <p class="item-title">${esc(q.text)}</p>
              <div class="item-actions">
                <button type="button" class="secondary" data-toggle-q="${esc(q.id)}">${q.done ? 'Mark open' : 'Mark asked'}</button>
                <button type="button" class="ghost" data-del-q="${esc(q.id)}">Delete</button>
              </div>
            </article>`).join('') : `<div class="empty">No visit questions yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderNotes() {
    const history = state.importedNotes.slice().reverse().slice(0, 8);
    return `
      <section class="section">
        <h2>Import notes</h2>
        <p class="lede">Paste text from OneDrive or ChatGPT. Headings like Medications, Appointments, Contacts, and Questions help the importer.</p>
        <div class="field">
          <label for="notesPaste">Notes</label>
          <textarea id="notesPaste" placeholder="Medications&#10;- Lisinopril 10mg once daily&#10;&#10;Appointments&#10;- Dr. Lee follow-up March 20, 2026 10:00&#10;&#10;Questions&#10;- Ask about dizziness after morning dose"></textarea>
        </div>
        <button type="button" id="btnImportNotes">Import into Kathy’s Health</button>
        <p class="disclaimer" style="margin-top:12px">Review everything after import. The parser is a helper, not a pharmacist.</p>
      </section>
      <section class="section">
        <div class="section-head"><h3>Recent imports</h3></div>
        <div class="list">
          ${history.length ? history.map((h) => `
            <article class="item">
              <p class="item-title">${new Date(h.at).toLocaleString()}</p>
              <p class="item-meta">${esc(String(h.meds))} meds · ${esc(String(h.appointments))} visits · ${esc(String(h.contacts))} contacts · ${esc(String(h.questions))} questions</p>
            </article>`).join('') : `<div class="empty">No imports yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderSettings() {
    return `
      <section class="section">
        <h2>Settings</h2>
        <p class="lede">Backup to a file you can keep in OneDrive. Data never leaves this device unless you export it.</p>
        <div class="field">
          <label for="profileName">Preferred name</label>
          <input id="profileName" value="${esc(state.profileName)}">
        </div>
        <div class="item-actions">
          <button type="button" id="btnSaveProfile">Save name</button>
          <button type="button" class="secondary" id="btnExport">Export backup</button>
          <label class="button secondary" style="display:inline-flex;align-items:center;justify-content:center">
            Import backup
            <input type="file" id="importFile" accept="application/json,.json" hidden>
          </label>
          <button type="button" class="warn" id="btnReset">Erase all data</button>
        </div>
        <p class="disclaimer" style="margin-top:16px">Kathy’s Health v${VERSION}. Not a medical device. For emergencies call local emergency services.</p>
        <p class="disclaimer"><a href="./privacy.html">Privacy</a></p>
      </section>
    `;
  }

  function medForm(existing) {
    const m = existing || { name: '', dose: '', times: ['08:00'], notes: '', active: true };
    return `
      <div class="field"><label for="medName">Name</label><input id="medName" value="${esc(m.name)}" placeholder="Lisinopril"></div>
      <div class="field"><label for="medDose">Dose</label><input id="medDose" value="${esc(m.dose || '')}" placeholder="10 mg"></div>
      <div class="field"><label for="medTimes">Times (comma-separated 24h)</label><input id="medTimes" value="${esc((m.times || []).join(', '))}" placeholder="08:00, 20:00"></div>
      <div class="field"><label for="medNotes">Notes</label><textarea id="medNotes" placeholder="With food, refill at pharmacy">${esc(m.notes || '')}</textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function symptomForm() {
    return `
      <div class="field"><label for="symLabel">Symptom</label><input id="symLabel" placeholder="Headache, dizziness, pain…"></div>
      <div class="field"><label for="symSeverity">Severity (1–5)</label>
        <select id="symSeverity"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select>
      </div>
      <div class="field"><label for="symNotes">Notes</label><textarea id="symNotes"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function vitalForm() {
    return `
      <div class="field"><label for="vitalKind">Type</label>
        <select id="vitalKind">
          <option>Blood pressure</option>
          <option>Heart rate</option>
          <option>Weight</option>
          <option>Blood sugar</option>
          <option>Temperature</option>
          <option>Other</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label for="vitalValue">Value</label><input id="vitalValue" placeholder="120/80"></div>
        <div class="field"><label for="vitalUnit">Unit</label><input id="vitalUnit" placeholder="mmHg, bpm, lb…"></div>
      </div>
      <div class="field"><label for="vitalNotes">Notes</label><textarea id="vitalNotes"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function apptForm() {
    return `
      <div class="field"><label for="apptTitle">Title</label><input id="apptTitle" placeholder="Dr. Lee follow-up"></div>
      <div class="field-row">
        <div class="field"><label for="apptWhen">Date</label><input id="apptWhen" type="date"></div>
        <div class="field"><label for="apptTime">Time</label><input id="apptTime" type="time"></div>
      </div>
      <div class="field"><label for="apptLoc">Location</label><input id="apptLoc" placeholder="Clinic name or address"></div>
      <div class="field"><label for="apptNotes">Notes</label><textarea id="apptNotes"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function contactForm() {
    return `
      <div class="field"><label for="ctName">Name</label><input id="ctName" placeholder="Dr. Lee"></div>
      <div class="field"><label for="ctRole">Role</label><input id="ctRole" placeholder="Primary care, pharmacy…"></div>
      <div class="field"><label for="ctPhone">Phone</label><input id="ctPhone" inputmode="tel" placeholder="555-555-5555"></div>
      <div class="field"><label for="ctNotes">Notes</label><textarea id="ctNotes"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function questionForm() {
    return `
      <div class="field"><label for="qText">Question</label><textarea id="qText" placeholder="Ask about…"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function renderModal() {
    if (!modal) return '';
    return `
      <div class="modal-backdrop" id="modalBackdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>${esc(modal.title)}</h3>
          ${modal.bodyHtml}
        </div>
      </div>
    `;
  }

  function render() {
    const main = document.getElementById('main');
    const header = document.getElementById('siteHeader');
    const tabbar = document.getElementById('tabbar');
    const headerDate = document.getElementById('headerDate');

    if (!state.onboarded) {
      header.hidden = true;
      tabbar.hidden = true;
      main.innerHTML = renderWelcome() + renderModal();
      bind();
      return;
    }

    header.hidden = false;
    tabbar.hidden = route === 'settings';
    headerDate.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    tabbar.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-route') === route);
    });

    let html = '';
    if (route === 'today') html = renderToday();
    else if (route === 'meds') html = renderMeds();
    else if (route === 'log') html = renderLog();
    else if (route === 'care') html = renderCare();
    else if (route === 'notes') html = renderNotes();
    else if (route === 'settings') html = renderSettings();
    main.innerHTML = html + renderModal();
    bind();
  }

  function bind() {
    const accept = document.getElementById('acceptDisclaimer');
    const start = document.getElementById('btnStart');
    if (accept && start) {
      accept.addEventListener('change', () => { start.disabled = !accept.checked; });
      start.addEventListener('click', () => {
        if (!accept.checked) return;
        state.onboarded = true;
        save();
        route = 'today';
        render();
      });
      document.getElementById('btnImportFirst').addEventListener('click', () => {
        if (!accept.checked) {
          toast('Please confirm the care disclaimer first');
          return;
        }
        state.onboarded = true;
        save();
        route = 'notes';
        render();
      });
    }

    document.querySelectorAll('[data-route-link]').forEach((el) => {
      el.addEventListener('click', () => {
        route = el.getAttribute('data-route-link');
        render();
      });
    });

    document.querySelectorAll('[data-take]').forEach((btn) => {
      btn.addEventListener('click', () => markDose(btn.getAttribute('data-take'), btn.getAttribute('data-time'), 'taken'));
    });
    document.querySelectorAll('[data-skip]').forEach((btn) => {
      btn.addEventListener('click', () => markDose(btn.getAttribute('data-skip'), btn.getAttribute('data-time'), 'skipped'));
    });

    document.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-open');
        if (kind === 'med') openModal('Add medication', medForm(), saveMed);
        if (kind === 'symptom') openModal('Log symptom', symptomForm(), saveSymptom);
        if (kind === 'vital') openModal('Log vital', vitalForm(), saveVital);
        if (kind === 'appt') openModal('Add appointment', apptForm(), saveAppt);
        if (kind === 'contact') openModal('Add contact', contactForm(), saveContact);
        if (kind === 'question') openModal('Add question', questionForm(), saveQuestion);
      });
    });

    document.querySelectorAll('[data-edit-med]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const med = state.meds.find((m) => m.id === btn.getAttribute('data-edit-med'));
        if (!med) return;
        openModal('Edit medication', medForm(med), () => saveMed(med.id));
      });
    });
    document.querySelectorAll('[data-toggle-med]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const med = state.meds.find((m) => m.id === btn.getAttribute('data-toggle-med'));
        if (!med) return;
        med.active = med.active === false;
        save();
        render();
      });
    });
    document.querySelectorAll('[data-del-med]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this medication?')) return;
        state.meds = state.meds.filter((m) => m.id !== btn.getAttribute('data-del-med'));
        save();
        render();
      });
    });
    document.querySelectorAll('[data-del-symptom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.symptoms = state.symptoms.filter((s) => s.id !== btn.getAttribute('data-del-symptom'));
        save();
        render();
      });
    });
    document.querySelectorAll('[data-del-vital]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.vitals = state.vitals.filter((v) => v.id !== btn.getAttribute('data-del-vital'));
        save();
        render();
      });
    });
    document.querySelectorAll('[data-del-appt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.appointments = state.appointments.filter((a) => a.id !== btn.getAttribute('data-del-appt'));
        save();
        render();
      });
    });
    document.querySelectorAll('[data-del-contact]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.contacts = state.contacts.filter((c) => c.id !== btn.getAttribute('data-del-contact'));
        save();
        render();
      });
    });
    document.querySelectorAll('[data-del-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.questions = state.questions.filter((q) => q.id !== btn.getAttribute('data-del-q'));
        save();
        render();
      });
    });
    document.querySelectorAll('[data-toggle-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = state.questions.find((x) => x.id === btn.getAttribute('data-toggle-q'));
        if (!q) return;
        q.done = !q.done;
        save();
        render();
      });
    });

    const importBtn = document.getElementById('btnImportNotes');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const text = document.getElementById('notesPaste').value;
        const result = window.KathyNotesImport.importNotes(text);
        if (!result.lineCount) {
          toast('Paste some notes first');
          return;
        }
        state.meds = state.meds.concat(result.meds);
        state.appointments = state.appointments.concat(result.appointments);
        state.contacts = state.contacts.concat(result.contacts);
        state.questions = state.questions.concat(result.questions);
        if (result.leftovers.length) {
          state.importedNotes.push({
            at: new Date().toISOString(),
            leftoverText: result.leftovers.join('\n')
          });
        }
        state.importedNotes.push({
          at: new Date().toISOString(),
          meds: result.meds.length,
          appointments: result.appointments.length,
          contacts: result.contacts.length,
          questions: result.questions.length
        });
        save();
        toast(`Imported ${result.meds.length} meds, ${result.appointments.length} visits`);
        route = 'today';
        render();
      });
    }

    const saveProfile = document.getElementById('btnSaveProfile');
    if (saveProfile) {
      saveProfile.addEventListener('click', () => {
        state.profileName = document.getElementById('profileName').value.trim() || 'Kathy';
        save();
        toast('Saved');
      });
    }
    const exportBtn = document.getElementById('btnExport');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'kathy-health-backup-' + todayISO() + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Backup ready — save it to OneDrive if you like');
      });
    }
    const importFile = document.getElementById('importFile');
    if (importFile) {
      importFile.addEventListener('change', async () => {
        const file = importFile.files && importFile.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          state = Object.assign(defaultState(), data, { onboarded: true });
          save();
          toast('Backup imported');
          route = 'today';
          render();
        } catch (e) {
          toast('Could not read that backup file');
        }
      });
    }
    const resetBtn = document.getElementById('btnReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (!confirm('Erase all Kathy’s Health data on this device?')) return;
        state = defaultState();
        save();
        route = 'today';
        render();
      });
    }

    const modalSave = document.getElementById('modalSave');
    const modalCancel = document.getElementById('modalCancel');
    if (modalCancel) modalCancel.addEventListener('click', closeModal);
    if (modalSave && modal && modal.onSave) modalSave.addEventListener('click', () => modal.onSave());
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }
  }

  function saveMed(existingId) {
    const name = document.getElementById('medName').value.trim();
    if (!name) { toast('Name is required'); return; }
    const times = document.getElementById('medTimes').value.split(/[, ]+/).map((t) => t.trim()).filter(Boolean);
    const payload = {
      id: existingId || uid('med'),
      name,
      dose: document.getElementById('medDose').value.trim(),
      times: times.length ? times : ['08:00'],
      notes: document.getElementById('medNotes').value.trim(),
      active: true,
      createdAt: new Date().toISOString()
    };
    if (existingId) {
      state.meds = state.meds.map((m) => m.id === existingId ? Object.assign({}, m, payload, { id: existingId }) : m);
    } else {
      state.meds.push(payload);
    }
    save();
    closeModal();
    toast('Medication saved');
  }

  function saveSymptom() {
    const label = document.getElementById('symLabel').value.trim();
    if (!label) { toast('Enter a symptom'); return; }
    state.symptoms.push({
      id: uid('sym'),
      label,
      severity: Number(document.getElementById('symSeverity').value || 3),
      notes: document.getElementById('symNotes').value.trim(),
      at: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Symptom logged');
  }

  function saveVital() {
    const value = document.getElementById('vitalValue').value.trim();
    if (!value) { toast('Enter a value'); return; }
    state.vitals.push({
      id: uid('vit'),
      kind: document.getElementById('vitalKind').value,
      value,
      unit: document.getElementById('vitalUnit').value.trim(),
      notes: document.getElementById('vitalNotes').value.trim(),
      at: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Vital logged');
  }

  function saveAppt() {
    const title = document.getElementById('apptTitle').value.trim();
    if (!title) { toast('Enter a title'); return; }
    state.appointments.push({
      id: uid('appt'),
      title,
      when: document.getElementById('apptWhen').value,
      time: document.getElementById('apptTime').value,
      location: document.getElementById('apptLoc').value.trim(),
      notes: document.getElementById('apptNotes').value.trim(),
      createdAt: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Appointment saved');
  }

  function saveContact() {
    const name = document.getElementById('ctName').value.trim();
    if (!name) { toast('Enter a name'); return; }
    state.contacts.push({
      id: uid('ct'),
      name,
      role: document.getElementById('ctRole').value.trim(),
      phone: document.getElementById('ctPhone').value.trim(),
      notes: document.getElementById('ctNotes').value.trim(),
      createdAt: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Contact saved');
  }

  function saveQuestion() {
    const text = document.getElementById('qText').value.trim();
    if (!text) { toast('Enter a question'); return; }
    state.questions.push({
      id: uid('q'),
      text,
      done: false,
      createdAt: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Question saved');
  }

  document.getElementById('tabbar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    route = btn.getAttribute('data-route');
    render();
  });

  document.getElementById('btnSettings').addEventListener('click', () => {
    route = 'settings';
    render();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  render();
})();
