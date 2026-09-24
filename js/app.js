// UI + state for the Home Backup Power Simulator.
import { createHouse } from './house.js';

const E = window.Engine;
const GENS = window.GENERATORS;
const EQ = window.EQUIPMENT;
const APPS = window.APPLIANCES;
const APP = Object.fromEntries(APPS.map(a => [a.id, a]));
const $ = id => document.getElementById(id);
const fmt = E.fmt;

const state = {
  brand: 'All', model: 'XP13000HX', fuel: 'Gasoline', conn: 'interlock', ts: null,
  wired: new Set(), on: new Set(window.PRESETS.essentials), softStart: false, tripped: null, night: true,
};

const house = createHouse($('scene'), { onClick: id => toggle(id), onHover: showTooltip });

// ---------------- helpers ----------------
const gen = () => GENS.find(g => g.model === state.model);
const fuelSpec = () => gen().fuels[state.fuel];
const tsObj = () => EQ.transferSwitches.find(t => t.sku === state.ts) || null;
const opts = () => ({ softStart: state.softStart, reduction: window.SOFT_START_REDUCTION });
const cap = () => E.capacity(gen(), state.fuel, state.conn, tsObj());
const ampsFor = g => g.bestOutlet === '14-50R' ? 50 : g.bestOutlet === 'L14-30R' ? 30 : 0;
function compatibleSwitches(g) {
  const a = ampsFor(g);
  return EQ.transferSwitches.filter(t => t.amps === a && (t.circuits || 0) >= 6);
}
function usedSlots() { let n = 0; state.wired.forEach(id => { n += E.circuitSlots(APP[id]); }); return n; }
function slotLimit() { const t = tsObj(); return t ? t.circuits : 0; }
function autoWire() {
  state.wired = new Set();
  const medical = APPS.filter(a => a.tag === 'Medical').map(a => a.id);
  const order = [...medical, ...window.PRESETS.essentials, ...APPS.map(a => a.id)];
  for (const id of order) {
    if (state.wired.has(id)) continue;
    if (usedSlots() + E.circuitSlots(APP[id]) <= slotLimit()) state.wired.add(id);
  }
}
function isPowered(id) {
  return state.on.has(id) && !state.tripped && !E.blockedReason(APP[id], state.conn, state.wired);
}

// ---------------- actions ----------------
function selectGenerator(model) {
  state.model = model;
  const g = gen();
  if (!g.fuels[state.fuel]) state.fuel = Object.keys(g.fuels)[0];
  if (!g.bestOutlet) state.conn = 'cords';
  const sw = compatibleSwitches(g);
  if (!sw.find(t => t.sku === state.ts)) {
    state.ts = (sw.find(t => t.circuits === 10 && t.available) || sw[0] || {}).sku || null;
    autoWire();
  }
  revalidate();
}
function revalidate() {
  // generator / fuel / connection / soft starter changed: re-check the whole load
  const live = new Set([...state.on].filter(id => !E.blockedReason(APP[id], state.conn, state.wired)));
  const r = E.checkLoad(APPS, live, cap(), opts());
  if (!r.ok && live.size) trip(r.message);
  else if (state.tripped && r.ok) { /* stay tripped until the user resets */ }
  render();
}
function trip(message) {
  state.tripped = { message };
  render();
}
function resetBreaker() {
  const live = new Set([...state.on].filter(id => !E.blockedReason(APP[id], state.conn, state.wired)));
  const r = E.checkLoad(APPS, live, cap(), opts());
  if (r.ok) { state.tripped = null; render(); }
  else { state.tripped = { message: 'Still overloaded - turn some breakers off first. ' + r.message }; render(); flashBanner(); }
}
function toggle(id) {
  const a = APP[id];
  if (state.on.has(id)) { state.on.delete(id); render(); return; }
  const blocked = E.blockedReason(a, state.conn, state.wired);
  if (blocked) { flashRow(id); toast(a.name + ': ' + blocked + '.'); return; }
  if (state.tripped) { state.on.add(id); render(); flashBanner(); return; }
  const live = new Set([...state.on].filter(x => !E.blockedReason(APP[x], state.conn, state.wired)));
  const r = E.checkTurnOn(APPS, live, a, cap(), opts());
  state.on.add(id);
  if (!r.ok) trip(r.message); else render();
}
function applyPreset(name) {
  state.on = new Set(name === 'off' ? [] : window.PRESETS[name]);
  state.tripped = null;
  if (state.conn === 'transfer') { for (const id of state.on) if (!state.wired.has(id) && usedSlots() + E.circuitSlots(APP[id]) <= slotLimit()) state.wired.add(id); }
  revalidate();
}
function toggleWire(id, checked) {
  if (checked) {
    if (usedSlots() + E.circuitSlots(APP[id]) > slotLimit()) { toast('No free circuits on the ' + state.ts + '. Unwire another circuit first (240V loads use 2).'); render(); return; }
    state.wired.add(id);
  } else state.wired.delete(id);
  revalidate();
}

// ---------------- rendering ----------------
function render() {
  renderGenSelect(); renderFuel(); renderSpecs(); renderConnection(); renderMeter(); renderPanel(); renderBanner(); sync3D();
}

function renderGenSelect() {
  const sel = $('genSelect');
  const list = GENS.filter(g => state.brand === 'All' || g.brand === state.brand);
  if (!list.find(g => g.model === state.model)) { state.model = list[0].model; }
  const groups = {};
  for (const g of list) (groups[g.type] ||= []).push(g);
  const html = Object.entries(groups).map(([type, gs]) => `<optgroup label="${type}">` +
    gs.sort((a, b) => a.fuels[Object.keys(a.fuels)[0]].running - b.fuels[Object.keys(b.fuels)[0]].running)
      .map(g => `<option value="${g.model}">${g.brand} ${g.model} - ${fmt(g.fuels.Gasoline ? g.fuels.Gasoline.starting : 0)} W ${g.fuelConfig}${g.bestOutlet ? '' : ' (120V only)'}</option>`).join('') + '</optgroup>').join('');
  if (sel.dataset.sig !== state.brand) { sel.innerHTML = html; sel.dataset.sig = state.brand; }
  sel.value = state.model;
  document.querySelectorAll('#brandSeg button').forEach(b => b.classList.toggle('on', b.dataset.brand === state.brand));
}

function renderFuel() {
  const g = gen();
  $('fuelSeg').innerHTML = ['Gasoline', 'Propane', 'Natural Gas'].map(f =>
    `<button data-fuel="${f}" class="${state.fuel === f ? 'on' : ''}" ${g.fuels[f] ? '' : 'disabled title="Not available on this model"'}>${f}</button>`).join('');
}

function renderSpecs() {
  const g = gen(), f = fuelSpec();
  const outletTxt = g.bestOutlet ? `${g.bestOutlet} (${ampsFor(g)}A)` : '120V only';
  $('genSpecs').innerHTML = `
    <div class="spec"><b>${fmt(f.starting)} W</b><span>Starting (${state.fuel})</span></div>
    <div class="spec"><b>${fmt(f.running)} W</b><span>Running (${state.fuel})</span></div>
    <div class="spec"><b>${outletTxt}</b><span>Home backup outlet</span></div>
    <div class="spec"><b>${g.neutral || '—'}</b><span>Neutral (as shipped)</span></div>
    <div class="spec wide"><span>${g.title}</span><br>
      ${g.price ? `<span>$${fmt(g.price)} · ${g.salesStatus}</span> · ` : ''}<a href="${g.url}" target="_blank" rel="noopener">Product page</a>${g.manual ? ` · <a href="${g.manual}" target="_blank" rel="noopener">Owner's manual</a>` : ''}</div>`;
  $('hudGen').textContent = `${g.brand} ${g.model} · ${state.fuel}`;
}

function renderConnection() {
  const g = gen();
  document.querySelectorAll('#connSeg button').forEach(b => {
    b.classList.toggle('on', b.dataset.conn === state.conn);
    b.disabled = !g.bestOutlet && b.dataset.conn !== 'cords';
  });
  const desc = {
    interlock: 'Uses your existing breaker panel. The interlock holds the main breaker off while the generator breaker is on, and every circuit in the panel is available.',
    transfer: 'Only the circuits an electrician wires to the transfer switch can be powered. 120V loads use 1 circuit, 240V loads use 2.',
    cords: 'Appliances plug straight into the generator. No 240V appliances.',
  };
  $('connDesc').textContent = desc[state.conn];

  // transfer switch select
  const sw = compatibleSwitches(g);
  $('tsField').classList.toggle('hidden', state.conn !== 'transfer');
  $('tsSlots').classList.toggle('hidden', state.conn !== 'transfer');
  if (state.conn === 'transfer') {
    $('tsSelect').innerHTML = sw.map(t => `<option value="${t.sku}">${t.sku} - ${t.circuits} circuit, ${t.amps}A, ${t.location}${t.available === false ? ' (out of stock)' : ''}</option>`).join('');
    $('tsSelect').value = state.ts;
    const used = usedSlots(), lim = slotLimit();
    $('tsSlots').innerHTML = `${used} of ${lim} circuits wired<div class="pips">${Array.from({ length: lim }, (_, i) => `<span class="pip ${i < used ? 'used' : ''}"></span>`).join('')}</div>`;
  }

  // neutral note
  const n = $('neutralNote');
  if (state.conn === 'cords') { n.className = 'note'; n.textContent = g.bestOutlet ? 'Extension cords: plug each high-draw appliance into its own outlet or cord.' : 'This model has no 240V outlet, so it cannot be connected to a home panel. Use extension cords.'; }
  else if (g.neutral === 'Floating') { n.className = 'note ok'; n.textContent = 'Floating neutral: connects to a standard 2-pole transfer switch or interlock kit as-is.'; }
  else if (g.neutral === 'Bonded') {
    n.className = 'note warn';
    n.innerHTML = 'Bonded neutral: a qualified electrician must remove the bond before this model is used with a standard 2-pole transfer switch or interlock kit' +
      (g.unbondDoc ? ` (<a href="${g.unbondDoc}" target="_blank" rel="noopener" style="color:inherit">DuroMax unbond instructions</a>)` : ' (no unbond instructions published for this model - contact DuroMax)') +
      '. Never run it unbonded unless it is grounded through the home.';
  } else { n.className = 'note'; n.textContent = ''; }

  // equipment
  $('equipBox').classList.toggle('hidden', state.conn === 'cords' && !state.softStart);
  $('equipList').innerHTML = equipmentFor(g).map(e => `<div class="equip-item"><div><span class="role">${e.role}</span><a href="${e.url}" target="_blank" rel="noopener">${e.sku} - ${short(e.title)}</a></div><span class="price">${e.price ? '$' + e.price.toFixed(2) : ''}${e.available === false ? ' · out of stock' : ''}</span></div>`).join('');
}
function short(t) { return t.replace(/^(DuroMax|Reliance|GenInterlock|AIRGO|AirGo)\s*/i, '').slice(0, 64); }
function equipmentFor(g) {
  const items = [];
  const a = ampsFor(g);
  if (state.conn !== 'cords' && a) {
    const inlets = EQ.inletBoxes.filter(b => b.amps === a && (b.inlet_type === (a === 50 ? 'CS6375' : 'L14-30') || (a === 50 && !b.inlet_type)));
    inlets.slice(0, 2).forEach(b => items.push({ role: 'Power inlet box', sku: b.sku, title: b.title, url: b.url, price: b.price_usd, available: b.available }));
    const plugs = a === 50 ? ['14-50P', 'L14-50P'] : ['L14-30P'];
    EQ.cords.filter(c => plugs.includes(c.plug_end)).slice(0, 3).forEach(c => items.push({ role: 'Generator cord', sku: c.sku, title: c.title, url: c.url, price: c.price_usd, available: c.available }));
    if (state.conn === 'transfer' && tsObj()) { const t = tsObj(); items.unshift({ role: 'Transfer switch', sku: t.sku, title: t.title, url: t.url, price: t.price_usd, available: t.available }); }
    if (state.conn === 'interlock') {
      items.unshift({ role: 'Interlock kit - pick the one for your panel brand', sku: 'GenInterlock', title: 'kits for Square D, Eaton/Cutler-Hammer, GE, Siemens/Murray/ITE, Bryant', url: 'https://www.duromaxpower.com/pages/geninterlock' });
      items.push({ role: 'Backfeed breaker', sku: `${a}A 2-pole`, title: 'breaker for your panel brand (not included with kit)', url: 'https://www.duromaxpower.com/pages/home-power-backup-installation' });
    }
  }
  if (state.softStart) {
    const s = EQ.softStarters.find(x => x.sku === 'AGO-AIRGOG38-16') || EQ.softStarters[0];
    if (s) items.push({ role: 'Soft starter (3-ton AC)', sku: s.sku.replace('AGO-', ''), title: s.title, url: s.url, price: s.price_usd, available: s.available });
  }
  return items;
}

function renderMeter() {
  const c = cap();
  const live = new Set([...state.on].filter(id => isPowered(id)));
  const t = E.totals(APPS, live, opts());
  const pctRun = c.running ? t.running / c.running : 0;
  const pctSurge = c.surge ? t.surgePeak / c.surge : 0;
  const cls = p => p > 1 ? 'bad' : p > 0.8 ? 'warn' : '';
  $('runFill').style.width = Math.min(100, pctRun * 100) + '%'; $('runFill').className = 'fill ' + cls(pctRun);
  $('surgeFill').style.width = Math.min(100, pctSurge * 100) + '%'; $('surgeFill').className = 'fill ' + cls(pctSurge);
  $('runText').textContent = `${fmt(t.running)} / ${fmt(c.running)} W`;
  $('surgeText').textContent = `${fmt(t.surgePeak)} / ${fmt(c.surge)} W`;
  $('pctText').textContent = Math.round(pctRun * 100) + '%';
  $('limitText').textContent = c.limitedBy === 'generator running rating' ? 'Generator rating' : c.limitedBy;
  const f = fuelSpec(); const genFrac = f.running ? t.running / f.running : 0;
  let rt = '—';
  if (state.tripped) rt = 'Tripped';
  else if (state.fuel === 'Natural Gas') rt = t.running ? 'Continuous' : '—';
  else if (t.running) { const h = E.runtimeHours(f, genFrac); rt = h ? `~${h.toFixed(1)} h` : 'n/a'; }
  $('runtimeText').textContent = rt;
  $('runtimeText').title = state.fuel === 'Propane' && gen().lpTankBasis ? `Based on a ${gen().lpTankBasis} propane tank` : (state.fuel === 'Gasoline' ? `Full ${gen().tankGal} gal tank` : '');
  $('hudLoad').innerHTML = state.tripped ? '<span style="color:#ff8a8e">Generator breaker tripped</span>' : `${fmt(t.running)} W · ${Math.round(pctRun * 100)}% load`;
  $('softStart').checked = state.softStart;
}

function renderPanel() {
  const rooms = {};
  for (const a of APPS) (rooms[a.room] ||= []).push(a);
  const ts = state.conn === 'transfer';
  $('panelHelp').textContent = ts ? 'Tick "wired" to put a circuit on the transfer switch, then flip its breaker.' :
    state.conn === 'cords' ? 'Flip a breaker to plug that appliance into the generator.' : 'Flip breakers on and off to see what the generator can run.';
  $('panel').innerHTML = Object.entries(rooms).map(([room, list]) => {
    const roomW = list.filter(a => isPowered(a.id)).reduce((s, a) => s + a.running, 0);
    return `<div class="room"><div class="room-title"><span>${room}</span><span>${roomW ? fmt(roomW) + ' W' : ''}</span></div>` +
      list.map(a => {
        const blocked = E.blockedReason(a, state.conn, state.wired);
        const on = state.on.has(a.id);
        const startTxt = a.starting > a.running ? ` · ${fmt(E.effectiveStarting(a, state.softStart, window.SOFT_START_REDUCTION))} start` : '';
        return `<div class="circuit ${on && !blocked ? 'on' : ''} ${blocked ? 'blocked' : ''}" id="row-${a.id}" title="${blocked || ''}">
          <button class="breaker ${on ? 'on' : ''}" data-id="${a.id}" aria-label="${a.name} breaker" aria-pressed="${on}"></button>
          <div class="c-name">${a.name}${a.volts === 240 ? '<span class="tag v240">240V</span>' : ''}${a.tag ? `<span class="tag ${a.tag}">${a.tag}</span>` : ''}${a.softStart && state.softStart ? '<span class="tag Essential">AirGo</span>' : ''}
            ${ts ? `<label class="wire"><input type="checkbox" data-wire="${a.id}" ${state.wired.has(a.id) ? 'checked' : ''}> wired to switch</label>` : ''}</div>
          <div class="c-watts">${fmt(a.running)} W<br><span>${startTxt.replace(' · ', '')}</span></div></div>`;
      }).join('') + '</div>';
  }).join('');
}

function renderBanner() {
  const b = $('banner');
  if (state.tripped) { b.classList.remove('hidden'); $('bannerTitle').textContent = 'Overload - generator breaker tripped'; $('bannerMsg').textContent = state.tripped.message; }
  else b.classList.add('hidden');
}

function sync3D() {
  const g = gen(), c = cap();
  const live = new Set([...state.on].filter(id => isPowered(id)));
  const t = E.totals(APPS, live, opts());
  for (const id of house.ids) house.setApplianceState(id, isPowered(id) ? 'on' : (state.on.has(id) ? 'dead' : 'off'));
  house.setGenerator({ running: true, load: c.running ? t.running / c.running : 0, isTripped: !!state.tripped, name: g.model });
  house.setConnection(state.conn);
  house.setSoftStarter(state.softStart);
}

// ---------------- small UI bits ----------------
let toastTimer;
function toast(msg) {
  const b = $('banner');
  if (state.tripped) return;
  b.classList.remove('hidden'); $('bannerTitle').textContent = 'Can\'t switch that on'; $('bannerMsg').textContent = msg; $('resetBtn').classList.add('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('resetBtn').classList.remove('hidden'); renderBanner(); }, 3200);
}
function flashRow(id) { const r = $('row-' + id); if (r) { r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); r.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
function flashBanner() { const b = $('banner'); b.animate([{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.03)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 300 }); }
function showTooltip(id, ev) {
  const tip = $('tooltip');
  if (!id || !ev) { tip.classList.add('hidden'); return; }
  const a = APP[id], blocked = E.blockedReason(a, state.conn, state.wired);
  const status = isPowered(id) ? '<span style="color:#5fd68f">Powered</span>' : state.on.has(id) ? '<span style="color:#ff8a8e">Breaker on - no power</span>' : 'Off';
  tip.innerHTML = `<b>${a.name}</b><br>${fmt(a.running)} W running${a.starting > a.running ? ` · ${fmt(E.effectiveStarting(a, state.softStart, window.SOFT_START_REDUCTION))} W starting` : ''} · ${a.volts}V<br>${status}${blocked ? `<br><span class="muted">${blocked}</span>` : ''}<br><span class="muted">Click to switch</span>`;
  const r = $('viewport').getBoundingClientRect();
  tip.style.left = (ev.clientX - r.left) + 'px'; tip.style.top = (ev.clientY - r.top) + 'px';
  tip.classList.remove('hidden');
}

// ---------------- events ----------------
$('brandSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.brand = b.dataset.brand; renderGenSelect(); selectGenerator($('genSelect').value); });
$('genSelect').addEventListener('change', e => selectGenerator(e.target.value));
$('fuelSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; state.fuel = b.dataset.fuel; revalidate(); });
$('connSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; state.conn = b.dataset.conn; if (state.conn === 'transfer' && !state.wired.size) autoWire(); revalidate(); });
$('tsSelect').addEventListener('change', e => { state.ts = e.target.value; autoWire(); revalidate(); });
$('softStart').addEventListener('change', e => { state.softStart = e.target.checked; revalidate(); });
$('panel').addEventListener('click', e => { const b = e.target.closest('.breaker'); if (b) toggle(b.dataset.id); });
$('panel').addEventListener('change', e => { const w = e.target.closest('[data-wire]'); if (w) toggleWire(w.dataset.wire, w.checked); });
document.querySelector('.presets').addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (b) applyPreset(b.dataset.preset); });
$('resetBtn').addEventListener('click', resetBreaker);
$('viewHome').addEventListener('click', () => house.setView('home'));
$('viewPanel').addEventListener('click', () => house.setView('panel'));
$('dayNight').addEventListener('click', () => { state.night = !state.night; house.setNight(state.night); $('dayNight').textContent = state.night ? 'Switch to day' : 'Switch to night'; sync3D(); });

// deep link: ?model=XP13000HX&fuel=Propane&conn=transfer
const q = new URLSearchParams(location.search);
if (q.get('model') && GENS.find(g => g.model === q.get('model'))) state.model = q.get('model');
if (q.get('fuel')) state.fuel = q.get('fuel');
if (['interlock', 'transfer', 'cords'].includes(q.get('conn'))) state.conn = q.get('conn');
selectGenerator(state.model);
window.__sim = { state, render, toggle, applyPreset, resetBreaker };   // for testing
