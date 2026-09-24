// Generic modern electric crossover (no real brand or badge), built from extruded side profiles.
// Local axes: length = X (nose at +X), width = Z, up = Y. About 4.75 m long, 1.9 m wide, 1.6 m tall.
import * as THREE from 'three';

export function buildEV({ color = 0xeeeeea } = {}) {
  const g = new THREE.Group();
  const W = 1.9;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1016, roughness: 0.05, metalness: 0.6, clearcoat: 1, transparent: true, opacity: 0.92 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.2 });

  // lower body with wheel arches
  const body = new THREE.Shape();
  body.moveTo(-2.34, 0.34);
  body.lineTo(-1.45 - 0.45, 0.34); body.absarc(-1.45, 0.38, 0.45, Math.PI, 0, true);
  body.lineTo(1.42 - 0.45, 0.34); body.absarc(1.42, 0.38, 0.45, Math.PI, 0, true);
  body.lineTo(2.3, 0.34);
  body.quadraticCurveTo(2.45, 0.42, 2.43, 0.64);
  body.quadraticCurveTo(2.38, 0.86, 1.95, 0.93);
  body.lineTo(0.98, 1.03);
  body.lineTo(-2.18, 1.07);
  body.quadraticCurveTo(-2.36, 1.03, -2.39, 0.8);
  body.quadraticCurveTo(-2.42, 0.5, -2.34, 0.34);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: W - 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 6, curveSegments: 24 });
  bodyGeo.translate(0, 0, -(W - 0.2) / 2);
  const bodyM = new THREE.Mesh(bodyGeo, paint); bodyM.castShadow = bodyM.receiveShadow = true; g.add(bodyM);

  // glass cabin (all-glass roof look)
  const cab = new THREE.Shape();
  cab.moveTo(1.0, 1.0);
  cab.quadraticCurveTo(0.42, 1.44, -0.05, 1.58);
  cab.lineTo(-1.3, 1.6);
  cab.quadraticCurveTo(-2.02, 1.54, -2.26, 1.02);
  cab.lineTo(1.0, 1.0);
  const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: W - 0.42, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.06, bevelSegments: 6, curveSegments: 24 });
  cabGeo.translate(0, 0, -(W - 0.42) / 2);
  const cabM = new THREE.Mesh(cabGeo, glass); cabM.castShadow = true; g.add(cabM);
  // B-pillars / roof rails in body color
  for (const z of [W / 2 - 0.17, -W / 2 + 0.17]) {
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.95, 1.04, z), new THREE.Vector3(0.3, 1.47, z), new THREE.Vector3(-0.3, 1.6, z), new THREE.Vector3(-1.4, 1.62, z), new THREE.Vector3(-2.05, 1.5, z), new THREE.Vector3(-2.25, 1.06, z)]), 40, 0.028, 8), paint);
    g.add(rail);
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.04), paint); bp.position.set(-0.55, 1.33, z * 1.02); g.add(bp);
  }
  // lower cladding + skirts
  for (const z of [W / 2 - 0.02, -W / 2 + 0.02]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.1, 0.04), trim); sk.position.set(0, 0.36, z); g.add(sk);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.02), trim); handle.position.set(0.1, 0.98, z * 1.015); g.add(handle);
    const handle2 = handle.clone(); handle2.position.x = -1.0; g.add(handle2);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), paint); mirror.position.set(0.82, 1.1, z * 1.07); g.add(mirror);
  }
  // light bars
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f3ff, emissiveIntensity: 0.6 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.8 });
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, W - 0.3), head); hb.position.set(2.43, 0.72, 0); g.add(hb);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, W - 0.2), tail); tb.position.set(-2.4, 0.98, 0); g.add(tb);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 1.0), trim); grille.position.set(2.45, 0.46, 0); g.add(grille);

  // wheels with aero covers
  const tireM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const rimM = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.85 });
  for (const x of [-1.45, 1.42]) for (const s of [1, -1]) {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.25, 40), tireM); tire.rotation.x = Math.PI / 2; w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.26, 40), rimM); rim.rotation.x = Math.PI / 2; w.add(rim);
    for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.27), new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 })); sp.rotation.z = (i / 5) * Math.PI; w.add(sp); }
    w.position.set(x, 0.37, s * (W / 2 - 0.12)); w.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.add(w);
  }
  // charge port (rear left fender) - glows while charging
  const port = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x3dff8a, emissiveIntensity: 0 });
  const portM = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), port); portM.position.set(-2.05, 0.92, W / 2 - 0.005); g.add(portM);
  return { group: g, port, portPos: new THREE.Vector3(-2.05, 0.92, W / 2) };
}
