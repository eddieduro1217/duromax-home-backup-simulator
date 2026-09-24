// UI + state for the Home Backup Power Simulator.
import { createHouse } from './house.js?v=2.4';

const E = window.Engine;
const GENS = window.GENERATORS;
const EQ = window.EQUIPMENT;
const APPS = window.APPLIANCES;
const AC = window.CENTRAL_AC;
const APP = Object.fromEntries(APPS.map(a => [a.id, a]));
const $ = id => document.getElementById(id);
const fmt = E.fmt;
const RED = window.SOFT_START_REDUCTION, HEADROOM = window.HEADROOM;

const HOME = window.HOME;
const state = {
  model: null, fuel: 'Gasoline', conn: 'interlock',
  sqft: HOME.defaults.sqft, bedrooms: HOME.defaults.bedrooms, bathrooms: HOME.defaults.bathrooms,
  on: new Set(window.PRESETS.essentials), softStart: false, tripped: null, night: true,
  ton: AC.default, nameplate: null, showAll: false,
};

// ---------------- helpers ----------------
const gen = () => GENS.find(g => g.model === state.model);
const fuelSpec = () => gen().fuels[state.fuel];
const opts = () => ({ softStart: state.softStart, reduction: RED });
const cap = () => E.capacity(gen(), state.fuel, state.conn);
const ampsFor = g => g.bestOutlet === '14-50R' ? 50 : g.bestOutlet === 'L14-30R' ? 30 : 0;
const imgUrl = (u, w) => u ? u + (u.includes('?') ? '&' : '?') + 'width=' + w : '';
const blocked = id => E.blockedReason(APP[id], state.conn);
const liveSet = () => new Set([...state.on].filter(id => !blocked(id)));
function compatibleSwitches(g) { const a = ampsFor(g); return EQ.transferSwitches.filter(t => t.amps === a && (t.circuits || 0) >= 6); }
const has240 = () => [...state.on].some(id => APP[id].volts === 240);
function applyHome() {
  // Bedrooms and bathrooms set the lighting and ceiling-fan loads.
  const n = HOME.bulbs(state.bedrooms, state.bathrooms), fans = state.bedrooms;
  Object.assign(APP.lights, { running: n * HOME.bulbWatts, starting: n * HOME.bulbWatts, name: `Essential LED Lights (${n} bulbs)` });
  Object.assign(APP.fans, { running: fans * HOME.fanWatts, starting: fans * HOME.fanWatts, name: `Ceiling Fans (${fans})` });
}
/** Smallest generator that fits the current plan on the current fuel (or the largest on that fuel if none fits). */
function bestFit() {
  const m = E.matchGenerators(GENS, state.fuel, 'auto', E.targets(APPS, state.on, opts(), HEADROOM), has240());
  if (m.length) return m[0].gen;
  const onFuel = GENS.filter(g => g.fuels[state.fuel] && g.bestOutlet);
  return onFuel.sort((a, b) => b.fuels[state.fuel].running - a.fuels[state.fuel].running)[0] || GENS[0];
}
const isPowered = id => state.on.has(id) && !state.tripped && !blocked(id);
function acRla() { return state.nameplate ? state.nameplate.rla : AC.tons[state.ton].rla; }
function applyAc() {
  const a = APP.centralac;
  if (state.nameplate) { a.running = state.nameplate.running; a.starting = state.nameplate.starting; a.name = 'Central A/C (your nameplate)'; }
  else { const t = AC.tons[state.ton]; a.running = t.running; a.starting = t.starting; a.name = `Central A/C (${state.ton}-ton)`; }
}

// ---------------- 3D ----------------
// If WebGL isn't available the calculator still works; the 3D view shows a message instead.
function webglOk() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const noop = () => {};
const houseStub = { setApplianceState: noop, setGenerator: noop, setGeneratorModel: noop, setConnection: noop, setSoftStarter: noop, setNight: noop, setView: noop, ids: [] };
let house = houseStub;
if (webglOk()) {
  try { house = createHouse($('scene'), { onClick: id => toggle(id), onHover: showTooltip }); }
  catch (e) { console.error(e); house = houseStub; }
}
if (house === houseStub) {
  const d = document.createElement('div'); d.className = 'gl-fallback';
  d.innerHTML = '<strong>3D view unavailable</strong><span>This browser or device has 3D graphics turned off. The calculator on the right still works.</span>';
  $('stage').appendChild(d);
}
// Never let one unexpected error blank the page: log it and keep the UI responsive.
window.addEventListener('error', e => { console.error('Simulator error:', e.message); });
window.addEventListener('unhandledrejection', e => { console.error('Simulator error:', e.reason); });
requestAnimationFrame(() => setTimeout(() => $('loading').classList.add('done'), 300));

// ---------------- actions ----------------
function selectGenerator(model) {
  state.model = model;
  const g = gen();
  if (!g.fuels[state.fuel]) state.fuel = Object.keys(g.fuels)[0];
  state.conn = E.autoConnection(g);   // 50A or 30A outlet through a power inlet; extension cords if it has neither
  house.setGeneratorModel(g);
  revalidate();
}
function revalidate() {
  // Called after the generator, fuel, home details, A/C size or soft starter changes.
  const live = liveSet();
  const r = E.checkLoad(APPS, live, cap(), opts());
  if (!r.ok && live.size) { trip(r.message); return; }        // new setup can't carry the load: (re)trip with a current explanation
  if (state.tripped) { state.tripped = null; toast('The new setup can carry these loads, so the generator breaker was reset.'); }
  render();
}
function trip(message) { state.tripped = { message }; render(); }
function resetBreaker() {
  // Reset clears every load so the generator starts from zero, like switching all breakers off before resetting.
  state.on = new Set();
  state.tripped = null;
  render();
  toast('Generator breaker reset and all breakers switched off. Turn loads back on one at a time, starting with the largest motor.');
}
function toggle(id, silent) {
  const a = APP[id];
  if (state.on.has(id)) { state.on.delete(id); render(); return true; }
  const b = blocked(id);
  if (b) { flashRow(id); if (!silent) toast(a.name + ': ' + b + '.'); return false; }
  if (state.tripped) { flashBanner(); toast('Reset the generator breaker first.'); return false; }
  if (a.needs && !state.on.has(a.needs) && !blocked(a.needs)) {
    if (!toggle(a.needs, true)) return false;
    if (state.tripped) return false;
    toast('The indoor blower was switched on too. The central A/C needs it to move air through the house.');
  }
  const r = E.checkTurnOn(APPS, liveSet(), a, cap(), opts());
  state.on.add(id);
  if (!r.ok) trip(r.message); else render();
  return r.ok;
}
function applyPreset(name) {
  state.on = new Set(name === 'off' ? [] : window.PRESETS[name]);
  state.tripped = null;
  revalidate();
}

// ---------------- rendering ----------------
function render() {
  applyAc(); applyHome();
  renderHome(); renderFuel(); renderProduct(); renderSpecs(); renderConnection(); renderAc(); renderMeter(); renderPanel(); renderMatches(); renderBanner(); sync3D();
}

function renderHome() {
  const fill = (el, items) => { if (!el.options.length) el.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); };
  fill($('sqftSelect'), HOME.sqft.map(o => [o.id, o.label]));
  const last = (arr, v) => v === arr[arr.length - 1] ? `${v} or more` : String(v);
  fill($('bedSelect'), HOME.bedrooms.map(v => [v, last(HOME.bedrooms, v)]));
  fill($('bathSelect'), HOME.bathrooms.map(v => [v, last(HOME.bathrooms, v)]));
  $('sqftSelect').value = state.sqft; $('bedSelect').value = String(state.bedrooms); $('bathSelect').value = String(state.bathrooms);
  const acTxt = state.nameplate ? 'your A/C nameplate' : `a ${state.ton}-ton central A/C`;
  $('homeHint').textContent = `We'll plan for ${acTxt}, ${APP.lights.name.match(/\d+/)[0]} LED bulbs and ${state.bedrooms} ceiling fan${state.bedrooms === 1 ? '' : 's'}. You can fine-tune everything in step 3.`;
}

function renderProduct() {
  const g = gen();
  const el = $('product');
  if (el.dataset.model === g.model) return;
  el.dataset.model = g.model;
  el.innerHTML = `<img src="${imgUrl(g.image, 300)}" alt="${g.brand} ${g.model}" loading="lazy">
    <div><div class="p-title">${g.title}</div>
      ${g.price ? `<div class="p-price">$${fmt(g.price)}</div>` : ''}
      <div class="p-status">${g.salesStatus || ''}</div>
      <div class="p-links">${g.manual ? `<a href="${g.manual}" target="_blank" rel="noopener">Owner's manual</a>` : ''}</div></div>
    <a class="btn btn-cta shop" style="grid-column: 1 / -1" href="${g.url}" target="_blank" rel="noopener">Shop the ${g.model}</a>`;
}

function renderFuel() {
  document.querySelectorAll('#fuelSeg button').forEach(b => b.classList.toggle('on', b.dataset.fuel === state.fuel));
  $('fuelHint').textContent = {
    Gasoline: 'Gasoline gives the most power. Every dual fuel and tri fuel model runs on it.',
    Propane: 'Propane stores for years without going stale but makes a little less power than gasoline. Every dual fuel and tri fuel model runs on it.',
    'Natural Gas': 'Natural gas runs from your home\'s gas line, so there\'s no refueling. Only tri fuel models run on it, and output is lower than gasoline.',
  }[state.fuel];
}

function renderSpecs() {
  const g = gen(), f = fuelSpec();
  const outletTxt = g.bestOutlet ? `${g.bestOutlet} · ${ampsFor(g)}A` : '120V only';
  $('genSpecs').innerHTML = `
    <div class="spec"><b>${fmt(f.running)} W</b><span>Running · ${state.fuel}</span></div>
    <div class="spec"><b>${fmt(f.starting)} W</b><span>Peak · ${state.fuel}</span></div>
    <div class="spec"><b>${outletTxt}</b><span>Home backup outlet</span></div>
    <div class="spec"><b>${g.neutral || '—'}</b><span>Neutral (as shipped)</span></div>`;
  $('hudGen').textContent = `${g.brand} ${g.model} · ${state.fuel}`;
}

function renderConnection() {
  const g = gen(), a = ampsFor(g);
  $('connDesc').textContent = state.conn === 'cords'
    ? 'This model has no 30A or 50A outlet, so it can\'t connect to your home panel. Appliances plug in with extension cords, and 240V appliances such as the well pump, water heater, range, electric dryer and central A/C can\'t run.'
    : `Connects to your home through its ${a}A ${g.bestOutlet} outlet, a generator cord and a power inlet box, then an interlock kit or transfer switch at your panel (up to ${fmt(g.outletCapW)} W).`;
  const n = $('neutralNote');
  if (state.conn === 'cords') { n.className = 'note'; n.textContent = 'Use heavy-duty outdoor cords, and plug each high-draw appliance into its own outlet or cord.'; }
  else if (g.neutral === 'Floating') { n.className = 'note ok'; n.textContent = 'Floating neutral: connects to a standard 2-pole transfer switch or interlock kit as-is.'; }
  else if (g.neutral === 'Bonded') {
    n.className = 'note warn';
    n.innerHTML = 'Bonded neutral: a qualified electrician removes the bond before this model is used with a standard 2-pole transfer switch or interlock kit' +
      (g.unbondDoc ? ` (<a href="${g.unbondDoc}" target="_blank" rel="noopener">DuroMax unbond instructions</a>)` : ' (contact DuroMax for this model)') + '. Never run it unbonded unless it is grounded through the home.';
  } else { n.className = 'note'; n.textContent = ''; }
  $('equipList').innerHTML = equipmentFor(g).map(e => `<div class="equip-item"><div><span class="role">${e.role}</span>${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${e.sku ? e.sku + ' · ' : ''}${short(e.title)}</a>` : `<span class="text">${e.title}</span>`}</div><span class="price">${e.price ? '$' + e.price.toFixed(2) : ''}${e.available === false ? ' · out of stock' : ''}</span></div>`).join('');
}
function short(t) { return t.replace(/^(DuroMax|Reliance|GenInterlock|AIRGO|AirGo)\s*/i, '').slice(0, 96); }
function equipmentFor(g) {
  const items = [], a = ampsFor(g);
  if (state.conn !== 'cords' && a) {
    items.push({ role: 'Interlock kit for your panel brand', title: 'GenInterlock kits for Square D, Eaton / Cutler-Hammer, GE, Siemens / Murray / ITE and Bryant panels', url: 'https://www.duromaxpower.com/pages/geninterlock' });
    items.push({ role: 'Backfeed breaker (not included with kit)', title: `${a}A 2-pole breaker that matches your panel brand` });
    const sw = compatibleSwitches(g).filter(t => t.available !== false && (t.max_watts || 1e9) >= Math.min(g.fuels[state.fuel].running, g.outletCapW)).sort((x, y) => y.circuits - x.circuits)[0];
    if (sw) items.push({ role: 'Or, instead of the interlock kit: transfer switch', sku: sw.sku, title: `${sw.title} (${sw.circuits} circuits)`, url: sw.url, price: sw.price_usd, available: sw.available });
    const inlet = EQ.inletBoxes.find(b => b.amps === a && (b.inlet_type === (a === 50 ? 'CS6375' : 'L14-30')) && b.available !== false) || EQ.inletBoxes.find(b => b.amps === a);
    if (inlet) items.push({ role: `Power inlet box (${a}A)`, sku: inlet.sku, title: inlet.title, url: inlet.url, price: inlet.price_usd, available: inlet.available });
    {
      const len = 25;
      const plugs = a === 50 ? ['14-50P', 'L14-50P'] : ['L14-30P'];
      const c = EQ.cords.find(c => plugs.includes(c.plug_end) && c.length_ft === len && c.available !== false) || EQ.cords.find(c => plugs.includes(c.plug_end) && c.length_ft >= len);
      if (c) items.push({ role: `Generator cord · ${len} ft (longer cords available)`, sku: c.sku, title: c.title, url: c.url, price: c.price_usd, available: c.available });
    }
  }
  if (state.softStart && state.on.has('centralac')) {
    const small = acRla() <= 16;
    const s = EQ.softStarters.find(x => x.sku === (small ? 'AGO-AIRGOG38-16' : 'AGO-AIRGOG316-32'));
    if (s) items.push({ role: `Soft starter · compressor ${small ? '8–16A' : '16–32A'}`, sku: s.sku.replace('AGO-', ''), title: s.title, url: s.url, price: s.price_usd, available: s.available });
  }
  items.push({ role: 'Fuel supplies', title: {
    Gasoline: 'Approved fuel containers, fresh stabilized gasoline and engine oil',
    Propane: 'Approved propane hose and regulator, plus properly sized propane cylinders',
    'Natural Gas': 'Approved natural-gas hose or quick-disconnect; confirm your gas supply can deliver enough flow',
  }[state.fuel] });
  return items;
}

function renderAc() {
  const sel = $('tonSelect');
  if (!sel.options.length) sel.innerHTML = Object.keys(AC.tons).sort((a, b) => a - b).map(t => `<option value="${t}">${t} ton${AC.tons[t].homeSqFt ? ' · homes ' + AC.tons[t].homeSqFt : ''}</option>`).join('');
  sel.value = String(state.ton); sel.disabled = !!state.nameplate;
  const a = APP.centralac;
  $('acHint').innerHTML = state.nameplate
    ? `Using your nameplate: <b>${fmt(a.running)} W</b> running, <b>${fmt(a.starting)} W</b> starting.`
    : `Typical ${state.ton}-ton unit: <b>${fmt(a.running)} W</b> running, <b>${fmt(a.starting)} W</b> starting. The indoor blower is counted separately.`;
  $('softStart').checked = state.softStart;
  const eff = E.effectiveStarting(a, true, RED);
  $('softHint').textContent = `Cuts the A/C's start-up surge by about half (${fmt(a.starting)} W to ${fmt(eff)} W). Recommended model: AIRGO G3 ${acRla() <= 16 ? '8–16A' : '16–32A'}. Your HVAC pro should confirm it's compatible.`;
}

function renderMeter() {
  const c = cap();
  const live = new Set([...state.on].filter(isPowered));
  const t = E.totals(APPS, live, opts());
  const pctRun = c.running ? t.running / c.running : 0, pctSurge = c.surge ? t.surgePeak / c.surge : 0;
  const reserveAt = 1 / (1 + HEADROOM);
  const cls = (p, r) => p > 1 ? 'bad' : p > r ? 'warn' : '';
  $('runFill').style.width = Math.min(100, pctRun * 100) + '%'; $('runFill').className = 'fill ' + cls(pctRun, reserveAt);
  $('surgeFill').style.width = Math.min(100, pctSurge * 100) + '%'; $('surgeFill').className = 'fill ' + cls(pctSurge, 0.95);
  $('reserveMark').style.left = (reserveAt * 100) + '%';
  $('runText').textContent = `${fmt(t.running)} / ${fmt(c.running)} W`;
  $('surgeText').textContent = `${fmt(t.surgePeak)} / ${fmt(c.surge)} W`;
  $('pctText').textContent = Math.round(pctRun * 100) + '%';
  $('limitText').textContent = c.limitedBy === 'generator running rating' ? 'Generator rating' : c.limitedBy;
  const f = fuelSpec(), genFrac = f.running ? t.running / f.running : 0;
  let rt = '—';
  if (state.tripped) rt = 'Tripped';
  else if (state.fuel === 'Natural Gas') rt = t.running ? 'Continuous' : '—';
  else if (t.running) { const h = E.runtimeHours(f, genFrac); rt = h ? `~${h.toFixed(1)} h` : 'n/a'; }
  $('runtimeText').textContent = rt;
  $('runtimeText').title = state.fuel === 'Propane' && gen().lpTankBasis ? `Based on a ${gen().lpTankBasis} propane tank` : (state.fuel === 'Gasoline' ? `Full ${gen().tankGal} gal tank` : 'Runs as long as the gas supply lasts');
  const s = $('statusLine');
  if (state.tripped) { s.className = 'status bad'; s.textContent = 'Overloaded. The generator breaker tripped and the house is dark.'; }
  else if (!t.running) { s.className = 'status'; s.textContent = 'Switch on appliances to see how much power they use.'; }
  else if (!E.qualify(gen(), state.fuel, state.conn, E.targets(APPS, live, opts(), HEADROOM)).meetsPeak) { s.className = 'status warn'; s.textContent = `It runs for now, but a motor start could trip the ${gen().model}. See "Generators that fit this plan" in step 4.`; }
  else if (pctRun > reserveAt) { s.className = 'status warn'; s.textContent = `It runs, but it's using more than 83% of the generator's running watts. We recommend keeping a 20% reserve. See "Generators that fit this plan" in step 4.`; }
  else { s.className = 'status ok'; s.textContent = `Good fit. The ${gen().model} runs this load with room to spare.`; }
}

function renderPanel() {
  const rooms = {};
  for (const a of APPS) (rooms[a.room] ||= []).push(a);
  $('panelHelp').textContent = state.conn === 'cords' ? 'Flip a switch to plug that appliance into the generator.' : 'Start with a preset, then flip breakers on and off or click appliances in the house.';
  $('acBox').classList.toggle('hidden', state.conn === 'cords');
  $('panel').innerHTML = Object.entries(rooms).map(([room, list]) => {
    const roomW = list.filter(a => isPowered(a.id)).reduce((s, a) => s + a.running, 0);
    return `<div class="room"><div class="room-title"><span>${room}</span><span>${roomW ? fmt(roomW) + ' W' : ''}</span></div>` +
      list.map(a => {
        const b = blocked(a.id), on = state.on.has(a.id);
        const st = E.effectiveStarting(a, state.softStart, RED);
        return `<div class="circuit ${on && !b ? (state.tripped ? 'dead' : 'on') : ''} ${b ? 'blocked' : ''}" id="row-${a.id}" title="${b || ''}">
          <button class="breaker ${on ? 'on' : ''}" data-id="${a.id}" aria-label="${a.name}" aria-pressed="${on}"></button>
          <div class="c-name">${a.name}${a.volts === 240 ? '<span class="tag v240">240V</span>' : ''}${a.tag ? `<span class="tag ${a.tag}">${a.tag}</span>` : ''}${a.softStart && state.softStart ? '<span class="tag AirGo">AirGo</span>' : ''}</div>
          <div class="c-watts">${fmt(a.running)} W${st > a.running ? `<br><span>${fmt(st)} W start</span>` : ''}</div></div>`;
      }).join('') + '</div>';
  }).join('');
}

function renderMatches() {
  const tg = E.targets(APPS, state.on, opts(), HEADROOM);
  if (!tg.running) { $('targetText').textContent = 'Switch on the appliances you need and we\'ll list the generators that can run them.'; $('matchList').innerHTML = ''; return; }
  $('targetText').innerHTML = `For this plan on <b>${state.fuel}</b> you need at least <b>${fmt(tg.runTarget)} running W</b> (your load + 20% reserve) and <b>${fmt(tg.peakTarget)} peak W</b> (for the biggest start-up).`;
  const m = E.matchGenerators(GENS, state.fuel, 'auto', tg, has240());
  if (!m.length) { $('matchList').innerHTML = `<p class="note warn">No single generator covers this plan on ${state.fuel} through a 50A connection. Try turning off a large load, adding the AirGo soft starter to the central A/C, or ${state.fuel === 'Gasoline' ? 'starting big motors one at a time' : 'choosing gasoline, which gives more power'}.</p>`; return; }
  const cur = m.find(x => x.gen.model === state.model);
  const top = state.showAll ? m.slice() : m.slice(0, 4); if (cur && !top.includes(cur)) top.push(cur);
  $('matchList').innerHTML = top.map((x, i) => {
    const f = x.gen.fuels[state.fuel];
    const connTxt = x.conn === 'cords' ? 'extension cords' : `${ampsFor(x.gen)}A outlet`;
    return `<div class="match ${x.gen.model === state.model ? 'current' : ''}">
      <img src="${imgUrl(x.gen.image, 160)}" alt="" loading="lazy">
      <div><div class="m-name">${x.gen.brand} ${x.gen.model}${i === 0 ? '<span class="m-badge">Best fit</span>' : ''}</div>
        <div class="m-sub">${fmt(f.running)} running / ${fmt(f.starting)} peak W · ${x.gen.fuelConfig} · ${connTxt}${x.gen.price ? ' · $' + fmt(x.gen.price) : ''}</div></div>
      ${x.gen.model === state.model ? '<span class="m-now">In simulator</span>' : `<button class="btn btn-small btn-try" data-pick="${x.gen.model}">Try it</button>`}</div>`;
  }).join('') + (m.length > 4 ? `<button class="btn btn-link" id="showAllBtn">${state.showAll ? 'Show fewer' : `Show all ${m.length} models that fit`}</button>` : '');
}

function renderBanner() {
  const b = $('banner');
  if (state.tripped) { b.classList.remove('hidden'); $('bannerTitle').textContent = 'Overload: generator breaker tripped'; $('bannerMsg').textContent = state.tripped.message + ' Press Try it on a generator in step 4, or reset to switch every breaker off.'; }
  else b.classList.add('hidden');
}

function sync3D() {
  const c = cap();
  const live = new Set([...state.on].filter(isPowered));
  const t = E.totals(APPS, live, opts());
  for (const id of house.ids) house.setApplianceState(id, isPowered(id) ? 'on' : (state.on.has(id) ? 'dead' : 'off'));
  house.setGenerator({ running: true, load: c.running ? t.running / c.running : 0, isTripped: !!state.tripped });
  house.setConnection(state.conn);
  house.setSoftStarter(state.softStart);
}

// ---------------- small UI bits ----------------
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4200); }
function flashRow(id) { const r = $('row-' + id); if (r) { r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); } }
function flashBanner() { $('banner').animate([{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.03)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 300 }); }
function showTooltip(id, ev) {
  const tip = $('tooltip');
  if (!id || !ev) { tip.classList.add('hidden'); return; }
  const a = APP[id], b = blocked(id);
  const st = E.effectiveStarting(a, state.softStart, RED);
  const status = isPowered(id) ? '<span style="color:#2f8a43;font-weight:700">Powered</span>' : state.on.has(id) ? '<span style="color:#d93a2e;font-weight:700">No power</span>' : 'Off';
  tip.innerHTML = `<b>${a.name}</b><br>${fmt(a.running)} W running${st > a.running ? ` · ${fmt(st)} W to start` : ''} · ${a.volts}V<br>${status}${b ? `<br><span class="muted">${b}</span>` : ''}<br><span class="muted">Click to switch ${state.on.has(id) ? 'off' : 'on'}</span>`;
  const r = $('stage').getBoundingClientRect();
  tip.style.left = (ev.clientX - r.left) + 'px'; tip.style.top = (ev.clientY - r.top) + 'px';
  tip.classList.remove('hidden');
}
function shareLink() {
  const p = new URLSearchParams({ model: state.model, fuel: state.fuel, sqft: state.sqft, bed: state.bedrooms, bath: state.bathrooms, ton: state.ton, soft: state.softStart ? 1 : 0, on: [...state.on].join(',') });
  const url = location.origin + location.pathname + '?' + p.toString();
  const done = () => toast('Link copied. Anyone who opens it will see this exact setup.');
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url)); else prompt('Copy this link:', url);
}
function readNameplate() {
  const v = +$('npV').value, rla = +$('npRla').value, fla = +$('npFla').value, lra = +$('npLra').value;
  const r = E.acFromNameplate(v, rla, fla, lra, AC.lraFactor);
  state.nameplate = r ? { ...r, rla } : null;
  revalidate();
}

// ---------------- events ----------------
$('sqftSelect').addEventListener('change', e => {
  state.sqft = e.target.value;
  state.ton = HOME.sqft.find(o => o.id === state.sqft).ton;   // suggest the matching A/C size
  revalidate();
  if (!state.nameplate) toast(`Central A/C set to ${state.ton} tons for this size home. You can change it in step 3.`);
});
$('bedSelect').addEventListener('change', e => { state.bedrooms = +e.target.value; revalidate(); });
$('bathSelect').addEventListener('change', e => { state.bathrooms = +e.target.value; revalidate(); });
$('fuelSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.fuel = b.dataset.fuel;
  if (!gen().fuels[state.fuel]) {
    // e.g. natural gas on a dual fuel model: move to the best-fitting generator that runs on this fuel
    const g = bestFit(); state.tripped = null; selectGenerator(g.model);
    toast(`The previous model doesn't run on ${state.fuel.toLowerCase()}, so the ${g.brand} ${g.model} is in the simulator now.`);
    return;
  }
  revalidate();
});
$('softStart').addEventListener('change', e => { state.softStart = e.target.checked; revalidate(); });
$('tonSelect').addEventListener('change', e => { state.ton = +e.target.value; revalidate(); });
['npV', 'npRla', 'npFla', 'npLra'].forEach(id => $(id).addEventListener('change', readNameplate));
$('npClear').addEventListener('click', () => { ['npRla', 'npFla', 'npLra'].forEach(id => { $(id).value = ''; }); state.nameplate = null; revalidate(); });
$('panel').addEventListener('click', e => { const b = e.target.closest('.breaker'); if (b) toggle(b.dataset.id); });
$('matchList').addEventListener('click', e => {
  if (e.target.closest('#showAllBtn')) { state.showAll = !state.showAll; renderMatches(); return; }
  const b = e.target.closest('[data-pick]'); if (!b) return;
  const g = GENS.find(x => x.model === b.dataset.pick); state.tripped = null; selectGenerator(g.model);
  toast(`The ${g.brand} ${g.model} is now in the simulator.`);
});
document.querySelector('.presets').addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (b) applyPreset(b.dataset.preset); });
$('resetBtn').addEventListener('click', resetBreaker);
$('viewHome').addEventListener('click', () => house.setView('home'));
$('viewPanel').addEventListener('click', () => house.setView('panel'));
$('viewGarage').addEventListener('click', () => house.setView('garage'));
$('dayNight').addEventListener('click', () => { state.night = !state.night; house.setNight(state.night); $('dayNight').textContent = state.night ? 'Day view' : 'Night view'; sync3D(); });
$('shareBtn').addEventListener('click', shareLink);
$('howBtn').addEventListener('click', () => $('intro').classList.remove('hidden'));
$('introGo').addEventListener('click', () => { $('intro').classList.add('hidden'); try { localStorage.setItem('dm-sim-intro', '1'); } catch (e) { /* storage unavailable */ } });

// deep link: ?model=XP13000HX&fuel=Propane&sqft=1900&bed=4&bath=2.5&ton=3.5&soft=1&on=fridge,lights
const q = new URLSearchParams(location.search);
if (['Gasoline', 'Propane', 'Natural Gas'].includes(q.get('fuel'))) state.fuel = q.get('fuel');
if (HOME.sqft.find(o => o.id === q.get('sqft'))) { state.sqft = q.get('sqft'); state.ton = HOME.sqft.find(o => o.id === state.sqft).ton; }
if (HOME.bedrooms.includes(+q.get('bed'))) state.bedrooms = +q.get('bed');
if (HOME.bathrooms.includes(+q.get('bath'))) state.bathrooms = +q.get('bath');
if (q.get('ton') && AC.tons[q.get('ton')]) state.ton = +q.get('ton');
if (q.get('soft') === '1') state.softStart = true;
if (q.get('on') !== null) state.on = new Set(q.get('on').split(',').filter(id => APP[id]));
let seen = false; try { seen = localStorage.getItem('dm-sim-intro') === '1'; } catch (e) { /* ignore */ }
if (!seen && !q.get('model')) $('intro').classList.remove('hidden');
applyAc(); applyHome();
const linked = GENS.find(g => g.model === q.get('model') && g.fuels[state.fuel]);
selectGenerator(linked ? linked.model : bestFit().model);   // start with the best fit for the starting plan
window.__sim = { state, render, toggle, applyPreset, resetBreaker, selectGenerator, house };   // for testing
