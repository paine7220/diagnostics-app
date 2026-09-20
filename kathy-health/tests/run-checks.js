const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.join(__dirname, "..");
const web = path.join(root, "web");

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log("ok -", msg);
}

function read(rel) {
  return fs.readFileSync(path.join(web, rel), "utf8");
}

// Files exist
for (const f of [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "docs/privacy.html",
  "docs/disclaimer.html",
]) {
  ok(fs.existsSync(path.join(web, f)), `exists ${f}`);
}

const html = read("index.html");
ok(html.includes("Kathy Health"), "brand in index.html");
ok(html.includes('id="view-welcome"'), "welcome view");
ok(html.includes('data-nav="today"'), "today tab");
ok(html.includes('data-nav="meds"'), "meds tab");
ok(html.includes("./app.js"), "loads app.js");

const css = read("styles.css");
ok(css.includes("--teal-deep"), "design tokens");
ok(css.includes("Fraunces") || css.includes("font-display"), "display font token");

const js = read("app.js");
ok(js.includes("kathy-health-v1"), "storage key");
ok(js.includes("window.KathyHealth"), "test hook");

// Logic unit tests via vm + fake localStorage
const localStorage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
})();

const documentStub = {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: {},
};

const windowStub = {
  localStorage,
  scrollTo: () => {},
  addEventListener: () => {},
  structuredClone: (x) => JSON.parse(JSON.stringify(x)),
};

// Minimal DOM for boot
const elements = {};
function makeEl(id) {
  const el = {
    id,
    hidden: false,
    textContent: "",
    innerHTML: "",
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    addEventListener: () => {},
    style: {},
  };
  elements[id] = el;
  return el;
}

["app", "view-welcome", "topbar", "main", "tabbar", "sheet", "sheet-title", "sheet-body", "toast", "btn-start", "btn-settings"].forEach(makeEl);

documentStub.querySelector = (sel) => {
  if (sel.startsWith("#")) return elements[sel.slice(1)] || { addEventListener: () => {}, classList: { toggle: () => {} }, hidden: false };
  if (sel === ".tab" || sel === ".panel-view") return null;
  return { addEventListener: () => {}, classList: { toggle: () => {} }, hidden: false };
};
documentStub.querySelectorAll = () => [];

windowStub.document = documentStub;
global.window = windowStub;
global.document = documentStub;
global.localStorage = localStorage;
global.structuredClone = windowStub.structuredClone;

vm.runInNewContext(js + "\nthis.KathyHealth = window.KathyHealth;", {
  window: windowStub,
  document: documentStub,
  localStorage,
  structuredClone: windowStub.structuredClone,
  Date,
  Math,
  JSON,
  String,
  Number,
  console,
  setTimeout,
  clearTimeout,
  confirm: () => false,
  URL,
  Blob: class {
    constructor(parts) {
      this.parts = parts;
    }
  },
});

// Re-run in a cleaner way: extract pure helpers by evaluating after injecting DOM that doesn't throw
// The app boots and attaches KathyHealth on windowStub
const KH = windowStub.KathyHealth;
ok(KH, "KathyHealth global");
ok(KH.normalizeTime("8:00") === "08:00", "normalizeTime pads hour");
ok(KH.normalizeTime("20:30") === "20:30", "normalizeTime keeps valid");
ok(KH.normalizeTime("25:00") === null, "normalizeTime rejects invalid");
ok(JSON.stringify(KH.parseTimes("8:00, 20:00")) === JSON.stringify(["08:00", "20:00"]), "parseTimes");

KH.reset();
KH.setState({
  onboarded: true,
  profileName: "Kathy",
  meds: [
    {
      id: "m1",
      name: "Vitamin D",
      dose: "1000 IU",
      times: ["08:00"],
      notes: "",
      active: true,
    },
  ],
  doses: [],
  symptoms: [],
  vitals: [],
  appointments: [],
  providers: [],
  doctorNotes: "",
});

const slots = KH.todaysMedSlots();
ok(slots.length === 1, "todaysMedSlots returns active med");
ok(slots[0].med.name === "Vitamin D", "slot med name");
ok(slots[0].status === "pending", "slot pending by default");

// Root package identity for this product folder
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
ok(pkg.name === "kathy-health", "package name");

console.log("\nAll Kathy Health checks passed.");
