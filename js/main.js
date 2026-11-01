/**
 * main — wires the modules to the page: visibility-based start/stop,
 * pointer + scroll input, navbar, FAQ accordion, reveal-on-scroll and the
 * live call chip in the hero.
 */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  root.classList.toggle('reduced-motion', reducedMotion);

  const hero = document.querySelector('[data-hero]');
  const particles = ParticleField.create(
    hero.querySelector('[data-particles]'), CONFIG.particles, CONFIG.breakpoints, { reducedMotion });
  // Hero figure: BustBaseMesh model (CONFIG.headMesh), else the dot-matrix head (CONFIG.head) or the scan-line silhouette
  const figureModule = CONFIG.headMesh.enabled && HeadMesh.supported() ? [HeadMesh, CONFIG.headMesh]
    : CONFIG.head.enabled ? [HeadMatrix, CONFIG.head] : [VoiceSilhouette, CONFIG.silhouette];
  const figure = figureModule[0].create(
    hero.querySelector('[data-silhouette]'), hero.querySelector('.hero__figure'),
    figureModule[1], CONFIG.breakpoints, { reducedMotion });
  const orbit = ChannelOrbit.create(
    document.querySelector('[data-orbit]'), CONFIG.orbit, CONFIG.breakpoints, { reducedMotion });
  const stageEl = document.querySelector('[data-flow-stage]');
  const flow = FlowStage.create(
    stageEl, stageEl.querySelector('[data-flow-canvas]'), CONFIG.flowStage, CONFIG.breakpoints, { reducedMotion });
  // Section 4 brain: photo (default) or the procedural BrainNet canvas — switch in CONFIG.brain.mode
  const brainCanvas = document.querySelector('[data-brain]');
  const useBrainCanvas = CONFIG.brain.mode === 'canvas';
  if (useBrainCanvas) {
    brainCanvas.hidden = false;
    document.querySelector('[data-brain-img]').hidden = true;
  }
  const brainPulsesCanvas = document.querySelector('[data-brain-pulses]');
  if (useBrainCanvas) brainPulsesCanvas.hidden = true;
  const brain = useBrainCanvas
    ? BrainNet.create(brainCanvas, CONFIG.brain, CONFIG.breakpoints, { reducedMotion })
    : BrainPulses.create(brainPulsesCanvas, document.querySelector('[data-brain-img]'), BRAIN_PATHS,
      CONFIG.brain.imagePulses, CONFIG.breakpoints, { reducedMotion });
  const terrainHost = document.querySelector('[data-terrain-host]');
  const terrain = WireTerrain.create(
    terrainHost.querySelector('[data-terrain]'), terrainHost, CONFIG.terrain, CONFIG.breakpoints, { reducedMotion });

  // Fonts change text metrics → figure box; lay out once they are ready.
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(() => {
    particles.init();
    figure.init();
    orbit.init();
    flow.init();
    brain.init();
    terrain.init();
    observeVisibility();
    requestAnimationFrame(() => document.body.classList.add('is-loaded'));
  });

  // Run each animated block only while it is on screen.
  function observeVisibility() {
    const blocks = new Map([
      [hero, [particles, figure]],
      [document.querySelector('[data-orbit]'), [orbit]],
      [stageEl, [flow]],
      [terrainHost, [terrain]],
    ]);
    blocks.set(useBrainCanvas ? brainCanvas : brainPulsesCanvas, [brain]);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => blocks.get(e.target).forEach((m) => (e.isIntersecting ? m.start() : m.stop())));
    }, { threshold: 0 });
    blocks.forEach((_, el) => io.observe(el));
  }

  // Pointer → particle repulsion + figure parallax (hero only)
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const nx = (x / r.width) * 2 - 1, ny = (y / r.height) * 2 - 1;
    particles.setPointer(x, y, nx, ny);
    figure.setPointer(nx, ny);
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { particles.clearPointer(); figure.setPointer(0, 0); });

  // Scroll → figure dissolve, navbar state
  const nav = document.querySelector('[data-nav]');
  const onScroll = () => {
    const p = window.scrollY / Math.max(1, hero.offsetHeight * 0.85);
    figure.setScroll(p);
    nav.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      particles.resize(); figure.resize(); flow.resize(); brain.resize(); terrain.resize();
    }, 150);
  });

  // Mobile menu
  const burger = document.querySelector('[data-burger]');
  const menu = document.getElementById('mobile-menu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { setMenu(false); burger.focus(); }
  });
  window.matchMedia(`(min-width: ${CONFIG.breakpoints.tablet}px)`)
    .addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // FAQ accordion (buttons + regions, one open at a time)
  const faqButtons = [...document.querySelectorAll('.faq__q')];
  faqButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      faqButtons.forEach((b) => {
        const on = b === btn && open;
        b.setAttribute('aria-expanded', String(on));
        b.closest('.faq__item').classList.toggle('is-open', on);
      });
    });
  });

  // Reveal on scroll
  const revealEls = document.querySelectorAll('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-in'));
  } else {
    const rio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); rio.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    revealEls.forEach((el) => rio.observe(el));
  }

  // Live call chip: timer + speech-like waveform
  const chip = document.querySelector('[data-call-chip]');
  if (chip) {
    const wave = chip.querySelector('.call-chip__wave');
    const timer = chip.querySelector('[data-call-timer]');
    const bars = Array.from({ length: CONFIG.callChip.barCount }, () => {
      const b = document.createElement('i'); wave.appendChild(b); return b;
    });
    const shape = (t) => bars.forEach((b, i) => {
      const env = Math.max(0.12, Math.abs(Math.sin(t * 0.0021 + i * 0.5) * Math.sin(t * 0.0007 + i * 0.13)));
      const jitter = reducedMotion ? 0.6 : 0.55 + Math.random() * 0.45;
      b.style.transform = `scaleY(${(env * jitter).toFixed(2)})`;
    });
    shape(1200);
    if (!reducedMotion) {
      const t0 = performance.now();
      setInterval(() => {
        const t = performance.now() - t0;
        shape(t);
        const s = Math.floor(t / 1000) + 14;
        timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      }, CONFIG.callChip.tickMs);
    }
  }
})();
