// ---------- night, weather and effects ----------
// What makes a 3D world a night out or a storm: rain falling round the camera, wet ground that mirrors every light
// in its puddles, neon signs, lit buildings, and effects you place: smoke, fire, an explosion at a moment you choose,
// sparks, and dust thrown up from the ground. Every particle's place is worked out from the world's time alone, so
// scrubbing and exports show the same thing.
const FX = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), deg = v => v * Math.PI / 180;
  const NOISE = `float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }`;

  // ----- rain: streaks falling in a box that goes where the camera goes -----
  function rainLines(n = 8000) {
    const seed = new Float32Array(n * 2 * 3), end = new Float32Array(n * 2);
    let s = 9; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) { const a = r(), b = r(), c = r(); for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; } }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(seed, 3)); g.setAttribute('aEnd', new T.BufferAttribute(end, 1));
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new T.Vector3() }, uGround: { value: 0 }, uWind: { value: 0 }, uCol: { value: new T.Color(.7, .75, .8) } },
      vertexShader: `uniform float uTime, uGround, uWind; uniform vec3 uCam; attribute float aEnd; varying float vA;
        void main() { vec3 box = vec3(30., 16., 30.) * 100.; float fall = 900. + position.z * 300.;
          vec3 p = vec3(position.x * box.x + uWind * 60. * uTime, mod(position.y * box.y - uTime * fall, box.y), position.z * box.z);
          p.x = mod(p.x - uCam.x + box.x / 2., box.x) + uCam.x - box.x / 2.; p.z = mod(p.z - uCam.z + box.z / 2., box.z) + uCam.z - box.z / 2.; p.y += uGround;
          p += aEnd * vec3(-uWind * 2., fall * .045, 0.);
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; vA = smoothstep(6000., 200., -mv.z) * (.35 + .65 * position.z); }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol, vA * .55); }' });
    const l = new T.LineSegments(g, m); l.frustumCulled = false; return l;
  }

  // ----- wet ground: a mirror over it, showing through in puddles and as a sheen -----
  function wetMirror() {
    const r = new T.Reflector(new T.PlaneGeometry(1, 1), { textureWidth: 1024, textureHeight: 1024, clipBias: .003, color: 0xffffff });
    r.rotation.x = -Math.PI / 2;
    const m = r.material; m.transparent = true; m.uniforms.uWet = { value: .5 };
    m.vertexShader = m.vertexShader.replace('void main() {', 'varying vec3 vW;\nvoid main() { vW = (modelMatrix * vec4(position, 1.)).xyz;');
    m.fragmentShader = m.fragmentShader.replace('varying vec4 vUv;', `varying vec4 vUv; varying vec3 vW; uniform float uWet; ${NOISE}`)
      .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );', `vec2 q = vW.xz / 100.; float pud = smoothstep(.45, .62, vn(q * .35) * .65 + vn(q * 1.3) * .35);
        float ripple = vn(q * 9.) * .15; float a = uWet * mix(.18, .85, pud) * (1. - ripple);
        gl_FragColor = vec4(base.rgb * .9, a);`);
    m.needsUpdate = true; r.frustumCulled = false; return r;
  }

  World.stageHooks.push(({ B, o, t, ground, cam, k }) => {
    // rain
    const rain = clamp(+o.rain || 0, 0, 100);
    if (rain > 0 && !B.rainFx) { B.rainFx = rainLines(); B.scene.add(B.rainFx); }
    if (B.rainFx) { B.rainFx.visible = rain > 0; const u = B.rainFx.material.uniforms; u.uTime.value = t; u.uCam.value.copy(cam.position); u.uGround.value = ground; u.uWind.value = +o.wind || 0;
      B.rainFx.geometry.setDrawRange(0, Math.round(rain * 80) * 2); }
    // wet ground
    const wet = o.ground !== 'ocean' && o.ground !== 'none' ? clamp(+o.wet || 0, 0, 100) / 100 : 0;
    if (wet > 0 && !B.wetFx) { B.wetFx = wetMirror(); B.scene.add(B.wetFx); }
    if (B.wetFx) { B.wetFx.visible = wet > 0; B.wetFx.position.set(cam.position.x, ground + .6, cam.position.z); B.wetFx.scale.setScalar(40000); B.wetFx.material.uniforms.uWet.value = wet; }
    if (B.land?.material) { const m = B.land.material; m.userData.dry ??= m.roughness; m.roughness = m.userData.dry * (1 - wet * .8); m.envMapIntensity = 1 + wet * 1.5; }
    // the size of a point on the screen, for effects' particles
    const px = (S.h * (k || 1)) / (2 * Math.tan(deg(cam.fov) / 2));
    B.props?.traverse(n => { if (n.userData.fxMat) n.userData.fxMat.uniforms.uPx.value = px; });
  });

  // ----- effects: particles from a place, each from its own birth time -----
  const KINDS = [['smoke', 'Smoke'], ['fire', 'Fire'], ['explosion', 'Explosion'], ['sparks', 'Sparks'], ['dust', 'Dust from the ground'], ['steam', 'Steam']];
  const KIND = { smoke: 0, fire: 1, sparks: 2, dust: 3, explosion: 4, steam: 5 };
  const LIFE = { smoke: 5, fire: 1.1, sparks: 1.4, dust: 2.6, explosion: 6, steam: 3 };
  const fxCache = new Map();
  function fxPoints(n) {
    const seed = new Float32Array(n * 4); let s = 3; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n * 4; i++) seed[i] = r();
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aSeed', new T.BufferAttribute(seed, 4));
    const idx = new Float32Array(n); for (let i = 0; i < n; i++) idx[i] = i / n; g.setAttribute('aIdx', new T.BufferAttribute(idx, 1));
    return g;
  }
  const FX_VERT = `uniform float uTime, uLife, uSize, uStart, uWind, uPx; uniform int uKind; attribute vec4 aSeed; attribute float aIdx;
    varying vec3 vCol; varying float vA, vSoft;
    vec3 fireCol(float a) { return mix(mix(vec3(1., .92, .7) * 9., vec3(1., .42, .08) * 5., smoothstep(0., .35, a)), vec3(.25, .08, .02), smoothstep(.35, .9, a)); }
    void main() {
      vec4 s = aSeed; float age, a; vec3 p = vec3(0.); float size = .3; vCol = vec3(.5); vA = 1.; vSoft = 1.;
      if (uKind == 4) { age = uTime - uStart - s.w * .08; a = age / uLife;
        if (age < 0. || a > 1.) { gl_PointSize = 0.; gl_Position = vec4(2., 2., 2., 1.); return; }
        vec3 dir = normalize(s.xyz - .5 + vec3(0., .25, 0.));
        if (aIdx < .55) { float r = uSize * 2.6 * (1. - exp(-age * 5.)) * (.4 + .6 * s.w); p = dir * r + vec3(uWind * age * .3, age * .9 * uSize, 0.);
          size = uSize * (.7 + age * 1.6) * (.6 + .4 * s.x); float b = smoothstep(.0, 1.6, age);
          vCol = mix(fireCol(age / 1.4), vec3(.09, .085, .08), b); vA = (1. - smoothstep(.55, 1., a)) * mix(.95, .6, b); vSoft = 1. + b; }
        else if (aIdx < .8) { vec3 v = (s.xyz - .5) * vec3(26., 14., 26.) * uSize / 3. + vec3(0., 6., 0.); p = v * age + vec3(0., -4.9 * age * age, 0.);
          size = .07; vCol = vec3(1., .65, .25) * 6.; vA = 1. - smoothstep(.0, .35, a); vSoft = .5; }
        else { float d = max(0., age - .5); p = (s.xyz - .5) * uSize * 3. + vec3(uWind * d * .6, d * 1.3 * uSize, 0.); size = uSize * (1.2 + d * .9);
          vCol = vec3(.1); vA = smoothstep(.0, .6, d) * (1. - smoothstep(.4, 1., a)) * .7; vSoft = 2.; }
      } else {
        age = mod(uTime + aIdx * uLife + s.w * .3, uLife); a = age / uLife;
        if (uKind == 0 || uKind == 5) { p = vec3((s.x - .5) * .3, 0., (s.z - .5) * .3) * uSize + vec3(uWind * age * .5, age * (uKind == 5 ? 1.6 : 1.1) * uSize, 0.) + vec3(s.x - .5, 0., s.y - .5) * age * .35 * uSize;
          size = uSize * mix(.3, uKind == 5 ? 1.6 : 2.6, a); vCol = uKind == 5 ? vec3(.85) : vec3(.16); vA = smoothstep(0., .12, a) * pow(1. - a, 1.4) * (uKind == 5 ? .35 : .55); vSoft = 2.; }
        else if (uKind == 1) { p = vec3((s.x - .5) * .5, 0., (s.z - .5) * .5) * uSize * (1. - a) + vec3(uWind * age * .2 + sin(age * 9. + s.y * 6.) * .05, age * 2.1 * uSize, 0.);
          size = uSize * mix(.75, .15, a) * (.6 + .4 * s.y); vCol = fireCol(a * .7); vA = (1. - a) * smoothstep(0., .1, a); vSoft = 1.; }
        else if (uKind == 2) { vec3 v = vec3((s.x - .5) * 3., 2.5 + s.y * 3.5, (s.z - .5) * 3.) * uSize; p = v * age + vec3(0., -4.9 * age * age, 0.);
          size = .05 * uSize; vCol = vec3(1., .7, .3) * 7.; vA = 1. - a; vSoft = .5; }
        else { float ang = s.x * 6.2832, r = (.4 + age * 2.6) * uSize * (.6 + .4 * s.y); p = vec3(cos(ang) * r, s.z * .5 * age * uSize, sin(ang) * r);
          size = uSize * mix(.4, 2.2, a); vCol = vec3(.42, .36, .28); vA = sin(a * 3.1416) * .45; vSoft = 2.; }
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(size * 100. * uPx / max(1., -mv.z), 0., 512.); }`;
  const FX_FRAG = `${NOISE} varying vec3 vCol; varying float vA, vSoft;
    void main() { vec2 c = gl_PointCoord - .5; float d = length(c); if (d > .5) discard;
      float puff = vSoft > 1.5 ? (.7 + .3 * vn(gl_PointCoord * 4. + vA * 3.)) : 1.;
      float a = vA * smoothstep(.5, .5 - .35 * min(vSoft, 1.), d) * puff; gl_FragColor = vec4(vCol, a); }`;
  World.custom.fx = (P, t = 0) => {
    const kind = KIND[P.kind] != null ? P.kind : 'smoke', n = kind === 'explosion' ? 900 : Math.round(clamp(+P.amount || 60, 1, 100) * (kind === 'sparks' ? 6 : 4));
    const key = `${P.id}|${kind}|${n}`; let c = fxCache.get(key);
    if (!c) { const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: kind === 'fire' || kind === 'sparks' ? T.AdditiveBlending : T.NormalBlending,
        uniforms: { uTime: { value: 0 }, uLife: { value: LIFE[kind] }, uSize: { value: 1 }, uStart: { value: 0 }, uWind: { value: 0 }, uPx: { value: 800 }, uKind: { value: KIND[kind] } },
        vertexShader: FX_VERT, fragmentShader: FX_FRAG });
      const pts = new T.Points(fxPoints(n), m); pts.frustumCulled = false; pts.userData.fxMat = m;
      const g = new T.Group(); g.add(pts);
      if (kind === 'explosion' || kind === 'fire') { const l = new T.PointLight(0xff8a3a, 0, 0, 0); l.position.y = .8 * M; g.add(l); c = { g, m, l }; } else c = { g, m };
      fxCache.set(key, c); }
    const u = c.m.uniforms; u.uTime.value = t; u.uSize.value = clamp(+P.scale || 1, .05, 50) * (+P.size?.[0] || 1); u.uStart.value = +P.start || 0; u.uWind.value = (+P.wind || 0);
    c.g.children[0].scale.setScalar(M);
    if (c.l) { const age = t - (+P.start || 0); c.l.intensity = kind === 'explosion' ? (age > 0 && age < 2 ? 40 * Math.exp(-age * 2.5) : 0) : 6 + 2 * Math.sin(t * 17) * Math.sin(t * 7.3); c.l.distance = 0; }
    return c.g;
  };

  // ----- a neon sign: glowing tubes of words -----
  const neonTex = new Map(), neonParts = new Map(), buildings = new Map();
  function neonCanvas(text, color, font) {
    const key = `${text}|${color}|${font}`; if (neonTex.has(key)) return neonTex.get(key);
    const lines = String(text || 'OPEN').split('\n'), cv = document.createElement('canvas'), g = cv.getContext('2d'), px = 120;
    g.font = `700 ${px}px ${font || 'Pacifico, "Brush Script MT", cursive'}`;
    const w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width)) + px), h = Math.ceil(lines.length * px * 1.15 + px * .8);
    cv.width = w; cv.height = h; g.font = `700 ${px}px ${font || 'Pacifico, "Brush Script MT", cursive'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => { const y = px * .4 + (i + .5) * px * 1.15;
      g.lineJoin = 'round'; g.shadowColor = color; g.shadowBlur = 40; g.strokeStyle = color; g.lineWidth = 9; g.strokeText(l, w / 2, y);
      g.shadowBlur = 12; g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText(l, w / 2, y); });
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; const out = { t, aspect: w / h }; neonTex.set(key, out); return out;
  }
  World.custom.neon = (P, t = 0) => {
    const { t: tex, aspect } = neonCanvas(P.text, P.color || '#ff2fb0', P.font), hgt = +P.size?.[1] || .8, wid = hgt * aspect;
    const on = P.flicker ? (Math.sin(t * 31.7) * Math.sin(t * 11.3 + 1) > -.35 ? 1 : .15) : 1;
    const key = `${P.id}|${P.text}|${P.color}|${hgt}`; let c = neonParts.get(key);
    if (!c) { c = { m: new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide }), g: new T.PlaneGeometry(wid, hgt) }; neonParts.set(key, c); }
    c.m.color.setScalar(clamp(+P.glow || 3, .2, 20) * on);
    const mesh = new T.Mesh(c.g, c.m); mesh.scale.setScalar(M); mesh.castShadow = false;
    const g = new T.Group(); g.add(mesh);
    if (P.lightUp !== false) { const l = new T.PointLight(new T.Color(P.color || '#ff2fb0'), 12 * on * (+P.glow || 3) / 3, 0, 0); l.position.set(0, 0, .4 * M); l.distance = 6 * M; g.add(l); }
    return g;
  };

  // ----- a building: storeys of windows, some lit -----
  const facades = new Map();
  function facade(cols, rows, lit, seed, warm) {
    const key = [cols, rows, lit, seed, warm].join('|'); if (facades.has(key)) return facades.get(key);
    const cv = document.createElement('canvas'), w = 32, h = 48; cv.width = cols * w; cv.height = rows * h; const g = cv.getContext('2d');
    const em = document.createElement('canvas'); em.width = cv.width; em.height = cv.height; const e = em.getContext('2d');
    let s = seed; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    g.fillStyle = '#8a8580'; g.fillRect(0, 0, cv.width, cv.height); e.fillStyle = '#000'; e.fillRect(0, 0, em.width, em.height);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = r() < lit, tint = warm ? ['#ffd9a0', '#ffe6bf', '#fff1d6', '#b8d4ff'][Math.floor(r() * 4)] : ['#cfe3ff', '#e8f0ff', '#ffe6bf'][Math.floor(r() * 3)];
      g.fillStyle = on ? '#3a3226' : '#1c2128'; g.fillRect(x * w + 5, y * h + 8, w - 10, h - 16);
      if (on) { e.fillStyle = tint; e.globalAlpha = .55 + r() * .45; e.fillRect(x * w + 5, y * h + 8, w - 10, h - 16); e.globalAlpha = 1; }
    }
    const a = new T.CanvasTexture(cv), b = new T.CanvasTexture(em); a.colorSpace = b.colorSpace = T.SRGBColorSpace; a.anisotropy = b.anisotropy = 8;
    const out = { a, b }; facades.set(key, out); return out;
  }
  World.custom.building = P => {
    const [w, h, d] = (P.size || [12, 30, 12]).map(Number), cols = Math.max(1, Math.round(w / 2)), rows = Math.max(1, Math.round(h / 3.2));
    const key = [w, h, d, cols, rows, P.lit, P.seed, P.warm, P.glow, P.color].join('|'); let c = buildings.get(key);
    if (!c) { const f = facade(cols, rows, clamp((P.lit ?? 45) / 100, 0, 1), +P.seed || 1, P.warm !== false);
      const m = new T.MeshStandardMaterial({ map: f.a, emissive: 0xffffff, emissiveMap: f.b, emissiveIntensity: clamp(+P.glow || 1.1, 0, 20), roughness: .55, metalness: .1, color: new T.Color(P.color || '#ffffff') });
      const geo = new T.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0); c = { geo, mats: [m, m, World.finish('concrete', '#3a3a3c'), World.finish('concrete', '#3a3a3c'), m, m] }; buildings.set(key, c); }
    const mesh = new T.Mesh(c.geo, c.mats); mesh.scale.setScalar(M); mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  World.PARTS.push('fx', 'neon', 'building');
  SceneEd.add('fx', { type: 'fx', kind: 'smoke', amount: 60, scale: 1 }, 'Effect');
  SceneEd.add('neon', { type: 'neon', text: 'OPEN', color: '#ff2fb0', glow: 3, size: [1, .8, 1] }, 'Neon sign');
  SceneEd.add('building', { type: 'building', size: [12, 30, 12], lit: 45, seed: 1 }, 'Building');

  const opt = (k, v, list) => `<select data-k="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v ?? '') === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  SceneEd.extras.push({
    inspector(P) {
      if (P.type === 'fx') return `<div class="hd">Effect</div><label class="f"><span>Kind</span>${opt('kind', P.kind || 'smoke', KINDS)}</label>
        <label class="f"><span>Size</span><input type="number" step=".1" data-k="scale" value="${+P.scale || 1}"></label>
        ${P.kind === 'explosion' ? `<label class="f"><span>Goes off at s</span><input type="number" step=".05" data-k="start" value="${+P.start || 0}"></label><div class="acts"><button class="tb small" data-fx="now">Go off at the playhead</button></div>`
        : `<label class="f"><span>Amount</span><input type="number" step="5" min="1" max="100" data-k="amount" value="${+P.amount || 60}"></label>`}
        <label class="f"><span>Wind m/s</span><input type="number" step=".5" data-k="wind" value="${+P.wind || 0}"></label>`;
      if (P.type === 'neon') return `<div class="hd">Neon sign</div><label class="f wide"><span>Words</span><textarea data-k="text" rows="2">${esc(P.text || '')}</textarea></label>
        <label class="f"><span>Colour</span><input type="color" data-k="color" value="${P.color || '#ff2fb0'}"></label>
        <label class="f"><span>Glow</span><input type="number" step=".5" data-k="glow" value="${+P.glow || 3}"></label>
        <label class="f"><span>Flicker</span>${opt('flicker', P.flicker ? '1' : '', [['', 'Steady'], ['1', 'Flickers']])}</label>`;
      if (P.type === 'building') return `<div class="hd">Building</div><label class="f"><span>Lit %</span><input type="number" step="5" data-k="lit" value="${P.lit ?? 45}"></label>
        <label class="f"><span>Glow</span><input type="number" step=".1" data-k="glow" value="${+P.glow || 1.1}"></label>
        <label class="f"><span>Windows</span>${opt('warm', P.warm === false || P.warm === 'cool' ? 'cool' : '', [['', 'Warm'], ['cool', 'Cool']])}</label>
        <label class="f"><span>Mix</span><input type="number" step="1" data-k="seed" value="${+P.seed || 1}"></label>`;
      return '';
    },
    click(b) { if (b.dataset.fx !== 'now') return false; const P = SceneEd.selected; if (!P) return false; P.start = Math.round(SceneEd.api ? World.worldTime(SceneEd.layer, time) * 100 : 0) / 100; SceneEd.record(); return true; },
  });
  // the inspector gives text: what it means
  const wasB = World.custom.building; World.custom.building = (P, t) => wasB({ ...P, warm: !(P.warm === 'cool' || P.warm === false) }, t);
  const wasN = World.custom.neon; World.custom.neon = (P, t) => wasN({ ...P, flicker: P.flicker === '1' || P.flicker === true }, t);

  // ----- a scene to start from: a wet neon street at night -----
  World.PRESETS.neon = { label: 'Neon night', hint: 'A wet city street at night: rain, neon, traffic, people',
    p: { sky: 'night', sunEl: 18, sunAz: 160, sunPower: 60, clouds: 60, wind: 2, ground: 'floor', groundColor: '#1d1e22', floorFinish: '', fog: 22, dust: 0, rain: 45, wet: 80,
      eye: 1.2, heading: 0, pitch: 2, travel: 0, lens: 28, focus: 0, dof: 25, exposure: .1, bloom: 40, grain: 28, fringe: 22, ao: 30, streaks: 45, flare: 0, godrays: 0,
      letterbox: '2.39', shutter: 180, render: 'preview' },
    objects: d => {
      const out = [], colors = ['#ff2fb0', '#29e7ff', '#ffb02e', '#8a5bff', '#3dff8a'], words = ['MOTEL', 'OPEN 24H', 'NOODLES', 'BAR', 'ARCADE', 'TATTOO', 'LIQUOR', 'DINER'];
      for (let i = 0; i < 8; i++) for (const side of [-1, 1]) {
        const z = -6 - i * 14, w = 10 + (i * 7 + (side > 0 ? 3 : 0)) % 6, h = 14 + ((i * 13 + side * 5 + 20) % 40);
        out.push({ type: 'building', name: `Building ${out.length + 1}`, at: [side * (9 + w / 2), 0, z], size: [w, h, 12], lit: 35 + (i * 17) % 40, seed: i * 2 + (side > 0 ? 1 : 0), glow: 1.1 });
        if (i % 2 === (side > 0 ? 0 : 1)) out.push({ type: 'neon', text: words[(i + (side > 0 ? 3 : 0)) % words.length], color: colors[(i + (side > 0 ? 2 : 0)) % colors.length], glow: 4, flicker: i === 3 ? '1' : '',
          at: [side * 8.9, 4.2, z + 3], turn: [0, side > 0 ? -90 : 90, 0], size: [1, 1.1, 1] });
        if (i < 6) out.push({ type: 'light', light: 'spot', name: 'Street light', at: [side * 6.5, 6.5, z - 4], turn: [-90, 0, 0], angle: 38, soft: 60, power: 160, color: '#ffc77a', beam: 40, reach: 7, shadows: false });
      }
      out.push({ type: 'car', name: 'Car', color: '#0e0f12', finish: 'paint', face: 'travel', beams: '1',
        keys: { at: [{ t: 0, v: [1.8, 0, -90] }, { t: d * .6, v: [1.8, 0, -25] }, { t: d, v: [2.2, 0, 4] }] } });
      out.push({ type: 'car', name: 'Car going away', color: '#8a1414', finish: 'paint', face: 'travel', keys: { at: [{ t: 0, v: [-1.8, 0, -8] }, { t: d, v: [-1.8, 0, -70] }] } });
      out.push({ type: 'crowd', name: 'People on the left', count: 14, move: 'walk', at: [-7.2, 0, -30], size: [2.5, 1, 50], seed: 3 });
      out.push({ type: 'crowd', name: 'People on the right', count: 14, move: 'walk', at: [7.2, 0, -30], size: [2.5, 1, 50], seed: 11 });
      out.push({ type: 'fx', name: 'Steam', kind: 'steam', amount: 50, scale: 1.2, at: [-3.5, 0, -18] });
      out.push({ type: 'camera', name: 'Low on the road', lens: 24, shake: 25, at: [-.8, .5, 8], lookAt: null, turn: [4, -6, 0] });
      return out;
    } };
  return { KINDS };
})();
