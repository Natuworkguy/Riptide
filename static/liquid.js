// ---------- liquid on the ground: water, mud or lava running over a world's land ----------
// Any world with land under it (desert, field, mountain road or studio floor) can have liquid in it: poured from above, welling up from a spring, rushing in as a flood from the
// far side, or falling as rain. It is simulated, not drawn: on a patch of ground 64 m across, round where it comes from,
// the liquid runs downhill as shallow water does (each cell pushes on its neighbours by how much higher it stands),
// pools in the hollows, and spills over. And the sand answers it:
//   - fast water picks sand up and carries it, carving channels and gullies; where it slows it drops it again, in fans
//   - the banks it undercuts slump in, as dry sand does past its angle of rest (wet sand stands steeper)
//   - water soaks in, and the sand it has touched turns dark and glossy, drying only slowly
//   - mud carries more and drops more, building fans; lava does not carve, it scorches, crusts over and sets to rock
//     that the next lava has to flow round
// How much the ground gives depends on what it is: desert sand carves and soaks most, a field's soil less, a
// mountain meadow's turf a little, and a studio floor not at all (the liquid only runs and spreads over it).
// Props standing in it (the monolith) are walls the liquid flows round. Everything follows world time alone: the
// patch is stepped from the start, 60 steps a second, and kept every two seconds, so any frame (a scrub back, an
// export on the server) comes out the same however it is reached.
const Liquid = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const N = 160, SIZE = 64, CELL = SIZE / N, AREA = CELL * CELL, DT = 1 / 60, SNAP = 120, G = 9.81;
  const KINDS = {
    water: { damp: .35, carry: 1, drop: .35, soak: .0006, sediment: 0, deep: '#0d3a3c', shallow: '#4f7f78', foam: '#e9efe9' },
    mud: { damp: 1.4, carry: .7, drop: 1.2, soak: .0003, sediment: .015, deep: '#3f2a18', shallow: '#7a5a3a', foam: '#a68866' },
    lava: { damp: 2.5, carry: 0, drop: 0, soak: 0, sediment: 0, deep: '#1a0f0c', shallow: '#2a1a14', foam: '#2a1a14' },
  };
  // what the ground is: how easily it is carved (and so slumps), how fast it drinks, how much the patch is shaped
  // to give the liquid somewhere to go, and the picture its surface is drawn with
  const SURFACES = {
    desert: { carve: 1, soak: 1, relief: 1, tex: 'sand' },
    field: { carve: .6, soak: .7, relief: .6, tex: 'soil' },
    mountains: { carve: .35, soak: .5, relief: 0, tex: 'grass' },
    floor: { carve: 0, soak: 0, relief: 0, tex: null },
  };
  // how much comes in at 100 %: cubic metres a second (a pour, a spring, a flood), or metres of rain a second
  const RATE = { pour: .35, spring: .3, flood: 5, rain: .0025 };

  // ----- the sand: the desert's own dunes (as its coarse ground draws them), and the patch's own shape -----
  const ph = (() => { const r = World.rng(11); return [r() * 9, r() * 9, r() * 9]; })();
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const duneAt = (x, z) => (Math.sin(x * .021 + ph[0] + Math.sin(z * .013) * 2) * 6 + Math.sin(z * .037 + ph[1] + x * .01) * 3
    + Math.sin((x + z) * .09 + ph[2]) * .8) * smooth(Math.hypot(x, z), 25, 140);
  // the desert ground is a grid 20 m apart, drawn in triangles: the patch meets it exactly as it is drawn
  function landAt(x, z) {
    const gx = (x + 4000) / 20, gz = (z + 4000) / 20, ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const at = (i, j) => duneAt(i * 20 - 4000, j * 20 - 4000);
    const a = at(ix, iz), b = at(ix, iz + 1), c = at(ix + 1, iz + 1), d = at(ix + 1, iz);
    return u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c);
  }
  // small seeded bumps, so the liquid finds its own way rather than running straight
  function bumps(x, z) {
    let s = 0, a = .22, f = .11;
    for (let i = 0; i < 4; i++) { s += a * Math.sin(x * f + i * 1.7 + Math.sin(z * f * .7 + i) * 1.3) * Math.cos(z * f * 1.13 - i * 2.1 + Math.sin(x * f * .5) * .9); a *= .5; f *= 2.03; }
    return s;
  }

  // ----- the patch: where it is, its cells, and the walls the props make -----
  function setup(o) {
    const surf = SURFACES[o.ground] || SURFACES.desert;
    const land = o.ground === 'desert' ? landAt : o.ground === 'mountains' && World.heights?.mountains ? (x, z) => World.heights.mountains(x, z, o) : () => 0;
    const sx = num(o.liquidX, 6), sz = num(o.liquidZ, -10), X0 = sx - SIZE / 2, Z0 = sz - 22;
    const n = N * N, base = new Float32Array(n), wall = new Uint8Array(n), edge = new Float32Array(n);
    // the props standing on the ground: a box, a cylinder or a sphere is a wall where it stands
    const feet = [];
    for (const P of Array.isArray(o.objects) ? o.objects : []) {
      if (!P || !['box', 'cylinder', 'sphere', 'cone', 'structure'].includes(P.type) || !Array.isArray(P.at)) continue;
      const size = Array.isArray(P.size) ? P.size : [1, 1, 1], low = (+P.at[1] || 0) - (+size[1] || 1) / 2;
      if (low > .6) continue;      // up off the ground
      const turn = deg(+(P.turn?.[1]) || 0);
      feet.push({ x: +P.at[0] || 0, z: +P.at[2] || 0, hx: Math.max(.1, (+size[0] || 1) / 2), hz: Math.max(.1, (+size[P.type === 'cylinder' || P.type === 'sphere' ? 0 : 2] || 1) / 2),
        c: Math.cos(turn), s: Math.sin(turn), round: P.type === 'cylinder' || P.type === 'sphere' || P.type === 'cone' });
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = i + j * N, x = X0 + (i + .5) * CELL, z = Z0 + (j + .5) * CELL;
      // fades to the desert's own ground at the patch's sides, so the two meet with no seam
      const fade = smooth(Math.min(i, j, N - 1 - i, N - 1 - j) * CELL, 1, 9);
      // the patch's shape: falling gently away from where the liquid comes, towards the camera, with a hollow to
      // fill on the way and bumps to find a way round
      const dz = z - sz, dx = x - sx;
      let clear = 1;
      for (const F of feet) { const d2 = (x - F.x) ** 2 + (z - F.z) ** 2; clear = Math.min(clear, 1 - Math.exp(-d2 / 9)); }
      // (the fall towards the camera is kept round them, so nothing pools at their feet unless the ground says so)
      const fall = -.07 * dz + .09 * Math.abs(dx) / (1 + Math.abs(dx) * .08);
      const shape = 1.1 * Math.exp(-(dx * dx) / 160 - (dz + 4) ** 2 / 90) - .9 * Math.exp(-((dx + 3) ** 2 + (dz - 11) ** 2) / 26) + bumps(x, z) * .6;
      // round a prop the sand may drift up against it, never fall away from under it
      const sh = fall + shape;
      base[k] = land(x, z) + (sh * clear + Math.max(0, sh) * (1 - clear)) * fade * surf.relief;
      edge[k] = fade;
      for (const F of feet) {
        const lx = (x - F.x) * F.c - (z - F.z) * F.s, lz = (x - F.x) * F.s + (z - F.z) * F.c;
        if (F.round ? (lx / F.hx) ** 2 + (lz / F.hz) ** 2 <= 1 : Math.abs(lx) <= F.hx && Math.abs(lz) <= F.hz) wall[k] = 1;
      }
    }
    return { sx, sz, X0, Z0, base, wall, edge, surf };
  }
  const num = (v, d) => (v === '' || v == null || !isFinite(+v) ? d : +v);
  const deg = v => v * Math.PI / 180;

  // ----- the state: everything that changes, step by step -----
  const FIELDS = ['d', 'fl', 'fr', 'fb', 'ft', 'vx', 'vz', 'sed', 'dug', 'wet', 'heat', 'rock'];
  function fresh() { const s = {}; for (const f of FIELDS) s[f] = new Float32Array(N * N); return s; }
  const copy = s => { const c = {}; for (const f of FIELDS) c[f] = s[f].slice(); return c; };

  // one step of DT seconds
  function step(sim, rate) {
    const { geo, kind, from, erosion } = sim, K = KINDS[kind] || KINDS.water, s = sim.s;
    const { d, fl, fr, fb, ft, vx, vz, sed, dug, wet, heat, rock } = s, { base, wall, edge } = geo;
    const n = N * N, lava = kind === 'lava', surf = geo.surf;
    // the ground under the liquid as it stands now: the sand, what was carved or dropped, and set rock
    const ground = sim.tmp || (sim.tmp = new Float32Array(n)), next = sim.tmp2 || (sim.tmp2 = new Float32Array(n)), next2 = sim.tmp3 || (sim.tmp3 = new Float32Array(n));
    for (let k = 0; k < n; k++) ground[k] = base[k] + dug[k] + rock[k];
    // what comes in
    if (rate > 0) {
      const add = (k, vol) => { if (wall[k]) return; const old = d[k]; d[k] += vol / AREA;
        if (lava) heat[k] = (heat[k] * old + vol / AREA) / d[k]; else if (K.sediment) sed[k] += K.sediment * vol / AREA; };
      if (from === 'rain') { const h = RATE.rain * rate * DT * AREA; for (let k = 0; k < n; k++) if (edge[k] > .5) add(k, h); }
      else if (from === 'flood') {
        // a wall of water coming over the far dunes, across the width round where it is aimed
        // (in from past where the patch blends into the ground round it, which falls away at its edge)
        const q = RATE.flood * rate * DT, ci = Math.round((geo.sx - geo.X0) / CELL), w = Math.round(12 / CELL), rows = 3, j0 = Math.round(10 / CELL);
        for (let j = j0; j < j0 + rows; j++) for (let i = Math.max(1, ci - w); i <= Math.min(N - 2, ci + w); i++) add(i + j * N, q / ((2 * w + 1) * rows));
      } else {
        // a pour lands in a small splash; a spring wells up over a wider patch
        const r = from === 'spring' ? 1.1 : .55, q = RATE[from === 'spring' ? 'spring' : 'pour'] * rate * DT;
        const ci = (geo.sx - geo.X0) / CELL - .5, cj = (geo.sz - geo.Z0) / CELL - .5, rc = Math.ceil(r / CELL), cells = [];
        for (let j = Math.floor(cj) - rc; j <= Math.ceil(cj) + rc; j++) for (let i = Math.floor(ci) - rc; i <= Math.ceil(ci) + rc; i++) {
          if (i < 1 || j < 1 || i > N - 2 || j > N - 2) continue; const dd = Math.hypot(i - ci, j - cj) * CELL;
          if (dd <= r) cells.push([i + j * N, 1 - dd / r * .6]); }
        const sum = cells.reduce((a, c) => a + c[1], 0) || 1; for (const [k, w] of cells) add(k, q * w / sum);
      }
    }
    // each cell pushes on its neighbours by how much higher its surface stands (the pipe model); friction holds it
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = i + j * N;
      if (wall[k] || d[k] <= 0) { fl[k] = fr[k] = fb[k] = ft[k] = 0; continue; }
      // thick, cooling lava barely moves; water runs freely
      const damp = Math.exp(-DT * (lava ? K.damp + 40 * (1 - heat[k]) ** 2 : K.damp + .002 / Math.max(d[k], .002)));
      const h = ground[k] + d[k], push = DT * G * CELL;
      const H = (ii, jj) => { if (ii < 0 || jj < 0 || ii >= N || jj >= N) return ground[k]; const kk = ii + jj * N; return wall[kk] ? Infinity : ground[kk] + d[kk]; };
      let a = Math.max(0, fl[k] * damp + push * (h - H(i - 1, j))), b = Math.max(0, fr[k] * damp + push * (h - H(i + 1, j)));
      let c = Math.max(0, fb[k] * damp + push * (h - H(i, j - 1))), e = Math.max(0, ft[k] * damp + push * (h - H(i, j + 1)));
      if (!isFinite(a)) a = 0; if (!isFinite(b)) b = 0; if (!isFinite(c)) c = 0; if (!isFinite(e)) e = 0;
      const out = (a + b + c + e) * DT, scale = out > 0 ? Math.min(1, d[k] * AREA / out) : 1;
      fl[k] = a * scale; fr[k] = b * scale; fb[k] = c * scale; ft[k] = e * scale;
    }
    // depths and speeds from what flowed
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = i + j * N; if (wall[k]) continue;
      const inL = i > 0 ? fr[k - 1] : 0, inR = i < N - 1 ? fl[k + 1] : 0, inB = j > 0 ? ft[k - N] : 0, inT = j < N - 1 ? fb[k + N] : 0;
      const before = d[k], after = Math.max(0, before + DT * (inL + inR + inB + inT - fl[k] - fr[k] - fb[k] - ft[k]) / AREA);
      d[k] = after; const mean = (before + after) / 2;
      if (mean > 1e-4) { vx[k] = clamp((inL - fl[k] + fr[k] - inR) / 2 / (CELL * mean), -7, 7); vz[k] = clamp((inB - fb[k] + ft[k] - inT) / 2 / (CELL * mean), -7, 7); }
      else vx[k] = vz[k] = 0;
    }
    // the sand answers: fast water picks it up, slow water drops it
    if (!lava && erosion > 0 && surf.carve > 0) {
      const dig = erosion / 100 * surf.carve;
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = i + j * N; if (wall[k] || d[k] < .002) { if (sed[k] > 0 && d[k] < .002) { dug[k] += sed[k]; sed[k] = 0; } continue; }
        const gx = (ground[k + 1] - ground[k - 1]) / (2 * CELL), gz = (ground[k + N] - ground[k - N]) / (2 * CELL), g2 = gx * gx + gz * gz;
        const tilt = Math.max(.06, Math.sqrt(g2 / (1 + g2))), speed = Math.hypot(vx[k], vz[k]);
        const hold = .05 * dig * K.carry * tilt * speed * Math.min(1, d[k] / .03) * edge[k];
        if (sed[k] < hold) { const take = Math.min(.9 * dig * (hold - sed[k]) * DT * 60 * .05, dug[k] + 1.6); dug[k] -= take; sed[k] += take; }
        else { const drop = Math.min(sed[k], (K.drop + .3) * (sed[k] - hold) * DT * 3); dug[k] += drop; sed[k] -= drop; }
      }
    }
    // what the liquid carries goes where it goes (sand, and the heat of lava), traced back along its flow
    if (!lava ? erosion > 0 && surf.carve > 0 : true) {
      const carried = lava ? heat : sed;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = i + j * N; if (d[k] <= 1e-4) { next[k] = lava ? 0 : carried[k]; continue; }
        const x = clamp(i - vx[k] * DT / CELL, 0, N - 1.001), z = clamp(j - vz[k] * DT / CELL, 0, N - 1.001), x0 = x | 0, z0 = z | 0, u = x - x0, v = z - z0, kk = x0 + z0 * N;
        next[k] = (carried[kk] * (1 - u) + carried[kk + 1] * u) * (1 - v) + (carried[kk + N] * (1 - u) + carried[kk + N + 1] * u) * v;
      }
      carried.set(next);
    }
    // water soaks into the sand, darkening it; lava cools from its skin and sets to rock, scorching what it lies on
    for (let k = 0; k < n; k++) {
      if (wall[k]) continue;
      if (lava) {
        if (d[k] > 1e-4) { heat[k] = Math.max(0, heat[k] - DT * (.035 + .25 * Math.min(1, .03 / d[k]))); wet[k] = Math.min(1, wet[k] + DT * 1.5);
          if (heat[k] < .22) { const set = Math.min(d[k], d[k] * DT * 1.2 + .0005 * DT); rock[k] += set; d[k] -= set; } }
        else heat[k] = 0;
      } else {
        const soak = Math.min(d[k], K.soak * surf.soak * DT * (1 - wet[k] * .5));
        if (d[k] > .001) wet[k] = Math.min(1, wet[k] + DT * 1.2);
        d[k] -= soak; if (d[k] < 1e-5) d[k] = 0;
        wet[k] = Math.max(0, wet[k] - DT * .0025);
      }
    }
    // the wet edge creeps a little into the dry sand beside it
    if (sim.step % 6 === 0) {
      next2.set(wet);
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = i + j * N;
        const m = Math.max(wet[k - 1], wet[k + 1], wet[k - N], wet[k + N]) * (lava ? .5 : .8); if (m > next2[k]) next2[k] += (m - next2[k]) * .06; }
      wet.set(next2);
    }
    // banks slump: sand stands no steeper than its angle of rest, which is steeper when damp, gentler under water
    if (sim.step % 3 === 0 && surf.carve > 0) {
      for (let k = 0; k < n; k++) ground[k] = base[k] + dug[k] + rock[k];
      for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
        const k = i + j * N; if (wall[k]) continue;
        for (const kk of [k + 1, k + N]) {
          if (wall[kk]) continue;
          const diff = ground[k] - ground[kk], under = d[k] > .01 || d[kk] > .01, rest = (under ? .32 : wet[k] > .3 ? .95 : .66) * CELL;
          if (Math.abs(diff) <= rest) continue;
          const hi = diff > 0 ? k : kk, lo = diff > 0 ? kk : k, move = (Math.abs(diff) - rest) * .4;
          // set rock does not slump
          const loose = Math.min(move, Math.max(0, base[hi] + dug[hi] - (base[lo] + dug[lo] + rock[lo]) + rock[hi] < 0 ? 0 : move));
          dug[hi] -= loose; dug[lo] += loose; ground[hi] -= loose; ground[lo] += loose;
        }
      }
    }
    sim.step++;
  }

  // ----- the run for a world layer: stepped to the time asked, kept every two seconds -----
  const runs = new Map();
  const rateAt = (L, o, t) => clamp((L?.keys?.liquid?.length && typeof val === 'function' ? +val(L, 'liquid', t) : +o.liquid) || 0, 0, 400) / 100;
  function simulate(L, o, t) {
    const geo0 = { kind: KINDS[o.liquidKind] ? o.liquidKind : 'water', from: RATE[o.liquidFrom] ? o.liquidFrom : 'pour', erosion: clamp(num(o.erosion, 60), 0, 300) };
    const key = JSON.stringify([geo0, o.ground, o.ground === 'mountains' ? [o.peaks, o.road] : 0, num(o.liquidX, 6), num(o.liquidZ, -10), o.liquid, L?.keys?.liquid || null,
      (o.objects || []).filter(P => P && P.at && ['box', 'cylinder', 'sphere', 'cone', 'structure'].includes(P.type)).map(P => [P.type, P.at, P.size, P.turn])]);
    let sim = runs.get(L.id);
    if (!sim || sim.key !== key) { sim = { key, ...geo0, geo: setup(o), s: fresh(), step: 0, snaps: [], version: 0 }; runs.set(L.id, sim); }
    const want = Math.max(0, Math.floor(t / DT + 1e-6));
    if (want < sim.step) {
      let best = null; for (const sn of sim.snaps) if (sn.step <= want && (!best || sn.step > best.step)) best = sn;
      sim.s = best ? copy(best.s) : fresh(); sim.step = best ? best.step : 0;
    }
    const was = sim.step;
    while (sim.step < want) {
      step(sim, rateAt(L, o, sim.step * DT));
      if (sim.step % SNAP === 0 && !sim.snaps.some(sn => sn.step === sim.step)) {
        sim.snaps.push({ step: sim.step, s: copy(sim.s) });
        // a long video keeps every other one beyond 40
        if (sim.snaps.length > 40) sim.snaps = sim.snaps.filter((sn, i) => i % 2 === 0 || i === sim.snaps.length - 1);
      }
    }
    if (sim.step !== was || !sim.drawn) sim.version++;
    return sim;
  }

  // ----- drawing it -----
  function patchGeometry() {
    const g = new T.PlaneGeometry((SIZE - CELL) * M, (SIZE - CELL) * M, N - 1, N - 1); g.rotateX(-Math.PI / 2); return g;
  }
  // the sand of the patch: the desert's own sand, lined up with it, darkened where wet and scorched where lava lay
  function sandMesh(o, geo) {
    const g = patchGeometry(), n = N * N;
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('aWet', new T.BufferAttribute(new Float32Array(n), 1));
    // its picture laid by place, as the ground round it lays it, so the two line up: a tile every 8/3 m for sand
    // and soil, every 14 m for a mountain meadow's grass
    const grass = geo.surf.tex === 'grass', tile = grass ? 14 : 8000 / 3000, pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / M + geo.X0 + SIZE / 2, z = pos.getZ(i) / M + geo.Z0 + SIZE / 2; uv.setXY(i, x / tile, grass ? z / tile : -z / tile); }
    const own = t => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(1, 1); c.offset.set(0, 0); return c; };
    const soil = o.ground === 'field' ? '#' + World.lin(o.groundColor).lerp(World.lin(o.plants || '#c09a48'), .45).getHexString(T.SRGBColorSpace) : o.groundColor;
    const look = grass ? { map: World.grassTex() } : { map: own(World.tex(geo.surf.tex, 3000, true)), bumpMap: own(World.tex(geo.surf.tex, 3000)), bumpScale: 1.2 };
    const mat = new T.MeshStandardMaterial({ color: World.lin(grass ? o.groundColor || '#4f6b2f' : soil), roughness: .95, metalness: 0, vertexColors: true,
      ...look, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    // wet sand is glossy
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float aWet; varying float vWet;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWet = aWet;');
      sh.fragmentShader = 'varying float vWet;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= mix(1., .32, vWet);');
    };
    mat.customProgramCacheKey = () => 'liquid-sand';
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; m.position.set(geo.X0 * M + SIZE * M / 2, 0, geo.Z0 * M + SIZE * M / 2);
    return m;
  }
  // the liquid's surface: clear in the shallows, coloured with depth, white where it runs fast; lava glows
  function liquidMesh(geo, kind) {
    const g = patchGeometry(), n = N * N;
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 4), 4));
    g.setAttribute('aGlow', new T.BufferAttribute(new Float32Array(n), 1));
    // mud is dull and lava duller; water is a mirror
    const mat = new T.MeshPhysicalMaterial({ vertexColors: true, transparent: true, alphaTest: .02, roughness: kind === 'mud' ? .32 : kind === 'lava' ? .7 : .06, metalness: 0, ior: 1.33,
      specularIntensity: kind === 'water' ? 1 : .45, envMapIntensity: kind === 'water' ? 1.2 : .5 });
    const u = { uTime: { value: 0 } };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = u.uTime;
      sh.vertexShader = 'attribute float aGlow; varying float vGlow; varying vec3 vLP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = aGlow; vLP = (modelMatrix * vec4(position, 1.)).xyz / 100.;');
      sh.fragmentShader = `uniform float uTime; varying float vGlow; varying vec3 vLP;
        float lh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + 1.), f.x), f.y); }\n`
        + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          if (vGlow > 0.) {
            // molten lava under a skin that cracks: bright in the cracks, dull red-black on the plates
            float c = ln(vLP.xz * 1.6 + vec2(uTime * .05, 0.)) * .6 + ln(vLP.xz * 4.1 - uTime * .08) * .4;
            float crack = smoothstep(.42, .5, abs(c - .5) < .06 ? 1. : 0.) ;
            float hot = clamp(vGlow, 0., 1.), lit = mix(.15 + crack * .9, 1., smoothstep(.75, .95, hot));
            totalEmissiveRadiance += mix(vec3(.9, .12, .02), vec3(2.6, 1.2, .3), hot) * hot * hot * lit * 2.2;
          }`);
    };
    mat.customProgramCacheKey = () => 'liquid-surface';
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 2; m.userData.u = u;
    m.position.set(geo.X0 * M + SIZE * M / 2, 0, geo.Z0 * M + SIZE * M / 2);
    return m;
  }
  // a pour: a stream arcing down from a lip 3 m up, thinning as it falls, and white where it lands
  function streamMesh(kind) {
    const curve = new T.QuadraticBezierCurve3(new T.Vector3(0, 3 * M, -1.1 * M), new T.Vector3(0, 2.4 * M, -.2 * M), new T.Vector3(0, 0, 0));
    const g = new T.TubeGeometry(curve, 48, .1 * M, 10, false), K = KINDS[kind] || KINDS.water;
    const pos = g.attributes.position, uv = g.attributes.uv;
    // wider where it lands, as a stream spreads
    for (let i = 0; i < pos.count; i++) { const t = uv.getX(i), p = curve.getPoint(t), sc = .8 + t * t * 1.4; pos.setX(i, p.x + (pos.getX(i) - p.x) * sc); pos.setZ(i, p.z + (pos.getZ(i) - p.z) * sc); }
    const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uCol: { value: World.lin(K.shallow) }, uFoam: { value: World.lin(K.foam) }, uLava: { value: kind === 'lava' ? 1 : 0 }, uLight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime, uLava, uLight; uniform vec3 uCol, uFoam; varying vec2 vUv; varying vec3 vN, vV;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          float along = vUv.x * 14. - uTime * 9., lane = floor(vUv.y * 18.), streak = mix(h(vec2(lane, floor(along * .6))), h(vec2(lane, floor(along * .6) + 1.)), fract(along * .6)) * .8;
          float rim = pow(1. - abs(dot(vN, vV)), 2.);
          vec3 c = mix(uCol * 1.4, uFoam, clamp(streak * .5 + rim * .6 + smoothstep(.75, 1., vUv.x) * .8, 0., 1.)) * uLight;
          if (uLava > .5) c = mix(vec3(1.6, .45, .08), vec3(2.8, 1.5, .4), streak) ;
          gl_FragColor = vec4(c, (uLava > .5 ? .95 : .55 + rim * .35) * smoothstep(0., .04, vUv.x)); }` });
    const m = new T.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; return m;
  }

  const sky = { col: new T.Color() };
  function paint(B, sim, o) {
    const s = sim.s, { base, wall, edge } = sim.geo, K = KINDS[sim.kind] || KINDS.water, lava = sim.kind === 'lava';
    // a floor has no patch of its own: the liquid lies on it, and lava that sets is drawn as a crust on top
    const sand = B.liquidSand, top = B.liquidTop, wp = top.geometry.attributes.position, wc = top.geometry.attributes.color, wg = top.geometry.attributes.aGlow;
    const sp = sand?.geometry.attributes.position, sc = sand?.geometry.attributes.color, sw = sand?.geometry.attributes.aWet;
    const deep = World.lin(K.deep), shallow = World.lin(K.shallow), foam = World.lin(K.foam);
    for (let k = 0; k < N * N; k++) {
      const gh = (base[k] + s.dug[k] + s.rock[k]) * M, d = s.d[k];
      // dark and glossy where wet; scorched under lava, and black where it set to rock
      const w = s.wet[k], rk = clamp(s.rock[k] / .05, 0, 1);
      if (!sand) {
        const crust = s.rock[k] > .003 && d <= .0015;
        wp.setY(k, d > .0015 || crust ? gh + d * M + 1 : gh - 3);
        if (crust) { wc.setXYZW(k, .05, .045, .04, 1); wg.setX(k, 0); continue; }
      } else sp.setY(k, gh);
      if (!sand) { /* the liquid itself, below */ }
      else if (lava) { const b = 1 - w * .55; sc.setXYZ(k, b * (1 - rk) + .16 * rk, b * .92 * (1 - rk) + .14 * rk, b * .88 * (1 - rk) + .13 * rk); sw.setX(k, rk * .5); }
      else { sc.setXYZ(k, 1 - w * .46, 1 - w * .5, 1 - w * .52); sw.setX(k, w * edge[k]); }
      const wet = d > .0015 && !wall[k];
      if (sand) wp.setY(k, wet ? gh + d * M : gh - 3);
      if (lava) { const hot = s.heat[k]; wc.setXYZW(k, .12 + hot * .2, .07, .05, wet ? 1 : 0); wg.setX(k, wet ? hot : 0); }
      else {
        const depth = clamp(d / .45, 0, 1), speed = Math.hypot(s.vx[k], s.vz[k]), white = clamp((speed - 1.1) / 2.2, 0, 1) * clamp(1 - d / .4, .25, 1);
        const r = shallow.r + (deep.r - shallow.r) * depth, g = shallow.g + (deep.g - shallow.g) * depth, b = shallow.b + (deep.b - shallow.b) * depth;
        wc.setXYZW(k, r + (foam.r - r) * white, g + (foam.g - g) * white, b + (foam.b - b) * white,
          wet ? clamp((sim.kind === 'mud' ? .7 : .22) + depth * .75 + white * .5, 0, sim.kind === 'mud' ? 1 : .93) * clamp(d / .006, 0, 1) : 0);
        wg.setX(k, 0);
      }
    }
    for (const a of [sp, sc, sw, wp, wc, wg]) if (a) a.needsUpdate = true;
    sand?.geometry.computeVertexNormals(); top.geometry.computeVertexNormals();
    sim.drawn = true;
  }

  // the desert's coarse ground is not drawn under the patch, which takes its place
  function hole(B, rect, land) {
    const m = land?.material; if (!m) return;
    if (!m.userData.hole) {
      m.userData.hole = { value: new T.Vector4(1e9, 1e9, -1e9, -1e9) }; const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
      m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); sh.uniforms.uHole = m.userData.hole;
        sh.vertexShader = 'varying vec3 vHoleW;\n' + sh.vertexShader.replace('#include <project_vertex>', 'vHoleW = (modelMatrix * vec4(transformed, 1.)).xyz;\n#include <project_vertex>');
        sh.fragmentShader = 'uniform vec4 uHole; varying vec3 vHoleW;\n' + sh.fragmentShader.replace(/void main\(\)\s*\{/, 'void main() {\n if (vHoleW.x > uHole.x && vHoleW.x < uHole.z && vHoleW.z > uHole.y && vHoleW.z < uHole.w) discard;'); };
      m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hole'; m.needsUpdate = true;
    }
    m.userData.hole.value.copy(rect);
  }

  World.stageHooks.push(({ L, B, o, t, ground }) => {
    const on = !!SURFACES[o.ground] && (+o.liquid > 0 || L?.keys?.liquid?.length);
    // the ground drawn under the patch is not drawn there: the patch takes its place
    const lands = [B.land, B.mountainLand].filter(Boolean);
    if (!on) {
      World.rebuild(B, 'liquidSand', null); World.rebuild(B, 'liquidTop', null); World.rebuild(B, 'liquidStream', null);
      for (const l of lands) l.material?.userData.hole?.value.set(1e9, 1e9, -1e9, -1e9);
      return;
    }
    const sim = simulate(L, o, t), geo = sim.geo, place = [geo.X0, geo.Z0, o.groundColor, o.plants].join('|');
    const sand = World.rebuild(B, 'liquidSand', geo.surf.tex ? place + '|' + sim.key : null, () => sandMesh(o, geo));
    const top = World.rebuild(B, 'liquidTop', place + '|' + sim.key, () => liquidMesh(geo, sim.kind));
    if ((sand && sand.userData.v !== sim.version) || top.userData.v !== sim.version) { paint(B, sim, o); if (sand) sand.userData.v = sim.version; top.userData.v = sim.version; }
    if (sand) sand.position.y = ground; top.position.y = ground;
    top.userData.u.uTime.value = t;
    const inset = CELL * 1.5;
    const rect = new T.Vector4((geo.X0 + inset) * M, (geo.Z0 + inset) * M, (geo.X0 + SIZE - inset) * M, (geo.Z0 + SIZE - inset) * M), none = new T.Vector4(1e9, 1e9, -1e9, -1e9);
    const under = o.ground === 'mountains' ? B.mountainLand : o.ground === 'floor' ? null : B.land;
    for (const l of lands) hole(B, l === under ? rect : none, l);
    // the stream of a pour, while it pours
    const pouring = sim.from === 'pour' && rateAt(L, o, t) > .001;
    const st = World.rebuild(B, 'liquidStream', pouring ? sim.kind : null, () => streamMesh(sim.kind));
    if (st) {
      const ci = clamp(Math.round((geo.sx - geo.X0) / CELL - .5), 0, N - 1), cj = clamp(Math.round((geo.sz - geo.Z0) / CELL - .5), 0, N - 1), k = ci + cj * N;
      st.position.set(geo.sx * M, ground + (geo.base[k] + sim.s.dug[k] + sim.s.rock[k] + sim.s.d[k]) * M, geo.sz * M);
      const r = clamp(rateAt(L, o, t), .1, 2); st.scale.set(.6 + r * .6, 1, .6 + r * .6);
      st.material.uniforms.uTime.value = t;
      const sun = clamp(Math.sin(deg(clamp(+o.sunEl, -10, 90))) * 4 + .3, .25, 1.2); st.material.uniforms.uLight.value = sun;
    }
  });

  return { KINDS, RATE, SURFACES, simulate, N, SIZE, CELL, runs };
})();
