/**
 * VoiceSilhouette — the hero figure: an abstract, faceless bust rendered as
 * ridged "liquid chrome" scan lines.
 *
 * Body volume = metaball field: a soft union of rotated ellipses (head, neck,
 * shoulders, chest, arms). Each horizontal scan line is lifted by the field
 * height, so the lines wrap the volume like a contour scan. Per-sample shading
 * is diffuse + chrome specular + rim light, written into one gradient per line.
 * Bloom comes from a cheap downscale → upscale pass composited with 'lighter'.
 *
 * Motion: lines condense out of noise on load, the torso breathes (±1.5 %),
 * the cursor moves the key light and parallaxes body parts by depth, a soft
 * ripple leaves the throat now and then (the voice), scroll dissolves it all.
 */
const VoiceSilhouette = (() => {
  // [x, y, rx, ry, rotation, weight, parallax depth, breathes]
  // Units: fractions of figure height; x = 0 is the figure's centre line, y = 0 its top.
  const BODY = [
    [0.02, 0.15, 0.136, 0.152, -0.15, 1.0, 1.0, 0],   // cranium
    [0.0, 0.248, 0.104, 0.092, -0.3, 1.0, 1.1, 0],    // jaw, slightly turned — no features
    [0.01, 0.365, 0.062, 0.11, 0.06, 1.0, 0.9, 0],    // neck
    [-0.11, 0.488, 0.14, 0.042, 0.5, 0.8, 0.8, 1],    // trapezius L (sloping)
    [0.12, 0.492, 0.14, 0.042, -0.48, 0.8, 0.8, 1],   // trapezius R
    [-0.24, 0.6, 0.095, 0.085, 0.45, 1.0, 0.6, 1],    // shoulder L
    [0.25, 0.605, 0.095, 0.085, -0.45, 1.0, 0.6, 1],  // shoulder R
    [0.0, 0.705, 0.215, 0.17, 0.0, 1.05, 1.0, 1],     // chest
    [-0.31, 0.845, 0.072, 0.2, 0.12, 1.0, 0.5, 0],    // upper arm L
    [0.32, 0.855, 0.072, 0.2, -0.12, 1.0, 0.5, 0],    // upper arm R
    [0.0, 0.95, 0.19, 0.19, 0.0, 1.0, 0.9, 1],        // abdomen
  ];
  // Same figure, natural shoulders: the neck base flares into one continuous
  // trapezius slope that rolls over rounded deltoids (no crest / hump).
  // Selected with CONFIG.silhouette.body = 'natural'; BODY above is kept as 'v1'.
  const BODY_NATURAL = [
    [0.02, 0.15, 0.136, 0.152, -0.15, 1.0, 1.0, 0],   // cranium (unchanged)
    [0.0, 0.248, 0.104, 0.092, -0.3, 1.0, 1.1, 0],    // jaw (unchanged)
    [0.01, 0.37, 0.066, 0.118, 0.04, 1.0, 0.9, 0],    // neck, slightly fuller at the base
    [0.0, 0.545, 0.12, 0.06, 0.0, 0.55, 0.9, 1],      // neck base / upper chest bridge (soft)
    [-0.115, 0.53, 0.14, 0.048, 0.44, 0.78, 0.8, 1],  // trapezius L — slopes down and out from the neck
    [0.125, 0.533, 0.14, 0.048, -0.44, 0.78, 0.8, 1], // trapezius R
    [-0.25, 0.625, 0.095, 0.1, 0.3, 1.0, 0.6, 1],     // deltoid L (rounded cap, lower)
    [0.26, 0.63, 0.095, 0.1, -0.3, 1.0, 0.6, 1],      // deltoid R
    [0.0, 0.705, 0.225, 0.17, 0.0, 1.05, 1.0, 1],     // chest
    [-0.315, 0.845, 0.076, 0.2, 0.1, 1.0, 0.5, 0],    // upper arm L
    [0.325, 0.855, 0.076, 0.2, -0.1, 1.0, 0.5, 0],    // upper arm R
    [0.0, 0.95, 0.19, 0.19, 0.0, 1.0, 0.9, 1],        // abdomen
  ];
  // 'human' body: an explicit anatomical half-width profile w(y) instead of
  // blending blobs (blobs always look inflated). Head with a narrower jaw → neck
  // → trapezius slope (~20°) → acromion → rounded deltoid → arm along the body.
  function humanWidth(y) {
    let head = 0;
    const t = (y - 0.145) / 0.155;
    if (t > -1 && t < 1) head = 0.112 * Math.sqrt(1 - t * t) * (t > 0 ? 1 - 0.3 * t * t : 1);
    let neck = 0;
    if (y > 0.24 && y < 0.5) neck = 0.052 + 0.012 * smoothStep(0.36, 0.43, y);
    let torso = 0;
    if (y > 0.415) {
      torso = 0.062 + 0.168 * smoothStep(0.415, 0.52, y);       // trapezius slope
      const dy = y - 0.585, r = 0.08;
      if (Math.abs(dy) < r) torso = Math.max(torso, 0.205 + Math.sqrt(r * r - dy * dy)); // deltoid cap
      else if (dy > 0) torso = Math.max(torso, 0.285 - 0.035 * dy);                        // upper arm
    }
    return Math.max(head, neck, torso);
  }
  function smoothStep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // 'reference' body: mask + volume map taken from the reference image (js/silhouetteRef.js),
  // so pose, head tilt, neck curve and shoulder line match it exactly.
  const REF = (() => {
    if (typeof SILHOUETTE_REF === 'undefined') return null;
    const dec = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { w: SILHOUETTE_REF.w, h: SILHOUETTE_REF.h, aspect: SILHOUETTE_REF.aspect,
      mask: dec(SILHOUETTE_REF.mask), height: dec(SILHOUETTE_REF.height) };
  })();
  function sampleRef(arr, u, v) {
    const x = u * (REF.w - 1), y = v * (REF.h - 1);
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(REF.w - 1, x0 + 1), y1 = Math.min(REF.h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = arr[y0 * REF.w + x0] + (arr[y0 * REF.w + x1] - arr[y0 * REF.w + x0]) * fx;
    const b = arr[y1 * REF.w + x0] + (arr[y1 * REF.w + x1] - arr[y1 * REF.w + x0]) * fx;
    return (a + (b - a) * fy) / 255;
  }

  const THROAT = [0.01, 0.405];
  const STERNUM = [-0.01, 0.615];

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function create(canvas, figureEl, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    const bloomA = document.createElement('canvas');
    const bloomB = document.createElement('canvas');
    const bctxA = bloomA.getContext('2d');
    const bctxB = bloomB.getContext('2d');
    const useRef = cfg.body === 'reference' && !!REF;
    const human = cfg.body === 'human';
    const body = cfg.body === 'natural' ? BODY_NATURAL : BODY;   // blob sets ('human' ignores them)
    const pose = { px: 0, py: 0, breath: 1 };
    const blobs = body.map(() => ({ x: 0, y: 0, c: 1, s: 0, irx: 1, iry: 1, w: 1 }));

    let W = 0, H = 0, dpr = 1, rows = 0, samples = 0, isMobile = false;
    let fig = { cx: 0, top: 0, size: 1 };
    let hRow, hPrev, fRow;
    let raf = 0, running = false, startTime = 0;
    let scroll = 0;
    const pointer = { nx: 0, ny: 0, sx: 0, sy: 0 };
    const ripples = [];
    let nextRipple = 0;

    function layout() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
      W = canvas.width = Math.max(1, Math.round(rect.width * dpr));
      H = canvas.height = Math.max(1, Math.round(rect.height * dpr));
      bloomA.width = Math.max(1, Math.round(W / 4)); bloomA.height = Math.max(1, Math.round(H / 4));
      bloomB.width = Math.max(1, Math.round(W / 10)); bloomB.height = Math.max(1, Math.round(H / 10));
      isMobile = rect.width < breakpoints.mobile;
      rows = isMobile ? cfg.rowsMobile : cfg.rowsDesktop;
      samples = isMobile ? cfg.samplesMobile : cfg.samplesDesktop;
      hRow = new Float32Array(samples); hPrev = new Float32Array(samples); fRow = new Float32Array(samples);

      // The figure is placed by CSS: .hero__figure is an empty layout box.
      const f = figureEl.getBoundingClientRect();
      const scale = parseFloat(getComputedStyle(figureEl).getPropertyValue('--figure-scale')) || 1;
      const size = Math.min(f.height, f.width * 1.3) * scale;
      fig = {
        cx: (f.left - rect.left + f.width / 2) * dpr,
        top: (f.top - rect.top + Math.max(0, f.height - size) * 0.35) * dpr,
        size: size * dpr,
      };
    }

    // Move/scale body parts for this frame (breath + depth parallax), precompute rotation.
    function poseBody(t) {
      const breath = reducedMotion ? 0 : Math.sin((t / cfg.breathPeriodMs) * Math.PI * 2);
      const bs = 1 + breath * cfg.breathScale;
      const px = (pointer.sx * cfg.parallax * dpr) / fig.size;
      const py = (pointer.sy * cfg.parallax * 0.5 * dpr) / fig.size;
      pose.px = px; pose.py = py; pose.breath = bs;
      for (let i = 0; i < body.length; i++) {
        const [x, y, rx, ry, rot, w, depth, breathes] = body[i];
        const k = breathes ? bs : 1;
        const b = blobs[i];
        b.x = x * (breathes ? 1 + breath * cfg.breathScale * 0.5 : 1) + px * depth;
        b.y = y - (breathes ? breath * 0.004 : 0) + py * depth;
        b.c = Math.cos(rot); b.s = Math.sin(rot);
        b.irx = 1 / (rx * k); b.iry = 1 / (ry * k); b.w = w;
      }
    }

    // Human profile field: cylinder-like cross-section (not a balloon), returned on the
    // same scale as the blob field so shading, rim, occluder and accents work unchanged.
    function humanField(px, py) {
      const y = py - pose.py;
      // head leans a touch, torso follows the cursor less than the head (depth parallax)
      const cx = pose.px * (1 - 0.3 * smooth(0.3, 0.5, y)) + 0.012 * (1 - smooth(0.33, 0.45, y));
      let w = humanWidth(y);
      if (w <= 0) return 0;
      if (y > 0.45) w *= pose.breath;
      const dx = Math.abs(px - cx);
      if (dx >= w) return Math.max(0, 0.4 - (dx - w) * 6);
      const q = dx / w;
      let h = Math.sqrt(1 - q * q) * Math.min(0.9, 0.55 + w);
      // anatomy hints: collarbones, sternum line, arm / chest separation
      const cl = y - (0.47 + 0.11 * dx);
      if (y > 0.43 && y < 0.56 && dx < 0.2) h *= 1 + 0.07 * Math.exp(-(cl * cl) / 0.00014);
      if (y > 0.5) h *= 1 - 0.1 * Math.exp(-((px - cx) ** 2) / 0.0003) * smooth(0.5, 0.6, y);
      if (y > 0.6) { const g = (dx - (w - 0.076)) / 0.014; h *= 1 - 0.32 * Math.exp(-g * g) * smooth(0.6, 0.72, y); }
      return 0.4 + 1.3 * Math.pow(Math.min(1, h), 1 / 0.55);
    }

    // Reference field: same f scale as the other bodies (edge ≈ 0.4), so shading,
    // rim light, occluder and the scan lines work unchanged.
    function refField(px, py) {
      const s = cfg.refScale, v = (py - pose.py - cfg.refTop) / s;
      if (v < 0 || v >= 1) return 0;
      let u = (px - pose.px * (1 - 0.3 * v) - cfg.refOffsetX) / (REF.aspect * s) + 0.5;
      if (v > 0.55) u = 0.5 + (u - 0.5) / pose.breath;          // chest breathes a little
      if (u < 0 || u >= 1) return 0;
      // (the photo frame cuts the shoulders: that is dissolved via line brightness — see refSide)
      const m = sampleRef(REF.mask, u, v);
      if (m < 0.5) return 0.8 * m;
      const h = sampleRef(REF.height, u, v);
      return 0.4 + (m - 0.5) * 0.2 + 1.3 * Math.pow(h, 1 / 0.55);
    }

    // 0..1 brightness fade toward the left/right borders of the reference frame,
    // so cut-off shoulders melt into the particles instead of ending in a vertical edge.
    function refSide(px) {
      if (!useRef) return 1;
      const u = (px - cfg.refOffsetX) / (REF.aspect * cfg.refScale) + 0.5;
      return smooth(0, cfg.refSideFade, u) * smooth(0, cfg.refSideFade, 1 - u);
    }

    function field(px, py) {
      if (useRef) return refField(px, py);
      if (human) return humanField(px, py);
      let f = 0;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const dx = px - b.x, dy = py - b.y;
        const u = (dx * b.c + dy * b.s) * b.irx;
        const v = (dy * b.c - dx * b.s) * b.iry;
        const d2 = u * u + v * v;
        if (d2 < 9) f += b.w * Math.exp(-d2);
      }
      return f;
    }
    const heightOf = (f) => (f > 0.4 ? Math.pow(Math.min(1, (f - 0.4) / 1.3), 0.55) : 0);

    function drawBackdrop(alpha) {
      const S = fig.size, cx = fig.cx;
      // volumetric light behind the chest
      const gy = fig.top + S * 0.52;
      const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, S * 0.62);
      g.addColorStop(0, `rgba(${cfg.color}, ${cfg.volumeGlow * alpha})`);
      g.addColorStop(1, `rgba(${cfg.color}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - S, fig.top - S * 0.2, S * 2, S * 1.6);

      // concentric rings + hairline cross (Solvana-like, barely there) — off when CONFIG.showRings = false
      if (!cfg.showRings) return;
      const ry = fig.top + S * 0.42;
      ctx.lineWidth = dpr;
      ctx.strokeStyle = `rgba(255, 255, 255, ${cfg.ringAlpha * alpha})`;
      ctx.beginPath();
      for (const r of cfg.rings) { ctx.moveTo(cx + r * S, ry); ctx.arc(cx, ry, r * S, 0, Math.PI * 2); }
      const R = cfg.rings[cfg.rings.length - 1] * S * 1.15;
      ctx.moveTo(cx - R, ry); ctx.lineTo(cx + R, ry);
      ctx.moveTo(cx, ry - R); ctx.lineTo(cx, ry + R);
      ctx.stroke();
    }

    function drawLines(t, alpha, assemble) {
      const S = fig.size;
      const x0 = -0.56, x1 = 0.56, y0 = 0.02, y1 = 1.08;
      const dxU = (x1 - x0) / (samples - 1);
      const dyU = (y1 - y0) / (rows - 1);
      const ridge = cfg.ridgeDepth * S;
      const wave = cfg.flowWave * dpr;
      const waveT = reducedMotion ? 0 : t * cfg.flowSpeed;
      // key light follows the cursor a little
      let lx = 0.5 + pointer.sx * cfg.lightShift, ly = -0.55 + pointer.sy * cfg.lightShift * 0.6, lz = 0.65;
      const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
      let hx = lx, hy = ly, hz = lz + 1;
      const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;

      // slow diagonal sheen sliding over the chrome
      const sweep = reducedMotion ? 0.55 : ((t * cfg.sheenSpeed) % 1.8) - 0.4;

      const noiseAmp = (1 - assemble) * (1 - assemble) * S * 0.22 + scroll * scroll * S * 0.12;
      const noiseSeed = assemble < 1 ? Math.floor(t / 50) * 7.31 : 0;
      const lift = scroll * S * 0.08;

      ctx.lineWidth = cfg.lineWidth * dpr;
      ctx.lineJoin = 'round';
      hPrev.fill(0);
      const TH = 0.42;                  // body outline level for the occluder
      const edgeL = [], edgeR = [];

      for (let r = 0; r < rows; r++) {
        const yu = y0 + r * dyU;
        let first = -1, last = -1, inL = -1, inR = -1;
        for (let j = 0; j < samples; j++) {
          const f = field(x0 + j * dxU, yu);
          fRow[j] = f;
          hRow[j] = heightOf(f);
          if (f > 0.3) { if (first < 0) first = j; last = j; }
          if (f > TH) { if (inL < 0) inL = j; inR = j; }
        }
        if (inL > 0 && inR < samples - 1) {
          // sub-sample outline crossings so the occluder edge is smooth
          let eL = x0 + (inL - 1 + (TH - fRow[inL - 1]) / (fRow[inL] - fRow[inL - 1])) * dxU;
          let eR = x0 + (inR + (fRow[inR] - TH) / (fRow[inR] - fRow[inR + 1])) * dxU;
          if (useRef) {                   // keep the occluder off the dissolving frame borders
            const half = REF.aspect * cfg.refScale * (0.5 - cfg.refSideFade * 0.55);
            eL = Math.max(eL, cfg.refOffsetX - half); eR = Math.min(eR, cfg.refOffsetX + half);
          }
          const y = fig.top + yu * S - lift;
          edgeL.push(fig.cx + eL * S, y); edgeR.push(fig.cx + eR * S, y);
        }
        if (first < 0) { hPrev.fill(0); continue; }

        const a = Math.max(0, first - 1), b = Math.min(samples - 1, last + 1);
        const fade = 1 - smooth(0.74, 1.06, yu);                   // figure dissolves into the floor
        const rowReveal = clamp01(assemble * 1.5 - (1 - r / rows) * 0.5);
        const rowY = fig.top + yu * S - lift;
        const xa = fig.cx + (x0 + a * dxU) * S, xb = fig.cx + (x0 + b * dxU) * S;
        const grad = ctx.createLinearGradient(xa, 0, xb, 0);
        ctx.beginPath();

        for (let j = a; j <= b; j++) {
          const f = fRow[j], h = hRow[j];
          const dhdx = (hRow[Math.min(b, j + 1)] - hRow[Math.max(a, j - 1)]) / (2 * dxU);
          const dhdy = (h - hPrev[j]) / dyU;
          let nx = -dhdx * 0.09, ny = -dhdy * 0.09, nz = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
          const spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 22);
          const mask = smooth(0.36, 0.56, f) * fade;
          const rim = mask * (1 - smooth(0.5, 0.95, f));
          const sd = (x0 + j * dxU) * 0.55 + yu * 0.45 - sweep;
          const sheen = Math.exp(-(sd * sd) / 0.004) * h * cfg.sheen;
          const I = clamp01(mask * (cfg.baseLight + 0.16 * diffuse + 1.25 * spec + sheen) + rim * 0.8) * alpha * rowReveal
            * refSide(x0 + j * dxU);

          let X = fig.cx + (x0 + j * dxU) * S;
          let Y = rowY - h * ridge + Math.sin((x0 + j * dxU) * 16 + waveT + r * 0.42) * h * wave;
          if (noiseAmp > 0.5) {
            X += (hash(r * 131.7 + j * 7.13 + noiseSeed) - 0.5) * noiseAmp;
            Y += (hash(r * 17.3 + j * 91.7 + noiseSeed) - 0.5) * noiseAmp * 0.6 - hash(j * 3.1 + r) * scroll * S * 0.15;
          }
          if (j === a) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
          if ((j - a) % 3 === 0 || j === b) {
            grad.addColorStop((j - a) / Math.max(1, b - a), `rgba(${cfg.color}, ${I.toFixed(3)})`);
          }
        }
        ctx.strokeStyle = grad;
        ctx.stroke();
        hPrev.set(hRow);
      }
      drawOccluder(edgeL, edgeR, alpha * assemble);
    }

    // Dark body fill slid *under* the lines (destination-over) so the particle
    // field behind never shows through the figure; it fades with the body into the floor.
    function drawOccluder(edgeL, edgeR, alpha) {
      if (edgeL.length < 6 || alpha <= 0.01) return;
      const S = fig.size;
      const g = ctx.createLinearGradient(0, fig.top + S * 0.72, 0, fig.top + S * 1.04);
      g.addColorStop(0, `rgba(5, 5, 7, ${cfg.occluder * alpha})`);
      g.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(edgeL[0], edgeL[1]);
      for (let i = 2; i < edgeL.length; i += 2) ctx.lineTo(edgeL[i], edgeL[i + 1]);
      for (let i = edgeR.length - 2; i >= 0; i -= 2) ctx.lineTo(edgeR[i], edgeR[i + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Accent points (throat, sternum) + voice ripples from the throat
    function drawAccents(t, alpha) {
      const S = fig.size;
      let throatX = 0, throatY = 0;
      [THROAT, STERNUM].forEach(([ux, uy], k) => {
        if (k === 0 && !cfg.throatAccent) return;             // neck point switched off in CONFIG
        if (k === 1 && !cfg.sternumAccent) return;            // chest point switched off in CONFIG
        const h = heightOf(field(ux, uy));
        const x = fig.cx + ux * S, y = fig.top + uy * S - h * cfg.ridgeDepth * S - scroll * S * 0.08;
        const pulse = reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t / 900 + k * 1.7);
        const r = (10 + pulse * 8) * dpr;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255, 255, 255, ${(0.45 + pulse * 0.3) * alpha})`);
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * alpha})`;
        ctx.fillRect(x - dpr, y - dpr, dpr * 2, dpr * 2);
        if (k === 0) { throatX = x; throatY = y; }
      });

      if (reducedMotion || !cfg.throatAccent) return;        // ripples belong to the neck point
      if (t > nextRipple) {
        ripples.push({ born: t });
        nextRipple = t + cfg.accentPulseMs * (0.7 + Math.random() * 0.6);
      }
      ctx.lineWidth = dpr;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = (t - ripples[i].born) / 2400;
        if (p >= 1) { ripples.splice(i, 1); continue; }
        const e = easeOut(p);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - p) * 0.32 * alpha})`;
        ctx.beginPath();
        ctx.ellipse(throatX, throatY, 6 * dpr + e * S * 0.2, 2 * dpr + e * S * 0.06, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function bloom() {
      bctxA.clearRect(0, 0, bloomA.width, bloomA.height);
      bctxA.drawImage(canvas, 0, 0, bloomA.width, bloomA.height);
      bctxB.clearRect(0, 0, bloomB.width, bloomB.height);
      bctxB.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = cfg.glow * 0.7;
      ctx.drawImage(bloomA, 0, 0, W, H);
      if (!isMobile) { ctx.globalAlpha = cfg.glow * 0.8; ctx.drawImage(bloomB, 0, 0, W, H); }
      ctx.restore();
    }

    function render(t) {
      pointer.sx += (pointer.nx - pointer.sx) * 0.06;
      pointer.sy += (pointer.ny - pointer.sy) * 0.06;
      const assemble = reducedMotion ? 1 : easeOut(clamp01((t - cfg.assembleDelayMs) / cfg.assembleMs));
      const breathAlpha = reducedMotion ? 1 : 1 - 0.02 * (0.5 + 0.5 * Math.sin((t / cfg.breathPeriodMs) * Math.PI * 2));
      const alpha = assemble * breathAlpha * (1 - scroll * 0.9);

      ctx.clearRect(0, 0, W, H);
      if (alpha <= 0.002) return;
      poseBody(t);
      drawBackdrop(alpha);
      drawLines(t, alpha, assemble);
      drawAccents(t, alpha * assemble);
      bloom();
    }

    function frame(now) {
      if (!running) return;
      render(now - startTime);
      raf = requestAnimationFrame(frame);
    }

    return {
      init() { layout(); if (reducedMotion) render(0); },
      start() {
        if (running || reducedMotion) return;
        running = true;
        if (!startTime) startTime = performance.now();
        raf = requestAnimationFrame(frame);
      },
      stop() { running = false; cancelAnimationFrame(raf); },
      resize() { layout(); if (reducedMotion) render(0); },
      setPointer(nx, ny) { pointer.nx = nx; pointer.ny = ny; },
      setScroll(p) {
        scroll = clamp01(p);
        if (reducedMotion) canvas.style.opacity = String(1 - scroll * 0.9);
      },
    };
  }

  return { create };
})();
