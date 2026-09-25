const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');

function mustExist(rel) {
  const p = path.join(root, rel);
  assert.ok(fs.existsSync(p), 'missing ' + rel);
}

mustExist('README.md');
mustExist('web/index.html');
mustExist('web/app.js');
mustExist('web/billing.js');
mustExist('web/pump.js');
mustExist('web/dexcom.js');
mustExist('web/alerts.js');
mustExist('web/notes-import.js');
mustExist('web/styles.css');
mustExist('web/sw.js');
mustExist('web/manifest.webmanifest');
mustExist('web/privacy.html');
mustExist('web/icons/icon-192.png');
mustExist('web/icons/icon-512.png');
mustExist('ios/capacitor.config.json');
mustExist('docs/IPHONE.md');

const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
assert.ok(html.includes("Kathy’s Health") || html.includes("Kathy's Health"), 'brand in html');
assert.ok(html.includes('billing.js'), 'billing script');
assert.ok(html.includes('dexcom.js'), 'dexcom script');
assert.ok(html.includes('alerts.js'), 'alerts script');
assert.ok(html.includes('notes-import.js'), 'notes import script');
assert.ok(html.includes('app.js'), 'app script');
assert.ok(html.includes('Bills'), 'bills tab');

const css = fs.readFileSync(path.join(web, 'styles.css'), 'utf8');
assert.ok(css.includes('--brand'), 'css variables');
assert.ok(css.includes('hero-screen'), 'hero styles');
assert.ok(css.includes('alert-overlay'), 'alert overlay styles');

const importSrc = fs.readFileSync(path.join(web, 'notes-import.js'), 'utf8');
const alertSrc = fs.readFileSync(path.join(web, 'alerts.js'), 'utf8');
const dexcomSrc = fs.readFileSync(path.join(web, 'dexcom.js'), 'utf8');
const pumpSrc = fs.readFileSync(path.join(web, 'pump.js'), 'utf8');
const billingSrc = fs.readFileSync(path.join(web, 'billing.js'), 'utf8');
const sandbox = { window: {}, console, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(importSrc, sandbox);
vm.runInContext(alertSrc, sandbox);
vm.runInContext(dexcomSrc, sandbox);
vm.runInContext(pumpSrc, sandbox);
vm.runInContext(billingSrc, sandbox);
const { importNotes } = sandbox.window.KathyNotesImport;
const Alerts = sandbox.window.KathyAlerts;
const Dexcom = sandbox.window.KathyDexcom;
const Pump = sandbox.window.KathyPump;
const Billing = sandbox.window.KathyBilling;

assert.ok(Alerts.isLowSugar('65', 70), '65 is low');
assert.ok(!Alerts.isLowSugar('110', 70), '110 is not low');
assert.ok(Alerts.smsUrl('555-123-4567', 'help').startsWith('sms:'), 'sms url');
assert.ok(/low blood sugar/i.test(Alerts.buildAlertMessage('Kathy', '55', 'mg/dL')), 'alert message');
assert.ok(typeof Alerts.postWebhook === 'function', 'webhook helper');
assert.ok(Alerts.alertPayload({ message: 'x', family: [] }).type, 'payload helper');
assert.ok(Dexcom.normalizeNightscoutEntry({ sgv: 55, date: Date.now() }).mgdl === 55, 'nightscout normalize');
assert.ok(Dexcom.trendArrow('SingleDown') === '↓', 'trend arrow');
assert.ok(Pump.normalizeDeviceStatus({ openaps: { iob: { iob: 1.2 } }, pump: { status: { suspended: true }, reservoir: 80 } }).iob === 1.2, 'pump iob');
assert.ok(Pump.normalizeTreatment({ eventType: 'Bolus', insulin: 2, created_at: new Date().toISOString() }).insulin === 2, 'bolus');
assert.ok(html.includes('pump.js'), 'pump script');
assert.ok(/appeal/i.test(Billing.localAssist('appeal', 'Denial $120', 'Kathy')), 'billing local appeal');
assert.ok(Billing.buildMessages('explain', 'EOB', 'Kathy').system, 'billing prompt');

const worker = fs.readFileSync(path.join(root, 'alert-worker/src/index.js'), 'utf8');
assert.ok(worker.includes('sendTwilioSms'), 'twilio sms path');
assert.ok(worker.includes('/alert'), 'alert route');
assert.ok(worker.includes('/dexcom/latest'), 'dexcom proxy route');
assert.ok(worker.includes('/billing/assist'), 'billing ai route');
assert.ok(worker.includes('LoginPublisherAccountByName'), 'dexcom share login');

const sample = `
Medications
- Lisinopril 10mg once daily
- Metformin 500mg twice a day

Appointments
- Dr. Lee follow-up 2026-10-20 10:00

Contacts
- Dr. Lee primary care 555-123-4567

Questions
- Ask about morning dizziness?
`;

const result = importNotes(sample);
assert.ok(result.meds.length >= 2, 'should parse meds, got ' + result.meds.length);
assert.ok(result.meds.some((m) => /Lisinopril/i.test(m.name)), 'lisinopril');
assert.ok(result.appointments.length >= 1, 'appointments');
assert.ok(result.contacts.length >= 1, 'contacts');
assert.ok(result.questions.length >= 1, 'questions');

const appSrc = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
assert.ok(appSrc.includes('kathy_health_v1'), 'storage key');
assert.ok(appSrc.includes('Import notes'), 'import UI');
assert.ok(appSrc.includes('beginLowSugarAlert'), 'low sugar alert flow');
assert.ok(appSrc.includes('dispatchFamilyAlert'), 'family alert dispatch');
assert.ok(appSrc.includes('family'), 'family contacts');
assert.ok(appSrc.includes('refreshCgm'), 'cgm refresh');
assert.ok(appSrc.includes('dexcom_share'), 'dexcom share mode');
assert.ok(appSrc.includes('refreshPump'), 'pump refresh');
assert.ok(appSrc.includes('Insulin pump'), 'pump UI');
assert.ok(appSrc.includes('renderBills'), 'bills UI');
assert.ok(appSrc.includes('btnQuickConnectCgm'), 'quick dexcom connect');
assert.ok(appSrc.includes('connect-status'), 'durable dexcom status');
assert.ok(appSrc.includes('btnDisconnectCgm'), 'change dexcom account');
assert.ok(css.includes('tap-lg'), 'large tap targets');
assert.ok(css.includes('connect-status'), 'connect status styles');

console.log('kathy-health checks passed');
