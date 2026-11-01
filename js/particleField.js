/**
 * ParticleField — the hero background.
 *
 * Not a starfield: ~40k tiny dots packed into a soft cloud that is densest
 * behind the figure and along a rising ribbon, thinner behind the headline
 * and fading out at the edges. Every dot has a home position, a depth
 * (size / brightness / parallax) and is driven each frame by:
 *   1. slow "currents" — a coarse flow grid (one angle per cell) moves homes,
 *   2. cursor repulsion plus a tangential swirl (local density shift),
 *   3. a damped spring back home.
 * Drawing writes straight into an ImageData buffer at CSS resolution
 * (max-blend per pixel), which is what makes this density affordable.
 */
const ParticleField = (() => {
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const gauss = (dx, dy) => Math.exp(-(dx * dx + dy * dy));
  const CELL = 48; // css px per flow-grid cell

  function create(canvas, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    const pointer = { x: -1e5, y: -1e5, nx: 0, ny: 0, sx: 0, sy: 0 };
    let W = 0, H = 0, count = 0, isMobile = false;
    let homeX, homeY, posX, posY, velX, velY, depth, cell, alphaOf, bigDot;
    let image, pixels, lut, cols = 0, rowsN = 0, flowCos, flowSin;
    let raf = 0, running = false, startTime = 0;

    // Where dots live (0..1 — acceptance probability). Tuned for a figure on the right.
    function density(nx, ny) {
      const figX = isMobile ? 0.5 : 0.68;
      const figY = isMobile ? 0.72 : 0.52;
      let d = 0.05;
      d += 0.75 * gauss((nx - figX) / 0.28, (ny - figY) / 0.42);              // cloud behind the figure
      d += 0.2 * smooth(0.6, 1, ny);                                          // heavier floor
      // dense flowing ribbon rising from the floor to the upper right (PolyAI-like cloud)
      const ribbonY = isMobile ? 0.62 + 0.06 * Math.sin(nx * 6) : 0.97 - 0.55 * (nx - 0.3) + 0.06 * Math.sin(nx * 7);
      d += 0.9 * Math.exp(-Math.pow((ny - ribbonY) / 0.08, 2)) * (isMobile ? 1 : smooth(0.22, 0.45, nx));
      d += 0.18 * Math.pow(0.5 + 0.5 * Math.sin(nx * 9 + ny * 5 + Math.sin(ny * 7) * 1.4), 6); // fine currents
      if (!isMobile) {
        d *= 1 - cfg.textClearance * gauss((nx - 0.2) / 0.24, (ny - 0.46) / 0.3); // keep the headline clean
      } else {
        d *= 1 - cfg.textClearance * gauss((nx - 0.5) / 0.6, (ny - 0.28) / 0.22);
      }
      d *= smooth(0, 0.12, nx) * smooth(0, 0.12, 1 - nx) * smooth(0, 0.1, ny);  // vignette
      return Math.min(1, d);
    }

    function build() {
      const rect = canvas.getBoundingClientRect();
      // CSS resolution on purpose: 1 dot = 1 css px, crisp and cheap
      W = canvas.width = Math.max(1, Math.round(rect.width));
      H = canvas.height = Math.max(1, Math.round(rect.height));
      image = ctx.createImageData(W, H);
      pixels = new Uint32Array(image.data.buffer);
      isMobile = rect.width < breakpoints.mobile;
      const target = isMobile ? cfg.mobileCount
        : rect.width < breakpoints.tablet ? cfg.tabletCount : cfg.desktopCount;

      // packed RGBA per alpha level (little-endian: 0xAABBGGRR)
      const [r, g, b] = cfg.color.split(',').map((v) => parseInt(v, 10));
      lut = new Uint32Array(256);
      for (let a = 0; a < 256; a++) lut[a] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

      cols = Math.ceil(W / CELL) + 1; rowsN = Math.ceil(H / CELL) + 1;
      flowCos = new Float32Array(cols * rowsN); flowSin = new Float32Array(cols * rowsN);

      homeX = new Float32Array(target); homeY = new Float32Array(target);
      posX = new Float32Array(target); posY = new Float32Array(target);
      velX = new Float32Array(target); velY = new Float32Array(target);
      depth = new Float32Array(target); cell = new Uint32Array(target);
      alphaOf = new Uint8Array(target); bigDot = new Uint8Array(target);

      // Rejection sampling against the density map
      const n = cfg.depthBuckets;
      let i = 0, guard = 0;
      while (i < target && guard < target * 80) {
        guard++;
        const nx = Math.random(), ny = Math.random();
        if (Math.random() > density(nx, ny)) continue;
        homeX[i] = nx * W; homeY[i] = ny * H;
        depth[i] = Math.pow(Math.random(), 1.7);           // most dots far away, few close
        const bucket = Math.min(n - 1, Math.floor(depth[i] * n));
        alphaOf[i] = Math.round(cfg.alphas[bucket] * 255);
        bigDot[i] = cfg.sizes[bucket] >= 1.4 ? 1 : 0;
        cell[i] = Math.floor(homeY[i] / CELL) * cols + Math.floor(homeX[i] / CELL);
        // start slightly scattered — the field "settles" during the intro
        const spread = reducedMotion ? 0 : 0.06;
        posX[i] = homeX[i] + (Math.random() - 0.5) * W * spread;
        posY[i] = homeY[i] + (Math.random() - 0.5) * H * spread;
        velX[i] = velY[i] = 0;
        i++;
      }
      count = i;
    }

    function updateFlow(t) {
      const ft = t * cfg.flowSpeed;
      for (let cy = 0; cy < rowsN; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const a = Math.sin(cy * CELL * 0.0042 + ft) + Math.cos(cx * CELL * 0.003 - ft * 0.8);
          const k = cy * cols + cx;
          flowCos[k] = Math.cos(a * 1.6); flowSin[k] = Math.sin(a * 1.6);
        }
      }
    }

    function step(t) {
      updateFlow(t);
      const amp = cfg.flowAmp;
      const R = cfg.repelRadius, R2 = R * R;
      // pointer parallax is smoothed so the field never jerks
      pointer.sx += (pointer.nx - pointer.sx) * 0.05;
      pointer.sy += (pointer.ny - pointer.sy) * 0.05;
      const parX = pointer.sx * cfg.parallax, parY = pointer.sy * cfg.parallax * 0.6;
      const mx = pointer.x, my = pointer.y;

      for (let i = 0; i < count; i++) {
        const z = 0.35 + depth[i] * 0.65;
        const c = cell[i];
        const tx = homeX[i] + flowCos[c] * amp * z + parX * z;
        const ty = homeY[i] + flowSin[c] * amp * 0.7 * z + parY * z;

        let vx = velX[i] + (tx - posX[i]) * cfg.spring;
        let vy = velY[i] + (ty - posY[i]) * cfg.spring;

        const dx = posX[i] - mx, dy = posY[i] - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = 1 - d / R;
          const push = f * f * cfg.repelForce;
          vx += (dx / d) * push - (dy / d) * push * cfg.swirl * 0.4;
          vy += (dy / d) * push + (dx / d) * push * cfg.swirl * 0.4;
        }
        vx *= cfg.damping; vy *= cfg.damping;
        velX[i] = vx; velY[i] = vy;
        posX[i] += vx; posY[i] += vy;
      }
    }

    function plot(x, y, a) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = y * W + x;
      if ((pixels[p] >>> 24) < a) pixels[p] = lut[a];
    }

    function draw(introAlpha) {
      pixels.fill(0);
      for (let i = 0; i < count; i++) {
        const x = posX[i] | 0, y = posY[i] | 0;
        const a = (alphaOf[i] * introAlpha) | 0;
        plot(x, y, a);
        if (bigDot[i]) { const s = a >> 1; plot(x + 1, y, s); plot(x, y + 1, s); plot(x + 1, y + 1, s >> 1); }
      }
      ctx.putImageData(image, 0, 0);
    }

    function frame(now) {
      if (!running) return;
      const t = now - startTime;
      step(t);
      draw(Math.min(1, t / cfg.introMs));
      raf = requestAnimationFrame(frame);
    }

    function renderStatic() {
      for (let i = 0; i < count; i++) { posX[i] = homeX[i]; posY[i] = homeY[i]; }
      draw(1);
    }

    return {
      start() {
        if (running || reducedMotion) return;
        running = true;
        if (!startTime) startTime = performance.now();
        raf = requestAnimationFrame(frame);
      },
      stop() { running = false; cancelAnimationFrame(raf); },
      resize() { build(); if (reducedMotion || !running) renderStatic(); },
      setPointer(x, y, nx, ny) { pointer.x = x; pointer.y = y; pointer.nx = nx; pointer.ny = ny; },
      clearPointer() { pointer.x = pointer.y = -1e5; pointer.nx = pointer.ny = 0; },
      init() { build(); if (reducedMotion) renderStatic(); },
    };
  }

  return { create };
})();
