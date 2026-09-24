// 3D cutaway home for the Home Backup Power Simulator (Three.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tex, roundRect } from './textures.js?v=2.1';
import { buildGenerator } from './models/generator.js?v=2.1';
import { buildEV } from './models/ev.js?v=2.1';

const GEN_POS = new THREE.Vector3(14.2, 0.02, -3.2);
const INLET_POS = new THREE.Vector3(8.1, 0.62, -3.5);

export function createHouse(container, { onClick, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envDay = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 250);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minDistance = 4; controls.maxDistance = 48;
  const VIEWS = {
    home: { pos: [15, 18, 23], target: [2.2, 0, 0] },
    panel: { pos: [16.2, 1.9, -0.6], target: [14.2, 0.45, -3.2] },
    garage: { pos: [9.5, 7, 10], target: [5.8, 0.5, 0] },
  };
  let viewAnim = null;
  function setView(name, instant) {
    const v = VIEWS[name] || VIEWS.home;
    if (instant) { camera.position.set(...v.pos); controls.target.set(...v.target); controls.update(); return; }
    viewAnim = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: new THREE.Vector3(...v.pos), toT: new THREE.Vector3(...v.target) };
  }
  setView('home', true);

  // ---------- lighting ----------
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a3f30, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e5, 2.2);
  sun.position.set(-14, 24, 16); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, near: 1, far: 70 });
  scene.add(sun);

  // ---------- helpers ----------
  const mats = new Map();
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.02, ...opts }));
    return mats.get(key);
  }
  const steelM = new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.28, metalness: 0.9 });
  const blackGlassM = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.08, metalness: 0.6 });
  function box(w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts && opts.material ? opts.material : mat(color, opts));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function rbox(w, h, d, r, color, x, y, z, opts) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), opts && opts.material ? opts.material : mat(color, opts));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function cyl(r, h, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), opts && opts.material ? opts.material : mat(color, opts));
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function glowMat(color) { return new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: color, emissiveIntensity: 0, roughness: 0.4 }); }
  function add(...o) { o.forEach(x => scene.add(x)); return o[0]; }
  function floorLabel(text, x, z, size = 1) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '700 54px Saira, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = 'rgba(15,20,30,.45)'; g.strokeText(text.toUpperCase(), 256, 64);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(text.toUpperCase(), 256, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6 * size, 0.9 * size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.155, z); m.renderOrder = 2; scene.add(m);
  }
  function sprite(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sp.material.map.colorSpace = THREE.SRGBColorSpace; sp.scale.set(3.4, 0.64, 1); sp.renderOrder = 10;
    sp.userData.set = (t) => {
      const g = c.getContext('2d'); g.clearRect(0, 0, 512, 96);
      g.font = '700 38px Saira, Arial, sans-serif'; const w = Math.min(500, g.measureText(t).width + 56);
      g.fillStyle = 'rgba(15,75,145,.95)'; roundRect(g, (512 - w) / 2, 8, w, 80, 16); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 256, 50);
      sp.material.map.needsUpdate = true;
    };
    sp.userData.set(text); return sp;
  }

  // ---------- site ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: tex.grass([30, 30]), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  add(box(4.4, 0.03, 12, 0, 6, 0, 11, { material: mat(0xffffff, { map: tex.asphalt([2, 6]), roughness: 0.95 }) }));          // driveway
  add(box(1.4, 0.03, 7, 0, 1.2, 0, 8.5, { material: mat(0xffffff, { map: tex.concrete([1, 5]) }) }));                         // front walk
  add(box(3.6, 0.04, 2.8, 0, GEN_POS.x, 0, GEN_POS.z, { material: mat(0xffffff, { map: tex.concrete([2, 2]) }) }));          // generator pad
  add(box(1.6, 0.04, 1.6, 0, -6.3, 0, 6.35, { material: mat(0xffffff, { map: tex.concrete([1, 1]) }) }));                    // A/C pad
  // foundation
  add(box(16.3, 0.12, 10.3, 0x8d8a84, 0, 0, 0));

  // floors
  const rooms = [
    ['Kitchen', -8, -2, -5, 0, tex.tile([6, 5])], ['Living Room', -2, 4, -5, 0, tex.wood([3, 2.5])],
    ['Bedroom', -8, -3, 0, 5, tex.carpet([4, 4])], ['Utility / Laundry', -3, 4, 0, 5, tex.tile([7, 5])],
    ['Garage', 4, 8, -5, 5, tex.concrete([2, 5])],
  ];
  for (const [name, x0, x1, z0, z1, map] of rooms) {
    add(box(x1 - x0, 0.02, z1 - z0, 0, (x0 + x1) / 2, 0.12, (z0 + z1) / 2, { material: new THREE.MeshStandardMaterial({ map, roughness: name === 'Garage' ? 0.9 : 0.55 }) }));
    floorLabel(name, (x0 + x1) / 2, name === 'Garage' ? 3.6 : (z0 + z1) / 2 + (name === 'Living Room' ? 1.2 : 0.3), name.length > 10 ? 0.75 : 0.65);
  }
  const F = 0.14; // finished floor height

  // walls: tall back/left exterior walls (siding outside, drywall inside), low cutaway front/right walls
  const H = 2.7, T = 0.16;
  const sidingM = new THREE.MeshStandardMaterial({ map: tex.siding([10, 2.5]), roughness: 0.8 });
  const sidingSideM = new THREE.MeshStandardMaterial({ map: tex.siding([6, 2.5]), roughness: 0.8 });
  const dryM = new THREE.MeshStandardMaterial({ map: tex.drywall([6, 2]), roughness: 0.9 });
  const trimM = mat(0xf7f7f5, { roughness: 0.5 });
  const capM = mat(0xe9e5de, { roughness: 0.6 });
  function wallX(x0, x1, z, h, inside = 'south') {   // wall running along X at z
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, T), [capM, capM, capM, capM, inside === 'south' ? dryM : sidingM, inside === 'south' ? sidingM : dryM]);
    m.position.set((x0 + x1) / 2, F + h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    const base = box(x1 - x0, 0.1, 0.02, 0, (x0 + x1) / 2, F, z + (inside === 'south' ? T / 2 + 0.01 : -T / 2 - 0.01), { material: trimM }); scene.add(base);
    return m;
  }
  function wallZ(z0, z1, x, h, inside = 'east') {    // wall running along Z at x
    const m = new THREE.Mesh(new THREE.BoxGeometry(T, h, z1 - z0), [inside === 'east' ? dryM : sidingSideM, inside === 'east' ? sidingSideM : dryM, capM, capM, capM, capM]);
    m.position.set(x, F + h / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
    const base = box(0.02, 0.1, z1 - z0, 0, x + (inside === 'east' ? T / 2 + 0.01 : -T / 2 - 0.01), F, (z0 + z1) / 2, { material: trimM }); scene.add(base);
    return m;
  }
  wallX(-8, 8.08, -5, H);                 // back
  wallZ(-5, 5, -8, H);                    // left
  wallX(-8, 4, 5, 0.5, 'north');          // front (house, cut away)
  wallZ(-5, 5, 8.02, 0.5, 'west');        // right (garage, cut away)
  wallZ(-5, 5, 4, 1.2);                   // garage / house
  wallZ(-5, -1.3, -2, 1.1);               // kitchen / living
  wallZ(0, 5, -3, 1.1);                   // bedroom / utility
  wallX(-8, -5.6, 0, 1.1); wallX(-4.6, -3.2, 0, 1.1); wallX(-2.2, 4, 0, 1.1);   // front rooms / back rooms (doorways)
  // windows (frame + glass + sill) on the back and left walls
  const winGlass = [];
  function windowX(x, z, w = 1.5, h = 1.15, y = 1.0) {
    const gm = new THREE.MeshStandardMaterial({ color: 0x9cc4e4, roughness: 0.05, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0, transparent: true, opacity: 0.85 });
    winGlass.push(gm);
    for (const s of [1, -1]) {
      add(box(w + 0.14, h + 0.14, 0.05, 0, x, F + y - 0.07, z + s * (T / 2 + 0.02), { material: trimM }));
      add(box(w, h, 0.02, 0, x, F + y, z + s * (T / 2 + 0.05), { material: gm }));
      add(box(0.04, h, 0.03, 0, x, F + y, z + s * (T / 2 + 0.06), { material: trimM }));
      add(box(w + 0.3, 0.05, 0.12, 0, x, F + y - 0.1, z + s * (T / 2 + 0.06), { material: trimM }));
    }
  }
  function windowZ(x, z, w = 1.3, h = 1.1, y = 1.0) {
    const gm = new THREE.MeshStandardMaterial({ color: 0x9cc4e4, roughness: 0.05, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0, transparent: true, opacity: 0.85 });
    winGlass.push(gm);
    for (const s of [1, -1]) {
      add(box(0.05, h + 0.14, w + 0.14, 0, x + s * (T / 2 + 0.02), F + y - 0.07, z, { material: trimM }));
      add(box(0.02, h, w, 0, x + s * (T / 2 + 0.05), F + y, z, { material: gm }));
      add(box(0.12, 0.05, w + 0.3, 0, x + s * (T / 2 + 0.06), F + y - 0.1, z, { material: trimM }));
    }
  }
  windowX(-3.3, -5, 1.2); windowX(0.2, -5, 1.6); windowX(2.7, -5, 1.0); windowZ(-8, -3.2); windowZ(-8, 3.6, 1.2);

  // ---------- furniture & fixtures ----------
  const wood = mat(0x7a5a3f, { roughness: 0.6 }), woodDark = mat(0x4a3526, { roughness: 0.6 });
  const cabinetM = mat(0xf3f1ec, { roughness: 0.5 }), counterM = mat(0x2c2d30, { roughness: 0.25, metalness: 0.1 });
  const fabric = mat(0x5b6778, { roughness: 0.95 }), fabric2 = mat(0x3f4a58, { roughness: 0.95 });
  // kitchen cabinets + counter + uppers + sink
  add(box(3.3, 0.86, 0.62, 0, -4.35, F, -4.62, { material: cabinetM }));
  add(box(3.36, 0.04, 0.66, 0, -4.35, F + 0.86, -4.6, { material: counterM }));
  for (let i = 0; i < 6; i++) add(box(0.02, 0.6, 0.01, 0, -5.95 + i * 0.55, F + 0.12, -4.305, { material: mat(0xd5d2cc) }));
  add(box(3.3, 0.7, 0.35, 0, -4.35, F + 1.5, -4.78, { material: cabinetM }));
  add(box(0.6, 0.02, 0.4, 0, -3.3, F + 0.905, -4.6, { material: steelM }));
  add(cyl(0.015, 0.3, 0, -3.3, F + 0.9, -4.8, { material: steelM }));
  // dining set
  add(rbox(1.3, 0.05, 0.85, 0.02, 0, -5.4, F + 0.72, -2.1, { material: wood }));
  for (const [x, z] of [[-5.95, -2.45], [-4.85, -2.45], [-5.95, -1.75], [-4.85, -1.75]]) add(cyl(0.025, 0.72, 0, x, F, z, { material: woodDark }));
  for (const [x, z] of [[-5.75, -2.8], [-5.05, -2.8], [-5.75, -1.4], [-5.05, -1.4]]) { add(box(0.42, 0.04, 0.42, 0, x, F + 0.45, z, { material: wood })); add(box(0.42, 0.45, 0.04, 0, x, F + 0.49, z + (z < -2 ? -0.2 : 0.2), { material: wood })); }
  // living room: rug, sofa, coffee table, console, plant
  add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.01, 2.2), new THREE.MeshStandardMaterial({ map: tex.rug(), roughness: 1 }))).position.set(1.0, F + 0.01, -2.3);
  add(rbox(2.3, 0.42, 0.95, 0.08, 0, 1.0, F, -0.85, { material: fabric }));
  add(rbox(2.3, 0.55, 0.22, 0.08, 0, 1.0, F + 0.35, -0.42, { material: fabric }));
  for (const x of [-0.1, 2.1]) add(rbox(0.2, 0.62, 0.95, 0.07, 0, x, F, -0.85, { material: fabric2 }));
  for (const x of [0.45, 1.55]) add(rbox(1.0, 0.16, 0.75, 0.07, 0, x, F + 0.42, -0.9, { material: mat(0x6c788a, { roughness: 0.95 }) }));
  add(rbox(1.2, 0.06, 0.6, 0.02, 0, 1.0, F + 0.4, -2.2, { material: wood }));
  for (const [x, z] of [[0.5, -2.4], [1.5, -2.4], [0.5, -2.0], [1.5, -2.0]]) add(cyl(0.02, 0.4, 0, x, F, z, { material: woodDark }));
  add(rbox(1.9, 0.5, 0.42, 0.02, 0, 1.0, F, -4.68, { material: woodDark }));
  add(cyl(0.16, 0.34, 0xb9a88f, 3.55, F, -4.5)); add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), mat(0x3d6b3a, { flatShading: true }))).position.set(3.55, F + 0.7, -4.5);
  // bedroom: bed, nightstands, dresser, rug
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.01, 1.6), new THREE.MeshStandardMaterial({ map: tex.rug(), roughness: 1 }))).position.set(-5.9, F + 0.01, 2.4);
  add(rbox(1.7, 0.32, 2.1, 0.04, 0, -6.4, F, 3.7, { material: woodDark }));
  add(rbox(1.62, 0.24, 2.0, 0.08, 0, -6.4, F + 0.32, 3.7, { material: mat(0xf4f4f2, { roughness: 0.95 }) }));
  add(rbox(1.66, 0.08, 1.35, 0.04, 0, -6.4, F + 0.53, 3.35, { material: mat(0x2f5f8f, { roughness: 0.95 }) }));
  for (const x of [-6.8, -6.0]) add(rbox(0.6, 0.14, 0.34, 0.07, 0, x, F + 0.56, 4.4, { material: mat(0xffffff, { roughness: 0.95 }) }));
  add(rbox(1.8, 1.0, 0.1, 0.03, 0, -6.4, F, 4.8, { material: woodDark }));
  add(box(0.45, 0.55, 0.4, 0, -7.6, F, 2.35, { material: wood })); add(box(0.45, 0.55, 0.4, 0, -5.2, F, 4.45, { material: wood }));
  add(box(1.1, 0.85, 0.45, 0, -3.7, F, 0.6, { material: wood }));
  // utility: shelving
  add(box(1.0, 1.6, 0.35, 0, 0.8, F, 0.4, { material: mat(0x9aa1a8, { metalness: 0.5, roughness: 0.5 }) }));
  // garage: workbench + shelves
  add(box(1.6, 0.9, 0.6, 0, 7.1, F, -4.6, { material: woodDark })); add(box(1.6, 0.05, 0.62, 0, 7.1, F + 0.9, -4.6, { material: wood }));
  add(box(0.5, 1.8, 1.4, 0, 7.65, F, -2.2, { material: mat(0x5a5f66, { metalness: 0.4, roughness: 0.5 }) }));
  // porch step + front door
  add(box(1.6, 0.14, 0.8, 0x9b9892, 1.2, 0, 5.45));
  add(box(1.0, 0.5, 0.08, 0, 1.2, F, 5.0, { material: mat(0x1f3b5c) }));

  // landscaping
  const leaf = mat(0x3f6e34, { roughness: 0.9, flatShading: true }), leaf2 = mat(0x4d7f3b, { roughness: 0.9, flatShading: true });
  function shrub(x, z, s = 0.5) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), Math.random() > 0.5 ? leaf : leaf2); m.position.set(x, s * 0.7, z); m.castShadow = true; scene.add(m); }
  for (let x = -7.5; x < 0; x += 1.1) shrub(x, 5.7 + (x % 2 ? 0.1 : 0), 0.42);
  for (let x = 2.2; x < 3.8; x += 0.8) shrub(x, 5.7, 0.36);
  function tree(x, z, s = 1) {
    add(cyl(0.16 * s, 2.2 * s, 0x5a4331, x, 0, z));
    for (const [dx, dy, dz, r] of [[0, 3.0, 0, 1.4], [0.6, 2.6, 0.3, 1.0], [-0.5, 2.7, -0.4, 1.0], [0.1, 3.7, 0.1, 0.9]]) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), leaf); m.position.set(x + dx * s, dy * s, z + dz * s); m.castShadow = true; scene.add(m); }
  }
  tree(-11, -7.5, 1.2); tree(-11.5, 6, 1); tree(19, 8, 1.1); tree(3, -9.5, 0.9);
  // back fence
  for (let x = -13; x <= 20; x += 0.25) add(box(0.12, 1.4, 0.03, 0, x, 0, -9, { material: mat(0x9c7b5b) }));
  add(box(33.3, 0.08, 0.06, 0, 3.5, 1.15, -9.03, { material: mat(0x7d6247) })); add(box(33.3, 0.08, 0.06, 0, 3.5, 0.35, -9.03, { material: mat(0x7d6247) }));

  // ---------- appliances ----------
  const appliances = {};   // id -> { group, glows, anim, state }
  const clickables = [];
  function reg(id, group, glows = [], anim = null) {
    group.traverse(o => { if (o.isMesh) { o.userData.applianceId = id; clickables.push(o); } });
    scene.add(group);
    appliances[id] = { group, glows, anim, state: 'off' };
    return appliances[id];
  }
  const G = () => new THREE.Group();
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  const white = mat(0xf2f3f4, { roughness: 0.35 });

  // Kitchen
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(rbox(0.9, 1.82, 0.75, 0.03, 0, -7.35, F, -4.45, { material: steelM }));
    g.add(box(0.005, 1.8, 0.01, 0, -7.35, F + 0.01, -4.07, { material: mat(0x333333) }));
    for (const x of [-7.4, -7.3]) g.add(cyl(0.012, 0.9, 0, x, F + 0.6, -4.03, { material: mat(0x222222, { metalness: 0.8, roughness: 0.3 }) }));
    g.add(box(0.14, 0.2, 0.01, 0, -7.6, F + 1.2, -4.065, { material: s }));
    reg('fridge', g, [s]); }
  { const g = G(); const s = glowMat(0xff3b1d);
    g.add(box(0.76, 0.9, 0.66, 0, -6.35, F, -4.62, { material: steelM }));
    g.add(box(0.76, 0.02, 0.66, 0, -6.35, F + 0.9, -4.62, { material: blackGlassM }));
    g.add(box(0.6, 0.35, 0.01, 0, -6.35, F + 0.35, -4.285, { material: blackGlassM }));
    for (const [dx, dz] of [[-0.18, -0.14], [0.18, -0.14], [-0.18, 0.14], [0.18, 0.14]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 28), s); b.rotation.x = Math.PI / 2; b.position.set(-6.35 + dx, F + 0.925, -4.62 + dz); g.add(b); }
    g.add(box(0.76, 0.12, 0.1, 0, -6.35, F + 0.92, -4.9, { material: steelM }));
    reg('range', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(box(0.6, 0.84, 0.03, 0, -5.55, F + 0.02, -4.3, { material: steelM }));
    g.add(box(0.12, 0.02, 0.01, 0, -5.45, F + 0.78, -4.28, { material: s }));
    reg('dishwasher', g, [s]); }
  { const g = G(); const s = glowMat(0xffc15a);
    g.add(rbox(0.52, 0.3, 0.38, 0.02, 0, -4.9, F + 0.88, -4.62, { material: mat(0x1c1d20, { roughness: 0.3 }) }));
    g.add(box(0.32, 0.2, 0.01, 0, -4.97, F + 0.93, -4.425, { material: s }));
    reg('microwave', g, [s]); }
  { const g = G(); const s = glowMat(0xff5a36);
    g.add(rbox(0.22, 0.36, 0.25, 0.03, 0, -4.2, F + 0.88, -4.7, { material: mat(0x1a1a1a, { roughness: 0.3 }) }));
    g.add(cyl(0.07, 0.13, 0, -4.2, F + 0.9, -4.56, { material: new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.6, roughness: 0.05 }) }));
    g.add(box(0.03, 0.03, 0.01, 0, -4.13, F + 1.18, -4.572, { material: s }));
    reg('coffee', g, [s]); }
  { const g = G(); const s = glowMat(0xff6a00);
    g.add(rbox(0.3, 0.19, 0.17, 0.04, 0, -3.8, F + 0.88, -4.7, { material: steelM }));
    g.add(box(0.2, 0.01, 0.1, 0, -3.8, F + 1.072, -4.7, { material: s }));
    reg('toaster', g, [s]); }

  // Living room
  { const g = G(); const s = glowMat(0x5fb2ff);
    g.add(box(1.6, 0.92, 0.05, 0, 1.0, F + 0.95, -4.84, { material: blackGlassM }));
    g.add(box(1.52, 0.84, 0.01, 0, 1.0, F + 0.99, -4.81, { material: s }));
    reg('tv', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(rbox(0.28, 0.05, 0.18, 0.02, 0, 1.75, F + 0.5, -4.62, { material: mat(0xf5f5f5) }));
    for (let i = 0; i < 4; i++) g.add(box(0.015, 0.01, 0.01, 0, 1.66 + i * 0.05, F + 0.53, -4.53, { material: s }));
    g.add(rbox(0.07, 0.01, 0.14, 0.01, 0, 0.3, F + 0.5, -4.6, { material: mat(0x111111) }));
    g.add(rbox(0.32, 0.015, 0.22, 0.01, 0, 0.6, F + 0.5, -4.62, { material: mat(0xb6bcc4, { metalness: 0.7, roughness: 0.3 }) }));
    reg('internet', g, [s], (t, on) => { s.emissiveIntensity = on ? (Math.sin(t * 9) > 0 ? 2 : 0.6) : 0; }); }
  { const g = G(); const s = glowMat(0xff4d1a);
    g.add(rbox(0.3, 0.55, 0.2, 0.05, 0, -1.4, F, -2.6, { material: mat(0xe7e3dc) }));
    g.add(box(0.22, 0.3, 0.01, 0, -1.4, F + 0.14, -2.495, { material: s }));
    reg('spaceheater', g, [s]); }
  { const g = G(); const s = glowMat(0xff2d2d);
    g.add(box(0.18, 0.24, 0.03, 0, 3.4, F + 1.3, -4.9, { material: mat(0xf2f2f2) }));
    g.add(box(0.05, 0.05, 0.01, 0, 3.4, F + 1.45, -4.88, { material: s }));
    g.add(rbox(0.14, 0.1, 0.12, 0.03, 0, 7.8, F + 2.3, 4.8, { material: white }));
    g.add(box(0.02, 0.02, 0.02, 0, 7.8, F + 2.33, 4.87, { material: s }));
    g.add(rbox(0.14, 0.1, 0.12, 0.03, 0, -7.8, F + 2.3, -4.8, { material: white }));
    reg('security', g, [s], (t, on) => { s.emissiveIntensity = on ? (Math.sin(t * 3) > 0.3 ? 2 : 0.3) : 0; }); }
  function pedestalFan(x, z) {
    const g = G(); g.add(cyl(0.18, 0.03, 0x2a2a2a, x, F, z)); g.add(cyl(0.02, 1.0, 0x2a2a2a, x, F, z));
    const head = new THREE.Group(); head.position.set(x, F + 1.12, z);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.01, 8, 32), mat(0x3a3a3a)); head.add(cage);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.01), mat(0xdfe6ee)); b.position.x = 0.1; const p = new THREE.Group(); p.rotation.z = i * Math.PI * 2 / 3; p.add(b); blades.add(p); }
    head.add(blades); head.rotation.y = -0.6; g.add(head); return { g, blades };
  }
  { const f1 = pedestalFan(-1.3, -1.0), f2 = pedestalFan(-4.3, 1.9); const g = G(); g.add(f1.g, f2.g);
    reg('fans', g, [], (t, on, dt) => { const s = on ? dt * 14 : 0; f1.blades.rotation.z += s; f2.blades.rotation.z += s; }); }

  // Bedroom
  { const g = G(); const s = glowMat(0x4aa8ff);
    g.add(rbox(0.3, 0.14, 0.22, 0.03, 0, -7.6, F + 0.55, 2.35, { material: mat(0x8f99a4) }));
    g.add(box(0.1, 0.03, 0.01, 0, -7.6, F + 0.63, 2.465, { material: s }));
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 8, 24, Math.PI), mat(0xaec3d9)); hose.position.set(-7.25, F + 0.72, 2.8); hose.rotation.y = Math.PI / 2; g.add(hose);
    reg('cpap', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(rbox(0.4, 0.68, 0.34, 0.05, 0, -4.6, F, 4.4, { material: mat(0xeef2f6) }));
    g.add(box(0.2, 0.06, 0.01, 0, -4.6, F + 0.52, 4.225, { material: s }));
    reg('oxygen', g, [s]); }
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(rbox(0.6, 0.42, 0.7, 0.03, 0, -8.15, F + 1.0, 1.2, { material: mat(0xe2e2e2) }));
    g.add(box(0.01, 0.3, 0.52, 0, -7.84, F + 1.06, 1.2, { material: s }));
    reg('windowac', g, [s]); }
  { const g = G(); const s = glowMat(0xff6a00);
    g.add(rbox(0.1, 0.22, 0.26, 0.04, 0, -3.7, F + 0.85, 0.6, { material: mat(0x6c4cc2, { roughness: 0.4 }) }));
    g.add(box(0.02, 0.06, 0.06, 0, -3.7, F + 0.95, 0.46, { material: s }));
    reg('hairdryer', g, [s]); }

  // Utility / laundry
  function frontLoader(id, x, color, glowColor) {
    const g = G(); const s = glowMat(glowColor);
    g.add(rbox(0.68, 0.9, 0.68, 0.03, 0, x, F, 4.5, { material: mat(color, { roughness: 0.35 }) }));
    const door = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 32), steelM); door.position.set(x, F + 0.47, 4.155); g.add(door);
    const drum = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), s); drum.position.set(x, F + 0.47, 4.152); drum.rotation.y = Math.PI; g.add(drum);
    g.add(box(0.5, 0.08, 0.01, 0, x, F + 0.78, 4.155, { material: blackGlassM }));
    return reg(id, g, [s], (t, on, dt) => { if (on) drum.rotation.z += dt * 6; });
  }
  frontLoader('washer', -2.4, 0xf5f6f7, 0x7cd4ff);
  frontLoader('gasdryer', -1.6, 0xeceef0, 0xffa040);
  frontLoader('elecdryer', -0.8, 0xe4e6e9, 0xff6a00);
  { const g = G(); const s = glowMat(0xff6a00);
    g.add(cyl(0.3, 1.45, 0, 0.35, F, 4.45, { material: mat(0xeef0f2, { roughness: 0.4 }) }));
    g.add(box(0.12, 0.08, 0.01, 0, 0.35, F + 0.85, 4.14, { material: s }));
    reg('waterheater', g, [s]); }
  { const g = G(); const s = glowMat(0x4aa8ff);
    g.add(rbox(0.62, 1.4, 0.72, 0.03, 0, 1.35, F, 4.45, { material: mat(0xc9cdd1, { roughness: 0.45 }) }));
    g.add(box(0.3, 0.04, 0.01, 0, 1.35, F + 0.5, 4.085, { material: s }));
    g.add(cyl(0.08, 1.1, 0, 1.35, F + 1.4, 4.6, { material: steelM }));
    reg('furnace', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(cyl(0.28, 0.03, 0x333333, 2.45, F, 4.35)); g.add(cyl(0.035, 0.9, 0x333333, 2.45, F, 4.35));
    g.add(box(0.1, 0.1, 0.06, 0, 2.45, F + 0.78, 4.33, { material: s }));
    reg('sump', g, [s]); }
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(cyl(0.26, 0.95, 0, 3.4, F, 4.4, { material: mat(0x2d6cb5, { roughness: 0.35 }) }));
    g.add(box(0.18, 0.2, 0.08, 0, 3.4, F + 0.98, 4.4, { material: mat(0x777777) }));
    g.add(box(0.06, 0.04, 0.01, 0, 3.4, F + 1.1, 4.355, { material: s }));
    reg('well', g, [s]); }
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(rbox(1.2, 0.85, 0.7, 0.03, 0, 2.8, F, 1.2, { material: white }));
    g.add(box(0.12, 0.03, 0.01, 0, 3.25, F + 0.72, 0.845, { material: s }));
    reg('freezer', g, [s]); }
  { const g = G(); const s = glowMat(0x7cd4ff);
    g.add(rbox(0.36, 0.6, 0.26, 0.04, 0, -0.3, F, 1.0, { material: white }));
    g.add(box(0.2, 0.04, 0.01, 0, -0.3, F + 0.48, 0.865, { material: s }));
    reg('dehumidifier', g, [s]); }
  { const g = G(); const s = glowMat(0xff2d2d);
    for (const [x, z, face] of [[0.5, -4.9, 1], [-6.4, -4.9, 1], [-2.0, 4.85, -1]]) { const d = cyl(0.08, 0.03, 0, x, F + 2.4, z, { material: white }); d.rotation.x = Math.PI / 2; g.add(d); const l = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), s); l.position.set(x, F + 2.415, z + face * 0.03); g.add(l); }
    reg('smoke', g, [s], (t, on) => { s.emissiveIntensity = on ? (Math.sin(t * 2) > 0.85 ? 3 : 0.4) : 0; }); }

  // Garage: sectional door, wall-mount opener, EV + chargers
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 0.06), new THREE.MeshStandardMaterial({ map: tex.garageDoor(), roughness: 0.5 }));
  door.castShadow = true; door.position.set(6, F + 1.1, 5.02); scene.add(door);
  let doorOpen = 0;
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(rbox(0.22, 0.28, 0.18, 0.03, 0, 7.82, F + 2.1, 4.75, { material: mat(0x3b3f45) }));
    g.add(box(0.01, 0.03, 0.06, 0, 7.705, F + 2.3, 4.75, { material: s }));
    g.add(box(0.04, 0.04, 0.5, 0, 7.82, F + 2.24, 4.8, { material: mat(0x888888) }));
    reg('garagedoor', g, [s], (t, on, dt) => {
      doorOpen += ((on ? 1 : 0) - doorOpen) * Math.min(1, dt * 1.4);
      door.position.y = F + 1.1 + doorOpen * 1.25; door.position.z = 5.02 - doorOpen * 1.1; door.rotation.x = -doorOpen * Math.PI / 2 * 0.98;
    }); }
  const ev = buildEV({ color: 0xf2f2ee });
  ev.group.rotation.y = Math.PI / 2; ev.group.position.set(5.75, F, -0.4); scene.add(ev.group);
  const cableM = mat(0x1a1a1a);
  const portWorld = ev.portPos.clone(); ev.group.localToWorld(portWorld);
  { const g = G(); const s = glowMat(0x3dff8a);   // Level 1: mobile connector plugged into a 120V outlet
    g.add(rbox(0.12, 0.2, 0.06, 0.02, 0, 7.88, F + 0.5, 1.9, { material: mat(0xf1f1f1) }));
    g.add(box(0.01, 0.03, 0.03, 0, 7.845, F + 0.6, 1.9, { material: s }));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(7.85, F + 0.55, 1.9), new THREE.Vector3(7.3, F + 0.05, 1.95), new THREE.Vector3(portWorld.x + 0.1, F + 0.3, portWorld.z), portWorld]), 40, 0.018, 6), cableM));
    reg('ev', g, [s, ev.port], (t, on) => { s.emissiveIntensity = on ? 1 + Math.sin(t * 2.5) : 0; ev.port.emissiveIntensity = on ? 1.2 + Math.sin(t * 2.5) : 0; }); }
  { const g = G(); const s = glowMat(0x4aa8ff);    // Level 2: 240V wall connector
    g.add(rbox(0.1, 0.36, 0.24, 0.04, 0, 7.9, F + 1.0, 0.3, { material: mat(0xf4f4f4, { roughness: 0.3 }) }));
    g.add(box(0.01, 0.2, 0.02, 0, 7.845, F + 1.08, 0.3, { material: s }));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(7.85, F + 1.0, 0.3), new THREE.Vector3(7.5, F + 0.4, 0.8), new THREE.Vector3(7.2, F + 0.9, 1.4)]), 30, 0.02, 6), cableM));
    reg('ev2', g, [s], (t, on) => { s.emissiveIntensity = on ? 1.2 + Math.sin(t * 3) * 0.8 : 0; if (on) ev.port.emissiveIntensity = 1.2 + Math.sin(t * 3); }); }

  // Outdoor central A/C (+ optional AirGo soft starter)
  let acFan, softBox;
  { const g = G(); const s = glowMat(0x3dff8a);
    g.add(rbox(0.95, 0.85, 0.95, 0.04, 0, -6.3, 0.04, 6.35, { material: mat(0xd8dadc, { roughness: 0.5 }) }));
    const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 32), mat(0x2b2b2b)); grille.position.set(-6.3, 0.9, 6.35); g.add(grille);
    acFan = new THREE.Group(); acFan.position.set(-6.3, 0.93, 6.35);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.14), mat(0x111111)); const p = new THREE.Group(); p.rotation.y = i * Math.PI * 2 / 3; b.position.x = 0.18; p.add(b); acFan.add(p); }
    g.add(acFan);
    g.add(box(0.06, 0.06, 0.01, 0, -6.05, 0.6, 6.83, { material: s }));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-6.3, 0.4, 5.88), new THREE.Vector3(-6.3, 0.4, 5.3), new THREE.Vector3(-6.3, 0.8, 5.1)]), 20, 0.03, 6), mat(0x222222)));
    softBox = rbox(0.16, 0.24, 0.1, 0.02, 0, -5.8, 0.35, 6.35, { material: mat(0xffffff, { roughness: 0.3 }) }); softBox.visible = false; g.add(softBox);
    reg('centralac', g, [s], (t, on, dt) => { if (on) acFan.rotation.y += dt * 12; }); }

  // LED lights: 10 fixtures (sconces, lamps, pendant, porch light)
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff7e0, emissive: 0xffe2a8, emissiveIntensity: 0 });
  const shadeM = mat(0xf3eadb, { roughness: 0.9, side: THREE.DoubleSide });
  const bulbLights = [];
  { const g = G();
    const fixtures = [
      ['sconce', -6.9, 1.9, -4.9], ['pendant', -5.4, 1.75, -2.1], ['floor', 2.55, 0, -0.9], ['table', -0.3, 0.55, -4.65],
      ['table', -7.6, 0.69, 2.35], ['table', -5.2, 0.69, 4.45], ['sconce', 1.8, 1.9, 4.9], ['sconce', 3.4, 1.9, -0.05],
      ['sconce', 6.0, 2.1, -4.9], ['porch', 1.9, 1.6, 5.1]];
    for (const [type, x, y, z] of fixtures) {
      const fy = F + y; let by = fy;
      if (type === 'floor') { g.add(cyl(0.12, 0.02, 0x222222, x, F, z)); g.add(cyl(0.012, 1.4, 0x222222, x, F, z)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.25, 20, 1, true), shadeM), x, F + 1.5, z)); by = F + 1.45; }
      else if (type === 'table') { g.add(cyl(0.05, 0.25, 0x6b5a4a, x, fy, z)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 20, 1, true), shadeM), x, fy + 0.32, z)); by = fy + 0.3; }
      else if (type === 'pendant') { g.add(cyl(0.005, 0.8, 0x222222, x, fy + 0.2, z)); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 24, 1, true), mat(0x222222, { side: THREE.DoubleSide })), x, fy + 0.15, z)); by = fy + 0.08; }
      else { const zSign = z > 0 ? -1 : 1; g.add(box(0.1, 0.18, 0.06, 0, x, fy - 0.09, z, { material: mat(0x2a2a2a) })); by = fy; void zSign; }
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), bulbMat); b.position.set(x, by, z); g.add(b);
      const l = new THREE.PointLight(0xffd7a0, 0, 6.5, 1.8); l.position.set(x, by, z); scene.add(l); bulbLights.push(l);
    }
    reg('lights', g, [bulbMat]); }

  // ---------- generator, cord, inlet, panel, transfer switch ----------
  let gen = null, genBase = GEN_POS.clone(), genBody = null, genLed = null;
  const genGroup = new THREE.Group(); scene.add(genGroup);
  const genLabel = sprite('Generator'); scene.add(genLabel);
  const cordM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, emissive: 0xffcc33, emissiveIntensity: 0 });
  let cordMesh = null;
  function setGeneratorModel(g) {
    if (gen && gen.model === g.model) return;
    gen = g;
    // free the previous model's GPU memory (shared canvas textures are cached and kept)
    genGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    genGroup.clear();
    const built = buildGenerator(g);
    genBody = built.group; genLed = built.led;
    genGroup.add(genBody);
    genGroup.position.copy(genBase);
    genLabel.position.set(genBase.x, built.size.H + 0.75, genBase.z);
    genLabel.userData.set(g.model);
    // cord from the panel end of the generator to the inlet box on the garage wall
    if (cordMesh) { scene.remove(cordMesh); cordMesh.geometry.dispose(); }
    const start = new THREE.Vector3(genBase.x + built.size.L * 0.2, built.size.H * 0.45, genBase.z + built.size.W / 2);
    cordMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, new THREE.Vector3(start.x - 0.4, 0.06, start.z + 0.5), new THREE.Vector3(11.5, 0.05, -2.6), new THREE.Vector3(9.2, 0.05, -3.3), new THREE.Vector3(8.5, 0.1, -3.5), INLET_POS]), 80, 0.03, 8), cordM);
    cordMesh.castShadow = true; scene.add(cordMesh);
  }
  // inlet box on the garage exterior (right) wall
  const inlet = rbox(0.14, 0.34, 0.28, 0.02, 0, 8.14, 0.45, -3.5, { material: mat(0x8e959c, { metalness: 0.5, roughness: 0.4 }) }); scene.add(inlet);
  // conduit inside the garage, up the right wall and along the back wall to the panel
  const conduitM = new THREE.MeshStandardMaterial({ color: 0x8a8f95, metalness: 0.6, roughness: 0.4, emissive: 0xffcc33, emissiveIntensity: 0 });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(7.93, 0.6, -3.5), new THREE.Vector3(7.9, 2.3, -3.6), new THREE.Vector3(7.8, 2.4, -4.85), new THREE.Vector3(5.4, 2.4, -4.86), new THREE.Vector3(5.0, 2.1, -4.86)], false, 'catmullrom', 0.05), 60, 0.025, 6), conduitM));
  // breaker panel on the garage back wall
  const panel = rbox(0.55, 0.9, 0.12, 0.02, 0, 5.0, F + 1.0, -4.85, { material: mat(0x7d858e, { metalness: 0.5, roughness: 0.4 }) }); scene.add(panel);
  const panelLedM = glowMat(0x3dff8a);
  scene.add(box(0.05, 0.05, 0.01, 0, 5.2, F + 1.8, -4.785, { material: panelLedM }));
  for (let i = 0; i < 8; i++) for (const dx of [-0.08, 0.08]) scene.add(box(0.11, 0.035, 0.01, 0, 5.0 + dx, F + 1.18 + i * 0.07, -4.785, { material: mat(0x222222) }));
  const interlockPlate = box(0.26, 0.2, 0.01, 0, 5.0, F + 1.72, -4.782, { material: mat(0xf26b1d, { emissive: 0x401800 }) }); scene.add(interlockPlate);
  const tsBox = rbox(0.45, 0.6, 0.12, 0.02, 0, 5.75, F + 1.15, -4.85, { material: mat(0x5d6670, { metalness: 0.4, roughness: 0.45 }) }); scene.add(tsBox);
  const panelLabel = sprite('Breaker panel'); panelLabel.scale.set(3.0, 0.56, 1); panelLabel.position.set(5.3, 3.1, -4.6); scene.add(panelLabel);
  const acLabel = sprite('Central A/C'); acLabel.scale.set(2.8, 0.52, 1); acLabel.position.set(-6.3, 1.7, 6.35); scene.add(acLabel);

  // exhaust puffs
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(200,200,200,.5)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const puffs = Array.from({ length: 8 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.t = i / 8; scene.add(s); return s; });

  // ---------- state setters ----------
  let genRunning = false, genLoad = 0, night = true, tripped = false;
  function setApplianceState(id, state) {        // 'off' | 'on' | 'dead'
    const a = appliances[id]; if (!a) return; a.state = state;
    for (const m of a.glows) m.emissiveIntensity = state === 'on' ? (id === 'lights' ? 3 : 1.6) : 0;
    if (id === 'lights') {
      bulbLights.forEach(l => { l.intensity = state === 'on' ? (night ? 4.5 : 1.2) : 0; });
      winGlass.forEach(m => { m.emissiveIntensity = state === 'on' && night ? 0.55 : 0; });
    }
  }
  function setGenerator({ running, load, isTripped }) {
    genRunning = running; genLoad = load; tripped = isTripped;
    if (genLed) { genLed.emissive.setHex(isTripped ? 0xff3030 : 0x3dff8a); genLed.emissiveIntensity = running || isTripped ? 2.5 : 0; }
    const live = running && !isTripped && load > 0;
    cordM.emissiveIntensity = live ? 0.55 : 0; conduitM.emissiveIntensity = live ? 0.35 : 0;
    panelLedM.emissive.setHex(isTripped ? 0xff3030 : 0x3dff8a); panelLedM.emissiveIntensity = running || isTripped ? 2 : 0;
  }
  function setConnection(mode) {
    interlockPlate.visible = mode === 'interlock';
    tsBox.visible = mode === 'transfer';
    inlet.visible = mode !== 'cords';
    if (cordMesh) cordMesh.visible = mode !== 'cords';
  }
  function setSoftStarter(on) { softBox.visible = on; }
  function setNight(n) {
    night = n;
    const sky = n ? 0x0a1224 : 0xbcd6ee;
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 45, 110);
    scene.environment = n ? null : envDay;
    hemi.intensity = n ? 0.35 : 0.6; hemi.color.setHex(n ? 0x7084c0 : 0xdfe8ff);
    sun.intensity = n ? 0.35 : 2.2; sun.color.setHex(n ? 0xa9bcff : 0xfff4e5);
    renderer.toneMappingExposure = n ? 1.25 : 1.05;
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
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const id = pick(e); if (id && onClick) onClick(id);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const id = pick(e);
    renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    hoverId = id; onHover && onHover(id, e);
  });
  renderer.domElement.addEventListener('pointerleave', () => { hoverId = null; onHover && onHover(null); });

  // ---------- loop ----------
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 0.9 ? 60 : 40; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container); resize();

  // Graphics context loss (GPU reset, driver hiccup, too many tabs): show a message instead of a blank view.
  let lost = false;
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true;
    if (!container.querySelector('.gl-fallback')) {
      const d = document.createElement('div'); d.className = 'gl-fallback';
      d.innerHTML = '<strong>3D view paused</strong><span>Your browser reset its graphics. Your settings are safe - reload to bring the 3D home back.</span><button class="btn btn-primary" type="button">Reload 3D view</button>';
      d.querySelector('button').onclick = () => location.reload();
      container.appendChild(d);
    }
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => { lost = false; const d = container.querySelector('.gl-fallback'); if (d) d.remove(); });

  // Adaptive quality: if frames are slow for a few seconds, drop resolution, then soft shadows.
  let slowFrames = 0, quality = 2;
  function adapt(dt) {
    if (quality === 0) return;
    slowFrames = dt > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 90) {
      slowFrames = 0; quality -= 1;
      if (quality === 1) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); }
      else { renderer.shadowMap.type = THREE.BasicShadowMap; sun.shadow.mapSize.set(1024, 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    }
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (lost) return;
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05), t = clock.elapsedTime;
    if (document.visibilityState === 'visible') adapt(raw);
    for (const id in appliances) { const a = appliances[id]; if (a.anim) a.anim(t, a.state === 'on', dt); }
    const running = genRunning && !tripped;
    if (genBody) {
      const amp = running ? 0.0015 + genLoad * 0.004 : 0;
      genBody.position.set(Math.sin(t * 55) * amp, Math.abs(Math.sin(t * 43)) * amp * 0.5, Math.cos(t * 47) * amp);
    }
    for (const p of puffs) {
      p.userData.t = (p.userData.t + dt * 0.35) % 1; const k = p.userData.t;
      p.position.set(genBase.x - 0.55 - k * 0.3, 0.7 + k * 1.4, genBase.z - 0.1 + Math.sin(k * 6 + t) * 0.1);
      p.scale.setScalar(0.25 + k * 0.9); p.material.opacity = running ? (1 - k) * (0.25 + genLoad * 0.35) : 0;
    }
    if (viewAnim) {
      viewAnim.t = Math.min(1, viewAnim.t + dt * 1.3); const k = 1 - Math.pow(1 - viewAnim.t, 3);
      camera.position.lerpVectors(viewAnim.fromP, viewAnim.toP, k); controls.target.lerpVectors(viewAnim.fromT, viewAnim.toT, k);
      if (viewAnim.t >= 1) viewAnim = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return { setApplianceState, setGenerator, setGeneratorModel, setConnection, setSoftStarter, setNight, setView, ids: Object.keys(appliances) };
}
