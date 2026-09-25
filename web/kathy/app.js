(function () {
  'use strict';

  const STORAGE_KEY = 'kathy_health_v1';
  const VERSION = '1.5.3';

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
    cgm: {
      mode: 'dexcom_share', // off | nightscout | dexcom_share
      nightscoutUrl: '',
      nightscoutSecret: '',
      accountName: '',
      password: '',
      region: 'us',
      pollSeconds: 60,
      lastReading: null,
      lastError: '',
      lastFetchAt: null
    },
    pump: {
      mode: 'off', // off | nightscout | manual
      brand: 'unknown', // omnipod | tandem | medtronic | loop | unknown
      nightscoutUrl: '',
      nightscoutSecret: '',
      reuseCgmNightscout: true,
      lastStatus: null,
      lastBolus: null,
      treatments: [],
      manualEvents: [],
      lastError: '',
      lastFetchAt: null
    },
    billing: {
      openaiKey: '',
      preferAi: true,
      cases: []
    },
    activeAlert: null,
    alertLog: []
  });

  let state = load();
  let route = 'today';
  let modal = null;
  let alertTick = null;
  let cgmTick = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      const merged = Object.assign(base, parsed);
      merged.alertSettings = Object.assign(base.alertSettings, parsed.alertSettings || {});
      merged.cgm = Object.assign(base.cgm, parsed.cgm || {});
      merged.pump = Object.assign(base.pump, parsed.pump || {});
      merged.billing = Object.assign(base.billing, parsed.billing || {});
      if (!Array.isArray(merged.billing.cases)) merged.billing.cases = [];
      return merged;
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
      const countdown = document.getElementById('alertCountdown');
      if (countdown) {
        const secs = Math.max(0, Math.ceil((state.activeAlert.deadlineAt - Date.now()) / 1000));
        countdown.textContent = String(secs);
      } else if (!document.getElementById('quickCgmAccount')) {
        render();
      }
    }, 1000);
  }

  function webhookBaseUrl() {
    const wh = (state.alertSettings.webhookUrl || '').trim();
    if (wh) return wh.replace(/\/alert\/?$/, '');
    // Same-origin phone-test server / deployed worker
    if (typeof location !== 'undefined' && /^https?:/.test(location.origin)) return location.origin;
    return '';
  }

  function clearCgmTimer() {
    if (cgmTick) {
      clearInterval(cgmTick);
      cgmTick = null;
    }
  }

  function startCgmTimer() {
    clearCgmTimer();
    if (!state.onboarded || !state.cgm || state.cgm.mode === 'off') return;
    if (state.cgm.mode === 'dexcom_share' && !(state.cgm.accountName && state.cgm.password)) return;
    const seconds = Math.max(30, Number(state.cgm.pollSeconds || 60));
    cgmTick = setInterval(() => {
      refreshCgm(false);
      refreshPump(false);
    }, seconds * 1000);
  }

  function recordCgmVital(reading) {
    if (!reading || !Number.isFinite(Number(reading.mgdl))) return;
    const last = state.cgm.lastReading;
    if (last && last.at === reading.at && Number(last.mgdl) === Number(reading.mgdl)) return;
    state.vitals.push({
      id: uid('vit'),
      kind: 'Blood sugar',
      value: String(reading.mgdl),
      unit: 'mg/dL',
      notes: 'CGM ' + (reading.source || '') + (reading.trend ? ' ' + reading.trend : ''),
      at: reading.at || new Date().toISOString(),
      fromCgm: true
    });
    if (state.vitals.length > 400) state.vitals = state.vitals.slice(-400);
  }

  async function refreshCgm(manual) {
    if (!state.cgm || state.cgm.mode === 'off') return;
    if (state.cgm.mode === 'dexcom_share' && !(state.cgm.accountName && state.cgm.password)) {
      if (manual) {
        state.cgm.lastError = 'Enter Dexcom username and password';
        save();
        showConnectStatus(state.cgm.lastError, true);
        toast(state.cgm.lastError);
      }
      return;
    }
    if (state.cgm.mode === 'nightscout' && !state.cgm.nightscoutUrl) {
      if (manual) {
        state.cgm.lastError = 'Nightscout URL required';
        save();
        toast(state.cgm.lastError);
      }
      return;
    }
    try {
      const reading = await KathyDexcom.fetchLatest({
        mode: state.cgm.mode,
        nightscoutUrl: state.cgm.nightscoutUrl,
        nightscoutSecret: state.cgm.nightscoutSecret,
        accountName: state.cgm.accountName,
        password: state.cgm.password,
        region: state.cgm.region,
        proxyUrl: webhookBaseUrl(),
        webhookBase: webhookBaseUrl()
      });
      recordCgmVital(reading);
      state.cgm.lastReading = reading;
      state.cgm.lastError = '';
      state.cgm.lastFetchAt = new Date().toISOString();
      save();
      if (manual) toast('CGM updated: ' + reading.mgdl + ' mg/dL');
      const pumpSuspended = state.pump && state.pump.lastStatus && state.pump.lastStatus.suspended;
      if (
        KathyAlerts.isLowSugar(reading.mgdl, state.alertSettings.lowSugarThreshold) &&
        !(state.activeAlert && state.activeAlert.status === 'waiting')
      ) {
        beginLowSugarAlert(reading.mgdl, 'mg/dL');
        if (pumpSuspended && state.activeAlert) {
          state.activeAlert.pumpSuspended = true;
          save();
        }
      } else {
        render();
      }
    } catch (err) {
      state.cgm.lastError = String(err && err.message || err);
      state.cgm.lastFetchAt = new Date().toISOString();
      if (/login rejected|AccountPassword|Invalid/i.test(state.cgm.lastError)) {
        state.cgm.lastReading = null;
      }
      save();
      if (manual) toast(state.cgm.lastError);
      // Avoid full re-render while the connect form is on screen — keeps typing intact
      if (!state.cgm.lastReading && document.getElementById('quickCgmAccount')) {
        showConnectStatus(state.cgm.lastError, true);
        const btn = document.getElementById('btnQuickConnectCgm');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Connect Dexcom';
        }
      } else {
        render();
      }
    }
  }

  function showConnectStatus(message, isError) {
    const statusEl = document.getElementById('quickCgmStatus');
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.className = 'connect-status' + (isError ? ' is-error' : ' is-pending');
    statusEl.textContent = message || '';
  }

  async function connectDexcomFromForm() {
    const account = ((document.getElementById('quickCgmAccount') || {}).value || '').trim();
    const password = String((document.getElementById('quickCgmPassword') || {}).value || '');
    const region = (document.getElementById('quickCgmRegion') || {}).value || 'us';
    const btn = document.getElementById('btnQuickConnectCgm');
    state.cgm.mode = 'dexcom_share';
    state.cgm.accountName = account;
    state.cgm.password = password;
    state.cgm.region = region === 'ous' ? 'ous' : 'us';
    state.cgm.lastError = '';
    if (!state.alertSettings.webhookUrl && typeof location !== 'undefined') {
      state.alertSettings.webhookUrl = location.origin + '/alert';
    }
    if (!account || !password) {
      state.cgm.lastError = 'Enter Dexcom username and password';
      save();
      showConnectStatus(state.cgm.lastError, true);
      toast(state.cgm.lastError);
      return;
    }
    save();
    startCgmTimer();
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Connecting…';
    }
    showConnectStatus('Talking to Dexcom Share… keep this page open.', false);
    toast('Connecting Dexcom…');
    await refreshCgm(true);
    if (!state.cgm.lastReading) {
      const again = document.getElementById('btnQuickConnectCgm');
      if (again) {
        again.disabled = false;
        again.textContent = 'Connect Dexcom';
      }
    }
  }

  function pumpNightscoutConfig() {
    if (state.pump.reuseCgmNightscout && state.cgm.nightscoutUrl) {
      return { url: state.cgm.nightscoutUrl, secret: state.cgm.nightscoutSecret };
    }
    return { url: state.pump.nightscoutUrl, secret: state.pump.nightscoutSecret };
  }

  async function refreshPump(manual) {
    if (!state.pump || state.pump.mode !== 'nightscout') return;
    try {
      const cfg = pumpNightscoutConfig();
      const data = await KathyPump.fetchNightscoutPump(cfg.url, cfg.secret);
      state.pump.lastStatus = data.status;
      state.pump.lastBolus = data.lastBolus;
      state.pump.treatments = data.treatments || [];
      state.pump.lastError = '';
      state.pump.lastFetchAt = data.fetchedAt;
      save();
      if (manual) toast(data.status && data.status.iob != null ? ('Pump IOB ' + data.status.iob + ' U') : 'Pump data updated');
      render();
    } catch (err) {
      state.pump.lastError = String(err && err.message || err);
      state.pump.lastFetchAt = new Date().toISOString();
      save();
      if (manual) toast(state.pump.lastError);
      else render();
    }
  }

  function beginLowSugarAlert(sugarValue, unit) {
    if (state.activeAlert && state.activeAlert.status === 'waiting') {
      render();
      return;
    }
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
    const webhook = (state.alertSettings.webhookUrl || '').trim();
    const payload = KathyAlerts.alertPayload({
      type: 'kathy_low_sugar_no_response',
      reason,
      profileName: state.profileName,
      sugarValue: state.activeAlert.sugarValue,
      unit: state.activeAlert.unit,
      message: msg,
      family: family.map((f) => ({ name: f.name, phone: f.phone, relation: f.relation || '' }))
    });

    state.activeAlert.status = 'sent';
    state.activeAlert.sentAt = Date.now();
    state.activeAlert.sentReason = reason;
    state.alertLog.push({
      id: state.activeAlert.id,
      at: new Date().toISOString(),
      sugarValue: state.activeAlert.sugarValue,
      outcome: 'family_alerted_' + reason,
      familyCount: family.length,
      webhook: Boolean(webhook)
    });
    save();
    clearAlertTimer();

    await KathyAlerts.notifyLocal('Family alert sent', msg);

    let webhookResult = { ok: false, skipped: true };
    if (webhook) {
      webhookResult = await KathyAlerts.postWebhook(webhook, payload);
      state.activeAlert.webhookOk = webhookResult.ok;
      save();
    }

    // SMS compose only when Kathy can still interact ("I need help").
    // On timeout she may be unresponsive — webhook must carry that alert.
    if (reason === 'help_requested') {
      family.forEach((f, i) => {
        const url = KathyAlerts.smsUrl(f.phone, msg);
        if (!url) return;
        setTimeout(() => { window.location.href = url; }, i * 700);
      });
    }

    if (!webhook && !family.length) {
      toast('Add family phones and an alert webhook in Settings');
    } else if (!webhook) {
      toast('No webhook set — family SMS needs the alert worker for no-response alerts');
    } else if (webhookResult.ok) {
      toast('Family alert sent automatically');
    } else {
      toast('Alert webhook failed — check Settings URL');
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
            <p class="lede">If you do not confirm you are OK, family is alerted automatically (no tap required).${state.activeAlert.pumpSuspended ? ' Pump reports suspended.' : ''}</p>
            <p class="alert-countdown">${left}s</p>
            <div class="item-actions" style="flex-direction:column">
              <button type="button" class="ok" id="btnImOk">I’m OK — cancel alert</button>
              <button type="button" class="warn" id="btnNeedHelp">I need help now</button>
            </div>
          ` : `
            <p class="lede">${state.activeAlert.webhookOk === false
              ? 'Tried to alert family, but the webhook did not succeed. Call someone now.'
              : 'Family was notified because there was no OK response in time (or help was requested).'}</p>
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
        ${!(state.cgm && state.cgm.lastReading) ? `
          <article class="item dexcom-connect">
            <p class="item-title">Connect Dexcom now</p>
            <p class="item-meta">1) Open Dexcom → Share On. 2) Enter the same Dexcom username/password used on this iPhone. 3) Tap Connect.</p>
            <div class="field">
              <label for="quickCgmAccount">Dexcom username</label>
              <input id="quickCgmAccount" value="${esc(state.cgm.accountName || '')}" autocomplete="username" autocapitalize="none" spellcheck="false" enterkeyhint="next">
            </div>
            <div class="field">
              <label for="quickCgmPassword">Dexcom password</label>
              <input id="quickCgmPassword" type="password" value="${esc(state.cgm.password || '')}" autocomplete="current-password" enterkeyhint="go">
            </div>
            <div class="field">
              <label for="quickCgmRegion">Region</label>
              <select id="quickCgmRegion">
                <option value="us" ${state.cgm.region !== 'ous' ? 'selected' : ''}>United States</option>
                <option value="ous" ${state.cgm.region === 'ous' ? 'selected' : ''}>Outside US</option>
              </select>
            </div>
            <div class="item-actions stack-actions">
              <button type="button" class="ok tap-lg" id="btnQuickConnectCgm">Connect Dexcom</button>
              <a class="button secondary tap-lg" href="dexcom://">Open Dexcom app</a>
            </div>
            <p class="connect-status ${state.cgm.lastError ? 'is-error' : ''}" id="quickCgmStatus" ${state.cgm.lastError ? '' : 'hidden'}>
              ${state.cgm.lastError ? esc(state.cgm.lastError) : ''}
            </p>
          </article>` : `
          <article class="item" style="margin-top:4px">
            <p class="item-title">
              ${esc(String(state.cgm.lastReading.mgdl))} mg/dL ${esc(state.cgm.lastReading.trend || '')}
            </p>
            <p class="item-meta">
              Source: ${esc(state.cgm.mode === 'dexcom_share' ? 'Dexcom Share' : 'Nightscout')}
              ${state.cgm.lastReading.at ? ' · ' + esc(new Date(state.cgm.lastReading.at).toLocaleTimeString()) : ''}
              ${state.cgm.lastError ? '<br><span class="badge warn">' + esc(state.cgm.lastError) + '</span>' : ''}
            </p>
            <div class="item-actions" style="margin-top:8px">
              <button type="button" class="secondary" id="btnDisconnectCgm">Change Dexcom account</button>
            </div>
          </article>`}
        <p class="item-meta">Low alert at ${esc(String(state.alertSettings.lowSugarThreshold))} ${esc(state.alertSettings.unit || 'mg/dL')}. If there is no OK within ${esc(String(state.alertSettings.responseSeconds))} seconds, family is alerted automatically.</p>
        <div class="item-actions" style="margin-top:10px">
          <button type="button" data-open="sugar">Log sugar</button>
          ${state.cgm && state.cgm.lastReading ? '<button type="button" class="secondary" id="btnRefreshCgm">Refresh CGM</button>' : ''}
          <button type="button" class="warn" id="btnHelpNow">I need help</button>
        </div>
        <p class="item-meta" style="margin-top:10px">
          ${(() => {
            const sugarVital = state.vitals.filter((v) => /blood sugar/i.test(v.kind)).sort((a, b) => b.at.localeCompare(a.at))[0];
            if (state.cgm && state.cgm.lastReading) {
              return 'Latest CGM: ' + esc(String(state.cgm.lastReading.mgdl)) + ' mg/dL';
            }
            return sugarVital ? ('Latest sugar: ' + esc(sugarVital.value) + (sugarVital.unit ? ' ' + esc(sugarVital.unit) : '')) : 'No sugar reading yet — connect Dexcom above or log manually.';
          })()}
        </p>
      </section>

      <section class="section">
        <div class="section-head"><h3>Insulin pump</h3></div>
        ${state.pump && state.pump.mode !== 'off' ? `
          <article class="item">
            <p class="item-title">
              ${state.pump.lastStatus && state.pump.lastStatus.iob != null
                ? ('IOB ' + esc(String(state.pump.lastStatus.iob)) + ' U')
                : (state.pump.brand && state.pump.brand !== 'unknown' ? esc(state.pump.brand) : 'Pump')}
              ${state.pump.lastStatus && state.pump.lastStatus.suspended ? ' · <span class="badge warn">Suspended</span>' : ''}
            </p>
            <p class="item-meta">
              ${state.pump.lastBolus && state.pump.lastBolus.insulin != null
                ? ('Last bolus ' + esc(String(state.pump.lastBolus.insulin)) + ' U · ' + esc(new Date(state.pump.lastBolus.at).toLocaleString()))
                : 'No recent bolus yet'}
              ${state.pump.lastStatus && state.pump.lastStatus.reservoir != null ? (' · Reservoir ' + esc(String(state.pump.lastStatus.reservoir)) + ' U') : ''}
              ${state.pump.lastStatus && state.pump.lastStatus.batteryPercent != null ? (' · Battery ' + esc(String(state.pump.lastStatus.batteryPercent)) + '%') : ''}
              ${state.pump.lastError ? '<br><span class="badge warn">' + esc(state.pump.lastError) + '</span>' : ''}
            </p>
          </article>` : `<div class="empty">Connect her pump via Nightscout in Settings, or log boluses manually.</div>`}
        <div class="item-actions" style="margin-top:10px">
          <button type="button" data-open="bolus">Log bolus</button>
          ${state.pump && state.pump.mode === 'nightscout' ? '<button type="button" class="secondary" id="btnRefreshPump">Refresh pump</button>' : ''}
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

  function renderBills() {
    const cases = (state.billing.cases || []).slice().reverse().slice(0, 10);
    const taskOptions = Object.keys(KathyBilling.TASKS).map((key) =>
      `<option value="${esc(key)}">${esc(KathyBilling.TASKS[key].label)}</option>`
    ).join('');
    return `
      <section class="section">
        <h2>Bills & insurance</h2>
        <p class="lede">Paste a bill or EOB. Get a plain-language read, appeal draft, call script, or error checklist — with optional AI.</p>
        <div class="field">
          <label for="billTask">Help me</label>
          <select id="billTask">${taskOptions}</select>
        </div>
        <div class="field">
          <label for="billDoc">Bill / EOB / letter text</label>
          <textarea id="billDoc" placeholder="Paste the statement, EOB, or denial letter here…"></textarea>
        </div>
        <div class="field">
          <label for="billQuestion">Extra question (optional)</label>
          <input id="billQuestion" placeholder="Why is my balance still $420 after insurance?">
        </div>
        <div class="item-actions">
          <button type="button" id="btnBillAssist">Get help</button>
          <button type="button" class="secondary" id="btnBillLocal">Local helper only</button>
        </div>
        <p class="disclaimer" style="margin-top:10px">Not legal advice. AI uses your alert worker + OpenAI key when configured; otherwise the built-in helper runs on-device.</p>
        <div class="field" style="margin-top:14px">
          <label for="billAnswer">Result</label>
          <textarea id="billAnswer" readonly placeholder="Guidance will appear here…"></textarea>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Saved billing help</h3></div>
        <div class="list">
          ${cases.length ? cases.map((c) => `
            <article class="item">
              <p class="item-title">${esc((KathyBilling.TASKS[c.task] && KathyBilling.TASKS[c.task].label) || c.task)}</p>
              <p class="item-meta">${new Date(c.at).toLocaleString()} · ${c.mode === 'ai' ? 'AI' : 'Local'}</p>
              <button type="button" class="ghost" data-load-bill="${esc(c.id)}">Open</button>
            </article>`).join('') : `<div class="empty">No billing sessions saved yet.</div>`}
        </div>
      </section>
    `;
  }

  function renderSettings() {
    const family = state.family || [];
    const webhookReady = Boolean((state.alertSettings.webhookUrl || '').trim());
    return `
      <section class="section">
        <h2>Settings</h2>
        <p class="lede">For alerts when Kathy cannot use the phone, set a webhook that texts family automatically.</p>
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
          <label for="webhookUrl">Alert webhook (required for no-response texts)</label>
          <input id="webhookUrl" value="${esc(state.alertSettings.webhookUrl || '')}" placeholder="https://kathy-health-alerts….workers.dev/alert">
        </div>
        <p class="disclaimer">${webhookReady
          ? 'Webhook saved — low-sugar timeouts will notify family without Kathy tapping Send.'
          : 'Without a webhook, the phone cannot text family if Kathy is unresponsive. Deploy kathy-health/alert-worker or use IFTTT/Zapier.'}</p>
        <div class="field">
          <label for="billingOpenAiKey">OpenAI API key for Bills AI (optional if worker has OPENAI_API_KEY)</label>
          <input id="billingOpenAiKey" type="password" value="${esc(state.billing.openaiKey || '')}" placeholder="sk-…">
        </div>
        <label class="disclaimer" style="display:flex;gap:8px;align-items:flex-start;margin:8px 0 12px">
          <input type="checkbox" id="billingPreferAi" ${state.billing.preferAi !== false ? 'checked' : ''}>
          <span>Prefer AI for Bills when a key/worker is available</span>
        </label>
        <div class="item-actions">
          <button type="button" id="btnSaveProfile">Save alert settings</button>
          <button type="button" class="secondary" id="btnTestAlert">Send test alert</button>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Dexcom / CGM</h3></div>
        <p class="lede">Connect the Dexcom app on this iPhone via Dexcom Share, then pull live glucose into Kathy’s Health.</p>
        <article class="item">
          <p class="item-title">iPhone setup (Michael’s phone test)</p>
          <p class="item-meta">
            1. Open the <strong>Dexcom</strong> app → Share → turn Sharing <strong>On</strong> (invite a follower if needed — you can invite yourself).<br>
            2. On <strong>Today</strong>, enter the same Dexcom username/password and tap <strong>Connect Dexcom</strong>.
          </p>
          <div class="item-actions">
            <a class="button secondary" href="dexcom://">Open Dexcom app</a>
            <button type="button" class="secondary" data-route-link="today">Back to Today</button>
          </div>
        </article>
        <div class="field">
          <label for="cgmMode">Source</label>
          <select id="cgmMode">
            <option value="off" ${state.cgm.mode === 'off' ? 'selected' : ''}>Off (manual only)</option>
            <option value="dexcom_share" ${state.cgm.mode === 'dexcom_share' ? 'selected' : ''}>Dexcom Share (from Dexcom app)</option>
            <option value="nightscout" ${state.cgm.mode === 'nightscout' ? 'selected' : ''}>Nightscout</option>
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="cgmAccount">Dexcom Share username</label>
            <input id="cgmAccount" value="${esc(state.cgm.accountName || '')}" autocomplete="username">
          </div>
          <div class="field">
            <label for="cgmPassword">Dexcom Share password</label>
            <input id="cgmPassword" type="password" value="${esc(state.cgm.password || '')}" autocomplete="current-password">
          </div>
        </div>
        <div class="field">
          <label for="cgmRegion">Dexcom region</label>
          <select id="cgmRegion">
            <option value="us" ${state.cgm.region !== 'ous' ? 'selected' : ''}>United States</option>
            <option value="ous" ${state.cgm.region === 'ous' ? 'selected' : ''}>Outside US</option>
          </select>
        </div>
        <div class="field">
          <label for="cgmNightscout">Nightscout URL (if using Nightscout)</label>
          <input id="cgmNightscout" value="${esc(state.cgm.nightscoutUrl || '')}" placeholder="https://yoursite.herokuapp.com">
        </div>
        <div class="field">
          <label for="cgmNsSecret">Nightscout API secret (optional)</label>
          <input id="cgmNsSecret" type="password" value="${esc(state.cgm.nightscoutSecret || '')}">
        </div>
        <div class="field">
          <label for="cgmPoll">Poll every (seconds)</label>
          <input id="cgmPoll" type="number" value="${esc(String(state.cgm.pollSeconds || 60))}">
        </div>
        <p class="disclaimer">Dexcom Share uses this phone’s Dexcom app account. Proxy URL defaults to this site (${esc(typeof location !== 'undefined' ? location.origin : '')}). Keep Kathy’s Health open (or reopen it) so polling can run.</p>
        <div class="item-actions">
          <button type="button" id="btnSaveCgm">Save CGM settings</button>
          <button type="button" class="secondary" id="btnTestCgm">Test CGM now</button>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Insulin pump</h3></div>
        <p class="lede">Pull IOB, reservoir, suspend status, and boluses from Nightscout (Loop, AndroidAPS, tconnectsync, Omnipod uploaders, etc.).</p>
        <div class="field">
          <label for="pumpMode">Source</label>
          <select id="pumpMode">
            <option value="off" ${state.pump.mode === 'off' ? 'selected' : ''}>Off</option>
            <option value="nightscout" ${state.pump.mode === 'nightscout' ? 'selected' : ''}>Nightscout</option>
            <option value="manual" ${state.pump.mode === 'manual' ? 'selected' : ''}>Manual logging only</option>
          </select>
        </div>
        <div class="field">
          <label for="pumpBrand">Pump / system</label>
          <select id="pumpBrand">
            <option value="unknown" ${state.pump.brand === 'unknown' ? 'selected' : ''}>Not sure</option>
            <option value="omnipod" ${state.pump.brand === 'omnipod' ? 'selected' : ''}>Omnipod</option>
            <option value="tandem" ${state.pump.brand === 'tandem' ? 'selected' : ''}>Tandem</option>
            <option value="medtronic" ${state.pump.brand === 'medtronic' ? 'selected' : ''}>Medtronic</option>
            <option value="loop" ${state.pump.brand === 'loop' ? 'selected' : ''}>Loop / AndroidAPS</option>
          </select>
        </div>
        <label class="disclaimer" style="display:flex;gap:8px;align-items:flex-start;margin:8px 0 12px">
          <input type="checkbox" id="pumpReuseNs" ${state.pump.reuseCgmNightscout ? 'checked' : ''}>
          <span>Use the same Nightscout URL as CGM</span>
        </label>
        <div class="field">
          <label for="pumpNightscout">Nightscout URL (if different)</label>
          <input id="pumpNightscout" value="${esc(state.pump.nightscoutUrl || '')}" placeholder="https://yoursite.herokuapp.com">
        </div>
        <div class="field">
          <label for="pumpNsSecret">Nightscout API secret</label>
          <input id="pumpNsSecret" type="password" value="${esc(state.pump.nightscoutSecret || '')}">
        </div>
        <p class="disclaimer">Tandem users often sync with tconnectsync → Nightscout. Omnipod/Loop uploaders that post device status will show IOB here.</p>
        <div class="item-actions">
          <button type="button" id="btnSavePump">Save pump settings</button>
          <button type="button" class="secondary" id="btnTestPump">Test pump now</button>
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
            </article>`).join('') : `<div class="empty">Add at least one family phone number for the alert worker to text.</div>`}
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
        <div class="item-actions" style="margin-top:12px">
          <button type="button" class="secondary" data-route-link="today">Back to Today</button>
        </div>
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

  function bolusForm() {
    return `
      <div class="field"><label for="bolusUnits">Bolus (units)</label><input id="bolusUnits" inputmode="decimal" placeholder="2.5"></div>
      <div class="field"><label for="bolusCarbs">Carbs (g, optional)</label><input id="bolusCarbs" inputmode="decimal" placeholder="30"></div>
      <div class="field"><label for="bolusNotes">Notes</label><textarea id="bolusNotes" placeholder="Meal bolus, correction…"></textarea></div>
      <div class="item-actions">
        <button type="button" id="modalSave">Save bolus</button>
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
    tabbar.hidden = false;
    headerDate.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    tabbar.querySelectorAll('.tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-route') === route);
    });

    if (route === 'settings') {
      // Keep tabs available; highlight none while editing settings.
      tabbar.querySelectorAll('.tab').forEach((btn) => btn.classList.remove('active'));
    }

    let html = '';
    if (route === 'today') html = renderToday();
    else if (route === 'meds') html = renderMeds();
    else if (route === 'log') html = renderLog();
    else if (route === 'care') html = renderCare();
    else if (route === 'bills') html = renderBills();
    else if (route === 'notes') html = renderNotes();
    else if (route === 'settings') html = renderSettings();
    main.innerHTML = html + renderModal() + renderAlertOverlay();
    bind();
    if (state.activeAlert && state.activeAlert.status === 'waiting') startAlertTimer();
    startCgmTimer();
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
        if (kind === 'bolus') openModal('Log bolus', bolusForm(), saveBolus);
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
    const refreshCgmBtn = document.getElementById('btnRefreshCgm');
    if (refreshCgmBtn) refreshCgmBtn.addEventListener('click', () => refreshCgm(true));
    // Connect Dexcom is handled via main click delegation so re-renders cannot drop the listener
    const disconnectCgm = document.getElementById('btnDisconnectCgm');
    if (disconnectCgm) {
      disconnectCgm.addEventListener('click', () => {
        state.cgm.lastReading = null;
        state.cgm.lastError = '';
        save();
        render();
      });
    }
    const refreshPumpBtn = document.getElementById('btnRefreshPump');
    if (refreshPumpBtn) refreshPumpBtn.addEventListener('click', () => refreshPump(true));
    const saveCgm = document.getElementById('btnSaveCgm');
    if (saveCgm) {
      saveCgm.addEventListener('click', () => {
        state.cgm.mode = document.getElementById('cgmMode').value;
        state.cgm.accountName = document.getElementById('cgmAccount').value.trim();
        state.cgm.password = document.getElementById('cgmPassword').value;
        state.cgm.region = document.getElementById('cgmRegion').value;
        state.cgm.nightscoutUrl = document.getElementById('cgmNightscout').value.trim();
        state.cgm.nightscoutSecret = document.getElementById('cgmNsSecret').value;
        state.cgm.pollSeconds = Math.max(30, Number(document.getElementById('cgmPoll').value || 60));
        if (!state.alertSettings.webhookUrl && typeof location !== 'undefined') {
          state.alertSettings.webhookUrl = location.origin + '/alert';
        }
        save();
        startCgmTimer();
        toast(state.cgm.mode === 'off' ? 'CGM off' : 'CGM settings saved');
        if (state.cgm.mode !== 'off') refreshCgm(true);
        else render();
      });
    }
    const testCgm = document.getElementById('btnTestCgm');
    if (testCgm) testCgm.addEventListener('click', () => {
      state.cgm.mode = document.getElementById('cgmMode').value || 'dexcom_share';
      state.cgm.accountName = document.getElementById('cgmAccount').value.trim();
      state.cgm.password = document.getElementById('cgmPassword').value;
      state.cgm.region = document.getElementById('cgmRegion').value;
      state.cgm.nightscoutUrl = document.getElementById('cgmNightscout').value.trim();
      state.cgm.nightscoutSecret = document.getElementById('cgmNsSecret').value;
      if (!state.alertSettings.webhookUrl && typeof location !== 'undefined') {
        state.alertSettings.webhookUrl = location.origin + '/alert';
      }
      save();
      refreshCgm(true);
    });
    const savePump = document.getElementById('btnSavePump');
    if (savePump) {
      savePump.addEventListener('click', () => {
        state.pump.mode = document.getElementById('pumpMode').value;
        state.pump.brand = document.getElementById('pumpBrand').value;
        state.pump.reuseCgmNightscout = document.getElementById('pumpReuseNs').checked;
        state.pump.nightscoutUrl = document.getElementById('pumpNightscout').value.trim();
        state.pump.nightscoutSecret = document.getElementById('pumpNsSecret').value;
        save();
        startCgmTimer();
        toast(state.pump.mode === 'off' ? 'Pump off' : 'Pump settings saved');
        if (state.pump.mode === 'nightscout') refreshPump(true);
        else render();
      });
    }
    const testPump = document.getElementById('btnTestPump');
    if (testPump) testPump.addEventListener('click', () => {
      state.pump.mode = document.getElementById('pumpMode').value;
      state.pump.brand = document.getElementById('pumpBrand').value;
      state.pump.reuseCgmNightscout = document.getElementById('pumpReuseNs').checked;
      state.pump.nightscoutUrl = document.getElementById('pumpNightscout').value.trim();
      state.pump.nightscoutSecret = document.getElementById('pumpNsSecret').value;
      save();
      if (state.pump.mode !== 'nightscout') {
        toast('Set pump source to Nightscout to test');
        return;
      }
      refreshPump(true);
    });
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

    async function runBilling(forceLocal) {
      const task = document.getElementById('billTask').value;
      const doc = document.getElementById('billDoc').value;
      const question = document.getElementById('billQuestion').value.trim();
      const answerEl = document.getElementById('billAnswer');
      if (!doc.trim() && !question) {
        toast('Paste a bill or ask a question');
        return;
      }
      const packed = KathyBilling.buildMessages(task, doc, state.profileName, question);
      let answer = '';
      let mode = 'local';
      const canAi = !forceLocal && state.billing.preferAi !== false && (state.billing.openaiKey || webhookBaseUrl());
      if (canAi) {
        try {
          answerEl.value = 'Asking billing AI…';
          const data = await KathyBilling.askWorker(webhookBaseUrl(), {
            system: packed.system,
            user: packed.user,
            apiKey: state.billing.openaiKey || undefined,
            task
          });
          answer = data.answer || '';
          mode = 'ai';
        } catch (err) {
          answer = KathyBilling.localAssist(task, doc, state.profileName) + '\n\n(AI unavailable: ' + String(err && err.message || err) + ')';
          mode = 'local';
        }
      } else {
        answer = KathyBilling.localAssist(task, doc, state.profileName);
      }
      answerEl.value = answer;
      state.billing.cases.push({
        id: uid('bill'),
        at: new Date().toISOString(),
        task,
        document: doc.slice(0, 8000),
        question,
        answer: answer.slice(0, 12000),
        mode
      });
      if (state.billing.cases.length > 40) state.billing.cases = state.billing.cases.slice(-40);
      save();
      toast(mode === 'ai' ? 'AI billing help ready' : 'Local billing help ready');
    }

    const billAssist = document.getElementById('btnBillAssist');
    if (billAssist) billAssist.addEventListener('click', () => runBilling(false));
    const billLocal = document.getElementById('btnBillLocal');
    if (billLocal) billLocal.addEventListener('click', () => runBilling(true));
    document.querySelectorAll('[data-load-bill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = (state.billing.cases || []).find((c) => c.id === btn.getAttribute('data-load-bill'));
        if (!item) return;
        document.getElementById('billTask').value = item.task;
        document.getElementById('billDoc').value = item.document || '';
        document.getElementById('billQuestion').value = item.question || '';
        document.getElementById('billAnswer').value = item.answer || '';
        toast('Loaded saved help');
      });
    });

    const saveProfile = document.getElementById('btnSaveProfile');
    if (saveProfile) {
      saveProfile.addEventListener('click', () => {
        state.profileName = document.getElementById('profileName').value.trim() || 'Kathy';
        state.alertSettings.lowSugarThreshold = Number(document.getElementById('lowSugar').value || 70);
        state.alertSettings.responseSeconds = Math.max(30, Number(document.getElementById('responseSeconds').value || 120));
        state.alertSettings.unit = document.getElementById('sugarUnit').value.trim() || 'mg/dL';
        state.alertSettings.webhookUrl = document.getElementById('webhookUrl').value.trim();
        const keyEl = document.getElementById('billingOpenAiKey');
        const preferEl = document.getElementById('billingPreferAi');
        if (keyEl) state.billing.openaiKey = keyEl.value.trim();
        if (preferEl) state.billing.preferAi = preferEl.checked;
        save();
        toast(state.alertSettings.webhookUrl ? 'Alert settings saved' : 'Saved — add a webhook for no-response texts');
        render();
      });
    }
    const testAlert = document.getElementById('btnTestAlert');
    if (testAlert) {
      testAlert.addEventListener('click', async () => {
        const webhook = (state.alertSettings.webhookUrl || '').trim();
        const family = state.family.filter((f) => f.phone);
        if (!webhook) {
          toast('Add an alert webhook first');
          return;
        }
        if (!family.length) {
          toast('Add a family phone number first');
          return;
        }
        const msg = KathyAlerts.buildAlertMessage(state.profileName, 'TEST', state.alertSettings.unit);
        const result = await KathyAlerts.postWebhook(webhook, KathyAlerts.alertPayload({
          type: 'kathy_health_test',
          reason: 'manual_test',
          profileName: state.profileName,
          sugarValue: 'TEST',
          unit: state.alertSettings.unit,
          message: msg,
          family: family.map((f) => ({ name: f.name, phone: f.phone, relation: f.relation || '' }))
        }));
        toast(result.ok ? 'Test alert sent' : 'Test alert failed');
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

  function saveBolus() {
    const insulin = Number(document.getElementById('bolusUnits').value);
    if (!Number.isFinite(insulin) || insulin <= 0) { toast('Enter bolus units'); return; }
    const carbsRaw = document.getElementById('bolusCarbs').value.trim();
    const carbs = carbsRaw ? Number(carbsRaw) : null;
    const event = {
      id: uid('bolus'),
      at: new Date().toISOString(),
      eventType: 'Bolus',
      insulin,
      carbs: Number.isFinite(carbs) ? carbs : null,
      notes: document.getElementById('bolusNotes').value.trim(),
      source: 'manual'
    };
    state.pump.manualEvents = (state.pump.manualEvents || []).concat(event).slice(-100);
    state.pump.lastBolus = event;
    if (state.pump.mode === 'off') state.pump.mode = 'manual';
    save();
    closeModal();
    toast('Bolus saved');
    render();
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

  // Stable Connect Dexcom handler (survives main.innerHTML re-renders)
  document.getElementById('main').addEventListener('click', (e) => {
    const connect = e.target.closest('#btnQuickConnectCgm');
    if (connect) {
      e.preventDefault();
      connectDexcomFromForm();
      return;
    }
    const disconnect = e.target.closest('#btnDisconnectCgm');
    if (disconnect) {
      e.preventDefault();
      state.cgm.lastReading = null;
      state.cgm.lastError = '';
      save();
      render();
    }
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

  startCgmTimer();
  if (state.onboarded && state.cgm && state.cgm.mode === 'nightscout' && state.cgm.nightscoutUrl) {
    refreshCgm(false);
  }
  if (state.onboarded && state.cgm && state.cgm.mode === 'dexcom_share' && state.cgm.accountName && state.cgm.password) {
    refreshCgm(false);
  }
  if (state.onboarded && state.pump && state.pump.mode === 'nightscout') {
    refreshPump(false);
  }

  render();
})();
