// UI + state for the Home Backup Power Simulator.
import { createHouse } from './house.js?v=2.3';

const E = window.Engine;
const GENS = window.GENERATORS;
const EQ = window.EQUIPMENT;
const APPS = window.APPLIANCES;
const AC = window.CENTRAL_AC;
const APP = Object.fromEntries(APPS.map(a => [a.id, a]));
const $ = id => document.getElementById(id);
const fmt = E.fmt;
const RED = window.SOFT_START_REDUCTION, HEADROOM = window.HEADROOM;

const state = {
  brand: 'All', model: 'XP13000HX', fuel: 'Gasoline', conn: 'interlock', ts: null, dist: 25,
  on: new Set(window.PRESETS.essentials), softStart: false, tripped: null, night: true,
  ton: AC.default, nameplate: null,
};

// ---------------- helpers ----------------
const gen = () => GENS.find(g => g.model === state.model);
const fuelSpec = () => gen().fuels[state.fuel];
const tsObj = () => EQ.transferSwitches.find(t => t.sku === state.ts) || null;
const opts = () => ({ softStart: state.softStart, reduction: RED });
const cap = () => E.capacity(gen(), state.fuel, state.conn, tsObj());
const ampsFor = g => g.bestOutlet === '14-50R' ? 50 : g.bestOutlet === 'L14-30R' ? 30 : 0;
const imgUrl = (u, w) => u ? u + (u.includes('?') ? '&' : '?') + 'width=' + w : '';
const blocked = id => E.blockedReason(APP[id], state.conn);
const liveSet = () => new Set([...state.on].filter(id => !blocked(id)));
function compatibleSwitches(g) { const a = ampsFor(g); return EQ.transferSwitches.filter(t => t.amps === a && (t.circuits || 0) >= 6); }
// Transfer switch: an appliance is connected to the switch as soon as it's switched on.
const usedSlots = () => E.slotsUsed(APPS, state.on);
function slotLimit() { const t = tsObj(); return t ? t.circuits : 0; }
const slotsFor = id => E.circuitSlots(APP[id]);
const circuitsWord = n => n === 1 ? '1 circuit' : `${n} circuits`;
// Priority when a switch can't fit everything: medical first, then essentials, then the rest.
function priorityOrder(ids) {
  const rank = id => APP[id].tag === 'Medical' ? 0 : window.PRESETS.essentials.includes(id) ? 1 : 2;
  return [...ids].sort((a, b) => rank(a) - rank(b) || window.PRESETS.essentials.indexOf(a) - window.PRESETS.essentials.indexOf(b));
}
/** Keep only what fits on the transfer switch; returns the appliances that were left off. */
function fitToSwitch() {
  if (state.conn !== 'transfer') return [];
  const kept = new Set(), dropped = [];
  let used = 0;
  for (const id of priorityOrder(state.on)) { if (used + slotsFor(id) <= slotLimit()) { kept.add(id); used += slotsFor(id); } else dropped.push(id); }
  state.on = kept;
  return dropped;
}
function reportDropped(dropped) {
  if (!dropped.length) return;
  const names = dropped.map(id => APP[id].name).join(', ');
  const bigger = biggerSwitch();
  toast(`The ${state.ts} has ${slotLimit()} circuits, so these were left off: ${names}.${bigger ? ` The ${bigger.sku} (${bigger.circuits} circuits) would fit more.` : ''}`);
}
function biggerSwitch() {
  const cur = slotLimit();
  return compatibleSwitches(gen()).filter(t => t.circuits > cur).sort((a, b) => a.circuits - b.circuits || (b.available !== false) - (a.available !== false))[0] || null;
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
  if (!g.bestOutlet) state.conn = 'cords';
  const sw = compatibleSwitches(g);
  if (!sw.find(t => t.sku === state.ts)) state.ts = (sw.find(t => t.circuits === 10 && t.available) || sw.find(t => t.circuits === 10) || sw[0] || {}).sku || null;
  reportDropped(fitToSwitch());
  house.setGeneratorModel(g);
  revalidate();
}
function revalidate() {
  // Called after the generator, fuel, connection, switch wiring, A/C size or soft starter changes.
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
  if (state.conn === 'transfer') {
    const need = slotsFor(id) + (a.needs && !state.on.has(a.needs) ? slotsFor(a.needs) : 0);
    if (usedSlots() + need > slotLimit()) { openCircuitDialog(id, need); return false; }
  }
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
  reportDropped(fitToSwitch());
  revalidate();
}

// ---------------- "all circuits in use" dialog ----------------
let pending = null;   // { id, need }
function openCircuitDialog(id, need) {
  pending = { id, need };
  renderCircuitDialog();
  $('circuitModal').classList.remove('hidden');
}
function closeCircuitDialog() { pending = null; $('circuitModal').classList.add('hidden'); }
function renderCircuitDialog() {
  if (!pending) return;
  const a = APP[pending.id], lim = slotLimit(), free = lim - usedSlots();
  const still = Math.max(0, pending.need - free);
  $('cmTitle').textContent = `All ${lim} circuits are in use`;
  $('cmText').innerHTML = `The <b>${state.ts}</b> transfer switch has ${lim} circuits. <b>${a.name}</b> needs ${circuitsWord(pending.need)}${a.needs && !state.on.has(a.needs) ? ' (including the indoor blower it runs with)' : ''}. ` +
    `Switch off ${still > 1 ? `appliances to free ${circuitsWord(still)}` : 'one appliance'} below and ${a.name.split(' (')[0]} will turn on automatically.` +
    `<br><span class="muted small">Your electrician chooses which circuits go on the transfer switch at installation. This shows what fits.</span>`;
  $('cmList').innerHTML = priorityOrder(state.on).reverse().map(x => `<div class="cm-row"><div><b>${APP[x].name}</b><span class="muted small">${circuitsWord(slotsFor(x))} · ${fmt(APP[x].running)} W${APP[x].tag ? ' · ' + APP[x].tag : ''}</span></div>
      <button class="btn btn-small" data-free="${x}">Switch off</button></div>`).join('');
  const bigger = biggerSwitch();
  $('cmUpgrade').classList.toggle('hidden', !bigger);
  if (bigger) $('cmUpgrade').textContent = `Use the ${bigger.sku} (${bigger.circuits} circuits) instead`;
}
function freeCircuit(x) {
  state.on.delete(x);
  const { id, need } = pending;
  if (slotLimit() - usedSlots() >= need) { closeCircuitDialog(); render(); toggle(id); }
  else { render(); renderCircuitDialog(); }
}
function upgradeSwitch() {
  const bigger = biggerSwitch(); if (!bigger || !pending) return;
  const { id } = pending; state.ts = bigger.sku;
  closeCircuitDialog(); render();
  toast(`Switched to the ${bigger.sku} transfer switch (${bigger.circuits} circuits).`);
  toggle(id);
}

// ---------------- rendering ----------------
function render() {
  applyAc();
  renderGenSelect(); renderProduct(); renderFuel(); renderSpecs(); renderConnection(); renderAc(); renderMeter(); renderPanel(); renderMatches(); renderBanner(); sync3D();
}

function renderGenSelect() {
  const sel = $('genSelect');
  const list = GENS.filter(g => state.brand === 'All' || g.brand === state.brand);
  if (!list.find(g => g.model === state.model)) state.model = list[0].model;
  const typeName = { 'Conventional open frame': 'Open frame', 'Inverter': 'Inverter', 'Open frame inverter': 'Open frame inverter' };
  const groups = {};
  for (const g of list) (groups[typeName[g.type] || g.type] ||= []).push(g);
  const html = Object.entries(groups).map(([type, gs]) => `<optgroup label="${type} generators">` +
    gs.sort((a, b) => a.fuels.Gasoline.running - b.fuels.Gasoline.running)
      .map(g => `<option value="${g.model}">${g.brand} ${g.model} · ${fmt(g.fuels.Gasoline.starting)} W ${g.fuelConfig}${g.bestOutlet ? '' : ' (120V only)'}</option>`).join('') + '</optgroup>').join('');
  if (sel.dataset.sig !== state.brand) { sel.innerHTML = html; sel.dataset.sig = state.brand; }
  sel.value = state.model;
  document.querySelectorAll('#brandSeg button').forEach(b => b.classList.toggle('on', b.dataset.brand === state.brand));
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
  const g = gen();
  $('fuelSeg').innerHTML = ['Gasoline', 'Propane', 'Natural Gas'].map(f =>
    `<button data-fuel="${f}" class="${state.fuel === f ? 'on' : ''}" ${g.fuels[f] ? '' : 'disabled title="Not available on this model"'}>${f}</button>`).join('');
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
  const g = gen();
  document.querySelectorAll('#connSeg button').forEach(b => { b.classList.toggle('on', b.dataset.conn === state.conn); b.disabled = !g.bestOutlet && b.dataset.conn !== 'cords'; });
  $('connDesc').textContent = {
    interlock: 'Uses your existing breaker panel. The interlock holds the main breaker off while the generator breaker is on, so every circuit is available and you choose what runs.',
    transfer: 'A transfer switch powers a set number of circuits. Each appliance you switch on uses one circuit (240V appliances use two). An electrician wires your chosen circuits to the switch.',
    cords: 'Plug appliances straight into the generator. 240V appliances such as the well pump, water heater, range, electric dryer and central A/C can\'t run this way.',
  }[state.conn];
  const sw = compatibleSwitches(g), isTs = state.conn === 'transfer';
  $('tsField').classList.toggle('hidden', !isTs); $('tsSlots').classList.toggle('hidden', !isTs);
  if (isTs) {
    $('tsSelect').innerHTML = sw.map(t => `<option value="${t.sku}">Reliance ${t.sku} · ${t.circuits} circuits · ${t.amps}A · ${t.location}${t.available === false ? ' (out of stock)' : ''}</option>`).join('');
    $('tsSelect').value = state.ts;
    const lim = slotLimit(), pips = [];
    for (const id of priorityOrder(state.on)) for (let k = 0; k < slotsFor(id); k++) pips.push(APP[id].name);
    $('tsSlots').innerHTML = `<b>Circuits used: ${pips.length} of ${lim}</b> · ${state.ts} transfer switch<br><span class="muted small">Your electrician chooses the final circuits at installation. This shows what fits.</span>` +
      `<div class="pips">${Array.from({ length: lim }, (_, i) => `<span class="pip ${i < pips.length ? 'used' : ''}" title="${pips[i] || 'Free circuit'}"></span>`).join('')}</div>`;
  }
  const n = $('neutralNote');
  if (state.conn === 'cords') { n.className = 'note'; n.textContent = g.bestOutlet ? 'Use heavy-duty outdoor cords, and plug each high-draw appliance into its own outlet or cord.' : 'This model has no 240V outlet, so it can\'t connect to a home panel. Use extension cords.'; }
  else if (g.neutral === 'Floating') { n.className = 'note ok'; n.textContent = 'Floating neutral: connects to a standard 2-pole transfer switch or interlock kit as-is.'; }
  else if (g.neutral === 'Bonded') {
    n.className = 'note warn';
    n.innerHTML = 'Bonded neutral: a qualified electrician removes the bond before this model is used with a standard 2-pole transfer switch or interlock kit' +
      (g.unbondDoc ? ` (<a href="${g.unbondDoc}" target="_blank" rel="noopener">DuroMax unbond instructions</a>)` : ' (contact DuroMax for this model)') + '. Never run it unbonded unless it is grounded through the home.';
  } else { n.className = 'note'; n.textContent = ''; }
  $('distField').classList.toggle('hidden', state.conn === 'cords');
  $('distSelect').value = String(state.dist);
  $('equipList').innerHTML = equipmentFor(g).map(e => `<div class="equip-item"><div><span class="role">${e.role}</span>${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${e.sku ? e.sku + ' · ' : ''}${short(e.title)}</a>` : `<span class="text">${e.title}</span>`}</div><span class="price">${e.price ? '$' + e.price.toFixed(2) : ''}${e.available === false ? ' · out of stock' : ''}</span></div>`).join('');
}
function short(t) { return t.replace(/^(DuroMax|Reliance|GenInterlock|AIRGO|AirGo)\s*/i, '').slice(0, 96); }
function equipmentFor(g) {
  const items = [], a = ampsFor(g);
  if (state.conn !== 'cords' && a) {
    if (state.conn === 'transfer' && tsObj()) { const t = tsObj(); items.push({ role: 'Transfer switch', sku: t.sku, title: t.title, url: t.url, price: t.price_usd, available: t.available }); }
    if (state.conn === 'interlock') {
      items.push({ role: 'Interlock kit for your panel brand', title: 'GenInterlock kits for Square D, Eaton / Cutler-Hammer, GE, Siemens / Murray / ITE and Bryant panels', url: 'https://www.duromaxpower.com/pages/geninterlock' });
      items.push({ role: 'Backfeed breaker (not included with kit)', title: `${a}A 2-pole breaker that matches your panel brand` });
    }
    const inlet = EQ.inletBoxes.find(b => b.amps === a && (b.inlet_type === (a === 50 ? 'CS6375' : 'L14-30')) && b.available !== false) || EQ.inletBoxes.find(b => b.amps === a);
    if (inlet) items.push({ role: `Power inlet box (${a}A)`, sku: inlet.sku, title: inlet.title, url: inlet.url, price: inlet.price_usd, available: inlet.available });
    if (state.dist > 50) items.push({ role: 'Generator cord', title: 'More than 50 ft: have an electrician size the cord or conductors for voltage drop. Use the shortest practical cord.' });
    else {
      const len = state.dist <= 25 ? 25 : 50;
      const plugs = a === 50 ? ['14-50P', 'L14-50P'] : ['L14-30P'];
      const c = EQ.cords.find(c => plugs.includes(c.plug_end) && c.length_ft === len && c.available !== false) || EQ.cords.find(c => plugs.includes(c.plug_end) && c.length_ft >= len);
      if (c) items.push({ role: `Generator cord · ${len} ft${len === 50 ? ' (check voltage drop)' : ''}`, sku: c.sku, title: c.title, url: c.url, price: c.price_usd, available: c.available });
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
  else if (pctRun > reserveAt) { s.className = 'status warn'; s.textContent = `It runs, but it's using more than 83% of the generator's running watts. We recommend keeping a 20% reserve. See "Generators that fit this plan" on the right.`; }
  else { s.className = 'status ok'; s.textContent = `Good fit. The ${gen().model} runs this load with room to spare.`; }
}

function renderPanel() {
  const rooms = {};
  for (const a of APPS) (rooms[a.room] ||= []).push(a);
  const ts = state.conn === 'transfer';
  $('panelHelp').textContent = ts ? `Switch appliances on to connect them to the transfer switch. ${usedSlots()} of ${slotLimit()} circuits in use.` :
    state.conn === 'cords' ? 'Flip a switch to plug that appliance into the generator.' : 'Flip breakers on and off, or click appliances in the house.';
  $('acBox').classList.toggle('hidden', state.conn === 'cords');
  $('panel').innerHTML = Object.entries(rooms).map(([room, list]) => {
    const roomW = list.filter(a => isPowered(a.id)).reduce((s, a) => s + a.running, 0);
    return `<div class="room"><div class="room-title"><span>${room}</span><span>${roomW ? fmt(roomW) + ' W' : ''}</span></div>` +
      list.map(a => {
        const b = blocked(a.id), on = state.on.has(a.id);
        const st = E.effectiveStarting(a, state.softStart, RED);
        return `<div class="circuit ${on && !b ? (state.tripped ? 'dead' : 'on') : ''} ${b ? 'blocked' : ''}" id="row-${a.id}" title="${b || ''}">
          <button class="breaker ${on ? 'on' : ''}" data-id="${a.id}" aria-label="${a.name}" aria-pressed="${on}"></button>
          <div class="c-name">${a.name}${a.volts === 240 ? '<span class="tag v240">240V</span>' : ''}${a.tag ? `<span class="tag ${a.tag}">${a.tag}</span>` : ''}${a.softStart && state.softStart ? '<span class="tag AirGo">AirGo</span>' : ''}
            ${ts && a.volts === 240 ? '<span class="tag v240" title="Uses two transfer-switch circuits">2 circuits</span>' : ''}</div>
          <div class="c-watts">${fmt(a.running)} W${st > a.running ? `<br><span>${fmt(st)} W start</span>` : ''}</div></div>`;
      }).join('') + '</div>';
  }).join('');
}

function renderMatches() {
  const conn = state.conn === 'transfer' ? 'interlock' : state.conn;
  const tg = E.targets(APPS, liveSet(), opts(), HEADROOM);
  if (!tg.running) { $('targetText').textContent = 'Switch on the appliances you need and we\'ll list the generators that can run them.'; $('matchList').innerHTML = ''; return; }
  $('targetText').innerHTML = `For this plan on <b>${state.fuel}</b> you need at least <b>${fmt(tg.runTarget)} running W</b> (your load + 20% reserve) and <b>${fmt(tg.peakTarget)} peak W</b> (for the biggest start-up).`;
  const m = E.matchGenerators(GENS, state.fuel, conn, tg);
  if (!m.length) { $('matchList').innerHTML = `<p class="note warn">No single generator covers this plan on ${state.fuel}${state.conn !== 'cords' ? ' through a 50A connection' : ''}. Try turning off a large load, adding the AirGo soft starter, or starting big motors one at a time.</p>`; return; }
  const cur = m.find(x => x.gen.model === state.model);
  const top = m.slice(0, 4); if (cur && !top.includes(cur)) top.push(cur);
  $('matchList').innerHTML = top.map((x, i) => {
    const f = x.gen.fuels[state.fuel];
    return `<div class="match ${x.gen.model === state.model ? 'current' : ''}">
      <img src="${imgUrl(x.gen.image, 160)}" alt="" loading="lazy">
      <div><div class="m-name">${x.gen.brand} ${x.gen.model}${i === 0 ? '<span class="m-badge">Best fit</span>' : ''}</div>
        <div class="m-sub">${fmt(f.running)} running / ${fmt(f.starting)} peak W · ${x.gen.fuelConfig}${x.gen.price ? ' · $' + fmt(x.gen.price) : ''}${x.q.status === 'CAPACITY OK - VERIFY CONNECTION' ? ' · 30A connection' : ''}</div></div>
      ${x.gen.model === state.model ? '<span class="muted small">Selected</span>' : `<button class="btn btn-small" data-pick="${x.gen.model}">Try it</button>`}</div>`;
  }).join('') + (m.length > top.length ? `<p class="muted small" style="margin-top:8px">${m.length - top.length} more models also fit.</p>` : '');
}

function renderBanner() {
  const b = $('banner');
  if (state.tripped) { b.classList.remove('hidden'); $('bannerTitle').textContent = 'Overload: generator breaker tripped'; $('bannerMsg').textContent = state.tripped.message + ' Resetting switches every breaker off.'; }
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
  const p = new URLSearchParams({ model: state.model, fuel: state.fuel, conn: state.conn, ...(state.conn === 'transfer' && state.ts ? { ts: state.ts } : {}), ton: state.ton, soft: state.softStart ? 1 : 0, on: [...state.on].join(',') });
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
$('brandSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.brand = b.dataset.brand; renderGenSelect(); selectGenerator($('genSelect').value); });
$('genSelect').addEventListener('change', e => selectGenerator(e.target.value));
$('fuelSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; state.fuel = b.dataset.fuel; revalidate(); });
$('connSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; state.conn = b.dataset.conn; reportDropped(fitToSwitch()); revalidate(); });
$('tsSelect').addEventListener('change', e => { state.ts = e.target.value; reportDropped(fitToSwitch()); revalidate(); });
$('cmList').addEventListener('click', e => { const b = e.target.closest('[data-free]'); if (b) freeCircuit(b.dataset.free); });
$('cmUpgrade').addEventListener('click', upgradeSwitch);
$('cmCancel').addEventListener('click', closeCircuitDialog);
$('circuitModal').addEventListener('click', e => { if (e.target.id === 'circuitModal') closeCircuitDialog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pending) closeCircuitDialog(); });
$('distSelect').addEventListener('change', e => { state.dist = +e.target.value; render(); });
$('softStart').addEventListener('change', e => { state.softStart = e.target.checked; revalidate(); });
$('tonSelect').addEventListener('change', e => { state.ton = +e.target.value; revalidate(); });
['npV', 'npRla', 'npFla', 'npLra'].forEach(id => $(id).addEventListener('change', readNameplate));
$('npClear').addEventListener('click', () => { ['npRla', 'npFla', 'npLra'].forEach(id => { $(id).value = ''; }); state.nameplate = null; revalidate(); });
$('panel').addEventListener('click', e => { const b = e.target.closest('.breaker'); if (b) toggle(b.dataset.id); });
$('matchList').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; const g = GENS.find(x => x.model === b.dataset.pick); if (state.brand !== 'All' && g.brand !== state.brand) state.brand = 'All'; state.tripped = null; selectGenerator(g.model); toast(`Switched to the ${g.brand} ${g.model}.`); });
document.querySelector('.presets').addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (b) applyPreset(b.dataset.preset); });
$('resetBtn').addEventListener('click', resetBreaker);
$('viewHome').addEventListener('click', () => house.setView('home'));
$('viewPanel').addEventListener('click', () => house.setView('panel'));
$('viewGarage').addEventListener('click', () => house.setView('garage'));
$('dayNight').addEventListener('click', () => { state.night = !state.night; house.setNight(state.night); $('dayNight').textContent = state.night ? 'Day view' : 'Night view'; sync3D(); });
$('shareBtn').addEventListener('click', shareLink);
$('howBtn').addEventListener('click', () => $('intro').classList.remove('hidden'));
$('introGo').addEventListener('click', () => { $('intro').classList.add('hidden'); try { localStorage.setItem('dm-sim-intro', '1'); } catch (e) { /* storage unavailable */ } });

// deep link: ?model=XP13000HX&fuel=Propane&conn=transfer&ton=3.5&soft=1&on=fridge,lights
const q = new URLSearchParams(location.search);
if (q.get('model') && GENS.find(g => g.model === q.get('model'))) state.model = q.get('model');
if (q.get('fuel')) state.fuel = q.get('fuel');
if (['interlock', 'transfer', 'cords'].includes(q.get('conn'))) state.conn = q.get('conn');
if (q.get('ton') && AC.tons[q.get('ton')]) state.ton = +q.get('ton');
if (q.get('soft') === '1') state.softStart = true;
if (q.get('on') !== null) state.on = new Set(q.get('on').split(',').filter(id => APP[id]));
if (q.get('ts')) state.ts = q.get('ts');
let seen = false; try { seen = localStorage.getItem('dm-sim-intro') === '1'; } catch (e) { /* ignore */ }
if (!seen && !q.get('model')) $('intro').classList.remove('hidden');
selectGenerator(state.model);
window.__sim = { state, render, toggle, applyPreset, resetBreaker, selectGenerator, house };   // for testing
