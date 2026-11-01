/**
 * BrainPulses — keeps the section 4 brain photo static and runs fast, short
 * "neuron" signals through its folds, like current through a cable.
 *
 * Routes come from BRAIN_PATHS (traced offline along the bright gyri of
 * assets/brain.png). A pulse = bright head + fading tail with a little
 * electric jitter, plus a very faint glow of the route it travels.
 * The overlay canvas matches the image's object-fit: contain box.
 * Static mode (mobile / reduced motion): nothing is drawn — the photo stays as is.
 */
const BrainPulses = (() => {
  function create(canvas, img, paths, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, box = { x: 0, y: 0, w: 1, h: 1 }, isStatic = reducedMotion;
    let routes = [];
    const pulses = [];
    let raf = 0, running = false, nextSpawn = 0;

    function layout() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = Math.max(1, Math.round(rect.width * dpr));
      H = canvas.height = Math.max(1, Math.round(rect.height * dpr));
      isStatic = reducedMotion || window.innerWidth < breakpoints.mobile;
      // same box as <img object-fit: contain>
      const ar = (img.naturalWidth || 646) / (img.naturalHeight || 529);
      const bw = Math.min(W, H * ar), bh = bw / ar;
      box = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh };
      routes = paths.map((p) => {
        const pts = new Float32Array(p.length);
        let len = 0;
        for (let i = 0; i < p.length; i += 2) {
          pts[i] = box.x + p[i] * box.w; pts[i + 1] = box.y + p[i + 1] * box.h;
          if (i) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        }
        return { pts, n: p.length / 2, len };
      });
      ctx.clearRect(0, 0, W, H);
    }

    function spawn(now) {
      const r = routes[Math.floor(Math.random() * routes.length)];
      const reverse = Math.random() < 0.5;
      const speed = cfg.speed * dpr * (0.8 + Math.random() * 0.5);   // px per ms — fast
      pulses.push({ r, reverse, start: now, dur: r.len / speed });
    }

    function point(r, f, out) {
      const t = Math.max(0, Math.min(r.n - 1, f)), i = Math.floor(t), k = t - i;
      const j = Math.min(r.n - 1, i + 1);
      out[0] = r.pts[i * 2] + (r.pts[j * 2] - r.pts[i * 2]) * k;
      out[1] = r.pts[i * 2 + 1] + (r.pts[j * 2 + 1] - r.pts[i * 2 + 1]) * k;
      return out;
    }

    function render(now) {
      ctx.clearRect(0, 0, W, H);
      if (!routes.length) return;                                  // image not laid out yet
      if (now > nextSpawn && pulses.length < cfg.maxPulses) {
        spawn(now);
        nextSpawn = now + cfg.spawnMinMs + Math.random() * (cfg.spawnMaxMs - cfg.spawnMinMs);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const a = [0, 0], b = [0, 0];
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pl = pulses[p], r = pl.r;
        const prog = (now - pl.start) / pl.dur;
        if (prog >= 1.15) { pulses.splice(p, 1); continue; }       // small overshoot lets the tail run out
        const fade = prog > 1 ? 1 - (prog - 1) / 0.15 : 1;
        const head = (pl.reverse ? 1 - prog : prog) * (r.n - 1);
        const dir = pl.reverse ? 1 : -1;                          // tail points back along the route

        // faint glow of the "cable" the signal is running through
        ctx.strokeStyle = `rgba(${cfg.color}, ${(cfg.routeGlow * fade).toFixed(3)})`;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        for (let i = 0; i < r.n; i++) { if (i) ctx.lineTo(r.pts[i * 2], r.pts[i * 2 + 1]); else ctx.moveTo(r.pts[0], r.pts[1]); }
        ctx.stroke();

        // tail: short segments, brighter toward the head, with electric jitter
        const segs = 14, span = cfg.trail;                        // span in route points
        for (let s = 0; s < segs; s++) {
          const f0 = head + dir * span * (s / segs), f1 = head + dir * span * ((s + 1) / segs);
          if ((dir < 0 && f1 < 0) || (dir > 0 && f1 > r.n - 1)) break;
          point(r, f0, a); point(r, f1, b);
          const j = cfg.jitter * dpr;
          const k = 1 - s / segs;
          ctx.strokeStyle = `rgba(${cfg.color}, ${(cfg.alpha * k * k * fade).toFixed(3)})`;
          ctx.lineWidth = (0.7 + 1.8 * k) * dpr;
          ctx.beginPath();
          ctx.moveTo(a[0] + (Math.random() - 0.5) * j, a[1] + (Math.random() - 0.5) * j);
          ctx.lineTo(b[0] + (Math.random() - 0.5) * j, b[1] + (Math.random() - 0.5) * j);
          ctx.stroke();
        }
        // head glow
        if (prog <= 1) {
          point(r, head, a);
          const g = ctx.createRadialGradient(a[0], a[1], 0, a[0], a[1], cfg.glow * dpr);
          g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * fade})`);
          g.addColorStop(0.35, `rgba(${cfg.color}, ${0.35 * fade})`);
          g.addColorStop(1, `rgba(${cfg.color}, 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(a[0] - cfg.glow * dpr, a[1] - cfg.glow * dpr, cfg.glow * 2 * dpr, cfg.glow * 2 * dpr);
          ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;          // crisp core
          ctx.beginPath(); ctx.arc(a[0], a[1], 1.6 * dpr, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    function frame(now) {
      if (!running) return;
      render(now);
      raf = requestAnimationFrame(frame);
    }

    return {
      init() {
        if (img.complete) layout(); else img.addEventListener('load', layout, { once: true });
      },
      resize() { layout(); },
      start() { if (running || isStatic) return; running = true; raf = requestAnimationFrame(frame); },
      stop() { running = false; cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); pulses.length = 0; },
    };
  }

  return { create };
})();
