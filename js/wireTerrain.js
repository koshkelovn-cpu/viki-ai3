/**
 * WireTerrain — CTA band background: an endless monochrome wireframe landscape
 * in perspective (refs m1–m4): square grid, hidden lines removed, white / grey
 * lines by slope, light pulses running along the lines, soft glow.
 *
 * The relief is an infinite noise field locked to a world lattice. The wheel
 * moves the camera through it (forward and back) with eased inertia: rows are
 * recycled behind the distance fades, new mountains rise out of the horizon,
 * and the character of the relief morphs between soft hills and sharp ridges.
 * The wheel belongs to the mountains only while the cursor is over them and
 * they are fully in view; otherwise the page scrolls as usual and they stand still.
 * The cursor tilts and drifts the view through a spring.
 * Reduced motion: neutral pose, drawn once.
 */
const WireTerrain = (() => {
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) {
    return noise(x, y) * 0.55 + noise(x * 2.03 + 11, y * 2.03 + 5) * 0.28 + noise(x * 4.1 + 3, y * 4.1 + 17) * 0.17;
  }
  function ridged(x, y) {
    let sum = 0, amp = 0.6, f = 1;
    for (let k = 0; k < 4; k++) {
      const n = 1 - Math.abs(noise(x * f + k * 7.1, y * f - k * 3.3) * 2 - 1);
      sum += n * n * amp; amp *= 0.5; f *= 2.05;
    }
    return sum;
  }
  // world height: x across, z along the flight. A meandering valley keeps the camera's path open.
  function heightAt(x, z) {
    const mix = smooth(0.34, 0.66, noise(z * 0.07 + 7.3, 3.1));         // soft hills ↔ sharp ridges
    const hills = Math.pow(fbm(x * 0.34 + 40, z * 0.34), 1.6) * 1.5;
    const peaks = Math.pow(ridged(x * 0.26, z * 0.26), 1.7) * 1.9;
    const center = Math.sin(z * 0.16) * 1.1 + Math.sin(z * 0.061 + 2) * 0.9;
    const valley = smooth(0.25, 2.6, Math.abs(x - center));
    return (hills + (peaks - hills) * mix) * (0.08 + 0.92 * valley);
  }

  function create(canvas, hostEl, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    const bloomA = document.createElement('canvas'), bloomB = document.createElement('canvas');
    const bctxA = bloomA.getContext('2d'), bctxB = bloomB.getContext('2d');
    let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, isMobile = false, f = 1;
    let hts, keys, px, py, ok, shade;
    let jNear = 0, cell = cfg.cell, lowQuality = false, slowSum = 0, slowCount = 0;
    const pose = { yaw: 0, pitch: 0, drift: 0, vy: 0, vp: 0, vd: 0, ty: 0, tp: 0, td: 0 };
    let raf = 0, running = false, lastNow = 0;
    let camZ = 0, targetZ = 0;
    let pulses = [], segs = [];

    hostEl.addEventListener('pointermove', (e) => {
      const r = hostEl.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      pose.ty = nx * cfg.tiltYaw; pose.tp = ny * cfg.tiltPitch; pose.td = nx * cfg.drift;
    }, { passive: true });
    hostEl.addEventListener('pointerleave', () => { pose.ty = pose.tp = pose.td = 0; });

    // the whole relief must be on screen, not hidden under the floating nav or cut by the fold
    function fullyInView(rect) {
      const nav = document.querySelector('[data-nav]');
      const top = nav ? nav.getBoundingClientRect().bottom : 0;
      const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, top);
      return visible >= Math.min(rect.height, window.innerHeight - top) * cfg.zoom.minVisible;
    }

    // on the band, not the window: the rest of the page keeps its fast native scrolling
    hostEl.addEventListener('wheel', (e) => {
      if (!running || e.ctrlKey || !e.cancelable || e.target.closest('a, button')) return;
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      if (!fullyInView(rect)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? cfg.zoom.linePx : e.deltaMode === 2 ? cfg.zoom.pagePx : 1;
      const dy = Math.max(-cfg.zoom.maxEventPx, Math.min(cfg.zoom.maxEventPx, e.deltaY * unit));
      targetZ += dy * cfg.zoom.perPx;
    }, { passive: false });

    const slotOf = (j) => ((j % rows) + rows) % rows;
    // the 0.37 keeps a grid line from running dead straight up the middle of the frame
    const worldX = (c) => (c - (cols - 1) / 2 + 0.37) * cell;

    function build() {
      const rect = canvas.getBoundingClientRect();
      isMobile = window.innerWidth < breakpoints.mobile;
      dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
      W = canvas.width = Math.max(1, Math.round(rect.width * dpr));
      H = canvas.height = Math.max(1, Math.round(rect.height * dpr));
      bloomA.width = Math.max(1, W >> 2); bloomA.height = Math.max(1, H >> 2);
      bloomB.width = Math.max(1, W >> 3); bloomB.height = Math.max(1, H >> 3);
      f = Math.max(W * 0.62, H * 1.3);
      // a coarser grid keeps the same world distance with fewer lines
      cell = cfg.cell * (lowQuality ? cfg.coarseCell : 1);
      rows = Math.round((isMobile ? cfg.rowsMobile : cfg.rowsDesktop) / (lowQuality ? cfg.coarseCell : 1));
      // wide enough to reach both canvas edges at the far end of the grid
      const reach = cfg.near + rows * cell;
      cols = Math.min(isMobile ? cfg.colsMobile : cfg.colsDesktop, Math.ceil((reach * W) / f / cell) + 6);
      hts = new Float32Array(cols * rows);
      px = new Float32Array(cols * rows); py = new Float32Array(cols * rows);
      ok = new Uint8Array(cols * rows); shade = new Uint8Array(cols * rows);
      keys = new Int32Array(rows).fill(-2147483648);
      segs = Array.from({ length: rows }, () => []);
      const count = isMobile ? cfg.pulses.countMobile : cfg.pulses.count;
      pulses = Array.from({ length: count }, () => spawn({}, true));
    }

    function fillRows() {
      jNear = Math.ceil((camZ + cfg.near) / cell);
      for (let j = jNear; j < jNear + rows; j++) {
        const s = slotOf(j);
        if (keys[s] === j) continue;
        keys[s] = j;
        const z = j * cell;
        for (let c = 0; c < cols; c++) hts[s * cols + c] = heightAt(worldX(c), z) * cfg.height;
      }
    }

    function project() {
      const camY = cfg.cameraHeight, basePitch = cfg.pitch, pivot = cfg.pivot;
      const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
      const a = basePitch + pose.pitch, ca = Math.cos(a), sa = Math.sin(a);
      const centerY = H * cfg.horizon + f * Math.tan(basePitch);
      const far = cfg.near + rows * cell;
      for (let j = jNear; j < jNear + rows; j++) {
        const s = slotOf(j), d = j * cell - camZ;
        // mountains settle flat as they come close and rise out of the horizon: new relief never pops in
        const form = smooth(cfg.near + cell * 2, cfg.near + cfg.settle, d) * smooth(far, far * 0.72, d);
        for (let c = 0; c < cols; c++) {
          const i = s * cols + c;
          const X = worldX(c), Y = hts[i] * form - camY;
          const xz = X * cy - (d - pivot) * sy, zz = X * sy + (d - pivot) * cy + pivot;
          const yy = Y * ca + zz * sa, z2 = zz * ca - Y * sa;
          if (z2 < 0.12) { ok[i] = 0; continue; }
          ok[i] = 1;
          px[i] = W / 2 + (xz / z2) * f + pose.drift * dpr;
          py[i] = centerY - (yy / z2) * f;
        }
        // brightness bucket by slope: sides facing the light read white, the rest grey
        const n = slotOf(j - 1);
        for (let c = 0; c < cols; c++) {
          const i = s * cols + c;
          const dx = hts[s * cols + Math.min(cols - 1, c + 1)] - hts[s * cols + Math.max(0, c - 1)];
          const dz = hts[i] - hts[n * cols + c];
          const lit = 0.5 + (dx * -0.9 + dz * 0.8) * cfg.slopeLight;
          shade[i] = lit > 0.62 ? 2 : lit > 0.42 ? 1 : 0;
        }
      }
    }

    // ---- pulses: walk the lattice line by line, turning at the crossings ----
    function spawn(p, anywhere) {
      const span = rows - 6;
      p.c = 3 + Math.floor(Math.random() * Math.max(1, cols - 6));
      p.j = jNear + 2 + Math.floor((anywhere ? Math.random() : 0.15 + Math.random() * 0.85) * span);
      p.dir = Math.floor(Math.random() * 4);    // 0 +x, 1 -x, 2 +z (away), 3 -z (toward the viewer)
      p.frac = 0;
      p.trail = [[p.c, p.j]];
      p.speed = cfg.pulses.speed * (0.7 + Math.random() * 0.6);
      p.born = lastNow;
      p.delay = anywhere ? Math.random() * 1500 : Math.random() * 400;
      return p;
    }
    const DC = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
    function stepPulse(p, dt) {
      if (lastNow - p.born < p.delay) return;
      p.frac += p.speed * dt;
      while (p.frac >= 1) {
        p.frac -= 1;
        p.c += DC[p.dir]; p.j += DJ[p.dir];
        p.trail.push([p.c, p.j]);
        if (p.trail.length > cfg.pulses.trail + 1) p.trail.shift();
        if (Math.random() < cfg.pulses.turn) {
          const side = Math.random() < 0.5 ? 0 : 1;
          p.dir = p.dir < 2 ? 2 + side : side;
        }
        if (p.c < 1 || p.c > cols - 2 || p.j <= jNear + 1 || p.j >= jNear + rows - 3) { spawn(p, false); return; }
      }
      if (p.j <= jNear + 1 || p.j >= jNear + rows - 3) spawn(p, false);    // the camera flew past it
    }
    function collectPulseSegments() {
      for (let s = 0; s < rows; s++) segs[s].length = 0;
      for (const p of pulses) {
        if (lastNow - p.born < p.delay) continue;
        const nx = p.c + DC[p.dir], nj = p.j + DJ[p.dir];
        const pts = p.trail.slice();
        pts.push([nx, nj]);
        const n = pts.length - 1;
        for (let k = 0; k < n; k++) {
          const a = pts[k], b = pts[k + 1];
          if (a[1] < jNear || a[1] >= jNear + rows || b[1] < jNear || b[1] >= jNear + rows) continue;
          if (a[0] < 0 || a[0] >= cols || b[0] < 0 || b[0] >= cols) continue;
          const head = k === n - 1;
          // tail fades smoothly as it slides: position along the trail, not whole steps
          const age = (n - 1 - k + p.frac) / Math.max(1, n - 1);
          const strength = clamp01(1 - age);
          const strip = slotOf(Math.max(a[1], b[1]));    // a segment is drawn with the strip it lies on
          segs[strip].push({ a, b, strength, t: head ? p.frac : 1 });
        }
      }
    }

    function drawPulses(s, fade) {
      const list = segs[s];
      if (!list.length) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const g of list) {
        const ia = slotOf(g.a[1]) * cols + g.a[0], ib = slotOf(g.b[1]) * cols + g.b[0];
        if (!ok[ia] || !ok[ib]) continue;
        const x0 = px[ia], y0 = py[ia];
        const x1 = x0 + (px[ib] - x0) * g.t, y1 = y0 + (py[ib] - y0) * g.t;
        const al = g.strength * g.strength * fade * cfg.pulses.alpha;
        ctx.strokeStyle = `rgba(255,255,255,${(al * 0.1).toFixed(3)})`;
        ctx.lineWidth = 6.5 * dpr;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${(al * 0.28).toFixed(3)})`;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`;
        ctx.lineWidth = 1.35 * dpr;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      ctx.globalCompositeOperation = 'source-over';
    }

    function render() {
      fillRows();
      project();
      ctx.clearRect(0, 0, W, H);
      collectPulseSegments();
      const far = cfg.near + rows * cell;
      ctx.lineWidth = cfg.lineWidth * dpr;
      // far → near: each strip erases what it hides, then draws its own lines (hidden-line removal)
      for (let j = jNear + rows - 1; j > jNear; j--) {
        const s = slotOf(j), n = slotOf(j - 1), d = j * cell - camZ;
        const fade = smooth(far, far * 0.8, d) * smooth(cfg.near, cfg.near + cell * 2, d);
        if (fade <= 0.002) continue;
        const so = s * cols, no = n * cols;

        // only the part of the strip that reaches the canvas: near rows are many times wider than it
        const margin = 12 * dpr;
        let cMin = cols, cMax = -1, top = Infinity;
        for (let c = 0; c < cols; c++) {
          const a = so + c, m = no + c;
          const inA = ok[a] && px[a] > -margin && px[a] < W + margin;
          const inM = ok[m] && px[m] > -margin && px[m] < W + margin;
          if (!inA && !inM) continue;
          if (c < cMin) cMin = c;
          if (c > cMax) cMax = c;
          if (ok[a] && py[a] < top) top = py[a];
          if (ok[m] && py[m] < top) top = py[m];
        }
        if (cMax < 0 || top > H + margin) { if (segs[s].length) drawPulses(s, fade); continue; }
        cMin = Math.max(0, cMin - 1); cMax = Math.min(cols - 1, cMax + 1);

        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${fade.toFixed(3)})`;
        ctx.beginPath();
        let open = false;
        for (let c = cMin; c <= cMax; c++) {
          const i = so + c;
          if (!ok[i]) continue;
          if (!open) { ctx.moveTo(px[i], py[i]); open = true; } else ctx.lineTo(px[i], py[i]);
        }
        for (let c = cMax; c >= cMin; c--) {
          const i = no + c;
          if (ok[i]) ctx.lineTo(px[i], py[i]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // nearer rows are a little brighter; far rows are dense and add up by themselves
        const depth = 1 - 0.45 * clamp01(d / far);
        for (let b = 0; b < 3; b++) {
          ctx.strokeStyle = `rgba(${cfg.lineGrey[b]},${cfg.lineGrey[b]},${cfg.lineGrey[b]},${(cfg.lineAlpha[b] * depth * fade).toFixed(3)})`;
          ctx.beginPath();
          for (let c = cMin; c <= cMax; c++) {
            const i = so + c;
            if (!ok[i] || shade[i] !== b) continue;
            if (c < cMax && ok[i + 1]) { ctx.moveTo(px[i], py[i]); ctx.lineTo(px[i + 1], py[i + 1]); }
            const m = no + c;
            if (ok[m]) { ctx.moveTo(px[i], py[i]); ctx.lineTo(px[m], py[m]); }
          }
          ctx.stroke();
        }
        drawPulses(s, fade);
        ctx.lineWidth = cfg.lineWidth * dpr;
      }

      // soft glow over everything
      if (cfg.glow <= 0) return;
      bctxA.clearRect(0, 0, bloomA.width, bloomA.height);
      bctxA.drawImage(canvas, 0, 0, bloomA.width, bloomA.height);
      bctxB.clearRect(0, 0, bloomB.width, bloomB.height);
      bctxB.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = cfg.glow * 0.7;
      ctx.drawImage(bloomA, 0, 0, W, H);
      ctx.globalAlpha = cfg.glow;
      ctx.drawImage(bloomB, 0, 0, W, H);
      ctx.restore();
    }

    // slow device: after a slow stretch switch once to a coarser grid
    function watchFrameRate(ms) {
      if (lowQuality || !ms || ms > 250) return;   // a long gap = hidden tab, not a slow device
      slowSum += ms; slowCount++;
      if (slowCount < cfg.slowFrames) return;
      if (slowSum / slowCount > cfg.slowFrameMs) { lowQuality = true; build(); }
      slowSum = 0; slowCount = 0;
    }

    function frame(now) {
      if (!running) return;
      watchFrameRate(lastNow ? now - lastNow : 0);
      const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);    // seconds; a long gap never makes a jump
      lastNow = now;
      pose.vy = (pose.vy + (pose.ty - pose.yaw) * cfg.spring) * 0.85; pose.yaw += pose.vy;
      pose.vp = (pose.vp + (pose.tp - pose.pitch) * cfg.spring) * 0.85; pose.pitch += pose.vp;
      pose.vd = (pose.vd + (pose.td - pose.drift) * cfg.spring) * 0.85; pose.drift += pose.vd;
      // inertia: frame-rate independent, and the speed is limited so the flight never lurches
      const lag = targetZ - camZ;
      const step = lag * (1 - Math.exp(-dt / cfg.zoom.easeSec));
      const maxStep = cfg.zoom.maxSpeed * dt;
      camZ += Math.max(-maxStep, Math.min(maxStep, step));
      fillRows();
      for (const p of pulses) stepPulse(p, dt);
      render();
      raf = requestAnimationFrame(frame);
    }

    return {
      init() { build(); render(); },
      resize() { build(); render(); },
      start() {
        if (running || reducedMotion) return;
        running = true; lastNow = 0;
        raf = requestAnimationFrame(frame);
      },
      stop() { running = false; cancelAnimationFrame(raf); },
    };
  }

  return { create };
})();
