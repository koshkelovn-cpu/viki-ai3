/**
 * FlowStage — one viewport-sized sticky canvas behind sections 2 and 3.
 *
 * Section 2: two particle columns (Ionic capital + fluted shaft) stand at the
 * sides, very dim, with a slow per-dot shimmer. Their shafts dissolve at the
 * bottom and continue as soft streams into…
 * Section 3: an organic "particle smoke" field (after the mp45 reference):
 * screen-space grain whose density follows a slowly flowing, domain-warped
 * scalar field; luminous filaments sit on two of its level sets.
 *
 * Everything is world-anchored (stage coordinates), so scrolling moves forms
 * continuously from one section into the next — no cut, no pop-in.
 * Rendering writes 1-css-px dots into an ImageData buffer (cheap at density).
 * Static mode (mobile / reduced motion): fixed time, no shimmer, redraw on scroll only.
 */
const FlowStage = (() => {
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // small deterministic RNG so the columns keep their shape across resizes
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Column template — density at (xr, v): xr = x / shaft width from centre, v = 0..1 top→bottom
  function columnDensity(xr, v, cw, ch, flutes) {
    const ax = Math.abs(xr);
    if (v < 0.03) return ax < 0.66 ? 0.9 : ax < 0.72 ? 0.1 : 0;          // abacus
    if (v < 0.15) {                                                      // volutes + echinus
      for (const s of [-1, 1]) {
        const dx = (xr - s * 0.5) * cw, dy = (v - 0.09) * ch;
        const rr = Math.hypot(dx, dy), R = 0.2 * cw;
        if (rr < R) {                                                     // spiral: bright groove follows r ∝ angle
          const th = (Math.atan2(dy, dx) * s + Math.PI) / (Math.PI * 2);
          const phase = (rr / R) * 2.2 - th;
          return 0.2 + 0.8 * Math.pow(Math.abs(Math.cos(phase * Math.PI)), 3);
        }
      }
      if (v > 0.035 && v < 0.1) return ax < 0.42 ? 0.35 + 0.55 * Math.pow(Math.max(0, Math.sin(xr * 38)), 2) : 0; // egg-and-dart
      return ax < 0.36 ? 0.3 : 0;
    }
    if (v < 0.175) return ax < 0.4 ? 0.6 : 0;                            // necking
    const hw = 0.38 - 0.03 * v;                                          // slight entasis
    if (ax > hw) return ax < hw + 0.07 ? 0.06 : 0;                       // fuzzy halo
    const fl = Math.pow(Math.abs(Math.cos((xr / hw) * flutes * Math.PI * 0.5)), 1.6);
    const cyl = 0.45 + 0.55 * (1 - Math.pow(ax / hw, 2)) + (xr < 0 ? 0.1 : 0); // light from the left
    return (0.1 + 0.9 * fl) * cyl * (1 - smooth(0.62, 1.04, v));          // dissolves at the base
  }

  function create(stage, canvas, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    const s2 = stage.querySelector('#channels');
    const s3 = stage.querySelector('#about');
    const C = cfg.columns, F = cfg.filaments;
    // copy the field calms down behind (section 3 only in the first version, configurable now)
    const copyEls = [...(F.dimSelector ? stage.querySelectorAll(F.dimSelector) : s3.querySelectorAll('.about__grid, .steps'))];

    let W = 0, H = 0, isStatic = reducedMotion, image, pixels, lut;
    let thr;                                               // per-pixel dither noise (static film grain)
    let colX, colY, colA, colPh, colN = 0;                 // column dots (world space)
    let grid, rowMax, gcols = 0, grows = 0, frameNo = 0;
    let world = { s3Top: 0, s3Bottom: 0, colBottom: 0, colX: [0, 0], textBoxes: [] };
    let raf = 0, running = false, startTime = 0, lastView = NaN;

    function layout() {
      W = canvas.width = Math.max(1, canvas.clientWidth);
      H = canvas.height = Math.max(1, canvas.clientHeight);
      image = ctx.createImageData(W, H);
      pixels = new Uint32Array(image.data.buffer);
      const mobile = W < breakpoints.mobile;
      isStatic = reducedMotion || mobile;

      const [r, g, b] = cfg.color.split(',').map((v) => parseInt(v, 10));
      lut = new Uint32Array(256);
      for (let a = 0; a < 256; a++) lut[a] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

      measure();

      // filament field grid + per-pixel grain thresholds
      gcols = Math.ceil(W / F.cell) + 2; grows = Math.ceil(H / F.cell) + 2;
      grid = new Float32Array(gcols * grows); rowMax = new Float32Array(grows);
      thr = new Uint8Array(W * H);
      const rand2 = rng(7);
      for (let i = 0; i < thr.length; i++) thr[i] = 1 + ((rand2() * 254) | 0);
      lastView = NaN;
    }

    // World metrics + column dots. Re-run whenever the stage height changes (e.g. FAQ opens).
    function measure() {
      const mobile = W < breakpoints.mobile;
      const stageTop = stage.getBoundingClientRect().top;
      const top2 = s2.getBoundingClientRect().top - stageTop, h2 = s2.offsetHeight;
      world.s3Top = s3.getBoundingClientRect().top - stageTop;
      // field ends with section 3 ('section3', first version) or runs to the end of the stage ('stage')
      world.s3Bottom = F.extendTo === 'stage' ? stage.offsetHeight : world.s3Top + s3.offsetHeight;
      world.textBoxes = copyEls.map((el) => {
        const rc = el.getBoundingClientRect();
        return { l: rc.left, r: rc.right, t: rc.top - stageTop, b: rc.bottom - stageTop };
      });

      // columns
      const cw = mobile ? C.widthMobile : Math.min(C.widthDesktop, W * 0.09);
      const ch = h2 * C.height, ctop = top2 + h2 * C.top;
      world.colBottom = ctop + ch;
      world.colX = [W * C.centerX, W * (1 - C.centerX)];
      const per = mobile ? C.mobileDots : C.desktopDots;
      colX = new Float32Array(per * 2); colY = new Float32Array(per * 2);
      colA = new Uint8Array(per * 2); colPh = new Float32Array(per * 2);
      const rand = rng(31);
      colN = 0;
      world.colX.forEach((cx) => {
        let made = 0, guard = 0;
        while (made < per && guard++ < per * 40) {
          const xr = (rand() - 0.5) * 1.4, v = rand() * 1.04;
          const d = columnDensity(xr, v, cw, ch, C.flutes);
          if (rand() > d) continue;
          colX[colN] = cx + xr * cw; colY[colN] = ctop + v * ch;
          colA[colN] = Math.round(Math.min(1, 0.45 + d * 0.55) * 255);
          colPh[colN] = rand() * Math.PI * 2;
          colN++; made++;
        }
      });
      lastView = NaN;
    }

    // Filament intensity at a world point
    function fieldAt(wx, wy, t) {
      const fade = smooth(world.s3Top - F.fadeIn * 0.5, world.s3Top + F.fadeIn * 0.5, wy)
        * (1 - smooth(world.s3Bottom - F.fadeOut, world.s3Bottom, wy));
      let I = 0;
      if (fade > 0.001) {
        const u = wx / F.scale, v = wy / F.scale, tt = t * F.speed;
        // two-layer domain warp → organic folds instead of regular stripes
        const u1 = u + 0.9 * Math.sin(v * 1.7 + tt * 1.2) + 0.4 * Math.sin(v * 3.1 - u * 1.3 + tt);
        const v1 = v + 0.9 * Math.sin(u * 1.3 - tt) + 0.4 * Math.cos(u * 2.7 + v * 1.1 - tt * 0.7);
        const u2 = u1 + 0.35 * Math.sin(v1 * 2.3 - tt * 0.5);
        const v2 = v1 + 0.35 * Math.cos(u1 * 2.1 + tt * 0.4);
        const N = Math.sin(u2 * 1.1 + tt * 0.8) * Math.cos(v2 * 1.2 - tt * 0.6) + 0.45 * Math.sin(u2 * 0.6 - v2 * 1.5 + tt);
        const r1 = N - 0.55, r2 = N + 0.4;
        I = fade * (F.fill * smooth(0.15, 1.1, N)
          + F.ridge * Math.exp(-(r1 * r1) / F.ridgeWidth)
          + F.ridge * 0.55 * Math.exp(-(r2 * r2) / F.ridgeWidth));
      }
      // column tails flowing down into section 3
      const k = (wy - (world.colBottom - 140)) / F.streamReach;
      if (k > 0 && k < 1) {
        for (let c = 0; c < 2; c++) {
          const cx = world.colX[c];
          const sx = cx + (W / 2 - cx) * 0.32 * k * k + Math.sin(wy / 170 + t * F.speed * 6 + c * 2) * 46 * k;
          const dx = wx - sx, wide = 16 + 120 * k, thin = 3 + 18 * k;
          I += Math.pow(1 - k, 1.4) * (0.55 * Math.exp(-(dx * dx) / (wide * wide)) + 0.5 * Math.exp(-(dx * dx) / (thin * thin)));
        }
      }
      // calmer behind the section copy
      for (const bx of world.textBoxes) {
        const inX = smooth(bx.l - 60, bx.l + 20, wx) * (1 - smooth(bx.r - 20, bx.r + 60, wx));
        const inY = smooth(bx.t - 60, bx.t + 20, wy) * (1 - smooth(bx.b - 20, bx.b + 60, wy));
        I *= 1 - F.textDim * inX * inY;
      }
      return Math.min(1, I * F.intensity * 2);
    }

    function plot(x, y, a) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const p = y * W + x;
      if ((pixels[p] >>> 24) < a) pixels[p] = lut[a];
    }

    function render(t, viewTop) {
      pixels.fill(0);
      // field grid (screen cells, world-anchored values)
      const cell = F.cell, inv = 1 / cell;
      for (let r = 0; r < grows; r++) {
        const wy = r * cell + viewTop;
        let m = 0;
        for (let c = 0; c < gcols; c++) { const v = fieldAt(c * cell, wy, t); grid[r * gcols + c] = v; if (v > m) m = v; }
        rowMax[r] = m;
      }
      // per-pixel ordered grain: coverage follows the (bilinear) field → dense "particle smoke"
      const cov = F.coverage * 255, bright = F.brightness;
      for (let y = 0; y < H; y++) {
        const gyf = y * inv, r0 = gyf | 0, fy = gyf - r0;
        if (rowMax[r0] < 0.004 && rowMax[r0 + 1] < 0.004) continue;
        const base = r0 * gcols, row = y * W;
        for (let x = 0; x < W; x++) {
          const gxf = x * inv, c0 = gxf | 0, fx = gxf - c0, i0 = base + c0;
          const top = grid[i0] + (grid[i0 + 1] - grid[i0]) * fx;
          const bot = grid[i0 + gcols] + (grid[i0 + gcols + 1] - grid[i0 + gcols]) * fx;
          const I = top + (bot - top) * fy;
          if (I * cov > thr[row + x]) pixels[row + x] = lut[((0.25 + 0.75 * I) * bright * 255) | 0];
        }
      }
      // columns
      const alpha = (W < breakpoints.mobile ? C.mobileAlpha : C.alpha);
      const sh = isStatic ? 0 : C.shimmer, vib = isStatic ? 0 : C.vibration;
      const ts = t * C.shimmerSpeed;
      for (let i = 0; i < colN; i++) {
        const y = colY[i] - viewTop;
        if (y < -2 || y > H + 2) continue;
        const tw = 1 - sh + sh * (0.5 + 0.5 * Math.sin(ts + colPh[i] * 3));
        const x = colX[i] + (vib ? Math.sin(ts * 1.7 + colPh[i]) * vib : 0);
        plot(x | 0, y | 0, (colA[i] * alpha * tw) | 0);
      }
      ctx.putImageData(image, 0, 0);
    }

    function viewTopNow() {
      return canvas.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    }

    function frame(now) {
      if (!running) return;
      const view = viewTopNow();
      if (isStatic) {
        if (view !== lastView) { render(12000, view); lastView = view; }   // scroll redraw only
      } else if (frameNo++ % F.frameSkip === 0 || view !== lastView) {
        render(now - startTime + 12000, view);           // calm motion → half rate is plenty
        lastView = view;
      }
      raf = requestAnimationFrame(frame);
    }

    return {
      init() {
        layout(); render(12000, viewTopNow());
        // the stage now spans several sections: keep world metrics in sync with their height
        if ('ResizeObserver' in window) {
          let h = stage.offsetHeight;
          new ResizeObserver(() => {
            if (stage.offsetHeight === h) return;
            h = stage.offsetHeight; measure(); render(12000, viewTopNow());
          }).observe(stage);
        }
      },
      resize() { layout(); render(12000, viewTopNow()); },
      start() {
        if (running) return;
        running = true;
        if (!startTime) startTime = performance.now();
        raf = requestAnimationFrame(frame);
      },
      stop() { running = false; cancelAnimationFrame(raf); },
    };
  }

  return { create };
})();
