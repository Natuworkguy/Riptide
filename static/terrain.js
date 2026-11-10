// ---------- a mountain road ----------
// The "Mountain road" ground: a valley with a road winding up it, pine forest on the slopes, and mountains all round
// that rise to rock and snow. The road is asphalt with white edge lines and a dashed centre line, and the land is
// flattened under it. A car or a camera can be put on the road: give it `road` (metres along it, keyed to drive),
// `lane` (metres right of the middle; about 1.8 is the right-hand lane) and, for a camera, `lift` (metres above it).
// The road is the same in every mountain world, so a car keyed along it stays on it whatever else changes; peaks,
// snow, pines and the road's width are the world's settings.
// Units: metres, as for every world, with the ground plane at y 0; drawn in canvas pixels, 100 to the metre.
(() => {
  const T = window.RiptideThree; if (!T || typeof World === 'undefined') return;
  const M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

  // ----- the road: a centre line from behind the start (z +150) up the valley (z -3200) -----
  const Z0 = 150, Z1 = -3200, STEP = 1;
  const roadX = z => 38 * Math.sin(z * .0105) + 16 * Math.sin(z * .027 + 1.3) + 4 * Math.sin(z * .07 + .4);
  const roadY = z => Math.max(0, -z) * .028 + 2.5 * Math.sin(z * .012);
  // samples along it with how far each is from z 0, so a place on it is by distance, not by z
  const line = []; {
    let s = 0, last = null;
    for (let z = Z0; z >= Z1; z -= STEP) { const p = [roadX(z), roadY(z), z]; if (last) s += Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]); line.push({ p, s }); last = p; }
    const s0 = line.find(q => q.p[2] <= 0).s; for (const q of line) q.s -= s0;
  }
  // a place S metres along the road (negative: behind the start), LANE metres to the right; and the way it runs
  function roadAt(s, lane = 0) {
    let lo = 0, hi = line.length - 1;
    if (s <= line[0].s) hi = 1; else if (s >= line[hi].s) lo = hi - 1;
    else while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (line[mid].s <= s) lo = mid; else hi = mid; }
    const a = line[lo], b = line[hi], f = (s - a.s) / ((b.s - a.s) || 1);
    const p = a.p.map((v, i) => v + (b.p[i] - v) * f), dx = b.p[0] - a.p[0], dz = b.p[2] - a.p[2], len = Math.hypot(dx, dz) || 1;
    // right of the way it runs: (-dz, dx) turned to face along it
    const out = [p[0] - dz / len * lane, p[1], p[2] + dx / len * lane];
    out.yaw = Math.atan2(dx, dz); return out;
  }
  World.roadAt = roadAt;
  World.roadLength = line[line.length - 1].s;

  // ----- the land -----
  function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 5) { let s = 0, a = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= .5; f *= 2.03; } return s / n; }
  // ridged: sharp crests where the noise folds, as mountain ridges are
  function ridged(x, y, oct = 6) { let s = 0, a = .5, f = 1, n = 0, w = 1; for (let i = 0; i < oct; i++) { let r = 1 - Math.abs(noise(x * f, y * f) * 2 - 1); r *= r * w; w = clamp(r * 1.6, 0, 1); s += a * r; n += a; a *= .5; f *= 2.1; } return s / n; }
  // how far a place is from the road's middle, across it (near enough: the road mostly runs along z)
  // past either end, the distance to that end, so the valley goes on rather than stopping at a wall
  const roadDist = (x, z) => z > Z0 ? Math.hypot(x - roadX(Z0), z - Z0) : z < Z1 ? Math.hypot(x - roadX(Z1), z - Z1)
    : Math.abs(x - roadX(z)) * Math.cos(Math.atan(Math.abs(Math.cos(z * .0105) * .4 + Math.cos(z * .027 + 1.3) * .43)));
  function height(x, z, o) {
    const half = (+o.road > 0 ? +o.road / 2 : 0) + 1.5, d = roadDist(x, z), zz = clamp(z, Z1, Z0);
    const base = roadY(zz) + (z < Z1 ? (Z1 - z) * .028 : 0);
    // the valley floor: meadow rolling a little, flat where the road is
    const meadow = (fbm(x * .012, z * .012, 4) - .5) * 9 * smooth(half + 1, half + 30, d);
    // foothills: forested slopes rising gently from the valley floor
    const hills = (fbm(x * .0035 + 11, z * .0035, 5) * .8 + .2) * 160 * smooth(half + 25, 650, d);
    // the mountains: ridges and peaks well back from the road, higher the further off they are
    const far = 1 + .6 * smooth(2500, 7000, Math.hypot(x, z + 600));
    const peaks = Math.max(0, +o.peaks || 0) * far;
    // broad massifs where the low noise is high, carved into ridges and gullies by the ridged noise
    const mass = smooth(.32, .72, fbm(x * .00032 + 5.3, z * .00032 - 2.1, 4));
    // turned and warped, so its ridges and gullies do not line up with the noise's own grid
    const wx = x * .8 - z * .6 + (fbm(x * .0015, z * .0015, 3) - .5) * 700, wz = x * .6 + z * .8 + (fbm(x * .0015 + 9, z * .0015, 3) - .5) * 700;
    const detail = ridged(wx * .0011 + 3.1, wz * .0011 - 1.7, 4);
    const rise = smooth(600, 3300, d);
    return base + meadow + hills + peaks * rise * (mass * (.55 + detail * .75) + detail * .18);
  }

  // a grid fine near the road and coarse far off: ±9 km round the valley
  const N = 520, SPAN = 9000, CZ = -500, FINE = .12;
  const spread = u => Math.sign(u) * SPAN * (FINE * Math.abs(u) + (1 - FINE) * Math.abs(u) ** 2);
  function landMesh(o) {
    const g = new T.PlaneGeometry(1, 1, N, N); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const x = spread(p.getX(i) * 2), z = CZ + spread(p.getZ(i) * 2);
      p.setXYZ(i, x * M, height(x, z, o) * M, z * M); }
    g.computeVertexNormals();
    // colours: meadow low down, darker forest floor, rock where it is steep or high, snow above the snow line
    const nrm = g.attributes.normal, top = Math.max(1, +o.peaks || 0), snowAt = top * clamp(+o.snow, 0, 100) / 100;
    const meadow = World.lin(o.groundColor || '#4f6b2f'), dry = World.lin('#8a8a4c'), forest = World.lin('#253a1f'), rock = World.lin('#5f5a54'), rock2 = World.lin('#78736b'), snow = World.lin('#eef2f6'), c = new T.Color(), rk = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / M, y = p.getY(i) / M, z = p.getZ(i) / M, up = nrm.getY(i), alt = y - roadY(clamp(z, Z1, Z0)), n = fbm(x * .02 + y * .03, z * .02 - y * .02, 3);
      c.copy(meadow).lerp(dry, smooth(.5, .75, fbm(x * .013 + 2, z * .013 - 4, 3)) * .55);
      c.lerp(forest, smooth(.45, .62, fbm(x * .006 + 7, z * .006, 3)) * smooth(15, 60, alt) * .85);
      const steep = smooth(.86, .7, up), high = smooth(snowAt * .55, snowAt * .8, alt + (n - .5) * 80);
      c.lerp(rk.copy(rock).lerp(rock2, smooth(.35, .65, n)), clamp(Math.max(steep, high), 0, 1));
      const white = smooth(snowAt - 30, snowAt + 30, alt + (n - .5) * 120) * smooth(.55, .75, up);
      c.lerp(snow, white);
      c.multiplyScalar(.92 + n * .16);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new T.BufferAttribute(cols, 3));
    // the detail of grass and soil, laid by place (a tile every 6 m), not by the grid, which is coarse far off
    const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / M / 14, p.getZ(i) / M / 14);
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0, map: grassTex() });
    // laid from above, the detail would streak down a cliff: it fades out where the ground is steep
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying float vUp;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vUp = objectNormal.y;');
      sh.fragmentShader = 'varying float vUp;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        '#ifdef USE_MAP\n  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n  diffuseColor *= mix( vec4( 1. ), sampledDiffuseColor, smoothstep( .62, .9, vUp ) );\n#endif');
    };
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false; return m;
  }

  // grass and soil up close: tufts light and dark, bare patches, tiling every 6 m
  let grass = null;
  function grassTex() {
    if (grass) return grass;
    const W = 512, cv = document.createElement('canvas'); cv.width = cv.height = W; const g = cv.getContext('2d'), rand = World.rng(23);
    g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 26; i++) { const x = rand() * W, y = rand() * W, r = 30 + rand() * 90, v = 190 + rand() * 60 | 0;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v - 6},.22)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      for (const [dx, dy] of [[0, 0], [W, 0], [-W, 0], [0, W], [0, -W]]) { g.save(); g.translate(dx, dy); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); } }
    for (let i = 0; i < 60000; i++) { const x = rand() * W, y = rand() * W, v = 170 + rand() * 85 | 0, l = 2 + rand() * 6, a = (rand() - .5) * .8;
      g.strokeStyle = `rgba(${v},${v + 4},${v - 10},.55)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l); g.stroke(); }
    grass = new T.CanvasTexture(cv); grass.wrapS = grass.wrapT = T.RepeatWrapping; grass.colorSpace = T.SRGBColorSpace; grass.anisotropy = 8;
    return grass;
  }

  // ----- the road surface: asphalt, white edge lines, a dashed centre line, gravel shoulders -----
  let roadTex = null;
  function asphalt() {
    if (roadTex) return roadTex;
    const W = 256, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const rand = World.rng(19);
    g.fillStyle = '#2e2f31'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) { const v = 30 + rand() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v + 2},.55)`; g.fillRect(rand() * W, rand() * H, 1.5, 1.5); }
    // tyre tracks, a little darker and smoother, in each lane
    for (const x of [.3, .42, .58, .7]) { g.fillStyle = 'rgba(15,15,16,.18)'; g.fillRect(x * W - 9, 0, 18, H); }
    // shoulders of gravel either side
    for (const [a, b] of [[0, .085], [.915, 1]]) { g.fillStyle = '#5c574f'; g.fillRect(a * W, 0, (b - a) * W, H);
      for (let i = 0; i < 3000; i++) { const v = 60 + rand() * 70 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(a * W + rand() * (b - a) * W, rand() * H, 2, 2); } }
    // lines: white at the edges, a dash every 12 m down the middle (the texture is 12 m long)
    g.fillStyle = '#e9e7df'; g.fillRect(.1 * W, 0, .022 * W, H); g.fillRect(.878 * W, 0, .022 * W, H);
    g.fillRect(.489 * W, 0, .022 * W, H * 4 / 12);
    roadTex = new T.CanvasTexture(cv); roadTex.wrapS = T.ClampToEdgeWrapping; roadTex.wrapT = T.RepeatWrapping; roadTex.colorSpace = T.SRGBColorSpace; roadTex.anisotropy = 8;
    return roadTex;
  }
  function roadMesh(o) {
    const w = Math.max(3, +o.road || 7), full = w / .83, pos = [], uv = [], idx = [];
    const from = -200, to = Math.min(World.roadLength, 2800), step = 1.5;
    let i = 0;
    for (let s = from; s <= to; s += step, i++) {
      const l = roadAt(s, -full / 2), r = roadAt(s, full / 2);
      pos.push(l[0] * M, (l[1] + .04) * M, l[2] * M, r[0] * M, (r[1] + .04) * M, r[2] * M);
      uv.push(0, s / 12, 1, s / 12);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mat = new T.MeshStandardMaterial({ map: asphalt(), roughness: .82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; return m;
  }

  // ----- pines: a stepped cone of needles on a trunk, thousands of them, each its own size and green -----
  // tiers of drooping boughs, each a ring of ragged tips, the colour darker in under each tier and towards the trunk
  function pineGeometry() {
    const pos = [], col = [], idx = [], rand = World.rng(5), tiers = 10, around = 14;
    const ring = (r, y, jag) => { const start = pos.length / 3; for (let i = 0; i < around; i++) { const a = i / around * Math.PI * 2 + rand() * .2, rr = r * (1 - jag / 2 + rand() * jag);
      pos.push(Math.cos(a) * rr, y + (rand() - .5) * .02, Math.sin(a) * rr); } return start; };
    const shade = (k, v) => { for (let i = 0; i < around; i++) col.push(v * (.8 + rand() * .4), v * (.85 + rand() * .3), v * (.8 + rand() * .3)); };
    let top = ring(0, 1, 0); shade(top, 1.05);
    for (let t = 0; t < tiers; t++) {
      const f = (t + 1) / tiers, y0 = 1 - f * .9, r = (.06 + f * .42) * (.85 + rand() * .3);
      const outer = ring(r, y0, .5); shade(outer, 1 - f * .18);
      const inner = ring(r * .55, y0 + .045, .25); shade(inner, .7);
      // the tier: from the ring above down to its ragged edge; the next starts inside it
      for (let i = 0; i < around; i++) { const j = (i + 1) % around;
        idx.push(top + i, outer + i, outer + j, top + i, outer + j, top + j); }
      top = inner;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function forest(o) {
    const share = clamp(+o.trees || 0, 0, 100) / 100; if (!share) return null;
    const rand = World.rng(41), half = (+o.road > 0 ? +o.road / 2 : 0) + 4, top = Math.max(1, +o.peaks || 0), treeline = top * clamp(+o.snow, 0, 100) / 100 * .62;
    const near = Math.round(14000 * share), far = Math.round(12000 * share), spots = [];
    const tryAt = (x, z, big) => {
      const d = roadDist(x, z); if (d < half + 18 + rand() * 30) return;
      const y = height(x, z, o), alt = y - roadY(clamp(z, Z1, Z0));
      if (alt > treeline + (rand() - .5) * 60) return;
      const slope = Math.abs(height(x + 3, z, o) - y) + Math.abs(height(x, z + 3, o) - y); if (slope > 4.2) return;
      // in stands, thicker in the forest patches, a few out in the meadow
      const patch = fbm(x * .006 + 7, z * .006, 3); if (rand() > smooth(.38, .6, patch) * .95 + .05 * smooth(half, 40, d)) return;
      const h = ((big ? 16 : 7) + Math.pow(rand(), 1.6) * 18) * (.55 + .45 * smooth(half + 15, 90, d)); spots.push([x, y, z, h, rand()]);
    };
    for (let i = 0; i < near * 3 && spots.length < near; i++) tryAt((rand() - .5) * 900 + roadX(-rand() * 1500), 150 - rand() * 1650, false);
    const n0 = spots.length;
    for (let i = 0; i < far * 3 && spots.length < n0 + far; i++) tryAt((rand() - .5) * 5000, 400 - rand() * 4600, true);
    const foliage = new T.InstancedMesh(pineGeometry(), new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: T.DoubleSide }), spots.length);
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(.025, .04, .12, 6).translate(0, .06, 0), new T.MeshStandardMaterial({ color: '#3b2a1e', roughness: 1 }), spots.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), c = new T.Color(), greens = ['#2a4a2e', '#30502f', '#365a33', '#284430', '#3c5a34'].map(World.lin);
    spots.forEach(([x, y, z, h, r], i) => {
      e.set((r - .5) * .06, r * 6.28, (rand() - .5) * .06); q.setFromEuler(e);
      const wide = h * (.3 + rand() * .12);
      m4.compose(new T.Vector3(x * M, (y - .3) * M, z * M), q, new T.Vector3(wide * M, h * M, wide * M));
      foliage.setMatrixAt(i, m4); trunks.setMatrixAt(i, m4);
      c.copy(greens[(r * greens.length) | 0]).offsetHSL((rand() - .5) * .02, (rand() - .5) * .08, (rand() - .5) * .05); foliage.setColorAt(i, c);
    });
    for (const m of [foliage, trunks]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    // needles do not mirror the sky
    foliage.material.envMapIntensity = .35;
    const group = new T.Group(); group.add(foliage, trunks); return group;
  }

  // ----- each frame: the land, the road and the pines, built when what they are made from changes -----
  World.stageHooks.push(({ B, o, ground }) => {
    const on = o.ground === 'mountains', key = on ? [o.peaks, o.snow, o.groundColor].join('|') : null;
    const land = World.rebuild(B, 'mountainLand', key, () => landMesh(o));
    const road = World.rebuild(B, 'mountainRoad', on && +o.road > 0 ? [o.road, key].join('|') : null, () => roadMesh(o));
    const pines = World.rebuild(B, 'mountainPines', on && +o.trees > 0 ? [o.trees, o.road, key].join('|') : null, () => forest(o));
    for (const m of [land, road, pines]) if (m) m.position.set(0, ground, 0);
    // the sun's shadows reach further here: a car on a road is seen from further off than a prop in a field
    if (on) { const sc = B.sun.shadow.camera; if (sc.right !== 6000) { sc.left = sc.bottom = -6000; sc.right = sc.top = 6000; sc.far = 60000; sc.updateProjectionMatrix(); } }
  });

  // ----- the scene to start from: a car on the road up the valley, filmed from behind and above -----
  World.PRESETS.mountain = { label: 'Mountain road', hint: 'A car up a winding road through pines, under snowy peaks',
    p: { sky: 'day', sunEl: 28, sunAz: 58, sunPower: 105, clouds: 28, wind: 3, ground: 'mountains', groundColor: '#58723a',
      peaks: 1000, snow: 66, trees: 75, road: 7, fog: .6, dust: 0, eye: 1.7, heading: 0, pitch: 0, travel: 0, lens: 35, focus: 0, dof: 0,
      exposure: 0, bloom: 25, grain: 12, fringe: 6, ao: 0, godrays: 0, flare: 0, letterbox: '2.39' },
    objects: d => [
      { id: 'car', name: 'Car', type: 'car', color: '#a3101a', finish: 'paint', face: 'travel', lane: 1.8, road: 40,
        keys: { road: [{ t: 0, v: 40, ease: 'linear' }, { t: d, v: 40 + 22 * d }] } },
      // where the camera looks: up the road, ahead of the car (a marker, not drawn)
      { id: 'ahead', name: 'Looking at', type: 'group', hidden: true, lane: 0, lift: 9, road: 150,
        keys: { road: [{ t: 0, v: 150, ease: 'linear' }, { t: d, v: 150 + 22 * d }] } },
      // a drone behind and above the car
      { id: 'chase', name: 'Chase camera', type: 'camera', lens: 22, shake: 8, lookAt: 'ahead', lane: -1, lift: 5.5, road: 18,
        keys: { road: [{ t: 0, v: 18, ease: 'linear' }, { t: d, v: 18 + 22 * d }] } },
    ] };
})();
