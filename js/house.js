// 3D cutaway home for the Home Backup Power Simulator (Three.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const COL = {
  kitchen: 0xd9cfbf, living: 0xc9b99f, bedroom: 0xb8c4cf, utility: 0xbfc3c7, garage: 0x8d9196,
  wall: 0xeeeae3, wallExt: 0xd8d2c8, trim: 0x5b6470, appliance: 0xe9ecef, dark: 0x2b2f35, steel: 0xb7bdc4,
  accent: 0xf26b1d, grass: 0x3d5a36, concrete: 0x9a9a96,
};

export function createHouse(container, { onClick, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 6; controls.maxDistance = 45;
  const VIEWS = {
    home: { pos: [13, 17, 21], target: [0.5, 0, 0] },
    panel: { pos: [15, 6, -9], target: [7, 1, -3] },
  };
  let viewAnim = null;
  function setView(name, instant) {
    const v = VIEWS[name];
    if (instant) { camera.position.set(...v.pos); controls.target.set(...v.target); controls.update(); return; }
    viewAnim = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: new THREE.Vector3(...v.pos), toT: new THREE.Vector3(...v.target) };
  }
  setView('home', true);

  // ---------- lighting ----------
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3226, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-12, 22, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18 });
  scene.add(sun);

  // ---------- helpers ----------
  const mats = new Map();
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
    return mats.get(key);
  }
  function box(w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts && opts.material ? opts.material : mat(color, opts));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function cyl(r, h, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), opts && opts.material ? opts.material : mat(color, opts));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function glowMat(color) { return new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0, roughness: 0.4 }); }
  function label(text, x, z, size = 1) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '600 56px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(20,24,30,.55)'; g.strokeText(text.toUpperCase(), 256, 64); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(text.toUpperCase(), 256, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4 * size, 1 * size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.13, z); scene.add(m);
  }

  // ---------- ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat(COL.grass, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  scene.add(box(4.2, 0.02, 10, COL.concrete, 6, 0, 10));        // driveway
  scene.add(box(4.2, 0.02, 3.2, COL.concrete, 11, 0, -3));      // generator pad
  scene.add(box(1.8, 0.02, 1.8, COL.concrete, -6.5, 0, 6.7));    // AC pad

  // ---------- floors ----------
  const rooms = [
    ['Kitchen', -8, -2, -5, 0, COL.kitchen], ['Living Room', -2, 4, -5, 0, COL.living],
    ['Bedroom', -8, -3, 0, 5, COL.bedroom], ['Utility / Laundry', -3, 4, 0, 5, COL.utility],
    ['Garage', 4, 8, -5, 5, COL.garage],
  ];
  for (const [name, x0, x1, z0, z1, color] of rooms) {
    scene.add(box(x1 - x0, 0.12, z1 - z0, color, (x0 + x1) / 2, 0, (z0 + z1) / 2));
    label(name, (x0 + x1) / 2, name === 'Garage' ? -0.3 : (z0 + z1) / 2 + 0.2, name.length > 10 ? 0.8 : 0.7);
  }

  // ---------- walls (cutaway: tall back/left, low front/right) ----------
  const H = 2.7, LOW = 0.45, T = 0.14;
  const wallM = mat(COL.wall), extM = mat(COL.wallExt);
  const wall = (x0, z0, x1, z1, h, m) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const w = box(x1 !== x0 ? len : T, h, z1 !== z0 ? len : T, 0, (x0 + x1) / 2, 0.12, (z0 + z1) / 2, { material: m });
    scene.add(w); return w;
  };
  wall(-8, -5, 8, -5, H, extM);             // back
  wall(-8, -5, -8, 5, H, extM);             // left
  wall(-8, 5, 4, 5, LOW, extM);             // front (house)
  wall(8, -5, 8, 5, LOW, extM);             // right (garage)
  wall(4, -5, 4, 5, H * 0.55, wallM);        // garage / house fire wall
  wall(-2, -5, -2, -1.2, H * 0.4, wallM);    // kitchen / living
  wall(-3, 0, -3, 5, H * 0.4, wallM);        // bedroom / utility
  wall(-8, 0, -5.5, 0, H * 0.4, wallM); wall(-4.5, 0, 4, 0, H * 0.4, wallM);  // front rooms / back rooms (with doorway)
  // windows on back wall
  for (const x of [-5, 1.5]) scene.add(box(1.6, 1.0, 0.05, 0x9fc3e0, x, 1.2, -4.9, { roughness: 0.1, metalness: 0.3 }));

  // ---------- appliances ----------
  const appliances = {};   // id -> { group, glow:[materials], anim(t, powered), state }
  const clickables = [];
  function reg(id, group, glows = [], anim = null) {
    group.traverse(o => { if (o.isMesh) { o.userData.applianceId = id; clickables.push(o); } });
    scene.add(group);
    appliances[id] = { group, glows, anim, state: 'off' };
    return appliances[id];
  }
  const G = () => new THREE.Group();

  // Kitchen
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(box(0.9, 1.8, 0.75, COL.appliance, -7.35, 0.12, -4.45));
    g.add(box(0.03, 0.9, 0.03, COL.steel, -6.95, 1.0, -4.05));
    const strip = box(0.5, 0.05, 0.02, 0, -7.35, 1.72, -4.06, { material: s }); g.add(strip);
    reg('fridge', g, [s]); }
  { const g = G(); const s = glowMat(0xff3b1d);
    g.add(box(0.76, 0.9, 0.68, COL.dark, -6.25, 0.12, -4.5));
    for (const [dx, dz] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 20), s); b.position.set(-6.25 + dx, 1.03, -4.5 + dz); g.add(b); }
    reg('range', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(0.6, 0.86, 0.62, COL.steel, -5.45, 0.12, -4.5));
    g.add(box(0.12, 0.03, 0.01, 0, -5.45, 0.9, -4.18, { material: s }));
    reg('dishwasher', g, [s]); }
  scene.add(box(2.6, 0.9, 0.62, 0x6b5a4a, -3.85, 0.12, -4.5));   // counter
  scene.add(box(2.6, 0.04, 0.66, 0x2f3033, -3.85, 1.02, -4.5));
  { const g = G(); const s = glowMat(0xffc15a);
    g.add(box(0.52, 0.3, 0.38, COL.dark, -4.7, 1.06, -4.55));
    g.add(box(0.32, 0.2, 0.01, 0, -4.76, 1.11, -4.35, { material: s }));
    reg('microwave', g, [s]); }
  { const g = G(); const s = glowMat(0xff5a36);
    g.add(box(0.22, 0.34, 0.24, COL.dark, -3.95, 1.06, -4.6));
    g.add(cyl(0.07, 0.12, 0x444444, -3.95, 1.08, -4.46, { transparent: true, opacity: 0.8 }));
    g.add(box(0.04, 0.02, 0.01, 0, -3.88, 1.35, -4.47, { material: s }));
    reg('coffee', g, [s]); }
  { const g = G(); const s = glowMat(0xff6a00);
    g.add(box(0.28, 0.18, 0.16, COL.steel, -3.35, 1.06, -4.6));
    g.add(box(0.2, 0.01, 0.1, 0, -3.35, 1.245, -4.6, { material: s }));
    reg('toaster', g, [s]); }

  // Living room
  { const g = G(); const s = glowMat(0x4aa8ff);
    g.add(box(1.0, 0.45, 0.4, 0x3b3128, 1.0, 0.12, -4.65));
    g.add(box(1.5, 0.86, 0.06, COL.dark, 1.0, 0.95, -4.85));
    g.add(box(1.4, 0.78, 0.01, 0, 1.0, 0.99, -4.81, { material: s }));
    reg('tv', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(0.3, 0.06, 0.2, COL.dark, 2.2, 0.57, -4.65));
    for (let i = 0; i < 4; i++) g.add(box(0.02, 0.012, 0.01, 0, 2.1 + i * 0.06, 0.61, -4.54, { material: s }));
    reg('internet', g, [s], (t, on) => { s.emissiveIntensity = on ? (Math.sin(t * 9) > 0 ? 2 : 0.6) : 0; }); }
  scene.add(box(2.2, 0.45, 0.9, 0x55606e, 1.0, 0.12, -1.4)); scene.add(box(2.2, 0.5, 0.2, 0x55606e, 1.0, 0.5, -0.95)); // sofa
  { const g = G(); const s = glowMat(0xff4d1a);
    g.add(box(0.35, 0.55, 0.22, 0xdad6cf, -1.35, 0.12, -2.4));
    g.add(box(0.25, 0.3, 0.01, 0, -1.35, 0.3, -2.285, { material: s }));
    reg('spaceheater', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(0.5, 0.5, 0.4, 0x3b3128, 3.1, 0.12, -1.2));
    g.add(box(0.34, 0.02, 0.24, 0x9aa3ad, 3.05, 0.62, -1.2));
    g.add(box(0.08, 0.01, 0.15, 0x111111, 3.25, 0.62, -1.1));
    g.add(box(0.05, 0.005, 0.02, 0, 3.05, 0.645, -1.08, { material: s }));
    reg('chargers', g, [s]); }
  { const g = G(); const s = glowMat(0xff2d2d);
    g.add(box(0.05, 0.25, 0.18, 0xf2f2f2, 3.86, 1.35, -3.2));
    g.add(box(0.01, 0.05, 0.05, 0, 3.83, 1.5, -3.2, { material: s }));
    const cam = box(0.14, 0.1, 0.1, 0xf2f2f2, 7.8, 2.35, 4.8); g.add(cam);
    g.add(box(0.02, 0.02, 0.02, 0, 7.8, 2.38, 4.86, { material: s }));
    reg('security', g, [s], (t, on) => { s.emissiveIntensity = on ? (Math.sin(t * 3) > 0.3 ? 2 : 0.3) : 0; }); }
  function fan(x, z) {
    const g = G(); const hub = cyl(0.12, 0.12, COL.dark, x, 2.45, z); g.add(hub);
    g.add(cyl(0.02, 0.15, COL.dark, x, 2.57, z));
    const blades = new THREE.Group(); blades.position.set(x, 2.52, z);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 0.14), mat(0x6b5a4a)); b.position.x = 0.45; const p = new THREE.Group(); p.rotation.y = i * Math.PI / 2; p.add(b); blades.add(p); }
    g.add(blades); return { g, blades };
  }
  { const f1 = fan(1.0, -2.6), f2 = fan(-5.6, 2.4); const g = G(); g.add(f1.g, f2.g);
    reg('fans', g, [], (t, on, dt) => { const s = on ? dt * 9 : 0; f1.blades.rotation.y += s; f2.blades.rotation.y += s; }); }

  // Bedroom
  scene.add(box(1.7, 0.5, 2.1, 0x6d7f95, -6.4, 0.12, 3.6)); scene.add(box(1.7, 0.9, 0.12, 0x3b3128, -6.4, 0.12, 4.7));
  scene.add(box(0.45, 0.55, 0.4, 0x3b3128, -7.6, 0.12, 2.3)); // nightstand
  { const g = G(); const s = glowMat(0x4aa8ff);
    g.add(box(0.28, 0.14, 0.2, 0x9aa3ad, -7.6, 0.67, 2.3));
    g.add(box(0.1, 0.03, 0.01, 0, -7.6, 0.75, 2.405, { material: s }));
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 8, 24, Math.PI), mat(0x9ab0c8)); hose.position.set(-7.25, 0.75, 2.6); hose.rotation.y = Math.PI / 2; g.add(hose);
    reg('cpap', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(0.4, 0.68, 0.34, 0xe9eef3, -4.6, 0.12, 4.4));
    g.add(box(0.2, 0.06, 0.01, 0, -4.6, 0.65, 4.225, { material: s }));
    reg('oxygen', g, [s]); }
  { const g = G(); const s = glowMat(0x7cd4ff); const grill = { r: 0 };
    g.add(box(0.6, 0.42, 0.66, 0xdcdcdc, -8.15, 1.1, 2.0));
    g.add(box(0.01, 0.3, 0.5, 0, -7.84, 1.16, 2.0, { material: s }));
    reg('windowac', g, [s]); }
  scene.add(box(1.0, 0.8, 0.45, 0x3b3128, -3.75, 0.12, 0.6));
  { const g = G(); const s = glowMat(0xff6a00);
    g.add(box(0.1, 0.2, 0.26, 0x6c4cc2, -3.75, 0.92, 0.6));
    g.add(box(0.02, 0.06, 0.06, 0, -3.75, 1.02, 0.46, { material: s }));
    reg('hairdryer', g, [s]); }

  // Utility / laundry
  function drumWasher(id, x, color, glowColor) {
    const g = G(); const s = glowMat(glowColor);
    g.add(box(0.68, 0.9, 0.68, color, x, 0.12, 4.5));
    const door = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 10, 28), mat(COL.steel)); door.position.set(x, 0.55, 4.155); g.add(door);
    const drum = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), s); drum.position.set(x, 0.55, 4.152); drum.rotation.y = Math.PI; g.add(drum);
    return reg(id, g, [s], (t, on, dt) => { if (on) drum.rotation.z += dt * 6; });
  }
  drumWasher('washer', -2.4, COL.appliance, 0x7cd4ff);
  drumWasher('gasdryer', -1.6, 0xdfe3e7, 0xffa040);
  drumWasher('elecdryer', -0.8, 0xd3d7db, 0xff6a00);
  { const g = G(); const s = glowMat(0xff6a00);
    g.add(cyl(0.3, 1.45, 0xe6e9ec, 0.35, 0.12, 4.45));
    g.add(box(0.12, 0.08, 0.01, 0, 0.35, 0.95, 4.14, { material: s }));
    reg('waterheater', g, [s]); }
  { const g = G(); const s = glowMat(0x4aa8ff);
    g.add(box(0.62, 1.4, 0.72, 0xc9cdd1, 1.35, 0.12, 4.45));
    g.add(box(0.3, 0.04, 0.01, 0, 1.35, 0.6, 4.08, { material: s }));
    const flue = cyl(0.08, 1.2, COL.steel, 1.35, 1.52, 4.6); g.add(flue);
    reg('furnace', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 24, 1, true), mat(0x333333, { side: THREE.DoubleSide })); pit.position.set(2.45, 0.15, 4.35); g.add(pit);
    g.add(cyl(0.22, 0.03, 0x2a4a66, 2.45, 0.12, 4.35));
    g.add(cyl(0.035, 0.9, 0x333333, 2.45, 0.12, 4.35));
    g.add(box(0.1, 0.1, 0.06, 0, 2.45, 0.9, 4.33, { material: s }));
    reg('sump', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(cyl(0.26, 0.95, 0x2d6cb5, 3.4, 0.12, 4.4));
    g.add(box(0.18, 0.2, 0.08, 0x777777, 3.4, 1.1, 4.4));
    g.add(box(0.06, 0.04, 0.01, 0, 3.4, 1.22, 4.35, { material: s }));
    reg('well', g, [s]); }
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(box(1.2, 0.85, 0.7, COL.appliance, 2.8, 0.12, 1.2));
    g.add(box(0.12, 0.03, 0.01, 0, 3.25, 0.82, 0.845, { material: s }));
    reg('freezer', g, [s]); }
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(box(0.36, 0.6, 0.26, 0xf0f0f0, 0.3, 0.12, 1.0));
    g.add(box(0.2, 0.04, 0.01, 0, 0.3, 0.6, 0.865, { material: s }));
    reg('dehumidifier', g, [s]); }
  { const g = G(); const s = glowMat(0xff2d2d);
    g.add(cyl(0.1, 0.04, 0xf5f5f5, 0.5, 2.62, 2.5)); g.add(cyl(0.1, 0.04, 0xf5f5f5, -5.5, 2.62, 3.8)); g.add(cyl(0.1, 0.04, 0xf5f5f5, -4.6, 2.62, -2.5));
    for (const [x, z] of [[0.5, 2.5], [-5.5, 3.8], [-4.6, -2.5]]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), s); d.position.set(x, 2.61, z); g.add(d); }
    reg('smoke', g, [s], (t, on) => { s.emissiveIntensity = on ? (Math.sin(t * 2) > 0.85 ? 3 : 0.4) : 0; }); }

  // Garage
  const door = box(3.5, 2.2, 0.08, 0xe8e8e8, 6, 0.12, 5.02);
  scene.add(door);
  for (let i = 1; i < 4; i++) door.add(box(3.5, 0.02, 0.01, 0xbdbdbd, 0, -1.1 + i * 0.55, 0.045));
  let doorOpen = 0;
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(0.4, 0.18, 0.7, 0x777777, 6, 2.4, 2.8));
    g.add(box(0.06, 0.04, 0.3, 0x555555, 6, 2.52, 4.0));
    g.add(box(0.1, 0.03, 0.01, 0, 6, 2.45, 2.44, { material: s }));
    reg('garagedoor', g, [s], (t, on, dt) => {
      doorOpen += ((on ? 1 : 0) - doorOpen) * Math.min(1, dt * 1.5);
      door.position.y = 0.12 + 1.1 + doorOpen * 2.1; door.rotation.x = -doorOpen * Math.PI / 2 * 0.98; door.position.z = 5.02 - doorOpen * 1.1;
    }); }
  { const g = G(); const s = glowMat(0x3dff8a);
    // simple car
    g.add(box(1.8, 0.6, 4.1, 0x2f4f6f, 5.6, 0.3, 0.4));
    g.add(box(1.6, 0.5, 2.2, 0x283f59, 5.6, 0.9, 0.2));
    for (const [x, z] of [[4.75, 1.8], [6.45, 1.8], [4.75, -1.0], [6.45, -1.0]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20), mat(0x1a1a1a)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); g.add(w); }
    g.add(box(0.2, 0.32, 0.12, 0x2a2a2a, 7.85, 1.0, -0.6));
    g.add(box(0.02, 0.06, 0.06, 0, 7.74, 1.22, -0.6, { material: s }));
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(7.8, 1.05, -0.6), new THREE.Vector3(7.3, 0.4, -0.4), new THREE.Vector3(6.6, 0.8, -1.4)]), 20, 0.025, 6), mat(0x222222));
    g.add(cable);
    reg('ev', g, [s], (t, on) => { s.emissiveIntensity = on ? 1 + Math.sin(t * 2.5) : 0; }); }

  // Outdoor central AC with optional AirGo soft starter
  let acFan, softBox;
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(1.0, 0.9, 1.0, 0xd0d3d6, -6.5, 0.02, 6.7));
    acFan = new THREE.Group(); acFan.position.set(-6.5, 0.95, 6.7);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.14), mat(0x333333)); const p = new THREE.Group(); p.rotation.y = i * Math.PI * 2 / 3; b.position.x = 0.2; p.add(b); acFan.add(p); }
    g.add(acFan);
    g.add(box(0.06, 0.06, 0.01, 0, -6.2, 0.7, 7.21, { material: s }));
    softBox = box(0.1, 0.22, 0.16, 0xffffff, -5.95, 0.45, 6.7); softBox.visible = false; g.add(softBox);
    reg('centralac', g, [s], (t, on, dt) => { if (on) acFan.rotation.y += dt * 12; });
    const acl = makeSprite('Central AC'); acl.position.set(-6.5, 1.6, 6.7); scene.add(acl); }

  // ---------- LED lights (10 bulbs) ----------
  const bulbPos = [[-6.5, -3], [-4, -2.5], [-0.5, -3.5], [2.5, -3.5], [1, -1.2], [-6.5, 1.8], [-4.5, 3.5], [-1, 2.5], [2.5, 2.8], [6, -2]];
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff7e0, emissive: 0xffe9b0, emissiveIntensity: 0 });
  const bulbLights = [];
  { const g = G();
    for (const [x, z] of bulbPos) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), bulbMat); b.position.set(x, 2.55, z); g.add(b);
      const l = new THREE.PointLight(0xffe4b0, 0, 7, 1.6); l.position.set(x, 2.4, z); scene.add(l); bulbLights.push(l);
    }
    reg('lights', g, [bulbMat]); }

  // ---------- generator, cord, inlet, panel, transfer switch ----------
  const genGroup = G();
  const genBody = box(1.25, 0.75, 0.8, COL.accent, 0, 0.35, 0);
  const frameM = mat(0x1d1f22, { metalness: 0.4 });
  genGroup.add(genBody);
  for (const [x, z] of [[-0.62, -0.4], [0.62, -0.4], [-0.62, 0.4], [0.62, 0.4]]) genGroup.add(box(0.05, 1.1, 0.05, 0, x, 0.1, z, { material: frameM }));
  genGroup.add(box(1.3, 0.05, 0.85, 0, 0, 1.2, 0, { material: frameM }));
  genGroup.add(box(1.3, 0.05, 0.85, 0, 0, 0.1, 0, { material: frameM }));
  for (const z of [-0.45, 0.45]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20), mat(0x151515)); w.rotation.x = Math.PI / 2; w.position.set(-0.45, 0.2, z); genGroup.add(w); }
  genGroup.add(box(0.5, 0.35, 0.02, 0x222222, 0.2, 0.55, 0.41)); // control panel
  const genLedM = glowMat(0x3dff8a);
  genGroup.add(box(0.06, 0.06, 0.01, 0, 0.35, 0.8, 0.425, { material: genLedM }));
  genGroup.position.set(11, 0.02, -3); genGroup.rotation.y = Math.PI / 2;
  genGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(genGroup);
  const genLabel = makeSprite('Generator');
  genLabel.position.set(11, 2.0, -3); scene.add(genLabel);

  // inlet box on garage exterior wall
  const inlet = box(0.3, 0.36, 0.14, 0x9aa0a6, 8.12, 0.55, -3.3); inlet.rotation.y = Math.PI / 2; scene.add(inlet);
  const cordM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: COL.accent, emissiveIntensity: 0 });
  const cordCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(10.6, 0.7, -3.4), new THREE.Vector3(9.8, 0.05, -3.8), new THREE.Vector3(8.8, 0.05, -3.4), new THREE.Vector3(8.2, 0.72, -3.3)]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 40, 0.04, 8), cordM));
  // conduit across the garage ceiling to the panel on the fire wall
  const conduitM = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: COL.accent, emissiveIntensity: 0 });
  const conduitCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(8.0, 0.75, -3.3), new THREE.Vector3(7.9, 2.3, -3.3), new THREE.Vector3(4.3, 2.3, -3.3), new THREE.Vector3(4.12, 1.75, -3.3)], false, 'catmullrom', 0.05);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(conduitCurve, 40, 0.025, 6), conduitM));
  // breaker panel
  const panel = box(0.12, 0.9, 0.55, 0x7d858e, 4.13, 1.0, -3.3); scene.add(panel);
  const panelLedM = glowMat(0x3dff8a);
  scene.add(box(0.01, 0.05, 0.05, 0, 4.2, 1.8, -3.1, { material: panelLedM }));
  const interlockPlate = box(0.01, 0.22, 0.3, 0xf26b1d, 4.2, 1.55, -3.3, { emissive: 0x401800 }); scene.add(interlockPlate);
  const tsBox = box(0.12, 0.6, 0.45, 0x5d6670, 4.13, 1.15, -2.55); scene.add(tsBox);
  const panelLabel = makeSprite('Panel'); panelLabel.position.set(4.6, 2.3, -3.3); scene.add(panelLabel);

  function makeSprite(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(15,18,22,.85)'; roundRect(g, 0, 0, 256, 64, 14); g.fill();
    g.font = '600 30px Inter, Arial, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); sp.scale.set(1.6, 0.4, 1); sp.renderOrder = 10; return sp;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------- state setters ----------
  let genRunning = false, genLoad = 0, night = true, tripped = false;
  function setApplianceState(id, state) {        // 'off' | 'on' | 'dead'  (dead = breaker on, but no power)
    const a = appliances[id]; if (!a) return; a.state = state;
    for (const m of a.glows) m.emissiveIntensity = state === 'on' ? (id === 'lights' ? 2.5 : 1.6) : 0;
    if (id === 'lights') bulbLights.forEach(l => { l.intensity = state === 'on' ? (night ? 6 : 1.5) : 0; });
  }
  function setGenerator({ running, load, isTripped, name }) {
    genRunning = running; genLoad = load; tripped = isTripped;
    genLedM.emissive.setHex(isTripped ? 0xff3030 : 0x3dff8a);
    genLedM.emissiveIntensity = running || isTripped ? 2 : 0;
    const live = running && !isTripped;
    cordM.emissiveIntensity = live ? 0.9 : 0; conduitM.emissiveIntensity = live ? 0.6 : 0;
    panelLedM.emissive.setHex(isTripped ? 0xff3030 : 0x3dff8a); panelLedM.emissiveIntensity = running || isTripped ? 2 : 0;
    if (name) updateSprite(genLabel, name);
  }
  function updateSprite(sp, text) {
    const c = sp.material.map.image, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height); g.fillStyle = 'rgba(15,18,22,.85)'; roundRect(g, 0, 0, 256, 64, 14); g.fill();
    g.font = '600 28px Inter, Arial, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
    sp.material.map.needsUpdate = true;
  }
  function setConnection(mode) {
    interlockPlate.visible = mode === 'interlock';
    tsBox.visible = mode === 'transfer';
    inlet.visible = mode !== 'cords';
  }
  function setSoftStarter(on) { softBox.visible = on; }
  function setNight(n) {
    night = n;
    scene.background = new THREE.Color(n ? 0x0b1020 : 0xa9c7e6);
    scene.fog = new THREE.Fog(n ? 0x0b1020 : 0xa9c7e6, 40, 90);
    hemi.intensity = n ? 0.45 : 1.0; hemi.color.setHex(n ? 0x6d7fb3 : 0xdfe8ff);
    sun.intensity = n ? 0.25 : 1.6; sun.color.setHex(n ? 0x9fb4ff : 0xffffff);
    setApplianceState('lights', appliances.lights.state);
  }
  setNight(true);

  // ---------- interaction ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let downAt = null, hoverId = null;
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(clickables, false)[0];
    return hit ? hit.object.userData.applianceId : null;
  }
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const id = pick(e); if (id && onClick) onClick(id);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    const id = pick(e);
    renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    if (id !== hoverId || id) { hoverId = id; onHover && onHover(id, e); }
  });
  renderer.domElement.addEventListener('pointerleave', () => { hoverId = null; onHover && onHover(null); });

  // ---------- loop ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 0.9 ? 62 : 42; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    for (const id in appliances) { const a = appliances[id]; if (a.anim) a.anim(t, a.state === 'on', dt); }
    if (genRunning && !tripped) {
      const amp = 0.004 + genLoad * 0.012;
      genBody.position.x = Math.sin(t * 60) * amp; genBody.position.z = Math.cos(t * 47) * amp;
    }
    if (viewAnim) {
      viewAnim.t = Math.min(1, viewAnim.t + dt * 1.4); const k = 1 - Math.pow(1 - viewAnim.t, 3);
      camera.position.lerpVectors(viewAnim.fromP, viewAnim.toP, k); controls.target.lerpVectors(viewAnim.fromT, viewAnim.toT, k);
      if (viewAnim.t >= 1) viewAnim = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return { setApplianceState, setGenerator, setConnection, setSoftStarter, setNight, setView, ids: Object.keys(appliances) };
}
