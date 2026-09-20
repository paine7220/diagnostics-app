(function () {
  'use strict';

  const STORAGE_KEY = 'kathy_health_v1';
  const VERSION = '1.1.0';

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
    importedNotes: [],
    family: [],
    alertSettings: {
      lowSugarThreshold: 70,
      responseSeconds: 120,
      webhookUrl: '',
      unit: 'mg/dL'
    },
    activeAlert: null,
    alertLog: []
  });

  let state = load();
  let route = 'today';
  let modal = null;
  let alertTick = null;

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
    toast._t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function clearAlertTimer() {
    if (alertTick) {
      clearInterval(alertTick);
      alertTick = null;
    }
  }

  function startAlertTimer() {
    clearAlertTimer();
    if (!state.activeAlert || state.activeAlert.status !== 'waiting') return;
    alertTick = setInterval(() => {
      if (!state.activeAlert || state.activeAlert.status !== 'waiting') {
        clearAlertTimer();
        return;
      }
      if (Date.now() >= state.activeAlert.deadlineAt) {
        dispatchFamilyAlert('timeout');
        return;
      }
      render();
    }, 1000);
  }

  function beginLowSugarAlert(sugarValue, unit) {
    const seconds = Math.max(30, Number(state.alertSettings.responseSeconds || 120));
    state.activeAlert = {
      id: uid('alert'),
      sugarValue: String(sugarValue),
      unit: unit || state.alertSettings.unit || 'mg/dL',
      startedAt: Date.now(),
      deadlineAt: Date.now() + seconds * 1000,
      status: 'waiting'
    };
    save();
    KathyAlerts.notifyLocal(
      'Low blood sugar check-in',
      (state.profileName || 'Kathy') + ' — confirm you are OK'
    );
    startAlertTimer();
    render();
  }

  function clearActiveAlert(reason) {
    if (!state.activeAlert) return;
    state.alertLog.push({
      id: state.activeAlert.id,
      at: new Date().toISOString(),
      sugarValue: state.activeAlert.sugarValue,
      outcome: reason || 'cleared'
    });
    state.activeAlert = null;
    save();
    clearAlertTimer();
    render();
  }

  async function dispatchFamilyAlert(reason) {
    if (!state.activeAlert) return;
    const msg = KathyAlerts.buildAlertMessage(
      state.profileName,
      state.activeAlert.sugarValue,
      state.activeAlert.unit
    );
    const family = state.family.filter((f) => f.phone);
    state.activeAlert.status = 'sent';
    state.activeAlert.sentAt = Date.now();
    state.activeAlert.sentReason = reason;
    state.alertLog.push({
      id: state.activeAlert.id,
      at: new Date().toISOString(),
      sugarValue: state.activeAlert.sugarValue,
      outcome: 'family_alerted_' + reason,
      familyCount: family.length
    });
    save();
    clearAlertTimer();

    await KathyAlerts.notifyLocal('Family alert sent', msg);

    if (state.alertSettings.webhookUrl) {
      try {
        await KathyAlerts.postWebhook(state.alertSettings.webhookUrl, {
          type: 'kathy_low_sugar_no_response',
          reason,
          profileName: state.profileName,
          sugarValue: state.activeAlert.sugarValue,
          unit: state.activeAlert.unit,
          message: msg,
          at: new Date().toISOString(),
          family: family.map((f) => ({ name: f.name, phone: f.phone }))
        });
      } catch (e) {
        toast('Webhook alert failed — opening SMS');
      }
    }

    // Open SMS to each family member (iPhone handles one compose sheet at a time)
    family.forEach((f, i) => {
      const url = KathyAlerts.smsUrl(f.phone, msg);
      if (!url) return;
      setTimeout(() => { window.location.href = url; }, i * 700);
    });

    if (!family.length) {
      toast('No family phone numbers — add them in Settings');
    } else {
      toast('Alerting family now');
    }
    render();
  }

  function secondsLeft() {
    if (!state.activeAlert || state.activeAlert.status !== 'waiting') return 0;
    return Math.max(0, Math.ceil((state.activeAlert.deadlineAt - Date.now()) / 1000));
  }

  function renderAlertOverlay() {
    if (!state.activeAlert) return '';
    const waiting = state.activeAlert.status === 'waiting';
    const left = secondsLeft();
    return `
      <div class="alert-overlay" role="alertdialog" aria-modal="true">
        <div class="alert-card">
          <p class="alert-kicker">${waiting ? 'Check in needed' : 'Family alerted'}</p>
          <h2>Blood sugar ${esc(state.activeAlert.sugarValue)} ${esc(state.activeAlert.unit || '')}</h2>
          ${waiting ? `
            <p class="lede">If you do not confirm you are OK, Kathy’s Health will text your family.</p>
            <p class="alert-countdown">${left}s</p>
            <div class="item-actions" style="flex-direction:column">
              <button type="button" class="ok" id="btnImOk">I’m OK — cancel alert</button>
              <button type="button" class="warn" id="btnNeedHelp">I need help now</button>
            </div>
          ` : `
            <p class="lede">Family was notified because there was no OK response in time (or help was requested).</p>
            <div class="item-actions" style="flex-direction:column">
              <button type="button" class="ok" id="btnImOkLate">I’m OK now</button>
              ${state.family[0] && state.family[0].phone ? `<a class="button secondary" href="${esc(KathyAlerts.telUrl(state.family[0].phone))}">Call ${esc(state.family[0].name || 'family')}</a>` : ''}
            </div>
          `}
        </div>
      </div>
    `;
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
    const upcoming = state.appointments
      .filter((a) => !a.when || a.when >= day)
      .sort((a, b) => String(a.when || '9999').localeCompare(String(b.when || '9999')));
    if (upcoming[0]) return upcoming[0];
    return state.appointments
      .slice()
      .sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')))[0];
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
          <p>Medications, sugar checks, and family alerts when help is needed.</p>
        </div>
        <div class="hero-panel">
          <label>
            <input type="checkbox" id="acceptDisclaimer">
            <span>I understand this app helps organize care and can text family if blood sugar is low and I do not respond. It does not replace emergency services — call them in a true emergency.</span>
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
    const familyReady = state.family.filter((f) => f.phone).length;

    return `
      <section class="section">
        <h2>Today</h2>
        <p class="lede">A calm view of what matters for ${esc(state.profileName)} right now.</p>
        <div class="stat-grid">
          <div class="stat"><strong>${pending.length}</strong><span>meds still due</span></div>
          <div class="stat"><strong>${familyReady}</strong><span>family alert contacts</span></div>
        </div>
      </section>

      <section class="section sugar-panel">
        <div class="section-head"><h3>Blood sugar</h3></div>
        <p class="item-meta">Low alert at ${esc(String(state.alertSettings.lowSugarThreshold))} ${esc(state.alertSettings.unit || 'mg/dL')}. If there is no OK within ${esc(String(state.alertSettings.responseSeconds))} seconds, family is texted.</p>
        <div class="item-actions" style="margin-top:10px">
          <button type="button" data-open="sugar">Log sugar</button>
          <button type="button" class="warn" id="btnHelpNow">I need help</button>
        </div>
        <p class="item-meta" style="margin-top:10px">
          ${recentVital && /blood sugar/i.test(recentVital.kind) ? `Latest sugar: ${esc(recentVital.value)}${recentVital.unit ? ' ' + esc(recentVital.unit) : ''}` : 'No sugar reading yet today.'}
        </p>
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
          <textarea id="notesPaste" placeholder="Medications&#10;- Lisinopril 10mg once daily&#10;&#10;Appointments&#10;- Dr. Lee follow-up 2026-10-20 10:00&#10;&#10;Questions&#10;- Ask about dizziness after morning dose"></textarea>
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
    const family = state.family || [];
    return `
      <section class="section">
        <h2>Settings</h2>
        <p class="lede">Family alerts need phone numbers (and optional webhook). Care notes can still stay on this device.</p>
        <div class="field">
          <label for="profileName">Preferred name</label>
          <input id="profileName" value="${esc(state.profileName)}">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="lowSugar">Low sugar alert at</label>
            <input id="lowSugar" type="number" value="${esc(String(state.alertSettings.lowSugarThreshold))}">
          </div>
          <div class="field">
            <label for="responseSeconds">Seconds to respond</label>
            <input id="responseSeconds" type="number" value="${esc(String(state.alertSettings.responseSeconds))}">
          </div>
        </div>
        <div class="field">
          <label for="sugarUnit">Sugar unit</label>
          <input id="sugarUnit" value="${esc(state.alertSettings.unit || 'mg/dL')}" placeholder="mg/dL">
        </div>
        <div class="field">
          <label for="webhookUrl">Optional alert webhook (IFTTT / Zapier / Twilio)</label>
          <input id="webhookUrl" value="${esc(state.alertSettings.webhookUrl || '')}" placeholder="https://…">
        </div>
        <div class="item-actions">
          <button type="button" id="btnSaveProfile">Save alert settings</button>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Family to alert</h3></div>
        <button type="button" data-open="family">Add family contact</button>
        <div class="list" style="margin-top:10px">
          ${family.length ? family.map((f) => `
            <article class="item">
              <p class="item-title">${esc(f.name)}</p>
              <p class="item-meta">${esc(f.phone)}${f.relation ? ' · ' + esc(f.relation) : ''}</p>
              <button type="button" class="ghost" data-del-family="${esc(f.id)}">Remove</button>
            </article>`).join('') : `<div class="empty">Add at least one family phone number so low-sugar alerts can text them.</div>`}
        </div>
      </section>
      <section class="section">
        <div class="item-actions">
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
          <option>Blood sugar</option>
          <option>Blood pressure</option>
          <option>Heart rate</option>
          <option>Weight</option>
          <option>Temperature</option>
          <option>Other</option>
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label for="vitalValue">Value</label><input id="vitalValue" placeholder="65"></div>
        <div class="field"><label for="vitalUnit">Unit</label><input id="vitalUnit" value="${esc(state.alertSettings.unit || 'mg/dL')}" placeholder="mg/dL"></div>
      </div>
      <div class="field"><label for="vitalNotes">Notes</label><textarea id="vitalNotes"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function sugarForm() {
    return `
      <div class="field"><label for="sugarValue">Blood sugar</label><input id="sugarValue" inputmode="decimal" placeholder="65"></div>
      <div class="field"><label for="sugarUnitField">Unit</label><input id="sugarUnitField" value="${esc(state.alertSettings.unit || 'mg/dL')}"></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save reading</button>
        <button type="button" class="secondary" id="modalCancel">Cancel</button>
      </div>
    `;
  }

  function familyForm() {
    return `
      <div class="field"><label for="famName">Name</label><input id="famName" placeholder="Michael"></div>
      <div class="field"><label for="famPhone">Phone</label><input id="famPhone" inputmode="tel" placeholder="555-555-5555"></div>
      <div class="field"><label for="famRelation">Relation</label><input id="famRelation" placeholder="Son, spouse…"></div>
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
      main.innerHTML = renderWelcome() + renderModal() + renderAlertOverlay();
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
    main.innerHTML = html + renderModal() + renderAlertOverlay();
    bind();
    if (state.activeAlert && state.activeAlert.status === 'waiting') startAlertTimer();
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
        if (kind === 'sugar') openModal('Log blood sugar', sugarForm(), saveSugar);
        if (kind === 'appt') openModal('Add appointment', apptForm(), saveAppt);
        if (kind === 'contact') openModal('Add contact', contactForm(), saveContact);
        if (kind === 'question') openModal('Add question', questionForm(), saveQuestion);
        if (kind === 'family') openModal('Add family contact', familyForm(), saveFamily);
      });
    });

    const helpNow = document.getElementById('btnHelpNow');
    if (helpNow) {
      helpNow.addEventListener('click', () => {
        beginLowSugarAlert('help', state.alertSettings.unit || 'mg/dL');
        dispatchFamilyAlert('help_requested');
      });
    }
    const imOk = document.getElementById('btnImOk');
    if (imOk) imOk.addEventListener('click', () => { clearActiveAlert('ok'); toast('Glad you’re OK'); });
    const imOkLate = document.getElementById('btnImOkLate');
    if (imOkLate) imOkLate.addEventListener('click', () => { clearActiveAlert('ok_after_alert'); toast('Alert cleared'); });
    const needHelp = document.getElementById('btnNeedHelp');
    if (needHelp) needHelp.addEventListener('click', () => dispatchFamilyAlert('help_requested'));

    document.querySelectorAll('[data-del-family]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.family = state.family.filter((f) => f.id !== btn.getAttribute('data-del-family'));
        save();
        render();
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
        state.alertSettings.lowSugarThreshold = Number(document.getElementById('lowSugar').value || 70);
        state.alertSettings.responseSeconds = Math.max(30, Number(document.getElementById('responseSeconds').value || 120));
        state.alertSettings.unit = document.getElementById('sugarUnit').value.trim() || 'mg/dL';
        state.alertSettings.webhookUrl = document.getElementById('webhookUrl').value.trim();
        save();
        toast('Alert settings saved');
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
    const kind = document.getElementById('vitalKind').value;
    const unit = document.getElementById('vitalUnit').value.trim();
    state.vitals.push({
      id: uid('vit'),
      kind,
      value,
      unit,
      notes: document.getElementById('vitalNotes').value.trim(),
      at: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Vital logged');
    if (/blood sugar/i.test(kind) && KathyAlerts.isLowSugar(value, state.alertSettings.lowSugarThreshold)) {
      beginLowSugarAlert(value, unit || state.alertSettings.unit);
    }
  }

  function saveSugar() {
    const value = document.getElementById('sugarValue').value.trim();
    if (!value) { toast('Enter a reading'); return; }
    const unit = document.getElementById('sugarUnitField').value.trim() || state.alertSettings.unit || 'mg/dL';
    state.vitals.push({
      id: uid('vit'),
      kind: 'Blood sugar',
      value,
      unit,
      notes: '',
      at: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Sugar logged');
    if (KathyAlerts.isLowSugar(value, state.alertSettings.lowSugarThreshold)) {
      beginLowSugarAlert(value, unit);
    }
  }

  function saveFamily() {
    const name = document.getElementById('famName').value.trim();
    const phone = document.getElementById('famPhone').value.trim();
    if (!name || !phone) { toast('Name and phone required'); return; }
    state.family.push({
      id: uid('fam'),
      name,
      phone,
      relation: document.getElementById('famRelation').value.trim(),
      createdAt: new Date().toISOString()
    });
    save();
    closeModal();
    toast('Family contact saved');
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

  if (state.activeAlert && state.activeAlert.status === 'waiting') {
    if (Date.now() >= state.activeAlert.deadlineAt) {
      dispatchFamilyAlert('timeout');
    } else {
      startAlertTimer();
    }
  }

  render();
})();
