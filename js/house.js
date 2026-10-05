// 3D cutaway home for the Home Backup Power Simulator (Three.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, roundRect } from './textures.js?v=3.0';
import { buildGenerator } from './models/generator.js?v=3.0';
import { buildEV } from './models/ev.js?v=3.0';

const GEN_POS = new THREE.Vector3(14.2, 0.02, -3.2);
const INLET_POS = new THREE.Vector3(8.1, 0.62, -3.5);

export function createHouse(container, { onClick, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  window.__renderer = renderer;   // for testing (draw-call, memory and click checks)
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
    exterior: { pos: [-12, 13, 41], target: [1.5, 1.4, 0] },     // street view: roof and walls shown
  };
  let viewAnim = null;
  function setView(name, instant) {
    const v = VIEWS[name] || VIEWS.home;
    // portrait phones: move in closer so the house fills the narrow view (exterior stays far enough to show the roof)
    const k = camera.aspect < 0.9 ? ({ home: 0.8, garage: 0.9, exterior: 0.96 }[name] || 1) : 1;
    const toT = new THREE.Vector3(...v.target), toP = new THREE.Vector3(...v.pos).sub(toT).multiplyScalar(k).add(toT);
    if (instant) { camera.position.copy(toP); controls.target.copy(toT); controls.update(); return; }
    viewAnim = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP, toT };
  }
  setView('exterior', true);   // arrive at the street view, then glide into the cutaway (see the end of createHouse)

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
  // Static meshes go into S and are merged by material at the end (hundreds of draw calls -> a few dozen).
  const S = new THREE.Group();
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
  function add(...o) { o.forEach(x => S.add(x)); return o[0]; }
  function sliceGeom(g, start, count) {
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) out.setAttribute(name, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
    return out;
  }
  /** Bake a group of static meshes into one mesh per material (and shadow setting). Returns the new meshes. */
  function mergeStatic(root, target = scene) {
    root.updateMatrixWorld(true);
    const buckets = new Map();
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const put = (m, geo) => {
        const wu = m.userData.worldUV;
        if (wu) {   // planar world UVs: u along the wall, v up
          const P = geo.attributes.position, N = geo.attributes.normal, uv = new Float32Array(P.count * 2);
          for (let i = 0; i < P.count; i++) { const alongX = Math.abs(N.getZ(i)) >= Math.abs(N.getX(i)); uv[i * 2] = (alongX ? P.getX(i) : P.getZ(i)) * wu[0]; uv[i * 2 + 1] = P.getY(i) * wu[1]; }
          geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
        const k = m.uuid + (o.castShadow ? 's' : ''); if (!buckets.has(k)) buckets.set(k, { m, cast: o.castShadow, list: [] }); buckets.get(k).list.push(geo); };
      if (Array.isArray(o.material)) for (const grp of g.groups) put(o.material[grp.materialIndex], sliceGeom(g, grp.start, grp.count));
      else { g.clearGroups(); put(o.material, g); }
      o.geometry.dispose();
    });
    const out = [];
    for (const { m, cast, list } of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.castShadow = cast; mesh.receiveShadow = !m.transparent; mesh.renderOrder = m.transparent ? 1 : 0;
      target.add(mesh); out.push(mesh); list.forEach(x => x.dispose());
    }
    return out;
  }
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: tex.lawn([34, 34]), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  add(box(4.4, 0.03, 12, 0, 6, 0, 11, { material: mat(0xffffff, { map: tex.concrete([2, 6]), roughness: 0.9, color: 0xd8d6d0 }) }));   // driveway
  add(box(1.4, 0.03, 7, 0, 1.2, 0, 8.5, { material: mat(0xffffff, { map: tex.pavers([1, 5]) }) }));                                 // front walk
  add(box(3.6, 0.04, 2.8, 0, GEN_POS.x, 0, GEN_POS.z, { material: mat(0xffffff, { map: tex.concrete([2, 2]) }) }));              // generator pad
  add(box(1.6, 0.04, 1.6, 0, -6.3, 0, 6.35, { material: mat(0xffffff, { map: tex.concrete([1, 1]) }) }));                        // A/C pad
  // foundation
  add(box(16.3, 0.12, 10.3, 0x6f6c66, 0, 0, 0));
  // mulch beds along the front of the house
  add(box(7.7, 0.035, 1.1, 0, -4.15, 0, 5.75, { material: mat(0xffffff, { map: tex.mulch([6, 1]), roughness: 1 }) }));
  add(box(1.9, 0.035, 1.1, 0, 2.95, 0, 5.75, { material: mat(0xffffff, { map: tex.mulch([2, 1]), roughness: 1 }) }));

  // floors
  const rooms = [
    ['Kitchen', -8, -2, -5, 0, tex.tile([6, 5])], ['Living Room', -2, 4, -5, 0, tex.oak([2.4, 2])],
    ['Bedroom', -8, -3, 0, 5, tex.carpet([4, 4])], ['Utility / Laundry', -3, 4, 0, 5, tex.tile([7, 5])],
    ['Garage', 4, 8, -5, 5, tex.concrete([2, 5])],
  ];
  for (const [name, x0, x1, z0, z1, map] of rooms) {
    add(box(x1 - x0, 0.02, z1 - z0, 0, (x0 + x1) / 2, 0.12, (z0 + z1) / 2, { material: new THREE.MeshStandardMaterial({ map, roughness: name === 'Garage' ? 0.9 : 0.5 }) }));
    floorLabel(name, (x0 + x1) / 2, name === 'Garage' ? 3.6 : (z0 + z1) / 2 + (name === 'Living Room' ? 1.2 : 0.3), name.length > 10 ? 0.75 : 0.65);
  }
  const F = 0.14; // finished floor height

  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff7e0, emissive: 0xffe2a8, emissiveIntensity: 0 });

  // ---------- baked ambient occlusion (soft contact shadows): transparent decals, merged into one draw ----------
  const AO = new THREE.Group();
  const aoBlobM = new THREE.MeshBasicMaterial({ map: tex.ao(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const aoEdgeM = new THREE.MeshBasicMaterial({ map: tex.aoEdge(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  function aoPlane(m, w, d, x, y, z, rotY = 0) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.set(-Math.PI / 2, 0, rotY); p.position.set(x, y, z); AO.add(p); return p; }
  function aoBlob(x, z, w, d, y = 0.141) { aoPlane(aoBlobM, w * 1.35, d * 1.35, x, y, z); }
  // edge strips darken the floor where it meets a wall (dark at the wall, fading into the room)
  function aoEdgeX(x0, x1, z, dir) { const p = aoPlane(aoEdgeM, x1 - x0, 0.45, (x0 + x1) / 2, 0.142, z + dir * 0.225); if (dir < 0) p.rotation.z = Math.PI; }
  function aoEdgeZ(z0, z1, x, dir) { const p = aoPlane(aoEdgeM, z1 - z0, 0.45, x + dir * 0.225, 0.142, (z0 + z1) / 2, dir > 0 ? Math.PI / 2 : -Math.PI / 2); }

  // walls: tall back/left exterior walls (siding outside, drywall inside), low cutaway front/right walls
  const H = 2.7, T = 0.16;
  // siding uses world-space UVs (set while baking) so the boards line up across every wall piece
  const sidingM = new THREE.MeshStandardMaterial({ map: tex.boardBatten([1, 1]), roughness: 0.75 });
  sidingM.userData.worldUV = [1 / 3.2, 1 / 2.7];
  const sidingSideM = sidingM;
  const dryM = new THREE.MeshStandardMaterial({ map: tex.drywall([6, 2]), roughness: 0.9 });
  const trimM = mat(0xf7f7f5, { roughness: 0.5 });
  const capM = mat(0x2e3238, { roughness: 0.8 });                 // architectural "section cut" on wall tops
  const frameM = mat(0x1d1f22, { roughness: 0.45, metalness: 0.2 });   // black window frames
  function wallX(x0, x1, z, h, inside = 'south') {   // wall running along X at z
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, T), [capM, capM, capM, capM, inside === 'south' ? dryM : sidingM, inside === 'south' ? sidingM : dryM]);
    m.position.set((x0 + x1) / 2, F + h / 2, z); m.castShadow = m.receiveShadow = true; S.add(m);
    add(box(x1 - x0, 0.1, 0.02, 0, (x0 + x1) / 2, F, z + (inside === 'south' ? T / 2 + 0.01 : -T / 2 - 0.01), { material: trimM }));
    aoEdgeX(x0, x1, z + (inside === 'south' ? T / 2 : -T / 2), inside === 'south' ? 1 : -1);
    return m;
  }
  function wallZ(z0, z1, x, h, inside = 'east') {    // wall running along Z at x
    const m = new THREE.Mesh(new THREE.BoxGeometry(T, h, z1 - z0), [inside === 'east' ? dryM : sidingSideM, inside === 'east' ? sidingSideM : dryM, capM, capM, capM, capM]);
    m.position.set(x, F + h / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; S.add(m);
    add(box(0.02, 0.1, z1 - z0, 0, x + (inside === 'east' ? T / 2 + 0.01 : -T / 2 - 0.01), F, (z0 + z1) / 2, { material: trimM }));
    aoEdgeZ(z0, z1, x + (inside === 'east' ? T / 2 : -T / 2), inside === 'east' ? 1 : -1);
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
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9cc4e4, roughness: 0.05, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0, transparent: true, opacity: 0.8 });
  winGlass.push(glassM);
  function windowX(x, z, w = 1.5, h = 1.15, y = 1.0) {
    for (const s of [1, -1]) {
      add(box(w + 0.1, h + 0.1, 0.05, 0, x, F + y - 0.05, z + s * (T / 2 + 0.02), { material: frameM }));
      add(box(w, h, 0.02, 0, x, F + y, z + s * (T / 2 + 0.05), { material: glassM }));
      add(box(0.035, h, 0.03, 0, x, F + y, z + s * (T / 2 + 0.06), { material: frameM }));
      add(box(w + 0.16, 0.04, 0.1, 0, x, F + y - 0.09, z + s * (T / 2 + 0.05), { material: s > 0 ? trimM : frameM }));
    }
  }
  function windowZ(x, z, w = 1.3, h = 1.1, y = 1.0) {
    for (const s of [1, -1]) {
      add(box(0.05, h + 0.1, w + 0.1, 0, x + s * (T / 2 + 0.02), F + y - 0.05, z, { material: frameM }));
      add(box(0.02, h, w, 0, x + s * (T / 2 + 0.05), F + y, z, { material: glassM }));
      add(box(0.03, h, 0.035, 0, x + s * (T / 2 + 0.06), F + y, z, { material: frameM }));
      add(box(0.1, 0.04, w + 0.16, 0, x + s * (T / 2 + 0.05), F + y - 0.09, z, { material: s > 0 ? trimM : frameM }));
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
  // ---- model-home details ----
  // kitchen: subway backsplash, toe kick, cabinet pulls, upper-cabinet doors, range hood
  { const bs = new THREE.Mesh(new THREE.PlaneGeometry(4.05, 0.6), new THREE.MeshStandardMaterial({ map: tex.subway([7, 1.5]), roughness: 0.3 }));
    bs.position.set(-4.72, F + 1.2, -4.915); add(bs);
    add(box(3.3, 0.1, 0.02, 0, -4.35, F, -4.3, { material: mat(0x2b2b2b) }));
    const pullM = mat(0x1d1f22, { metalness: 0.6, roughness: 0.35 });
    for (let i = 0; i < 6; i++) { add(box(0.14, 0.014, 0.02, 0, -5.7 + i * 0.55, F + 0.74, -4.29, { material: pullM })); add(box(0.014, 0.12, 0.02, 0, -5.7 + i * 0.55, F + 1.55, -4.6, { material: pullM })); }
    for (let i = 0; i < 6; i++) add(box(0.01, 0.66, 0.005, 0, -5.95 + i * 0.55, F + 1.52, -4.603, { material: mat(0xd5d2cc) }));
    add(rbox(0.8, 0.22, 0.5, 0.03, 0, -6.35, F + 1.6, -4.72, { material: steelM }));
    add(box(0.3, 0.5, 0.25, 0, -6.35, F + 1.82, -4.8, { material: steelM })); }
  // living room: armchair, side table, wall art, plants, throw pillows
  { const chairM = mat(0xc8b9a3, { roughness: 0.95 });
    add(rbox(0.85, 0.4, 0.8, 0.08, 0, 3.15, F, -2.3, { material: chairM })); add(rbox(0.85, 0.5, 0.18, 0.07, 0, 3.15, F + 0.32, -1.98, { material: chairM }));
    for (const dx of [-0.36, 0.36]) add(rbox(0.14, 0.55, 0.8, 0.06, 0, 3.15 + dx, F, -2.3, { material: chairM }));
    add(cyl(0.22, 0.03, 0, 2.35, F + 0.5, -3.3, { material: wood })); add(cyl(0.025, 0.5, 0, 2.35, F, -3.3, { material: frameM }));
    for (const [x, c] of [[0.35, 0xd9b26f], [1.65, 0xe9e2d6]]) add(rbox(0.38, 0.32, 0.12, 0.05, 0, x, F + 0.55, -0.5, { material: mat(c, { roughness: 0.95 }) })); }
  function art(n, x, y, z, w, h, rotY) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex.art(n), roughness: 0.6 })); m.position.set(x, y, z); m.rotation.y = rotY; add(m); }
  art(0, -7.915, F + 1.55, -1.2, 0.7, 0.88, Math.PI / 2);      // kitchen / dining wall
  art(1, -7.915, F + 1.55, 1.5, 0.6, 0.75, Math.PI / 2);       // bedroom wall
  function plant(x, z, s = 1) {
    add(cyl(0.16 * s, 0.34 * s, 0, x, F, z, { material: mat(0xe8e2d8, { roughness: 0.7 }) }));
    for (const [dx, dy, dz, r] of [[0, 0.62, 0, 0.3], [0.12, 0.5, 0.08, 0.22], [-0.1, 0.52, -0.08, 0.22]]) add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 2), mat(0x4f7d45, { roughness: 0.85 })), x + dx * s, F + dy * s, z + dz * s));
  }
  plant(-7.55, -0.5); plant(-2.6, -0.5, 0.8); plant(-3.5, 4.55, 0.8);
  // bedroom bench
  add(rbox(1.2, 0.42, 0.4, 0.04, 0, -6.4, F, 2.35, { material: mat(0xc8b9a3, { roughness: 0.95 }) }));
  // garage: pegboard + storage cabinets
  add(box(1.6, 0.7, 0.02, 0, 7.1, F + 1.15, -4.91, { material: mat(0xb89f7c, { roughness: 0.9 }) }));
  add(box(1.0, 0.8, 0.4, 0, 6.35, F + 1.5, -4.75, { material: mat(0x5a5f66, { metalness: 0.3, roughness: 0.5 }) }));
  // contact shadows under furniture and appliances
  for (const [x, z, w, d] of [[1.0, -0.85, 2.5, 1.1], [-5.4, -2.1, 1.6, 1.2], [-6.4, 3.7, 1.9, 2.2], [-4.35, -4.62, 3.4, 0.7], [-7.35, -4.45, 0.95, 0.8],
    [1.0, -4.68, 2.0, 0.5], [3.15, -2.3, 0.95, 0.9], [-3.7, 0.6, 1.2, 0.5], [-1.6, 4.5, 2.4, 0.7], [0.35, 4.45, 0.6, 0.6], [1.35, 4.45, 0.7, 0.75],
    [2.8, 1.2, 1.3, 0.8], [3.4, 4.4, 0.55, 0.55], [7.1, -4.6, 1.7, 0.65], [7.65, -2.2, 0.6, 1.5], [0.8, 0.4, 1.1, 0.4], [-7.6, 2.35, 0.5, 0.45], [-5.2, 4.45, 0.5, 0.45]]) aoBlob(x, z, w, d);
  aoBlob(5.75, -0.4, 2.3, 4.9, 0.142);   // under the EV

  // porch step + front door
  add(box(1.6, 0.14, 0.8, 0x9b9892, 1.2, 0, 5.45));
  add(box(1.0, 0.5, 0.08, 0, 1.2, F, 5.0, { material: mat(0x1f3b5c) }));

  // landscaping: smooth boxwood shrubs, ornamental grasses, broadleaf and columnar trees
  const leafMs = [0x4e7d3c, 0x5b8a43, 0x46733a, 0x6a9550].map(c => mat(c, { roughness: 0.85 }));
  let lr = 3; const lrand = () => ((lr = (lr * 16807) % 2147483647) / 2147483647);
  function shrub(x, z, s = 0.45) { add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), leafMs[(lrand() * 4) | 0]), x, s * 0.75, z)).scale.set(1, 0.85, 1); }
  for (let x = -7.6; x < -0.6; x += 1.05) shrub(x, 5.75, 0.38 + lrand() * 0.08);
  for (const x of [2.3, 3.6]) shrub(x, 5.75, 0.36);
  const grassM = mat(0xa7a85a, { roughness: 0.9 });
  for (const x of [-7.05, -4.95, -2.85, 2.95]) for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6 + lrand() * 0.2, 5), grassM); c.position.set(x + (lrand() - 0.5) * 0.25, 0.32, 5.75 + (lrand() - 0.5) * 0.25); c.rotation.set((lrand() - 0.5) * 0.5, 0, (lrand() - 0.5) * 0.5); add(c); }
  function tree(x, z, s = 1) {
    add(cyl(0.13 * s, 2.4 * s, 0x5d4a3a, x, 0, z));
    const m = leafMs[(lrand() * 4) | 0];
    for (const [dx, dy, dz, r] of [[0, 3.1, 0, 1.35], [0.75, 2.75, 0.35, 0.95], [-0.65, 2.85, -0.4, 1.0], [0.2, 3.85, 0.15, 0.95], [-0.3, 2.6, 0.7, 0.8]])
      add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 3), m), x + dx * s, dy * s, z + dz * s));
    aoPlane(aoBlobM, 3.6 * s, 3.6 * s, x, 0.01, z);
  }
  function columnar(x, z, s = 1) {
    add(cyl(0.08 * s, 0.6 * s, 0x5d4a3a, x, 0, z));
    for (const [y, r, sy] of [[1.3, 0.62, 1.5], [2.3, 0.55, 1.5], [3.15, 0.42, 1.4], [3.8, 0.26, 1.3]]) add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 2), leafMs[2]), x, y * s, z)).scale.set(1, sy, 1);
  }
  tree(-11, -7.2, 1.2); tree(-11.5, 6.5, 1); tree(19, 8, 1.1); tree(3, -7.4, 0.95);
  for (const x of [-6, -3.5, 9.5, 12, 17.5]) columnar(x, -8.3, 0.9);
  // walkway lights (glow with the LED lights)
  const bollardM = mat(0x1d1f22, { roughness: 0.5 });
  for (const z of [6.6, 8.6, 10.6]) for (const dx of [-0.95, 0.95]) { add(cyl(0.06, 0.45, 0, 1.2 + dx, 0, z, { material: bollardM })); add(cyl(0.065, 0.06, 0, 1.2 + dx, 0.38, z, { material: bulbMat })); }

  // back fence: modern horizontal cedar slats with dark posts
  add(box(33.3, 1.6, 0.05, 0, 3.5, 0, -9, { material: new THREE.MeshStandardMaterial({ map: tex.slats([13, 1]), roughness: 0.85 }) }));
  for (let x = -13; x <= 20.1; x += 2.5) add(box(0.1, 1.7, 0.1, 0, x, 0, -9, { material: bollardM }));

  // ---------- appliances ----------
  const appliances = {};   // id -> { group, glows, anim, state }
  const clickables = [];
  /** Merge an appliance's fixed parts by material (moving parts and anything flagged keep stay separate). */
  function mergeChildren(group) {
    const buckets = new Map();
    for (const c of [...group.children]) {
      if (!c.isMesh || c.userData.keep || Array.isArray(c.material)) continue;
      c.updateMatrix();
      const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      g.applyMatrix4(c.matrix); g.clearGroups();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!buckets.has(c.material)) buckets.set(c.material, []);
      buckets.get(c.material).push(g); group.remove(c); c.geometry.dispose();
    }
    for (const [m, list] of buckets) { const mesh = new THREE.Mesh(mergeGeometries(list, false), m); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); list.forEach(x => x.dispose()); }
  }
  function reg(id, group, glows = [], anim = null) {
    mergeChildren(group);
    group.traverse(o => { if (o.isMesh) { o.userData.applianceId = id; clickables.push(o); } });
    scene.add(group);
    appliances[id] = { group, glows, anim, state: 'off' };
    return appliances[id];
  }
  const G = () => new THREE.Group();
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
    const drum = new THREE.Mesh(new THREE.CircleGeometry(0.18, 24), s); drum.position.set(x, F + 0.47, 4.152); drum.rotation.y = Math.PI; drum.userData.keep = true; g.add(drum);
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
  mergeChildren(ev.group);
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
    softBox = rbox(0.16, 0.24, 0.1, 0.02, 0, -5.8, 0.35, 6.35, { material: mat(0xffffff, { roughness: 0.3 }) }); softBox.visible = false; softBox.userData.keep = true; g.add(softBox);
    reg('centralac', g, [s], (t, on, dt) => { if (on) acFan.rotation.y += dt * 12; }); }

  // LED lights: 10 fixtures (sconces, lamps, pendant, porch light)
  const shadeM = mat(0xf3eadb, { roughness: 0.9, side: THREE.DoubleSide });
  const bulbLights = [];
  // warm light pools on the floor (additive decals, merged into one draw) - cheap stand-ins for extra lamps at night
  const POOLS = new THREE.Group();
  const poolM = new THREE.MeshBasicMaterial({ map: tex.pool(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  function pool(x, z, y, size) { const p = new THREE.Mesh(new THREE.PlaneGeometry(size, size), poolM); p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); POOLS.add(p); }
  for (const z of [6.6, 8.6, 10.6]) for (const dx of [-0.95, 0.95]) pool(1.2 + dx, z, 0.035, 1.3);   // walkway bollards
  { const g = G();
    const fixtures = [
      ['sconce', -6.9, 1.9, -4.9], ['pendant', -5.4, 1.75, -2.1], ['floor', 2.55, 0, -0.9], ['table', -0.3, 0.55, -4.65],
      ['table', -7.6, 0.69, 2.35], ['table', -5.2, 0.69, 4.45], ['sconce', 1.8, 1.9, 4.9], ['sconce', 3.4, 1.9, -0.05],
      ['sconce', 6.0, 2.1, -4.9], ['porch', 1.9, 1.6, 5.1]];
    const lit = [1, 2, 4, 8]; let n = 0;   // kitchen pendant, living floor lamp, bedroom lamp, garage sconce
    for (const [type, x, y, z] of fixtures) {
      const fy = F + y; let by = fy;
      if (type === 'floor') { g.add(cyl(0.12, 0.02, 0x222222, x, F, z)); g.add(cyl(0.012, 1.4, 0x222222, x, F, z)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.25, 20, 1, true), shadeM), x, F + 1.5, z)); by = F + 1.45; }
      else if (type === 'table') { g.add(cyl(0.05, 0.25, 0x6b5a4a, x, fy, z)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 20, 1, true), shadeM), x, fy + 0.32, z)); by = fy + 0.3; }
      else if (type === 'pendant') { g.add(cyl(0.005, 0.8, 0x222222, x, fy + 0.2, z)); g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 24, 1, true), mat(0x222222, { side: THREE.DoubleSide })), x, fy + 0.15, z)); by = fy + 0.08; }
      else { const zSign = z > 0 ? -1 : 1; g.add(box(0.1, 0.18, 0.06, 0, x, fy - 0.09, z, { material: mat(0x2a2a2a) })); by = fy; void zSign; }
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), bulbMat); b.position.set(x, by, z); g.add(b);
      // Real lights only in the four main rooms (each one adds GPU cost to every pixel); every fixture gets a baked light pool.
      if (lit.includes(n)) { const l = new THREE.PointLight(0xffd7a0, 0, 7, 1.6); l.position.set(x, by, z); scene.add(l); bulbLights.push(l); }
      pool(x, type === 'porch' ? 5.9 : z + (type === 'sconce' ? (z > 0 ? -0.5 : 0.5) : 0), type === 'porch' ? 0.02 : F + 0.016, type === 'floor' || type === 'pendant' ? 3.2 : 2.4);
      n++;
    }
    reg('lights', g, [bulbMat]); }

  // ---------- generator, cord, inlet, panel, transfer switch ----------
  let gen = null, genSet = false, genBase = GEN_POS.clone(), genBody = null, genLed = null;
  const genGroup = new THREE.Group(); scene.add(genGroup);
  const genLabel = sprite('Generator'); scene.add(genLabel);
  const cordM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, emissive: 0xffcc33, emissiveIntensity: 0 });
  let cordMesh = null;
  function setGeneratorModel(g) {
    if (genSet && (gen === g || (gen && g && gen.model === g.model))) return;
    gen = g; genSet = true;
    // free the previous model's GPU memory (shared canvas textures are cached and kept)
    genGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    genGroup.clear();
    if (!g) {   // no generator yet: empty pad, no cord
      genBody = null; genLed = null;
      if (cordMesh) { scene.remove(cordMesh); cordMesh.geometry.dispose(); cordMesh = null; }
      genLabel.position.set(genBase.x, 1.2, genBase.z); genLabel.userData.set('Generator goes here');
      return;
    }
    const built = buildGenerator(g);
    mergeChildren(built.group);
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
  add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(7.93, 0.6, -3.5), new THREE.Vector3(7.9, 2.3, -3.6), new THREE.Vector3(7.8, 2.4, -4.85), new THREE.Vector3(5.4, 2.4, -4.86), new THREE.Vector3(5.0, 2.1, -4.86)], false, 'catmullrom', 0.05), 60, 0.025, 6), conduitM));
  // breaker panel on the garage back wall
  const panel = rbox(0.55, 0.9, 0.12, 0.02, 0, 5.0, F + 1.0, -4.85, { material: mat(0x7d858e, { metalness: 0.5, roughness: 0.4 }) }); add(panel);
  const panelLedM = glowMat(0x3dff8a);
  add(box(0.05, 0.05, 0.01, 0, 5.2, F + 1.8, -4.785, { material: panelLedM }));
  for (let i = 0; i < 8; i++) for (const dx of [-0.08, 0.08]) add(box(0.11, 0.035, 0.01, 0, 5.0 + dx, F + 1.18 + i * 0.07, -4.785, { material: mat(0x222222) }));
  const interlockPlate = box(0.26, 0.2, 0.01, 0, 5.0, F + 1.72, -4.782, { material: mat(0xf26b1d, { emissive: 0x401800 }) }); scene.add(interlockPlate);
  const tsBox = rbox(0.45, 0.6, 0.12, 0.02, 0, 5.75, F + 1.15, -4.85, { material: mat(0x5d6670, { metalness: 0.4, roughness: 0.45 }) }); scene.add(tsBox);
  const panelLabel = sprite('Breaker panel'); panelLabel.scale.set(3.0, 0.56, 1); panelLabel.position.set(5.3, 3.1, -4.6); scene.add(panelLabel);
  const acLabel = sprite('Central A/C'); acLabel.scale.set(2.8, 0.52, 1); acLabel.position.set(-6.3, 1.7, 6.35); scene.add(acLabel);

  // exhaust puffs
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(200,200,200,.5)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const puffs = Array.from({ length: 8 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 })); s.userData.t = i / 8; scene.add(s); return s; });

  // ---------- exterior shell: full-height front/side walls, gables and roof ----------
  // Shown from the street; fades away as the camera moves in so the cutaway interior is visible.
  const SH = new THREE.Group();
  const shellMats = [];
  const sm = m => { const c = m.clone(); c.userData = { ...m.userData }; c.transparent = true; c.userData.baseOpacity = m.opacity; shellMats.push(c); return c; };
  const shSiding = sm(sidingM), shSidingSide = shSiding, shFrame = sm(frameM), shTrim = sm(trimM), shGlass = sm(glassM);
  winGlass.push(shGlass);
  const shRoof = sm(new THREE.MeshStandardMaterial({ map: tex.roofSeam([7, 2]), roughness: 0.55, metalness: 0.35 }));
  const shFascia = sm(mat(0x1d1f22, { roughness: 0.5 })), shDoor = sm(mat(0x1f3b5c, { roughness: 0.45 })), shSoffit = sm(mat(0xb08a62, { roughness: 0.7 }));
  const shBox = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); b.castShadow = true; b.receiveShadow = true; SH.add(b); return b; };
  const TOP = F + H;   // top of the exterior walls
  // wall along X (front) from x0..x1 at z, between y0..TOP, with openings [{c, w, b, t}] (center, width, bottom, top)
  function shellWallX(x0, x1, z, y0, openings, m) {
    let x = x0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const l = o.c - o.w / 2, r = o.c + o.w / 2;
      if (l > x) shBox(l - x, TOP - y0, T, m, (x + l) / 2, y0, z);
      if (o.b > y0) shBox(o.w, o.b - y0, T, m, o.c, y0, z);
      if (o.t < TOP) shBox(o.w, TOP - o.t, T, m, o.c, o.t, z);
      x = r;
    }
    if (x < x1) shBox(x1 - x, TOP - y0, T, m, (x + x1) / 2, y0, z);
  }
  function shellWallZ(z0, z1, x, y0, openings, m) {
    let z = z0;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const l = o.c - o.w / 2, r = o.c + o.w / 2;
      if (l > z) shBox(T, TOP - y0, l - z, m, x, y0, (z + l) / 2);
      if (o.b > y0) shBox(T, o.b - y0, o.w, m, x, y0, o.c);
      if (o.t < TOP) shBox(T, TOP - o.t, o.w, m, x, o.t, o.c);
      z = r;
    }
    if (z < z1) shBox(T, TOP - y0, z1 - z, m, x, y0, (z + z1) / 2);
  }
  function shWinX(c, z, w, b, t) { const h = t - b; shBox(w + 0.12, 0.06, 0.24, shFrame, c, b - 0.06, z); shBox(w, 0.05, 0.2, shFrame, c, t, z); for (const e of [-1, 1]) shBox(0.05, h, 0.2, shFrame, c + e * (w / 2 - 0.025), b, z); shBox(w, h, 0.02, shGlass, c, b, z); shBox(0.035, h, 0.05, shFrame, c, b, z); }
  function shWinZ(c, x, w, b, t) { const h = t - b; shBox(0.24, 0.06, w + 0.12, shFrame, x, b - 0.06, c); shBox(0.2, 0.05, w, shFrame, x, t, c); for (const e of [-1, 1]) shBox(0.2, h, 0.05, shFrame, x, b, c + e * (w / 2 - 0.025)); shBox(0.02, h, w, shGlass, x, b, c); shBox(0.05, h, 0.035, shFrame, x, b, c); }
  const Y0 = F + 0.5;  // the permanent cutaway walls stop here
  // front of the house: bedroom window, utility window, front door with sidelight
  shellWallX(-8, 4, 5, Y0, [{ c: -5.5, w: 1.8, b: F + 0.9, t: F + 2.15 }, { c: -1.2, w: 1.2, b: F + 1.0, t: F + 2.15 }, { c: 1.2, w: 1.0, b: Y0, t: F + 2.2 }, { c: 2.05, w: 0.36, b: Y0, t: F + 2.2 }], shSiding);
  shWinX(-5.5, 5, 1.8, F + 0.9, F + 2.15); shWinX(-1.2, 5, 1.2, F + 1.0, F + 2.15);
  shBox(1.0, F + 2.2 - Y0, 0.06, shDoor, 1.2, Y0, 5.0); shBox(0.04, 0.3, 0.07, shFrame, 1.55, F + 0.95, 5.05);
  shBox(0.36, F + 2.2 - Y0, 0.02, shGlass, 2.05, Y0, 5.0);
  shBox(1.5, 0.08, 0.2, shFrame, 1.4, F + 2.2, 5.0);
  // garage front: piers and header around the door
  shBox(0.3, TOP, T, shSiding, 4.15, 0, 5); shBox(0.38, TOP, T, shSiding, 7.89, 0, 5);
  shBox(3.4, TOP - (F + 2.24), T, shSiding, 6.0, F + 2.24, 5);
  shBox(3.55, 0.08, 0.2, shFrame, 6.0, F + 2.2, 5.04);
  // garage side wall (toward the generator): one window
  shellWallZ(-5, 5, 8.02, Y0, [{ c: 1.5, w: 1.2, b: F + 1.1, t: F + 2.1 }], shSidingSide);
  shWinZ(1.5, 8.02, 1.2, F + 1.1, F + 2.1);
  // gable ends (left and right) - triangles above the walls
  const RISE = 2.0, RUN = 5.16;
  for (const [x, m] of [[-8, shSidingSide], [8.02, shSidingSide]]) {
    const tri = new THREE.Shape([new THREE.Vector2(-RUN, 0), new THREE.Vector2(RUN, 0), new THREE.Vector2(0, RISE)]);
    const g = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
    const mesh = new THREE.Mesh(g, m); mesh.rotation.y = Math.PI / 2; mesh.position.set(x - T / 2, TOP, 0); mesh.castShadow = true; SH.add(mesh);
  }
  // roof: two standing-seam planes with an overhang, ridge cap, dark fascia + gutters, wood soffit
  const OVER = 0.45, eaveZ = RUN + OVER, eaveY = TOP - OVER * RISE / RUN, slope = Math.atan2(RISE, RUN), len = Math.hypot(eaveZ, RISE + OVER * RISE / RUN);
  for (const side of [1, -1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(17.1, 0.12, len), shRoof);
    r.rotation.x = side * slope; r.position.set(0.02, (eaveY + TOP + RISE) / 2 + 0.06, side * eaveZ / 2); r.castShadow = true; r.receiveShadow = true; SH.add(r);
    const sof = new THREE.Mesh(new THREE.BoxGeometry(17.0, 0.02, OVER), shSoffit); sof.position.set(0.02, eaveY + 0.02, side * (RUN + OVER / 2)); SH.add(sof);
    shBox(17.2, 0.2, 0.06, shFascia, 0.02, eaveY - 0.08, side * (eaveZ + 0.03));
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 17.2, 10), shFascia); gut.rotation.z = Math.PI / 2; gut.position.set(0.02, eaveY + 0.02, side * (eaveZ + 0.1)); SH.add(gut);
    for (const x of [-8.3, 8.35]) shBox(0.08, eaveY - 0.05, 0.08, shFascia, x, 0, side * (eaveZ + 0.1));
  }
  shBox(17.15, 0.08, 0.26, shFascia, 0.02, TOP + RISE + 0.08, 0);
  // rake trim along the gable edges
  for (const x of [-8.5, 8.54]) for (const side of [1, -1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, len), shFascia); t.rotation.x = side * slope; t.position.set(x, (eaveY + TOP + RISE) / 2, side * eaveZ / 2); SH.add(t); }

  // ---------- bake static geometry ----------
  const shellMeshes = mergeStatic(SH);
  mergeStatic(S);
  mergeStatic(AO).forEach(m => { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; });
  mergeStatic(POOLS).forEach(m => { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; });
  let shellAlpha = 1;
  function setShell(a) {
    shellAlpha = a;
    const vis = a > 0.01;
    for (const m of shellMats) { const b = m.userData.baseOpacity ?? 1; m.opacity = b * a; m.transparent = b < 1 || a < 0.995; m.depthWrite = a > 0.6; }
    for (const mesh of shellMeshes) { mesh.visible = vis; mesh.castShadow = a > 0.5; }
    panelLabel.visible = a < 0.5;
  }
  setShell(1);

  // ---------- state setters ----------
  let genRunning = false, genLoad = 0, night = true, tripped = false;
  function setApplianceState(id, state) {        // 'off' | 'on' | 'dead'
    const a = appliances[id]; if (!a) return; a.state = state;
    for (const m of a.glows) m.emissiveIntensity = state === 'on' ? (id === 'lights' ? 3 : 1.6) : 0;
    if (id === 'lights') {
      bulbLights.forEach(l => { l.intensity = state === 'on' ? (night ? 4.5 : 1.2) : 0; });
      winGlass.forEach(m => { m.emissiveIntensity = state === 'on' && night ? 0.55 : 0; });
      poolM.opacity = state === 'on' ? (night ? 0.75 : 0.18) : 0;
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
    scene.background = tex.sky(n);
    scene.fog = new THREE.Fog(n ? 0x1d2c4a : 0xe6eef0, 50, 150);
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
    // roof + exterior walls: shown when zoomed out to the street (distance > 40), hidden in the cutaway (< 34)
    const d = camera.position.distanceTo(controls.target);
    const want = Math.min(1, Math.max(0, (d - 34) / 6));
    if (want !== shellAlpha) setShell(Math.abs(want - shellAlpha) < 0.01 ? want : shellAlpha + (want - shellAlpha) * Math.min(1, dt * 6));
    renderer.render(scene, camera);
  });

  window.__camera = camera;   // for testing
  setTimeout(() => { if (!viewAnim) setView('home'); }, 1200);   // glide from the street into the cutaway

  return { setApplianceState, setGenerator, setGeneratorModel, setConnection, setSoftStarter, setNight, setView, ids: Object.keys(appliances) };
}
