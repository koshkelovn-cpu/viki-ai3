/**
 * BrainNet — section 4 visual: a wireframe brain in side view.
 *
 * Nodes are sampled (seeded, so the shape is stable) inside a union of
 * ellipses — cerebrum + temporal lobe — with a denser knot in the frontal
 * area and a ring of nodes on the outline for a crisp silhouette. Each node
 * links to its nearest neighbours. Cerebellum = fine hatched arcs, as in the
 * reference. The whole network is drawn once to an offscreen layer; the only
 * motion is signal pulses hopping node → node along the links.
 * Static mode (mobile / reduced motion): the network without pulses.
 */
const BrainNet = (() => {
  const rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
  // normalised brain space: x -1..1 (front = left), y -0.62..0.62
  const inBrain = (x, y) => inEllipse(x, y, 0.02, -0.08, 0.96, 0.56) || inEllipse(x, y, -0.12, 0.2, 0.62, 0.3);

  function create(canvas, cfg, breakpoints, { reducedMotion }) {
    const ctx = canvas.getContext('2d');
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');
    let W = 0, H = 0, dpr = 1, isStatic = reducedMotion;
    let nodes = [], adj = [];
    const pulses = [], flashes = [];
    let raf = 0, running = false, nextPulse = 0;

    function toScreen(x, y) {
      const s = Math.min(W / 2.1, H / 1.36);
      return [W / 2 + x * s, H / 2 + y * s];
    }

    function build() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.width = layer.width = Math.max(1, Math.round(rect.width * dpr));
      H = canvas.height = layer.height = Math.max(1, Math.round(rect.height * dpr));
      const mobile = rect.width < breakpoints.mobile || window.innerWidth < breakpoints.mobile;
      isStatic = reducedMotion || mobile;
      const target = mobile ? cfg.nodesMobile : cfg.nodesDesktop;
      const rand = rng(1337);

      // nodes: ~20 % on the outline, the rest inside with a frontal cluster
      const pts = [];
      const outline = Math.round(target * 0.2);
      for (let i = 0; i < outline; i++) {
        const a = rand() * Math.PI * 2;
        const x = 0.02 + Math.cos(a) * 0.96, y = -0.08 + Math.sin(a) * 0.56;
        if (y > 0.3 && x > 0.2) continue;                         // leave room for the cerebellum
        pts.push([x + (rand() - 0.5) * 0.02, y + (rand() - 0.5) * 0.02]);
      }
      let guard = 0;
      while (pts.length < target && guard++ < target * 50) {
        const x = rand() * 2 - 1, y = rand() * 1.24 - 0.62;
        if (!inBrain(x, y)) continue;
        const knot = Math.exp(-(((x + 0.45) / 0.3) ** 2 + ((y + 0.18) / 0.22) ** 2));
        if (rand() > 0.45 + cfg.clusterBoost * knot) continue;
        pts.push([x, y]);
      }
      nodes = pts.map(([x, y]) => {
        const [sx, sy] = toScreen(x, y);
        return { x: sx, y: sy, bright: rand() < 0.07, r: (0.5 + rand() * 0.9) * dpr };
      });

      // k-nearest links + a few longer "association" links (deduplicated)
      adj = nodes.map(() => []);
      const seen = new Set();
      const link = (i, j) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (i === j || seen.has(key)) return;
        seen.add(key); adj[i].push(j); adj[j].push(i);
      };
      const k = cfg.neighbours, scale = Math.min(W / 2.1, H / 1.36);
      nodes.forEach((n, i) => {
        const bestJ = new Int32Array(k).fill(-1), bestD = new Float64Array(k).fill(Infinity);
        nodes.forEach((m, j) => {
          if (j === i) return;
          const d = (m.x - n.x) ** 2 + (m.y - n.y) ** 2;
          if (d >= bestD[k - 1]) return;
          let p = k - 1;
          while (p > 0 && bestD[p - 1] > d) { bestD[p] = bestD[p - 1]; bestJ[p] = bestJ[p - 1]; p--; }
          bestD[p] = d; bestJ[p] = j;
        });
        bestJ.forEach((j) => { if (j >= 0) link(i, j); });
        if (rand() < cfg.longLinks) {
          for (let tries = 0; tries < 8; tries++) {
            const j = Math.floor(rand() * nodes.length), m = nodes[j];
            const d = Math.hypot(m.x - n.x, m.y - n.y) / scale;
            if (d > 0.12 && d < 0.32) { link(i, j); break; }
          }
        }
      });
      drawLayer(rand);
    }

    function drawLayer(rand) {
      lctx.clearRect(0, 0, W, H);
      lctx.lineWidth = 0.7 * dpr;
      lctx.strokeStyle = `rgba(255, 255, 255, ${cfg.edgeAlpha})`;
      lctx.beginPath();
      adj.forEach((list, i) => list.forEach((j) => {
        if (j < i) return;
        lctx.moveTo(nodes[i].x, nodes[i].y); lctx.lineTo(nodes[j].x, nodes[j].y);
      }));
      lctx.stroke();

      // cerebellum: fine hatched arcs + a short stem
      const [cx, cy] = toScreen(0.47, 0.43);
      const s = Math.min(W / 2.1, H / 1.36);
      lctx.strokeStyle = `rgba(255, 255, 255, ${cfg.edgeAlpha * 1.6})`;
      lctx.lineWidth = 0.6 * dpr;
      lctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const rx = s * (0.27 - k * 0.012), ry = s * (0.13 - k * 0.006);
        lctx.moveTo(cx - rx, cy + k * 0.6 * dpr);
        lctx.ellipse(cx, cy + k * 0.6 * dpr, rx, ry, -0.12, Math.PI, Math.PI * (1.95 + rand() * 0.04), false);
      }
      const [sx0, sy0] = toScreen(0.24, 0.36), [sx1, sy1] = toScreen(0.2, 0.74);
      for (let k = -2; k <= 2; k++) { lctx.moveTo(sx0 + k * 3 * dpr, sy0); lctx.lineTo(sx1 + k * 2 * dpr, sy1); }
      lctx.stroke();

      // nodes
      nodes.forEach((n) => {
        if (n.bright) {
          const g = lctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
          g.addColorStop(0, 'rgba(255, 255, 255, 0.35)'); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
          lctx.fillStyle = g; lctx.fillRect(n.x - n.r * 5, n.y - n.r * 5, n.r * 10, n.r * 10);
        }
        lctx.fillStyle = `rgba(255, 255, 255, ${n.bright ? cfg.nodeAlpha : cfg.nodeAlpha * 0.55})`;
        lctx.beginPath(); lctx.arc(n.x, n.y, n.bright ? n.r * 1.3 : n.r * 0.8, 0, Math.PI * 2); lctx.fill();
      });
    }

    function spawnPulse(now) {
      let at = Math.floor(Math.random() * nodes.length);
      const hops = cfg.pulseHops[0] + Math.floor(Math.random() * (cfg.pulseHops[1] - cfg.pulseHops[0] + 1));
      const path = [at];
      for (let h = 0; h < hops; h++) {
        const options = adj[at].filter((j) => j !== path[path.length - 2]);
        if (!options.length) break;
        at = options[Math.floor(Math.random() * options.length)];
        path.push(at);
      }
      if (path.length > 1) pulses.push({ path, start: now });
    }

    function render(now) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(layer, 0, 0);
      if (isStatic) return;

      if (now > nextPulse && pulses.length < cfg.pulsesMax) {
        spawnPulse(now);
        nextPulse = now + cfg.pulseEveryMs * (0.6 + Math.random() * 0.8);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pl = pulses[p];
        const prog = (now - pl.start) / cfg.pulseHopMs;
        const hop = Math.floor(prog);
        if (hop >= pl.path.length - 1) { flashes.push({ n: pl.path[pl.path.length - 1], t: now }); pulses.splice(p, 1); continue; }
        const f = prog - hop;
        const a = nodes[pl.path[hop]], b = nodes[pl.path[hop + 1]];
        const hx = a.x + (b.x - a.x) * f, hy = a.y + (b.y - a.y) * f;
        const tf = Math.max(0, f - cfg.pulseTrail);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * tf, a.y + (b.y - a.y) * tf); ctx.lineTo(hx, hy); ctx.stroke();
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 7 * dpr);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.9)'); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g; ctx.fillRect(hx - 7 * dpr, hy - 7 * dpr, 14 * dpr, 14 * dpr);
        if (f < 0.08 && hop > 0) flashes.push({ n: pl.path[hop], t: now });
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        const e = (now - flashes[i].t) / 600;
        if (e >= 1) { flashes.splice(i, 1); continue; }
        const n = nodes[flashes[i].n], r = (4 + e * 8) * dpr;
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
        g.addColorStop(0, `rgba(255, 255, 255, ${0.45 * (1 - e)})`); g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g; ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    function frame(now) {
      if (!running) return;
      render(now);
      raf = requestAnimationFrame(frame);
    }

    return {
      init() { build(); render(0); },
      resize() { build(); render(performance.now()); },
      start() { if (running || isStatic) return; running = true; raf = requestAnimationFrame(frame); },
      stop() { running = false; cancelAnimationFrame(raf); },
    };
  }

  return { create };
})();
