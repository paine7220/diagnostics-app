/* Client-side diagnostics engine.
   Ported from the ProBuild Node server (server.js) so the app runs fully
   offline inside the iOS WebView with no local HTTP server required. */

const DiagEngine = (() => {
  const APP_VERSION = '1.2.0';

  function misfireGuide(title) {
    return {
      title,
      firstChecks: [
        'Check battery voltage and charging output.',
        'Inspect spark plugs and coil boots on the affected cylinder(s).',
        'Check for vacuum leaks around intake and PCV hoses.',
        'Check fuel pressure if available.',
        'Swap a coil or plug to another cylinder when practical to see if the misfire follows the part.'
      ],
      likelyParts: ['Spark plugs', 'Ignition coil(s)', 'Vacuum hose / intake boot', 'Injector or fuel pump'],
      warnings: ['A flashing MIL means catalyst-damaging misfire; stop hard driving.']
    };
  }

  const DETAILED_GUIDANCE = {
    P0300: misfireGuide('Random / multiple cylinder misfire'),
    P0171: { title: 'Bank 1 lean', firstChecks: ['Inspect intake duct for splits after the MAF.', 'Check PCV and brake booster hoses.', 'Clean the MAF only with MAF cleaner.', 'Check fuel trims and fuel pressure if available.'], likelyParts: ['MAF sensor', 'Vacuum hose', 'Intake gasket', 'Fuel pump / filter'], warnings: ['Do not replace oxygen sensors first unless testing points there.'] },
    P0174: { title: 'Bank 2 lean', firstChecks: ['Check for bank-to-bank intake leaks.', 'Inspect MAF data and intake ducting.', 'Check for low fuel pressure under load.'], likelyParts: ['MAF sensor', 'Vacuum hose', 'Fuel pump', 'Intake gasket'], warnings: ['Lean codes plus misfire can overheat catalytic converters.'] },
    P0449: { title: 'EVAP vent control circuit', firstChecks: ['Inspect vent solenoid wiring near the tank.', 'Check the vent valve connector for corrosion.', 'Check fuse / power feed to the circuit.'], likelyParts: ['EVAP vent solenoid', 'Connector pigtail', 'Harness repair'], warnings: ['This is usually not a drivability emergency unless fuel smell is present.'] },
    P0480: { title: 'Cooling fan control circuit', firstChecks: ['Check cooling fan fuses and relay.', 'Inspect fan connector for melted pins.', 'Confirm the fan can run when commanded.'], likelyParts: ['Fan relay', 'Cooling fan motor', 'Harness repair'], warnings: ['Overheating risk. Do not idle the vehicle hot while testing.'] },
    P0521: { title: 'Oil pressure sensor/range', firstChecks: ['Verify oil level immediately.', 'Listen for real valvetrain or bottom-end noise.', 'Use a mechanical gauge if available before condemning the engine.'], likelyParts: ['Oil pressure sender', 'Oil filter / oil', 'Oil pump or pickup screen'], warnings: ['If the engine is knocking or oil is low, shut it down.'] },
    P0128: { title: 'Thermostat below regulating temperature', firstChecks: ['Check coolant level when cold.', 'Confirm slow warm-up and weak cabin heat.', 'Replace thermostat if the pattern is repeatable.'], likelyParts: ['Thermostat', 'Coolant', 'Coolant temp sensor if confirmed'], warnings: ['Do not open a hot cooling system.'] },
    P0335: { title: 'Crankshaft position sensor circuit', firstChecks: ['Inspect CKP sensor connector.', 'Check wiring near exhaust or moving parts.', 'Verify battery voltage during cranking.'], likelyParts: ['Crankshaft position sensor', 'Harness repair', 'Starter / battery issue if voltage collapses'], warnings: ['A crank sensor fault can cause sudden stalling or no-start.'] },
    P0700: { title: 'Transmission control request code', firstChecks: ['Pull transmission-specific codes if possible.', 'Check fluid level and condition exactly per service procedure.', 'Inspect main transmission connector.'], likelyParts: ['Depends on companion code', 'Fluid / filter', 'Internal harness / solenoid'], warnings: ['Avoid repeated slip or towing until diagnosed.'] },
    U0100: { title: 'Lost communication with ECM/PCM', firstChecks: ['Check battery state of charge.', 'Inspect engine and body grounds.', 'Check module fuses and CAN wiring.'], likelyParts: ['Ground repair', 'Fuse / power feed repair', 'Network repair'], warnings: ['Low voltage can create false network faults.'] },
    C0035: { title: 'LF wheel speed sensor', firstChecks: ['Inspect the left-front wheel speed sensor harness.', 'Check for rust jacking or debris at the tone ring.', 'Check wheel bearing play.'], likelyParts: ['Wheel speed sensor', 'Harness repair', 'Hub / bearing if tone signal is unstable'], warnings: ['ABS and traction control may be reduced until repaired.'] },
    P0420: { title: 'Bank 1 catalyst efficiency', firstChecks: ['Repair upstream misfire, lean, or rich codes first.', 'Inspect exhaust leaks before the rear O2 sensor.', 'Confirm fuel and ignition condition before condemning the converter.'], likelyParts: ['Upstream ignition / fuel repair', 'Exhaust leak repair', 'Catalytic converter only after proof'], warnings: ['Do not replace a converter until upstream causes are ruled out.'] },
    P0430: { title: 'Bank 2 catalyst efficiency', firstChecks: ['Repair upstream misfire, lean, or rich codes first.', 'Inspect exhaust leaks before the rear O2 sensor.', 'Compare bank-to-bank fuel trims and misfire counts.'], likelyParts: ['Upstream ignition / fuel repair', 'Exhaust leak repair', 'Catalytic converter only after proof'], warnings: ['Do not replace a converter until upstream causes are ruled out.'] }
  };

  for (let cyl = 1; cyl <= 12; cyl++) {
    const code = 'P0' + (300 + cyl);
    if (!DETAILED_GUIDANCE[code]) DETAILED_GUIDANCE[code] = misfireGuide('Cylinder ' + cyl + ' misfire');
  }

  const SYMPTOM_RULES = [
    { match: 'No crank', add: [['starting_charging', 28, 'symptom: no crank']] },
    { match: 'Cranks no start', add: [['ignition_misfire', 14, 'symptom: cranks no start'], ['air_fuel', 18, 'symptom: cranks no start'], ['timing_oiling', 8, 'symptom: cranks no start']] },
    { match: 'Hard start', add: [['air_fuel', 14, 'symptom: hard start'], ['charging_voltage', 8, 'symptom: hard start']] },
    { match: 'Rough idle', add: [['air_fuel', 14, 'symptom: rough idle'], ['ignition_misfire', 12, 'symptom: rough idle']] },
    { match: 'Misfire', add: [['ignition_misfire', 26, 'symptom: misfire']] },
    { match: 'Overheating', add: [['cooling', 30, 'symptom: overheating']] },
    { match: 'Tick', add: [['timing_oiling', 18, 'symptom: tick']] },
    { match: 'Knock', add: [['timing_oiling', 22, 'symptom: knock'], ['engine_mechanical', 26, 'symptom: knock']] },
    { match: 'Squeal', add: [['belt_drive', 18, 'symptom: squeal']] },
    { match: 'Charging problem', add: [['charging_voltage', 24, 'symptom: charging problem']] },
    { match: 'Battery light', add: [['charging_voltage', 28, 'symptom: battery light']] },
    { match: 'Transmission slip', add: [['transmission', 30, 'symptom: transmission slip']] },
    { match: 'ABS / brake issue', add: [['abs_brakes', 24, 'symptom: ABS / brake issue']] },
    { match: 'Electrical weirdness', add: [['network', 18, 'symptom: electrical weirdness'], ['body_electrical', 16, 'symptom: electrical weirdness'], ['charging_voltage', 14, 'symptom: electrical weirdness']] },
    { match: 'No heat', add: [['cooling', 14, 'symptom: no heat']] }
  ];

  const SUBSYSTEM_LABELS = {
    network: 'Network / module communication issue',
    airbag_safety: 'Airbag / SRS circuit issue',
    abs_brakes: 'ABS / brake / wheel-speed issue',
    charging_voltage: 'Battery / alternator / voltage issue',
    cooling: 'Cooling system / thermostat / fan issue',
    emissions_evap: 'EVAP / emissions / exhaust issue',
    air_fuel: 'Air / fuel / intake metering issue',
    ignition_misfire: 'Ignition / misfire issue',
    timing_oiling: 'Timing / oil pressure / cam-crank issue',
    transmission: 'Transmission / shift / converter issue',
    body_electrical: 'Body electrical / switch / module issue',
    driveline_chassis: 'Chassis / driveline issue',
    powertrain_general: 'General powertrain issue',
    starting_charging: 'Starting / crank power path issue',
    engine_mechanical: 'Internal engine mechanical risk',
    belt_drive: 'Belt / pulley / accessory drive issue',
    general: 'General diagnostic path'
  };

  function computeStats(dtcDb) {
    return dtcDb.reduce((acc, item) => {
      acc.total += 1;
      acc.byFamily[item.family] = (acc.byFamily[item.family] || 0) + 1;
      acc.bySubsystem[item.subsystem] = (acc.bySubsystem[item.subsystem] || 0) + 1;
      return acc;
    }, { total: 0, byFamily: {}, bySubsystem: {} });
  }

  function searchDtc(dtcDb, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const results = [];
    for (const item of dtcDb) {
      const codeMatch = item.code.toLowerCase().includes(q);
      const descMatch = item.description.toLowerCase().includes(q);
      if (codeMatch || descMatch) {
        results.push(item);
        if (results.length >= 100) break;
      }
    }
    return results;
  }

  function lookupCodes(dtcDb, codes) {
    const dtcMap = new Map(dtcDb.map(item => [item.code, item]));
    return (codes || []).map(code => {
      const normalized = String(code || '').trim().toUpperCase();
      const item = dtcMap.get(normalized);
      const detailed = DETAILED_GUIDANCE[normalized] || null;
      if (item) return { ...item, detailed };
      return {
        code: normalized,
        description: 'Code not found in bundled database. Use subsystem family fallback and exact service data for the vehicle.',
        family: normalized[0] === 'B' ? 'Body' : normalized[0] === 'C' ? 'Chassis' : normalized[0] === 'U' ? 'Network' : 'Powertrain',
        subsystem: normalized[0] === 'B' ? 'body_electrical' : normalized[0] === 'C' ? 'driveline_chassis' : normalized[0] === 'U' ? 'network' : 'powertrain_general',
        detailed: null
      };
    });
  }

  function scoreBucket(scores, key, amount, reason) {
    if (!scores[key]) scores[key] = { score: 0, reasons: [] };
    scores[key].score += amount;
    if (reason) scores[key].reasons.push(reason);
  }

  function applyFluidRules(scores, fluid) {
    if (!fluid || typeof fluid !== 'object') return;
    const level = (fluid.level || '').toLowerCase();
    const color = (fluid.color || '').toLowerCase();
    const smell = (fluid.smell || '').toLowerCase();
    if (level.includes('dry') || level.includes('below')) {
      scoreBucket(scores, 'timing_oiling', 24, 'fluid: dangerously low level');
      scoreBucket(scores, 'transmission', 16, 'fluid: low level may affect transmission or other systems');
    }
    if (color.includes('milky')) scoreBucket(scores, 'cooling', 28, 'fluid: milky contamination clue');
    if (color.includes('metallic')) scoreBucket(scores, 'engine_mechanical', 32, 'fluid: metallic content clue');
    if (smell.includes('burnt')) {
      scoreBucket(scores, 'transmission', 18, 'fluid: burnt smell');
      scoreBucket(scores, 'belt_drive', 8, 'fluid: burnt smell can also be belt/accessory heat');
    }
    if (smell.includes('fuel')) scoreBucket(scores, 'air_fuel', 20, 'fluid: fuel smell clue');
  }

  function applyMediaRules(scores, mediaSummary) {
    if (!mediaSummary || typeof mediaSummary !== 'object') return;
    const audio = mediaSummary.audio || {};
    const image = mediaSummary.image || {};
    const video = mediaSummary.video || {};
    const cues = [audio.cue, image.smokeHint, video.smokeHint].filter(Boolean).join(' | ').toLowerCase();
    if (cues.includes('knock')) {
      scoreBucket(scores, 'engine_mechanical', 26, 'media: knock-like cue');
      scoreBucket(scores, 'timing_oiling', 16, 'media: knock-like cue');
    }
    if (cues.includes('tick')) scoreBucket(scores, 'timing_oiling', 18, 'media: tick-like cue');
    if (cues.includes('squeal')) scoreBucket(scores, 'belt_drive', 22, 'media: squeal-like cue');
    if (cues.includes('white smoke')) scoreBucket(scores, 'cooling', 24, 'media: white smoke / steam cue');
    if (cues.includes('blue smoke')) {
      scoreBucket(scores, 'engine_mechanical', 20, 'media: blue smoke cue');
      scoreBucket(scores, 'timing_oiling', 12, 'media: blue smoke cue');
    }
    if (cues.includes('black smoke')) scoreBucket(scores, 'air_fuel', 24, 'media: black smoke cue');
  }

  function applyNoteRules(scores, notes) {
    const n = String(notes || '').toLowerCase();
    if (!n) return;
    if (n.includes('fuel smell')) scoreBucket(scores, 'air_fuel', 16, 'notes: fuel smell');
    if (n.includes('stalls warm') || n.includes('stalls hot')) {
      scoreBucket(scores, 'air_fuel', 8, 'notes: warm stall');
      scoreBucket(scores, 'timing_oiling', 10, 'notes: warm stall');
    }
    if (n.includes('no crank')) scoreBucket(scores, 'starting_charging', 20, 'notes: no crank');
    if (n.includes('click')) scoreBucket(scores, 'starting_charging', 12, 'notes: click while starting');
    if (n.includes('overheat')) scoreBucket(scores, 'cooling', 20, 'notes: overheat');
    if (n.includes("won't shift") || n.includes('wont shift')) scoreBucket(scores, 'transmission', 18, "notes: won't shift");
    if (n.includes('dead battery') || n.includes('battery light')) scoreBucket(scores, 'charging_voltage', 18, 'notes: battery complaint');
  }

  function checksFor(subsystem) {
    const map = {
      network: ['Check battery state of charge.', 'Inspect main grounds and module fuses.', 'Inspect CAN wiring for rub-through or corrosion.'],
      airbag_safety: ['Record all SRS codes first.', 'Disconnect battery and wait the required time before unplugging yellow connectors.', 'Inspect seat, clock spring, or front impact sensor wiring only per service procedure.'],
      abs_brakes: ['Inspect the affected wheel-speed harness.', 'Check tone ring / encoder condition.', 'Check ABS fuses and module power if multiple wheel codes are present.'],
      charging_voltage: ['Measure battery voltage at rest and running.', 'Inspect terminals and grounds.', 'Check alternator output under load.'],
      cooling: ['Check coolant level when cold.', 'Confirm fan operation.', 'Confirm thermostat behavior and heater output.'],
      emissions_evap: ['Check gas cap seal if EVAP-related.', 'Inspect EVAP / purge / vent wiring and hoses.', 'Repair upstream misfire or rich-running faults before condemning a catalyst.'],
      air_fuel: ['Inspect intake ducting and vacuum hoses.', 'Inspect MAF / MAP / throttle connections.', 'Check fuel pressure if available.'],
      ignition_misfire: ['Inspect spark plugs and coils.', 'Swap suspect ignition parts when practical.', 'Check injector pulse and compression if one cylinder stays dead.'],
      timing_oiling: ['Verify oil level immediately.', 'Check for real valvetrain or bottom-end noise.', 'Use a mechanical oil pressure gauge if available.'],
      transmission: ['Check fluid level and condition exactly per vehicle procedure.', 'Inspect the external transmission connector.', 'Avoid repeated slip until the root cause is known.'],
      body_electrical: ['Check battery voltage first.', 'Check the exact fuse for the dead function.', 'Inspect for water intrusion in BCM / fuse block areas.'],
      driveline_chassis: ['Inspect the affected chassis sensor or harness.', 'Check for play, damage, or contamination at the target component.', 'Verify mechanical condition before replacing modules.'],
      starting_charging: ['Load-test or charge the battery first.', 'Inspect starter and ground voltage drop.', 'Check ignition and starter relay feeds.'],
      engine_mechanical: ['Do not keep revving a knocking engine.', 'Check oil level and inspect for metal.', 'Rule out accessory, flexplate, or exhaust noises before teardown.'],
      belt_drive: ['Inspect serpentine belt condition.', 'Check tensioner and pulley alignment.', 'Watch for wobble, seized accessory bearings, or contamination.'],
      powertrain_general: ['Start with fluids, battery, visible wiring, and related fuses.', 'Confirm the exact code meaning for the subsystem.', 'Retest after one change at a time.'],
      general: ['Start with the easiest non-destructive check first.', 'Verify power, ground, fluid level, and harness condition.', 'Use exact service information before replacing hard parts.']
    };
    return map[subsystem] || map.general;
  }

  function partsFor(subsystem) {
    const map = {
      network: ['Fuse / power-feed repair', 'Ground repair', 'Connector or CAN wiring repair'],
      airbag_safety: ['Clock spring', 'Seat harness repair', 'Connector repair kit'],
      abs_brakes: ['Wheel speed sensor', 'Harness repair', 'Hub / encoder if confirmed'],
      charging_voltage: ['Battery', 'Alternator', 'Battery cable / ground strap'],
      cooling: ['Thermostat', 'Cooling fan relay / motor', 'Coolant temperature sensor'],
      emissions_evap: ['Gas cap', 'Purge valve', 'Vent valve / catalyst only after proof'],
      air_fuel: ['MAF or MAP sensor', 'Vacuum hose / intake boot', 'Fuel pump / injector as confirmed'],
      ignition_misfire: ['Spark plugs', 'Ignition coil', 'Injector or compression-related repair'],
      timing_oiling: ['Oil pressure sender', 'VVT solenoid', 'Timing component or oiling repair'],
      transmission: ['Fluid / filter', 'Shift solenoid / internal harness', 'Valve body or converter as confirmed'],
      body_electrical: ['Fuse / relay', 'Switch', 'Connector repair'],
      driveline_chassis: ['Sensor', 'Harness repair', 'Mechanical component'],
      starting_charging: ['Battery', 'Starter / relay', 'Cable or ground repair'],
      engine_mechanical: ['Inspection only until confirmed', 'Oil / filter sample', 'Internal repair parts after teardown'],
      belt_drive: ['Belt', 'Tensioner', 'Pulley / idler / accessory bearing']
    };
    return map[subsystem] || ['Part to be confirmed after diagnosis'];
  }

  function warningsFor(subsystems, codes) {
    const out = [];
    if (subsystems.includes('cooling')) out.push('Cooling-system path: do not open a hot cooling system.');
    if (subsystems.includes('timing_oiling') || subsystems.includes('engine_mechanical')) out.push('Oil-pressure / knock path: shut the engine down if noise is severe or oil is low.');
    if (subsystems.includes('transmission')) out.push('Transmission path: avoid repeated slip, towing, or hard throttle until diagnosed.');
    if (subsystems.includes('airbag_safety')) out.push('SRS path: disconnect the battery and follow exact discharge timing before unplugging yellow connectors.');
    if ((codes || []).some((c) => /^P030[0-9]$/.test(c) || /^P031[0-2]$/.test(c))) {
      out.push('Misfire path: a flashing MIL can overheat the catalytic converter quickly.');
    }
    return out;
  }

  function buildAnalysis(input, dtcDb) {
    const codes = Array.isArray(input.dtcs) ? input.dtcs.map(x => String(x).trim().toUpperCase()).filter(Boolean) : [];
    const symptoms = Array.isArray(input.symptoms) ? input.symptoms : [];
    const notes = String(input.notes || '');
    const fluid = input.fluid || {};
    const mediaSummary = input.mediaSummary || {};
    const codeEntries = lookupCodes(dtcDb, codes);
    const scores = {};

    codeEntries.forEach(entry => {
      scoreBucket(scores, entry.subsystem, 22, `code: ${entry.code} ${entry.description}`);
      if (/high|low|circuit|open|short/i.test(entry.description)) scoreBucket(scores, entry.subsystem, 4, `code detail: electrical wording on ${entry.code}`);
      if (DETAILED_GUIDANCE[entry.code]) scoreBucket(scores, entry.subsystem, 8, `detailed guide available for ${entry.code}`);
    });
    SYMPTOM_RULES.forEach(rule => {
      if (symptoms.includes(rule.match)) rule.add.forEach(([bucket, pts, reason]) => scoreBucket(scores, bucket, pts, reason));
    });
    applyFluidRules(scores, fluid);
    applyMediaRules(scores, mediaSummary);
    applyNoteRules(scores, notes);

    const ranked = Object.entries(scores)
      .map(([bucket, meta]) => ({
        bucket,
        title: SUBSYSTEM_LABELS[bucket] || SUBSYSTEM_LABELS.general,
        score: meta.score,
        confidence: Math.max(35, Math.min(97, meta.score)),
        reasons: meta.reasons.slice(0, 8),
        firstChecks: checksFor(bucket),
        likelyParts: partsFor(bucket)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const topSubsystems = ranked.map(x => x.bucket);
    const primary = ranked[0] || {
      bucket: 'general',
      title: SUBSYSTEM_LABELS.general,
      score: 35,
      confidence: 35,
      reasons: ['Not enough hard evidence.'],
      firstChecks: checksFor('general'),
      likelyParts: partsFor('general')
    };

    const detailedCodeCards = codeEntries.slice(0, 10).map(entry => ({
      code: entry.code,
      description: entry.description,
      family: entry.family,
      subsystem: entry.subsystem,
      guidance: entry.detailed || null
    }));

    return {
      generatedAt: new Date().toISOString(),
      dbStats: computeStats(dtcDb),
      vehicle: input.vehicle || {},
      summary: {
        primaryFinding: primary.title,
        confidence: primary.confidence,
        shortReason: primary.reasons[0] || 'Combined DTC / symptom / media evidence.'
      },
      rankedHypotheses: ranked,
      firstChecks: primary.firstChecks,
      likelyParts: primary.likelyParts,
      warnings: warningsFor(topSubsystems, codes),
      codeCards: detailedCodeCards,
      disclaimers: [
        'This build is a diagnostic assistant, not a legal substitute for a certified technician or manufacturer service information.',
        'Camera, audio, and video features provide evidence-based cues only; they are not a validated laboratory test.',
        'Without a compatible vehicle interface, the app cannot directly read live ECU data from the OBD port.'
      ]
    };
  }

  return { APP_VERSION, computeStats, searchDtc, lookupCodes, buildAnalysis };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DiagEngine;
