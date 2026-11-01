/**
 * HeadMatrix — hero figure: a 3D head + neck drawn as a dense dot matrix
 * (references face.jpg / face3.jpg). Only the head and the curve of the neck;
 * the neck base dissolves into the background, no shoulders.
 *
 * Geometry: an implicit head (smooth-blended ellipsoids, eye sockets, nose,
 * lips, ears, neck) is ray-cast once from a centre point into a radius map,
 * then sampled into evenly spaced surface dots with normals.
 * Per frame: the head turns toward the cursor (look-at, eyes lead slightly;
 * the older profile ↔ front sway is kept as motion: 'sway'), diffuse +
 * specular light, a coarse depth buffer for hidden dots, rare blinks (the
 * eye dots close into a line) and faint light pulses running over the face.
 * Static mode (mobile / reduced motion): one high-quality three-quarter frame.
 */
const HeadMatrix = (() => {
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  function rng(seed) {                       // mulberry32 — the same dots on every load
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- implicit head (units: crown ≈ +1, chin ≈ -1, face looks to +z) ----
  function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }
  function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
    const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz;
    return (Math.sqrt(a * a + b * b + c * c) - 1) * Math.min(rx, ry, rz);
  }
  function sphere(x, y, z, cx, cy, cz, r) { return Math.hypot(x - cx, y - cy, z - cz) - r; }
  function cone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {   // capsule with a growing radius
    const vx = bx - ax, vy = by - ay, vz = bz - az;
    const h = clamp01(((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / (vx * vx + vy * vy + vz * vz));
    return Math.hypot(x - ax - vx * h, y - ay - vy * h, z - az - vz * h) - (ra + (rb - ra) * h);
  }

  // v2 (current): proportions from the frontal topology refs (face5 / face6 / face7):
  // eyes at half head height, nose base ≈ 0.71, mouth ≈ 0.81, narrow tapered jaw, flat-backed ears.
  function headFieldV2(x, y, z) {
    const ax = Math.abs(x);
    // cranium — slightly flattened sides (temples), full rounded back
    let d = ell(x, y, z, 0, 0.27, -0.08, 0.67, 0.75, 0.87);
    d = smax(d, ax - 0.655 - 0.05 * smooth(0.6, 1.0, y), 0.12);
    // face mass, tapering into a clean V of the jaw
    const taper = 1 - 0.36 * smooth(-0.15, -0.98, y);
    d = smin(d, ell(x / taper, y, z, 0, -0.32, 0.11, 0.56, 0.66, 0.58), 0.2);
    d = smin(d, ell(ax, y, z, 0.36, -0.56, -0.12, 0.1, 0.15, 0.18), 0.2);      // jaw angles (under the ears)
    d = smin(d, ell(x, y, z, 0, -0.86, 0.45, 0.17, 0.12, 0.14), 0.15);         // chin
    d = smin(d, ell(ax, y, z, 0.37, -0.1, 0.4, 0.17, 0.1, 0.17), 0.15);        // cheekbones
    d = smin(d, ell(x, y, z, 0, 0.16, 0.6, 0.42, 0.075, 0.15), 0.09);          // soft brow
    // eyes: shallow sockets, round eyeballs, upper / lower lids → almond opening
    d = smax(d, -ell(ax, y, z, 0.235, 0.02, 0.73, 0.135, 0.07, 0.12), 0.06);
    d = smin(d, sphere(ax, y, z, 0.235, 0.015, 0.54, 0.12), 0.015);
    d = smin(d, ell(ax, y, z, 0.235, 0.052, 0.585, 0.135, 0.05, 0.085), 0.025);
    d = smin(d, ell(ax, y, z, 0.235, -0.032, 0.575, 0.125, 0.03, 0.08), 0.025);
    // nose: narrow bridge → rounded tip → wings
    d = smin(d, cone(x * 1.35, y, z, 0, 0.04, 0.66, 0, -0.3, 0.84, 0.038, 0.062), 0.06);
    d = smin(d, sphere(x, y, z, 0, -0.31, 0.83, 0.07), 0.05);
    d = smin(d, ell(ax, y, z, 0.08, -0.365, 0.74, 0.06, 0.045, 0.055), 0.04);
    // lips + mouth line
    d = smin(d, ell(x, y, z, 0, -0.55, 0.665, 0.15, 0.04, 0.05), 0.05);
    d = smin(d, ell(x, y, z, 0, -0.65, 0.645, 0.13, 0.045, 0.05), 0.05);
    d = smax(d, -ell(x, y, z, 0, -0.6, 0.73, 0.15, 0.008, 0.07), 0.015);
    // ears: lie close to the head, top at brow level, lobe at nose base
    d = smin(d, ell(ax, y, z, 0.655, -0.05, -0.1, 0.05, 0.2, 0.12), 0.05);
    // neck: slim, gently leaning back, starts behind the jaw
    const cz = -0.18 + (y + 0.5) * 0.1;
    const nw = 0.35 + 0.05 * smooth(-1.1, -1.7, y);                            // widens slightly toward the base
    const neck = smax((Math.hypot(x / nw, (z - cz) / 0.37) - 1) * nw, y + 0.35, 0.05);
    d = smin(d, neck, 0.15);
    return smax(d, -(y + 1.8), 0.02);
  }

  // v1 (first version) — kept for CONFIG.head.anatomy = 'v1'
  function headFieldV1(x, y, z) {
    const ax = Math.abs(x);
    let d = ell(x, y, z, 0, 0.3, -0.06, 0.66, 0.74, 0.86);                     // cranium
    const taper = 1 - 0.36 * smooth(-0.05, -0.95, y);                          // jaw narrows to the chin
    d = smin(d, ell(x / taper, y, z, 0, -0.33, 0.1, 0.52, 0.64, 0.6), 0.22);   // face mass
    d = smin(d, ell(x, y, z, 0, -0.84, 0.54, 0.2, 0.16, 0.18), 0.14);          // chin
    d = smin(d, ell(ax, y, z, 0.35, -0.1, 0.4, 0.16, 0.12, 0.16), 0.14);       // cheekbones
    d = smin(d, ell(x, y, z, 0, 0.17, 0.6, 0.4, 0.09, 0.17), 0.1);             // brow ridge
    d = smax(d, -ell(ax, y, z, 0.23, 0.05, 0.76, 0.13, 0.075, 0.11), 0.07);    // eye sockets
    d = smin(d, sphere(ax, y, z, 0.23, 0.04, 0.55, 0.115), 0.02);              // eyeballs
    d = smin(d, ell(ax, y, z, 0.23, 0.075, 0.6, 0.125, 0.045, 0.085), 0.03);   // upper lids
    d = smin(d, ell(ax, y, z, 0.23, -0.012, 0.59, 0.115, 0.03, 0.08), 0.03);   // lower lids
    d = smin(d, cone(x * 1.25, y, z, 0, 0.02, 0.66, 0, -0.29, 0.86, 0.045, 0.075), 0.06); // nose bridge
    d = smin(d, sphere(x, y, z, 0, -0.3, 0.84, 0.08), 0.05);                   // nose tip
    d = smin(d, ell(ax, y, z, 0.085, -0.35, 0.75, 0.065, 0.05, 0.06), 0.04);   // nostril wings
    d = smin(d, ell(x, y, z, 0, -0.505, 0.67, 0.15, 0.042, 0.05), 0.05);       // upper lip
    d = smin(d, ell(x, y, z, 0, -0.6, 0.655, 0.125, 0.045, 0.05), 0.05);       // lower lip
    d = smax(d, -ell(x, y, z, 0, -0.556, 0.75, 0.15, 0.008, 0.07), 0.015);     // mouth line
    d = smin(d, ell(ax, y, z, 0.64, -0.02, -0.08, 0.05, 0.2, 0.12), 0.05);     // ears
    const cz = -0.2 + (y + 0.5) * 0.12;                                        // neck curves gently down and back
    const neck = smax((Math.hypot(x / 0.31, (z - cz) / 0.36) - 1) * 0.31, y + 0.35, 0.05);
    d = smin(d, neck, 0.15);
    return smax(d, -(y + 1.8), 0.02);                                          // neck ends (dissolved anyway)
  }

  let headField = headFieldV2;

  // ---- surface: radius map from a centre point, then evenly spaced dots ----
  const CENTER = [0, -0.3, -0.05];
  function rayHit(dx, dy, dz) {
    const step = 0.025;
    for (let r = 2.1; r > 0; r -= step) {      // march inward: outermost crossing (ears, nose stay solid)
      if (headField(CENTER[0] + dx * r, CENTER[1] + dy * r, CENTER[2] + dz * r) < 0) {
        let lo = r, hi = r + step;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          if (headField(CENTER[0] + dx * m, CENTER[1] + dy * m, CENTER[2] + dz * m) < 0) lo = m; else hi = m;
        }
        return (lo + hi) / 2;
      }
    }
    return 0;
  }

  function buildHead(nA, nE, count, cfg) {
    headField = cfg.anatomy === 'v1' ? headFieldV1 : headFieldV2;
    const R = new Float32Array((nA + 1) * (nE + 1));
    const dirOf = (az, el, out) => { const c = Math.cos(el); out[0] = c * Math.sin(az); out[1] = Math.sin(el); out[2] = c * Math.cos(az); return out; };
    const dv = [0, 0, 0];
    for (let j = 0; j <= nE; j++) {
      const el = -Math.PI / 2 + (Math.PI * j) / nE;
      for (let i = 0; i <= nA; i++) {
        dirOf(-Math.PI + (2 * Math.PI * i) / nA, el, dv);
        R[j * (nA + 1) + i] = rayHit(dv[0], dv[1], dv[2]);
      }
    }
    const P = (i, j, out) => {
      dirOf(-Math.PI + (2 * Math.PI * i) / nA, -Math.PI / 2 + (Math.PI * j) / nE, out);
      const r = R[j * (nA + 1) + i];
      out[0] = CENTER[0] + out[0] * r; out[1] = CENTER[1] + out[1] * r; out[2] = CENTER[2] + out[2] * r;
      return out;
    };
    // cell areas → dot budget per cell (even density over the whole surface)
    const area = new Float32Array(nA * nE);
    const p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0];
    let total = 0;
    for (let j = 0; j < nE; j++) {
      for (let i = 0; i < nA; i++) {
        P(i, j, p0); P(i + 1, j, p1); P(i, j + 1, p2);
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
        const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        area[j * nA + i] = a; total += a;
      }
    }
    const rand = rng(7);
    const density = count / total;
    // 1) ~5× random candidates spread by area
    const cand = [];
    const over = density * 5;
    for (let j = 0; j < nE; j++) {
      for (let i = 0; i < nA; i++) {
        const n = Math.floor(area[j * nA + i] * over + rand());
        for (let k = 0; k < n; k++) {
          const u = rand(), v = rand();
          const az = -Math.PI + (2 * Math.PI * (i + u)) / nA, el = -Math.PI / 2 + (Math.PI * (j + v)) / nE;
          const r00 = R[j * (nA + 1) + i], r10 = R[j * (nA + 1) + i + 1];
          const r01 = R[(j + 1) * (nA + 1) + i], r11 = R[(j + 1) * (nA + 1) + i + 1];
          const r = (r00 * (1 - u) + r10 * u) * (1 - v) + (r01 * (1 - u) + r11 * u) * v;
          dirOf(az, el, dv);
          cand.push(CENTER[0] + dv[0] * r, CENTER[1] + dv[1] * r, CENTER[2] + dv[2] * r);
        }
      }
    }
    // 2) blue-noise thinning: keep a candidate only if no kept dot is closer than minD
    //    → evenly spaced matrix, no clumps, holes or grid moiré
    const minD = Math.sqrt(total / count) * 0.86, minD2 = minD * minD;
    const hash = new Map();
    const key = (a, b, c) => ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512);
    const order = new Uint32Array(cand.length / 3).map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const xs = [], ys = [], zs = [];
    for (let q = 0; q < order.length; q++) {
      const c = order[q] * 3, x = cand[c], y = cand[c + 1], z = cand[c + 2];
      const hx = Math.floor(x / minD), hy = Math.floor(y / minD), hz = Math.floor(z / minD);
      let ok = true;
      for (let a = -1; a <= 1 && ok; a++) {
        for (let b = -1; b <= 1 && ok; b++) {
          for (let d = -1; d <= 1 && ok; d++) {
            const list = hash.get(key(hx + a, hy + b, hz + d));
            if (!list) continue;
            for (let m = 0; m < list.length; m++) {
              const o = list[m], dx = xs[o] - x, dy = ys[o] - y, dz = zs[o] - z;
              if (dx * dx + dy * dy + dz * dz < minD2) { ok = false; break; }
            }
          }
        }
      }
      if (!ok) continue;
      const k = key(hx, hy, hz);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(xs.length);
      xs.push(x); ys.push(y); zs.push(z);
    }
    const N = xs.length;
    const g = {
      n: N,
      x: Float32Array.from(xs), y: Float32Array.from(ys), z: Float32Array.from(zs),
      nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N),
      fade: new Float32Array(N), eye: new Float32Array(N), eyeY: new Float32Array(N), ball: new Uint8Array(N),
      lx: new Float32Array(N), ly: new Float32Array(N), lz: new Float32Array(N),   // eyeball-local direction (iris / gaze)
    };
    const EX = 0.235, EY = 0.015, EZ = 0.54;
    const e = 0.004;
    for (let p = 0; p < N; p++) {
      const x = g.x[p], y = g.y[p], z = g.z[p];
      let gx = headField(x + e, y, z) - headField(x - e, y, z);
      let gy = headField(x, y + e, z) - headField(x, y - e, z);
      let gz = headField(x, y, z + e) - headField(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1;
      g.nx[p] = gx / l; g.ny[p] = gy / l; g.nz[p] = gz / l;
      g.fade[p] = smooth(cfg.neckFade[1], cfg.neckFade[0], y);            // neck dissolves, no hard cut
      if (z > 0.45) {                                                      // eye region → blink weight
        const ex = (Math.abs(x) - EX) / 0.14, ey = (y - EY - 0.01) / 0.075;
        const r2 = ex * ex + ey * ey;
        if (r2 < 1) { g.eye[p] = smooth(1, 0.35, r2); g.eyeY[p] = EY + 0.01; }
        const bx = x - Math.sign(x) * EX, by = y - EY, bz = z - EZ, bl = Math.hypot(bx, by, bz);
        if (bl < 0.13 && z > 0.6) { g.ball[p] = 1; g.lx[p] = bx / bl; g.ly[p] = by / bl; g.lz[p] = bz / bl; }
      }
    }
    return g;
  }

  function create(canvas, figureEl, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    const dots = document.createElement('canvas');
    const dctx = dots.getContext('2d');
    const mask = document.createElement('canvas');
    const mctx = mask.getContext('2d');
    const bloomA = document.createElement('canvas');
    const bloomB = document.createElement('canvas');
    const bctxA = bloomA.getContext('2d');
    const bctxB = bloomB.getContext('2d');
    const [cr, cg, cb] = cfg.color.split(',').map((v) => parseInt(v, 10));
    const L = (() => { const v = cfg.light, l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
    const H = (() => { const h = [L[0], L[1], L[2] + 1], l = Math.hypot(h[0], h[1], h[2]); return [h[0] / l, h[1] / l, h[2] / l]; })();

    const cache = {};
    let geo = null;
    let W = 0, Hh = 0, dpr = 1, isStatic = reducedMotion, isMobile = false;
    let fig = { cx: 0, cy: 0, k: 1 };
    let cell = 4, cw = 1, ch = 1, zbuf, fbuf, maskImg;
    let accum, img;
    let sx, sy, sz, sb;
    let raf = 0, running = false, startTime = 0, scroll = 0;
    const pointer = { nx: 0, ny: 0, sx: 0, sy: 0 };
    let nextBlink = 0, blinkAt = -1e9;
    const pulses = [];
    let nextPulse = 0;

    function layout() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
      W = canvas.width = dots.width = Math.max(1, Math.round(rect.width * dpr));
      Hh = canvas.height = dots.height = Math.max(1, Math.round(rect.height * dpr));
      bloomA.width = Math.max(1, Math.round(W / 4)); bloomA.height = Math.max(1, Math.round(Hh / 4));
      bloomB.width = Math.max(1, Math.round(W / 10)); bloomB.height = Math.max(1, Math.round(Hh / 10));
      isMobile = rect.width < breakpoints.mobile;
      isStatic = reducedMotion || isMobile;

      const mode = isMobile ? 'm' : 'd';
      if (!cache[mode]) {
        const grid = isMobile ? cfg.gridMobile : cfg.gridDesktop;
        cache[mode] = buildHead(grid[0], grid[1], isMobile ? cfg.pointsMobile : cfg.pointsDesktop, cfg);
      }
      geo = cache[mode];
      sx = new Float32Array(geo.n); sy = new Float32Array(geo.n); sz = new Float32Array(geo.n); sb = new Float32Array(geo.n);

      // placed by CSS like the previous figure: .hero__figure is an empty layout box
      const f = figureEl.getBoundingClientRect();
      const scale = parseFloat(getComputedStyle(figureEl).getPropertyValue('--figure-scale')) || 1;
      const size = Math.min(f.height, f.width * 1.3) * scale;
      fig = {
        cx: (f.left - rect.left + f.width / 2) * dpr,
        cy: (f.top - rect.top + f.height / 2 + cfg.offsetY * size) * dpr,
        k: (size * cfg.scale * dpr) / 2.8,                 // model height crown → neck end ≈ 2.8
      };
      cell = Math.max(3, Math.round(fig.k * Math.sqrt(1 / (geo.n / 10)) * 1.15));  // ≈ dot spacing
      cw = Math.ceil(W / cell) + 1; ch = Math.ceil(Hh / cell) + 1;
      mask.width = cw; mask.height = ch;
      zbuf = new Float32Array(cw * ch); fbuf = new Float32Array(cw * ch);
      maskImg = mctx.createImageData(cw, ch);
      accum = new Float32Array(W * Hh);
      img = dctx.createImageData(W, Hh);
    }

    function render(t) {
      // cursor relative to the head itself (not the hero centre), clamped to safe turn limits
      const active = pointer.nx !== 0 || pointer.ny !== 0;
      const tx = active ? Math.max(-1, Math.min(1, pointer.nx - ((fig.cx / W) * 2 - 1))) : 0;
      const ty = active ? Math.max(-1, Math.min(1, pointer.ny - ((fig.cy / Hh) * 2 - 1))) : 0;
      pointer.sx += (tx - pointer.sx) * cfg.followEase;
      pointer.sy += (ty - pointer.sy) * cfg.followEase;
      const assemble = isStatic ? 1 : easeOut(clamp01((t - cfg.assembleDelayMs) / cfg.assembleMs));
      const alpha = assemble * (isStatic ? 1 : 1 - scroll * 0.9);   // static: CSS opacity handles scroll
      ctx.clearRect(0, 0, W, Hh);
      if (alpha <= 0.002 || !geo) return;

      let yaw, pitch;
      if (isStatic) {
        yaw = cfg.staticYaw; pitch = cfg.pitch;
      } else if (cfg.motion === 'sway') {
        // previous version: slow, even sway profile ↔ almost frontal
        const sway = 0.5 - 0.5 * Math.cos((t / cfg.yawPeriodMs) * Math.PI * 2);
        yaw = cfg.yawFrom + (cfg.yawTo - cfg.yawFrom) * sway + pointer.sx * cfg.pointerYaw;
        pitch = cfg.pitch + pointer.sy * cfg.pointerPitch;
      } else {
        // look-at: the head turns toward the cursor within safe limits, plus a barely visible idle drift
        yaw = cfg.restYaw + pointer.sx * cfg.lookYaw + Math.sin(t / 6100) * cfg.idleDrift;
        pitch = cfg.pitch + pointer.sy * cfg.lookPitch + Math.sin(t / 8300) * cfg.idleDrift * 0.5;
      }
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      // gaze: the eyes lead the head a little further toward the cursor
      const gyaw = isStatic ? 0 : pointer.sx * cfg.gazeYaw, gpitch = isStatic ? 0 : pointer.sy * cfg.gazePitch;
      const gvx = Math.sin(gyaw) * Math.cos(gpitch), gvy = -Math.sin(gpitch), gvz = Math.cos(gyaw) * Math.cos(gpitch);

      // blink: eye dots squeeze into a line for a moment
      let blink = 0;
      if (!isStatic) {
        if (t > nextBlink) { blinkAt = t; nextBlink = t + cfg.blinkMinMs + Math.random() * (cfg.blinkMaxMs - cfg.blinkMinMs); }
        const bp = (t - blinkAt) / cfg.blinkMs;
        if (bp >= 0 && bp <= 1) blink = Math.sin(bp * Math.PI);
        if (t > nextPulse) {
          pulses.push({ born: t, o: cfg.pulseOrigins[Math.floor(Math.random() * cfg.pulseOrigins.length)] });
          nextPulse = t + cfg.pulseMinMs + Math.random() * (cfg.pulseMaxMs - cfg.pulseMinMs);
        }
      }
      for (let i = pulses.length - 1; i >= 0; i--) if ((t - pulses[i].born) * cfg.pulseSpeed > cfg.pulseReach) pulses.splice(i, 1);

      const g = geo, D = 7, yMid = -0.36;
      zbuf.fill(-1e9); fbuf.fill(0);
      let minX = W, minY = Hh, maxX = 0, maxY = 0;

      // pass 1: transform, light, depth buffer
      for (let p = 0; p < g.n; p++) {
        sb[p] = 0;
        if (g.fade[p] <= 0) continue;
        const x = g.x[p], z = g.z[p];
        let y = g.y[p];
        if (blink && g.eye[p]) y -= (y - g.eyeY[p]) * blink * 0.92 * g.eye[p];
        const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const nx = g.nx[p], ny = g.ny[p], nz0 = g.nz[p];
        const nx1 = nx * cyw + nz0 * syw, nz1 = -nx * syw + nz0 * cyw;
        const ny2 = ny * cp - nz1 * sp, nz2 = ny * sp + nz1 * cp;
        if (nz2 < -0.05) continue;                                  // back side
        const persp = D / (D - z2);
        const X = fig.cx + x1 * fig.k * persp, Y = fig.cy - (y2 - yMid) * fig.k * persp;
        if (X < 1 || Y < 1 || X >= W - 2 || Y >= Hh - 2) continue;
        sx[p] = X; sy[p] = Y; sz[p] = z2;

        const lam = Math.max(0, nx1 * L[0] + ny2 * L[1] + nz2 * L[2]);
        const spec = Math.pow(Math.max(0, nx1 * H[0] + ny2 * H[1] + nz2 * H[2]), 24);
        const facing = clamp01(nz2);
        let b = (cfg.ambient + cfg.diffuse * lam + cfg.specular * spec) * (cfg.edgeFloor + (1 - cfg.edgeFloor) * facing);
        if (g.ball[p]) {
          const c = g.lx[p] * gvx + g.ly[p] * gvy + g.lz[p] * gvz;   // angle from the gaze axis
          if (c > 0.982) b *= 0.12;                                   // pupil
          else if (c > 0.915) b *= c > 0.93 ? 0.55 : 1.5;              // iris + bright limbal ring
          else b *= 1 + cfg.eyeGlow;                                  // sclera
          b *= 1 - blink * 0.6;
        }
        for (let i = 0; i < pulses.length; i++) {                   // light running over the face
          const pl = pulses[i], o = pl.o;
          const r = (t - pl.born) * cfg.pulseSpeed;
          const dd = Math.abs(Math.hypot(x - o[0], g.y[p] - o[1], z - o[2]) - r);
          if (dd < cfg.pulseWidth) b += cfg.pulseGain * (1 - dd / cfg.pulseWidth) * (1 - r / cfg.pulseReach);
        }
        sb[p] = b * g.fade[p] + 1e-6;

        const ci = Math.floor(X / cell), cj = Math.floor(Y / cell);
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const c = (cj + dj) * cw + ci + di;
            if (c < 0 || c >= zbuf.length) continue;
            if (z2 > zbuf[c]) zbuf[c] = z2;
            if (g.fade[p] > fbuf[c]) fbuf[c] = g.fade[p];
          }
        }
        if (X < minX) minX = X; if (X > maxX) maxX = X;
        if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
      }
      if (maxX <= minX) return;
      const bx = Math.max(0, Math.floor(minX) - 2), by = Math.max(0, Math.floor(minY) - 2);
      const bw = Math.min(W, Math.ceil(maxX) + 3) - bx, bh = Math.min(Hh, Math.ceil(maxY) + 3) - by;

      // pass 2: visible dots → bilinear splat (smooth sub-pixel motion, no shimmer)
      for (let yy = 0; yy < bh; yy++) accum.fill(0, (by + yy) * W + bx, (by + yy) * W + bx + bw);
      const eps = 0.07, gain = cfg.dotGain * assemble;
      for (let p = 0; p < g.n; p++) {
        if (!sb[p]) continue;
        const X = sx[p], Y = sy[p];
        if (sz[p] < zbuf[Math.floor(Y / cell) * cw + Math.floor(X / cell)] - eps) continue;   // hidden behind nose / cheek
        // soft round dot (3×3 tent kernel, normalised) → every dot reads equally bright
        const ix = Math.round(X), iy = Math.round(Y), fx = X - ix, fy = Y - iy;
        const wx0 = Math.max(0, 1 - Math.abs(-1 - fx) / 1.4), wx1 = 1 - Math.abs(fx) / 1.4, wx2 = Math.max(0, 1 - Math.abs(1 - fx) / 1.4);
        const wy0 = Math.max(0, 1 - Math.abs(-1 - fy) / 1.4), wy1 = 1 - Math.abs(fy) / 1.4, wy2 = Math.max(0, 1 - Math.abs(1 - fy) / 1.4);
        const v = (sb[p] * gain) / ((wx0 + wx1 + wx2) * (wy0 + wy1 + wy2)) * 2.2;
        let i0 = (iy - 1) * W + ix;
        accum[i0 - 1] += v * wx0 * wy0; accum[i0] += v * wx1 * wy0; accum[i0 + 1] += v * wx2 * wy0; i0 += W;
        accum[i0 - 1] += v * wx0 * wy1; accum[i0] += v * wx1 * wy1; accum[i0 + 1] += v * wx2 * wy1; i0 += W;
        accum[i0 - 1] += v * wx0 * wy2; accum[i0] += v * wx1 * wy2; accum[i0 + 1] += v * wx2 * wy2;
      }
      const data = img.data;
      for (let yy = 0; yy < bh; yy++) {
        let i = (by + yy) * W + bx, j = i * 4;
        for (let xx = 0; xx < bw; xx++, i++, j += 4) {
          const a = accum[i];
          if (a <= 0.004) { data[j + 3] = 0; continue; }
          data[j] = cr; data[j + 1] = cg; data[j + 2] = cb; data[j + 3] = a >= 1 ? 255 : a * 255;
        }
      }
      dctx.clearRect(0, 0, W, Hh);
      dctx.putImageData(img, 0, 0, bx, by, bw, bh);

      // dark body under the dots so the particle field never shows through the head
      const md = maskImg.data;
      for (let c = 0, j = 0; c < zbuf.length; c++, j += 4) {
        md[j] = 5; md[j + 1] = 5; md[j + 2] = 7;
        md[j + 3] = zbuf[c] > -1e8 ? cfg.occluder * fbuf[c] * 255 : 0;
      }
      mctx.putImageData(maskImg, 0, 0);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mask, 0, 0, cw * cell, ch * cell);
      ctx.drawImage(dots, 0, 0);
      // soft glow
      bctxA.clearRect(0, 0, bloomA.width, bloomA.height);
      bctxA.drawImage(dots, 0, 0, bloomA.width, bloomA.height);
      bctxB.clearRect(0, 0, bloomB.width, bloomB.height);
      bctxB.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * cfg.glow * 0.6;
      ctx.drawImage(bloomA, 0, 0, W, Hh);
      if (!isMobile) { ctx.globalAlpha = alpha * cfg.glow; ctx.drawImage(bloomB, 0, 0, W, Hh); }
      ctx.restore();
    }

    function frame(now) {
      if (!running) return;
      render(now - startTime);
      raf = requestAnimationFrame(frame);
    }

    let visible = false;
    function start() {
      visible = true;
      if (running || isStatic) return;
      running = true;
      if (!startTime) startTime = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() { visible = false; running = false; cancelAnimationFrame(raf); }

    return {
      init() { layout(); if (isStatic) render(0); },
      start,
      stop,
      resize() {
        layout();
        if (isStatic) { running = false; cancelAnimationFrame(raf); canvas.style.opacity = String(1 - scroll * 0.9); render(0); }
        else { canvas.style.opacity = ''; if (visible) start(); }
      },
      setPointer(nx, ny) { pointer.nx = nx; pointer.ny = ny; if (isStatic) { pointer.nx = pointer.ny = 0; } },
      setScroll(p) {
        scroll = clamp01(p);
        if (isStatic) canvas.style.opacity = String(1 - scroll * 0.9);
      },
    };
  }

  return { create };
})();
