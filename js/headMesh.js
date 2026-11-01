/**
 * HeadMesh — hero figure: the real BustBaseMesh model rendered with Three.js.
 *
 * Geometry: assets/models/bustHead.obj.js (BustBaseMesh_Decimated, shoulders
 * cropped) parsed by OBJLoader → dark lit shell that holds the anatomy.
 * Wire + constellation nodes: assets/models/bustWire.js (the same bust's quad
 * topology, subdivided once and projected onto the Decimated surface).
 * Both are wrapped in .js files and loaded by <script> so the page keeps
 * working from file://, and only after the page is up (they weigh ~4.4 MB).
 *
 * Per frame, all in the vertex shader so shell, wire and nodes move as one:
 * neon waves sliding up and down, look-at (the neck follows less than the
 * head), blink, and elastic dents from clicks on the face.
 * Reduced motion: one still frame.
 */
const HeadMesh = (() => {
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const glf = (v) => Number(v).toFixed(5);
  const glv3 = (a) => `vec3(${a.map(glf).join(',')})`;
  const rgb = (s) => s.split(',').map((v) => parseInt(v, 10) / 255);

  function supported() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function decode(b64, Type) {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer);
  }

  // OBJLoader output is non-indexed: bring it into the head frame and weld it so the normals come out smooth
  function buildShellGeometry(objText, frame) {
    const obj = new THREE.OBJLoader().parse(objText);
    const src = obj.children[0].geometry.getAttribute('position').array;
    const ids = new Map(), verts = [], index = new Uint32Array(src.length / 3);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i] * frame.scale, y = (src[i + 1] - frame.cy) * frame.scale, z = (src[i + 2] - frame.cz) * frame.scale;
      const key = (Math.round((x + 2) * 1e4) * 65536 + Math.round((y + 2) * 1e4)) * 65536 + Math.round((z + 2) * 1e4);
      let id = ids.get(key);
      if (id === undefined) { id = verts.length / 3; ids.set(key, id); verts.push(x, y, z); }
      index[i / 3] = id;
    }
    obj.children[0].geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  function buildWireGeometry(data) {
    const pos16 = decode(data.pos, Int16Array), pos = new Float32Array(pos16.length);
    for (let i = 0; i < pos.length; i++) pos[i] = pos16[i] * data.scale;
    const position = new THREE.BufferAttribute(pos, 3);
    const normal = new THREE.BufferAttribute(decode(data.nor, Int8Array), 3, true);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', position);
    lines.setAttribute('normal', normal);
    lines.setIndex(new THREE.BufferAttribute(decode(data.idx, Uint16Array), 1));
    const nodes = new THREE.BufferGeometry();
    nodes.setAttribute('position', position);
    nodes.setAttribute('normal', normal);
    nodes.setAttribute('aCorner', new THREE.BufferAttribute(decode(data.cor, Uint8Array), 1));
    return { lines, nodes };
  }

  function makeShaders(cfg) {
    const R = cfg.ripple.max, w = cfg.waves, r = cfg.ripple, b = cfg.blink;
    const deform = /* glsl */`
      uniform float uTime, uYaw, uPitch, uBlink;
      uniform vec4 uRipples[${R}];
      varying vec3 vRest, vNormal, vView;
      varying float vWave, vTouch;
      const vec4 EYE = vec4(${cfg.eye.map(glf).join(',')});     // |x|, y, half width, half height

      float waveBand(vec3 p, float t) {
        float a = sin(p.y * ${glf(w.freqUp)} - t * ${glf(w.speedUp)} + sin(p.x * 2.1 + t * 0.31) * 0.7 + p.z * 0.5);
        float c = sin(p.y * ${glf(w.freqDown)} + t * ${glf(w.speedDown)} + sin(p.x * 1.4 - t * 0.23) * 0.9 - p.z * 0.4);
        return pow(0.5 + 0.5 * a, ${glf(w.sharpness)}) + ${glf(w.secondGain)} * pow(0.5 + 0.5 * c, ${glf(w.sharpness)});
      }

      void deformHead(vec3 rest, vec3 nrm, float lift, out vec3 p, out vec3 n) {
        p = rest; n = nrm;
        // blink: the eye opening squeezes shut around its middle line
        if (uBlink > 0.001 && p.z > 0.25) {
          float ex = (abs(p.x) - EYE.x) / (EYE.z * ${glf(b.reach)}), ey = (p.y - EYE.y) / (EYE.w * ${glf(b.reach)});
          p.y = mix(p.y, EYE.y, uBlink * ${glf(b.squeeze)} * smoothstep(1.0, 0.3, ex * ex + ey * ey));
        }
        vWave = waveBand(rest, uTime);
        p += n * vWave * ${glf(w.lift)};
        // clicks: elastic dent + a wrinkle ring running outward
        vTouch = 0.0;
        for (int i = 0; i < ${R}; i++) {
          vec4 q = uRipples[i];
          if (q.w < 0.0) continue;
          vec3 toP = rest - q.xyz;
          float d = length(toP), env = exp(-q.w * ${glf(r.decay)});
          float dent = exp(-d * d / ${glf(r.radius * r.radius)});
          float osc = cos(q.w * ${glf(r.spring)});
          float front = d - q.w * ${glf(r.speed)};
          float ring = exp(-front * front / ${glf(r.ringWidth * r.ringWidth)});
          float wrinkle = sin(front * ${glf(r.wrinkleFreq)}) * ring;
          float h = (-${glf(r.depth)} * dent * osc + ${glf(r.wrinkleAmp)} * wrinkle) * env;
          p += n * h;
          // tilt the normal along the slope so the light follows the dent
          float slope = (${glf(2 * r.depth)} * d / ${glf(r.radius * r.radius)} * dent * osc
            + ${glf(r.wrinkleAmp * r.wrinkleFreq)} * cos(front * ${glf(r.wrinkleFreq)}) * ring) * env;
          if (d > 0.0001) n = normalize(n - (toP / d) * slope);
          vTouch += (ring * 0.8 + dent * osc * osc) * env;
        }
        p += n * lift;
        // look-at around the base of the skull; the neck turns less than the head
        vec3 piv = ${glv3(cfg.pivot)};
        float f = mix(${glf(cfg.neckFollow)}, 1.0, smoothstep(${glf(cfg.neckBend[0])}, ${glf(cfg.neckBend[1])}, rest.y));
        float cy = cos(uYaw * f), sy = sin(uYaw * f), cp = cos(uPitch * f), sp = sin(uPitch * f);
        vec3 a = p - piv;
        a = vec3(a.x * cy + a.z * sy, a.y, -a.x * sy + a.z * cy);
        a = vec3(a.x, a.y * cp - a.z * sp, a.y * sp + a.z * cp);
        p = a + piv;
        vec3 m = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
        n = vec3(m.x, m.y * cp - m.z * sp, m.y * sp + m.z * cp);
      }
      void finish(vec3 p, vec3 n) {
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz; vNormal = normalMatrix * n;
        gl_Position = projectionMatrix * mv;
      }`;

    const fragCommon = /* glsl */`
      varying vec3 vRest, vNormal, vView;
      varying float vWave, vTouch;
      const vec3 ICE = ${glv3(rgb(cfg.colorLine))};
      const vec3 NEON = ${glv3(rgb(cfg.colorNeon))};
      const vec3 NEON_HOT = ${glv3(rgb(cfg.colorHot))};
      const vec3 KEY = normalize(${glv3(cfg.light)});
      float neckFade() { return smoothstep(${glf(cfg.neckFade[1])}, ${glf(cfg.neckFade[0])}, vRest.y); }
      vec3 neonOf(float v) { return mix(NEON, NEON_HOT, clamp(v - 0.45, 0.0, 1.0)) * v; }`;

    const s = cfg.shell, l = cfg.line, n = cfg.node;
    return {
      shellVert: `${deform}
        void main() { vec3 p, nn; deformHead(position, normal, 0.0, p, nn); vRest = position; finish(p, nn); }`,
      shellFrag: /* glsl */`
        uniform float uBlink; uniform vec2 uGaze;
        const vec4 EYE = vec4(${cfg.eye.map(glf).join(',')});
        ${fragCommon}
        void main() {
          vec3 N = normalize(vNormal), V = normalize(vView);
          float lam = max(dot(N, KEY), 0.0);
          float fill = max(dot(N, normalize(vec3(0.75, -0.1, 0.6))), 0.0);
          vec3 Hv = normalize(KEY + V);
          float spec = pow(max(dot(N, Hv), 0.0), ${glf(s.shininess)});
          float rim = pow(1.0 - max(dot(N, V), 0.0), ${glf(s.rimPower)});
          vec3 col = ICE * (${glf(s.ambient)} + ${glf(s.diffuse)} * lam + ${glf(s.fill)} * fill)
            + ICE * ${glf(s.specular)} * spec
            + NEON * ${glf(s.rim)} * rim
            + neonOf(vWave) * ${glf(s.wave)}
            + NEON_HOT * vTouch * ${glf(s.touch)};
          // digital eye: an almond slit that closes on blink, the iris follows the gaze
          if (vRest.z > 0.25) {
            float side = vRest.x < 0.0 ? -1.0 : 1.0;
            float ex = (abs(vRest.x) - EYE.x) / EYE.z;
            float open = (1.0 - uBlink) * max(0.0, 1.0 - ex * ex);
            float ey = (vRest.y - EYE.y) / EYE.w;
            float slit = smoothstep(0.1, -0.06, abs(ey) - open);
            vec2 iris = vec2(vRest.x - side * EYE.x - uGaze.x * EYE.z * 0.42, vRest.y - EYE.y - uGaze.y * EYE.w * 0.4);
            float ir = length(iris) / (EYE.w * 0.88);
            float ring = smoothstep(0.34, 0.6, ir) * smoothstep(1.1, 0.8, ir);
            col = mix(col, col * 0.3, slit);
            col += slit * (NEON * ${glf(cfg.eyeGlow)} * 0.28 + NEON_HOT * ${glf(cfg.eyeGlow)} * ring);
          }
          float fade = neckFade();
          gl_FragColor = vec4(col * fade, fade * ${glf(s.occluder)});
        }`,
      lineVert: `${deform}
        void main() { vec3 p, nn; deformHead(position, normal, ${glf(l.lift)}, p, nn); vRest = position; finish(p, nn); }`,
      lineFrag: /* glsl */`
        ${fragCommon}
        void main() {
          vec3 N = normalize(vNormal), V = normalize(vView);
          float lam = max(dot(N, KEY), 0.0);
          float edge = pow(1.0 - max(dot(N, V), 0.0), 2.0);
          vec3 col = ICE * (${glf(l.base)} + ${glf(l.lit)} * lam) + NEON * ${glf(l.edge)} * edge
            + neonOf(vWave) * ${glf(l.wave)} + NEON_HOT * vTouch * ${glf(l.touch)};
          float fade = neckFade();
          gl_FragColor = vec4(col * fade, fade);
        }`,
      nodeVert: `${deform}
        attribute float aCorner;
        uniform float uPx;
        void main() {
          vec3 p, nn; deformHead(position, normal, ${glf(n.lift)}, p, nn); vRest = position; finish(p, nn);
          gl_PointSize = uPx * (aCorner > 0.5 ? ${glf(n.sizeCorner)} : ${glf(n.size)}) * (1.0 + vWave * ${glf(n.waveSize)} + vTouch);
        }`,
      nodeFrag: /* glsl */`
        ${fragCommon}
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.25, r);
          if (a <= 0.0) discard;
          vec3 N = normalize(vNormal);
          float lam = max(dot(N, KEY), 0.0);
          vec3 col = ICE * (${glf(n.base)} + ${glf(n.lit)} * lam) + neonOf(vWave) * ${glf(n.wave)} + NEON_HOT * vTouch;
          float fade = neckFade() * a;
          gl_FragColor = vec4(col * fade, fade);
        }`,
    };
  }

  function create(canvas, figureEl, cfg, breakpoints, { reducedMotion }) {
    const hero = canvas.parentElement;
    let renderer = null, scene, camera, head, shellMesh, sharedU;
    let rtMain, rtA, rtB, quadScene, quadCam, quad, brightMat, blurMat, compositeMat;
    let W = 0, H = 0, dpr = 1, k = 1, isMobile = false, readyAt = 0;
    let raf = 0, running = false, visible = false, scroll = 0, failed = false;
    const pointer = { nx: 0, ny: 0, sx: 0, sy: 0 };
    let nextBlink = 0, blinkAt = -1e9, yaw = cfg.restYaw, pitch = cfg.restPitch, nextRipple = 0;
    const ripples = [];
    let lowQuality = false, lastFrame = 0, slowSum = 0, slowCount = 0;

    function buildScene() {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      const sh = makeShaders(cfg);
      sharedU = {
        uTime: { value: 0 }, uYaw: { value: yaw }, uPitch: { value: pitch }, uBlink: { value: 0 },
        uGaze: { value: new THREE.Vector2() }, uPx: { value: 1 },
        uRipples: { value: Array.from({ length: cfg.ripple.max }, () => new THREE.Vector4(0, 0, 0, -1)) },
      };
      const additive = {
        transparent: true, depthWrite: false, blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      };
      scene = new THREE.Scene();
      head = new THREE.Group();
      scene.add(head);
      camera = new THREE.PerspectiveCamera(30, 1, 1, 10);

      const shellGeo = buildShellGeometry(window.VIKI_BUST_OBJ, cfg.frame);
      window.VIKI_BUST_OBJ = null;                 // 4 MB of text is no longer needed
      shellMesh = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({
        uniforms: sharedU, vertexShader: sh.shellVert, fragmentShader: sh.shellFrag,
        blending: THREE.NoBlending, polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2,
      }));
      shellMesh.renderOrder = 0;
      shellMesh.frustumCulled = false;
      head.add(shellMesh);

      const wire = buildWireGeometry(window.VIKI_BUST_WIRE);
      window.VIKI_BUST_WIRE = null;
      const lines = new THREE.LineSegments(wire.lines, new THREE.ShaderMaterial({
        uniforms: sharedU, vertexShader: sh.lineVert, fragmentShader: sh.lineFrag, ...additive,
      }));
      lines.renderOrder = 1; lines.frustumCulled = false;
      head.add(lines);
      const nodes = new THREE.Points(wire.nodes, new THREE.ShaderMaterial({
        uniforms: sharedU, vertexShader: sh.nodeVert, fragmentShader: sh.nodeFrag, ...additive,
      }));
      nodes.renderOrder = 2; nodes.frustumCulled = false;
      head.add(nodes);

      // bloom: bright pass → separable blur at 1/4 res → added over the premultiplied frame
      quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const fsVert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const fsMat = (uniforms, fragmentShader) => new THREE.ShaderMaterial({
        uniforms, vertexShader: fsVert, fragmentShader, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
      });
      brightMat = fsMat({ tMap: { value: null } }, /* glsl */`
        uniform sampler2D tMap; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tMap, vUv);
          float m = max(c.r, max(c.g, c.b));
          float g = smoothstep(${glf(cfg.bloom.threshold)}, ${glf(cfg.bloom.threshold + 0.35)}, m);
          gl_FragColor = vec4(c.rgb * g, 1.0);
        }`);
      blurMat = fsMat({ tMap: { value: null }, uDir: { value: new THREE.Vector2() } }, /* glsl */`
        uniform sampler2D tMap; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tMap, vUv).rgb * 0.227;
          c += (texture2D(tMap, vUv + uDir * 1.385).rgb + texture2D(tMap, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tMap, vUv + uDir * 3.231).rgb + texture2D(tMap, vUv - uDir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }`);
      compositeMat = fsMat({ tMain: { value: null }, tBloom: { value: null }, uAlpha: { value: 0 } }, /* glsl */`
        uniform sampler2D tMain, tBloom; uniform float uAlpha; varying vec2 vUv;
        void main() {
          vec4 m = texture2D(tMain, vUv);
          vec3 c = m.rgb + texture2D(tBloom, vUv).rgb * ${glf(cfg.bloom.strength)};
          c = 1.0 - exp(-c * ${glf(cfg.exposure)});
          float a = max(m.a, max(c.r, max(c.g, c.b)));
          gl_FragColor = vec4(c, a) * uAlpha;
        }`);
      quadScene = new THREE.Scene();
      quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat);
      quad.frustumCulled = false;
      quadScene.add(quad);
    }

    function layout() {
      const rect = canvas.getBoundingClientRect();
      isMobile = rect.width < breakpoints.mobile;
      dpr = Math.min(window.devicePixelRatio || 1, lowQuality ? 1 : isMobile ? cfg.maxDprMobile : cfg.maxDpr);
      W = Math.max(1, Math.round(rect.width * dpr));
      H = Math.max(1, Math.round(rect.height * dpr));
      if (!renderer) return;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);

      // placed by CSS like the previous figures: .hero__figure is an empty layout box
      const f = figureEl.getBoundingClientRect();
      const scale = parseFloat(getComputedStyle(figureEl).getPropertyValue('--figure-scale')) || 1;
      const size = Math.min(f.height, f.width * 1.3) * scale;
      const cx = (f.left - rect.left + f.width / 2) * dpr;
      const cy = (f.top - rect.top + f.height / 2 + cfg.offsetY * size) * dpr;
      k = (size * cfg.scale * dpr) / cfg.modelHeight;
      head.scale.setScalar(k);
      head.updateMatrixWorld(true);

      // the camera looks straight at the head wherever it sits on the canvas (no off-axis skew)
      const D = cfg.cameraDistance * k;
      camera.fov = (2 * Math.atan(H / (2 * D)) * 180) / Math.PI;
      camera.aspect = W / H;
      camera.near = D * 0.3; camera.far = D * 2;
      camera.position.set(0, 0, D);
      camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      sharedU.uPx.value = dpr * Math.max(0.75, k / dpr / 240);
      const samples = isMobile || lowQuality ? 0 : cfg.msaa;
      if (rtMain) { rtMain.dispose(); rtA.dispose(); rtB.dispose(); }
      rtMain = new THREE.WebGLRenderTarget(W, H, { samples, depthBuffer: true });
      const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
      rtA = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false });
      rtB = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false });
      blurMat.userData.px = [1 / bw, 1 / bh];
    }

    function drawQuad(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target);
      renderer.render(quadScene, quadCam);
    }

    function render(t) {
      if (!renderer) return;
      const u = sharedU;
      const tSec = t / 1000;
      // cursor relative to the head itself, clamped to safe turn limits
      const rect = figureEl.getBoundingClientRect(), hr = hero.getBoundingClientRect();
      const active = pointer.nx !== 0 || pointer.ny !== 0;
      const hx = ((rect.left + rect.width / 2 - hr.left) / hr.width) * 2 - 1;
      const hy = ((rect.top + rect.height / 2 - hr.top) / hr.height) * 2 - 1;
      const tx = active ? Math.max(-1, Math.min(1, (pointer.nx - hx) * cfg.followGain)) : 0;
      const ty = active ? Math.max(-1, Math.min(1, (pointer.ny - hy) * cfg.followGain)) : 0;
      pointer.sx += (tx - pointer.sx) * cfg.followEase;
      pointer.sy += (ty - pointer.sy) * cfg.followEase;
      if (reducedMotion) {
        yaw = cfg.staticYaw; pitch = cfg.restPitch;
      } else {
        yaw = cfg.restYaw + pointer.sx * cfg.lookYaw + Math.sin(t / 6100) * cfg.idleDrift;
        pitch = cfg.restPitch + pointer.sy * cfg.lookPitch + Math.sin(t / 8300) * cfg.idleDrift * 0.5;
      }
      u.uTime.value = reducedMotion ? cfg.staticWaveTime : tSec;
      u.uYaw.value = yaw; u.uPitch.value = pitch;
      u.uGaze.value.set(reducedMotion ? 0 : pointer.sx, reducedMotion ? 0 : -pointer.sy);

      // blink: regular rhythm with a little variation
      let blink = 0;
      if (!reducedMotion) {
        if (t > nextBlink) { blinkAt = t; nextBlink = t + cfg.blink.minMs + Math.random() * (cfg.blink.maxMs - cfg.blink.minMs); }
        const bp = (t - blinkAt) / cfg.blink.ms;
        if (bp >= 0 && bp <= 1) blink = Math.pow(Math.sin(bp * Math.PI), 0.7);
      }
      u.uBlink.value = blink;

      for (let i = 0; i < cfg.ripple.max; i++) {
        const q = ripples[i], v = u.uRipples.value[i];
        if (!q || t - q.born > cfg.ripple.lifeMs) { v.w = -1; continue; }
        v.set(q.x, q.y, q.z, (t - q.born) / 1000);
      }

      const assemble = reducedMotion ? 1 : easeOut(clamp01((t - cfg.assembleDelayMs) / cfg.assembleMs));
      // on phones the head sits below the copy: stay bright while it is being scrolled into view
      const dissolve = isMobile ? clamp01((scroll - cfg.mobileDissolveFrom) / (1 - cfg.mobileDissolveFrom)) : scroll;
      compositeMat.uniforms.uAlpha.value = assemble * (reducedMotion ? 1 : 1 - dissolve * 0.9);

      renderer.setRenderTarget(rtMain);
      renderer.render(scene, camera);

      brightMat.uniforms.tMap.value = rtMain.texture;
      drawQuad(brightMat, rtA);
      const px = blurMat.userData.px;
      for (let i = 0; i < cfg.bloom.passes; i++) {
        const spread = 1 + i * cfg.bloom.spread;
        blurMat.uniforms.tMap.value = rtA.texture; blurMat.uniforms.uDir.value.set(px[0] * spread, 0);
        drawQuad(blurMat, rtB);
        blurMat.uniforms.tMap.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, px[1] * spread);
        drawQuad(blurMat, rtA);
      }
      compositeMat.uniforms.tMain.value = rtMain.texture;
      compositeMat.uniforms.tBloom.value = rtA.texture;
      drawQuad(compositeMat, null);
    }

    // click on the face → ray in the head's rest pose (the shader turns the head, the geometry stays put)
    function onClick(e) {
      if (!renderer || reducedMotion || !running || e.target.closest('a, button')) return;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, camera);
      const piv = new THREE.Vector3().fromArray(cfg.pivot).multiplyScalar(k);
      const turn = new THREE.Matrix4().makeTranslation(piv.x, piv.y, piv.z)
        .multiply(new THREE.Matrix4().makeRotationX(pitch))
        .multiply(new THREE.Matrix4().makeRotationY(yaw))
        .multiply(new THREE.Matrix4().makeTranslation(-piv.x, -piv.y, -piv.z));
      rc.ray.applyMatrix4(turn.invert());
      const hits = [];
      shellMesh.raycast(rc, hits);
      if (!hits.length) return;
      hits.sort((a, b) => a.distance - b.distance);
      const hit = hits[0].point.clone().divideScalar(k);
      if (hit.y < cfg.neckFade[0]) return;          // the dissolving neck does not react
      ripples[nextRipple] = { x: hit.x, y: hit.y, z: hit.z, born: performance.now() - readyAt };
      nextRipple = (nextRipple + 1) % cfg.ripple.max;
    }

    // weak GPU: after a slow stretch drop once to 1× resolution without MSAA
    function watchFrameRate(now) {
      const dt = now - lastFrame;
      lastFrame = now;
      if (lowQuality || dt > 250) return;          // a long gap = hidden tab, not a slow GPU
      slowSum += dt; slowCount++;
      if (slowCount < cfg.slowFrames) return;
      if (slowSum / slowCount > cfg.slowFrameMs) { lowQuality = true; layout(); }
      slowSum = 0; slowCount = 0;
    }

    function frame(now) {
      if (!running) return;
      watchFrameRate(now);
      render(now - readyAt);
      raf = requestAnimationFrame(frame);
    }

    function start() {
      visible = true;
      if (running || reducedMotion || !renderer) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() { visible = false; running = false; cancelAnimationFrame(raf); }

    function load() {
      const base = cfg.scripts;
      return loadScript(base.three)
        .then(() => loadScript(base.objLoader))
        .then(() => loadScript(base.model))
        .then(() => loadScript(base.wire))
        .then(() => {
          buildScene();
          layout();
          readyAt = performance.now();
          hero.addEventListener('click', onClick);
          if (reducedMotion) { render(0); canvas.style.opacity = String(1 - scroll * 0.9); }
          else if (visible) start();
        })
        .catch((err) => { failed = true; console.warn('HeadMesh:', err); });   // the page works without the figure
    }

    return {
      init() {
        // after the page is up: the model must never delay the headline
        if (document.readyState === 'complete') load();
        else window.addEventListener('load', load, { once: true });
      },
      start,
      stop,
      resize() {
        if (!renderer || failed) return;
        layout();
        if (reducedMotion) render(0);
      },
      setPointer(nx, ny) { pointer.nx = nx; pointer.ny = ny; },
      setScroll(p) {
        scroll = clamp01(p);
        if (reducedMotion) canvas.style.opacity = String(1 - scroll * 0.9);
      },
    };
  }

  return { create, supported };
})();
