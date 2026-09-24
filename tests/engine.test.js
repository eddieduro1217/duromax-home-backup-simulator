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
// Soft start (guide): 3-ton AC 3800 run / 10300 start -> 3800 + 6500*0.5 = 7050
const ac = APPS.find(a => a.id === 'centralac');
assert.strictEqual(E.effectiveStarting(ac, true, 0.5), 7050);
assert.strictEqual(E.effectiveStarting(ac, false, 0.5), 10300);
// Guide worked example: 6,900 W running, 3.5-ton Lennox 10ACC 4600/12100 with 50% soft start
// -> additional 7500*0.5 = 3750; peak 10,650 -> 10,700; running target 6900*1.2 = 8280 -> 8,300
{
  const demo = [{ id: 'base', running: 2300, starting: 2300 }, { id: 'ac', running: 4600, starting: 12100, softStart: true }];
  const tg = E.targets(demo, new Set(['base', 'ac']), { softStart: true, reduction: 0.5 }, 0.2);
  assert.strictEqual(tg.running, 6900); assert.strictEqual(tg.runTarget, 8300); assert.strictEqual(tg.peakTarget, 10700);
}
// Nameplate method (guide example Lennox 10ACC-042-230-02): 230V, RLA 17.9, fan 1.9, LRA 103 -> 4600 / 12100
assert.deepStrictEqual(E.acFromNameplate(230, 17.9, 1.9, 103), { running: 4600, starting: 12100 });
// Essentials total
const ess = new Set(window.PRESETS.essentials);
const t = E.totals(APPS, ess, opts);
const expected = APPS.filter(a => ess.has(a.id)).reduce((s, a) => s + a.running, 0);
assert.strictEqual(t.running, expected);
// Generator match: essentials on gasoline via interlock -> smallest qualifying is sorted first and all pass both tests
{
  const tg = E.targets(APPS, new Set(window.PRESETS.essentials), opts, 0.2);
  const m = E.matchGenerators(GENS, 'Gasoline', 'interlock', tg);
  assert.ok(m.length > 0);
  for (const x of m) assert.ok(x.q.cap.running >= tg.runTarget && x.q.cap.surge >= tg.peakTarget);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].gen.fuels.Gasoline.running >= m[i - 1].gen.fuels.Gasoline.running);
  // Natural gas excludes dual-fuel models
  assert.ok(E.matchGenerators(GENS, 'Natural Gas', 'interlock', tg).every(x => x.gen.fuels['Natural Gas']));
}
// Sizing-guide fuel override applied
assert.strictEqual(g('XP13000HXT').fuels.Propane.running, 9500);
// Models removed from the simulator are gone
for (const m of ['XP4850EH', 'XP10000X', 'DS10000EH', 'XP11500EH', 'XP15000HX', 'XP15000HXT']) assert.ok(!g(m), m + ' should be removed');
// A generator that can run a load but has no 20% reserve is not recommended
{
  const tight = { model: 'T', bestOutlet: 'L14-30R', outletCapW: 7200, fuels: { Gasoline: { running: expected + 100, starting: 99999 } } };
  assert.strictEqual(E.checkLoad(APPS, ess, E.capacity(tight, 'Gasoline', 'interlock'), opts).ok, true);
  assert.strictEqual(E.qualify(tight, 'Gasoline', 'interlock', E.targets(APPS, ess, opts, 0.2)).ok, false);
}
// Auto connection: 50A/30A outlet -> home inlet; no 240V outlet -> extension cords, which can't carry a 240V plan
assert.strictEqual(E.autoConnection(g('XP13000HX')), 'interlock');
assert.strictEqual(E.autoConnection(g('XP2300iH')), 'cords');
{
  const tg = E.targets(APPS, ess, opts, 0.2);   // essentials include the 240V well pump
  const m = E.matchGenerators(GENS, 'Gasoline', 'auto', tg, true);
  assert.ok(m.length && m.every(x => x.conn === 'interlock'));
}
// XP13000HX can
assert.strictEqual(E.checkLoad(APPS, ess, E.capacity(g('XP13000HX'), 'Gasoline', 'interlock'), opts).ok, true);
// 3-ton central AC (10,300 W start) on XP9500iH (9,500 peak) fails without soft start, passes with it (7,050 W)
cap = E.capacity(g('XP9500iH'), 'Gasoline', 'interlock');
assert.strictEqual(E.checkTurnOn(APPS, new Set(), ac, cap, opts).ok, false);
assert.strictEqual(E.checkTurnOn(APPS, new Set(['fridge']), ac, cap, { ...opts, softStart: true }).ok, true);
// Runtime interpolation hits the published points
const f = g('XP13000HX').fuels.Gasoline;
assert.ok(Math.abs(E.runtimeHours(f, 0.25) - f.runtime25) < 1e-9);
assert.ok(Math.abs(E.runtimeHours(f, 0.5) - f.runtime50) < 1e-9);
// Blocked reasons
assert.ok(E.blockedReason(ac, 'cords'));
assert.strictEqual(E.blockedReason(APPS[0], 'transfer'), null);
assert.strictEqual(E.blockedReason(APPS[0], 'interlock'), null);
// Transfer switch circuits: well pump (240V) = 2, fridge = 1
assert.strictEqual(E.slotsUsed(APPS, new Set(['well', 'fridge'])), 3);
console.log('All engine tests passed. Essentials running load =', expected, 'W');
