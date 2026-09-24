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
 *
 * Sizing recommendation (DuroMax Residential Generator Sizing Guide, rev. 7-29-26):
 *  - Running target = total running W x (1 + 20% headroom), rounded up to the next 100 W.
 *  - Peak target    = MAX(total running + largest single additional startup, running target), rounded up to 100 W.
 *    (Headroom is applied once, to continuous running only - not added again to the startup surge.)
 *  - A generator qualifies on the selected fuel only if running >= running target AND peak >= peak target.
 *  - Soft start reduces only the additional startup above running (planning reduction 50%); running is never reduced.
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
  function ceil100(n) { return Math.ceil(n / 100) * 100; }

  /** Recommended generator size for a load plan (sizing guide method). */
  function targets(apps, onSet, opts, headroom) {
    const h = headroom == null ? 0.2 : headroom;
    const t = totals(apps, onSet, opts);
    const runTarget = ceil100(t.running * (1 + h));
    const peakTarget = ceil100(Math.max(t.surgePeak, t.running * (1 + h)));
    return { running: t.running, surgePeak: t.surgePeak, surgeApp: t.surgeApp, runTarget, peakTarget, headroom: h };
  }

  /** Does a generator qualify for the targets on this fuel + connection? */
  function qualify(gen, fuelName, connection, tg, transferSwitch) {
    const f = gen.fuels[fuelName];
    if (!f) return { status: 'FUEL NOT SUPPORTED', ok: false };
    if (connection !== 'cords' && !gen.bestOutlet) return { status: 'NO 240V OUTLET', ok: false };
    const cap = capacity(gen, fuelName, connection, transferSwitch);
    const meetsRun = cap.running >= tg.runTarget, meetsPeak = cap.surge >= tg.peakTarget;
    let status = meetsRun && meetsPeak ? 'QUALIFIES' : 'DOES NOT QUALIFY';
    if (status === 'QUALIFIES' && connection !== 'cords' && gen.bestOutlet !== '14-50R') status = 'CAPACITY OK - VERIFY CONNECTION';
    return { status, ok: meetsRun && meetsPeak, meetsRun, meetsPeak, cap };
  }

  /** All generators that qualify, smallest first. */
  function matchGenerators(gens, fuelName, connection, tg) {
    if (!tg.running) return [];
    return gens.map(g => ({ gen: g, q: qualify(g, fuelName, connection, tg) }))
      .filter(x => x.q.ok)
      .sort((a, b) => (a.gen.fuels[fuelName].running - b.gen.fuels[fuelName].running) || ((a.gen.price || 1e9) - (b.gen.price || 1e9)));
  }

  /** Central A/C from nameplate data (sizing guide A/C method, LRA factor 0.49). */
  function acFromNameplate(volts, rla, fanFla, lra, factor) {
    const k = factor == null ? 0.49 : factor;
    if (!(volts > 0 && rla > 0 && lra > 0)) return null;
    const fan = fanFla > 0 ? fanFla : 0;
    return { running: ceil100(volts * (rla + fan)), starting: ceil100(volts * lra * k + volts * fan) };
  }

  const Engine = { effectiveStarting, circuitSlots, capacity, blockedReason, totals, checkLoad, checkTurnOn, runtimeHours, fmt,
    ceil100, targets, qualify, matchGenerators, acFromNameplate };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
