// Run: node tests/engine.test.js
const assert = require('assert');
const E = require('../js/engine.js');
global.window = {}; require('../data/appliances.js'); require('../data/generators.js');
const APPS = window.APPLIANCES, GENS = window.GENERATORS;
const g = id => GENS.find(x => x.model === id);
const opts = { softStart: false, reduction: window.SOFT_START_REDUCTION };

// Capacity: XP13000HX gas via interlock (14-50R) = min(10500, 12000)
let cap = E.capacity(g('XP13000HX'), 'Gasoline', 'interlock');
assert.strictEqual(cap.running, 10500); assert.strictEqual(cap.surge, 13000);
// XP28000iH capped by 50A outlet
cap = E.capacity(g('XP28000iH'), 'Gasoline', 'interlock');
assert.strictEqual(cap.running, 12000); assert.ok(/14-50R/.test(cap.limitedBy));
// XP7000iH is L14-30 -> 7200 cap but gen runs 5500
assert.strictEqual(E.capacity(g('XP7000iH'), 'Gasoline', 'interlock').running, 5500);
// Transfer switch 30A (7500W) doesn't lower a 5500W gen
// Soft start: central AC 9000 start, 3500 run -> 3500 + 5500*0.4 = 5700
const ac = APPS.find(a => a.id === 'centralac');
assert.strictEqual(E.effectiveStarting(ac, true, 0.6), 5700);
assert.strictEqual(E.effectiveStarting(ac, false, 0.6), 9000);
// Essentials total
const ess = new Set(window.PRESETS.essentials);
const t = E.totals(APPS, ess, opts);
const expected = APPS.filter(a => ess.has(a.id)).reduce((s, a) => s + a.running, 0);
assert.strictEqual(t.running, expected);
// XP4850EH (3850 run / 4850 start) cannot run all essentials
assert.strictEqual(E.checkLoad(APPS, ess, E.capacity(g('XP4850EH'), 'Gasoline', 'interlock'), opts).ok, false);
// XP13000HX can
assert.strictEqual(E.checkLoad(APPS, ess, E.capacity(g('XP13000HX'), 'Gasoline', 'interlock'), opts).ok, true);
// Central AC start on XP9500iH (7600 run / 9500 start) with nothing else: 9000 <= 9500 ok; with fridge running 700+9000 > 9500 fails; with soft start ok
cap = E.capacity(g('XP9500iH'), 'Gasoline', 'interlock');
assert.strictEqual(E.checkTurnOn(APPS, new Set(), ac, cap, opts).ok, true);
assert.strictEqual(E.checkTurnOn(APPS, new Set(['fridge']), ac, cap, opts).ok, false);
assert.strictEqual(E.checkTurnOn(APPS, new Set(['fridge']), ac, cap, { ...opts, softStart: true }).ok, true);
// Runtime interpolation hits the published points
const f = g('XP13000HX').fuels.Gasoline;
assert.ok(Math.abs(E.runtimeHours(f, 0.25) - f.runtime25) < 1e-9);
assert.ok(Math.abs(E.runtimeHours(f, 0.5) - f.runtime50) < 1e-9);
// Blocked reasons
assert.ok(E.blockedReason(ac, 'cords', new Set()));
assert.ok(E.blockedReason(APPS[0], 'transfer', new Set()));
assert.strictEqual(E.blockedReason(APPS[0], 'interlock', new Set()), null);
console.log('All engine tests passed. Essentials running load =', expected, 'W');
