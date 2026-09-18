#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'web', 'data', 'dtc-db.json');
const jsPath = path.join(__dirname, '..', 'web', 'data', 'dtc-db.js');

const db = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const byCode = new Map(db.map((item, idx) => [item.code, idx]));

function upsert(code, fields) {
  const idx = byCode.get(code);
  if (idx == null) {
    db.push({ code, family: 'Powertrain', subsystem: 'powertrain_general', description: '', ...fields });
    byCode.set(code, db.length - 1);
    return;
  }
  Object.assign(db[idx], fields);
}

const misfireFixes = {
  P0300: { description: 'Random/Multiple Cylinder Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0301: { description: 'Cylinder 1 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0302: { description: 'Cylinder 2 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0303: { description: 'Cylinder 3 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0304: { description: 'Cylinder 4 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0305: { description: 'Cylinder 5 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0306: { description: 'Cylinder 6 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0307: { description: 'Cylinder 7 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0308: { description: 'Cylinder 8 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0309: { description: 'Cylinder 9 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0310: { description: 'Cylinder 10 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0311: { description: 'Cylinder 11 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0312: { description: 'Cylinder 12 Misfire Detected', family: 'Powertrain', subsystem: 'ignition_misfire' }
};

for (const [code, fields] of Object.entries(misfireFixes)) upsert(code, fields);

if ((db[byCode.get('P0320')] || {}).description === 'Cylinder 12 Misfire Detected') {
  upsert('P0320', {
    description: 'Ignition/Distributor Engine Speed Input Circuit Malfunction',
    family: 'Powertrain',
    subsystem: 'ignition_misfire'
  });
}

const guidanceAligned = {
  P0171: { description: 'System Too Lean (Bank 1)', family: 'Powertrain', subsystem: 'air_fuel' },
  P0174: { description: 'System Too Lean (Bank 2)', family: 'Powertrain', subsystem: 'air_fuel' },
  P0335: { description: 'Crankshaft Position Sensor A Circuit Malfunction', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0420: { description: 'Catalyst System Efficiency Below Threshold (Bank 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0430: { description: 'Catalyst System Efficiency Below Threshold (Bank 2)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0480: { description: 'Cooling Fan 1 Control Circuit', family: 'Powertrain', subsystem: 'cooling' },
  P0521: { description: 'Engine Oil Pressure Sensor/Switch Range/Performance', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0700: { description: 'Transmission Control System (MIL Request)', family: 'Powertrain', subsystem: 'transmission' }
};
for (const [code, fields] of Object.entries(guidanceAligned)) upsert(code, fields);

if (!byCode.has('U0100')) {
  upsert('U0100', {
    description: 'Lost Communication With ECM/PCM "A"',
    family: 'Network',
    subsystem: 'network'
  });
}
if (!byCode.has('C0035')) {
  upsert('C0035', {
    description: 'Left Front Wheel Speed Sensor Circuit',
    family: 'Chassis',
    subsystem: 'abs_brakes'
  });
}

const json = JSON.stringify(db);
fs.writeFileSync(jsonPath, json);
fs.writeFileSync(jsPath, 'window.DTC_DB_DATA = ' + json + ';\n');

const p0300 = db.find((x) => x.code === 'P0300');
console.log('Wrote', db.length, 'codes. P0300=', p0300.description, p0300.subsystem);
