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
  P0172: { description: 'System Too Rich (Bank 1)', family: 'Powertrain', subsystem: 'air_fuel' },
  P0174: { description: 'System Too Lean (Bank 2)', family: 'Powertrain', subsystem: 'air_fuel' },
  P0175: { description: 'System Too Rich (Bank 2)', family: 'Powertrain', subsystem: 'air_fuel' },
  P0335: { description: 'Crankshaft Position Sensor A Circuit Malfunction', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0336: { description: 'Crankshaft Position Sensor A Circuit Range/Performance', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0420: { description: 'Catalyst System Efficiency Below Threshold (Bank 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0430: { description: 'Catalyst System Efficiency Below Threshold (Bank 2)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0480: { description: 'Cooling Fan 1 Control Circuit', family: 'Powertrain', subsystem: 'cooling' },
  P0521: { description: 'Engine Oil Pressure Sensor/Switch Range/Performance', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0522: { description: 'Engine Oil Pressure Sensor/Switch Low', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0700: { description: 'Transmission Control System (MIL Request)', family: 'Powertrain', subsystem: 'transmission' },
  P0101: { description: 'Mass or Volume Air Flow Circuit Range/Performance', family: 'Powertrain', subsystem: 'air_fuel' },
  P0102: { description: 'Mass or Volume Air Flow Circuit Low Input', family: 'Powertrain', subsystem: 'air_fuel' },
  P0106: { description: 'Manifold Absolute Pressure/BARO Sensor Range/Performance', family: 'Powertrain', subsystem: 'air_fuel' },
  P0107: { description: 'Manifold Absolute Pressure/BARO Sensor Low Input', family: 'Powertrain', subsystem: 'air_fuel' },
  P0112: { description: 'Intake Air Temperature Sensor 1 Circuit Low', family: 'Powertrain', subsystem: 'air_fuel' },
  P0113: { description: 'Intake Air Temperature Sensor 1 Circuit High', family: 'Powertrain', subsystem: 'air_fuel' },
  P0117: { description: 'Engine Coolant Temperature Sensor 1 Circuit Low', family: 'Powertrain', subsystem: 'cooling' },
  P0118: { description: 'Engine Coolant Temperature Sensor 1 Circuit High', family: 'Powertrain', subsystem: 'cooling' },
  P0121: { description: 'Throttle/Pedal Position Sensor A Circuit Range/Performance', family: 'Powertrain', subsystem: 'air_fuel' },
  P0122: { description: 'Throttle/Pedal Position Sensor A Circuit Low', family: 'Powertrain', subsystem: 'air_fuel' },
  P0128: { description: 'Coolant Thermostat (Coolant Temperature Below Thermostat Regulating Temperature)', family: 'Powertrain', subsystem: 'cooling' },
  P0131: { description: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0133: { description: 'O2 Sensor Circuit Slow Response (Bank 1 Sensor 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0134: { description: 'O2 Sensor Circuit No Activity Detected (Bank 1 Sensor 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0135: { description: 'O2 Sensor Heater Circuit (Bank 1 Sensor 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0137: { description: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 2)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0138: { description: 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 2)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0141: { description: 'O2 Sensor Heater Circuit (Bank 1 Sensor 2)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0155: { description: 'O2 Sensor Heater Circuit (Bank 2 Sensor 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0191: { description: 'Fuel Rail Pressure Sensor A Circuit Range/Performance', family: 'Powertrain', subsystem: 'air_fuel' },
  P0193: { description: 'Fuel Rail Pressure Sensor A Circuit High', family: 'Powertrain', subsystem: 'air_fuel' },
  P0201: { description: 'Injector Circuit/Open - Cylinder 1', family: 'Powertrain', subsystem: 'air_fuel' },
  P0202: { description: 'Injector Circuit/Open - Cylinder 2', family: 'Powertrain', subsystem: 'air_fuel' },
  P0203: { description: 'Injector Circuit/Open - Cylinder 3', family: 'Powertrain', subsystem: 'air_fuel' },
  P0204: { description: 'Injector Circuit/Open - Cylinder 4', family: 'Powertrain', subsystem: 'air_fuel' },
  P0205: { description: 'Injector Circuit/Open - Cylinder 5', family: 'Powertrain', subsystem: 'air_fuel' },
  P0206: { description: 'Injector Circuit/Open - Cylinder 6', family: 'Powertrain', subsystem: 'air_fuel' },
  P0207: { description: 'Injector Circuit/Open - Cylinder 7', family: 'Powertrain', subsystem: 'air_fuel' },
  P0208: { description: 'Injector Circuit/Open - Cylinder 8', family: 'Powertrain', subsystem: 'air_fuel' },
  P0230: { description: 'Fuel Pump Primary Circuit', family: 'Powertrain', subsystem: 'air_fuel' },
  P0299: { description: 'Turbocharger/Supercharger Underboost', family: 'Powertrain', subsystem: 'air_fuel' },
  P0325: { description: 'Knock Sensor 1 Circuit (Bank 1 or Single Sensor)', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0327: { description: 'Knock Sensor 1 Circuit Low (Bank 1 or Single Sensor)', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0340: { description: 'Camshaft Position Sensor A Circuit (Bank 1 or Single Sensor)', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0341: { description: 'Camshaft Position Sensor A Circuit Range/Performance (Bank 1)', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0351: { description: 'Ignition Coil A Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0352: { description: 'Ignition Coil B Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0353: { description: 'Ignition Coil C Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0354: { description: 'Ignition Coil D Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0355: { description: 'Ignition Coil E Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0356: { description: 'Ignition Coil F Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0357: { description: 'Ignition Coil G Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0358: { description: 'Ignition Coil H Primary/Secondary Circuit', family: 'Powertrain', subsystem: 'ignition_misfire' },
  P0401: { description: 'Exhaust Gas Recirculation Flow Insufficient Detected', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0403: { description: 'Exhaust Gas Recirculation Control Circuit', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0440: { description: 'Evaporative Emission System', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0441: { description: 'Evaporative Emission System Incorrect Purge Flow', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0442: { description: 'Evaporative Emission System Leak Detected (small leak)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0443: { description: 'Evaporative Emission System Purge Control Valve Circuit', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0446: { description: 'Evaporative Emission System Vent Control Circuit', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0449: { description: 'Evaporative Emission System Vent Valve/Solenoid Circuit', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0455: { description: 'Evaporative Emission System Leak Detected (large leak)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0456: { description: 'Evaporative Emission System Leak Detected (very small leak)', family: 'Powertrain', subsystem: 'emissions_evap' },
  P0463: { description: 'Fuel Level Sensor A Circuit High', family: 'Powertrain', subsystem: 'air_fuel' },
  P0500: { description: 'Vehicle Speed Sensor A', family: 'Powertrain', subsystem: 'driveline_chassis' },
  P0505: { description: 'Idle Control System', family: 'Powertrain', subsystem: 'air_fuel' },
  P0506: { description: 'Idle Control System RPM Lower Than Expected', family: 'Powertrain', subsystem: 'air_fuel' },
  P0507: { description: 'Idle Control System RPM Higher Than Expected', family: 'Powertrain', subsystem: 'air_fuel' },
  P0562: { description: 'System Voltage Low', family: 'Powertrain', subsystem: 'charging_voltage' },
  P0563: { description: 'System Voltage High', family: 'Powertrain', subsystem: 'charging_voltage' },
  P0601: { description: 'Internal Control Module Memory Check Sum Error', family: 'Powertrain', subsystem: 'network' },
  P0606: { description: 'Control Module Processor', family: 'Powertrain', subsystem: 'network' },
  P0641: { description: 'Sensor Reference Voltage A Circuit/Open', family: 'Powertrain', subsystem: 'network' },
  P0011: { description: 'Camshaft Position Timing Over-Advanced (Bank 1)', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0014: { description: 'Camshaft Position Timing Over-Retarded (Bank 1)', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0016: { description: 'Crankshaft Position-Camshaft Position Correlation (Bank 1 Sensor A)', family: 'Powertrain', subsystem: 'timing_oiling' },
  P0087: { description: 'Fuel Rail/System Pressure Too Low', family: 'Powertrain', subsystem: 'air_fuel' },
  P0685: { description: 'ECM/PCM Power Relay Control Circuit Open', family: 'Powertrain', subsystem: 'network' },
  P0705: { description: 'Transmission Range Sensor A Circuit (PRNDL Input)', family: 'Powertrain', subsystem: 'transmission' },
  P0706: { description: 'Transmission Range Sensor A Circuit Range/Performance', family: 'Powertrain', subsystem: 'transmission' },
  P0715: { description: 'Input/Turbine Speed Sensor A Circuit', family: 'Powertrain', subsystem: 'transmission' },
  P0720: { description: 'Output Shaft Speed Sensor Circuit', family: 'Powertrain', subsystem: 'transmission' },
  P0730: { description: 'Incorrect Gear Ratio', family: 'Powertrain', subsystem: 'transmission' },
  P0740: { description: 'Torque Converter Clutch Circuit/Open', family: 'Powertrain', subsystem: 'transmission' },
  P0741: { description: 'Torque Converter Clutch Performance/Stuck Off', family: 'Powertrain', subsystem: 'transmission' },
  P0750: { description: 'Shift Solenoid A', family: 'Powertrain', subsystem: 'transmission' },
  P2101: { description: 'Throttle Actuator Control Motor Circuit Range/Performance', family: 'Powertrain', subsystem: 'air_fuel' },
  P2135: { description: 'Throttle/Pedal Position Sensor/Switch A/B Voltage Correlation', family: 'Powertrain', subsystem: 'air_fuel' },
  P2195: { description: 'O2 Sensor Signal Biased/Stuck Lean (Bank 1 Sensor 1)', family: 'Powertrain', subsystem: 'emissions_evap' },
  U0073: { description: 'Control Module Communication Bus A Off', family: 'Network', subsystem: 'network' },
  U0101: { description: 'Lost Communication with TCM', family: 'Network', subsystem: 'network' },
  U0121: { description: 'Lost Communication With Anti-Lock Brake System (ABS) Control Module', family: 'Network', subsystem: 'network' },
  C0040: { description: 'Right Front Wheel Speed Sensor Circuit', family: 'Chassis', subsystem: 'abs_brakes' }
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
