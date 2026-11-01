// Builds the hero head assets from BustBaseMesh_Obj:
//  - bustHead.obj.js : Decimated OBJ, shoulders cropped, wrapped for file:// loading (parsed by OBJLoader)
//  - bustWire.js     : Lowpoly quad topology, subdivided once and projected onto the Decimated surface
const fs = require('fs');
const path = require('path');
const [srcDir, outDir] = process.argv.slice(2);

// Head frame: crown → +1, chin → -1, x centred, face looks to +z
const CY = -0.7764, CZ = -0.0949, S = 2 / 0.1172;
const CROP_Y = -0.860;                    // below this the shoulders start
const norm = (x, y, z) => [x * S, (y - CY) * S, (z - CZ) * S];

function readObj(file) {
  const v = [], f = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (l.startsWith('v ')) { const p = l.trim().split(/\s+/); v.push([+p[1], +p[2], +p[3]]); }
    else if (l.startsWith('f ')) f.push(l.trim().split(/\s+/).slice(1).map((s) => parseInt(s, 10) - 1));
  }
  return { v, f };
}

// ---- 1. Decimated → cropped OBJ ----
const dec = readObj(path.join(srcDir, 'BustBaseMesh_Decimated.obj'));
const keptF = dec.f.filter((t) => t.every((i) => dec.v[i][1] >= CROP_Y));
const remap = new Int32Array(dec.v.length).fill(-1);
const keptV = [];
for (const t of keptF) for (const i of t) if (remap[i] < 0) { remap[i] = keptV.length; keptV.push(dec.v[i]); }
const num = (n) => n.toFixed(5).replace(/^(-?)0\./, '$1.');
const lines = ['# BustBaseMesh_Decimated, shoulders cropped at y=' + CROP_Y];
for (const p of keptV) lines.push(`v ${num(p[0])} ${num(p[1])} ${num(p[2])}`);
for (const t of keptF) lines.push(`f ${remap[t[0]] + 1} ${remap[t[1]] + 1} ${remap[t[2]] + 1}`);
fs.writeFileSync(path.join(outDir, 'bustHead.obj.js'), 'window.VIKI_BUST_OBJ = `' + lines.join('\n') + '\n`;\n');
console.log('decimated kept verts', keptV.length, 'tris', keptF.length);

// ---- 2. surface in the head frame with smooth vertex normals + grid for closest-point queries ----
const P = keptV.map((p) => norm(p[0], p[1], p[2]));
const T = keptF.map((t) => t.map((i) => remap[i]));
const N = P.map(() => [0, 0, 0]);
for (const [a, b, c] of T) {
  const u = P[b].map((v, k) => v - P[a][k]), w = P[c].map((v, k) => v - P[a][k]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const i of [a, b, c]) for (let k = 0; k < 3; k++) N[i][k] += n[k];
}
N.forEach((n) => { const l = Math.hypot(...n) || 1; n[0] /= l; n[1] /= l; n[2] /= l; });

const CELL = 0.06;
const grid = new Map();
const key = (a, b, c) => `${a},${b},${c}`;
T.forEach((t, ti) => {
  const xs = t.map((i) => P[i][0]), ys = t.map((i) => P[i][1]), zs = t.map((i) => P[i][2]);
  for (let a = Math.floor(Math.min(...xs) / CELL); a <= Math.floor(Math.max(...xs) / CELL); a++)
    for (let b = Math.floor(Math.min(...ys) / CELL); b <= Math.floor(Math.max(...ys) / CELL); b++)
      for (let c = Math.floor(Math.min(...zs) / CELL); c <= Math.floor(Math.max(...zs) / CELL); c++) {
        const k = key(a, b, c); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ti);
      }
});

function closestOnTri(p, a, b, c) {       // Ericson, Real-Time Collision Detection → barycentric
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [1 - v - w, v, w];
}

function project(p) {
  const c0 = p.map((v) => Math.floor(v / CELL));
  for (let r = 1; r <= 6; r++) {
    let best = null, bd = Infinity;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      const list = grid.get(key(c0[0] + a, c0[1] + b, c0[2] + c));
      if (!list) continue;
      for (const ti of list) {
        const [i, j, k] = T[ti];
        const w = closestOnTri(p, P[i], P[j], P[k]);
        const q = [0, 1, 2].map((m) => w[0] * P[i][m] + w[1] * P[j][m] + w[2] * P[k][m]);
        const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d < bd) { bd = d; best = { q, w, tri: T[ti], d }; }
      }
    }
    if (best && bd <= r * CELL) {
      const [i, j, k] = best.tri, w = best.w;
      const n = [0, 1, 2].map((m) => w[0] * N[i][m] + w[1] * N[j][m] + w[2] * N[k][m]);
      const l = Math.hypot(...n) || 1;
      return { q: best.q, n: n.map((v) => v / l), d: best.d };
    }
  }
  return null;
}

// ---- 3. Lowpoly quads → subdivide once → project ----
const low = readObj(path.join(srcDir, 'BustBaseMesh_Lowpoly.obj'));
const LP = low.v.map((p) => norm(p[0], p[1], p[2]));
const cropN = (CROP_Y - CY) * S;
const faces = low.f.filter((f) => f.every((i) => LP[i][1] >= cropN));
const ids = new Map(), verts = [];
const addVert = (k, p, corner) => {
  if (ids.has(k)) return ids.get(k);
  const r = project(p); if (!r) throw new Error('no surface near ' + p);
  ids.set(k, verts.length); verts.push({ q: r.q, n: r.n, d: r.d, corner });
  return verts.length - 1;
};
const avg = (arr) => [0, 1, 2].map((m) => arr.reduce((s, p) => s + p[m], 0) / arr.length);
const edges = new Set();
const addEdge = (a, b) => { if (a !== b) edges.add(a < b ? `${a}_${b}` : `${b}_${a}`); };
for (const f of faces) {
  const c = f.map((i) => addVert(`v${i}`, LP[i], 1));
  const m = f.map((i, n) => {
    const j = f[(n + 1) % f.length];
    return addVert(i < j ? `e${i}_${j}` : `e${j}_${i}`, avg([LP[i], LP[j]]), 0);
  });
  const ctr = addVert(`f${f.join('_')}`, avg(f.map((i) => LP[i])), 0);
  for (let n = 0; n < f.length; n++) { addEdge(c[n], m[n]); addEdge(m[n], c[(n + 1) % f.length]); addEdge(m[n], ctr); }
}
const ds = verts.map((v) => v.d).sort((a, b) => a - b);
console.log('wire quads', faces.length, 'verts', verts.length, 'edges', edges.size,
  'proj dist p50', ds[ds.length >> 1].toFixed(4), 'p99', ds[Math.floor(ds.length * 0.99)].toFixed(4), 'max', ds[ds.length - 1].toFixed(4));

const SCALE = 32767 / 1.7;
const pos = new Int16Array(verts.length * 3), nor = new Int8Array(verts.length * 3), cor = new Uint8Array(verts.length);
verts.forEach((v, i) => {
  for (let k = 0; k < 3; k++) { pos[i * 3 + k] = Math.round(v.q[k] * SCALE); nor[i * 3 + k] = Math.round(v.n[k] * 127); }
  cor[i] = v.corner;
});
const idx = new Uint16Array(edges.size * 2);
let e = 0;
for (const s of edges) { const [a, b] = s.split('_').map(Number); idx[e++] = a; idx[e++] = b; }
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
fs.writeFileSync(path.join(outDir, 'bustWire.js'),
  `window.VIKI_BUST_WIRE = ${JSON.stringify({ scale: 1 / SCALE, pos: b64(pos), nor: b64(nor), cor: b64(cor), idx: b64(idx) })};\n`);
for (const f of fs.readdirSync(outDir)) console.log(f, (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0) + ' KB');

// eye openings: dense vertex clusters → help for calibrating blink
const eye = P.filter((p) => p[2] > 0.3 && Math.abs(p[0]) > 0.1 && Math.abs(p[0]) < 0.6 && p[1] > -0.2 && p[1] < 0.3);
const hist = new Map();
for (const p of eye) { const k = `${Math.round(Math.abs(p[0]) * 20) / 20}|${Math.round(p[1] * 20) / 20}`; hist.set(k, (hist.get(k) || 0) + 1); }
console.log('densest eye-area bins (|x|, y, verts):', [...hist].sort((a, b) => b[1] - a[1]).slice(0, 8).join('  '));
