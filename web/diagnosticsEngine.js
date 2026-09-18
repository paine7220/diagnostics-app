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
      warnings: ['A flashing MIL means catalyst-damaging misfire; stop hard driving.'],
      diySteps: [
        'Park on level ground, set the brake, engine off, key out. If the check-engine light was flashing while you drove, do not keep driving hard — that can melt the catalytic converter.',
        'Open the hood. Pull the oil dipstick, wipe it, reinsert, and read it. If oil is very low, add the correct oil and stop until you know why it was low.',
        'Look at the battery posts. If they are white/green and crusty, disconnect negative first, clean them, and tighten. A weak dirty battery can cause random misfires.',
        'Find the ignition coils (usually a plastic pack on top of each spark plug). Unplug one coil, swap it with a different cylinder, then drive a short loop or recheck codes. If the misfire moves to the other cylinder, replace that coil.',
        'If the misfire stays on the same cylinder, pull that spark plug with a spark-plug socket. Look for oil, coolant, a burned electrode, or a huge gap. Replace old plugs as a set with the correct part, gapped per the door-jamb spec.',
        'With the engine off, squeeze and inspect the big rubber intake tube after the air box and the PCV hose. Cracks and loose clamps let in extra air and make a misfire. Replace split boots.',
        'If several cylinders still misfire, stop guessing coils. Check for a fuel smell, a rattling converter, or a dead-sounding engine — that is a fuel-pressure, injector, or mechanical job. Do not keep revving it.',
        'Stop and go to a shop if you hear knock, see white or blue smoke, find milky oil, or you do not have the tools. One change at a time, then recheck the code.'
      ]
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

  DETAILED_GUIDANCE.P0171.diySteps = [
    'Engine off. Find the big plastic/rubber intake tube between the air box and the throttle. Look for splits, especially after the MAF sensor. Replace a cracked tube; do not tape it as a permanent fix.',
    'Check the oil cap and dipstick tube. A loose cap or split PCV hose is a common cheap lean-code cause. Reseat or replace the hose.',
    'If you have MAF cleaner (not brake cleaner), unplug the MAF, spray the wires only, let it dry fully, then reconnect.',
    'Do not throw an oxygen sensor at this first. If the tube and PCV look good and it still runs lean, that is a fuel-pressure or intake-gasket job — stop there unless you have a gauge.'
  ];
  DETAILED_GUIDANCE.P0174.diySteps = DETAILED_GUIDANCE.P0171.diySteps;
  DETAILED_GUIDANCE.P0128.diySteps = [
    'Wait until the engine is fully cold. Never open a hot radiator cap.',
    'Check coolant in the overflow bottle. If empty, add the correct coolant mix and look for leaks before you drive far.',
    'Start the truck and watch the temperature gauge. If it stays on cold and the heater blows lukewarm after 10–15 minutes, the thermostat is likely stuck open.',
    'Replacing a thermostat is a DIY job on many trucks: drain some coolant, unbolt the thermostat housing, install the new thermostat in the same direction, new gasket, refill, and burp air from the system. If you are not sure of the housing location, use the year/make/model service steps for that engine.',
    'If it overheats instead of staying cold, stop. That is the opposite problem — do not keep driving.'
  ];
  DETAILED_GUIDANCE.P0335.diySteps = [
    'If it cranks with no start or stalls suddenly, check battery voltage first. A dying battery throws crank-sensor codes.',
    'Find the crankshaft position sensor (usually near the crank pulley or transmission bellhousing). Unplug it and look for oil, rust, or broken plastic.',
    'Follow the wiring a few inches. If it is melted to the exhaust or rubbed through, repair the harness before buying a sensor.',
    'If the connector and wires look clean, replacing the sensor is often a 1-bolt DIY job. Use the exact sensor for that engine. Clear the code and see if it starts and stays running.',
    'If it still will not start, do not keep grinding the starter. Have it scanned for cam/crank correlation.'
  ];
  DETAILED_GUIDANCE.P0420.diySteps = [
    'Do not buy a catalytic converter first. Fix misfire, lean, or rich codes if they are also present.',
    'Look under the truck for rust holes or a broken flex pipe before the rear O2 sensor. An exhaust leak can fake a bad converter.',
    'If the engine has been misfiring, replace plugs/coils and retest after a mix of city and highway driving. The code may go away.',
    'A rattling converter or rotten-egg smell after upstream repairs means the converter is likely failed — that is usually a shop/exhaust-shop job, not a driveway bolt-on unless you already know the exhaust layout.'
  ];
  DETAILED_GUIDANCE.P0430.diySteps = DETAILED_GUIDANCE.P0420.diySteps;
  DETAILED_GUIDANCE.P0449.diySteps = [
    'Tighten the gas cap until it clicks. Drive a few trips. Many EVAP codes are that simple.',
    'If the code stays, the vent valve is often near the spare-tire or over the rear axle by the charcoal canister. Unplug it and look for rusted pins.',
    'If you can reach it, replacing the vent solenoid is a common DIY: one connector, a hose clamp, and a bolt. Do not clamp the EVAP hose shut as a “test” and then forget it.',
    'Skip this if you smell heavy fuel under the truck — that is a leak. Do not wrench on a dripping fuel line in a closed garage.'
  ];
  DETAILED_GUIDANCE.P0480.diySteps = [
    'If the engine is hot, shut it off and let it cool. Overheating comes first, not the code.',
    'Find the cooling-fan fuse and relay in the under-hood box. Swap the fan relay with a same-number relay if there is a spare. If the fan starts working, replace the relay.',
    'With the A/C on and engine warm, the fan should run. If not, unplug the fan motor and inspect melted plastic at the connector.',
    'Replacing a fan motor/shroud is DIY on many trucks (bolts around the radiator). Support the shroud; do not bend the radiator fins. If the fan is packed in a tight diesel, consider a shop.'
  ];
  DETAILED_GUIDANCE.P0521.diySteps = [
    'Shut the engine off if the oil-pressure gauge is on the floor or the oil light is on, or if you hear knock. Driving it can kill the engine.',
    'Check oil level on the dipstick. Fill if low. Look under the truck for a fresh puddle.',
    'If level is full and it is quiet, the sender on the engine (one-wire or connector near the oil filter) is a cheap DIY replace. Use a wrench, expect some oil dribble, and use thread sealant only if the old one had it.',
    'If the engine is knocking or a mechanical gauge shows no pressure, stop. That is not a sensor. Tow it.'
  ];
  DETAILED_GUIDANCE.P0700.diySteps = [
    'This is a messenger code: the transmission computer wants you to read the transmission-specific codes (P07xx, P27xx). Write those down too.',
    'Check transmission fluid the exact way the truck wants — many need to be hot, running, and in park/neutral. Do not guess with a cold stick on a sealed unit.',
    'If fluid is black and burnt-smelling, do not keep towing or flogging it. A fluid/filter service can be DIY on trucks with a pan; a sealed “lifetime” unit is often a shop.',
    'Inspect the big connector on the transmission for green corrosion. Clean with electrical cleaner, not water.',
    'Do not dump in a “fix in a can” additive as step one. Get the companion code first.'
  ];
  DETAILED_GUIDANCE.U0100.diySteps = [
    'Charge or jump the battery correctly (positive to positive, negative to engine ground). Low voltage makes modules drop off the network and throw U-codes.',
    'Clean and tighten battery terminals and the main engine/body ground straps (braided cables to the block and firewall).',
    'Check the under-hood fuse box for ECU/PCM and ignition fuses. A blown fuse is a DIY replace — if it blows again, there is a short; stop.',
    'If the battery is strong and grounds are clean and it still will not talk, that is wiring or a module. Do not replace the PCM as a guess.'
  ];
  DETAILED_GUIDANCE.C0035.diySteps = [
    'Jack the left-front (driver on US trucks) corner on a jack stand. Do not crawl under a bumper jack.',
    'Look at the small wiring harness going to the back of the hub. It often breaks at the strut or from rust. If the insulation is cracked, repair or replace the sensor pigtail.',
    'Unbolt the wheel-speed sensor (usually one bolt). Pull it out. If the tip is chipped or packed with metal, replace the sensor. Torque the bolt snug, not gorilla-tight.',
    'Spin the wheel. If it clunks or the ABS light stays after a new sensor, the hub/bearing (tone ring) may be the real part — that is a bigger DIY or a shop hub assembly.'
  ];

  const SUBSYSTEM_DIY = {
    ignition_misfire: misfireGuide('Ignition / misfire').diySteps,
    air_fuel: DETAILED_GUIDANCE.P0171.diySteps,
    cooling: DETAILED_GUIDANCE.P0128.diySteps,
    timing_oiling: DETAILED_GUIDANCE.P0521.diySteps,
    transmission: DETAILED_GUIDANCE.P0700.diySteps,
    network: DETAILED_GUIDANCE.U0100.diySteps,
    abs_brakes: DETAILED_GUIDANCE.C0035.diySteps,
    charging_voltage: [
      'Measure or at least observe: headlights should not go dim at idle and brighten a lot when you rev. If they do, charging is weak.',
      'Clean battery terminals. Tighten the negative cable on the engine block.',
      'If the battery is more than 4–5 years old and it is slow to crank, replace the battery first. That is the #1 DIY charging fix.',
      'If a new battery still dies overnight or the voltmeter stays at 12V with the engine running, the alternator is next. Many are a 3-bolt DIY with the belt; note the belt routing before you pull it.',
      'Stop if you smell burning wires at the alternator plug — that harness needs repair, not just a new alternator.'
    ],
    emissions_evap: DETAILED_GUIDANCE.P0449.diySteps,
    starting_charging: [
      'Headlights on, try to crank. If they go dead and you hear a single click, clean battery terminals and charge/replace the battery.',
      'If it clicks and lights stay bright, tap the starter with a hammer while someone cranks (engine off gear, brake set). If it starts, the starter is dying — replace it. Many trucks: one or two bolts from underneath; support it so it does not drop on you.',
      'Check the big battery cable at the starter for green corrosion. Replace the cable if the copper is powdery.',
      'If nothing clicks and nothing lights up, it is a battery, ground, or ignition-switch/neutral-safety issue. Confirm it is in Park and the battery is actually charged before buying parts.'
    ],
    engine_mechanical: [
      'Do not keep revving a knocking engine. Check oil now.',
      'Look at the oil: shiny metal flakes or a milky chocolate color means stop driving. Tow it.',
      'Rule out a heat shield, belt, or exhaust rattle by using a broomstick as a stethoscope on accessories with the engine idling — keep hair and sleeves away from the belt.',
      'Internal engine work is not a first DIY step. Get a compression or leak-down test, or a shop, before you tear the front of the engine down.'
    ],
    belt_drive: [
      'Engine off. Look at the serpentine belt: cracks, glaze, or missing ribs means replace the belt. Draw the routing or take a phone picture first.',
      'Use a wrench on the tensioner square hole or bolt to slack the belt. Slip the new belt on, then ease the tensioner back.',
      'Spin each pulley by hand. A grinding idler or wobbling pulley is the real noise — replace that pulley/tensioner with the belt.',
      'If the belt keeps coming off, do not keep slapping belts on. There is a misaligned pulley or a seized accessory.'
    ],
    body_electrical: [
      'Check the battery first. Weird electrical problems are often low voltage.',
      'Find the fuse for the dead thing in the owner’s-manual fuse chart. A blown fuse is a DIY replace with the same amp number only.',
      'If the fuse blows again immediately, there is a short. Stop stuffing bigger fuses in. Look for a pinched wire or water in the tail-light/door.',
      'Water in the cabin fuse box or under the carpet is a common “everything crazy” cause. Dry it and find the leak.'
    ],
    driveline_chassis: [
      'Park, chock wheels, and use a jack stand if you go under it.',
      'Inspect the part named by the code (sensor, harness, or mechanical joint) for damage, rust, or a disconnected plug.',
      'Replace an obviously broken sensor or torn boot. Do not replace a module because a sensor code is present.',
      'If a joint is clunking or a shaft is bent, that is a mechanical repair — match the part, or have a shop press/replace it.'
    ],
    airbag_safety: [
      'Do not probe airbag (yellow) connectors with a test light. Disconnect the battery and wait the time the manual calls for (often 10+ minutes) before unplugging them.',
      'Record every SRS code first. Replacing a clock spring or seat connector is DIY on some vehicles; follow the exact year/make procedure.',
      'If the bag is deployed or the light is on after a crash, that is not a driveway “clear the light” job. Have it repaired properly.'
    ],
    powertrain_general: [
      'Write the exact code and the plain-language description.',
      'Check oil, coolant, and battery first. Many “mystery” codes start there.',
      'Inspect the obvious connector and fuse for that system. Unplug, look for pins, plug back in until it clicks.',
      'Change one thing, then recheck. If the next step is tearing into the engine or transmission and you are not sure, stop and take it to a shop with the code list.'
    ],
    general: [
      'Write down the code, the symptom, and whether the light is flashing or steady.',
      'Check fluids and the battery. Tighten the gas cap.',
      'Look for a loose hose, a disconnected sensor plug, or a rodent-chewed wire — those are the DIY wins.',
      'Use the year, make, model, and engine when you buy parts. One repair at a time, then see if the code returns.',
      'Stop for brakes, steering, fuel leaks, overheating, no oil pressure, or heavy knock. Those are not “keep driving” jobs.'
    ]
  };

  function diyStepsFor(code, subsystem) {
    const detailed = DETAILED_GUIDANCE[code];
    if (detailed && detailed.diySteps && detailed.diySteps.length) return detailed.diySteps;
    return SUBSYSTEM_DIY[subsystem] || SUBSYSTEM_DIY.general;
  }

  function guideFor(code, subsystem, description) {
    const detailed = DETAILED_GUIDANCE[code] || null;
    return {
      title: (detailed && detailed.title) || description || 'Repair path',
      firstChecks: (detailed && detailed.firstChecks) || checksFor(subsystem),
      likelyParts: (detailed && detailed.likelyParts) || partsFor(subsystem),
      warnings: (detailed && detailed.warnings) || [],
      diySteps: diyStepsFor(code, subsystem)
    };
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
        results.push({ ...item, detailed: guideFor(item.code, item.subsystem, item.description) });
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
      if (item) return { ...item, detailed: guideFor(normalized, item.subsystem, item.description) };
      const subsystem = normalized[0] === 'B' ? 'body_electrical' : normalized[0] === 'C' ? 'driveline_chassis' : normalized[0] === 'U' ? 'network' : 'powertrain_general';
      const description = 'Code not found in bundled database. Use the DIY steps below, then confirm with service data for this exact vehicle.';
      return {
        code: normalized,
        description,
        family: normalized[0] === 'B' ? 'Body' : normalized[0] === 'C' ? 'Chassis' : normalized[0] === 'U' ? 'Network' : 'Powertrain',
        subsystem,
        detailed: guideFor(normalized, subsystem, description)
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
        likelyParts: partsFor(bucket),
        diySteps: diyStepsFor('', bucket)
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
      likelyParts: partsFor('general'),
      diySteps: diyStepsFor('', 'general')
    };

    const detailedCodeCards = codeEntries.slice(0, 10).map(entry => ({
      code: entry.code,
      description: entry.description,
      family: entry.family,
      subsystem: entry.subsystem,
      guidance: entry.detailed || guideFor(entry.code, entry.subsystem, entry.description)
    }));

    const primaryDiy = (codeEntries[0] && codeEntries[0].detailed && codeEntries[0].detailed.diySteps) || primary.diySteps || SUBSYSTEM_DIY.general;

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
      diyTitle: (codeEntries[0] && codeEntries[0].detailed && codeEntries[0].detailed.title) || primary.title,
      diySteps: primaryDiy,
      warnings: warningsFor(topSubsystems, codes),
      codeCards: detailedCodeCards,
      disclaimers: [
        'These DIY steps are a driveway starting path, not a factory procedure for every year, make, and engine. Confirm torque, parts, and bleed procedures for YOUR vehicle.',
        'This build is a diagnostic assistant, not a legal substitute for a certified technician or manufacturer service information.',
        'Camera, audio, and video features provide evidence-based cues only; they are not a validated laboratory test.',
        'Without a compatible vehicle interface, the app cannot directly read live ECU data from the OBD port.'
      ]
    };
  }

  function listRepairPlaybooks() {
    const seen = new Map();
    const add = (label, steps) => {
      const list = steps || [];
      if (!list.length) return;
      const key = list.join('\n');
      if (seen.has(key)) {
        const row = seen.get(key);
        if (!row.labels.includes(label)) row.labels.push(label);
        return;
      }
      seen.set(key, { labels: [label], diySteps: list });
    };
    Object.entries(DETAILED_GUIDANCE).forEach(([code, guide]) => {
      if (/^P030[1-9]$/.test(code) || /^P031[0-2]$/.test(code)) return;
      add(code + ' — ' + (guide.title || code), guide.diySteps);
    });
    Object.entries(SUBSYSTEM_DIY).forEach(([key, steps]) => {
      add(SUBSYSTEM_LABELS[key] || key, steps);
    });
    return Array.from(seen.values());
  }

  return { APP_VERSION, computeStats, searchDtc, lookupCodes, buildAnalysis, listRepairPlaybooks, diyStepsFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DiagEngine;
