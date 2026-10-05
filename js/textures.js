// Procedural canvas textures (no image downloads) for the Home Backup Power Simulator.
import * as THREE from 'three';

const cache = new Map();
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function canvasTexture(key, w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const ck = key + repeat.join('x');
  if (cache.has(ck)) return cache.get(ck);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  cache.set(ck, t);
  return t;
}

function noise(g, w, h, amount, seed = 1) {
  const r = rand(seed), img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

export const tex = {
  wood: (rep) => canvasTexture('wood', 512, 512, (g, w, h) => {
    const r = rand(7); const rows = 8, ph = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 200;
      while (x < w) {
        const len = 180 + r() * 220, tone = 150 + r() * 40;
        g.fillStyle = `rgb(${tone},${tone * 0.72 | 0},${tone * 0.48 | 0})`; g.fillRect(x, y * ph, len, ph);
        g.strokeStyle = 'rgba(60,35,15,.25)';
        for (let k = 0; k < 6; k++) { g.beginPath(); const yy = y * ph + r() * ph; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + 3, x + len * .6, yy - 3, x + len, yy); g.stroke(); }
        g.fillStyle = 'rgba(40,22,10,.55)'; g.fillRect(x, y * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(40,22,10,.5)'; g.fillRect(0, y * ph, w, 2);
    }
    noise(g, w, h, 14, 3);
  }, { repeat: rep || [2, 2] }),
  tile: (rep) => canvasTexture('tile', 256, 256, (g, w, h) => {
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, w, h); const n = 4, s = w / n, r = rand(5);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const t = 228 + r() * 14; g.fillStyle = `rgb(${t},${t - 3},${t - 9})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
    noise(g, w, h, 8, 9);
  }, { repeat: rep || [4, 4] }),
  carpet: (rep) => canvasTexture('carpet', 256, 256, (g, w, h) => { g.fillStyle = '#b8b0a3'; g.fillRect(0, 0, w, h); noise(g, w, h, 22, 11); }, { repeat: rep || [3, 3] }),
  concrete: (rep) => canvasTexture('concrete', 256, 256, (g, w, h) => {
    g.fillStyle = '#a9a9a4'; g.fillRect(0, 0, w, h); noise(g, w, h, 26, 13);
    g.strokeStyle = 'rgba(70,70,70,.25)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: rep || [2, 4] }),
  asphalt: (rep) => canvasTexture('asphalt', 256, 256, (g, w, h) => { g.fillStyle = '#55575a'; g.fillRect(0, 0, w, h); noise(g, w, h, 40, 17); }, { repeat: rep || [2, 5] }),
  grass: (rep) => canvasTexture('grass', 512, 512, (g, w, h) => {
    g.fillStyle = '#4c7a3a'; g.fillRect(0, 0, w, h); const r = rand(19);
    for (let i = 0; i < 9000; i++) { const x = r() * w, y = r() * h, t = r(); g.strokeStyle = `rgba(${60 + t * 50 | 0},${110 + t * 60 | 0},${40 + t * 20 | 0},.55)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 3, y - 3 - r() * 5); g.stroke(); }
  }, { repeat: rep || [18, 18] }),
  siding: (rep) => canvasTexture('siding', 256, 256, (g, w, h) => {
    const rows = 8, rh = h / rows;
    for (let i = 0; i < rows; i++) { const grd = g.createLinearGradient(0, i * rh, 0, (i + 1) * rh); grd.addColorStop(0, '#f1ede6'); grd.addColorStop(1, '#d9d3c8'); g.fillStyle = grd; g.fillRect(0, i * rh, w, rh); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, (i + 1) * rh - 2, w, 2); }
    noise(g, w, h, 6, 23);
  }, { repeat: rep || [6, 2] }),
  drywall: (rep) => canvasTexture('drywall', 128, 128, (g, w, h) => { g.fillStyle = '#f3f0ea'; g.fillRect(0, 0, w, h); noise(g, w, h, 6, 29); }, { repeat: rep || [4, 2] }),
  rug: () => canvasTexture('rug', 256, 256, (g, w, h) => {
    g.fillStyle = '#35506b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9b48a'; g.lineWidth = 10; g.strokeRect(16, 16, w - 32, h - 32);
    g.lineWidth = 3; g.strokeRect(34, 34, w - 68, h - 68); noise(g, w, h, 16, 31);
  }),
  garageDoor: () => canvasTexture('gdoor', 256, 256, (g, w, h) => {
    g.fillStyle = '#ecebe7'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = 10 + c * 60, y = 8 + r * 62; g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(x, y, 54, 52); g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x + 3, y + 3, 48, 2); }
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let r = 1; r < 4; r++) g.fillRect(0, r * 64 - 1, w, 2);
  }),
  // ---- v3 "model home" materials ----
  oak: (rep) => canvasTexture('oak', 512, 512, (g, w, h) => {      // light wide-plank oak
    const r = rand(41); const rows = 6, ph = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 260;
      while (x < w) {
        const len = 260 + r() * 260, t = 196 + r() * 22;
        g.fillStyle = `rgb(${t},${t * 0.83 | 0},${t * 0.64 | 0})`; g.fillRect(x, y * ph, len, ph);
        g.strokeStyle = 'rgba(120,85,50,.16)';
        for (let k = 0; k < 9; k++) { g.beginPath(); const yy = y * ph + r() * ph; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + 4, x + len * .6, yy - 4, x + len, yy + (r() - .5) * 4); g.stroke(); }
        g.fillStyle = 'rgba(90,60,30,.3)'; g.fillRect(x, y * ph, 1.5, ph);
        x += len;
      }
      g.fillStyle = 'rgba(90,60,30,.28)'; g.fillRect(0, y * ph, w, 1.5);
    }
    noise(g, w, h, 8, 43);
  }, { repeat: rep || [2, 2] }),
  boardBatten: (rep) => canvasTexture('bb', 256, 256, (g, w, h) => {   // white vertical board-and-batten siding
    g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const grd = g.createLinearGradient(x, 0, x + 6, 0); grd.addColorStop(0, 'rgba(0,0,0,.16)'); grd.addColorStop(.5, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(0,0,0,.10)');
      g.fillStyle = grd; g.fillRect(x, 0, 6, h);
    }
    noise(g, w, h, 5, 47);
  }, { repeat: rep || [8, 2] }),
  roofSeam: (rep) => canvasTexture('roof', 256, 256, (g, w, h) => {      // charcoal standing-seam metal
    g.fillStyle = '#2f3338'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 2, 0, 2, h); }
    noise(g, w, h, 6, 53);
  }, { repeat: rep || [6, 2] }),
  lawn: (rep) => canvasTexture('lawn', 512, 512, (g, w, h) => {          // lawn with soft mowing stripes
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#5f8e46' : '#64944a'; g.fillRect(0, i * h / 4, w, h / 4); }
    const r = rand(59);
    for (let i = 0; i < 12000; i++) { const x = r() * w, y = r() * h, t = r(); g.strokeStyle = `rgba(${70 + t * 50 | 0},${120 + t * 55 | 0},${50 + t * 20 | 0},.35)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 2, y - 2 - r() * 4); g.stroke(); }
  }, { repeat: rep || [10, 10] }),
  pavers: (rep) => canvasTexture('pavers', 256, 256, (g, w, h) => {      // large-format light pavers
    g.fillStyle = '#b9b5ad'; g.fillRect(0, 0, w, h); const r = rand(61);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const t = 205 + r() * 14; g.fillStyle = `rgb(${t},${t - 3},${t - 8})`; g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122); }
    noise(g, w, h, 10, 67);
  }, { repeat: rep || [1, 4] }),
  mulch: (rep) => canvasTexture('mulch', 128, 128, (g, w, h) => { g.fillStyle = '#4a3324'; g.fillRect(0, 0, w, h); noise(g, w, h, 40, 71); }, { repeat: rep || [4, 1] }),
  subway: (rep) => canvasTexture('subway', 256, 128, (g, w, h) => {
    g.fillStyle = '#d8d6d1'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let c = -1; c < 4; c++) { const x = c * 64 + (row % 2) * 32; g.fillStyle = '#f7f6f3'; g.fillRect(x + 1.5, row * 16 + 1.5, 61, 13); }
  }, { repeat: rep || [6, 2] }),
  slats: (rep) => canvasTexture('slats', 256, 256, (g, w, h) => {        // horizontal cedar slat fence
    const r = rand(73);
    for (let i = 0; i < 10; i++) { const t = 150 + r() * 30; g.fillStyle = `rgb(${t},${t * 0.72 | 0},${t * 0.5 | 0})`; g.fillRect(0, i * 25.6, w, 22); g.fillStyle = 'rgba(30,20,10,.55)'; g.fillRect(0, i * 25.6 + 22, w, 3.6); }
    noise(g, w, h, 12, 79);
  }, { repeat: rep || [10, 1] }),
  ao: () => canvasTexture('ao', 128, 128, (g, w, h) => {                // soft contact shadow (alpha)
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64); grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(.55, 'rgba(0,0,0,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }),
  aoEdge: () => canvasTexture('aoedge', 4, 64, (g, w, h) => {           // wall/floor corner darkening (alpha)
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(0,0,0,.32)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }),
  pool: () => canvasTexture('pool', 128, 128, (g, w, h) => {             // warm light pool for night lighting (additive)
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,214,150,.9)'); grd.addColorStop(.4, 'rgba(255,190,110,.35)'); grd.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }),
  art: (n) => canvasTexture('art' + n, 128, 160, (g, w, h) => {         // simple abstract wall art
    const pal = [['#e9e2d6', '#c9763f', '#2f4858', '#d9b26f'], ['#eef0ee', '#5e7d6b', '#c9a27e', '#1f2a33'], ['#f2ece4', '#355c7d', '#e3a857', '#8aa1b1']][n % 3];
    g.fillStyle = pal[0]; g.fillRect(0, 0, w, h);
    g.fillStyle = pal[1]; g.beginPath(); g.arc(w * .38, h * .4, w * .26, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal[2]; g.fillRect(w * .15, h * .62, w * .7, h * .12);
    g.fillStyle = pal[3]; g.beginPath(); g.moveTo(w * .55, h * .2); g.lineTo(w * .85, h * .55); g.lineTo(w * .55, h * .55); g.fill();
    g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  }),
  sky: (night) => canvasTexture(night ? 'skyN' : 'skyD', 4, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    if (night) { grd.addColorStop(0, '#050a18'); grd.addColorStop(.6, '#0d1a36'); grd.addColorStop(1, '#1d2c4a'); }
    else { grd.addColorStop(0, '#6fa6dc'); grd.addColorStop(.6, '#b8d6ef'); grd.addColorStop(1, '#eef3f2'); }
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }),
};

// ---------- generator decals ----------
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export { roundRect };

function suffix(model) { const m = model.match(/\d+([A-Za-z+]+)$/); return m ? m[1] : ''; }

/** Black top plate with "DUAL FUEL XP13000HX" style branding. */
export function nameplate(gen) {
  return canvasTexture('np-' + gen.model, 1024, 160, (g, w, h) => {
    g.fillStyle = '#121314'; g.fillRect(0, 0, w, h);
    const star = gen.brand === 'DuroStar';
    const fuelWord = gen.fuelConfig === 'Tri Fuel' ? 'TRI' : gen.fuelConfig === 'Dual Fuel' ? 'DUAL' : '';
    g.font = 'italic 900 72px Arial Black, Arial, sans-serif'; g.textBaseline = 'middle';
    let x = 40;
    if (fuelWord) {
      g.fillStyle = '#ffffff'; g.fillText(fuelWord, x, h / 2); x += g.measureText(fuelWord).width + 16;
      g.fillStyle = star ? '#e63a2e' : '#3aa0ff'; g.beginPath(); g.moveTo(x + 18, 30); g.lineTo(x, h / 2 + 6); g.lineTo(x + 16, h / 2 + 6); g.lineTo(x + 4, h - 28); g.lineTo(x + 30, h / 2 - 8); g.lineTo(x + 14, h / 2 - 8); g.closePath(); g.fill(); x += 44;
      g.fillStyle = '#ffffff'; g.fillText('FUEL', x, h / 2); x += g.measureText('FUEL').width + 40;
    }
    const sfx = suffix(gen.model), base = gen.model.slice(0, gen.model.length - sfx.length);
    g.font = 'italic 900 88px Arial Black, Arial, sans-serif';
    g.fillStyle = '#ffffff'; g.fillText(base, x, h / 2 + 2); x += g.measureText(base).width;
    g.fillStyle = star ? '#e63a2e' : '#6ddc3b'; g.fillText(sfx, x, h / 2 + 2);
  }, { repeat: [1, 1] });
}

/** Brand badge ("DuroMax" / "DuroStar"). */
export function badge(brand) {
  return canvasTexture('badge-' + brand, 256, 80, (g, w, h) => {
    if (brand === 'DuroStar') {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.font = 'italic 900 44px Arial Black, Arial'; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('DURO★STAR', w / 2, h / 2 + 2);
    } else {
      g.fillStyle = '#d9dadc'; roundRect(g, 2, 2, w - 4, h - 4, 10); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 5; g.stroke();
      g.font = '900 46px Arial Black, Arial'; g.textBaseline = 'middle'; g.fillStyle = '#1a1a1a'; g.fillText('Duro', 22, h / 2 + 2);
      g.fillStyle = '#1a1a1a'; g.fillRect(132, 12, 106, h - 24); g.fillStyle = '#d9dadc'; g.fillText('Max', 138, h / 2 + 2);
    }
  });
}

/** Control panel face: brand-colored sub-panels, outlets, meter and a wattage label. */
export function controlPanel(gen) {
  return canvasTexture('cp-' + gen.model, 512, 384, (g, w, h) => {
    const star = gen.brand === 'DuroStar';
    const acc = star ? '#c8231b' : '#1f56c9';
    g.fillStyle = '#141516'; g.fillRect(0, 0, w, h);
    // left block: switches / fuel selector
    g.fillStyle = acc; roundRect(g, 14, 16, 200, 160, 10); g.fill();
    g.fillStyle = '#0d0d0d'; g.beginPath(); g.arc(70, 80, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8e8e8'; g.fillRect(64, 56, 12, 48);
    g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) g.fillRect(118, 44 + i * 26, 80, 6);
    // right block: outlets
    g.fillStyle = acc; roundRect(g, 226, 16, 272, 160, 10); g.fill();
    g.fillStyle = '#1b1b1b'; roundRect(g, 238, 26, 250, 34, 6); g.fill();       // meter
    g.fillStyle = '#39d0ff'; g.font = 'bold 22px monospace'; g.fillText('120.0V  60.0Hz', 250, 50);
    const outlet = (x, y, r, twist) => { g.fillStyle = '#0e0e0e'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#6b6b6b'; if (twist) { g.lineWidth = 4; g.strokeStyle = '#8a8a8a'; g.beginPath(); g.arc(x, y, r * 0.55, 0.3, 1.2); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.55, 2.4, 3.3); g.stroke(); g.beginPath(); g.arc(x, y, r * 0.55, 4.5, 5.4); g.stroke(); } else { g.fillRect(x - 8, y - 9, 4, 12); g.fillRect(x + 4, y - 9, 4, 12); g.fillRect(x - 2, y + 5, 4, 6); } };
    outlet(268, 104, 24, false); outlet(268, 150, 20, false); outlet(330, 118, 32, true); outlet(410, 118, 36, true); outlet(470, 118, 22, false);
    // lower: wattage label
    const f = gen.fuels, keys = Object.keys(f);
    g.fillStyle = '#0b0b0b'; roundRect(g, 14, 190, 484, 178, 10); g.fill();
    const cw = 484 / keys.length;
    keys.forEach((k, i) => {
      const x = 14 + i * cw;
      g.fillStyle = k === 'Gasoline' ? '#ffffff' : k === 'Propane' ? '#7fd3ff' : '#9dff7a';
      g.font = 'bold 20px Arial'; g.fillText(k.toUpperCase(), x + 16, 222);
      g.font = '900 52px Arial Black, Arial'; g.fillStyle = '#ffffff'; g.fillText(String(f[k].starting), x + 12, 282);
      g.font = 'bold 16px Arial'; g.fillStyle = '#bbbbbb'; g.fillText('PEAK WATTS', x + 16, 304);
      g.font = '900 36px Arial Black, Arial'; g.fillStyle = '#ffffff'; g.fillText(String(f[k].running), x + 16, 344);
      g.font = 'bold 14px Arial'; g.fillStyle = '#bbbbbb'; g.fillText('RUNNING WATTS', x + 16, 362);
    });
  });
}

/** Side graphic for enclosed inverters: model plate. */
export function inverterSide(gen, color) {
  return canvasTexture('inv-' + gen.model + color, 512, 512, (g, w, h) => {
    g.fillStyle = color || '#151617'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1b1d'; roundRect(g, 60, 150, 390, 250, 24); g.fill();
    g.strokeStyle = '#2f6fe0'; g.lineWidth = 8; roundRect(g, 70, 160, 370, 230, 20); g.stroke();
    const sfx = suffix(gen.model), base = gen.model.slice(0, gen.model.length - sfx.length);
    g.font = 'italic 900 64px Arial Black, Arial'; g.fillStyle = '#fff'; g.textBaseline = 'middle';
    g.fillText(base, 96, 230); g.fillStyle = '#6ddc3b'; g.fillText(sfx, 96 + g.measureText(base).width, 230);
    g.font = 'bold 28px Arial'; g.fillStyle = '#cfd8ff';
    g.fillText(gen.fuelConfig.toUpperCase(), 100, 300);
    g.fillText('INVERTER · LOW THD', 100, 345);
  });
}

/** Louver / grille pattern (alpha-ish dark slots). */
export const louver = () => canvasTexture('louver', 256, 256, (g, w, h) => {
  g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#060606';
  for (let x = 10; x < w - 6; x += 18) g.fillRect(x, 10, 9, h - 20);
});
