// ---------- 3D worlds ----------
// A world layer is a whole place to film: a sky with a sun and clouds, the ground (an ocean that can throw up a
// breaking wave, a field of wheat, desert dunes or a studio floor), the air between (fog and dust in the light), and
// props built from parts with worn, brushed, coated or glassy finishes. Its sun lights everything and casts shadows,
// and it is filmed through a lens: depth of field, bloom, film grain and colour fringing, before the layer's own
// grade. 3D shapes and models above a world layer stand inside it, lit and shadowed by it.
// Units are canvas pixels, as for every 3D layer, and a metre is 100 of them: a world's numbers are in metres.
// Everything moves with time alone, so a frame looks the same however it is reached, in the preview or an export.
const World = (() => {
  const T = window.RiptideThree, M = 100;
  const R = () => R3D._;
  const LETTERBOXES = [['none', 'None'], ['2.39', '2.39 : 1 (scope)'], ['2', '2 : 1'], ['1.85', '1.85 : 1']];
  const RENDERS = [['preview', 'Preview: fast'], ['path', 'Path traced: real light']];
  const SKIES = [['sunset', 'Golden hour'], ['day', 'Clear day'], ['dusk', 'Dusk'], ['haze', 'Hazy'], ['overcast', 'Overcast'],
    ['night', 'Night'], ['studio', 'Studio']];
  const GROUNDS = [['ocean', 'Ocean'], ['field', 'Wheat field'], ['desert', 'Desert'], ['mountains', 'Mountain road'], ['floor', 'Studio floor'], ['none', 'None']];
  // sky palettes: the zenith, the horizon, the sun, clouds where the sun reaches them and where it does not
  const PALETTE = {
    sunset: { zen: '#8c5228', hor: '#ffae55', sun: '#ffc47a', lit: '#ffd497', shade: '#5c2f18', disk: 1, power: 1.4 },
    day: { zen: '#2d6fd8', hor: '#bdd7f0', sun: '#fff4e2', lit: '#ffffff', shade: '#8f9db0', disk: 1, power: 1.6 },
    dusk: { zen: '#1a2350', hor: '#e2788a', sun: '#ff9466', lit: '#ff9f8a', shade: '#3d2f55', disk: 1, power: .9 },
    haze: { zen: '#7f9a9e', hor: '#cfd2c2', sun: '#fff0d2', lit: '#f1ece0', shade: '#8d948e', disk: .5, power: 1.1 },
    overcast: { zen: '#8a8f96', hor: '#c6c9cc', sun: '#e9e9e9', lit: '#d9dadc', shade: '#8a8d92', disk: 0, power: .55 },
    night: { zen: '#03050d', hor: '#16203d', sun: '#a9bbff', lit: '#3a4466', shade: '#0b0f1c', disk: .6, power: .35 },
    studio: { zen: '#25272d', hor: '#5b5d66', sun: '#ffffff', lit: '#000000', shade: '#000000', disk: 0, power: 1.8 },
  };
  const FIELDS = ['sky', 'hdri', 'hdriTurn', 'hdriPower', 'sunEl', 'sunAz', 'sunPower', 'clouds', 'wind',
    'ground', 'groundColor', 'floorFinish', 'water', 'waves', 'chop', 'swell', 'curl', 'waveDist', 'waveAngle', 'plants', 'grass', 'grassH', 'sway', 'swayLoop',
    'peaks', 'snow', 'trees', 'road',
    'fog', 'haze', 'hazeFall', 'hazeGlow', 'dust', 'eye', 'heading', 'pitch', 'travel', 'lens', 'focus', 'dof', 'exposure', 'bloom', 'grain', 'fringe', 'ao', 'render', 'samples', 'pace', 'shutter', 'letterbox', 'godrays', 'flare', 'streaks', 'rain', 'wet', 'objects', 'shots'];
  const DEFAULTS = { hdri: '', hdriTurn: 0, hdriPower: 100, floorFinish: '', sky: 'sunset', sunEl: 8, sunAz: 10, sunPower: 100, clouds: 45, wind: 4, ground: 'ocean', groundColor: '#8a6a45',
    water: '#0b4a46', waves: .6, chop: 50, swell: 0, curl: .5, waveDist: 45, waveAngle: -20, plants: '#c09a48', grass: 60, grassH: .9, sway: 3, swayLoop: false,
    peaks: 900, snow: 62, trees: 70, road: 7,
    fog: 8, haze: 0, hazeFall: 250, hazeGlow: 60, dust: 0, eye: 1.7, heading: 0, pitch: 0, travel: 0, lens: 35, focus: 0, dof: 0, exposure: 0, bloom: 30, grain: 15, fringe: 10, ao: 0, render: 'preview', samples: 128, pace: 100, shutter: 0, letterbox: 'none', godrays: 0, flare: 0, streaks: 0, rain: 0, wet: 0 };
  const LABELS = { hdri: 'Sky photo', hdriTurn: 'Photo turn°', hdriPower: 'Photo light %', floorFinish: 'Ground finish', sky: 'Sky', sunEl: 'Sun height°', sunAz: 'Sun around°', sunPower: 'Sun %', clouds: 'Clouds %', wind: 'Wind m/s',
    ground: 'Ground', groundColor: 'Ground colour', water: 'Water', waves: 'Waves m', chop: 'Chop %', swell: 'Breaker m', curl: 'Curl',
    waveDist: 'Breaker at m', waveAngle: 'Breaker turn°', plants: 'Plants', grass: 'Plants %', grassH: 'Plant height m', sway: 'Sway m/s', swayLoop: 'Loop sway',
    peaks: 'Peaks m', snow: 'Snow line %', trees: 'Pines %', road: 'Road width m',
    fog: 'Fog', haze: 'Height fog', hazeFall: 'Fog thins over m', hazeGlow: 'Sun in fog %', dust: 'Dust', eye: 'Eye height m', heading: 'Look around°', pitch: 'Look up°', travel: 'Travel m', lens: 'Lens mm',
    focus: 'Focus m', dof: 'Depth of field', exposure: 'Exposure', bloom: 'Bloom', grain: 'Grain', fringe: 'Fringe', ao: 'Contact shade', render: 'Render', samples: 'Samples', pace: 'World speed %', shutter: 'Motion blur°', letterbox: 'Letterbox', godrays: 'Light shafts', flare: 'Lens flare', streaks: 'Light streaks', rain: 'Rain', wet: 'Wet ground' };
  const COLORS = ['groundColor', 'water', 'plants'];
  const NUMBERS = FIELDS.filter(k => !['sky', 'ground', 'objects', 'shots', 'swayLoop', 'hdri', 'floorFinish', 'render', 'letterbox', ...COLORS].includes(k));
  const GROUPS = [['World', ['hdri', 'hdriTurn', 'hdriPower', 'sky', 'sunEl', 'sunAz', 'sunPower', 'clouds', 'wind', 'fog', 'haze', 'hazeFall', 'hazeGlow', 'dust', 'rain', 'wet']],
    ['Ground', ['ground', 'groundColor', 'floorFinish', 'water', 'waves', 'chop', 'swell', 'curl', 'waveDist', 'waveAngle', 'plants', 'grass', 'grassH', 'sway', 'swayLoop', 'peaks', 'snow', 'trees', 'road']],
    ['Lens', ['render', 'samples', 'pace', 'shutter', 'letterbox', 'godrays', 'flare', 'streaks', 'eye', 'heading', 'pitch', 'travel', 'lens', 'focus', 'dof', 'exposure', 'bloom', 'grain', 'fringe', 'ao']]];
  const STEP = { waves: .05, curl: .01, grassH: .05, eye: .05, exposure: .05 };
  const deg = v => (+v || 0) * Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lin = hex => new T.Color(typeof hex === 'string' && hex[0] === '#' ? hex : '#808080');
  // which settings a world's ground and sky use: the rest are not shown for it
  function shows(k, o, keyed) {
    if (['water', 'waves', 'chop', 'swell'].includes(k)) return o.ground === 'ocean';
    if (['curl', 'waveDist', 'waveAngle'].includes(k)) return o.ground === 'ocean' && (o.swell > 0 || keyed);
    if (['plants', 'grass', 'grassH', 'sway', 'swayLoop'].includes(k)) return o.ground === 'field';
    if (['peaks', 'snow', 'trees', 'road'].includes(k)) return o.ground === 'mountains';
    if (k === 'groundColor') return o.ground !== 'ocean' && o.ground !== 'none';
    if (k === 'clouds') return o.sky !== 'studio' && !o.hdri;
    if (k === 'hdriTurn' || k === 'hdriPower') return !!o.hdri;
    if (k === 'floorFinish') return o.ground === 'floor' || o.ground === 'desert' || o.ground === 'field';
    if (k === 'focus') return o.dof > 0 || keyed;
    if (k === 'hazeFall' || k === 'hazeGlow') return o.haze > 0 || keyed;
    if (k === 'samples') return o.render === 'path';
    return true;
  }

  // ----- a seeded random, so a world is the same every time it is drawn -----
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  // ----- GLSL shared by the sky, the water and the ground -----
  const NOISE = `
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
    float fbm(vec2 p) { float a = .5, s = 0.; mat2 r = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = r * p; a *= .5; } return s; }
    float fbm3(vec2 p) { float a = .5, s = 0.; mat2 r = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = r * p; a *= .5; } return s; }`;
  const SKY = `
    uniform vec3 uSunDir, uZen, uHor, uSun, uLit, uShade;
    uniform float uClouds, uTime, uWind, uStars, uDisk, uFog;
    vec3 skyBase(vec3 d) {
      float y = max(d.y, 0.), mu = max(dot(d, uSunDir), 0.);
      vec3 c = mix(uHor, uZen, pow(y, .5));
      c += uSun * (pow(mu, 8.) * .22 + pow(mu, 64.) * .45) * (.35 + .65 * uDisk);
      if (d.y < 0.) c = mix(uHor, uHor * .55, clamp(-d.y * 5., 0., 1.));
      return c;
    }
    vec3 skyColor(vec3 d) {
      vec3 c = skyBase(d);
      float mu = dot(d, uSunDir);
      c += uSun * smoothstep(.99982, .99994, mu) * 40. * uDisk;
      if (uClouds > .001 && d.y > .002) {
        vec2 uv = d.xz / (d.y + .12) * .7 + vec2(uTime * uWind, uTime * uWind * .4) * .0035;
        float n = fbm(uv) * .8 + fbm(uv * 2.3 + 4.1) * .25, cov = 1. - uClouds * .95;
        float dens = smoothstep(cov - .02, cov + .12, n);
        // lit from the sun's side: thinner towards it is brighter, the thick bellies dark
        float n2 = fbm(uv + normalize(uSunDir.xz + 1e-4) * .09) * .8 + fbm((uv + normalize(uSunDir.xz + 1e-4) * .09) * 2.3 + 4.1) * .25;
        float light = clamp((n - n2) * 5. + .45 - (n - cov) * .9, 0., 1.);
        vec3 cc = mix(uShade, uLit * 1.25, light);
        cc += uSun * pow(max(mu, 0.), 4.) * (1. - dens * .7) * 1.2;
        c = mix(c, cc, dens * smoothstep(.0, .16, d.y));
      }
      // stars: cells on the sky's sphere itself (not a plane projected to the horizon, which stretched them into
      // dashes), each a soft round point around a jittered centre, so they stay round at any aspect and camera move
      if (uStars > 0. && d.y > 0.) { vec3 q = normalize(d) * 160., g = floor(q), f = q - g;
        vec2 k = g.xy + g.z * vec2(37.1, 17.3); float on = step(.94, h21(k));
        vec3 ctr = .3 + .4 * vec3(h21(k + 3.), h21(k + 5.), h21(k + 9.));
        float r = length(f - ctr), s = on * smoothstep(.16, .02, r) * (.35 + .65 * h21(k + 7.));
        c += vec3(s) * uStars * smoothstep(0., .3, d.y); }
      return c;
    }
    // the colour of the air at the horizon in direction d: what fog fades to
    vec3 hazeColor(vec3 d) { return skyBase(normalize(vec3(d.x, .03, d.z))); }
    vec3 fogged(vec3 col, vec3 at) {
      vec3 v = at - cameraPosition; float dist = length(v) / 100.;
      float f = 1. - exp(-dist * uFog);
      return mix(col, hazeColor(normalize(v)), f);
    }`;

  function skyUniforms() {
    return { uSunDir: { value: new T.Vector3(0, .2, -1).normalize() }, uZen: { value: new T.Color() }, uHor: { value: new T.Color() },
      uSun: { value: new T.Color() }, uLit: { value: new T.Color() }, uShade: { value: new T.Color() }, uClouds: { value: .4 },
      uTime: { value: 0 }, uWind: { value: 4 }, uStars: { value: 0 }, uDisk: { value: 1 }, uFog: { value: 0 } };
  }

  // ----- the sky dome -----
  function skyMesh(uniforms) {
    const mat = new T.ShaderMaterial({ uniforms, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `${NOISE}${SKY} varying vec3 vP; void main() { vec3 d = normalize(vP - cameraPosition); gl_FragColor = vec4(skyColor(d), 1.); }` });
    const m = new T.Mesh(new T.SphereGeometry(1, 64, 32), mat); m.frustumCulled = false; m.renderOrder = -10; m.scale.setScalar(5e5);
    return m;
  }

  // ----- the ocean: waves summed (Gerstner), near the camera finely, out to the horizon coarsely -----
  const WAVES = `
    uniform float uWaves, uChop, uGround;
    const int NW = 7;
    vec3 wave(int i) { // direction (x, z) and wavelength in metres
      if (i == 0) return vec3(.8, .6, 48.); if (i == 1) return vec3(.95, -.31, 27.); if (i == 2) return vec3(.6, .8, 15.);
      if (i == 3) return vec3(.99, .1, 8.3); if (i == 4) return vec3(.4, -.92, 4.6); if (i == 5) return vec3(.86, .5, 2.4); return vec3(.2, .98, 1.3); }
    // height and its slope at p (metres); far away the small waves are left out, which would only shimmer
    vec3 sea(vec2 p, float t, float far, out vec2 shift) {
      float h = 0.; vec2 g = vec2(0.); shift = vec2(0.);
      for (int i = 0; i < NW; i++) {
        vec3 w = wave(i); float k = 6.2832 / w.z, c = sqrt(9.8 / k);
        float a = (i < 3 ? uWaves * (1. - float(i) * .22) : uWaves * .22 * uChop / float(i - 1)) * smoothstep(w.z * 40., w.z * 8., far);
        float ph = k * dot(w.xy, p) - c * k * t + float(i) * 1.7;
        h += a * sin(ph); g += a * k * w.xy * cos(ph); shift -= w.xy * a * .6 * cos(ph);
      }
      return vec3(h, g);
    }`;
  const WATER_FRAG = `
    uniform vec3 uWater; uniform float uLight;
    varying vec3 vW; varying float vH, vThin, vFoam, vCurl; varying vec3 vN;
    void main() {
      vec2 p = vW.xz / 100.; vec3 V = normalize(cameraPosition - vW); float dist = length(cameraPosition - vW) / 100.;
      vec2 sh; vec3 s = sea(p, uTime, dist, sh);
      vec3 N = normalize(vec3(-s.y, 1., -s.z));
      #ifdef BREAKER
        N = normalize(vN);
      #endif
      // ripples: two drifting layers of small bumps, fading out with distance
      float fd = exp(-dist / 60.);
      vec2 q = p * 3.1 + uTime * vec2(.3, .2), q2 = p * 7.3 - uTime * vec2(.2, .35);
      float e = .02;
      vec2 rg = vec2(fbm3(q + vec2(e, 0)) - fbm3(q - vec2(e, 0)), fbm3(q + vec2(0, e)) - fbm3(q - vec2(0, e))) / (2. * e)
              + .5 * vec2(fbm3(q2 + vec2(e, 0)) - fbm3(q2 - vec2(e, 0)), fbm3(q2 + vec2(0, e)) - fbm3(q2 - vec2(0, e))) / (2. * e);
      #ifdef BREAKER
        // on a standing face the ripples run across it
        vec3 t1 = normalize(cross(N, vec3(0., 1., 0.)) + vec3(1e-4)), t2 = normalize(cross(t1, N));
        vec2 qb = vec2(dot(vW, t1), dot(vW, t2)) / 100. * vec2(2.2, 3.4) + uTime * vec2(.1, .5);
        vec2 rb = vec2(fbm3(qb + vec2(e, 0)) - fbm3(qb - vec2(e, 0)), fbm3(qb + vec2(0, e)) - fbm3(qb - vec2(0, e))) / (2. * e);
        N = normalize(N + (t1 * rb.x + t2 * rb.y) * .22);
      #else
        N = normalize(N + vec3(-rg.x, 0., -rg.y) * .2 * (.4 + uChop) * (.25 + .75 * fd));
      #endif
      float ndv = max(dot(N, V), 0.);
      float F = .02 + .98 * pow(1. - ndv, 5.);
      vec3 Rf = reflect(-V, N); Rf.y = abs(Rf.y);
      vec3 refl = skyColor(Rf) * .8;
      #ifdef BREAKER
        refl = mix(skyBase(Rf), refl, .35) * .6;
      #endif
      // the water itself: deep, lighter where a wave stands up, lit through where the sun shines into it
      vec3 deep = uWater * uLight * .55, light = (uWater * 1.9 + vec3(.01, .06, .05)) * uLight;
      float up = clamp(vH * .35 + .35, 0., 1.);
      #ifdef BREAKER
        up = .45 + vThin * .55;
      #endif
      float through = pow(max(dot(-V, uSunDir), 0.), 3.) * (.3 + up);
      vec3 body = mix(deep, light, up * .6) + uSun * light * through * .9;
      #ifdef BREAKER
        body = mix(deep, light, .2 + vThin * .5) + uSun * light * through * vThin * .9 + uHor * uLight * .05;
      #endif
      #ifdef BREAKER
        // the thin lip of a breaking wave glows with the sun behind it
        float back = pow(max(dot(-V, uSunDir) * .5 + .5, 0.), 2.);
        float lump = .55 + .45 * fbm3(vec2(vW.x / 100. * .12, vFoam * 1.7 + vW.z / 100. * .05));
        body += (uWater * 3. + vec3(.05, .3, .24)) * uLight * smoothstep(.2, .9, vThin) * lump * (.15 + 1.7 * back);
        F *= 1. - vThin * .6;
      #endif
      vec3 col = mix(body, refl, F);
      // the sun on the water: its reflection, and glints that come and go
      float spec = pow(max(dot(Rf, uSunDir), 0.), 700.);
      vec2 cell = floor(vW.xz / 100. * 22.);
      vec2 fp = fract(vW.xz / 100. * 22.) - .5;
      float glint = step(.97, h21(cell + floor(uTime * 6.))) * smoothstep(.1, 0., length(fp)) * pow(max(dot(Rf, uSunDir), 0.), 20.) * fd;
      col += uSun * (spec * 40. + glint * 6.) * uDisk;
      // foam on the crests, and on a breaking wave's face
      float foam = smoothstep(uWaves * .9, uWaves * 1.6 + .1, vH) * smoothstep(.45, .7, fbm(p * 1.4 + sh));
      #ifdef BREAKER
        foam = 0.;
        // streaks of foam pulled down the face, and whitewater where the lip lands
        float streak = fbm(vec2(vFoam * 2.4 + vW.x / 100. * .02, vW.x / 100. * .35) * vec2(5., 1.));
        foam = max(foam, smoothstep(.5, .68, streak) * smoothstep(.5, .62, vFoam) * smoothstep(.95, .8, vFoam) * smoothstep(.15, .6, vCurl));
        foam = max(foam, smoothstep(.55, .7, fbm(vW.xz / 100. * .6)) * smoothstep(.78, .86, vFoam) * smoothstep(.95, .88, vFoam) * smoothstep(.6, .9, vCurl));
        foam = max(foam, smoothstep(.85, 1., vThin) * .9 * smoothstep(.2, .6, vCurl));
      #endif
      col = mix(col, (uSun * .7 + uHor * .6) * uLight * 1.2, clamp(foam, 0., 1.));
      gl_FragColor = vec4(fogged(col, vW), 1.);
    }`;
  function oceanMesh(uniforms) {
    // rings around the camera, closer together near it
    const rings = 150, segs = 256, pos = [], idx = [];
    for (let i = 0; i <= rings; i++) { const r = .5 * (Math.pow(1.06, i) - 1) / .06;          // metres: half a metre apart near it, wider out
      for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * r * M, 0, Math.sin(a) * r * M); } }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + (j + 1) % segs, c = a + segs, d = b + segs; idx.push(a, b, c, b, d, c); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const mat = new T.ShaderMaterial({ uniforms, fog: false,
      vertexShader: `${WAVES} uniform float uTime; varying vec3 vW; varying float vH, vThin, vFoam, vCurl; varying vec3 vN;
        void main() { vec3 w = vec3(position.x + cameraPosition.x, uGround, position.z + cameraPosition.z);
          float far = length(position.xz) / 100.; vec2 sh; vec3 s = sea(w.xz / 100., uTime, far, sh);
          w.y += s.x * 100.; w.xz += sh * 100. * smoothstep(400., 100., far); vH = s.x; vW = w; vN = vec3(0, 1, 0); vThin = 0.; vFoam = 0.; vCurl = 0.;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.); }`,
      fragmentShader: `${NOISE}${SKY}${WAVES}${WATER_FRAG}` });
    const m = new T.Mesh(g, mat); m.frustumCulled = false; m.receiveShadow = false; return m;
  }

  // ----- a breaking wave: a wall of water along its crest, its lip thrown forward as it curls -----
  // Its shape across (forward and up, in units of its height): the back, the crest, the face, and the lip from the crest.
  const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t;
    return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  function bodyProfile(c, n) {
    const P = [[-3.4, -.12], [-1.7, .35], [-.7, .8], [-.12, 1 + .04 * c], [.1 - .06 * c, .93], [.24 - .14 * c, .68], [.5 - .18 * c, .34], [1.0, .04], [1.6, -.16]];
    const out = [];
    for (let i = 0; i < n; i++) { const f = i / (n - 1) * (P.length - 1), s = Math.min(P.length - 2, Math.floor(f)), t = f - s;
      const a = P[Math.max(0, s - 1)], b = P[s], d = P[s + 1], e = P[Math.min(P.length - 1, s + 2)];
      out.push([cr(a[0], b[0], d[0], e[0], t), cr(a[1], b[1], d[1], e[1], t), i / (n - 1)]); }
    return out;
  }
  function lipProfile(c, n) {
    const len = .12 + 1.35 * c, th = .15 + 1.95 * c, Rr = len / Math.max(.05, th), u0 = -.12, v0 = 1 + .04 * c, out = [];
    for (let i = 0; i < n; i++) { const f = i / (n - 1), ph = -.15 + f * th;
      out.push([u0 + Rr * (Math.sin(ph) + Math.sin(.15)), v0 - Rr * (1 - Math.cos(ph)) + Rr * (1 - Math.cos(.15)), f]); }
    return out;
  }
  function breakerGeometry(H, curl) {
    const NX = 150, NB = 44, NL = 22, span = 150, pos = [], thin = [], foam = [], cl = [], idx = [];
    const lumpy = xn => 1 + .16 * Math.sin(xn * 13.1 + 1.3) + .08 * Math.sin(xn * 31.7 + .4);
    const heightAt = xn => H * lumpy(xn) * (.18 + .82 * Math.pow(T.MathUtils.smoothstep(xn, 0, .85), 1.4)) * T.MathUtils.smoothstep(xn, 0, .06) * (1 - T.MathUtils.smoothstep(xn, .96, 1));
    const curlAt = xn => clamp(curl * 1.25 + (xn - .72) * .9 + .1 * Math.sin(xn * 9.3), 0, 1);
    const sheet = (rows, prof, isLip) => {
      const base = pos.length / 3;
      for (let i = 0; i <= NX; i++) {
        const xn = i / NX, x = (xn - .72) * span, h = Math.max(.05, heightAt(xn)), c = curlAt(xn), pr = prof(c, rows);
        for (const [u, v, f] of pr) {
          pos.push(x * M, v * h * M, u * h * M);
          thin.push(isLip ? .55 + .45 * f : clamp((v - .78) * 1.4, 0, .3) * (u > -.3 ? 1 : .4));
          foam.push(isLip ? 1 : f); cl.push(c);
        }
      }
      for (let i = 0; i < NX; i++) for (let j = 0; j < rows - 1; j++) {
        const a = base + i * rows + j, b = a + rows; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    };
    sheet(NB, bodyProfile, false); sheet(NL, lipProfile, true);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aThin', new T.Float32BufferAttribute(thin, 1));
    g.setAttribute('aFoam', new T.Float32BufferAttribute(foam, 1)); g.setAttribute('aCurl', new T.Float32BufferAttribute(cl, 1));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function breakerMesh(uniforms) {
    const mat = new T.ShaderMaterial({ uniforms, side: T.DoubleSide, fog: false, defines: { BREAKER: 1 },
      vertexShader: `uniform float uTime; attribute float aThin, aFoam, aCurl; varying vec3 vW; varying float vH, vThin, vFoam, vCurl; varying vec3 vN;
        void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vH = position.y / 100.; vThin = aThin; vFoam = aFoam; vCurl = aCurl;
          vN = normalize(mat3(modelMatrix) * normal); if (dot(vN, cameraPosition - w.xyz) < 0.) vN = -vN;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `${NOISE}${SKY}${WAVES}${WATER_FRAG}` });
    const m = new T.Mesh(new T.BufferGeometry(), mat); m.frustumCulled = false; return m;
  }

  // ----- textures for the ground and the finishes, painted once -----
  const TEX = {};
  function canvasTex(key, size, paint, repeat = 1, color = false) {
    if (TEX[key]) return TEX[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'); paint(g, size, rng(key.length * 7919 + size));
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
    if (color) t.colorSpace = T.SRGBColorSpace;
    return TEX[key] = t;
  }
  const blotches = (g, n, rand, s, r0, r1, a0, a1, light) => { for (let i = 0; i < n; i++) { const x = rand() * s, y = rand() * s, r = r0 + rand() * (r1 - r0);
    const gr = g.createRadialGradient(x, y, 0, x, y, r), a = a0 + rand() * (a1 - a0), c = light ? 255 : 0;
    gr.addColorStop(0, `rgba(${c},${c},${c},${a})`); gr.addColorStop(1, `rgba(${c},${c},${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } };
  const speckle = (g, s, rand, n, a) => { for (let i = 0; i < n; i++) { const v = rand() > .5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${a * rand()})`; g.fillRect(rand() * s, rand() * s, 1 + rand() * 1.5, 1 + rand() * 1.5); } };
  const PAINT = {
    // powder coat that has been handled: fine grain, rubbed patches
    worn: (g, s, r) => { g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, s, s); blotches(g, 60, r, s, 10, 70, .05, .22, true); blotches(g, 50, r, s, 6, 40, .05, .2, false); speckle(g, s, r, s * s / 6, .5); },
    // pebbled leatherette
    pebble: (g, s, r) => { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); for (let i = 0; i < s * s / 30; i++) { const x = r() * s, y = r() * s, rr = 1.5 + r() * 3;
      const gr = g.createRadialGradient(x - rr * .3, y - rr * .3, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); } },
    brushed: (g, s, r) => { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, s, s); for (let i = 0; i < s * 3; i++) { const v = 90 + r() * 90; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(0, r() * s, s, .6 + r()); } },
    concrete: (g, s, r) => { g.fillStyle = '#909090'; g.fillRect(0, 0, s, s); blotches(g, 120, r, s, 8, 60, .05, .18, true); blotches(g, 120, r, s, 8, 60, .05, .2, false); speckle(g, s, r, s * s / 3, .45); },
    wood: (g, s, r) => { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y++) { const v = 128 + Math.sin(y * .21 + Math.sin(y * .031) * 6) * 40 + (r() - .5) * 30;
      g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, s, 1); } },
    soil: (g, s, r) => { g.fillStyle = '#9a7650'; g.fillRect(0, 0, s, s); blotches(g, 160, r, s, 10, 80, .05, .2, true); blotches(g, 200, r, s, 6, 60, .05, .25, false); speckle(g, s, r, s * s / 2, .4); },
    sand: (g, s, r) => { g.fillStyle = '#c99a62'; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 3) { g.strokeStyle = `rgba(80,50,20,${.08 + r() * .08})`; g.beginPath();
      for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x * .05 + y * .2) * 2); g.stroke(); } speckle(g, s, r, s * s / 3, .3); },
    floor: (g, s, r) => { g.fillStyle = '#7d7d7d'; g.fillRect(0, 0, s, s); blotches(g, 80, r, s, 20, 120, .02, .08, true); blotches(g, 80, r, s, 20, 120, .02, .08, false); speckle(g, s, r, s * s / 8, .15); },
  };
  const tex = (kind, repeat = 1, color = false) => canvasTex(kind + (color ? ':c' : ''), kind === 'brushed' || kind === 'wood' ? 512 : 512, PAINT[kind], repeat, color);

  // ----- finishes for props -----
  const FINISHES = {
    'worn-metal': { color: '#4a4a4c', metalness: .5, roughness: .66, map: 'worn', bump: 'worn', bumpScale: 1.6, tint: 'worn' },
    leatherette: { color: '#2c2c2e', metalness: 0, roughness: .72, map: 'pebble', bump: 'pebble', bumpScale: 2.5, tint: 'pebble' },
    aluminium: { color: '#b8bbc0', metalness: 1, roughness: .32, map: 'brushed', bump: 'brushed', bumpScale: .3 },
    chrome: { color: '#f2f2f2', metalness: 1, roughness: .06 },
    steel: { color: '#6c6e72', metalness: 1, roughness: .45, map: 'worn', bump: 'worn', bumpScale: .25 },
    rubber: { color: '#121212', metalness: 0, roughness: .92, bump: 'concrete', bumpScale: .3 },
    plastic: { color: '#d8d8d8', metalness: 0, roughness: .42, clearcoat: .25 },
    paint: { color: '#c0392b', metalness: 0, roughness: .35, clearcoat: 1, clearcoatRoughness: .12 },
    glass: { color: '#ffffff', metalness: 0, roughness: 0, transmission: 1, thickness: 20, ior: 1.5 },
    lens: { color: '#06060a', metalness: .3, roughness: .04, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600] },
    wood: { color: '#93653d', metalness: 0, roughness: .65, map: 'wood', bump: 'wood', bumpScale: .4, tint: 'wood' },
    concrete: { color: '#a3a29c', metalness: 0, roughness: .92, map: 'concrete', bump: 'concrete', bumpScale: .8, tint: 'concrete' },
    rust: { color: '#8a4e2e', metalness: .3, roughness: .85, map: 'worn', bump: 'worn', bumpScale: 1, tint: 'worn' },
    gold: { color: '#f2c36b', metalness: 1, roughness: .22 },
    glow: { color: '#ff3b30', emissive: 3 },
  };
  const matCache = new Map();
  function finish(name, color, emissive, P) {
    if (typeof name === 'string' && name.startsWith('lib:') && World.finishHook) return World.finishHook(name.slice(4), color, P, emissive);
    const key = `${name}|${color || ''}|${emissive ?? ''}`; if (matCache.has(key)) return matCache.get(key);
    const F = FINISHES[name] || FINISHES.plastic, c = lin(color || F.color);
    const m = new T.MeshPhysicalMaterial({ color: c, metalness: F.metalness ?? 0, roughness: F.roughness ?? .5, clearcoat: F.clearcoat || 0,
      clearcoatRoughness: F.clearcoatRoughness ?? .1, transmission: F.transmission || 0, thickness: F.thickness || 0, ior: F.ior || 1.5,
      iridescence: F.iridescence || 0, iridescenceIOR: F.iridescenceIOR || 1.3, envMapIntensity: 1 });
    if (F.iridescenceThicknessRange) m.iridescenceThicknessRange = F.iridescenceThicknessRange;
    if (F.map) m.roughnessMap = tex(F.map, 2);
    if (F.tint) m.map = tex(F.tint, 2, true);
    if (F.bump) { m.bumpMap = tex(F.bump, 2); m.bumpScale = F.bumpScale || .5; }
    if (F.emissive || emissive) { m.emissive = c; m.emissiveIntensity = emissive ?? F.emissive; }
    matCache.set(key, m); return m;
  }

  // ----- props: built from parts, in metres -----
  // {type, at: [x, y, z], turn: [x, y, z]°, size: [w, h, d], finish, color, children: [...]}, y up and z towards the
  // camera, from the spot on the ground the camera looks at
  const PARTS = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'capsule', 'truss', 'label', 'light', 'group'];
  const geomCache = new Map();
  const cyl = (r0, r1, h, n = 48) => new T.CylinderGeometry(r0, r1, h, n, 1);
  function truss(w, h, d, bays, rod, taper) {
    const parts = [], leg = (a, b) => { const v = new T.Vector3().subVectors(b, a), g = cyl(rod, rod, v.length(), 8);
      g.translate(0, v.length() / 2, 0); g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize())); g.translate(a.x, a.y, a.z); parts.push(g); };
    const at = (sx, sz, f) => { const k = 1 - taper * f; return new T.Vector3(sx * w / 2 * k, f * h, sz * d / 2 * k); };
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) leg(at(sx, sz, 0), at(sx, sz, 1));
    for (let i = 0; i <= bays; i++) { const f = i / bays;
      for (let c = 0; c < 4; c++) { const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4]; leg(at(ax, az, f), at(bx, bz, f));
        if (i < bays) leg(at(ax, az, f), at(bx, bz, (i + 1) / bays)); } }
    const g = T.BufferGeometryUtils.mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); parts.forEach(p => p.dispose());
    g.translate(0, -h / 2, 0); return g;
  }
  function labelTexture(text, color, bg) {
    const key = `label|${text}|${color}|${bg}`; if (TEX[key]) return TEX[key];
    const lines = String(text || '').split('\n'), cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const g = cv.getContext('2d'); g.fillStyle = bg || '#050505'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = color || '#f2f2f2'; g.font = `600 ${Math.floor(200 / Math.max(2, lines.length))}px ui-monospace, Menlo, monospace`; g.textBaseline = 'top';
    lines.forEach((l, i) => g.fillText(l, 24, 20 + i * 220 / Math.max(2, lines.length)));
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return TEX[key] = t;
  }
  function partGeometry(P) {
    const s = (P.size || [1, 1, 1]).map(v => Math.max(.001, +v || 1)), key = JSON.stringify([P.type, s, P.round, P.bays, P.rod, P.taper, P.r2, P.sides]);
    if (geomCache.has(key)) return geomCache.get(key);
    let g;
    const [w, h, d] = s;
    if (P.type === 'box') { const r = Math.min(+P.round || 0, w / 2, h / 2, d / 2); g = r > .0005 ? new T.RoundedBoxGeometry(w, h, d, 4, r) : new T.BoxGeometry(w, h, d); }
    else if (P.type === 'cylinder') g = cyl(w / 2, (P.r2 != null ? +P.r2 : w / 2), h, P.sides || 64);
    else if (P.type === 'cone') g = cyl(0, w / 2, h, P.sides || 64);
    else if (P.type === 'sphere') { g = new T.SphereGeometry(.5, 48, 24); g.scale(w, h, d); }
    else if (P.type === 'torus') g = new T.TorusGeometry(w / 2, Math.max(.001, d / 2), 24, 96);
    else if (P.type === 'capsule') g = new T.CapsuleGeometry(w / 2, Math.max(0, h - w), 8, 24);
    else if (P.type === 'truss') g = truss(w, h, d, Math.max(1, Math.round(P.bays || 8)), +P.rod || .02, +P.taper || 0);
    else if (P.type === 'label') g = new T.PlaneGeometry(w, h);
    else g = new T.BufferGeometry();
    geomCache.set(key, g); return g;
  }
  const labelMats = new Map();
  // A prop's transform at T: its keyframes where it has them ({at: [{t, v, ease}], turn: …, scale: …}), else its value.
  // A place keyed three times or more moves along a smooth curve through its keys (unless its path is 'straight').
  function keyed(P, prop, t, base) {
    const ks = P.keys?.[prop]; if (!Array.isArray(ks) || !ks.length) return base;
    const mix = (a, b, f) => Array.isArray(a) ? a.map((x, i) => (+x || 0) + ((+b?.[i] || 0) - (+x || 0)) * f) : (+a || 0) + ((+b || 0) - (+a || 0)) * f;
    if (t <= ks[0].t) return ks[0].v;
    const smooth = prop === 'at' && ks.length >= 3 && P.path !== 'straight';
    for (let i = 0; i < ks.length - 1; i++) { const a = ks[i], b = ks[i + 1];
      if (t > b.t) continue;
      const u = (typeof easeFn === 'function' ? easeFn(a) : x => x)((t - a.t) / (b.t - a.t || 1));
      if (!smooth) return mix(a.v, b.v, u);
      const p0 = (ks[i - 1] || a).v, p3 = (ks[i + 2] || b).v;
      return a.v.map((_, j) => cr(+p0[j] || 0, +a.v[j] || 0, +b.v[j] || 0, +p3[j] || 0, u));
    }
    return ks[ks.length - 1].v;
  }
  // Where a prop is at T. One on a road (a mountain road world's: see terrain.js) is placed by how far along it is,
  // `road` in metres (keyed to drive it), `lane` metres to the right of the middle and `lift` above it; any other by
  // its place, `at`.
  function placeOf(P, t) {
    if (P.road != null && World.roadAt) { const r = World.roadAt(+keyed(P, 'road', t, +P.road || 0) || 0, +P.lane || 0);
      return [r[0], r[1] + (+P.lift || 0), r[2]]; }
    return keyed(P, 'at', t, P.at || [0, 0, 0]);
  }
  // which way a prop is going at T: for 'face the way it travels'
  function heading(P, t) {
    if (P.road != null && World.roadAt) {
      const s0 = +keyed(P, 'road', t - .05, +P.road || 0) || 0, s1 = +keyed(P, 'road', t + .05, +P.road || 0) || 0;
      const y = World.roadAt(s0, +P.lane || 0).yaw; return s1 < s0 ? y + Math.PI : y;
    }
    const a = keyed(P, 'at', t - .05, P.at || [0, 0, 0]), b = keyed(P, 'at', t + .05, P.at || [0, 0, 0]);
    const dx = (+b[0] || 0) - (+a[0] || 0), dz = (+b[2] || 0) - (+a[2] || 0);
    return Math.hypot(dx, dz) < 1e-5 ? null : Math.atan2(dx, dz);
  }
  const scale3 = v => Array.isArray(v) ? [0, 1, 2].map(i => +v[i] || 1) : [+v || 1, +v || 1, +v || 1];
  // the lights a prop can be; what they are drawn with is kept, as props are built again each frame they move
  const lightBits = new Map(), bulbGeo = new T.SphereGeometry(.03, 16, 8);
  function lightOf(P) {
    const c = lin(P.color || '#ffffff'), power = Math.max(0, +P.power || 100);
    let l;
    if (P.light === 'spot') { l = new T.SpotLight(c, power * 40, 0, deg(clamp(+P.angle || 35, 1, 89)), clamp((+P.soft ?? 40) / 100, 0, 1), 2);
      l.target.position.set(0, 0, 1); l.add(l.target); }
    else l = new T.PointLight(c, power * 40, 0, 2);
    l.castShadow = P.shadows !== false; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -.0005; l.shadow.radius = 3;
    const bk = c.getHexString(); if (!lightBits.has(bk)) lightBits.set(bk, new T.MeshBasicMaterial({ color: c }));
    const bulb = new T.Mesh(bulbGeo, lightBits.get(bk)); bulb.scale.setScalar(M); bulb.userData.bulb = true; l.add(bulb);
    // a beam: the light seen in the air, a soft cone fading away from the lamp
    if (P.light === 'spot' && +P.beam > 0) {
      const len = clamp(+P.reach || 8, .5, 60), a = deg(clamp(+P.angle || 35, 1, 89)), r = Math.tan(a) * len;
      const gk = `cone|${len}|${r.toFixed(3)}`, mk = `beam|${gk}|${c.getHexString()}|${P.beam}|${power}`;
      if (!lightBits.has(gk)) { const g = new T.ConeGeometry(r, len, 48, 1, true); g.translate(0, -len / 2, 0); g.rotateX(-Math.PI / 2); lightBits.set(gk, g); }
      const g = lightBits.get(gk);
      if (!lightBits.has(mk)) lightBits.set(mk, new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
        uniforms: { uCol: { value: c.clone().multiplyScalar(clamp(+P.beam / 100, 0, 3) * power / 100) }, uLen: { value: len } },
        vertexShader: 'varying float vD; varying vec3 vN, vV; void main() { vD = position.z; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uCol; uniform float uLen; varying float vD; varying vec3 vN, vV; void main() { float along = clamp(vD / uLen, 0., 1.); float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uCol * (1. - along) * (1. - along) * edge * .35, 1.); }' }));
      const cone = new T.Mesh(g, lightBits.get(mk)); cone.scale.setScalar(M); cone.userData.bulb = true; l.add(cone);
    }
    return l;
  }
  function buildPart(P, t) {
    if (!P || typeof P !== 'object' || P.hidden) return null;
    const node = new T.Group(), at = placeOf(P, t), turn = keyed(P, 'turn', t, P.turn || [0, 0, 0]), spin = P.spin || [0, 0, 0];
    node.position.set((+at[0] || 0) * M, ((+at[1] || 0) + (+P.bob || 0) * Math.sin(t * 2.1 + (+at[0] || 0))) * M, (+at[2] || 0) * M);
    node.rotation.set(deg((+turn[0] || 0) + (+spin[0] || 0) * t), deg((+turn[1] || 0) + (+spin[1] || 0) * t), deg((+turn[2] || 0) + (+spin[2] || 0) * t), 'YXZ');
    if (P.face === 'travel') { const h = heading(P, t); if (h != null) node.rotation.y = h + deg(+turn[1] || 0); }
    node.scale.set(...scale3(keyed(P, 'scale', t, P.scale ?? 1)));
    node.userData.partId = P.id;
    if (P.type === 'light') node.add(lightOf(P));
    else if (P.type && P.type !== 'group' && (PARTS.includes(P.type) || custom[P.type])) {
      let mat;
      if (P.type === 'label') { const key = `${P.text}|${P.color}|${P.background}`;
        mat = labelMats.get(key) || new T.MeshBasicMaterial({ map: labelTexture(P.text, P.color, P.background) }); labelMats.set(key, mat); }
      else mat = finish(P.finish, P.color, P.glow, P);
      const g = custom[P.type] ? custom[P.type](P, t) : partGeometry(P);
      if (g?.isObject3D) { g.traverse(x => { if (x.isMesh) { x.castShadow = x.receiveShadow = true; x.userData.partId = P.id; } }); node.add(g); }
      else if (g) { const mesh = new T.Mesh(g, mat); mesh.scale.setScalar(M); mesh.castShadow = mesh.receiveShadow = P.type !== 'label'; mesh.userData.partId = P.id; node.add(mesh); }
    }
    for (const C of Array.isArray(P.children) ? P.children : []) { const k = buildPart(C, t); if (k) node.add(k); }
    return node;
  }
  // other parts, added by later modules: a mesh of one's own, a model from the library (type -> make(P))
  const custom = {};
  // Props keep the ids they are picked by: every prop without one gets one.
  function ensureIds(list) {
    let n = 0;
    const walk = arr => { for (const P of Array.isArray(arr) ? arr : []) { if (P && typeof P === 'object') { if (!P.id) P.id = 'p' + Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 5); walk(P.children); } } };
    walk(list); return list;
  }
  function findPart(list, id, parent = null) {
    for (const P of Array.isArray(list) ? list : []) { if (P?.id === id) return { P, list, parent };
      const f = findPart(P?.children, id, P); if (f) return f; }
    return null;
  }
  // props that move by themselves: keyed, spinning, bobbing, playing a clip, or alive (cars, people, crowds, effects)
  const animated = list => JSON.stringify(list || []).match(/"(keys|spin|bob|clip|poseKeys)"|"type":"(car|person|crowd|fx|rain)"/);
  function buildProps(list, t) {
    const root = new T.Group();
    for (const P of Array.isArray(list) ? list : []) { const n = buildPart(P, t); if (n) root.add(n); }
    return root;
  }

  // ----- wheat: blades standing round the spot the camera looks at, swaying in the wind -----
  function fieldMesh(count, height, color, seed = 7) {
    const blade = new T.BufferGeometry(), segs = 7, pos = [], idx = [];
    for (let i = 0; i <= segs; i++) { const f = i / segs, w = f < .7 ? .006 : .018 * Math.sin((f - .7) / .3 * Math.PI) + .004; pos.push(-w, f, 0, w, f, 0); }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    blade.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); blade.setIndex(idx); blade.computeVertexNormals();
    const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .75, side: T.DoubleSide });
    // uF1/uF2 are the two sway speeds (radians a second): 1.7 and 3.1, or the nearest that repeat exactly over the video
    const uniforms = { uTime: { value: 0 }, uWind: { value: 4 }, uF1: { value: 1.7 }, uF2: { value: 3.1 } };
    mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'uniform float uTime, uWind, uF1, uF2;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0., 0., 0., 1.);
        float sway = (sin(uTime * uF1 + ip.x * .013 + ip.z * .009) * .6 + sin(uTime * uF2 + ip.x * .05) * .25) * uWind * .018 * position.y * position.y;
        transformed.x += sway; transformed.z += sway * .4;`); };
    const mesh = new T.InstancedMesh(blade, mat, count), rand = rng(seed), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), c = lin(color), cc = new T.Color();
    for (let i = 0; i < count; i++) {
      const r = 3.5 + Math.sqrt(rand()) * 28, a = rand() * Math.PI * 2, h = height * (.75 + rand() * .5);
      e.set((rand() - .5) * .35, rand() * Math.PI * 2, (rand() - .5) * .35); q.setFromEuler(e);
      m4.compose(new T.Vector3(Math.cos(a) * r * M, 0, Math.sin(a) * r * M), q, new T.Vector3(M * (1 + rand() * .6), h * M, M));
      mesh.setMatrixAt(i, m4); cc.copy(c).offsetHSL((rand() - .5) * .04, (rand() - .5) * .15, (rand() - .5) * .14); mesh.setColorAt(i, cc);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.uniforms = uniforms;
    return mesh;
  }

  // ----- the ground under everything but the ocean -----
  function groundMesh(kind, color, libFinish) {
    const size = 8000 * M, n = kind === 'desert' ? 400 : 2, g = new T.PlaneGeometry(size, size, n, n); g.rotateX(-Math.PI / 2);
    if (kind === 'desert') { const p = g.attributes.position, rand = rng(11);
      const ph = [rand() * 9, rand() * 9, rand() * 9];
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) / M, z = p.getZ(i) / M, r = Math.hypot(x, z);
        const h = (Math.sin(x * .021 + ph[0] + Math.sin(z * .013) * 2) * 6 + Math.sin(z * .037 + ph[1] + x * .01) * 3 + Math.sin((x + z) * .09 + ph[2]) * .8);
        p.setY(i, h * M * T.MathUtils.smoothstep(r, 25, 140)); }
      g.computeVertexNormals(); }
    const pt = kind === 'desert' ? 'sand' : kind === 'floor' ? 'floor' : 'soil', rep = kind === 'floor' ? 2000 : 3000;
    const mat = new T.MeshStandardMaterial({ color: lin(color), roughness: kind === 'floor' ? .45 : .95, metalness: 0, map: tex(pt, rep, true), bumpMap: tex(pt, rep), bumpScale: kind === 'floor' ? .2 : 1.2 });
    const lib = libFinish && World.finishHook ? World.finishHook(libFinish.replace(/^lib:/, ''), null, { size: [size / M, 1, size / M], tile: 2, ground: true }) : null;
    const m = new T.Mesh(g, lib || mat); m.receiveShadow = true; m.frustumCulled = false; return m;
  }

  // ----- dust in the air, catching the light -----
  function dustPoints(count, seed = 3) {
    const pos = new Float32Array(count * 3), rand = rng(seed);
    for (let i = 0; i < count; i++) { pos[i * 3] = rand(); pos[i * 3 + 1] = rand(); pos[i * 3 + 2] = rand(); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uWind: { value: 2 }, uCol: { value: new T.Color() }, uCenter: { value: new T.Vector3() }, uSize: { value: 1 } },
      vertexShader: `uniform float uTime, uWind, uSize; uniform vec3 uCenter; varying float vA;
        void main() { vec3 box = vec3(36., 9., 36.) * 100.;
          vec3 p = position * box + vec3(uTime * uWind * 18., sin(uTime * .4 + position.x * 30.) * 20., uTime * 9.) + vec3(sin(uTime * .7 + position.z * 40.), cos(uTime * .5 + position.y * 50.), 0.) * 30.;
          p = mod(p, box) - box * vec3(.5, 0., .5) + uCenter;
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * 900. / -mv.z, 1., 24.); vA = smoothstep(80000., 400., -mv.z) * (.4 + .6 * fract(position.x * 91.)); }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main() { float d = length(gl_PointCoord - .5); gl_FragColor = vec4(uCol * smoothstep(.5, 0., d) * vA, 1.); }` });
    const p = new T.Points(g, mat); p.frustumCulled = false; return p;
  }

  // ----- the camera: the world's own (eye height, looking around, travel, lens), moved by a camera layer -----
  // the props from the top down to ID, for where it is in the world
  function chain(list, id, up = []) {
    for (const P of Array.isArray(list) ? list : []) { if (P?.id === id) return [...up, P]; const f = chain(P?.children, id, [...up, P]); if (f) return f; }
    return null;
  }
  function partMatrix(o, id, tw) {
    const parts = chain(o.objects, id); if (!parts) return null;
    const m = new T.Matrix4().makeTranslation(0, -(+o.eye || 1.7) * M, 0), q = new T.Quaternion(), e = new T.Euler();
    for (const P of parts) {
      const at = placeOf(P, tw), turn = keyed(P, 'turn', tw, P.turn || [0, 0, 0]), spin = P.spin || [0, 0, 0];
      e.set(deg((+turn[0] || 0) + (+spin[0] || 0) * tw), deg((+turn[1] || 0) + (+spin[1] || 0) * tw), deg((+turn[2] || 0) + (+spin[2] || 0) * tw), 'YXZ');
      if (P.face === 'travel') { const h = heading(P, tw); if (h != null) e.y = h + deg(+turn[1] || 0); }
      q.setFromEuler(e);
      m.multiply(new T.Matrix4().compose(new T.Vector3((+at[0] || 0) * M, ((+at[1] || 0) + (+P.bob || 0) * Math.sin(tw * 2.1 + (+at[0] || 0))) * M, (+at[2] || 0) * M), q,
        new T.Vector3(...scale3(keyed(P, 'scale', tw, P.scale ?? 1)))));
    }
    return { m, P: parts[parts.length - 1] };
  }
  // the camera prop the shot list cuts to at T, if any
  function shotAt(o, t) {
    const list = Array.isArray(o.shots) ? o.shots : []; let cur = null;
    for (const s of list) if (+s.t <= t + 1e-6 && (!cur || +s.t >= +cur.t)) cur = s;
    return cur?.cam ? cur.cam : null;
  }
  // a camera prop as the camera: where it stands, what it looks at, its lens, focus and the shake of a hand holding it
  function propCamera(o, id, tw) {
    const f = partMatrix(o, id, tw); if (!f || f.P.type !== 'camera') return null;
    const P = f.P, lens = clamp(+P.lens || 35, 6, 400), cam = new T.PerspectiveCamera(2 * Math.atan(12 / lens) * 180 / Math.PI, S.w / S.h, 5, 4e6);
    f.m.decompose(cam.position, cam.quaternion, new T.Vector3());
    const look = P.lookAt ? partMatrix(o, P.lookAt, tw) : null, ahead = new T.Vector3();
    if (look) { look.m.decompose(ahead, new T.Quaternion(), new T.Vector3()); ahead.y += (+(look.P.size?.[1]) || 0) * M / 2; cam.up.set(0, 1, 0); cam.lookAt(ahead); cam.rotateZ(deg(-(+(P.turn?.[2]) || 0))); }
    else if (P.face === 'travel') { const h = heading(P, tw); if (h != null) { cam.rotation.set(deg(+(P.turn?.[0]) || 0), h + Math.PI, deg(+(P.turn?.[2]) || 0), 'YXZ'); } }
    // a hand-held camera wanders a little, the same way every time
    const sh = clamp(+P.shake || 0, 0, 100) / 100;
    if (sh) { const n = (a, b, c) => Math.sin(tw * a + b) * .6 + Math.sin(tw * c + b * 2.3) * .4;
      cam.rotateX(deg(n(1.7, .3, 4.3) * 1.4 * sh)); cam.rotateY(deg(n(1.3, 1.1, 3.7) * 1.6 * sh)); cam.rotateZ(deg(n(.9, 2.1, 2.9) * .8 * sh));
      cam.position.y += n(2.3, .7, 5.1) * 1.5 * sh; }
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const focusAt = P.focusOn ? partMatrix(o, P.focusOn, tw) : look;
    let d = +P.focus > 0 ? +P.focus * M : 1000;
    if (focusAt) { const p = new T.Vector3(); focusAt.m.decompose(p, new T.Quaternion(), new T.Vector3()); p.y += (+(focusAt.P.size?.[1]) || 0) * M / 2; d = Math.max(10, p.distanceTo(cam.position)); }
    cam.userData.d = d; cam.userData.focus = d; cam.userData.target = cam.position.clone().addScaledVector(fwd, d);
    if (+P.dof > 0) cam.userData.dof = +P.dof;
    cam.userData.prop = id;
    return cam;
  }
  // world time: the timeline's time, slowed or sped by the world's speed (%, keyed for ramps)
  const paceMemo = new Map();
  function worldTime(L, t) {
    if (!L) return t;
    if (!L.keys?.pace?.length) { const p = L.p?.pace; return t * (p == null || p === '' || !isFinite(+p) ? 100 : Math.max(0, +p)) / 100; }
    const key = JSON.stringify(L.keys.pace) + '|' + t, hit = paceMemo.get(L.id);
    if (hit?.key === key) return hit.v;
    let v = 0; const dt = 1 / 120;
    for (let x = 0; x < t; x += dt) v += Math.max(0, +val(L, 'pace', Math.min(t, x + dt / 2)) || 0) / 100 * Math.min(dt, t - x);
    paceMemo.set(L.id, { key, v }); return v;
  }
  function camera(t, o, L = null) {
    const shot = shotAt(o, t); if (shot) { const c = propCamera(o, shot, worldTime(L, t)); if (c) return c; }
    const C = R().cameraState(t), lens = clamp(+o.lens || 35, 6, 400), zoom = Math.max(.05, +C.zoom || 1);
    const half = Math.atan(12 / lens), d0 = (S.h / 2) / Math.tan(half);
    const cam = new T.PerspectiveCamera(2 * Math.atan(Math.tan(half) / zoom) * 180 / Math.PI, S.w / S.h, 5, 4e6);
    const a = deg((+C.orbit || 0) + (+o.heading || 0)), b = deg(C.tilt), d = Math.max(1, d0 - (+C.dolly || 0)), tr = (+o.travel || 0) * M;
    const tx = C.x - S.w / 2 - Math.sin(a) * tr, ty = -(C.y - S.h / 2), tz = -Math.cos(a) * tr;
    cam.position.set(tx + d * Math.sin(a) * Math.cos(b), ty + d * Math.sin(b), tz + d * Math.cos(a) * Math.cos(b));
    cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz); cam.rotateX(deg(o.pitch)); if (C.rotation) cam.rotateZ(-deg(C.rotation));
    cam.updateMatrixWorld(); cam.updateProjectionMatrix(); cam.userData.target = new T.Vector3(tx, ty, tz); cam.userData.d = d;
    return cam;
  }

  // ----- which world a layer is in: a 3D shape or model above a world layer, up to the next one -----
  function worldOf(L, t) {
    if (L.type !== 'shape3d' && L.type !== 'model') return null;
    const i = S.layers.indexOf(L);
    for (let j = i - 1; j >= 0; j--) { const W = S.layers[j]; if (W.type === 'world' && visibleAt(W, t) && !W.hidden) return W; }
    return null;
  }
  const members = (W, t) => { const i = S.layers.indexOf(W), out = [];
    for (let j = i + 1; j < S.layers.length; j++) { const L = S.layers[j]; if (L.type === 'world') break;
      if ((L.type === 'shape3d' || L.type === 'model') && visibleAt(L, t) && !L.hidden) out.push(L); }
    return out; };

  // ----- one renderer, one composer: the world through its lens -----
  let renderer = null, failed = !T, composer = null, passes = null, pmrem = null;
  function gl() {
    if (renderer || failed) return renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
      pmrem = new T.PMREMGenerator(renderer);
    } catch (e) { failed = true; renderer = null; console.warn('3D worlds are off: this browser has no WebGL.', e); }
    return renderer;
  }
  // Light shafts: the bright sky streaked out from the sun across what stands in front of it (in the light, before
  // tone mapping).
  const RAYS = { uniforms: { tDiffuse: { value: null }, uSun: { value: new T.Vector2(.5, .5) }, uOn: { value: 0 }, uTint: { value: new T.Color(1, .9, .7) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uOn; uniform vec3 uTint; varying vec2 vUv;
      void main() { vec4 base = texture2D(tDiffuse, vUv); if (uOn <= 0.) { gl_FragColor = base; return; }
        vec2 d = (uSun - vUv) / 48.; vec2 p = vUv; float w = 1.; vec3 acc = vec3(0.);
        for (int i = 0; i < 48; i++) { p += d; vec3 c = texture2D(tDiffuse, p).rgb; float l = dot(c, vec3(.3, .59, .11)); acc += c * smoothstep(1., 3., l) * w; w *= .965; }
        gl_FragColor = vec4(base.rgb + acc / 48. * uOn * 3. * uTint, base.a); }` };
  const FILM = { uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0 }, uFringe: { value: 0 }, uAspect: { value: 1 },
      uSun: { value: new T.Vector2(.5, .5) }, uFlare: { value: 0 }, uStreak: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uGrain, uFringe, uAspect, uFlare, uStreak; uniform vec2 uSun; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() { vec2 c = vUv - .5; vec2 off = c * dot(c, c) * uFringe * .06;
        vec3 col = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
        // anamorphic streaks: bright lights smeared sideways, blue
        if (uStreak > 0.) { vec3 s = vec3(0.); for (int i = -12; i <= 12; i++) { vec3 q = texture2D(tDiffuse, vUv + vec2(float(i) * .012, 0.)).rgb;
            s += max(q - .96, 0.) * (1. - abs(float(i)) / 13.); } col += s * vec3(.35, .55, 1.) * uStreak * .9; }
        // a flare: ghosts of the sun along the line through the middle, as bright as the sun shows
        if (uFlare > 0.) { float vis = smoothstep(.75, 1., dot(texture2D(tDiffuse, uSun).rgb, vec3(.33)));
          vec2 axis = vec2(.5) - uSun; vec3 f = vec3(0.);
          for (int i = 1; i <= 5; i++) { float k = float(i) * .42 - .25; vec2 g = uSun + axis * k * 2.; float r = .02 + .03 * fract(float(i) * .37);
            vec2 dd = (vUv - g) * vec2(uAspect, 1.); f += vec3(.9, .6 + .1 * float(i), .4 + .12 * float(i)) * smoothstep(r, r * .3, length(dd)) * .18; }
          vec2 ds = (vUv - uSun) * vec2(uAspect, 1.); f += vec3(1., .85, .6) * .25 / (1. + 90. * length(ds)) + vec3(.4, .6, 1.) * smoothstep(.006, 0., abs(ds.y)) * smoothstep(.6, 0., abs(ds.x)) * .6;
          col += f * vis * uFlare; }
        float n = h(vUv * vec2(1931., 1931. / uAspect) + fract(uTime * 7.31)) - .5;
        float l = dot(col, vec3(.299, .587, .114));
        col += n * uGrain * .16 * (1. - abs(l - .45) * 1.1);
        gl_FragColor = vec4(col, 1.); }` };
  // Exponential height fog, as film and game engines draw air: thick low down, thinning with height, so a valley
  // fills with haze while the peaks stand clear of it, and lit by the sun where one looks towards it. Worked out
  // for every pixel from its depth: how much air lies along the ray to it, with the density falling off with
  // height (the integral of a e^-b(h) along the ray, in closed form), in the light, before tone mapping.
  const HAZE = { uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uOn: { value: 0 }, uDensity: { value: 0 }, uFall: { value: 250 },
      uGround: { value: 0 }, uGlow: { value: 0 }, uProjInv: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uCamPos: { value: new T.Vector3() },
      uSunDir: { value: new T.Vector3(0, 1, 0) }, uFogCol: { value: new T.Color() }, uSunCol: { value: new T.Color() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform float uOn, uDensity, uFall, uGround, uGlow; uniform mat4 uProjInv, uCamWorld;
      uniform vec3 uCamPos, uSunDir, uFogCol, uSunCol; varying vec2 vUv;
      void main() { vec4 base = texture2D(tDiffuse, vUv); if (uOn <= 0.) { gl_FragColor = base; return; }
        float z = texture2D(tDepth, vUv).x; bool sky = z >= 1.;
        vec4 v = uProjInv * vec4(vUv * 2. - 1., (sky ? .5 : z) * 2. - 1., 1.); v /= v.w;
        vec3 dir = normalize((uCamWorld * vec4(v.xyz, 1.)).xyz - uCamPos);
        float dist = sky ? 1e5 : length((uCamWorld * v).xyz - uCamPos) / 100.;     // metres; the sky is as far as the air goes
        float b = 1. / max(uFall, 1.), h = (uCamPos.y - uGround) / 100., dh = dir.y * dist;
        float k = abs(b * dh) > 1e-4 ? (1. - exp(-b * dh)) / (b * dh) : 1.;
        float amount = 1. - exp(-uDensity * exp(-b * max(h, 0.)) * dist * k);
        // the sky is fogged only where it meets the land, so its clouds and blue overhead stay
        if (sky) amount *= smoothstep(.3, 0., dir.y) * .85;
        float toSun = max(dot(dir, uSunDir), 0.);
        vec3 fogc = uFogCol + uSunCol * (pow(toSun, 6.) * .6 + pow(toSun, 40.) * 1.4) * uGlow;
        gl_FragColor = vec4(mix(base.rgb, fogc, clamp(amount, 0., 1.)), base.a); }` };
  function lens(W, H, scene, cam) {
    if (!composer) {
      composer = new T.EffectComposer(renderer, new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType }));
      // the depth of what was drawn, for the height fog to know how far each pixel is: in full floats, as a mountain
      // 20 km off is a hair's breadth from the sky in an ordinary depth buffer, and would be fogged as sky
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) rt.depthTexture = new T.DepthTexture(W, H, T.FloatType);
      const render = new T.RenderPass(scene, cam), ao = new T.GTAOPass(scene, cam, W, H),
        bokeh = new T.BokehPass(scene, cam, { focus: 1000, aperture: 0, maxblur: .01 }),
        bloom = new T.UnrealBloomPass(new T.Vector2(W, H), .3, .6, .82), out = new T.OutputPass(), film = new T.ShaderPass(FILM), rays = new T.ShaderPass(RAYS);
      const haze = new T.ShaderPass(HAZE), drawHaze = haze.render.bind(haze);
      haze.render = (rr, w, r, dt, m) => { haze.uniforms.tDepth.value = r.depthTexture; drawHaze(rr, w, r, dt, m); };
      for (const p of [render, haze, ao, bokeh, rays, bloom, out, film]) composer.addPass(p);
      passes = { render, haze, ao, bokeh, rays, bloom, out, film };
    }
    composer.setSize(W, H);
    for (const p of [passes.render, passes.ao, passes.bokeh]) { p.scene = scene; p.camera = cam; }
    return passes;
  }

  // ----- what stays between frames: a world's sky, ground, props, by what they were built from -----
  const built = new Map();      // world layer id -> { scene, parts, keys }
  function worldFor(L) {
    let B = built.get(L.id);
    if (!B) { const uniforms = { ...skyUniforms(), uWaves: { value: .6 }, uChop: { value: .5 }, uGround: { value: 0 }, uWater: { value: new T.Color() }, uLight: { value: 1 } };
      const scene = new T.Scene(), sun = new T.DirectionalLight(0xffffff, 3), hemi = new T.HemisphereLight(0xffffff, 0x444444, .6);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = 2; sun.shadow.radius = 4;
      const sc = sun.shadow.camera; sc.left = sc.bottom = -2500; sc.right = sc.top = 2500; sc.near = 10; sc.far = 40000;
      scene.add(sun, sun.target, hemi);
      const sky = skyMesh(uniforms); scene.add(sky);
      B = { scene, uniforms, sun, hemi, sky, keys: {} }; built.set(L.id, B); }
    return B;
  }
  // swap a part when what it is built from changed
  function rebuild(B, name, key, make) {
    if (B.keys[name] === key) return B[name];
    if (B[name]) { B.scene.remove(B[name]); B[name].traverse?.(x => { if (x.isMesh || x.isPoints) { x.geometry?.dispose?.(); x.material?.dispose?.(); } }); }
    B.keys[name] = key; B[name] = key == null ? null : make();
    if (B[name]) B.scene.add(B[name]);
    return B[name];
  }
  const sunDir = o => { const e = deg(clamp(+o.sunEl, -10, 90)), a = deg(o.sunAz); return new T.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize(); };

  // the sky as light: what metal and glass reflect, made again only when the sky changes
  function environment(B, o) {
    const key = [o.sky, Math.round(o.sunEl), Math.round(o.sunAz), Math.round(o.clouds / 10)].join('|');
    if (B.envKey === key) return B.env;
    if (!pmrem) return null;     // staged to be drawn elsewhere (the server): no light from the sky needed here
    const s = new T.Scene(), m = skyMesh(B.uniforms); m.scale.setScalar(100); s.add(m);
    const target = pmrem.fromScene(s, 0, .1, 1000); B.env?.dispose?.(); B.env = target.texture; B.envKey = key; m.geometry.dispose(); m.material.dispose();
    return B.env;
  }

  // Set the world up as it is at T: its sky, light, ground, props and the 3D layers in it. What films it is separate.
  function stage(L, o, t, k = 1) {
    const Rr = renderer, B = worldFor(L), U = B.uniforms, pal = PALETTE[o.sky] || PALETTE.sunset, cam = camera(t, o, L), ground = -(+o.eye || 1.7) * M;
    // what moves by itself in the world moves on world time, slowed or sped by its speed
    const tl = t; t = worldTime(L, t); void tl;
    const sun = sunDir(o), elev = clamp(sun.y * 4 + .15, 0, 1);
    // the sky
    U.uSunDir.value.copy(sun); U.uZen.value.copy(lin(pal.zen)); U.uHor.value.copy(lin(pal.hor)); U.uSun.value.copy(lin(pal.sun)).multiplyScalar(pal.power * (o.sunPower ?? 100) / 100);
    U.uLit.value.copy(lin(pal.lit)); U.uShade.value.copy(lin(pal.shade)); U.uClouds.value = o.sky === 'studio' ? 0 : clamp((o.sky === 'overcast' ? Math.max(80, o.clouds) : +o.clouds) / 100, 0, 1);
    U.uTime.value = t; U.uWind.value = +o.wind || 0; U.uStars.value = o.sky === 'night' ? 1 : 0; U.uDisk.value = pal.disk; U.uFog.value = Math.max(0, +o.fog || 0) / 100 * .02;
    U.uGround.value = ground; U.uWaves.value = Math.max(0, +o.waves || 0); U.uChop.value = clamp((+o.chop || 0) / 100, 0, 1.5);
    U.uWater.value.copy(lin(o.water)); U.uLight.value = .35 + .9 * elev * pal.power;
    B.sky.position.copy(cam.position);
    // the light: the sun, and the sky all round
    B.sun.color.copy(lin(pal.sun)); B.sun.intensity = 3.2 * pal.power * elev * (o.sunPower ?? 100) / 100;
    const stage = new T.Vector3(cam.userData.target.x, ground, cam.userData.target.z);
    B.sun.position.copy(stage).addScaledVector(sun, 20000); B.sun.target.position.copy(stage); B.sun.target.updateMatrixWorld();
    B.hemi.color.copy(lin(pal.zen)).lerp(lin(pal.hor), .5); B.hemi.groundColor.copy(lin(o.ground === 'ocean' ? o.water : o.groundColor)).multiplyScalar(.6); B.hemi.intensity = .5 + .4 * pal.power;
    B.scene.environment = environment(B, o); B.scene.environmentIntensity = .55 + .45 * pal.power;
    // a sky photo (an HDRI from the library) lights and backs the world instead
    const photo = o.hdri && World.hdriHook ? World.hdriHook(B, o) : false;
    B.sky.visible = !photo; if (!photo) B.scene.background = null;
    const fogC = lin(pal.hor).lerp(lin(pal.sun), .15);
    B.scene.fog = o.fog > 0 ? new T.FogExp2(fogC, (+o.fog / 100) * .02 / M) : null;
    // the ground
    rebuild(B, 'ocean', o.ground === 'ocean' ? 'ocean' : null, () => oceanMesh(U));
    // a field far off is the colour of what grows in it
    const soil = o.ground === 'field' ? '#' + lin(o.groundColor).lerp(lin(o.plants), .45).getHexString(T.SRGBColorSpace) : o.groundColor;
    rebuild(B, 'land', ['field', 'desert', 'floor'].includes(o.ground) ? o.ground + soil + (o.floorFinish || '') : null, () => groundMesh(o.ground, soil, o.floorFinish));
    if (B.land) B.land.position.set(0, ground, 0);
    const count = o.ground === 'field' ? Math.round(clamp(+o.grass, 0, 100) * 900) : 0;
    const wheat = rebuild(B, 'wheat', count ? [count, (+o.grassH).toFixed(2), o.plants].join('|') : null, () => fieldMesh(count, Math.max(.05, +o.grassH || .9), o.plants));
    if (wheat) { const u = wheat.userData.uniforms; wheat.position.set(0, ground, 0); u.uTime.value = t;
      // the wheat's own sway (worlds from before it follow the wind); looped, each speed is a whole number of swings over the video
      u.uWind.value = Math.max(0, +(o.sway ?? o.wind) || 0);
      const fit = f => { const d = Math.max(.1, +S.dur || 1), n = Math.max(1, Math.round(f * d / (2 * Math.PI))); return 2 * Math.PI * n / d; };
      u.uF1.value = o.swayLoop ? fit(1.7) : 1.7; u.uF2.value = o.swayLoop ? fit(3.1) : 3.1; }
    // a breaking wave
    const swell = o.ground === 'ocean' ? Math.max(0, +o.swell || 0) : 0;
    const br = rebuild(B, 'breaker', swell > 0 ? 'breaker' : null, () => breakerMesh(U));
    if (br) { const key = `${swell.toFixed(2)}|${(+o.curl).toFixed(3)}`;
      if (br.userData.key !== key) { br.geometry.dispose(); br.geometry = breakerGeometry(swell, clamp(+o.curl, 0, 1)); br.userData.key = key; }
      br.position.set(0, ground - .35 * M, -(+o.waveDist || 0) * M); br.rotation.set(0, deg(o.waveAngle), 0); }
    // dust
    const motes = Math.round(clamp(+o.dust || 0, 0, 100) * 40), dust = rebuild(B, 'dust', motes ? motes : null, () => dustPoints(motes));
    if (dust) { const u = dust.material.uniforms; u.uTime.value = t; u.uWind.value = +o.wind || 0; u.uCenter.value.set(stage.x, ground, stage.z);
      u.uCol.value.copy(lin(pal.sun)).multiplyScalar(.6 * elev + .1); u.uSize.value = 1.4; }
    // props: built again when they change, or every frame when they move with time; not while one is held
    const pkey = JSON.stringify(o.objects || []) + (animated(o.objects) ? '@' + t : '') + '#' + World.version;
    if (B.propsKey !== pkey && B.hold !== true) { if (B.props) { B.scene.remove(B.props); B.props.traverse(n => { if (n.isLight) n.dispose?.(); }); }
      B.props = buildProps(o.objects, t); B.propsKey = pkey; B.scene.add(B.props); }
    B.props.position.set(0, ground, 0);
    // guides (camera props) show only in the scene editor's own views
    B.props.traverse(n => { if (n.userData.guide) n.visible = !!World.showGuides; });
    // the 3D shapes and models above it
    // (kept as they are while the scene editor's gizmo holds one, so it is not swapped from under it)
    if (!(B.hold === true && B.members?.length)) {
      for (const m of B.members || []) { B.scene.remove(m); m.userData.dispose?.(); }
      B.members = [];
      for (const M2 of members(L, tl)) { const os = state(M2, tl), obj = R().object(M2, os, tl, k, drawContent); if (!obj) continue;
        obj.userData.layerId = M2.id;
        obj.traverse(x => { if (x.isMesh) { x.castShadow = x.receiveShadow = true; } }); B.scene.add(obj); B.members.push(obj); }
    }
    if (Rr) Rr.toneMappingExposure = Math.pow(2, +o.exposure || 0);
    for (const h of World.stageHooks) h({ L, B, o, t, ground, cam, k });
    return { B, cam, ground };
  }
  function draw(c, L, o, t) {
    const Rr = gl(); if (!Rr) return false;
    const k = c.getTransform().a || 1, W = Math.max(1, Math.min(8192, Math.round(S.w * k))), H = Math.max(1, Math.min(8192, Math.round(S.h * k)));
    if (Rr.domElement.width !== W || Rr.domElement.height !== H) Rr.setSize(W, H, false);
    const { B, cam } = stage(L, o, t, k);
    // a frame already finished another way (path traced, for an export)
    const done = finished.get(L.id);
    if (done && done.key === frameKey(L, o, t)) c.drawImage(done.canvas, 0, 0, S.w, S.h);
    else { shoot(B, cam, o, t, W, H); c.drawImage(Rr.domElement, 0, 0, S.w, S.h); }
    bars(c, o);
    return true;
  }
  // black bars top and bottom, for a wider picture than the canvas
  function bars(c, o) {
    const r = +o.letterbox; if (!(r > 0) || S.w / S.h >= r) return;
    const h = (S.h - S.w / r) / 2; c.save(); c.globalAlpha = 1; c.filter = 'none'; c.fillStyle = '#000'; c.fillRect(0, 0, S.w, h); c.fillRect(0, S.h - h, S.w, h); c.restore();
  }
  // Frames finished before they are kept, for an export (or an agent's look): path traced, and with motion blur, a
  // frame made of moments across the shutter's time, laid over each other.
  const finished = new Map();
  const frameKey = (L, o, t) => `${t}|${JSON.stringify(o)}|${World.version}`;
  async function prepareFrame(t) {
    for (const L of S.layers) {
      if (L.type !== 'world' || L.hidden || !visibleAt(L, t)) continue;
      const o = state(L, t), path = o.render === 'path' && World.traceFrame, shutter = clamp(+o.shutter || 0, 0, 360);
      if (!path && !shutter) { finished.delete(L.id); continue; }
      if (!gl()) return;
      const W = S.w, H = S.h, n = shutter ? (path ? 4 : 10) : 1, fps = (typeof exportOpts !== 'undefined' && +exportOpts.fps) || 30;
      const cv = finished.get(L.id)?.canvas || document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
      for (let i = 0; i < n; i++) {
        const ts = n === 1 ? t : Math.max(0, t + ((i + .5) / n - .5) * (shutter / 360) / fps), os = n === 1 ? o : state(L, ts);
        if (renderer.domElement.width !== W || renderer.domElement.height !== H) renderer.setSize(W, H, false);
        const st = stage(L, os, ts);
        if (path) await World.traceFrame(L, os, ts, st.B, st.cam, W, H, Math.max(1, Math.round((+os.samples || 128) / n)));
        else { shoot(st.B, st.cam, os, ts, W, H); await new Promise(r => setTimeout(r, 0)); }
        g.globalAlpha = 1 / (i + 1); g.drawImage(renderer.domElement, 0, 0);
      }
      finished.set(L.id, { key: frameKey(L, o, t), canvas: cv });
    }
  }
  // film the staged world through its lens, into the renderer's canvas
  function shoot(B, cam, o, t, W, H) {
    const Rr = renderer;
    Rr.toneMappingExposure = Math.pow(2, +o.exposure || 0);
    const P = lens(W, H, B.scene, cam);
    P.ao.enabled = o.ao > 0; if (P.ao.enabled) { P.ao.blendIntensity = clamp(o.ao / 100, 0, 1); P.ao.updateGtaoMaterial?.({ radius: 60, distanceExponent: 1, thickness: 40, scale: 1 }); }
    // a camera prop's own focus and depth of field, else the world's
    const dof = cam.userData.dof ?? o.dof, focus = cam.userData.focus ?? (o.focus > 0 ? o.focus * M : cam.userData.d);
    P.bokeh.enabled = dof > 0; P.bokeh.uniforms.focus.value = focus; P.bokeh.uniforms.aperture.value = clamp(dof / 100, 0, 2) * 3e-5;
    P.bokeh.uniforms.maxblur.value = .004 + .016 * clamp(dof / 100, 0, 1.5);
    // height fog: the sky's horizon colour, lit by how high the sun is; brighter towards the sun
    const hz = P.haze.uniforms, pal = PALETTE[o.sky] || PALETTE.sunset, elev = clamp(sunDir(o).y * 4 + .15, 0, 1);
    P.haze.enabled = +o.haze > 0; hz.uOn.value = +o.haze > 0 ? 1 : 0; hz.uDensity.value = clamp(+o.haze || 0, 0, 100) * 4e-5;
    hz.uFall.value = Math.max(1, +o.hazeFall || 250); hz.uGlow.value = clamp((o.hazeGlow == null ? 60 : +o.hazeGlow) / 100, 0, 3);
    hz.uGround.value = -(+o.eye || 1.7) * M; cam.updateMatrixWorld(); hz.uProjInv.value.copy(cam.projectionMatrixInverse); hz.uCamWorld.value.copy(cam.matrixWorld);
    hz.uCamPos.value.setFromMatrixPosition(cam.matrixWorld); hz.uSunDir.value.copy(sunDir(o));
    hz.uFogCol.value.copy(lin(pal.hor)).lerp(lin(pal.zen), .15).multiplyScalar((.35 + .9 * elev) * pal.power * .75);
    hz.uSunCol.value.copy(lin(pal.sun)).multiplyScalar(pal.power * elev * (o.sunPower ?? 100) / 100);
    P.bloom.enabled = o.bloom > 0; P.bloom.strength = clamp(o.bloom / 100, 0, 3) * .6; P.bloom.radius = .55; P.bloom.threshold = 1.1;
    const fu = P.film.uniforms; fu.uTime.value = t; fu.uGrain.value = clamp(o.grain / 100, 0, 2); fu.uFringe.value = clamp(o.fringe / 100, 0, 3); fu.uAspect.value = W / H;
    // where the sun is on the picture, for light shafts and a flare
    const sp = cam.position.clone().addScaledVector(sunDir(o), 1e5).project(cam), seen = sp.z < 1 && Math.abs(sp.x) < 1.3 && Math.abs(sp.y) < 1.3;
    const su = new T.Vector2((sp.x + 1) / 2, (sp.y + 1) / 2);
    P.rays.enabled = (+o.godrays > 0) && seen; P.rays.uniforms.uSun.value.copy(su); P.rays.uniforms.uOn.value = clamp(+o.godrays / 100, 0, 2);
    P.rays.uniforms.uTint.value.copy(lin((PALETTE[o.sky] || PALETTE.sunset).sun));
    fu.uSun.value.copy(su); fu.uFlare.value = seen && !o.hdri ? clamp(+o.flare / 100, 0, 2) : 0; fu.uStreak.value = clamp(+o.streaks / 100, 0, 2);
    composer.render();
  }
  // the camera that films a 3D layer standing in a world, for where it lands on the canvas
  R3D.worldCamera = (L, t) => { const W = worldOf(L, t); return W ? camera(t, state(W, t), W) : null; };

  // ----- scenes to start from -----
  // Each sets a world's settings and props, and keys a slow camera move across the composition.
  const rig = () => {
    const body = { type: 'box', at: [0, 1.32, 0], size: [.34, .27, .3], round: .025, finish: 'worn-metal', children: [] };
    return [
      { type: 'group', at: [0, 0, 0], turn: [0, 28, 0], children: [
        body,
        { type: 'box', at: [0, 1.475, .02], size: [.32, .035, .32], round: .01, finish: 'worn-metal' },
        { type: 'box', at: [-.07, 1.53, .02], size: [.035, .08, .035], round: .008, finish: 'worn-metal' },
        { type: 'box', at: [.07, 1.53, .02], size: [.035, .08, .035], round: .008, finish: 'worn-metal' },
        { type: 'box', at: [0, 1.585, .02], size: [.2, .035, .045], round: .012, finish: 'worn-metal' },
        { type: 'sphere', at: [.05, 1.625, .02], size: [.045, .045, .045], finish: 'paint', color: '#3a0c0c' },
        { type: 'label', at: [-.171, 1.36, .05], turn: [0, -90, 0], size: [.09, .055, 1], text: '24.00 1/50\nISO 800\n4K  REC', color: '#e8e8e8' },
        { type: 'box', at: [-.171, 1.36, -.012], size: [.006, .012, .012], finish: 'glow', color: '#ff1a10', glow: 1.6 },
        { type: 'cylinder', at: [0, 1.32, .2], turn: [90, 0, 0], size: [.13, .1, 1], finish: 'leatherette' },
        { type: 'cylinder', at: [0, 1.32, .265], turn: [90, 0, 0], size: [.118, .04, 1], finish: 'rubber' },
        { type: 'torus', at: [0, 1.32, .247], size: [.124, 1, .008], finish: 'aluminium' },
        { type: 'cylinder', at: [0, 1.32, .287], turn: [90, 0, 0], size: [.1, .006, 1], finish: 'lens' },
        { type: 'box', at: [0, 1.32, .42], size: [.26, .22, .006], finish: 'worn-metal' },
        { type: 'box', at: [0, 1.435, .47], turn: [-8, 0, 0], size: [.3, .006, .2], finish: 'worn-metal' },
        { type: 'box', at: [.145, 1.32, .47], turn: [0, 8, 0], size: [.006, .24, .2], finish: 'worn-metal' },
        { type: 'box', at: [-.145, 1.32, .47], turn: [0, -8, 0], size: [.006, .24, .2], finish: 'worn-metal' },
        { type: 'box', at: [0, 1.205, .47], turn: [8, 0, 0], size: [.3, .006, .2], finish: 'worn-metal' },
        { type: 'cylinder', at: [-.05, 1.19, .2], turn: [90, 0, 0], size: [.015, .5, 1], finish: 'aluminium' },
        { type: 'cylinder', at: [.05, 1.19, .2], turn: [90, 0, 0], size: [.015, .5, 1], finish: 'aluminium' },
        { type: 'cylinder', at: [-.13, 1.19, .05], turn: [0, 0, 90], size: [.06, .05, 1], finish: 'aluminium' },
        { type: 'box', at: [0, 1.14, 0], size: [.1, .1, .12], round: .01, finish: 'worn-metal' },
        { type: 'box', at: [0, 1.05, 0], size: [.24, .09, .2], round: .02, finish: 'worn-metal' },
        { type: 'truss', at: [0, 1.0, -.6], turn: [90, 0, 0], size: [.22, 2.4, .05], bays: 14, rod: .006, finish: 'steel' },
        { type: 'cylinder', at: [0, .5, -1.6], size: [.09, 1, 1], finish: 'aluminium' },
      ] },
      { type: 'truss', at: [9, 0, -13], size: [2.2, 22, 2.2], bays: 16, rod: .05, taper: .55, finish: 'steel' },
    ];
  };
  const PRESETS = {
    wave: { label: 'Golden wave', hint: 'An ocean breaker at sunset',
      p: { sky: 'sunset', sunEl: 6, sunAz: -8, sunPower: 110, clouds: 58, wind: 5, ground: 'ocean', water: '#0a4a40', waves: .55, chop: 70,
        swell: 9, curl: .35, waveDist: 32, waveAngle: -50, fog: 4, dust: 0, eye: 1.4, heading: 0, pitch: 6, travel: 0, lens: 26, focus: 0, dof: 0,
        exposure: 0, bloom: 40, grain: 22, fringe: 18, ao: 0, objects: [] },
      keys: d => ({ curl: [[0, .3, 'sineInOut'], [d, .95]], travel: [[0, 0, 'linear'], [d, 4]], heading: [[0, -2, 'sineInOut'], [d, 4]] }) },
    rig: { label: 'Camera rig in a field', hint: 'Worn metal, haze, dust, shallow focus',
      p: { sky: 'haze', sunEl: 26, sunAz: 120, sunPower: 90, clouds: 20, wind: 3, ground: 'field', groundColor: '#8c6c48', plants: '#b39545', grass: 70, grassH: .85, sway: 3,
        fog: 45, dust: 60, eye: 1.4, heading: -43, pitch: -2, travel: 0, lens: 45, focus: 0, dof: 70, exposure: .1, bloom: 30, grain: 30, fringe: 25, ao: 60, objects: rig() },
      camera: h => ({ dolly: Math.round(h / 2 / (12 / 45) - 135), tilt: 5 }),
      keys: d => ({ heading: [[0, -50, 'sineInOut'], [d, -36]] }) },
    studio: { label: 'Studio', hint: 'A soft-lit floor for your 3D shapes and models',
      p: { sky: 'studio', sunEl: 42, sunAz: 130, sunPower: 100, clouds: 0, wind: 0, ground: 'floor', groundColor: '#4a4c54', fog: 0, dust: 0,
        eye: 1.6, heading: 0, pitch: -6, travel: 0, lens: 50, focus: 0, dof: 25, exposure: .5, bloom: 20, grain: 10, fringe: 8, ao: 50, objects: [] } },
    desert: { label: 'Desert at dusk', hint: 'Dunes, a monolith, the last light',
      p: { sky: 'dusk', sunEl: 4, sunAz: -30, sunPower: 120, clouds: 30, wind: 6, ground: 'desert', groundColor: '#c48a52', fog: 10, dust: 25,
        eye: 1.7, heading: 0, pitch: 3, travel: 0, lens: 32, focus: 0, dof: 0, exposure: .2, bloom: 40, grain: 20, fringe: 12, ao: 0,
        objects: [{ type: 'box', at: [0, 3, -18], size: [1.4, 6, .4], finish: 'concrete', color: '#2a2622' }] },
      keys: d => ({ travel: [[0, 0, 'sineInOut'], [d, 8]] }) },
    night: { label: 'Night sea', hint: 'Moonlight on dark water',
      p: { sky: 'night', sunEl: 14, sunAz: 5, sunPower: 100, clouds: 25, wind: 3, ground: 'ocean', water: '#041a24', waves: .8, chop: 40,
        swell: 0, fog: 3, dust: 0, eye: 2.2, heading: 0, pitch: 3, travel: 0, lens: 35, focus: 0, dof: 0, exposure: .4, bloom: 60, grain: 25, fringe: 10, ao: 0, objects: [] },
      keys: d => ({ heading: [[0, -4, 'sineInOut'], [d, 4]] }) },
  };

  const World = { LETTERBOXES, RENDERS, SKIES, GROUNDS, FIELDS, DEFAULTS, LABELS, COLORS, NUMBERS, GROUPS, STEP, PRESETS, PARTS, FINISHES: Object.keys(FINISHES), FINISH_LOOKS: FINISHES,
    shows, draw, stage, shoot, worldOf, camera, gl, ensureIds, findPart, finish, custom, M, lin, deg, partGeometry, keyed, heading, placeOf, rng, rebuild,
    get renderer() { return renderer; }, get available() { return !!T; }, prepareFrame, bars, worldTime, propCamera, shotAt, partMatrix,
    // bumped when something props are built from finishes loading (a model, a texture), so they are built again
    version: 0, stageHooks: [] };
  return World;
})();
