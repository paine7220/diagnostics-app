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

  function injectorGuide(cyl) {
    return {
      title: 'Injector circuit cylinder ' + cyl,
      firstChecks: [
        'Confirm which physical cylinder is number ' + cyl + ' for this engine.',
        'Inspect that injector connector for oil, rust, or melted pins.',
        'Check the injector fuse / PCM feed.',
        'Listen for injector click on that cylinder with a long screwdriver (keep clear of belts).'
      ],
      likelyParts: ['Fuel injector cylinder ' + cyl, 'Injector connector pigtail', 'Injector fuse / wiring'],
      warnings: ['Relieve fuel pressure before opening the rail. No sparks, no closed garage if fuel is spraying.'],
      diySteps: [
        'Engine cold. If you can find the fuel-pump fuse or relay, pull it and crank a few seconds to drop rail pressure. Have rags ready.',
        'Find cylinder ' + cyl + '. Coil/plug order is not always “front of the engine = cylinder 1.” Use the firing-order sticker, intake-plenum stamp, or a year/make/engine diagram before you wrench.',
        'Unplug that injector. Look for green pins or oil in the connector. Clean or replace the pigtail if it is crusty.',
        'If you can swap that injector with another cylinder of the same type, do it. If the code follows the injector, replace the injector and the O-rings. If it stays on cylinder ' + cyl + ', repair the wiring — do not keep buying injectors.',
        'After any rail work, prime the key on/off a few times and look for wet fuel before you start it.',
        'Stop if you cannot reseal the rail or fuel is dripping. That is not a “drive it to the parts store” job.'
      ]
    };
  }

  function coilCircuitGuide(letter) {
    return {
      title: 'Ignition coil ' + letter + ' circuit',
      firstChecks: [
        'Match coil ' + letter + ' to the actual pack or plug — letter is not always the same as cylinder number.',
        'Inspect that coil connector and boot.',
        'Swap the coil with another cylinder when it unbolts easily.',
        'Check the ignition fuse / coil feed.'
      ],
      likelyParts: ['Ignition coil ' + letter, 'Spark plug under that coil', 'Coil connector / wiring'],
      warnings: ['A flashing MIL is catalyst-damaging misfire. Do not keep flogging it.'],
      diySteps: [
        'Engine off. Find coil ' + letter + ' (often stamped on the coil or listed as coil A/B/C on the pack). Unplug it and look for oil, water, or burned plastic.',
        'Swap that coil with a neighbor. Drive a short loop or recheck codes. If the coil code or misfire moves, replace that coil.',
        'If the fault stays on the same tower, pull the plug under it. Oil-soaked, white, or huge-gap plugs get replaced as a set with the correct part, gapped per the door-jamb spec.',
        'Wiggle the coil harness. If the code pops only when the harness moves, repair the wire — a new coil will not fix a broken conductor.',
        'Stop if several coil codes appear at once. That is usually a shared fuse, ground, or PCM feed, not eight bad coils.'
      ]
    };
  }

  function wheelSpeedGuide(where) {
    return {
      title: where + ' wheel speed sensor',
      firstChecks: [
        'Inspect the ' + where + ' wheel-speed harness at the strut and hub.',
        'Check for rust jacking or packed debris at the tone ring.',
        'Check wheel bearing play on that corner.'
      ],
      likelyParts: ['Wheel speed sensor', 'Harness repair', 'Hub / bearing if the tone signal is unstable'],
      warnings: ['ABS and traction control may be reduced until repaired. Do not assume the brakes themselves failed.'],
      diySteps: [
        'Jack the ' + where + ' corner on a jack stand. Do not crawl under a bumper jack.',
        'Look at the small harness to the back of the hub. It commonly breaks at the strut or from rust. Cracked insulation means replace the sensor or pigtail.',
        'Unbolt the sensor (usually one bolt). If the tip is chipped or packed with metal, replace it. Snug the bolt; do not round it.',
        'Spin the wheel. A clunk, growl, or ABS light that stays after a new sensor points to the hub/bearing (tone ring) — bigger DIY or a shop hub assembly.'
      ]
    };
  }

  const DETAILED_GUIDANCE = {
    P0300: misfireGuide('Random / multiple cylinder misfire'),
    P0171: { title: 'Bank 1 lean', firstChecks: ['Inspect intake duct for splits after the MAF.', 'Check PCV and brake booster hoses.', 'Clean the MAF only with MAF cleaner.', 'Check fuel trims and fuel pressure if available.'], likelyParts: ['MAF sensor', 'Vacuum hose', 'Intake gasket', 'Fuel pump / filter'], warnings: ['Do not replace oxygen sensors first unless testing points there.'] },
    P0174: { title: 'Bank 2 lean', firstChecks: ['Check for bank-to-bank intake leaks.', 'Inspect MAF data and intake ducting.', 'Check for low fuel pressure under load.'], likelyParts: ['MAF sensor', 'Vacuum hose', 'Fuel pump', 'Intake gasket'], warnings: ['Lean codes plus misfire can overheat catalytic converters.'] },
    P0172: { title: 'Bank 1 rich', firstChecks: ['Check for a dripping injector or fuel-pressure regulator.', 'Inspect the air filter and MAF for oil contamination.', 'Look for a stuck-open purge valve dumping fuel vapor.'], likelyParts: ['Purge valve', 'Fuel pressure regulator / pump', 'Leaking injector', 'MAF sensor'], warnings: ['Rich running can flood a converter. Do not keep driving it if it stinks like raw fuel.'] },
    P0175: { title: 'Bank 2 rich', firstChecks: ['Compare bank-to-bank: both rich often means MAF, fuel pressure, or purge.', 'One-bank rich points to that bank’s injector or sensor.'], likelyParts: ['Purge valve', 'Injector', 'MAF sensor', 'Fuel pressure problem'], warnings: ['Fix the cause before replacing both O2 sensors.'] },
    P0449: { title: 'EVAP vent control circuit', firstChecks: ['Inspect vent solenoid wiring near the tank.', 'Check the vent valve connector for corrosion.', 'Check fuse / power feed to the circuit.'], likelyParts: ['EVAP vent solenoid', 'Connector pigtail', 'Harness repair'], warnings: ['This is usually not a drivability emergency unless fuel smell is present.'] },
    P0480: { title: 'Cooling fan control circuit', firstChecks: ['Check cooling fan fuses and relay.', 'Inspect fan connector for melted pins.', 'Confirm the fan can run when commanded.'], likelyParts: ['Fan relay', 'Cooling fan motor', 'Harness repair'], warnings: ['Overheating risk. Do not idle the vehicle hot while testing.'] },
    P0521: { title: 'Oil pressure sensor/range', firstChecks: ['Verify oil level immediately.', 'Listen for real valvetrain or bottom-end noise.', 'Use a mechanical gauge if available before condemning the engine.'], likelyParts: ['Oil pressure sender', 'Oil filter / oil', 'Oil pump or pickup screen'], warnings: ['If the engine is knocking or oil is low, shut it down.'] },
    P0522: { title: 'Oil pressure sensor low', firstChecks: ['Check oil level now.', 'Confirm whether the oil light/gauge agrees with a real pressure problem.', 'Inspect the sender connector.'], likelyParts: ['Oil pressure sender', 'Oil / filter', 'Oil pump if pressure is truly low'], warnings: ['If the engine is knocking or oil is low, shut it down.'] },
    P0128: { title: 'Thermostat below regulating temperature', firstChecks: ['Check coolant level when cold.', 'Confirm slow warm-up and weak cabin heat.', 'Replace thermostat if the pattern is repeatable.'], likelyParts: ['Thermostat', 'Coolant', 'Coolant temp sensor if confirmed'], warnings: ['Do not open a hot cooling system.'] },
    P0335: { title: 'Crankshaft position sensor circuit', firstChecks: ['Inspect CKP sensor connector.', 'Check wiring near exhaust or moving parts.', 'Verify battery voltage during cranking.'], likelyParts: ['Crankshaft position sensor', 'Harness repair', 'Starter / battery issue if voltage collapses'], warnings: ['A crank sensor fault can cause sudden stalling or no-start.'] },
    P0336: { title: 'Crankshaft position sensor range', firstChecks: ['Inspect the CKP connector and reluctor/tone wheel area.', 'Check for a damaged crank pulley or flexplate ring.', 'Verify battery voltage during crank.'], likelyParts: ['Crankshaft position sensor', 'Reluctor / tone wheel', 'Harness repair'], warnings: ['Intermittent stall or crank/no-start. Do not keep grinding the starter.'] },
    P0700: { title: 'Transmission control request code', firstChecks: ['Pull transmission-specific codes if possible.', 'Check fluid level and condition exactly per service procedure.', 'Inspect main transmission connector.'], likelyParts: ['Depends on companion code', 'Fluid / filter', 'Internal harness / solenoid'], warnings: ['Avoid repeated slip or towing until diagnosed.'] },
    U0100: { title: 'Lost communication with ECM/PCM', firstChecks: ['Check battery state of charge.', 'Inspect engine and body grounds.', 'Check module fuses and CAN wiring.'], likelyParts: ['Ground repair', 'Fuse / power feed repair', 'Network repair'], warnings: ['Low voltage can create false network faults.'] },
    U0101: { title: 'Lost communication with TCM', firstChecks: ['Charge the battery first.', 'Inspect the transmission 20-way connector.', 'Check TCM / trans control fuses.'], likelyParts: ['Transmission connector repair', 'TCM fuse / power', 'Network / TCM only after power and grounds are proven'], warnings: ['Low voltage and a corroded trans plug fake a “bad TCM.”'] },
    U0073: { title: 'CAN bus A off', firstChecks: ['Charge the battery.', 'Inspect main grounds.', 'Look for a module or harness that got wet or crushed.'], likelyParts: ['Ground / battery cable', 'CAN wiring repair', 'A shorted module after isolation'], warnings: ['Do not replace the PCM because the whole bus went quiet. Start with battery and grounds.'] },
    U0121: { title: 'Lost communication with ABS module', firstChecks: ['Check ABS fuses and the module connector.', 'Inspect the ABS module for water (common in some trucks).', 'Verify battery voltage.'], likelyParts: ['ABS fuse / connector', 'Wheel-speed wiring short taking down the module', 'ABS module after power/ground proof'], warnings: ['ABS may be down. Brakes still work, but stopping distance and stability control can be worse.'] },
    C0035: { title: 'LF wheel speed sensor', firstChecks: ['Inspect the left-front wheel speed sensor harness.', 'Check for rust jacking or debris at the tone ring.', 'Check wheel bearing play.'], likelyParts: ['Wheel speed sensor', 'Harness repair', 'Hub / bearing if tone signal is unstable'], warnings: ['ABS and traction control may be reduced until repaired.'] },
    C0040: { title: 'RF wheel speed sensor', firstChecks: ['Inspect the right-front wheel speed sensor harness.', 'Check the tone ring / encoder.', 'Check that corner’s bearing play.'], likelyParts: ['Wheel speed sensor', 'Harness repair', 'Hub / bearing if confirmed'], warnings: ['ABS and traction control may be reduced until repaired.'] },
    P0420: { title: 'Bank 1 catalyst efficiency', firstChecks: ['Repair upstream misfire, lean, or rich codes first.', 'Inspect exhaust leaks before the rear O2 sensor.', 'Confirm fuel and ignition condition before condemning the converter.'], likelyParts: ['Upstream ignition / fuel repair', 'Exhaust leak repair', 'Catalytic converter only after proof'], warnings: ['Do not replace a converter until upstream causes are ruled out.'] },
    P0430: { title: 'Bank 2 catalyst efficiency', firstChecks: ['Repair upstream misfire, lean, or rich codes first.', 'Inspect exhaust leaks before the rear O2 sensor.', 'Compare bank-to-bank fuel trims and misfire counts.'], likelyParts: ['Upstream ignition / fuel repair', 'Exhaust leak repair', 'Catalytic converter only after proof'], warnings: ['Do not replace a converter until upstream causes are ruled out.'] },
    P0101: { title: 'MAF range/performance', firstChecks: ['Inspect the intake tube after the MAF for splits.', 'Check the air filter and MAF screen for dirt or oil.', 'Clean the MAF only with MAF cleaner.'], likelyParts: ['Intake boot', 'Air filter', 'MAF sensor'], warnings: ['Do not spray brake cleaner on a MAF.'] },
    P0102: { title: 'MAF circuit low', firstChecks: ['Check the MAF connector and 5V/ground pins.', 'Inspect the intake for an unmetered leak after the MAF.', 'Confirm the MAF is plugged in after a filter change.'], likelyParts: ['MAF sensor', 'MAF connector pigtail', 'Intake boot'], warnings: ['An unplugged MAF after an air-filter job is a common DIY miss.'] },
    P0106: { title: 'MAP range/performance', firstChecks: ['Inspect the MAP sensor and its vacuum port for a cracked hose or clogged nipple.', 'Check for a huge vacuum leak.', 'Confirm the sensor is fully seated.'], likelyParts: ['MAP sensor', 'Vacuum hose', 'Intake leak repair'], warnings: ['A loose MAP after intake work throws this immediately.'] },
    P0107: { title: 'MAP circuit low', firstChecks: ['Unplug the MAP and inspect pins.', 'Check the 5-volt reference and ground.', 'Look for a melted harness on the intake.'], likelyParts: ['MAP sensor', 'Harness repair', 'PCM 5V reference if several sensors failed together'], warnings: ['Several “circuit low” sensor codes at once usually means a shared 5V reference, not five sensors.'] },
    P0112: { title: 'IAT circuit low', firstChecks: ['Inspect the intake-air temp sensor (often in the MAF or intake).', 'Look for a crushed connector or oil-soaked sensor.'], likelyParts: ['IAT / MAF assembly', 'Connector repair'], warnings: ['A grounded IAT wire makes the PCM think the air is arctic-cold and can dump fuel.'] },
    P0113: { title: 'IAT circuit high', firstChecks: ['Check that the IAT/MAF is plugged in.', 'Inspect for an open wire to the sensor.'], likelyParts: ['IAT / MAF assembly', 'Open wiring'], warnings: ['An unplugged MAF after a filter change is a frequent cause.'] },
    P0117: { title: 'ECT circuit low', firstChecks: ['Inspect the coolant-temp sensor connector.', 'Do not trust a gauge that is pegged hot if the sensor is shorted — confirm with a second thermometer if you can.'], likelyParts: ['ECT sensor', 'Connector / wiring'], warnings: ['A shorted ECT can command fans on and a rich mixture. Confirm before replacing the thermostat.'] },
    P0118: { title: 'ECT circuit high', firstChecks: ['Check the coolant-temp sensor plug.', 'Confirm coolant level when cold.', 'Look for an open wire.'], likelyParts: ['ECT sensor', 'Connector / wiring'], warnings: ['Do not open a hot cooling system.'] },
    P0121: { title: 'TPS A range/performance', firstChecks: ['Inspect the throttle-body connector.', 'Look for carbon holding the blade.', 'On cable throttles, check the TPS mounting screws.'], likelyParts: ['Throttle position sensor / throttle body', 'Throttle-body cleaning', 'Connector repair'], warnings: ['Do not force an electronic throttle blade by hand.'] },
    P0122: { title: 'TPS A circuit low', firstChecks: ['Unplug the throttle connector and inspect pins.', 'Check the 5V reference.'], likelyParts: ['Throttle body / TPS', 'Connector pigtail'], warnings: ['Limp mode is common. Stop slamming the pedal.'] },
    P0131: { title: 'O2 B1S1 circuit low', firstChecks: ['Inspect the upstream O2 on bank 1 (usually the radiator side on many V engines — confirm).', 'Look for a melted wire on the exhaust.', 'Check for exhaust leaks before the sensor.'], likelyParts: ['Upstream O2 sensor (B1S1)', 'Harness repair', 'Exhaust leak repair'], warnings: ['Fix exhaust leaks and misfires before condemning the sensor.'] },
    P0133: { title: 'O2 B1S1 slow response', firstChecks: ['Repair misfire/rich/lean codes first.', 'Inspect the upstream sensor for soot or silicone contamination.', 'Check for an exhaust leak before the sensor.'], likelyParts: ['Upstream O2 (B1S1)', 'Upstream ignition/fuel repair'], warnings: ['A lazy O2 is often the result of a long misfire, not the first part to throw at the car.'] },
    P0134: { title: 'O2 B1S1 no activity', firstChecks: ['Confirm the sensor is plugged in.', 'Inspect the harness at the exhaust.', 'Verify heater operation (related P0135).'], likelyParts: ['Upstream O2 (B1S1)', 'Connector / wiring'], warnings: ['An unplugged sensor after exhaust work is common.'] },
    P0135: { title: 'O2 B1S1 heater circuit', firstChecks: ['Check the O2 heater fuse.', 'Inspect the upstream sensor connector.', 'Look for a burned heater wire.'], likelyParts: ['O2 heater fuse', 'Upstream O2 sensor (B1S1)', 'Heater wiring'], warnings: ['Do not start with a catalytic converter. This is the sensor heater.'] },
    P0137: { title: 'O2 B1S2 circuit low', firstChecks: ['Inspect the downstream (after-cat) O2 on bank 1.', 'Check for exhaust leaks and a damaged harness.'], likelyParts: ['Downstream O2 (B1S2)', 'Harness / exhaust leak'], warnings: ['Downstream sensors monitor the cat. Do not replace the converter because this circuit code set.'] },
    P0138: { title: 'O2 B1S2 circuit high', firstChecks: ['Inspect the rear O2 connector for oil or water.', 'Check for a shorted wire to power.'], likelyParts: ['Downstream O2 (B1S2)', 'Harness repair'], warnings: ['Not an automatic converter replacement.'] },
    P0141: { title: 'O2 B1S2 heater circuit', firstChecks: ['Check the O2 heater fuse.', 'Inspect the rear O2 plug at the cat.'], likelyParts: ['O2 heater fuse', 'Downstream O2 (B1S2)'], warnings: ['Rear O2 heater codes are a common DIY sensor swap. Confirm the fuse first.'] },
    P0155: { title: 'O2 B2S1 heater circuit', firstChecks: ['Same as P0135 but bank 2 (often the side opposite cylinder 1).', 'Check the shared O2 heater fuse first.'], likelyParts: ['O2 heater fuse', 'Upstream O2 (B2S1)'], warnings: ['Identify bank 2 before you buy. Wrong-bank sensors are a wasted part.'] },
    P0191: { title: 'Fuel rail pressure sensor range', firstChecks: ['Inspect the rail-pressure sensor on the fuel rail.', 'Look for fuel seepage at the sensor.', 'Do not ignore a no-start with this code on GDI engines.'], likelyParts: ['Fuel rail pressure sensor', 'Low-pressure or high-pressure pump as confirmed'], warnings: ['Relieve pressure before cracking GDI fittings. High-pressure gasoline can pierce skin.'] },
    P0193: { title: 'Fuel rail pressure sensor high', firstChecks: ['Unplug the rail sensor and inspect pins.', 'Check the 5V reference.'], likelyParts: ['Fuel rail pressure sensor', 'Wiring / 5V reference'], warnings: ['GDI high-pressure systems are not a “crack the line and look” DIY.'] },
    P0230: { title: 'Fuel pump primary circuit', firstChecks: ['Listen for the in-tank pump prime at key-on.', 'Check the fuel-pump fuse and relay.', 'Inspect the tank harness / lock-ring connector.'], likelyParts: ['Fuel pump fuse / relay', 'In-tank pump / sender assembly', 'Tank harness'], warnings: ['No sparks around an open tank. Support the tank — do not let it hang on the filler neck.'] },
    P0299: { title: 'Turbo underboost', firstChecks: ['Inspect charge piping and clamps after the turbo.', 'Check the air filter and a stuck-open bypass/wastegate hose.', 'Look for a torn intake boot.'], likelyParts: ['Charge pipe / clamp', 'Diverter / bypass valve', 'Boost hose', 'Turbo only after leaks are sealed'], warnings: ['Do not keep boosting a disconnected pipe. Oil can be pumped out the turbo.'] },
    P0325: { title: 'Knock sensor 1 circuit', firstChecks: ['Inspect the knock-sensor connector on the block.', 'Look for a harness pinched by an intake or starter.', 'Do not confuse a knock code with a failing engine until the sensor circuit is checked.'], likelyParts: ['Knock sensor', 'Knock-sensor harness'], warnings: ['If you actually hear knock, pull timing load: stop hard driving and check oil/fuel.'] },
    P0327: { title: 'Knock sensor 1 circuit low', firstChecks: ['Same as P0325, plus a shorted or unplugged sensor.'], likelyParts: ['Knock sensor', 'Harness repair'], warnings: ['PCM may pull timing and the engine will feel lazy. Fix the circuit; do not just run higher octane forever.'] },
    P0340: { title: 'Camshaft position sensor circuit', firstChecks: ['Inspect the cam sensor connector (often on the valve cover or timing cover).', 'Check oil in the connector.', 'Verify it is fully bolted and the gap is not packed with metal.'], likelyParts: ['Camshaft position sensor', 'Connector / wiring'], warnings: ['Can cause extended crank or no-start. Check battery first.'] },
    P0341: { title: 'Camshaft position sensor range', firstChecks: ['Inspect the sensor and tone wheel/reluctor.', 'On VVT engines, check oil level and a stuck VVT solenoid before assuming the chain jumped.'], likelyParts: ['Cam sensor', 'VVT solenoid / screen', 'Timing chain only after oil and solenoid are ruled out'], warnings: ['Do not pull a timing cover as step one. Oil and the solenoid are cheaper.'] },
    P0351: coilCircuitGuide('A'),
    P0401: { title: 'EGR flow insufficient', firstChecks: ['Inspect the EGR valve and passages for carbon.', 'Check vacuum hoses on older vacuum-EGR trucks.', 'Look for a plugged EGR tube.'], likelyParts: ['EGR valve', 'EGR gasket / tube', 'Carbon cleaning'], warnings: ['Some EGR passages are in the intake — do not snap a brittle tube. Let a hot engine cool.'] },
    P0403: { title: 'EGR control circuit', firstChecks: ['Inspect the EGR valve connector.', 'Check the EGR fuse / driver circuit.'], likelyParts: ['EGR valve (integral solenoid)', 'Connector / wiring'], warnings: ['A circuit code is electrical. Carbon-cleaning will not fix an open coil.'] },
    P0440: { title: 'EVAP system fault', firstChecks: ['Tighten the gas cap until it clicks.', 'Inspect the cap seal and filler neck.', 'Look at purge and vent hoses for cracks.'], likelyParts: ['Gas cap', 'Purge valve', 'Vent valve / hose'], warnings: ['Not a drivability emergency unless you smell fuel.'] },
    P0441: { title: 'EVAP incorrect purge flow', firstChecks: ['Inspect the purge valve on the engine (usually a small solenoid on a vapor hose).', 'Check that the hose to the canister is not collapsed or disconnected.'], likelyParts: ['Purge valve', 'Purge hose'], warnings: ['A purge valve stuck open can stall a hot engine and throw lean/rich codes.'] },
    P0442: { title: 'EVAP small leak', firstChecks: ['Tighten and replace a tired gas cap first.', 'Inspect EVAP hoses at the engine and over the axle.', 'Smoke-test only if you have the tool — soapy water on hoses is a driveway substitute.'], likelyParts: ['Gas cap', 'EVAP hose', 'Purge or vent valve'], warnings: ['Do not clamp the vent shut and forget it.'] },
    P0443: { title: 'EVAP purge valve circuit', firstChecks: ['Inspect the purge-valve connector on the engine.', 'Check the EVAP fuse.'], likelyParts: ['Purge valve', 'Connector / fuse'], warnings: ['A stuck-open purge can make a hot stall. Unplug it as a test only, then replace the valve — do not leave it unplugged.'] },
    P0446: { title: 'EVAP vent control circuit', firstChecks: ['Inspect the vent valve near the canister (spare-tire / over-axle area).', 'Check for a mud-packed vent filter.'], likelyParts: ['Vent valve', 'Vent filter / hose', 'Connector'], warnings: ['Do not seal the vent closed as a “fix.”'] },
    P0455: { title: 'EVAP large leak', firstChecks: ['Gas cap first — missing or loose is the #1 large leak.', 'Check the filler-neck seal and a disconnected canister hose.'], likelyParts: ['Gas cap', 'Filler-neck / hose', 'Canister hose'], warnings: ['If you smell heavy fuel, find the leak. Do not wrench on a dripping line in a closed garage.'] },
    P0456: { title: 'EVAP very small leak', firstChecks: ['Replace a cracked or old gas cap first and drive several trips.', 'Inspect tiny cracks at plastic EVAP tees.'], likelyParts: ['Gas cap', 'Small EVAP hose / tee'], warnings: ['These can take days to retest. Do not keep throwing sensors at it every morning.'] },
    P0463: { title: 'Fuel level sensor circuit high', firstChecks: ['Does the gauge read full all the time or empty? Note that.', 'Inspect the tank-pump connector / lock ring.', 'A recent pump replacement with a pinched sender wire is common.'], likelyParts: ['Fuel pump/sender assembly', 'Tank harness'], warnings: ['Support the tank. No sparks. The sender is usually part of the pump module.'] },
    P0500: { title: 'Vehicle speed sensor A', firstChecks: ['Note whether the speedometer is dead.', 'Inspect the VSS at the transmission tailshaft or ABS-based speed signal.', 'Check the connector for metal flakes (gear-type VSS).'], likelyParts: ['Vehicle speed sensor', 'ABS wheel-speed sensor if speedo uses ABS', 'Connector'], warnings: ['Cruise, shifting, and ABS can all act up. Confirm whether this vehicle uses a trans VSS or wheel-speed data.'] },
    P0505: { title: 'Idle control system', firstChecks: ['Clean the throttle body with throttle-body cleaner (not on a hot blade).', 'Check for vacuum leaks.', 'On cable-throttle engines, inspect the IAC valve.'], likelyParts: ['Throttle-body cleaning', 'IAC valve (cable throttle)', 'Vacuum hose'], warnings: ['Do not jam an electronic throttle open by hand.'] },
    P0506: { title: 'Idle RPM too low', firstChecks: ['Clean the throttle body.', 'Check for a dirty IAC or a big carbon ridge.', 'Look for dragging brakes only after the intake is clean.'], likelyParts: ['Throttle-body service', 'IAC valve', 'Vacuum leak repair'], warnings: ['A stalling idle in drive with A/C on is classic dirty throttle.'] },
    P0507: { title: 'Idle RPM too high', firstChecks: ['Find a vacuum leak (hiss) at intake boots and brake booster hose.', 'Check for a stuck-open IAC or unseated throttle after cleaning.', 'Inspect a stuck-open purge valve.'], likelyParts: ['Vacuum hose / intake boot', 'IAC / throttle body', 'Purge valve'], warnings: ['High idle with a hiss is almost never a new PCM.'] },
    P0562: { title: 'System voltage low', firstChecks: ['Measure or observe headlights at idle vs. rev.', 'Clean battery terminals.', 'Check age of the battery.'], likelyParts: ['Battery', 'Alternator', 'Battery cable / ground'], warnings: ['Low voltage creates fake module and sensor codes. Charge/test the battery first.'] },
    P0563: { title: 'System voltage high', firstChecks: ['If voltmeter (or a cheap socket meter) shows 15.5V+ running, stop charging the battery to death.', 'Inspect the alternator connector.', 'A recent battery jump gone wrong can also spike modules.'], likelyParts: ['Alternator (regulator)', 'Alternator connector'], warnings: ['Overcharging boils batteries and kills modules. Do not keep driving it at 16 volts.'] },
    P0601: { title: 'PCM memory checksum', firstChecks: ['Verify battery voltage is stable.', 'Do not flash or disconnect the PCM with a dying battery.', 'Note if this started after a jump-start or water in the cowl.'], likelyParts: ['Battery / charging repair first', 'PCM only after power/ground proof and a confirmed internal fault'], warnings: ['Do not buy a PCM as step one. Low voltage and a bad flash mimic this.'] },
    P0606: { title: 'PCM processor fault', firstChecks: ['Charge the battery. Recheck after a clean power-up.', 'Inspect PCM connectors for water (cowl leaks).', 'Check PCM grounds and power relay.'], likelyParts: ['Power/ground repair', 'PCM relay', 'PCM after confirmed internal failure'], warnings: ['A “processor” code during low voltage is often a survivor, not a dead module.'] },
    P0641: { title: 'Sensor 5V reference A open', firstChecks: ['List every other sensor code that set with this. Shared 5V means one shorted sensor can kill the lot.', 'Unplug MAP, TPS, A/C pressure, and oil-pressure sensors one at a time (key off between) to see if the 5V comes back.'], likelyParts: ['A shorted 5V sensor', '5V reference wire repair', 'PCM only if the reference stays dead with sensors unplugged'], warnings: ['Do not replace the PCM until you unplug the sensors on that 5V feed.'] },
    P0011: { title: 'Cam timing over-advanced bank 1', firstChecks: ['Check oil level and oil age first. VVT needs oil.', 'Inspect the bank-1 VVT/oil-control solenoid and its screen.', 'Do not assume a jumped chain until oil and the solenoid are checked.'], likelyParts: ['Engine oil / filter', 'VVT solenoid / screen', 'Cam phaser or chain after proof'], warnings: ['Low oil or sludge is the #1 DIY cause. A phaser job is not step one.'] },
    P0014: { title: 'Cam timing over-retarded bank 1', firstChecks: ['Same oil-first path as P0011.', 'A stuck solenoid or a worn phaser can hold the cam retarded.'], likelyParts: ['Oil / filter', 'VVT solenoid', 'Cam phaser after oil and solenoid'], warnings: ['Rattle on cold start plus this code is a common phaser pattern — still change oil and try the solenoid first if they are cheap and accessible.'] },
    P0016: { title: 'Crank/cam correlation bank 1', firstChecks: ['Check oil and the cam/crank sensors and their connectors.', 'A recent “timing kit” with a missed mark will set this immediately.', 'VVT solenoid screens clogged with sludge can fake a jumped chain.'], likelyParts: ['Cam or crank sensor', 'VVT solenoid / oil', 'Timing chain/belt only after the cheap checks'], warnings: ['If it is a timing belt engine at or past interval, do not keep driving it. Belt-plus-interference engines bend valves.'] },
    P0087: { title: 'Fuel rail pressure too low', firstChecks: ['Note whether it is a GDI (high-pressure pump on the head) or a conventional rail.', 'Check for a starved tank, pinched line, or weak in-tank pump.', 'Listen for the in-tank pump prime.'], likelyParts: ['In-tank fuel pump', 'Fuel filter (if serviceable)', 'High-pressure pump on GDI after the low-side is proven'], warnings: ['GDI high-pressure fittings are not a casual crack-open DIY. No-start with this code: do not keep cranking until the rail is empty of ideas.'] },
    P0685: { title: 'ECM/PCM power relay circuit open', firstChecks: ['Find the PCM/ECM power relay in the under-hood box.', 'Swap with a same-number relay if a spare exists.', 'Check related fuses.'], likelyParts: ['PCM power relay', 'Fuse', 'Relay socket / wiring'], warnings: ['A no-power PCM looks like a dead computer. Try the relay before buying a PCM.'] },
    P0705: { title: 'Transmission range sensor (PRNDL)', firstChecks: ['Does the dash show the right gear? Note mismatches.', 'Inspect the range-sensor / trans-position connector on the transmission.', 'Check the shift-cable adjustment if the shifter and dash disagree.'], likelyParts: ['Transmission range sensor / switch', 'Shift cable adjustment', 'Connector'], warnings: ['May not crank in Park. Confirm it is actually in Park/Neutral before replacing starters.'] },
    P0706: { title: 'Transmission range sensor performance', firstChecks: ['Same as P0705, plus a worn switch or a cable just off the detent.'], likelyParts: ['Range sensor', 'Shift cable', 'Detent / linkage'], warnings: ['Do not start by rebuilding the transmission.'] },
    P0715: { title: 'Input/turbine speed sensor circuit', firstChecks: ['Inspect the input-speed sensor on the transmission (often near the bellhousing).', 'Check fluid level the correct way.', 'Metal on the sensor tip means internal wear — not just a sensor.'], likelyParts: ['Input speed sensor', 'Connector', 'Internal trans inspection if the tip is chewed'], warnings: ['Avoid highway towing if it is slipping. A sensor is DIY; a chewed reluctor is not.'] },
    P0720: { title: 'Output shaft speed sensor circuit', firstChecks: ['Inspect the OSS on the tailshaft / transfer-case area.', 'Note a dead speedometer.', 'Check for metal on the sensor.'], likelyParts: ['Output speed sensor', 'Connector', 'Tone wheel if damaged'], warnings: ['Harsh shifting or limp-in is common. Check the sensor before a rebuild quote.'] },
    P0730: { title: 'Incorrect gear ratio', firstChecks: ['This is the trans saying commanded gear ≠ actual. Check fluid first.', 'Look for companion solenoid or speed-sensor codes.', 'Do not keep flogging a slipping trans.'], likelyParts: ['Fluid / filter service if burnt but still driving', 'Speed sensor', 'Internal clutches / solenoid — often a shop'], warnings: ['Burnt fluid and flare on shifts is not a solenoid-only hope. Tow if it will not hold a gear.'] },
    P0740: { title: 'TCC circuit/open', firstChecks: ['Inspect the trans connector.', 'A circuit code is electrical — the converter clutch solenoid/wiring, not “the whole trans” yet.'], likelyParts: ['TCC solenoid / internal harness', 'External trans connector'], warnings: ['Stall at a stop can be a TCC stuck on. Do not keep driving it in gear at idle if it wants to die in drive.'] },
    P0741: { title: 'TCC performance/stuck off', firstChecks: ['Note RPM on a steady highway cruise. TCC should bring RPM down when locked.', 'Check fluid condition.', 'A slipping converter clutch overheats fluid.'], likelyParts: ['Fluid / filter', 'TCC solenoid', 'Torque converter after fluid and solenoid'], warnings: ['This is a performance code, not always a new transmission. Still: burnt fluid means stop towing.'] },
    P0750: { title: 'Shift solenoid A', firstChecks: ['Inspect the exterior trans connector first.', 'Check fluid.', 'A solenoid electrical code can be the solenoid or the wiring; a performance code with burnt fluid is deeper.'], likelyParts: ['Shift solenoid A / valve body', 'Internal harness', 'Fluid / filter'], warnings: ['Dropping a pan and swapping a solenoid is DIY on many trucks. A sealed 8/9/10-speed is often a shop.'] },
    P2101: { title: 'Throttle actuator range/performance', firstChecks: ['Inspect the electronic throttle-body connector.', 'Look for cowl water on the throttle.', 'Do not pry the blade.'], likelyParts: ['Electronic throttle body', 'Connector / wiring', 'APP pedal only if pedal codes are also present'], warnings: ['Limp mode / high idle. Stop if it surges. A throttle relearn may be needed after replacement — check that vehicle’s procedure.'] },
    P2135: { title: 'Throttle/pedal A/B correlation', firstChecks: ['Inspect the throttle-body connector and the accelerator-pedal connector.', 'Look for water, oil, or bent pins.', 'Wiggle-test the pedal harness under the dash.'], likelyParts: ['Electronic throttle body', 'Accelerator pedal position sensor', 'Harness repair'], warnings: ['Limp mode is the PCM protecting you. Do not floor it. Two sensors disagree — do not replace both as a guess; test which circuit is dead.'] },
    P2195: { title: 'O2 B1S1 stuck lean', firstChecks: ['This is the upstream O2 staying lean — often a real lean condition (vacuum leak/MAF) or a dead sensor.', 'Fix P0171-type leaks first if trims are also lean.', 'Inspect the B1S1 sensor and exhaust leak before it.'], likelyParts: ['Intake leak / MAF', 'Upstream O2 (B1S1)', 'Exhaust leak'], warnings: ['Do not replace the converter for a stuck-lean upstream sensor.'] }
  };

  for (let cyl = 1; cyl <= 12; cyl++) {
    const code = 'P0' + (300 + cyl);
    if (!DETAILED_GUIDANCE[code]) DETAILED_GUIDANCE[code] = misfireGuide('Cylinder ' + cyl + ' misfire');
  }
  for (let cyl = 1; cyl <= 8; cyl++) {
    const inj = 'P0' + (200 + cyl);
    if (!DETAILED_GUIDANCE[inj]) DETAILED_GUIDANCE[inj] = injectorGuide(cyl);
    const coil = 'P0' + (350 + cyl);
    if (!DETAILED_GUIDANCE[coil]) DETAILED_GUIDANCE[coil] = coilCircuitGuide(String.fromCharCode(64 + cyl));
  }
  if (!DETAILED_GUIDANCE.C0040.diySteps) DETAILED_GUIDANCE.C0040 = wheelSpeedGuide('right-front');
  DETAILED_GUIDANCE.C0035.diySteps = DETAILED_GUIDANCE.C0035.diySteps || wheelSpeedGuide('left-front').diySteps;

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

  DETAILED_GUIDANCE.P0172.diySteps = [
    'Do not start with oxygen sensors. Rich means too much fuel or not enough air.',
    'Pull the oil dipstick. If it smells like gasoline, a leaking injector or a long-crank no-start has washed the cylinders — change the oil after you fix the leak, or you can wipe a bearing.',
    'Find the purge valve (small solenoid on a vapor hose, usually on or near the intake). Unplug it. If idle instantly smooths out, replace the purge valve — it was stuck open and dumping fuel vapor.',
    'Check the air filter and the MAF. An oily or soaked MAF over-reports air. Clean with MAF cleaner only.',
    'If it is only bank 1, look at that bank’s injectors for a wet-foul plug. A dripping injector is a rail-off job. Stop if you cannot relieve fuel pressure safely.'
  ];
  DETAILED_GUIDANCE.P0175.diySteps = DETAILED_GUIDANCE.P0172.diySteps;
  DETAILED_GUIDANCE.P0101.diySteps = [
    'Engine off. Pull the air-box lid and look at the filter. If it is caked, replace it. Oil-soaked filters (some “performance” ones) coat the MAF — that is a real cause.',
    'Inspect the rubber intake tube AFTER the MAF, all the way to the throttle. Splits there add air the computer never counts. Replace a cracked boot; tape is not a repair.',
    'Unplug the MAF. Spray only MAF cleaner on the wires/film, dry fully, reconnect until it clicks.',
    'If you just did an air intake or filter and the code started, you left a clamp loose or the MAF unplugged. Fix that before buying a sensor.',
    'A new MAF is last, and it must be the exact sensor for that engine. Recheck after a mix of idle and highway.'
  ];
  DETAILED_GUIDANCE.P0102.diySteps = [
    'Look first: is the MAF actually plugged in? After a filter change this is the #1 miss.',
    'Unplug it and inspect bent or green pins. Repair the pigtail if the lock tab is broken and it will not stay seated.',
    'Follow the same intake-boot leak check as a MAF range code: unmetered air after the MAF can make the reading look low.',
    'If the connector and boot are good, replace the MAF with the exact part. Do not use brake cleaner on the new one.'
  ];
  DETAILED_GUIDANCE.P0106.diySteps = DETAILED_GUIDANCE.P0107.diySteps = [
    'Find the MAP sensor (usually a small sensor on the intake manifold with a 3-wire plug, sometimes a short vacuum hose).',
    'Unplug it. If the nipple or hose is cracked, crushed, or full of oil sludge, replace the hose/sensor. Seat it until it clicks.',
    'With the engine idling, a huge vacuum leak (split brake-booster hose, missing intake boot) will also throw MAP range codes. Listen for a hiss and fix that first.',
    'If several sensors died at once (MAP + TPS + others), stop buying MAP sensors — that is a 5V reference problem (see P0641).'
  ];
  DETAILED_GUIDANCE.P0112.diySteps = DETAILED_GUIDANCE.P0113.diySteps = [
    'The intake-air temp sensor is often built into the MAF, or it is a two-wire probe in the intake tube. Confirm which this engine uses.',
    'Unplug it. A P0113 (high/open) after a filter change usually means you left it unplugged. Plug it in.',
    'A P0112 (low/grounded) is often a pinched wire or a sensor full of water/oil. Repair the wire or replace that sensor/MAF.',
    'Do not replace the thermostat for an IAT code. That is the wrong sensor.'
  ];
  DETAILED_GUIDANCE.P0117.diySteps = DETAILED_GUIDANCE.P0118.diySteps = [
    'Wait until the engine is cold. The coolant-temp sensor is usually in the thermostat housing or intake, two or three wires, not the oil-pressure sender.',
    'Unplug it and look for coolant in the connector (green crust). Repair the pigtail or replace the sensor. Expect a little coolant dribble; have the right mix ready.',
    'If the gauge is pegged or dead and the fans scream at cold start, the sensor or wire is lying to the PCM. Confirm with an infrared thermometer on the metal housing if you have one.',
    'Do not open a hot radiator. If it is overheating for real (steam, rising temp after a new sensor), stop — that is a cooling-system problem, not this circuit code.'
  ];
  DETAILED_GUIDANCE.P0121.diySteps = DETAILED_GUIDANCE.P0122.diySteps = [
    'Electronic throttle: do not pry the blade. Unplug the throttle-body connector and inspect bent pins or cowl water.',
    'Cable throttle: the TPS is a small sensor on the side of the throttle. Check the two mounting screws and the connector.',
    'Spray throttle-body cleaner on a rag and wipe the bore and blade with the key off. Carbon that holds the blade causes range codes and a dirty idle.',
    'If the pedal also has codes (P2135 / P2122), check the pedal connector under the dash before you buy a throttle body.',
    'A replacement electronic throttle may need an idle relearn (key on, wait, start, idle). Use that vehicle’s procedure — there is not one trick for every make.'
  ];
  DETAILED_GUIDANCE.P0131.diySteps = DETAILED_GUIDANCE.P0133.diySteps = DETAILED_GUIDANCE.P0134.diySteps = [
    'Bank 1 sensor 1 is the upstream O2 (or air-fuel) before the catalytic converter on the bank that contains cylinder 1. Confirm bank 1 before you buy.',
    'Look at the harness where it crosses the exhaust. Melted insulation is a wiring job, not a new sensor.',
    'Fix misfire, exhaust leaks before the sensor, and vacuum leaks first. A lazy or low O2 is often the result.',
    'When you replace it, use the exact upstream sensor, anti-seize only on the threads if the new one did not come pre-coated, and keep it off the sensor tip. No RTV fumes on a new O2.',
    'Do not replace the catalytic converter for an upstream circuit or slow-response code.'
  ];
  DETAILED_GUIDANCE.P0135.diySteps = DETAILED_GUIDANCE.P0141.diySteps = DETAILED_GUIDANCE.P0155.diySteps = [
    'Find the O2 heater fuse in the under-hood box (often labeled O2, EMG, or HEVAC depending on the truck). If it is blown, replace it with the same amp. If it blows again, look for a crushed heater wire.',
    'P0135 is bank 1 sensor 1 (upstream). P0141 is bank 1 sensor 2 (after the cat). P0155 is bank 2 sensor 1. Buy the right location.',
    'Unplug the sensor and look for burned plastic. Replacing the sensor is a common DIY with an O2 socket. Soak rusty threads with penetrant; do not round it off.',
    'If two heater codes set together, it is usually the fuse or a shared heater feed, not two coincidental sensors.'
  ];
  DETAILED_GUIDANCE.P0137.diySteps = DETAILED_GUIDANCE.P0138.diySteps = [
    'This is the downstream (after-cat) O2 on bank 1. It watches the converter. A circuit code is the sensor or wiring, not an automatic new cat.',
    'Inspect the rear sensor plug and the wire along the exhaust/heat shield.',
    'Replace the sensor if the harness is intact and the code returns. Use the downstream part, not the upstream one.',
    'Only look at the converter after upstream misfire/fuel is fixed and this sensor is actually working.'
  ];
  DETAILED_GUIDANCE.P0191.diySteps = DETAILED_GUIDANCE.P0193.diySteps = [
    'If this is a GDI engine (high-pressure pump on the head, metal rail), do not crack fittings to “see if it sprays.” Pressure can pierce skin.',
    'Unplug the rail-pressure sensor (on the fuel rail) and inspect pins. A recent intake or rail job with a half-seated plug is common.',
    'Listen for the in-tank pump at key-on. If the low-side pump is dead, the high-side sensor will look crazy. Check the pump fuse/relay first.',
    'A sensor-only DIY is the rail sensor itself on many engines (one bolt or threaded). If pressure is truly low, that is the in-tank or high-pressure pump — stop guessing if it will not start.'
  ];
  DETAILED_GUIDANCE.P0230.diySteps = [
    'Key on, ear at the tank. You should hear the pump run for a couple of seconds. Silence = power, relay, or dead pump.',
    'Check the fuel-pump fuse and relay. Swap the relay with a same-number spare. If the pump comes alive, replace the relay.',
    'Inspect the tank harness at the top of the pump (under the back seat on many trucks, or above the tank). Green pins and a loose lock ring are DIY.',
    'Dropping a tank or lifting a bed is the pump-replace job. Support the tank. No sparks, no smoking. Replace the lock-ring seal so it does not leak.',
    'If the pump runs and it still will not start, this circuit code may be history — look at spark and immobilizer next. Do not keep replacing pumps.'
  ];
  DETAILED_GUIDANCE.P0299.diySteps = [
    'Look at every rubber boot and clamp from the turbo outlet to the throttle/intake. A popped charge pipe is the #1 underboost DIY.',
    'Reseat and clamp. Replace split boots. Do not “drive it to see” with a disconnected pipe — oil can blow out the turbo.',
    'Check the small vacuum/boost hoses to the wastegate or bypass/diverter valve. A split hose here dumps boost.',
    'Inspect the air filter and a stuck-open bypass valve. The turbo itself is last, after the plumbing holds pressure.',
    'If the turbo shaft has huge play or it sounds like gravel, stop. That is a shop/turbo job, not a solenoid.'
  ];
  DETAILED_GUIDANCE.P0325.diySteps = DETAILED_GUIDANCE.P0327.diySteps = [
    'If you hear real spark knock (sharp rattle under load), back out of the throttle, check oil, and use the correct octane. A knock-sensor code with actual knock is not “ignore it.”',
    'If it is quiet and just the light is on, find the knock sensor on the block (often under the intake on V engines). Unplug it and look for a pinched harness from a starter or intake job.',
    'Replacing the sensor can be a 1-bolt DIY on some inline engines and a nightmare under an intake on others. If the intake has to come off, decide if that is your job.',
    'Do not buy a PCM for a knock-sensor circuit code.'
  ];
  DETAILED_GUIDANCE.P0340.diySteps = DETAILED_GUIDANCE.P0341.diySteps = [
    'Check oil level. On VVT engines a cam-sensor “range” code is often oil or a clogged VVT solenoid, not a jumped chain.',
    'Find the cam sensor (valve cover, timing cover, or near the cam gear). Unplug it. Oil in the connector is common — repair or replace the sensor.',
    'If it cranks long then starts, or stalls hot, a failing cam sensor is a fair DIY swap. Use the exact sensor; some look identical and are not.',
    'If you recently had the timing cover off, recheck your cam marks before you buy sensors. A tooth off sets correlation/range immediately.',
    'Stop if it is a belt-driven interference engine and it died on the highway with a slap. That can be a belt — do not keep cranking.'
  ];
  DETAILED_GUIDANCE.P0336.diySteps = DETAILED_GUIDANCE.P0335.diySteps;
  DETAILED_GUIDANCE.P0401.diySteps = [
    'EGR “insufficient flow” is usually carbon, not a computer. Let the engine cool.',
    'Find the EGR valve (typically on the intake or a tube from the exhaust). Unbolt it. If the pintle is caked shut, clean it with a gasket scraper and solvent, or replace the valve and gasket.',
    'Look down the passages. If they are blocked, clean what you can reach. On some trucks the intake has to come up — that is a bigger job.',
    'Vacuum-EGR (older trucks): wiggle the vacuum hoses. A split hose is a cheap fix. Electric EGR: this flow code can still be carbon even when the circuit is fine.',
    'If the valve moves and passages are open and the code stays, check the DPFE/pressure sensor on Ford-style systems (small sensor on a tube) before you buy another EGR valve.'
  ];
  DETAILED_GUIDANCE.P0403.diySteps = [
    'This is the EGR electrical circuit, not “clean the carbon and hope.”',
    'Unplug the EGR and inspect the connector. Check the related fuse.',
    'If you have a meter, the solenoid should not be open/infinite. A failed coil means replace the EGR valve (the motor is in the valve on most modern trucks).',
    'After replacement, make sure the gasket does not block the ports. Clear the code and recheck.'
  ];
  DETAILED_GUIDANCE.P0440.diySteps = DETAILED_GUIDANCE.P0442.diySteps = DETAILED_GUIDANCE.P0456.diySteps = [
    'Tighten the gas cap until it clicks. If the cap is cracked, the seal is flat, or it is missing, replace the cap with the right one and drive several trips. The monitor is slow.',
    'Inspect the filler neck and the rubber seal. A leftover aftermarket cap that does not latch is a classic small-leak cause.',
    'Look at the plastic EVAP lines on the engine and along the frame to the canister. A cracked tee or a hose off a nipple is a clip-and-replace DIY.',
    'Do not keep buying purge valves every week. If the cap and visible hoses are good, the next step is a smoke test at a shop or a careful soapy-water spray on joints with the system pressurized — not a guess-a-part loop.'
  ];
  DETAILED_GUIDANCE.P0455.diySteps = [
    'Large leak: the cap is off, the cap is wrong, or a hose is disconnected. Check the cap first.',
    'Look under the truck at the charcoal canister (near the tank / spare-tire). A hose that popped off during a tank drop or a broken plastic nipple is the usual DIY win.',
    'If you smell raw fuel, find the wet spot. Do not start the engine in a closed garage. A dripping line is a repair, not a “clear the code.”',
    'A rusted filler neck that will not seal the cap needs the neck or the seal, not a new canister.'
  ];
  DETAILED_GUIDANCE.P0441.diySteps = DETAILED_GUIDANCE.P0443.diySteps = [
    'Find the purge valve — a small solenoid on the engine with a vapor hose toward the throttle or intake.',
    'Unplug it. If a hot idle stall goes away, the valve is stuck open. Replace it. Do not leave it unplugged as a repair.',
    'For a circuit code (P0443), inspect the plug and fuse first. Then replace the valve if the wiring is intact.',
    'For incorrect flow (P0441), also check that the hose to the canister is not crushed, glued shut with a bug nest, or left off after intake work.',
    'Clip the new valve the same direction as the old one. Arrows on the valve matter on some parts.'
  ];
  DETAILED_GUIDANCE.P0446.diySteps = DETAILED_GUIDANCE.P0449.diySteps;
  DETAILED_GUIDANCE.P0463.diySteps = [
    'Note the gauge: stuck on full is this code’s usual story.',
    'If someone just replaced the pump, they pinched the sender wire at the lock ring. Drop the access cover or tank enough to inspect before you buy another pump.',
    'The fuel-level sender is almost always part of the pump module. Replacing it means the pump assembly on most trucks. Support the tank, new lock-ring seal, no sparks.',
    'After it is in, fill to a known amount and see if the gauge moves. If not, check the dash connector before accusing the new module.'
  ];
  DETAILED_GUIDANCE.P0500.diySteps = [
    'Does the speedometer work? Dead speedo + P0500 on an older trans with a tailshaft sensor is often that VSS (one sensor, one connector, sometimes a driven gear with metal flakes on it).',
    'Many newer trucks take speed from ABS wheel sensors. If you also have ABS lights and a wheel-speed code, fix that corner first — not a trans sensor.',
    'Inspect the VSS on the trans tail or transfer case. Unplug, look for metal fuzz, replace the sensor and the O-ring.',
    'If the speedo works and cruise/shift only act up, still check that sensor, then the wiring along the trans. Do not rebuild the trans for a speed-sensor circuit code.'
  ];
  DETAILED_GUIDANCE.P0505.diySteps = DETAILED_GUIDANCE.P0506.diySteps = [
    'Dirty throttle is the driveway fix for low idle. Key off. Clean the bore and the backside of the blade with throttle-body cleaner and a rag. Do not jam an electronic blade open.',
    'Cable-throttle engines have an IAC valve on the throttle body. Unbolt it, clean the pintle, or replace it if the pintle is stuck.',
    'Check for vacuum leaks only after it is clean if idle is still low — a big leak usually raises idle (P0507), not lowers it.',
    'After cleaning an electronic throttle, you may need a quiet idle relearn: wheels straight, accessories off, start, idle in park a few minutes, then in drive with the brake held. Use the procedure for that make if it stays hunting.'
  ];
  DETAILED_GUIDANCE.P0507.diySteps = [
    'High idle is usually extra air. Listen for a hiss at the intake boot, PCV hose, and brake-booster hose. Replace split rubber.',
    'A purge valve stuck open also raises idle and may smell like fuel. Unplug it as a test, then replace the valve.',
    'If you just cleaned the throttle and left the blade stuck or the stop screw played with, put it back. Do not “adjust” electronic throttles with a screwdriver.',
    'A stuck-open IAC on older trucks is a clean-or-replace. Same as the low-idle job, opposite direction.'
  ];
  DETAILED_GUIDANCE.P0562.diySteps = [
    'This is low system voltage. Clean the battery posts (negative cable off first) and the engine-block ground.',
    'If the battery is 4–5+ years old or it cranks slow, replace the battery and retest. Low voltage spawns random module codes.',
    'Engine running, a cheap voltmeter on the battery should read about 13.5–14.7V. If it stays at 12V, the alternator is next. Picture the belt routing before you pull it.',
    'Stop if you smell burning at the alternator plug — repair the harness, do not just bolt on an alternator.'
  ];
  DETAILED_GUIDANCE.P0563.diySteps = [
    'If a meter shows ~15.5V or higher with the engine running, the alternator regulator is overcharging. That cooks batteries and modules. Limit the drive.',
    'Inspect the alternator connector. A melted plug needs a pigtail, not only a new alternator.',
    'Replace the alternator (and the battery if it was boiled — look for a swollen case or rotten-egg smell).',
    'Do not keep jump-packing it to “top it off.” That is the opposite of this problem.'
  ];
  DETAILED_GUIDANCE.P0522.diySteps = DETAILED_GUIDANCE.P0521.diySteps;
  DETAILED_GUIDANCE.P0601.diySteps = DETAILED_GUIDANCE.P0606.diySteps = [
    'Charge the battery and clean grounds first. A dying battery during key-on is a famous false PCM “memory/processor” code.',
    'Look in the cowl for water on the PCM connectors. Dry them, fix the cowl drain, and apply dielectric grease. Water kills modules.',
    'Check the PCM power relay and related fuses. Swap the relay with a same-number spare.',
    'If voltage is solid, connectors are dry, and the code is still there after a clean restart, then the module may be failed. Do not buy a PCM until that is true — and it will need programming for that VIN. That is a shop/locksmith step, not a used-module guess from the internet.'
  ];
  DETAILED_GUIDANCE.P0641.diySteps = [
    'Write down every sensor code that set with this. MAP, TPS, A/C pressure, and oil-pressure sensors often share 5-volt reference A.',
    'Key off. Unplug those sensors one at a time. Key on and see if the 5V reference (and this code) returns after one unplug. The sensor that “fixes” it when unplugged is shorted — replace that sensor.',
    'If unplugging everything on that feed still leaves 5V dead, inspect the 5V wire for a pinch to ground, then consider the PCM. PCM is last.',
    'Do not replace five sensors at once. That is how you spend a paycheck and still have a shorted wire.'
  ];
  DETAILED_GUIDANCE.P0011.diySteps = DETAILED_GUIDANCE.P0014.diySteps = [
    'Check the oil now. Low, dirty, or the wrong viscosity oil is the #1 VVT “over advanced/retarded” cause. Change oil and filter with the spec oil if it is sludgy, then retest.',
    'Find the bank-1 cam oil-control (VVT) solenoid — usually in the valve cover. Unplug it, pull it, and clean the screen. Replace the solenoid if it is caked or the screen is torn.',
    'A cold-start rattle plus this code is a common phaser pattern on some engines. Phaser/chain is not the first DIY hour. Oil and solenoid are.',
    'If a shop already sold you a chain kit and it still sets, they missed a solenoid, oil-galley, or a mark. Do not throw another chain at it until that is checked.',
    'Stop if it is a timing-belt interference engine and it slammed silent. That can be a jumped belt — do not crank it.'
  ];
  DETAILED_GUIDANCE.P0016.diySteps = [
    'Oil level and the cam/crank sensor connectors first. A half-plugged cam sensor after a valve-cover gasket job sets correlation.',
    'If the engine was just timed, recheck cam/crank marks before you buy parts. One tooth off is this code.',
    'Clean or replace the VVT solenoid and change sludgy oil. A stuck phaser can look like a jumped chain.',
    'Belt engines at or past the belt interval: if it died suddenly, do not keep cranking. Interference engines bend valves. Tow it.',
    'Chain engines with a dead rattle and this code after oil and solenoid are done are a timing-cover job — real DIY on some 4-cylinders, a shop on most trucks.'
  ];
  DETAILED_GUIDANCE.P0087.diySteps = [
    'Is the tank actually above empty? Starved pumps set low rail pressure.',
    'Key on: you should hear the in-tank pump. No sound = fuse, relay, or pump (see P0230).',
    'Conventional (port-injected) rails: a serviceable fuel filter in the line is a DIY if this vehicle has one. Many trucks are “pump only.”',
    'GDI (pump on the head): prove the in-tank pump first. The high-pressure pump is a second step and the fittings are not casual. No-start: do not grind the starter for minutes.',
    'Look for a pinched line, a crashed-in tank strap, or a recently “repaired” line that is leaking. Fuel smell = find the leak before you buy another pump.'
  ];
  DETAILED_GUIDANCE.P0685.diySteps = [
    'This is the PCM power relay circuit. Find that relay in the under-hood box (cover map). Swap with a same-number relay. If the truck wakes up, replace the relay.',
    'Check related PCM/ignition fuses. Same amp only.',
    'Inspect the relay socket for melted plastic. A burned socket is a repair, not another relay.',
    'If the relay and fuses are good and the PCM still has no power, check main grounds, then the wiring. Do not order a PCM because a $20 relay died.'
  ];
  DETAILED_GUIDANCE.P0705.diySteps = DETAILED_GUIDANCE.P0706.diySteps = [
    'Watch the dash PRNDL. If it does not match the shifter, check the shift cable at the lever on the transmission before you buy a sensor.',
    'The range sensor / NSS / MLPS sits on the trans where the cable attaches on many trucks. Unplug it, look for corrosion, replace the switch if the cable is adjusted and the connector is good.',
    'If it will not crank, confirm it really is in Park or Neutral and try Neutral. A bad range switch is a common no-crank that gets blamed on the starter.',
    'Do not drop the pan for this code. It is an external switch/cable job on most vehicles.'
  ];
  DETAILED_GUIDANCE.P0715.diySteps = DETAILED_GUIDANCE.P0720.diySteps = [
    'P0715 is input/turbine speed (bellhousing area). P0720 is output speed (tailshaft / transfer case). Find the right sensor.',
    'Unplug it. Metal fuzz on the tip means the sensor is reporting real debris — replace the sensor, then take the fluid condition seriously. Fuzz is not “just a sensor” if the fluid is glitter.',
    'If the tip is clean, replacing the sensor is a 1-bolt DIY on many transmissions. New O-ring, snug bolt, clear codes.',
    'If it still slips or ratios are wrong after a new sensor, that is internal. Stop towing.'
  ];
  DETAILED_GUIDANCE.P0730.diySteps = [
    'Incorrect gear ratio means the trans did not hold the gear it commanded. Check fluid the correct way (hot/running/park as required). Do not dump a quart in a sealed unit “just in case” without a procedure.',
    'If fluid is dark and burnt, stop hard driving. A pan-drop filter service is DIY on many trucks and is a starting repair, not a miracle on a cooked clutch pack.',
    'Look for companion speed-sensor or solenoid codes and fix those first — a dead OSS can fake a ratio code.',
    'If it flares, bangs, or will not move, that is not a driveway solenoid hope. Tow it. “Fix in a can” is not step one.'
  ];
  DETAILED_GUIDANCE.P0740.diySteps = DETAILED_GUIDANCE.P0741.diySteps = [
    'TCC is the converter lockup clutch. Circuit (P0740): inspect the trans connector first, then the solenoid/internal harness. Performance/stuck off (P0741): fluid and a slipping lockup clutch.',
    'On a steady highway cruise, RPM should drop when lockup hits. If RPM stays high and fluid is hot/burnt, the clutch is slipping — service fluid if the pan comes off, and do not keep towing.',
    'If it stalls at a stop in drive, lockup may be stuck on. Try Neutral at the light. That is a solenoid/valve-body or converter problem — not a new engine idle valve.',
    'Pan-off solenoid replacement is DIY on many 4-speeds. Modern sealed units are a shop. Either way, burnt fluid means be honest: a $12 bottle will not glue a clutch.'
  ];
  DETAILED_GUIDANCE.P0750.diySteps = [
    'Shift solenoid A electrical: inspect the big trans connector for green pins. Clean with electrical cleaner.',
    'If the connector is good, a pan-drop to swap solenoid A is a real DIY on many older trucks: drain, pan, filter, solenoid, new gasket, correct fluid, fill per procedure.',
    'If fluid is glittery or smells like toast, a solenoid will not save the clutches. Decide on a rebuild/used unit instead of stacking solenoids.',
    'Sealed 8-speed and up: this is usually a shop. Do not punch holes in a sealed case to “check fluid” the wrong way.'
  ];
  DETAILED_GUIDANCE.P2101.diySteps = DETAILED_GUIDANCE.P2135.diySteps = [
    'Limp mode (no pedal, high idle, or reduced power) is the computer protecting the throttle. Do not floor it.',
    'Unplug the throttle-body connector (engine bay) and the accelerator-pedal connector (under the dash). Look for water, bent pins, or a chewed harness. Repair that before a throttle body.',
    'Cowl leaks dripping on the throttle connector are common. Dry it, seal the cowl, dielectric grease.',
    'If the wiring is clean, an electronic throttle body is a bolt-on DIY on many engines (a few bolts, new gasket). Do not force the blade.',
    'After replacement, do the idle/throttle relearn for that vehicle (often key on wait, start, idle). If pedal codes remain with a new throttle, replace or test the pedal next — not both at once as a guess.'
  ];
  DETAILED_GUIDANCE.P2195.diySteps = [
    'Stuck lean on the upstream O2: either the engine is lean (air leak/MAF/fuel) or the sensor is dead.',
    'Do the P0171 checks first: intake boot after the MAF, PCV, vacuum hoses. Fix leaks.',
    'If trims are normal and only the O2 is stuck lean, replace bank 1 sensor 1 (upstream). Confirm it is the pre-cat sensor on bank 1.',
    'Do not replace the catalytic converter for this code.'
  ];
  DETAILED_GUIDANCE.U0073.diySteps = [
    'Bus off means modules stopped talking. Charge the battery and clean the main grounds first. This is the same starting path as other U-codes, only louder.',
    'Think about what got wet or unplugged: a trailer module, an ABS module full of water, a recently installed stereo, a crushed dash harness.',
    'Pull fuses for add-on accessories and see if the bus comes back. Aftermarket junk on CAN is a real cause.',
    'Do not replace the PCM because the whole bus is quiet. Prove power, grounds, and a shorted accessory first.'
  ];
  DETAILED_GUIDANCE.U0101.diySteps = [
    'TCM went quiet. Charge the battery. Inspect the transmission case connector (often a 20-way on the trans). Corrosion there fakes a dead TCM.',
    'Check trans/TCM fuses and the PCM/TCM power relay.',
    'If the connector is packed with ATF, the internal harness is leaking. That is a pan/harness job on some units, a shop on others — not a used TCM from a junkyard as step one.',
    'A replacement TCM usually needs programming. Do not tow a “blank” module home as a guess.'
  ];
  DETAILED_GUIDANCE.U0121.diySteps = [
    'ABS module went quiet. Check ABS fuses first. Look at the ABS module (usually on the master-cylinder HCU) for water or a half-seated plug.',
    'A shorted wheel-speed wire can take the module off the bus. If you also have a C0035/C0040-type code, inspect that harness before you buy an ABS module.',
    'Clean grounds on the frame/ABS bracket.',
    'A new ABS module is often a programming job. Prove power, ground, and a dry connector first. You still have hydraulic brakes — drive gently, not like the ABS light is a decoration on ice.'
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
      if (/^P020[2-8]$/.test(code) || /^P035[2-8]$/.test(code)) return;
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
