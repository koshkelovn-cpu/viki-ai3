/**
 * CONFIG — every tuning knob for the VIKI AI landing lives here.
 * Loaded first; the modules below read it as a global (classic scripts,
 * so the page also works when opened straight from disk via file://).
 */
const CONFIG = Object.freeze({
  breakpoints: { mobile: 720, tablet: 1080 },

  // Hero background: dense dot cloud (PolyAI density + Vocel depth)
  particles: {
    desktopCount: 42000,
    tabletCount: 22000,
    mobileCount: 7000,
    depthBuckets: 5,           // far (dim, 1px) → near (bright, 2px)
    sizes: [1, 1, 1, 1.5, 2],
    alphas: [0.22, 0.32, 0.44, 0.6, 0.85],
    color: '226, 231, 240',    // rgb triplet — monochrome, faintly cool
    repelRadius: 140,          // css px around the cursor
    repelForce: 2.4,
    swirl: 0.9,                // tangential "magnetic drift" around the cursor
    spring: 0.035,             // pull back to home position
    damping: 0.86,
    flowAmp: 7,                // css px — slow "currents" through the field
    flowSpeed: 0.00022,
    parallax: 10,              // css px at nearest depth
    textClearance: 0.6,        // 0..1 — thin the field behind the headline
    introMs: 1400,
  },

  // Hero figure: ridged liquid-chrome bust drawn from scan lines
  silhouette: {
    rowsDesktop: 132,          // denser scan lines → the figure reads as solid
    rowsMobile: 80,
    body: 'reference',         // 'reference' = exact shape from BACK.jpg (current); 'human' / 'natural' / 'v1' = earlier shapes
    refScale: 1.12,            // reference frame height × figure size
    refTop: 0.0,               // shift of the reference frame (× figure size)
    refOffsetX: 0.0,
    refSideFade: 0.18,         // soft dissolve where the photo frame cuts the shoulders
    throatAccent: false,       // glowing point + ripples on the neck (true = old look)
    sternumAccent: false,      // glowing point on the chest (true = old look)
    showRings: false,          // faint concentric rings + cross behind the figure (true = old look)
    occluder: 0.97,            // opacity of the dark body fill that hides particles behind the figure
    baseLight: 0.16,           // minimum brightness inside the body (platinum look; was 0.09)
    samplesDesktop: 150,
    samplesMobile: 90,
    maxDpr: 1.5,
    ridgeDepth: 0.05,          // how far lines are lifted by the body volume (× figure height)
    lineWidth: 1.05,
    flowWave: 1.6,             // px — liquid ripple running along the lines
    flowSpeed: 0.0011,
    glow: 0.75,                // bloom strength
    sheen: 0.45,               // diagonal light sweep over the chrome
    sheenSpeed: 0.00007,
    volumeGlow: 0.1,           // soft light behind the chest
    breathScale: 0.015,        // ±1.5 % torso scale
    breathPeriodMs: 5600,
    parallax: 16,              // css px at depth 1
    lightShift: 0.55,          // how much the cursor moves the key light
    assembleMs: 1900,          // lines condense out of noise on load
    assembleDelayMs: 350,
    accentPulseMs: 2800,       // throat "voice" ripple cadence
    rings: [0.34, 0.47, 0.61, 0.76],
    ringAlpha: 0.05,
    color: '238, 242, 248',
  },

  // Hero figure (current): the BustBaseMesh model in Three.js — lit shell, quad wire, nodes, neon waves
  headMesh: {
    enabled: true,             // false = formula-built dot head (CONFIG.head below); also used when WebGL is missing
    scripts: {
      three: 'js/vendor/three.min.js',
      objLoader: 'js/vendor/OBJLoader.js',
      model: 'assets/models/bustHead.obj.js',
      wire: 'assets/models/bustWire.js',
    },
    frame: { cy: -0.7764, cz: -0.0949, scale: 17.0648 },  // OBJ → head frame: crown +1, chin -1, face toward +z
    modelHeight: 2.42,         // crown → end of the neck fade, head-frame units
    scale: 0.92,               // × figure size
    offsetY: -0.02,            // × figure size
    cameraDistance: 7,        // head-frame units — lower = stronger perspective
    maxDpr: 1.5,
    maxDprMobile: 1.25,
    msaa: 4,
    mobileDissolveFrom: 0.7,   // share of the hero scrolled before the head starts dissolving on phones
    slowFrames: 90,           // frames measured before deciding the GPU is too slow
    slowFrameMs: 30,           // average above this → 1× resolution, no MSAA
    neckFade: [-0.98, -1.32],  // head-frame y: starts dissolving → fully gone before the shoulders flare
    // look-at
    pivot: [0, -0.72, -0.2],   // base of the skull
    neckBend: [-1.3, -0.72],   // y range where the turn grows from the neck base to the full head
    neckFollow: 0.3,           // share of the turn kept at the neck base
    restYaw: -0.1,             // rad — pose with no cursor, slightly toward the headline
    restPitch: 0.02,
    lookYaw: 0.6,              // rad — max turn left / right
    lookPitch: 0.26,           // rad — max nod up / down
    followGain: 1.1,
    followEase: 0.06,          // smoothing of the look-at (lower = softer)
    idleDrift: 0.03,           // rad — barely visible "alive" drift
    staticYaw: -0.22,          // pose for reduced motion
    staticWaveTime: 2.4,       // s — wave position in the still frame
    // colour
    colorLine: '224, 224, 224',
    colorNeon: '190, 190, 190',
    colorHot: '255, 255, 255',
    light: [-0.5, 0.55, 0.75], // key light, view space
    exposure: 1.25,            // soft highlight roll-off instead of clipping to white
    shell: {
      ambient: 0.025, diffuse: 0.2, fill: 0.03, specular: 0.09, shininess: 30,
      rim: 0.22, rimPower: 2.8, wave: 0.22, touch: 0.4,
      occluder: 0.99,          // particles never show through the head
    },
    line: { lift: 0.003, base: 0.05, lit: 0.34, edge: 0.2, wave: 1.5, touch: 1.0 },
    node: { lift: 0.005, size: 0.9, sizeCorner: 1.6, waveSize: 0.9, base: 0.06, lit: 0.35, wave: 1.8 },
    // neon waves sliding up and down the head (head-frame y; two crossing families)
    waves: { freqUp: 4.2, speedUp: 1.05, freqDown: 2.7, speedDown: 0.72, sharpness: 10, secondGain: 0.75, lift: 0.006 },
    bloom: { threshold: 0.42, strength: 0.5, passes: 2, spread: 0.8 },
    // eye opening in the head frame: |x|, y, half width, half height (blink + iris)
    eye: [0.35, -0.05, 0.17, 0.07],
    eyeGlow: 0.34,
    blink: { minMs: 3400, maxMs: 5200, ms: 240, squeeze: 0.92, reach: 1.25 },
    // click on the face: elastic dent + wrinkle ring (head-frame units)
    ripple: {
      max: 4, lifeMs: 2800, depth: 0.1, radius: 0.2, spring: 11, decay: 2.1,
      speed: 0.85, ringWidth: 0.17, wrinkleFreq: 40, wrinkleAmp: 0.014,
    },
    assembleMs: 1400,
    assembleDelayMs: 100,
  },

  // Fallback hero figure: formula-built 3D dot-matrix head + neck (refs face.jpg / face3.jpg)
  head: {
    enabled: true,             // false = previous scan-line silhouette (CONFIG.silhouette above)
    pointsDesktop: 52000,
    pointsMobile: 20000,
    gridDesktop: [300, 200],   // rays (azimuth × elevation) used to build the surface once
    gridMobile: [180, 120],
    maxDpr: 1.5,
    scale: 1.0,                // crown → neck end × figure size
    offsetY: 0.0,              // × figure size
    anatomy: 'v2',             // 'v2' = proportions from face5/6/7 (current); 'v1' = first version
    motion: 'follow',          // 'follow' = head looks at the cursor (current); 'sway' = autonomous profile ↔ front
    restYaw: -0.12,            // rad — pose with no cursor: almost frontal, slightly toward the headline
    lookYaw: 0.62,             // rad — max turn left / right toward the cursor
    lookPitch: 0.26,           // rad — max nod up / down
    gazeYaw: 0.38,             // rad — eyes lead the head a little further
    gazePitch: 0.25,
    followEase: 0.055,         // smoothing of the look-at (lower = softer)
    idleDrift: 0.035,          // rad — barely visible "alive" drift
    yawFrom: -1.25,            // sway mode: profile, facing the headline (positive = facing right)
    yawTo: -0.15,              // sway mode: almost frontal
    yawPeriodMs: 18000,        // sway mode: one calm sway there and back
    staticYaw: -0.3,           // pose for mobile / reduced motion
    pitch: 0.04,
    pointerYaw: 0.14,          // sway mode: cursor adds a little turn
    pointerPitch: 0.06,
    neckFade: [-1.0, -1.6],    // model y: neck starts dissolving → fully gone (no hard cut, no shoulders)
    light: [-0.55, 0.6, 0.7],  // key light (view space)
    ambient: 0.24,             // brighter than v1 (0.16) — the head clearly dominates the dark hero
    diffuse: 1.0,
    specular: 0.45,
    edgeFloor: 0.45,           // brightness kept at grazing angles (crisp bright contour)
    eyeGlow: 0.35,             // sclera a touch brighter (dims while blinking)
    dotGain: 1.3,
    occluder: 0.985,           // dark fill under the dots — particles never show through
    glow: 0.7,
    blinkMinMs: 3800,
    blinkMaxMs: 7800,
    blinkMs: 260,
    pulseOrigins: [[0, -0.556, 0.8], [0, 0.55, 0.7], [0.6, 0.0, -0.1], [-0.6, 0.0, -0.1]],  // mouth, forehead, ears
    pulseMinMs: 3200,
    pulseMaxMs: 6500,
    pulseSpeed: 0.0005,        // model units per ms
    pulseWidth: 0.06,
    pulseReach: 1.5,
    pulseGain: 0.45,
    assembleMs: 1600,
    assembleDelayMs: 250,
    color: '236, 241, 250',    // white; deep blue alternative: '120, 210, 255'
  },

  // Section 2: orb + channel cables
  orbit: {
    ellipseRx: 0.42,           // × container width
    ellipseRy: 0.39,           // × container height
    sag: 0.16,                 // relaxed cable sag (× cable length)
    tautSag: 0.18,             // multiplier of sag while the channel is hovered/focused
    wobble: 0.08,              // idle breathing of the cables
    springStiffness: 0.12,
    springDamping: 0.78,
    pulseMinMs: 1900,          // pause between pulses
    pulseMaxMs: 3800,
    pulseTravelMs: 950,        // channel → orb
    replyDelayMinMs: 120,      // orb "thinks"
    replyDelayMaxMs: 180,
    replyTravelMs: 560,        // orb → channel
    pulseLength: 46,           // px of glowing dash
    videoRootMargin: '300px',  // lazy-load distance for orb.mp4
    // living rings around the orb + the link between a ring and a selected channel's cable
    rings: {
      // radius × orb radius; tilt: rad, 0 = facing the viewer; roll / rollSway: rad, screen rotation and its swing;
      // speed: rad/s of the light travelling around; swaySpeed: how fast the ring sways; alpha: base brightness
      list: [
        { radius: 1.32, tilt: 1.02, roll: 1.05, rollSway: 0.28, speed: 0.62, swaySpeed: 0.17, alpha: 0.2, phase: 0.4 },
        { radius: 1.62, tilt: 1.2, roll: -0.42, rollSway: 0.3, speed: -0.44, swaySpeed: 0.13, alpha: 0.2, phase: 2.1 },
        { radius: 1.95, tilt: 1.3, roll: 0.26, rollSway: 0.26, speed: 0.33, swaySpeed: 0.1, alpha: 0.17, phase: 4 },
        { radius: 2.3, tilt: 1.36, roll: -0.16, rollSway: 0.2, speed: -0.24, swaySpeed: 0.08, alpha: 0.14, phase: 5.2 },
      ],
      segments: 120,           // smoothness of one ring
      runLength: 8,            // segments per stroke: smaller = finer light, heavier
      glowFrom: 0.42,          // soft glow only on lines brighter than this
      maxDpr: 1.5,
      maxDprMobile: 2,
      mobileScale: 0.8,        // rings × this on phones
      lineWidth: 1,            // css px
      glowWidth: 4,            // css px of the soft glow
      backDim: 0.55,           // the half behind the orb
      arcWidth: 0.55,          // rad — length of the travelling light
      arcGain: 0.5,
      beadSize: 1.7,           // css px — the small light riding each ring
      beadAlpha: 0.95,
      tiltSway: 0.07,          // rad
      hoverRadius: 0.72,       // × core half width: what counts as "over the orb"
      hoverSpeed: 2.6,         // ring speed × this with the cursor on the orb
      hoverGlow: 0.9,          // brightness + this much
      hoverEaseSec: 0.45,
      anchorAlong: 0.62,       // where a ring touches the cable: 0 = at the icon, 1 = at the orb
      linkWidth: 0.5,          // rad — how much of the ring stretches
      linkStiffness: 26,       // spring of the stretch
      linkDamping: 8.5,
      linkFollowSec: 0.3,
      linkedCalm: 0.72,        // a connected ring slows by this share
      linkGlow: 0.55,
      tipSize: 2.4,            // css px — the point where ring and cable meet
      tipGlow: 8,
      activeWidth: 0.9,        // selected cable: + this many px
      dimOthers: 0.62,         // other cables lose this share of brightness
      lineEaseSec: 0.32,
      breath: 0.28,            // idle pulsing of the cables
      breathSpeed: 0.0014,
      flowSpeed: 34,           // css px/s — light flowing along the selected cable
    },
    // cursor proximity: near → orb tightens, mid → slightly widens, far → back to 1
    proximity: {
      nearScale: 0.93,
      midScale: 1.03,
      nearRadius: 0.5,         // × orb radius — fully "tight" inside this
      midRadius: 2.6,          // × orb radius — peak widening here
      farRadius: 5,            // × orb radius — back to 1 beyond this
      stiffness: 0.08,
      damping: 0.82,
    },
  },

  // Sections 2 → 3: one sticky canvas — particle columns flowing into filaments
  flowStage: {
    color: '232, 236, 244',
    columns: {
      desktopDots: 9000,       // per column
      mobileDots: 2200,
      widthDesktop: 150,       // css px
      widthMobile: 56,
      centerX: 0.075,          // × width from each edge
      top: 0.2,                // × section 2 height
      height: 0.8,             // × section 2 height — the base reaches the 2→3 seam
      alpha: 0.45,             // low — never competes with the orb
      mobileAlpha: 0.22,
      shimmer: 0.28,           // per-dot alpha twinkle
      shimmerSpeed: 0.0016,
      vibration: 0.6,          // css px
      flutes: 6,
    },
    filaments: {
      cell: 14,                // css px — field resolution (bilinear in between)
      coverage: 0.62,          // max share of pixels lit in the brightest folds
      brightness: 0.62,        // grain brightness ceiling
      frameSkip: 2,            // field redraw every N frames (motion is slow)
      scale: 430,              // css px — size of the flowing forms
      speed: 0.000045,         // calm: ~4× slower than the reference video
      intensity: 0.5,          // overall ceiling
      fill: 0.3,               // soft grainy volumes
      ridge: 0.85,             // luminous filament edges
      ridgeWidth: 0.0045,
      fadeIn: 420,             // css px of soft blend from section 2 into 3
      fadeOut: 260,            // css px fade at the bottom of section 3
      streamReach: 700,        // how far the column tails flow into section 3
      textDim: 0.75,           // 0..1 — calmer behind the section copy
      extendTo: 'stage',       // 'stage' = sections 3–6 (current); 'section3' = only section 3 (first version)
      dimSelector: '.about__grid, .steps, .benefits__head .section-head, .cards, .faq .section-head, .faq__list',
    },
  },

  // Section 4: wireframe brain — static network, only signal pulses move
  brain: {
    mode: 'image',             // 'image' = assets/brain.png (current); 'canvas' = procedural BrainNet
    // neuron signals running through the folds of the brain photo (image mode, desktop only)
    imagePulses: {
      maxPulses: 6,
      spawnMinMs: 120,
      spawnMaxMs: 360,
      speed: 0.85,             // css px per ms — fast, like current in a cable
      trail: 12,               // tail length in route points (~4 px each)
      alpha: 1,
      glow: 14,                // css px head glow radius
      jitter: 0.8,             // css px electric flicker of the tail
      routeGlow: 0.12,         // light along the whole route while a signal runs
      color: '225, 235, 255',
    },
    nodesDesktop: 900,
    nodesMobile: 420,
    neighbours: 5,
    longLinks: 0.35,           // share of nodes with one longer link (mesh, not constellation)
    edgeAlpha: 0.11,
    nodeAlpha: 0.75,
    clusterBoost: 0.55,        // denser knot in the frontal lobe (as in the reference)
    pulsesMax: 4,
    pulseEveryMs: 900,
    pulseHopMs: 260,           // time per edge
    pulseHops: [4, 8],
    pulseTrail: 0.35,          // fraction of an edge lit behind the pulse
  },

  // Section 6 (CTA band): endless monochrome wireframe mountains
  terrain: {
    colsDesktop: 100,          // upper limit; the real count follows the canvas width
    rowsDesktop: 48,
    colsMobile: 56,
    rowsMobile: 32,
    cell: 0.22,                // world units per grid square
    near: 2.6,                 // world distance of the nearest row (its fade stays below the canvas edge)
    settle: 4,                 // distance over which mountains settle down near the camera
    height: 2.15,              // world height of the relief
    cameraHeight: 1.6,
    pitch: 0.13,               // rad — camera tilted down
    pivot: 7,                  // world distance of the cursor-yaw pivot
    horizon: 0.46,             // × canvas height
    slowFrames: 90,            // frames measured before deciding the device is too slow
    slowFrameMs: 30,           // average above this → a coarser grid (once)
    coarseCell: 1.45,          // grid square × this on slow devices
    maxDpr: 1.5,
    tiltYaw: 0.1,              // rad — max cursor yaw (no 360°)
    tiltPitch: 0.05,           // rad — max cursor pitch
    drift: 18,                 // css px — cursor drift of the whole mesh
    spring: 0.05,
    lineWidth: 0.8,            // css px
    lineGrey: [150, 200, 255], // shadow side → light side
    lineAlpha: [0.34, 0.58, 0.92],
    slopeLight: 0.75,          // how strongly the slope splits the lines into grey and white
    glow: 0.32,
    pulses: {
      count: 22,
      countMobile: 9,
      speed: 13,               // grid cells per second
      trail: 12,               // cells of fading tail
      turn: 0.22,              // chance to turn at a crossing
      alpha: 1,
    },
    zoom: {
      perPx: 0.0052,           // world units per wheel pixel (one notch ≈ 1.7 grid squares)
      minVisible: 0.97,        // share of the relief that must be in view before the wheel zooms it
      easeSec: 0.42,           // inertia — higher = softer
      maxSpeed: 3.2,           // world units per second
      maxEventPx: 160,         // one wheel event never moves further than this
      linePx: 16,
      pagePx: 400,
    },
  },

  callChip: { barCount: 26, tickMs: 110 },
});
