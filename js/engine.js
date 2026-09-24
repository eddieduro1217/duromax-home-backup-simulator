/* Load-calculation engine for the DuroMax Home Backup Power Simulator.
 * Pure functions, no DOM. Works in the browser (window.Engine) and in Node (module.exports) for tests.
 *
 * Model:
 *  - Available running watts = min(generator running watts for the fuel, connection limit).
 *      Connection limit: 14-50R inlet = 50A x 240V = 12,000 W; L14-30R = 30A x 240V = 7,200 W;
 *      transfer switch max watts (Reliance rating) also caps it; extension cords = generator running watts.
 *  - Available surge watts = generator starting watts for the fuel.
 *  - Start check for an appliance = running watts of everything else already on + that appliance's starting watts.
 *  - Whole-load check (reset / preset / generator change) = total running + the single largest start-up surge.
 *  - AirGo soft starter removes SOFT_START_REDUCTION of the surge (starting - running) on eligible loads.
 *  - Transfer switch circuits: 120V load = 1 circuit, 240V load = 2 circuits (Reliance "10 single-pole or 5 double-pole").
 */
(function (root) {
  'use strict';

  function effectiveStarting(app, softStartOn, reduction) {
    if (softStartOn && app.softStart) {
      const surge = Math.max(0, app.starting - app.running);
      return Math.round(app.running + surge * (1 - reduction));
    }
    return app.starting;
  }

  function circuitSlots(app) { return app.volts === 240 ? 2 : 1; }

  /** Capacity for a generator + fuel + connection. */
  function capacity(gen, fuelName, connection, transferSwitch) {
    const f = gen && gen.fuels[fuelName];
    if (!f) return { running: 0, surge: 0, limitedBy: 'none' };
    let running = f.running, limitedBy = 'generator running rating';
    if (connection === 'interlock' || connection === 'transfer') {
      if (gen.outletCapW && gen.outletCapW < running) { running = gen.outletCapW; limitedBy = gen.bestOutlet + ' outlet (' + (gen.bestOutlet === '14-50R' ? '50A' : '30A') + ')'; }
      if (connection === 'transfer' && transferSwitch && transferSwitch.max_watts && transferSwitch.max_watts < running) {
        running = transferSwitch.max_watts; limitedBy = 'transfer switch ' + transferSwitch.sku;
      }
    }
    return { running, surge: f.starting, limitedBy };
  }

  /** Why an appliance cannot be connected at all in the current setup (or null). */
  function blockedReason(app, connection, wiredSet) {
    if (connection === 'cords' && app.volts === 240) return '240V appliances cannot run on extension cords';
    if (connection === 'transfer' && !wiredSet.has(app.id)) return 'Not wired to the transfer switch';
    return null;
  }

  /** Totals for a set of appliances that are switched on. */
  function totals(apps, onSet, opts) {
    let running = 0, maxSurgeExtra = 0, surgeApp = null;
    for (const a of apps) {
      if (!onSet.has(a.id)) continue;
      running += a.running;
      const extra = effectiveStarting(a, opts.softStart, opts.reduction) - a.running;
      if (extra > maxSurgeExtra) { maxSurgeExtra = extra; surgeApp = a; }
    }
    return { running, surgePeak: running + maxSurgeExtra, surgeApp };
  }

  /** Check the whole load (used on reset, presets, and generator/fuel/connection changes). */
  function checkLoad(apps, onSet, cap, opts) {
    const t = totals(apps, onSet, opts);
    if (t.running > cap.running) {
      return { ok: false, reason: 'running', ...t,
        message: 'Running load ' + fmt(t.running) + ' W is more than the ' + fmt(cap.running) + ' W available (' + cap.limitedBy + ').' };
    }
    if (t.surgePeak > cap.surge) {
      return { ok: false, reason: 'surge', ...t,
        message: 'Starting ' + t.surgeApp.name + ' needs ' + fmt(t.surgePeak) + ' W for a moment, but the generator peaks at ' + fmt(cap.surge) + ' W.' };
    }
    return { ok: true, ...t };
  }

  /** Check switching one more appliance on. */
  function checkTurnOn(apps, onSet, app, cap, opts) {
    const t = totals(apps, onSet, opts);
    const newRunning = t.running + app.running;
    if (newRunning > cap.running) {
      return { ok: false, reason: 'running', message: 'Adding ' + app.name + ' (' + fmt(app.running) + ' W) brings the running load to ' +
        fmt(newRunning) + ' W. Only ' + fmt(cap.running) + ' W is available (' + cap.limitedBy + ').' };
    }
    const start = t.running + effectiveStarting(app, opts.softStart, opts.reduction);
    if (start > cap.surge) {
      return { ok: false, reason: 'surge', message: app.name + ' needs ' + fmt(effectiveStarting(app, opts.softStart, opts.reduction)) +
        ' W to start. With ' + fmt(t.running) + ' W already running, that is ' + fmt(start) + ' W, but the generator peaks at ' + fmt(cap.surge) + ' W.' };
    }
    return { ok: true };
  }

  /** Estimated runtime (hours) from the 25% / 50% load figures, interpolated linearly in fuel-use rate. */
  function runtimeHours(fuel, loadFraction) {
    if (!fuel || !fuel.runtime25 || !fuel.runtime50) return null;
    const f = Math.max(0.1, Math.min(1, loadFraction));
    const r25 = 1 / fuel.runtime25, r50 = 1 / fuel.runtime50;
    const rate = r25 + (f - 0.25) * (r50 - r25) / 0.25;
    return rate > 0 ? 1 / rate : null;
  }

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  const Engine = { effectiveStarting, circuitSlots, capacity, blockedReason, totals, checkLoad, checkTurnOn, runtimeHours, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
