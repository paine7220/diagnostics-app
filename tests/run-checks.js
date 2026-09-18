#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log('ok  ', name);
  } catch (err) {
    failed += 1;
    console.error('FAIL', name, '-', err.message);
  }
}

const indexHtml = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const engineSrc = fs.readFileSync(path.join(web, 'diagnosticsEngine.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'windows', 'package.json'), 'utf8'));
const dtcJs = fs.readFileSync(path.join(web, 'data', 'dtc-db.js'), 'utf8');
const dtcJson = JSON.parse(fs.readFileSync(path.join(web, 'data', 'dtc-db.json'), 'utf8'));

check('index.html loads real script files', () => {
  assert.match(indexHtml, /src="\.\/data\/dtc-db\.js"/);
  assert.match(indexHtml, /src="\.\/diagnosticsEngine\.js"/);
  assert.match(indexHtml, /src="\.\/app\.js"/);
});

check('button ids used by app.js exist in index.html', () => {
  const ids = [
    'btnRunDiagnosisTop', 'btnLookupTop', 'btnSaveCaseTop', 'btnExportTop',
    'btnLookup', 'btnSearchDtc', 'btnClearCodes', 'btnRunDiagnosis',
    'btnSaveCase', 'btnLoadCase', 'btnClearCase', 'btnExport',
    'btnAudioRecord', 'btnAudioUpload', 'btnStartCamera', 'btnVideoUpload',
    'btnCaptureFrame', 'btnStopCamera', 'btnPhotoUpload', 'acceptLegal',
    'codes', 'dbQuery', 'results', 'fluidOut', 'appVersion', 'solutionQuery', 'allSolutions'
  ];
  for (const id of ids) {
    assert.ok(indexHtml.includes(`id="${id}"`), 'missing id ' + id);
  }
});

check('windows package is 1.2.0 with Trusted Signing intact', () => {
  assert.strictEqual(pkg.version, '1.2.0');
  assert.strictEqual(pkg.scripts['dist:win'], 'electron-builder --win nsis portable');
  const azure = pkg.build.win.azureSignOptions;
  assert.strictEqual(azure.codeSigningAccountName, 'ravin-ai-signing');
  assert.strictEqual(azure.certificateProfileName, 'ravin-ai-public');
  assert.strictEqual(azure.endpoint, 'https://eus.codesigning.azure.net/');
  assert.match(azure.publisherName, /Michael Paine/);
  assert.ok(pkg.build.files.includes('preload.js'));
  assert.ok(fs.existsSync(path.join(root, 'windows', 'BUILD_WINDOWS_INSTALLER.bat')));
  assert.ok(fs.existsSync(path.join(root, 'windows', 'START_APP_FOR_TESTING.bat')));
});

check('branding is Dummies, not Dummys', () => {
  const files = [
    path.join(root, 'README.md'),
    path.join(web, 'index.html'),
    path.join(web, 'manifest.webmanifest'),
    path.join(root, 'windows', 'package.json'),
    path.join(root, 'windows', 'main.js')
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').replace(/not Dummys/g, '');
    assert.doesNotMatch(text, /Dummys/);
    assert.match(text, /Dummies/);
  }
});

check('P0300 and sibling misfire descriptions', () => {
  const byCode = Object.fromEntries(dtcJson.map((row) => [row.code, row]));
  assert.strictEqual(byCode.P0300.description, 'Random/Multiple Cylinder Misfire Detected');
  assert.strictEqual(byCode.P0300.subsystem, 'ignition_misfire');
  for (let cyl = 1; cyl <= 12; cyl++) {
    const code = 'P0' + (300 + cyl);
    assert.strictEqual(byCode[code].description, `Cylinder ${cyl} Misfire Detected`, code);
  }
  assert.notStrictEqual(byCode.P0320.description, 'Cylinder 12 Misfire Detected');
  assert.ok(dtcJson.length >= 4777);
});

check('dtc-db.js exports window.DTC_DB_DATA matching JSON', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(dtcJs, sandbox);
  assert.ok(Array.isArray(sandbox.window.DTC_DB_DATA));
  assert.strictEqual(sandbox.window.DTC_DB_DATA.length, dtcJson.length);
  const p0300 = sandbox.window.DTC_DB_DATA.find((row) => row.code === 'P0300');
  assert.strictEqual(p0300.description, 'Random/Multiple Cylinder Misfire Detected');
});

check('DiagEngine lookup and analysis for P0300', () => {
  const sandbox = { module: { exports: {} }, window: {} };
  vm.runInNewContext(dtcJs + '\n' + engineSrc + '\nmodule.exports = DiagEngine;', sandbox);
  const engine = sandbox.module.exports;
  assert.strictEqual(engine.APP_VERSION, '1.2.0');
  const found = engine.lookupCodes(sandbox.window.DTC_DB_DATA, ['P0300'])[0];
  assert.strictEqual(found.description, 'Random/Multiple Cylinder Misfire Detected');
  assert.ok(found.detailed);
  assert.ok(found.detailed.diySteps && found.detailed.diySteps.length > 3);
  const analysis = engine.buildAnalysis({
    vehicle: { year: '2014', make: 'Chevy', model: 'Sierra' },
    dtcs: ['P0300'],
    symptoms: ['Misfire'],
    notes: '',
    fluid: {},
    mediaSummary: {}
  }, sandbox.window.DTC_DB_DATA);
  assert.ok(analysis.summary.primaryFinding);
  assert.ok(analysis.codeCards.some((card) => card.code === 'P0300' && /Random\/Multiple/.test(card.description)));
  assert.ok(analysis.warnings.some((line) => /misfire/i.test(line)));
});

check('every bundled DTC has DIY steps', () => {
  const sandbox = { module: { exports: {} }, window: {} };
  vm.runInNewContext(dtcJs + '\n' + engineSrc + '\nmodule.exports = DiagEngine;', sandbox);
  const engine = sandbox.module.exports;
  const db = sandbox.window.DTC_DB_DATA;
  const found = engine.lookupCodes(db, db.map((row) => row.code));
  const missing = found.filter((row) => !row.detailed || !row.detailed.diySteps || !row.detailed.diySteps.length).map((row) => row.code);
  assert.strictEqual(found.length, db.length);
  assert.strictEqual(missing.length, 0, 'missing DIY for ' + missing.slice(0, 10).join(','));
  assert.ok(engine.listRepairPlaybooks().length >= 40);
});

check('SAE-aligned common codes have unique DIY', () => {
  const sandbox = { module: { exports: {} }, window: {} };
  vm.runInNewContext(dtcJs + '\n' + engineSrc + '\nmodule.exports = DiagEngine;', sandbox);
  const engine = sandbox.module.exports;
  const db = sandbox.window.DTC_DB_DATA;
  const byCode = Object.fromEntries(dtcJson.map((row) => [row.code, row]));
  const expected = {
    P0101: 'Mass or Volume Air Flow Circuit Range/Performance',
    P0442: 'Evaporative Emission System Leak Detected (small leak)',
    P0440: 'Evaporative Emission System',
    P0500: 'Vehicle Speed Sensor A',
    P0011: 'Camshaft Position Timing Over-Advanced (Bank 1)',
    P0087: 'Fuel Rail/System Pressure Too Low',
    P0401: 'Exhaust Gas Recirculation Flow Insufficient Detected',
    P2135: 'Throttle/Pedal Position Sensor/Switch A/B Voltage Correlation',
    P0340: 'Camshaft Position Sensor A Circuit (Bank 1 or Single Sensor)',
    P0562: 'System Voltage Low',
    P0705: 'Transmission Range Sensor A Circuit (PRNDL Input)',
    P2195: 'O2 Sensor Signal Biased/Stuck Lean (Bank 1 Sensor 1)'
  };
  for (const [code, description] of Object.entries(expected)) {
    assert.ok(byCode[code], 'missing DB row ' + code);
    assert.strictEqual(byCode[code].description, description, code);
    const row = engine.lookupCodes(db, [code])[0];
    assert.ok(row.detailed && row.detailed.diySteps && row.detailed.diySteps.length >= 4, code + ' DIY');
    assert.notStrictEqual(row.detailed.title, row.description);
  }
  const maf = engine.lookupCodes(db, ['P0101'])[0];
  assert.match(maf.detailed.diySteps.join(' '), /MAF/i);
  const vss = engine.lookupCodes(db, ['P0500'])[0];
  assert.match(vss.detailed.diySteps.join(' '), /speed/i);
  const evap = engine.lookupCodes(db, ['P0442'])[0];
  assert.match(evap.detailed.diySteps.join(' '), /gas cap/i);
  const tps = engine.lookupCodes(db, ['P2135'])[0];
  assert.match(tps.detailed.diySteps.join(' '), /throttle/i);
});

check('app.js talks to DiagEngine and DTC_DB_DATA', () => {
  assert.match(appSrc, /window\.DTC_DB_DATA/);
  assert.match(appSrc, /DiagEngine\.lookupCodes/);
  assert.match(appSrc, /DiagEngine\.buildAnalysis/);
  assert.match(appSrc, /1\.2\.0/);
});

check('no CDI Genius module', () => {
  assert.doesNotMatch(appSrc, /cdi.?genius/i);
  assert.doesNotMatch(engineSrc, /cdi.?genius/i);
});

check('Cloudflare Workers static-asset config points at web/', () => {
  const wrangler = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(wrangler, /"name": "noisy-pond-2dc8"/);
  assert.match(wrangler, /"directory": "\.\/web"/);
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(rootPkg.scripts && rootPkg.scripts.build);
});

check('web and windows/app stay in lockstep for key files', () => {
  const names = ['index.html', 'app.js', 'diagnosticsEngine.js', 'styles.css'];
  for (const name of names) {
    const a = fs.readFileSync(path.join(web, name), 'utf8');
    const b = fs.readFileSync(path.join(root, 'windows', 'app', name), 'utf8');
    assert.strictEqual(a, b, name + ' drifted');
  }
  const webP0300 = JSON.parse(fs.readFileSync(path.join(web, 'data', 'dtc-db.json'), 'utf8')).find((r) => r.code === 'P0300');
  const winP0300 = JSON.parse(fs.readFileSync(path.join(root, 'windows', 'app', 'data', 'dtc-db.json'), 'utf8')).find((r) => r.code === 'P0300');
  assert.strictEqual(webP0300.description, winP0300.description);
});

if (failed) {
  console.error('\n' + failed + ' check(s) failed');
  process.exit(1);
}
console.log('\nAll checks passed');
