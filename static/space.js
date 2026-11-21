// ---------- space: a planet, orbits and what moves on them ----------
// Props for a world layer that explains things in space, as a data explainer does: a globe (its night side, city
// lights, a thin atmosphere at its rim, a pin with a name), orbits drawn as fine glowing lines with satellites
// moving along them and tags that follow them, the spheres of how far a signal reaches, see-through and meeting
// where a fix is, and stars all round. Put them in a world with sky "space" and ground "none".
//   {type: "globe", size: [2.4, 2.4, 2.4], spin: [0, 6, 0], pin: {lat: 40.7, lon: -74, label: "New York"}}
//   {type: "orbit", radius: 3, tilt: 55, turn: [0, 30, 0], color: "#9fb4ff", count: 2, period: 24, labels: ["PRN 9", "PRN 26"]}
//   {type: "reach", size: [3, 3, 3], at: [...], color: "#e86a5c"}     (key its scale to grow it)
//   {type: "stars", amount: 1500}
(() => {
  const T = window.RiptideThree, M = World.M, deg = v => v * Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cache = new Map();
  const once = (key, make) => cache.has(key) ? cache.get(key) : (cache.set(key, make()), cache.get(key));

  // ----- the globe: oceans and land from noise, city lights on the land, a grid of latitude and longitude -----
  function earthTextures(seed) {
    return once(`earth|${seed}`, () => {
      const W = 1024, H = 512, rnd = World.rng(seed), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const lights = document.createElement('canvas'); lights.width = W; lights.height = H;
      const g = cv.getContext('2d'), gl = lights.getContext('2d'), img = g.createImageData(W, H), li = gl.createImageData(W, H);
      // value noise on the sphere, so land wraps round without a seam
      const grid = Array.from({ length: 64 * 32 }, () => rnd());
      const val = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = f => f * f * (3 - 2 * f);
        const at = (a, b) => grid[((b % 32 + 32) % 32) * 64 + ((a % 64 + 64) % 64)];
        const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * s(fx), bot = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * s(fx);
        return top + (bot - top) * s(fy); };
      const fbm = (x, y) => val(x, y) * .55 + val(x * 2.1, y * 2.1) * .28 + val(x * 4.3, y * 4.3) * .17;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x / W * 8, v = y / H * 4, lat = Math.abs(y / H - .5) * 2, n = fbm(u, v), land = n > .53 && lat < .86;
        const i = (y * W + x) * 4, shore = clamp((n - .5) * 14, 0, 1);
        // night side colours: deep blue sea, slate land
        const sea = [8, 20, 44], earth = [30, 38, 50];
        const c = land ? earth : sea.map((s, k) => s + (earth[k] - s) * shore * .35);
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
        // cities: specks of warm light on the land, thicker inland where noise peaks
        const towns = val(u * 3.3 + 17, v * 3.3 + 5), city = land && towns > .6 && rnd() < (towns - .6) * .5 + (n - .53) * .25 ? 1 : 0;
        li.data[i] = 255 * city; li.data[i + 1] = 196 * city; li.data[i + 2] = 120 * city; li.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0); gl.putImageData(li, 0, 0);
      // a faint graticule: every 30 degrees
      g.strokeStyle = 'rgba(140, 170, 220, .10)'; g.lineWidth = 1;
      for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(0, H * k / 6); g.lineTo(W, H * k / 6); g.stroke(); }
      for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(W * k / 12, 0); g.lineTo(W * k / 12, H); g.stroke(); }
      const map = new T.CanvasTexture(cv), glow = new T.CanvasTexture(lights);
      map.colorSpace = glow.colorSpace = T.SRGBColorSpace; map.anisotropy = glow.anisotropy = 8;
      return { map, glow };
    });
  }
  const rim = color => once(`rim|${color}`, () => new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.BackSide,
    uniforms: { uCol: { value: World.lin(color) } },
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    // seen from outside, only its far side shows past the planet's edge: brightest against the planet, gone at its own edge
    fragmentShader: 'uniform vec3 uCol; varying vec3 vN, vV; void main() { float f = pow(abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(uCol * f * .9, 1.); }' }));

  // a tag: a little rounded box with a name in it, always facing the camera, its height in metres. Its corner sits on
  // the point it names, joined to it by a short dashed line drawn in the same picture, so the line stays the same on
  // screen however the thing it names turns.
  function tagSprite(text, color, h = .16) {
    const key = `tag|${text}|${color}`;
    const mat = once(key, () => {
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), fs = 40, L = 70, bh = 68;
      const font = `500 ${fs}px "JetBrains Mono", "XN One", ui-monospace, Menlo, monospace`;
      g.font = font; const bw = Math.ceil(g.measureText(text).width) + 36; cv.width = L + bw + 4; cv.height = L + bh + 4;
      g.font = font; g.strokeStyle = color; g.globalAlpha = .85; g.lineWidth = 3; g.setLineDash([9, 7]);
      g.beginPath(); g.moveTo(2, cv.height - 2); g.lineTo(L, bh + 2); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      g.fillStyle = 'rgba(8, 10, 16, .78)'; g.lineWidth = 2.5;
      g.beginPath(); g.roundRect(L, 2, bw, bh, 10); g.fill(); g.stroke();
      g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, L + 18, 2 + bh / 2 + 2);
      const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
      const m = new T.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true }); m.userData.aspect = cv.width / cv.height; m.userData.k = cv.height / bh; return m;
    });
    const s = new T.Sprite(mat), H = h * mat.userData.k; s.center.set(0, 0); s.scale.set(H * mat.userData.aspect * M, H * M, 1); s.renderOrder = 10; return s;
  }
  const dotTex = () => once('dot', () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new T.CanvasTexture(cv); return t; });
  function glowDot(color, size) {
    const s = new T.Sprite(once(`dot|${color}`, () => new T.SpriteMaterial({ map: dotTex(), color: World.lin(color), blending: T.AdditiveBlending, depthWrite: false, transparent: true })));
    s.scale.setScalar(size * M); return s;
  }

  World.custom.globe = (P, t = 0) => {
    const g = new T.Group(), d = (+(P.size || [2.4])[0] || 2.4), r = d / 2, { map, glow } = earthTextures(+P.seed || 11);
    const mat = once(`globe|${P.seed || 11}`, () => new T.MeshStandardMaterial({ map, emissive: new T.Color(1, 1, 1), emissiveMap: glow, emissiveIntensity: 1.4, roughness: .85, metalness: 0 }));
    const ball = new T.Mesh(once('globe-geo', () => new T.SphereGeometry(1, 96, 48)), mat); ball.scale.setScalar(r * M); g.add(ball);
    const air = new T.Mesh(once('globe-geo', () => new T.SphereGeometry(1, 96, 48)), rim(P.atmosphere || '#5a8cff')); air.scale.setScalar(r * 1.16 * M); air.userData.noShadow = true; g.add(air);
    // a pin: a glowing point on the surface at its latitude and longitude, and its name beside it
    const pin = P.pin;
    if (pin && typeof pin === 'object') {
      const la = deg(+pin.lat || 0), lo = deg(+pin.lon || 0), v = new T.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
      const dot = glowDot(pin.color || '#ffffff', .09); dot.position.copy(v.clone().multiplyScalar(r * 1.01 * M)); g.add(dot);
      if (pin.label) { const tag = tagSprite(String(pin.label).slice(0, 40), pin.color || '#ffffff', .2);
        tag.position.copy(dot.position); g.add(tag); }
    }
    return g;
  };

  // ----- an orbit: a fine line round a centre, satellites moving along it, each with its tag -----
  function orbitLine(radius, ecc, color, opacity) {
    return once(`orbit|${radius}|${ecc}|${color}|${opacity}`, () => {
      const pts = [], b = radius * Math.sqrt(1 - ecc * ecc);
      for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * radius * M - ecc * radius * M, 0, Math.sin(a) * b * M)); }
      const geo = new T.BufferGeometry().setFromPoints(pts);
      return { geo, mat: new T.LineBasicMaterial({ color: World.lin(color), transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }) };
    });
  }
  World.custom.orbit = (P, t = 0) => {
    const g = new T.Group(), radius = clamp(+P.radius || 3, .1, 500), ecc = clamp(+P.ecc || 0, 0, .9), color = P.color || '#9fb4ff';
    const op = clamp(P.opacity != null ? +P.opacity / (P.opacity > 1 ? 100 : 1) : .42, 0, 1);
    // how much of it is drawn (0..1, key it to draw the orbit on)
    const drawn = clamp(+World.keyed(P, 'draw', t, P.draw ?? 1), 0, 1);
    const { geo, mat } = orbitLine(radius, ecc, color, op);
    const line = new T.Line(geo, mat); line.geometry.setDrawRange(0, Math.max(2, Math.round(257 * drawn))); g.add(line);
    // a second, wider and fainter line under it: the glow a fine line has on screen
    const halo = new T.Line(geo, once(`orbit-halo|${color}|${op}`, () => new T.LineBasicMaterial({ color: World.lin(color), transparent: true, opacity: op * .25, blending: T.AdditiveBlending, depthWrite: false })));
    halo.scale.setScalar(1.004); halo.geometry.setDrawRange(0, Math.max(2, Math.round(257 * drawn))); g.add(halo);
    g.rotation.x = deg(+P.tilt || 0);
    const n = clamp(Math.round(+P.count || 0), 0, 12), period = Math.max(.5, +P.period || 24), b = radius * Math.sqrt(1 - ecc * ecc);
    const labels = Array.isArray(P.labels) ? P.labels : [];
    for (let k = 0; k < n; k++) {
      const a = (t / period + k / n + (+P.phase || 0) / 360) * Math.PI * 2;
      const pos = new T.Vector3((Math.cos(a) * radius - ecc * radius) * M, 0, Math.sin(a) * b * M);
      const sat = glowDot(P.satellite || '#ffffff', clamp(+P.dot || .12, .02, 1)); sat.position.copy(pos); g.add(sat);
      if (labels[k]) { const tag = tagSprite(String(labels[k]).slice(0, 24), P.tag || color, +P.tagSize || .2); tag.position.copy(pos); g.add(tag); }
    }
    return g;
  };

  // ----- the reach of a signal: a see-through sphere, bright at its edge, faint inside -----
  World.custom.reach = (P) => {
    const color = P.color || '#e86a5c', d = (+(P.size || [3])[0] || 3);
    const mat = once(`reach|${color}|${P.strength || 1}`, () => new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      uniforms: { uCol: { value: World.lin(color) }, uK: { value: clamp(+P.strength || 1, .1, 4) } },
      vertexShader: 'varying vec3 vN, vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying vec3 vN, vV; void main() { float f = 1. - abs(dot(vN, vV)); gl_FragColor = vec4(uCol * (.018 + pow(f, 3.) * .5) * uK, 1.); }' }));
    const s = new T.Mesh(once('reach-geo', () => new T.SphereGeometry(1, 64, 32)), mat); s.scale.setScalar(d / 2 * M); s.userData.noShadow = true; return s;
  };

  // ----- stars all round, not only above a horizon -----
  World.custom.stars = (P) => once(`stars|${P.amount || 1500}|${P.seed || 5}`, () => {
    const n = clamp(Math.round(+P.amount || 1500), 50, 8000), rnd = World.rng(+P.seed || 5), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 400 * M;
      pos.set([Math.cos(a) * s * R, u * R, Math.sin(a) * s * R], i * 3);
      const b = .25 + Math.pow(rnd(), 3) * .75, warm = rnd(); col.set([b * (warm > .8 ? 1 : .85), b * .9, b * (warm < .2 ? 1 : .9)], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    return new T.Points(g, new T.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  }).clone();
})();
