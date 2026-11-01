/**
 * ChannelOrbit — section 2: seven channels on an ellipse around the orb,
 * wired to it with "living" cables.
 *
 * Each cable is a quadratic curve (icon edge → orb edge) drawn three times:
 * a wide faint glass tube, a thin core, and a short glowing dash used as the
 * pulse. Cable sag is a damped spring: hover/focus pulls the cable taut.
 * Every few seconds one channel sends a pulse to the orb; the orb flashes,
 * pauses ~120–180 ms ("thinks") and sends a shorter reply back.
 * Below the mobile breakpoint CSS lays channels out as a grid, cables hide,
 * and pulses become simple icon/orb flashes.
 *
 * Living rings (CONFIG.orbit.rings) sit on two canvases, one behind and one in
 * front of the orb, so they pass around it. The rings inside the orb video are
 * part of the footage and stay as they are. Clicking a channel selects it: a
 * free ring stretches out and touches its cable (or the icon on mobile), that
 * cable lights up, the others dim. A second click releases it. Hovering the orb
 * only speeds the rings up and brightens them.
 */
const ChannelOrbit = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
  const TAU = Math.PI * 2;
  const wrapAngle = (a) => a - TAU * Math.round(a / TAU);

  function createRings(root, core, cfg, reducedMotion) {
    const mkCanvas = () => { const c = document.createElement('canvas'); c.className = 'orbit__rings'; c.setAttribute('aria-hidden', 'true'); return c; };
    const back = mkCanvas(), front = mkCanvas();
    root.insertBefore(back, core);
    core.after(front);
    const bctx = back.getContext('2d'), fctx = front.getContext('2d');
    const N = cfg.segments, RUN = cfg.runLength;
    const rings = cfg.list.map((r, i) => ({
      ...r, i,
      spin: r.phase, sway: r.phase * 1.7,
      x: new Float32Array(N + 1), y: new Float32Array(N + 1), z: new Float32Array(N + 1), w: new Float32Array(N + 1),
      owner: null, amt: 0, vel: 0, target: 0, theta: null, tipX: 0, tipY: 0,
    }));
    let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, unit = 1;

    function layout(centerX, centerY, sphereR, mobile) {
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? cfg.maxDprMobile : cfg.maxDpr);
      W = root.clientWidth; H = root.clientHeight;
      [back, front].forEach((c) => { c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr)); });
      cx = centerX; cy = centerY;
      unit = sphereR * (mobile ? cfg.mobileScale : 1);
    }

    // ring's own shape, before any pull toward a cable
    function ringPoint(r, th, out) {
      const R = r.radius * unit, tilt = r.tilt + Math.sin(r.sway * 0.7) * cfg.tiltSway;
      const roll = r.roll + Math.sin(r.sway) * r.rollSway;
      const px = R * Math.cos(th), py = R * Math.sin(th) * Math.cos(tilt);
      const c = Math.cos(roll), s = Math.sin(roll);
      out[0] = cx + px * c - py * s;
      out[1] = cy + px * s + py * c;
      out[2] = Math.sin(th);                     // + = the near half, drawn in front of the orb
      return out;
    }

    const P = [0, 0, 0];
    function step(dt, hot, anchorOf) {
      const speed = 1 + hot * (cfg.hoverSpeed - 1);
      rings.forEach((r) => {
        const calm = 1 - cfg.linkedCalm * Math.min(1, r.amt);   // a connected ring slows down
        r.spin += r.speed * speed * calm * dt;
        r.sway += r.swaySpeed * speed * calm * dt;
        // spring toward connected / released: same motion both ways, no jump when interrupted
        if (reducedMotion) { r.amt = r.target; r.vel = 0; } else {
          r.vel += (cfg.linkStiffness * (r.target - r.amt) - cfg.linkDamping * r.vel) * dt;
          r.amt += r.vel * dt;
        }
        if (r.target === 0 && Math.abs(r.amt) < 0.002 && Math.abs(r.vel) < 0.01) { r.amt = 0; r.vel = 0; r.owner = null; r.theta = null; }
        if (r.owner) {
          const a = anchorOf(r.owner);
          r.tipX = a[0]; r.tipY = a[1];
          // the point of the ring nearest to the cable, followed softly as the ring turns
          let best = 0, bd = Infinity;
          for (let k = 0; k < 64; k++) {
            ringPoint(r, (k / 64) * TAU, P);
            const d = (P[0] - a[0]) ** 2 + (P[1] - a[1]) ** 2;
            if (d < bd) { bd = d; best = (k / 64) * TAU; }
          }
          if (r.theta === null) r.theta = best;
          else r.theta += wrapAngle(best - r.theta) * (reducedMotion ? 1 : 1 - Math.exp(-dt / cfg.linkFollowSec));
        }
      });
    }

    function buildRing(r) {
      let dx = 0, dy = 0;
      if (r.owner && r.amt > 0) { ringPoint(r, r.theta, P); dx = (r.tipX - P[0]) * r.amt; dy = (r.tipY - P[1]) * r.amt; }
      for (let k = 0; k <= N; k++) {
        const th = (k / N) * TAU;
        ringPoint(r, th, P);
        let w = 0;
        if (dx || dy) { const a = wrapAngle(th - r.theta) / cfg.linkWidth; w = Math.exp(-a * a); }
        r.x[k] = P[0] + dx * w; r.y[k] = P[1] + dy * w; r.z[k] = P[2] + w * Math.max(0, r.amt) * 2; r.w[k] = w;
      }
    }

    function draw(hot) {
      [bctx, fctx].forEach((c) => { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); c.lineCap = 'round'; c.lineJoin = 'round'; });
      const gain = 1 + hot * cfg.hoverGlow;
      rings.forEach((r) => {
        buildRing(r);
        for (let k = 0; k < N; k += RUN) {
          const mid = k + (RUN >> 1), e = Math.min(N, k + RUN);
          const ctx = r.z[mid] > 0 ? fctx : bctx;
          const th = (mid / N) * TAU;
          const arc = Math.exp(-((wrapAngle(th - r.spin) / cfg.arcWidth) ** 2));   // the bright stretch that travels around
          const near = r.z[mid] > 0 ? 1 : cfg.backDim;
          const al = Math.min(1, (r.alpha + cfg.arcGain * arc) * near * gain + r.w[mid] * Math.max(0, r.amt) * cfg.linkGlow);
          ctx.beginPath();
          ctx.moveTo(r.x[k], r.y[k]);
          for (let q = k + 1; q <= e; q++) ctx.lineTo(r.x[q], r.y[q]);
          if (al > cfg.glowFrom) {                                                 // soft glow only where it shows
            ctx.strokeStyle = `rgba(255,255,255,${(al * 0.14).toFixed(3)})`;
            ctx.lineWidth = cfg.glowWidth;
            ctx.stroke();
          }
          ctx.strokeStyle = `rgba(255,255,255,${al.toFixed(3)})`;
          ctx.lineWidth = cfg.lineWidth + r.w[mid] * Math.max(0, r.amt) * 0.5;
          ctx.stroke();
        }
        // a small light riding the ring shows its rotation
        const b = Math.floor((wrapAngle(r.spin) / TAU + 1) * N) % N;
        const bctxNow = r.z[b] > 0 ? fctx : bctx;
        bctxNow.fillStyle = `rgba(255,255,255,${Math.min(1, cfg.beadAlpha * (r.z[b] > 0 ? 1 : cfg.backDim) * gain).toFixed(3)})`;
        bctxNow.beginPath(); bctxNow.arc(r.x[b], r.y[b], cfg.beadSize, 0, TAU); bctxNow.fill();
        // where the ring meets the cable
        if (r.owner && r.amt > 0.05) {
          const a = Math.min(1, r.amt);
          fctx.fillStyle = `rgba(255,255,255,${(a * 0.16).toFixed(3)})`;
          fctx.beginPath(); fctx.arc(r.tipX, r.tipY, cfg.tipGlow, 0, TAU); fctx.fill();
          fctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          fctx.beginPath(); fctx.arc(r.tipX, r.tipY, cfg.tipSize, 0, TAU); fctx.fill();
        }
      });
    }

    return {
      layout,
      step,
      draw,
      connect(owner, anchor) {
        // the free ring nearest to the cable; while all are busy, the one closest to free
        const free = rings.filter((r) => !r.owner);
        let pick = null, bd = Infinity;
        (free.length ? free : rings).forEach((r) => {
          ringPoint(r, r.spin, P);
          const score = free.length ? Math.abs(r.radius * unit - Math.hypot(anchor[0] - cx, anchor[1] - cy)) : r.amt;
          if (score < bd) { bd = score; pick = r; }
        });
        pick.owner = owner; pick.target = 1; pick.theta = null;
      },
      release(owner) { rings.forEach((r) => { if (r.owner === owner) r.target = 0; }); },
    };
  }

  function create(root, cfg, breakpoints, { reducedMotion }) {
    const svg = root.querySelector('.orbit__cables');
    const core = root.querySelector('.orbit__core');
    const track = root.querySelector('.orbit__track');
    const buttons = [...root.querySelectorAll('.channel')];
    let mode = 'orbit', cx = 0, cy = 0, orbR = 0;
    let raf = 0, running = false, nextPulse = 0, active = null;
    const ringsApi = createRings(root, core, cfg.rings, reducedMotion);
    let selected = null, lastFrame = 0, hot = 0, dimAll = 0, flowOffset = 0;
    // cursor proximity spring (desktop only): near → orb tightens, mid → widens a touch
    const prox = { x: 0, y: 0, inside: false, scale: 1, vel: 0 };
    root.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      prox.x = e.clientX - r.left; prox.y = e.clientY - r.top; prox.inside = true;
    }, { passive: true });
    root.addEventListener('pointerleave', () => { prox.inside = false; });

    const mk = (cls) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); return p; };
    const cables = buttons.map((el, i) => {
      const g = document.createElementNS(NS, 'g');
      const tube = mk('cable__tube'), line = mk('cable__core'), flow = mk('cable__flow'), glow = mk('cable__pulse-glow'), dash = mk('cable__pulse');
      g.append(tube, line, flow, glow, dash);
      svg.appendChild(g);
      el.setAttribute('aria-pressed', 'false');
      const c = { el, g, tube, line, flow, glow, dash, i, sag: 1, vel: 0, taut: false, side: i % 2 ? 1 : -1, ax: 0, ay: 0, bx: 0, by: 0, qx: 0, qy: 0, len: 0, lit: 0, iconX: 0, iconY: 0 };
      const tense = (on) => () => { c.taut = on; if (on) firePulse(c, performance.now()); };
      el.addEventListener('pointerenter', tense(true));
      el.addEventListener('pointerleave', tense(false));
      el.addEventListener('focus', tense(true));
      el.addEventListener('blur', tense(false));
      el.addEventListener('click', () => { firePulse(c, performance.now(), true); select(c); });
      return c;
    });

    // click: this channel connects; a second click or another channel releases it
    function select(c) {
      const next = selected === c ? null : c;
      if (selected) {
        ringsApi.release(selected);
        selected.el.setAttribute('aria-pressed', 'false');
        selected.el.classList.remove('is-active');
      }
      selected = next;
      if (selected) {
        ringsApi.connect(selected, anchorOf(selected));
        selected.el.setAttribute('aria-pressed', 'true');
        selected.el.classList.add('is-active');
      }
      if (reducedMotion) { stepLines(0); if (mode === 'orbit') drawCables(0); ringsApi.step(0, 0, anchorOf); ringsApi.draw(0); }
    }

    // where a ring touches: a point on the cable (a straight reach to the icon on mobile, where cables hide)
    const anchorPoint = [0, 0];
    function anchorOf(c) {
      if (mode !== 'orbit') { anchorPoint[0] = c.iconX; anchorPoint[1] = c.iconY; return anchorPoint; }
      const t = cfg.rings.anchorAlong, u = 1 - t;
      anchorPoint[0] = u * u * c.ax + 2 * u * t * c.qx + t * t * c.bx;
      anchorPoint[1] = u * u * c.ay + 2 * u * t * c.qy + t * t * c.by;
      return anchorPoint;
    }

    function layoutRings() {
      const r = root.getBoundingClientRect(), k = core.getBoundingClientRect();
      ringsApi.layout(k.left + k.width / 2 - r.left, k.top + k.height / 2 - r.top, core.offsetWidth * 0.5 * 0.78, mode !== 'orbit');
      cables.forEach((c) => {
        const ic = c.el.querySelector('.channel__icon').getBoundingClientRect();
        c.iconX = ic.left + ic.width / 2 - r.left; c.iconY = ic.top - r.top;
      });
    }

    function layout() {
      const w = root.clientWidth, h = root.clientHeight;
      const items = buttons.map((b) => b.closest('li'));
      if (w < breakpoints.mobile) {
        mode = 'grid';
        core.style.removeProperty('--orb-scale');   // mobile: static orb, no proximity
        items.forEach((li) => { li.style.left = ''; li.style.top = ''; });
        layoutRings();
        ringsApi.draw(0);
        return;
      }
      mode = 'orbit';
      cx = w / 2; cy = h / 2;
      const rx = w * cfg.ellipseRx, ry = h * cfg.ellipseRy;
      orbR = core.offsetWidth * 0.5 * 0.78;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      track.style.width = `${rx * 2}px`; track.style.height = `${ry * 2}px`;

      cables.forEach((c, i) => {
        const ang = -Math.PI / 2 + (i * Math.PI * 2) / cables.length;
        const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry;
        items[i].style.left = `${x}px`; items[i].style.top = `${y}px`;
        const ux = cx - x, uy = cy - y, d = Math.hypot(ux, uy) || 1;
        const iconR = c.el.querySelector('.channel__icon').offsetWidth / 2 + 6;
        if (uy / d > 0.7) {
          // orb is straight below: leave from under the label so the cable never crosses it
          const label = c.el.querySelector('.channel__label');
          c.ax = x; c.ay = y + iconR + label.offsetHeight + 8;
        } else {
          c.ax = x + (ux / d) * iconR; c.ay = y + (uy / d) * iconR;
        }
        c.bx = cx - (ux / d) * orbR; c.by = cy - (uy / d) * orbR;
      });
      drawCables(0);
      layoutRings();
      ringsApi.draw(0);
    }

    function drawCables(t) {
      cables.forEach((c) => {
        const mx = (c.ax + c.bx) / 2, my = (c.ay + c.by) / 2;
        const dx = c.bx - c.ax, dy = c.by - c.ay, L = Math.hypot(dx, dy) || 1;
        const sag = c.sag * cfg.sag * L * c.side;
        const qx = mx + (-dy / L) * sag;
        const qy = my + (dx / L) * sag + L * 0.04 * c.sag;            // a hint of gravity
        c.qx = qx; c.qy = qy;
        const d = `M${c.ax.toFixed(1)} ${c.ay.toFixed(1)}Q${qx.toFixed(1)} ${qy.toFixed(1)} ${c.bx.toFixed(1)} ${c.by.toFixed(1)}`;
        c.tube.setAttribute('d', d); c.line.setAttribute('d', d);
        c.glow.setAttribute('d', d); c.dash.setAttribute('d', d);
        if (c.lit > 0.01) c.flow.setAttribute('d', d);
        c.g.classList.toggle('is-taut', c.taut || c === selected);
      });
    }

    // selected cable up, the others down, every cable breathing a little
    function stepLines(dt, t = 0) {
      const r = cfg.rings;
      const k = reducedMotion ? 1 : 1 - Math.exp(-dt / r.lineEaseSec);
      dimAll += ((selected ? 1 : 0) - dimAll) * k;
      flowOffset -= dt * r.flowSpeed;
      cables.forEach((c) => {
        c.lit += ((c === selected ? 1 : 0) - c.lit) * k;
        const breath = reducedMotion ? 1 : 1 + Math.sin(t * r.breathSpeed + c.i * 1.9) * r.breath;
        const dim = 1 - dimAll * r.dimOthers * (1 - c.lit);
        c.line.style.opacity = (Math.min(1, breath * dim + c.lit)).toFixed(2);
        // only what actually changed: the idle state costs one style write per cable
        if (c.lit > 0.002 || dimAll > 0.002 || c.wasLit) {
          c.line.style.strokeWidth = (1 + c.lit * r.activeWidth).toFixed(2);
          c.tube.style.opacity = dim.toFixed(3);
          c.flow.style.opacity = c.lit.toFixed(3);
          if (c.lit > 0.01) c.flow.style.strokeDashoffset = flowOffset.toFixed(1);
          c.wasLit = c.lit > 0.002 || dimAll > 0.002;
        }
      });
    }

    function stepSprings(t) {
      cables.forEach((c) => {
        const target = (c.taut || c === selected ? cfg.tautSag : 1) + Math.sin(t * 0.0009 + c.i * 1.3) * cfg.wobble;
        c.vel += (target - c.sag) * cfg.springStiffness;
        c.vel *= cfg.springDamping;
        c.sag += c.vel;
      });
    }

    function setDash(c, start, seg) {
      // visible dash spans path length [start, start + seg]
      // (inline style, not attributes: the stylesheet hides idle dashes and would win over attributes)
      const arr = `${seg} ${c.len + seg * 2}`;
      [c.dash, c.glow].forEach((p) => { p.style.strokeDasharray = arr; p.style.strokeDashoffset = String(-start); });
    }

    function flash(el, cls, ms) {
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), ms);
    }

    function firePulse(c, now, force) {
      if (reducedMotion || (active && !force)) return;
      if (active) [active.cable.dash, active.cable.glow].forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
      active = { cable: c, phase: 'in', start: now, wait: rand(cfg.replyDelayMinMs, cfg.replyDelayMaxMs) };
      flash(c.el, 'is-sending', 500);
      nextPulse = now + rand(cfg.pulseMinMs, cfg.pulseMaxMs);
    }

    function stepPulse(now) {
      if (!active) {
        if (now > nextPulse) firePulse(selected || cables[Math.floor(Math.random() * cables.length)], now);
        return;
      }
      const a = active, c = a.cable, seg = cfg.pulseLength;
      if (mode === 'orbit') c.len = c.line.getTotalLength();
      const el = now - a.start;
      if (a.phase === 'in') {
        const p = Math.min(1, el / cfg.pulseTravelMs);
        if (mode === 'orbit') setDash(c, -seg + easeInOut(p) * (c.len + seg), seg);
        if (p >= 1) { flash(core, 'is-hit', 600); a.phase = 'wait'; a.start = now; }
      } else if (a.phase === 'wait') {
        if (el >= a.wait) { a.phase = 'out'; a.start = now; }
      } else {
        const p = Math.min(1, el / cfg.replyTravelMs);
        const s = seg * 0.6;
        if (mode === 'orbit') setDash(c, c.len - easeInOut(p) * (c.len + s), s);
        if (p >= 1) { flash(c.el, 'is-replied', 700); active = null; }
      }
    }

    function stepProximity() {
      const p = cfg.proximity;
      const R = core.offsetWidth / 2 || 1;
      let target = 1;
      if (prox.inside) {
        const d = Math.hypot(prox.x - cx, prox.y - cy) / R;
        const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        target = d < p.midRadius
          ? p.nearScale + (p.midScale - p.nearScale) * sm(p.nearRadius, p.midRadius, d)
          : p.midScale + (1 - p.midScale) * sm(p.midRadius, p.farRadius, d);
      }
      prox.vel += (target - prox.scale) * p.stiffness;
      prox.vel *= p.damping;
      prox.scale += prox.vel;
      core.style.setProperty('--orb-scale', prox.scale.toFixed(4));
    }

    // cursor over the orb itself (rings only: the orb's own behaviour stays in stepProximity)
    function stepHot(dt) {
      const over = mode === 'orbit' && prox.inside
        && Math.hypot(prox.x - cx, prox.y - cy) < core.offsetWidth * 0.5 * cfg.rings.hoverRadius;
      hot += ((over ? 1 : 0) - hot) * (1 - Math.exp(-dt / cfg.rings.hoverEaseSec));
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);  // seconds; a long gap never makes a jump
      lastFrame = now;
      if (mode === 'orbit') { stepSprings(now); drawCables(now); stepProximity(); stepLines(dt, now); }
      stepHot(dt);
      ringsApi.step(dt, hot, anchorOf);
      ringsApi.draw(hot);
      stepPulse(now);
      raf = requestAnimationFrame(frame);
    }

    // Lazy video: attach the source only when the section approaches the viewport.
    function initVideo() {
      const video = root.querySelector('video[data-src]');
      if (!video) return;
      if (reducedMotion) { video.remove(); return; }    // poster <img> stays as the static orb
      const load = () => {
        video.src = video.dataset.src;
        video.removeAttribute('data-src');
        video.addEventListener('playing', () => core.classList.add('has-video'), { once: true });
        video.play().catch(() => {});
      };
      if (!('IntersectionObserver' in window)) { load(); return; }
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
      }, { rootMargin: cfg.videoRootMargin });
      io.observe(root);
    }

    return {
      init() {
        layout();
        initVideo();
        if ('ResizeObserver' in window) new ResizeObserver(layout).observe(root);
        else window.addEventListener('resize', layout);
      },
      start() {
        if (running || reducedMotion) return;
        running = true;
        lastFrame = 0;
        nextPulse = performance.now() + 900;
        const v = root.querySelector('video');
        if (v && v.src) v.play().catch(() => {});
        raf = requestAnimationFrame(frame);
      },
      stop() {
        running = false; cancelAnimationFrame(raf);
        const v = root.querySelector('video');
        if (v && v.src) v.pause();
      },
    };
  }

  return { create };
})();
