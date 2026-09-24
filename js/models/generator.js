// Procedural 3D models of the DuroMax / DuroStar generator families, built from each model's
// published dimensions and styled after the product photos on duromaxpower.com.
// Local axes: length = X (engine end at -X, control-panel end at +X), width = Z (front face at +Z), up = Y.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { nameplate, badge, controlPanel, inverterSide, louver } from '../textures.js?v=2.3';

const IN = 0.0254;
const M = {
  frame: () => new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.45, metalness: 0.55 }),
  paint: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.25 }),
  plastic: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.9 }),
  decal: (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.05 }),
};

function rbox(w, h, d, r, mat) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)), mat); m.castShadow = m.receiveShadow = true; return m; }
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = m.receiveShadow = true; return m; }
function cyl(r, h, mat, seg = 28) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.castShadow = true; return m; }
function plane(w, h, mat) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); return m; }
function tube(points, r, mat, closed = false) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.08), closed ? 120 : 60, r, 10, closed), mat);
  m.castShadow = true; return m;
}
function roundedRectPoints(x0, x1, y0, y1, z, r) {
  const pts = [], arc = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z)); } };
  arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, Math.PI / 2); arc(x0 + r, y0 + r, Math.PI); arc(x1 - r, y0 + r, Math.PI * 1.5);
  return pts;
}

function pneumaticWheel(r, width) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.3, 16, 40), M.rubber()); tire.castShadow = true; g.add(tire);
  const tread = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.93, width * 0.62, 36, 1, true), M.rubber()); tread.rotation.x = Math.PI / 2; g.add(tread);
  const hub = cyl(r * 0.45, width * 0.7, M.steel()); hub.rotation.x = Math.PI / 2; g.add(hub);
  const cap = cyl(r * 0.14, width * 0.8, M.frame()); cap.rotation.x = Math.PI / 2; g.add(cap);
  return g;
}
function solidWheel(r, width) {
  const g = new THREE.Group();
  const t = cyl(r, width, M.rubber(), 36); t.rotation.x = Math.PI / 2; g.add(t);
  const hub = cyl(r * 0.55, width * 1.04, M.plastic(0x2a2b2e)); hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 5; i++) { const s = box(r * 0.08, r * 0.9, width * 1.06, M.plastic(0x1a1a1a)); s.rotation.z = (i / 5) * Math.PI; g.add(s); }
  return g;
}

function openFrame(gen, L, W, H, colors, opts = {}) {
  const g = new THREE.Group(), fm = M.frame();
  const r = Math.min(0.09, H * 0.14), y0 = 0.1, y1 = H;
  for (const z of [W / 2 - 0.02, -W / 2 + 0.02]) g.add(tube(roundedRectPoints(-L / 2, L / 2, y0, y1, z, r), 0.016, fm, true));
  for (const x of [-L / 2 + 0.02, L / 2 - 0.02]) for (const y of [y1 - 0.02, y0 + 0.02]) { const c = cyl(0.016, W - 0.04, fm, 12); c.rotation.x = Math.PI / 2; c.position.set(x, y, 0); g.add(c); }
  const base = box(L * 0.9, 0.02, W * 0.7, fm); base.position.set(0, y0 + 0.02, 0); g.add(base);

  const tankMat = M.paint(colors.tank);
  if (!opts.enclosed) {
    const tank = rbox(L * 0.58, H * 0.2, W * 0.64, 0.05, tankMat); tank.position.set(-L * 0.08, H * 0.78, -W * 0.04); g.add(tank);
    const capM = cyl(0.035, 0.03, M.plastic(0x111111)); capM.position.set(-L * 0.2, H * 0.9, -W * 0.02); g.add(capM);
    const gauge = cyl(0.025, 0.012, M.plastic(0x222222)); gauge.position.set(L * 0.02, H * 0.885, W * 0.05); g.add(gauge);
  }
  // branding plate across the top front rail
  const np = plane(L * 0.68, L * 0.68 * 160 / 1024, M.decal(nameplate(gen)));
  np.position.set(L * 0.1, H - 0.055, W / 2 - 0.01); np.rotation.x = -0.35; g.add(np);

  if (opts.enclosed) {
    // DuroStar iX: open frame around an enclosed inverter engine box
    const enc = rbox(L * 0.6, H * 0.62, W * 0.72, 0.04, M.plastic(0x1a1b1d)); enc.position.set(-L * 0.12, 0.13 + H * 0.31, 0); g.add(enc);
    const lv = plane(L * 0.34, H * 0.42, M.decal(louver())); lv.position.set(-L * 0.2, 0.13 + H * 0.3, W * 0.361); g.add(lv);
    const top = rbox(L * 0.5, H * 0.12, W * 0.6, 0.04, M.plastic(0x1a1b1d)); top.position.set(-L * 0.1, H * 0.84, 0); g.add(top);
    const b = plane(0.2, 0.0625, M.decal(badge(gen.brand))); b.position.set(-L * 0.12, H * 0.84, W * 0.301); g.add(b);
  } else {
    // engine
    const em = M.paint(colors.engine);
    const block = rbox(L * 0.34, H * 0.36, W * 0.46, 0.05, em); block.position.set(-L * 0.18, 0.13 + H * 0.2, W * 0.02); g.add(block);
    const blower = cyl(H * 0.2, 0.07, em, 40); blower.rotation.x = Math.PI / 2; blower.position.set(-L * 0.2, 0.13 + H * 0.21, W * 0.27); g.add(blower);
    const grill = cyl(H * 0.15, 0.072, M.plastic(0x10306e), 40); grill.rotation.x = Math.PI / 2; grill.position.copy(blower.position).add(new THREE.Vector3(0, 0, 0.004)); g.add(grill);
    if (gen.brand === 'DuroStar' || colors.engine !== '#1f56c9') grill.material = M.plastic(new THREE.Color(colors.engine).multiplyScalar(0.55).getHex());
    const bd = plane(0.16, 0.05, M.decal(badge(gen.brand))); bd.position.set(-L * 0.2, 0.13 + H * 0.21, W * 0.27 + 0.04); g.add(bd);
    const head = rbox(L * 0.2, H * 0.14, W * 0.26, 0.03, M.plastic(0x2c2d30)); head.position.set(-L * 0.06, 0.13 + H * 0.42, -W * 0.02); head.rotation.z = -0.35; g.add(head);
    const air = rbox(L * 0.12, H * 0.16, W * 0.2, 0.03, M.plastic(0x1a1a1a)); air.position.set(-L * 0.02, 0.13 + H * 0.34, W * 0.2); g.add(air);
    const recoil = box(0.05, 0.02, 0.03, M.plastic(0x111111)); recoil.position.set(-L * 0.08, 0.13 + H * 0.3, W * 0.33); g.add(recoil);
    // muffler on the engine end
    const muf = rbox(0.17, H * 0.42, W * 0.5, 0.03, M.plastic(0x1c1d1f)); muf.position.set(-L / 2 + 0.12, 0.13 + H * 0.26, 0); g.add(muf);
    // alternator
    const alt = cyl(H * 0.17, L * 0.22, M.frame(), 30); alt.rotation.z = Math.PI / 2; alt.position.set(L * 0.1, 0.13 + H * 0.2, -W * 0.02); g.add(alt);
    const fin = cyl(H * 0.175, 0.02, M.plastic(0x2c2d30), 30); fin.rotation.z = Math.PI / 2; fin.position.set(L * 0.2, 0.13 + H * 0.2, -W * 0.02); g.add(fin);
  }
  // control panel on the front, panel end
  const ph = (opts.bigPanel ? 0.58 : 0.45) * H, pw = L * 0.42;
  const pbox = box(pw, ph, 0.12, M.plastic(0x121314)); pbox.position.set(L * 0.23, 0.14 + ph / 2 + (opts.bigPanel ? 0.02 : H * 0.12), W / 2 - 0.09); g.add(pbox);
  const pf = plane(pw * 0.96, ph * 0.94, M.decal(controlPanel(gen))); pf.position.set(pbox.position.x, pbox.position.y, W / 2 - 0.028); g.add(pf);
  const led = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3dff8a, emissiveIntensity: 0 });
  const ledM = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), led); ledM.position.set(pbox.position.x - pw * 0.36, pbox.position.y + ph * 0.38, W / 2 - 0.02); g.add(ledM);

  // wheels on the engine end, legs + fold-down handle on the panel end
  const wr = Math.max(0.11, H * 0.2);
  for (const s of [1, -1]) {
    const w = pneumaticWheel(wr, 0.09); w.position.set(-L * 0.3, wr, s * (W / 2 + 0.06)); g.add(w);
    const leg = box(0.05, 0.1, 0.05, fm); leg.position.set(L * 0.38, 0.05, s * (W / 2 - 0.05)); g.add(leg);
  }
  const axle = cyl(0.014, W + 0.12, M.steel(), 10); axle.rotation.x = Math.PI / 2; axle.position.set(-L * 0.3, wr, 0); g.add(axle);
  g.add(tube([new THREE.Vector3(L / 2, H * 0.72, W * 0.36), new THREE.Vector3(L / 2 + 0.12, H * 0.78, W * 0.36), new THREE.Vector3(L / 2 + 0.16, H * 0.8, 0), new THREE.Vector3(L / 2 + 0.12, H * 0.78, -W * 0.36), new THREE.Vector3(L / 2, H * 0.72, -W * 0.36)], 0.015, fm));
  const grip = cyl(0.024, W * 0.4, M.rubber(), 16); grip.rotation.x = Math.PI / 2; grip.position.set(L / 2 + 0.16, H * 0.8, 0); g.add(grip);
  return { group: g, led, wheelR: wr };
}

function enclosedInverter(gen, L, W, H, colors, opts = {}) {
  const g = new THREE.Group();
  const blue = M.paint(opts.blueBody ? '#1d5fd6' : '#1f56c9'), black = M.plastic(0x18191b);
  const wr = Math.max(0.1, H * 0.16);
  const bodyH = H - 0.07;
  const body = rbox(L, bodyH, W, 0.07, black); body.position.set(0, 0.07 + bodyH / 2, 0); g.add(body);
  if (opts.blueBody) { for (const s of [1, -1]) { const side = rbox(L * 0.78, bodyH * 0.72, 0.03, 0.03, blue); side.position.set(L * 0.08, 0.07 + bodyH * 0.55, s * (W / 2 + 0.005)); g.add(side); } }
  const top = rbox(L * 0.9, 0.05, W * 0.82, 0.02, blue); top.position.set(0, H - 0.005, 0); g.add(top);
  if (!opts.blueBody) for (const x of [-L / 2 + 0.03, L / 2 - 0.03]) { const trim = rbox(0.05, bodyH * 0.75, 0.05, 0.02, blue); trim.position.set(x, 0.07 + bodyH * 0.55, W / 2 - 0.01); g.add(trim); }
  // front: control panel (panel end) + model graphic + louvers
  const pw = L * 0.36, ph = bodyH * 0.5;
  const pf = plane(pw, ph, M.decal(controlPanel(gen))); pf.position.set(-L * 0.25, 0.07 + bodyH * 0.62, W / 2 + 0.002); g.add(pf);
  const sg = plane(L * 0.38, L * 0.38, M.decal(inverterSide(gen, opts.blueBody ? '#1d5fd6' : '#151617'))); sg.position.set(L * 0.2, 0.07 + bodyH * 0.62, W / 2 + (opts.blueBody ? 0.022 : 0.002)); g.add(sg);
  const lv = plane(L * 0.84, bodyH * 0.2, M.decal(louver())); lv.position.set(0, 0.07 + bodyH * 0.2, W / 2 + (opts.blueBody ? 0.022 : 0.003)); g.add(lv);
  const bd = plane(0.18, 0.056, M.decal(badge(gen.brand))); bd.position.set(L * 0.2, 0.07 + bodyH * 0.9, W / 2 + (opts.blueBody ? 0.023 : 0.004)); g.add(bd);
  const led = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3dff8a, emissiveIntensity: 0 });
  const ledM = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), led); ledM.position.set(-L * 0.4, 0.07 + bodyH * 0.84, W / 2 + 0.01); g.add(ledM);
  // handles
  const fm = M.frame();
  for (const x of [-L / 2 - 0.02, L / 2 + 0.02]) g.add(tube([new THREE.Vector3(x, H * 0.75, W * 0.36), new THREE.Vector3(x + Math.sign(x) * 0.05, H + 0.05, W * 0.3), new THREE.Vector3(x + Math.sign(x) * 0.05, H + 0.05, -W * 0.3), new THREE.Vector3(x, H * 0.75, -W * 0.36)], 0.018, fm));
  // wheels (panel end) + feet; 28 kW models run on four wheels
  const ends = opts.fourWheels ? [-L * 0.36, L * 0.36] : [L * 0.36];
  for (const x of ends) for (const s of [1, -1]) { const w = solidWheel(wr, 0.08); w.position.set(x, wr, s * (W / 2 + 0.03)); g.add(w); }
  if (!opts.fourWheels) for (const s of [1, -1]) { const f = rbox(0.08, 0.08, 0.08, 0.02, M.rubber()); f.position.set(-L * 0.38, 0.04, s * W * 0.38); g.add(f); }
  return { group: g, led, wheelR: wr };
}

function suitcase(gen, L, W, H) {
  const g = new THREE.Group(), blue = M.paint('#1d5fd6');
  const body = rbox(L, H * 0.82, W, 0.08, blue); body.position.set(0, 0.03 + H * 0.41, 0); g.add(body);
  const band = rbox(L * 1.01, H * 0.14, W * 1.01, 0.04, M.plastic(0x1a1a1a)); band.position.set(0, 0.03 + H * 0.07, 0); g.add(band);
  g.add(tube([new THREE.Vector3(-L * 0.3, H * 0.8, 0), new THREE.Vector3(-L * 0.25, H + 0.03, 0), new THREE.Vector3(L * 0.25, H + 0.03, 0), new THREE.Vector3(L * 0.3, H * 0.8, 0)], 0.022, M.plastic(0x1d5fd6)));
  const pf = plane(L * 0.5, H * 0.45, M.decal(controlPanel(gen))); pf.position.set(L * 0.18, H * 0.45, W / 2 + 0.002); g.add(pf);
  const bd = plane(0.14, 0.044, M.decal(badge(gen.brand))); bd.position.set(-L * 0.25, H * 0.6, W / 2 + 0.003); g.add(bd);
  const led = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3dff8a, emissiveIntensity: 0 });
  const ledM = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 10), led); ledM.position.set(L * 0.35, H * 0.7, W / 2 + 0.01); g.add(ledM);
  for (const s of [1, -1]) { const w = solidWheel(0.06, 0.04); w.position.set(L * 0.42, 0.06, s * (W / 2 + 0.01)); g.add(w); }
  return { group: g, led, wheelR: 0.06 };
}

/** Build the 3D model for a generator record from data/generators.js. */
export function buildGenerator(gen) {
  const d = gen.dimsIn || [30, 28, 26];
  const L = d[0] * IN, W = d[1] * IN, H = d[2] * IN;
  const colors = gen.colors || { engine: '#1f56c9', tank: '#1f56c9' };
  let built;
  switch (gen.family) {
    case 'suitcase': built = suitcase(gen, L, W, H); break;
    case 'inverter': built = enclosedInverter(gen, L, W, H, colors, { fourWheels: /28000/.test(gen.model) }); break;
    case 'inverterBlue': built = enclosedInverter(gen, L, W, H, colors, { blueBody: true }); break;
    case 'openInverter': built = openFrame(gen, L, W, H, colors, { enclosed: true }); break;
    default: built = openFrame(gen, L, W, H, colors, { bigPanel: /1[57]500/.test(gen.model) });
  }
  built.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  built.size = { L, W, H };
  return built;
}
