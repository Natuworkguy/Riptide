// ---------- liquid on the ground: water, mud or lava running over a world's land ----------
// Liquid is a part of a world's scene, like any prop: add "Liquid" in the scene editor, move it, delete it. It pours
// from a spout (its place, and a height), wells up from a spring, floods in from the far side, or falls as rain.
//
// It is simulated, not drawn: on a patch of ground 50 m across round where it comes from, at a quarter of a metre,
// the liquid runs downhill as shallow water does (each cell pushes on its neighbours by how much higher it stands),
// pools in the hollows, spills over, and goes round props. The ground answers it:
//   - dry sand drinks fast and wet sand slowly, so a pour first soaks a dark patch and only then starts to run
//   - a falling stream scours a pit where it lands; fast water picks sand up, carving channels, and drops it where
//     it slows; banks it undercuts slump in (wet sand stands steeper than dry, sand under water flatter)
//   - where it ran, it leaves ripple marks across the way it flowed, and sand that stays dark and glossy
//   - mud carries and drops more; lava does not carve but scorches, crusts over and sets to rock
// How much the ground gives depends on what it is: desert sand most, a field's soil less, a mountain meadow's turf a
// little, a studio floor not at all.
//
// It is drawn to look like the real thing: the water refracts the sand under it and is coloured by what it carries
// (clear in the shallows, turbid tan where it runs fast over sand); its ripples move with the flow; foam forms where
// it runs fast and froths at the front of a flood; light dances on the bed in the shallows; the wet edge in the sand
// is ragged as it really is; a falling stream is glassy, necks as it speeds up, whitens with air and throws droplets.
//
// Everything follows world time alone: the patch is stepped from the start, 60 steps a second, and kept every three
// seconds, so any frame (a scrub back, an export on the server) comes out the same however it is reached.
const Liquid = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const N = 200, SIZE = 50, CELL = SIZE / N, AREA = CELL * CELL, DT = 1 / 60, SNAP = 180, G = 9.81, R = 2 * N - 1;
  const KINDS = {
    water: { damp: .3, carry: 1, drop: .35, soak: .0012, sediment: 0 },
    mud: { damp: 1.4, carry: .7, drop: 1.2, soak: .0005, sediment: .02 },
    lava: { damp: 2.5, carry: 0, drop: 0, soak: 0, sediment: 0 },
  };
  const KIND_LIST = [['water', 'Water'], ['mud', 'Muddy water'], ['lava', 'Lava']];
  const FROM_LIST = [['pour', 'Pours from a spout'], ['spring', 'Wells up from a spring'], ['flood', 'Floods in from the far side'], ['rain', 'Falls as rain']];
  const SURFACES = {
    desert: { carve: 1, soak: 1, relief: 1, tex: 'sand' },
    field: { carve: .6, soak: .7, relief: .6, tex: 'soil' },
    mountains: { carve: .35, soak: .5, relief: 0, tex: 'grass' },
    floor: { carve: 0, soak: 0, relief: 0, tex: null },
  };
  // how much comes in at 100 %: cubic metres a second (a pour, a spring, a flood), or metres of rain a second
  const RATE = { pour: .12, spring: .12, flood: 2.2, rain: .0025 };
  const num = (v, d) => (v === '' || v == null || !isFinite(+v) ? d : +v);
  const deg = v => v * Math.PI / 180;
  const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ----- the ground: the desert's own dunes (as its coarse ground draws them), and the patch's own shape -----
  const ph = (() => { const r = World.rng(11); return [r() * 9, r() * 9, r() * 9]; })();
  const duneAt = (x, z) => (Math.sin(x * .021 + ph[0] + Math.sin(z * .013) * 2) * 6 + Math.sin(z * .037 + ph[1] + x * .01) * 3
    + Math.sin((x + z) * .09 + ph[2]) * .8) * smooth(Math.hypot(x, z), 25, 140);
  // the desert ground is a grid 20 m apart, drawn in triangles: the patch meets it exactly as it is drawn
  function landAt(x, z) {
    const gx = (x + 4000) / 20, gz = (z + 4000) / 20, ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const at = (i, j) => duneAt(i * 20 - 4000, j * 20 - 4000);
    const a = at(ix, iz), b = at(ix, iz + 1), c = at(ix + 1, iz + 1), d = at(ix + 1, iz);
    return u + v <= 1 ? a + u * (d - a) + v * (b - a) : c + (1 - u) * (b - c) + (1 - v) * (d - c);
  }
  function bumps(x, z) {
    let s = 0, a = .22, f = .11;
    for (let i = 0; i < 5; i++) { s += a * Math.sin(x * f + i * 1.7 + Math.sin(z * f * .7 + i) * 1.3) * Math.cos(z * f * 1.13 - i * 2.1 + Math.sin(x * f * .5) * .9); a *= .5; f *= 2.03; }
    return s;
  }

  // ----- the liquid parts of a world, and where each puts its liquid -----
  const partsOf = o => (Array.isArray(o.objects) ? o.objects : []).filter(P => P && P.type === 'liquid' && !P.hidden);
  function spoutOf(P) {
    const at = Array.isArray(P.at) ? P.at : [0, 0, 0], from = RATE[P.from] ? P.from : 'pour', flow = clamp(num(P.flow, 60), 0, 400) / 100;
    const yaw = deg(+(P.turn?.[1]) || 0), dir = [Math.sin(yaw), Math.cos(yaw)], h = clamp(num(P.height, 3), .2, 40);
    // a pour leaves its spout level and falls: where it lands is how far it goes in the time it takes to fall
    const v0 = .7 + .9 * Math.sqrt(flow), w = clamp(num(P.width, .3), .02, 6), fall = Math.sqrt(2 * h / G), reach = from === 'pour' ? v0 * fall : 0;
    return { P, from, x: (+at[0] || 0) + dir[0] * reach, z: (+at[2] || 0) + dir[1] * reach, sx: +at[0] || 0, sz: +at[2] || 0, h, dir, v0, w };
  }

  // ----- the patch: where it is, its cells, and the walls the props make -----
  function setup(o, first) {
    const surf = SURFACES[o.ground] || SURFACES.desert;
    const land = o.ground === 'desert' ? landAt : o.ground === 'mountains' && World.heights?.mountains ? (x, z) => World.heights.mountains(x, z, o) : () => 0;
    const sx = first.x, sz = first.z, X0 = sx - SIZE / 2, Z0 = sz - 18;
    const n = N * N, base = new Float32Array(n), wall = new Uint8Array(n), edge = new Float32Array(n);
    const feet = [];
    for (const P of Array.isArray(o.objects) ? o.objects : []) {
      if (!P || !['box', 'cylinder', 'sphere', 'cone', 'structure'].includes(P.type) || !Array.isArray(P.at)) continue;
      const size = Array.isArray(P.size) ? P.size : [1, 1, 1], low = (+P.at[1] || 0) - (+size[1] || 1) / 2;
      if (low > .6) continue;
      const turn = deg(+(P.turn?.[1]) || 0);
      feet.push({ x: +P.at[0] || 0, z: +P.at[2] || 0, hx: Math.max(.1, (+size[0] || 1) / 2), hz: Math.max(.1, (+size[P.type === 'cylinder' || P.type === 'sphere' ? 0 : 2] || 1) / 2),
        c: Math.cos(turn), s: Math.sin(turn), round: P.type === 'cylinder' || P.type === 'sphere' || P.type === 'cone' });
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = i + j * N, x = X0 + (i + .5) * CELL, z = Z0 + (j + .5) * CELL;
      // fades to the ground round it at the patch's sides, so the two meet with no seam
      const fade = smooth(Math.min(i, j, N - 1 - i, N - 1 - j) * CELL, 1, 8);
      // its shape: falling gently away from where the liquid lands, a low rise behind, a hollow to fill on the way
      // and bumps to find a way round; sand may drift up against a prop, never fall away from under it
      const dz = z - sz, dx = x - sx;
      let clear = 1;
      for (const F of feet) { const d2 = (x - F.x) ** 2 + (z - F.z) ** 2; clear = Math.min(clear, 1 - Math.exp(-d2 / 9)); }
      const fall = -.07 * clamp(dz, -20, 8) + .09 * Math.abs(dx) / (1 + Math.abs(dx) * .08);
      const shape = 1.1 * Math.exp(-(dx * dx) / 160 - (dz + 4) ** 2 / 90) - .9 * Math.exp(-((dx + 3) ** 2 + (dz - 11) ** 2) / 26) + bumps(x, z) * .6;
      const sh = fall + shape;
      base[k] = land(x, z) + (sh * clear + Math.max(0, sh) * (1 - clear)) * fade * surf.relief;
      edge[k] = fade;
      for (const F of feet) {
        const lx = (x - F.x) * F.c - (z - F.z) * F.s, lz = (x - F.x) * F.s + (z - F.z) * F.c;
        if (F.round ? (lx / F.hx) ** 2 + (lz / F.hz) ** 2 <= 1 : Math.abs(lx) <= F.hx && Math.abs(lz) <= F.hz) wall[k] = 1;
      }
    }
    return { X0, Z0, base, wall, edge, surf };
  }

  // ----- the state: everything that changes, step by step -----
  const FIELDS = ['d', 'fl', 'fr', 'fb', 'ft', 'vx', 'vz', 'sed', 'dug', 'wet', 'heat', 'rock', 'foam', 'bx', 'bz', 'bed'];
  function fresh() { const s = {}; for (const f of FIELDS) s[f] = new Float32Array(N * N); return s; }
  const copy = s => { const c = {}; for (const f of FIELDS) c[f] = s[f].slice(); return c; };

  // the cells a source puts its liquid in, with how much of it each takes
  function cellsOf(geo, src) {
    if (src.from === 'rain') return null;
    if (src.from === 'flood') {
      // a wall of water over the far dunes, in from past where the patch blends into the ground round it
      const ci = Math.round((src.x - geo.X0) / CELL), w = Math.round(12 / CELL), j0 = Math.round(9 / CELL), out = [];
      for (let j = j0; j < j0 + 3; j++) for (let i = Math.max(1, ci - w); i <= Math.min(N - 2, ci + w); i++) out.push([i + j * N, 1]);
      for (const c of out) c[1] = 1 / out.length;
      return out;
    }
    // a spring wells up over a round patch; a pour lands along a strip as wide as its sheet
    const pour = src.from === 'pour', r = pour ? src.w / 2 + .3 : .9, out = [];
    const ci = (src.x - geo.X0) / CELL - .5, cj = (src.z - geo.Z0) / CELL - .5, rc = Math.ceil(r / CELL) + 1;
    for (let j = Math.floor(cj) - rc; j <= Math.ceil(cj) + rc; j++) for (let i = Math.floor(ci) - rc; i <= Math.ceil(ci) + rc; i++) {
      if (i < 1 || j < 1 || i > N - 2 || j > N - 2) continue;
      const ox = (i - ci) * CELL, oz = (j - cj) * CELL;
      if (pour) { const across = Math.abs(ox * src.dir[1] - oz * src.dir[0]), along = Math.abs(ox * src.dir[0] + oz * src.dir[1]);
        if (across <= r && along <= .35) out.push([i + j * N, 1 - across / r * .4]); continue; }
      const dd = Math.hypot(ox, oz); if (dd <= r) out.push([i + j * N, 1 - dd / r * .6]); }
    const sum = out.reduce((a, c) => a + c[1], 0) || 1; for (const c of out) c[1] /= sum;
    return out;
  }

  // one step of DT seconds
  function step(sim, rates) {
    const { geo, kind, erosion } = sim, K = KINDS[kind] || KINDS.water, s = sim.s;
    const { d, fl, fr, fb, ft, vx, vz, sed, dug, wet, heat, rock, foam, bx, bz, bed } = s, { base, wall, edge, surf } = geo;
    const n = N * N, lava = kind === 'lava', dig = erosion / 100 * surf.carve;
    const ground = sim.tmp || (sim.tmp = new Float32Array(n)), next = sim.tmp2 || (sim.tmp2 = new Float32Array(n)), next2 = sim.tmp3 || (sim.tmp3 = new Float32Array(n));
    for (let k = 0; k < n; k++) ground[k] = base[k] + dug[k] + rock[k];
    // what comes in
    sim.srcs.forEach((src, si) => {
      const rate = rates[si]; if (!(rate > 0)) return;
      const add = (k, vol) => { if (wall[k]) return; const old = d[k]; d[k] += vol / AREA;
        if (lava) heat[k] = (heat[k] * old + vol / AREA) / d[k]; else if (K.sediment) sed[k] += K.sediment * vol / AREA; };
      if (src.from === 'rain') { const h = RATE.rain * rate * DT * AREA; for (let k = 0; k < n; k++) if (edge[k] > .5) add(k, h); return; }
      const q = RATE[src.from] * rate * DT;
      for (const [k, w] of src.cells) {
        add(k, q * w);
        if (src.from === 'pour' && !lava) {
          // the falling stream churns the water white where it lands, and scours a pit in the sand under it
          foam[k] = Math.min(1, foam[k] + DT * 8 * w * src.cells.length);
          if (dig > 0 && dug[k] > -.25) { const take = DT * .025 * dig * Math.sqrt(rate) * w * src.cells.length; dug[k] -= take; sed[k] += take; }
        }
        if (src.from === 'spring' && !lava) foam[k] = Math.min(.5, foam[k] + DT * .5 * w * src.cells.length);
      }
    });
    // each cell pushes on its neighbours by how much higher its surface stands (the pipe model); friction holds it
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = i + j * N;
      if (wall[k] || d[k] <= 0) { fl[k] = fr[k] = fb[k] = ft[k] = 0; continue; }
      const damp = Math.exp(-DT * (lava ? K.damp + 40 * (1 - heat[k]) ** 2 : K.damp + .0015 / Math.max(d[k], .0015)));
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
    // the sand answers: fast water picks it up, slow water drops it; and the bed takes ripples across the flow
    if (!lava && dig > 0) {
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = i + j * N; if (wall[k] || d[k] < .0015) { if (sed[k] > 0 && d[k] < .0015) { dug[k] += sed[k]; sed[k] = 0; } continue; }
        const gx = (ground[k + 1] - ground[k - 1]) / (2 * CELL), gz = (ground[k + N] - ground[k - N]) / (2 * CELL), g2 = gx * gx + gz * gz;
        const tilt = Math.max(.05, Math.sqrt(g2 / (1 + g2))), speed = Math.hypot(vx[k], vz[k]);
        const hold = .028 * dig * K.carry * tilt * speed * Math.min(1, d[k] / .03) * edge[k];
        if (sed[k] < hold) { const take = Math.min(.045 * dig * (hold - sed[k]) * DT * 60, dug[k] + 1.6); dug[k] -= take; sed[k] += take; }
        else { const drop = Math.min(sed[k], (K.drop + .3) * (sed[k] - hold) * DT * 3); dug[k] += drop; sed[k] -= drop; }
        if (speed > .15 && d[k] > .003) { const f = Math.min(1, DT * 2); bx[k] += (vx[k] / speed - bx[k]) * f; bz[k] += (vz[k] / speed - bz[k]) * f;
          bed[k] = Math.min(1, bed[k] + DT * .35 * Math.min(speed, 1.5)); }
      }
    }
    // foam: where it runs fast, and froth at the front of water running onto dry ground; it fades as it rides
    if (!lava) for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = i + j * N; if (d[k] < .001) { foam[k] = 0; continue; }
      const speed = Math.hypot(vx[k], vz[k]);
      let f = foam[k] * Math.exp(-DT * .9) + DT * Math.max(0, speed - 1.4) * .5 * Math.min(1, d[k] / .02);
      if (speed > .35 && (d[k - 1] < .001 || d[k + 1] < .001 || d[k - N] < .001 || d[k + N] < .001)) f += DT * .5;
      foam[k] = Math.min(1, f);
    }
    // what the liquid carries goes where it goes (sand and foam, or the heat of lava), traced back along its flow
    const ride = lava ? [heat] : [sed, foam];
    for (const carried of ride) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = i + j * N; if (d[k] <= 1e-4) { next[k] = lava ? 0 : carried === foam ? 0 : carried[k]; continue; }
        const x = clamp(i - vx[k] * DT / CELL, 0, N - 1.001), z = clamp(j - vz[k] * DT / CELL, 0, N - 1.001), x0 = x | 0, z0 = z | 0, u = x - x0, v = z - z0, kk = x0 + z0 * N;
        next[k] = (carried[kk] * (1 - u) + carried[kk + 1] * u) * (1 - v) + (carried[kk + N] * (1 - u) + carried[kk + N + 1] * u) * v;
      }
      carried.set(next);
    }
    // water soaks in, fast into dry sand and slowly once it is wet through; lava cools from its skin and sets
    for (let k = 0; k < n; k++) {
      if (wall[k]) continue;
      if (lava) {
        if (d[k] > 1e-4) { heat[k] = Math.max(0, heat[k] - DT * (.035 + .25 * Math.min(1, .03 / d[k]))); wet[k] = Math.min(1, wet[k] + DT * 1.5);
          if (heat[k] < .22) { const set = Math.min(d[k], d[k] * DT * 1.2 + .0005 * DT); rock[k] += set; d[k] -= set; } }
        else heat[k] = 0;
      } else {
        // (near the patch's edge it drains away, as it would on into the ground beyond, rather than banking up)
        const soak = Math.min(d[k], K.soak * surf.soak * DT * (.25 + 2.2 * (1 - wet[k]) ** 2) + (1 - edge[k]) * .06 * DT);
        if (d[k] > .0008) wet[k] = Math.min(1, wet[k] + DT * (.6 + 4 * d[k]));
        d[k] -= soak; if (d[k] < 1e-5) d[k] = 0;
        wet[k] = Math.max(0, wet[k] - DT * .002);
      }
    }
    // the wet creeps a little into the dry sand round it, as water wicks through sand
    if (sim.step % 6 === 0) {
      next2.set(wet);
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) { const k = i + j * N;
        const m = Math.max(wet[k - 1], wet[k + 1], wet[k - N], wet[k + N]) * (lava ? .5 : .62); if (m > next2[k]) next2[k] += (m - next2[k]) * .025; }
      wet.set(next2);
    }
    // banks slump: sand stands no steeper than its angle of rest, which is steeper when damp, gentler under water
    if (sim.step % 3 === 0 && dig > 0) {
      for (let k = 0; k < n; k++) ground[k] = base[k] + dug[k] + rock[k];
      for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
        const k = i + j * N; if (wall[k]) continue;
        for (const kk of [k + 1, k + N]) {
          if (wall[kk]) continue;
          const diff = ground[k] - ground[kk], under = d[k] > .01 || d[kk] > .01, rest = (under ? .22 : wet[k] > .3 ? .9 : .6) * CELL;
          if (Math.abs(diff) <= rest) continue;
          const hi = diff > 0 ? k : kk, lo = diff > 0 ? kk : k, move = (Math.abs(diff) - rest) * .4;
          dug[hi] -= move; dug[lo] += move; ground[hi] -= move; ground[lo] += move;
        }
      }
    }
    sim.step++;
  }

  // ----- the run for a world layer: stepped to the time asked, kept every three seconds -----
  const runs = new Map();
  const flowAt = (P, t) => clamp(num(World.keyed(P, 'flow', t, P.flow), 60), 0, 400) / 100;
  function simulate(L, o, t) {
    const parts = partsOf(o); if (!parts.length) return null;
    const srcs = parts.map(spoutOf), first = srcs[0], P0 = first.P;
    const kind = KINDS[P0.kind] ? P0.kind : 'water', erosion = clamp(num(P0.carve, 60), 0, 300);
    const key = JSON.stringify([o.ground, o.ground === 'mountains' ? [o.peaks, o.road] : 0, kind, erosion,
      parts.map(P => [P.at, P.turn, P.height, P.width, P.from, P.flow, P.keys?.flow || null]),
      (o.objects || []).filter(P => P && P.at && ['box', 'cylinder', 'sphere', 'cone', 'structure'].includes(P.type)).map(P => [P.type, P.at, P.size, P.turn])]);
    let sim = runs.get(L.id);
    if (!sim || sim.key !== key) {
      const geo = setup(o, first);
      for (const s of srcs) s.cells = cellsOf(geo, s);
      sim = { key, kind, erosion, geo, srcs, s: fresh(), step: 0, snaps: [], version: 0 }; runs.set(L.id, sim);
    }
    const want = Math.max(0, Math.floor(t / DT + 1e-6));
    if (want < sim.step) {
      let best = null; for (const sn of sim.snaps) if (sn.step <= want && (!best || sn.step > best.step)) best = sn;
      sim.s = best ? copy(best.s) : fresh(); sim.step = best ? best.step : 0;
    }
    const was = sim.step;
    while (sim.step < want) {
      step(sim, sim.srcs.map(s => flowAt(s.P, sim.step * DT)));
      if (sim.step % SNAP === 0 && !sim.snaps.some(sn => sn.step === sim.step)) {
        sim.snaps.push({ step: sim.step, s: copy(sim.s) });
        if (sim.snaps.length > 24) sim.snaps = sim.snaps.filter((sn, i) => i % 2 === 0 || i === sim.snaps.length - 1);
      }
    }
    if (sim.step !== was || !sim.drawn) sim.version++;
    return sim;
  }

  // ----- pictures the shaders draw detail from: tileable noise in four channels -----
  let noiseTex = null;
  function noise() {
    if (noiseTex) return noiseTex;
    const S = 256, data = new Uint8Array(S * S * 4), r = World.rng(77);
    // each channel a sum of waves that repeat over the tile, so it tiles with no seam
    const waves = [0, 1, 2, 3].map(c => Array.from({ length: 24 }, (_, i) => { const f = 1 + Math.floor(r() * (c === 3 ? 40 : 12) + (c === 3 ? 20 : i / 3)), a = r() * Math.PI * 2;
      return { fx: Math.round(Math.cos(a) * f), fz: Math.round(Math.sin(a) * f), p: r() * Math.PI * 2, amp: 1 / Math.sqrt(1 + Math.hypot(Math.cos(a) * f, Math.sin(a) * f)) }; }));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let c = 0; c < 4; c++) {
      let v = 0, tot = 0; for (const w of waves[c]) { v += Math.sin((w.fx * x + w.fz * y) / S * Math.PI * 2 + w.p) * w.amp; tot += w.amp; }
      data[(x + y * S) * 4 + c] = clamp(Math.round((v / tot * 1.6 * .5 + .5) * 255), 0, 255);
    }
    const t = new T.DataTexture(data, S, S, T.RGBAFormat); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true; return noiseTex = t;
  }
  const NOISE_GLSL = `
    uniform sampler2D uNoise; uniform float uTime;
    float nz(vec2 p, int c) { vec4 v = texture2D(uNoise, p); return c == 0 ? v.r : c == 1 ? v.g : c == 2 ? v.b : v.a; }
    vec2 ngrad(vec2 p, int c) { float e = 1. / 256.; return vec2(nz(p + vec2(e, 0.), c) - nz(p - vec2(e, 0.), c), nz(p + vec2(0., e), c) - nz(p - vec2(0., e), c)) * 64.; }`;

  // ----- the patch's mesh: the sim grid, drawn twice as fine -----
  function patchGeometry(geo) {
    const g = new T.PlaneGeometry((SIZE - CELL) * M, (SIZE - CELL) * M, R - 1, R - 1); g.rotateX(-Math.PI / 2);
    g.translate((geo.X0 + SIZE / 2) * M, 0, (geo.Z0 + SIZE / 2) * M);
    return g;
  }
  // a sim field, bilinear, at each vertex of the finer mesh
  function up(src, dst, stride = 1, off = 0) {
    for (let J = 0; J < R; J++) { const j = J >> 1, fj = J & 1; for (let I = 0; I < R; I++) {
      const i = I >> 1, fi = I & 1, k = i + j * N; let v;
      if (!fi && !fj) v = src[k]; else if (fi && !fj) v = (src[k] + src[k + 1]) * .5; else if (!fi) v = (src[k] + src[k + N]) * .5; else v = (src[k] + src[k + 1] + src[k + N] + src[k + N + 1]) * .25;
      dst[(I + J * R) * stride + off] = v; } }
  }

  // the ground of the patch: the world's own sand (or soil or grass), lined up with it, wet where water reached it,
  // rippled where it ran, lit by the light the water bends onto it, scorched and set to rock under lava
  function sandMesh(o, geo) {
    const g = patchGeometry(geo), nv = R * R;
    g.setAttribute('aWet', new T.BufferAttribute(new Float32Array(nv), 1));
    g.setAttribute('aBed', new T.BufferAttribute(new Float32Array(nv * 4), 4));      // depth, ripple strength, rock, flow-x
    g.setAttribute('aDir', new T.BufferAttribute(new Float32Array(nv), 1));          // flow-z
    const grass = geo.surf.tex === 'grass', tile = grass ? 14 : 8000 / 3000, pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / M, z = pos.getZ(i) / M; uv.setXY(i, x / tile, grass ? z / tile : -z / tile); }
    const own = t => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(1, 1); c.offset.set(0, 0); return c; };
    const soil = o.ground === 'field' ? '#' + World.lin(o.groundColor).lerp(World.lin(o.plants || '#c09a48'), .45).getHexString(T.SRGBColorSpace) : o.groundColor;
    const look = grass ? { map: World.grassTex() } : { map: own(World.tex(geo.surf.tex, 3000, true)), bumpMap: own(World.tex(geo.surf.tex, 3000)), bumpScale: 1.2 };
    const mat = new T.MeshStandardMaterial({ color: World.lin(grass ? o.groundColor || '#4f6b2f' : soil), roughness: .95, metalness: 0, ...look,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const u = { uTime: { value: 0 }, uNoise: { value: noise() }, uSunUp: { value: 1 } };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'attribute float aWet, aDir; attribute vec4 aBed; varying float vWet; varying vec4 vBed; varying vec2 vFlowDir; varying vec3 vWP;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWet = aWet; vBed = aBed; vFlowDir = vec2(aBed.w, aDir); vWP = (modelMatrix * vec4(position, 1.)).xyz / 100.;');
      sh.fragmentShader = `uniform float uSunUp; varying float vWet; varying vec4 vBed; varying vec2 vFlowDir; varying vec3 vWP; float wetK;\n${NOISE_GLSL}\n`
        + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            {
              vec2 p = vWP.xz;
              // the wet edge is ragged, fingers of damp running into the dry, as water wicks through sand
              float rag = nz(p * .55, 2) * .65 + nz(p * 2.3, 1) * .35;
              wetK = smoothstep(.18, .5, vWet + (rag - .5) * .55);
              float under = smoothstep(.0004, .004, vBed.x);
              wetK = max(wetK, under);
              vec3 c = diffuseColor.rgb; float l = dot(c, vec3(.299, .587, .114));
              // wet sand: darker by about half, and richer in colour
              vec3 wc = mix(vec3(l), c, 1.3) * .48;
              c = mix(c, wc, wetK);
              // a darker band just inside the wet edge, where it is wettest against the dry
              c *= 1. - .12 * wetK * (1. - smoothstep(.5, .95, vWet)) * (1. - under);
              // light the moving water bends onto the bed in the shallows
              if (vBed.x > .002) {
                vec2 q = p * .42;
                float a = nz(q + uTime * vec2(.021, .013), 0), b = nz(q * 1.13 - uTime * vec2(.017, .024) + .5, 1);
                float ca = pow(clamp(1. - abs(a - b) * 4.5, 0., 1.), 7.);
                c *= 1. + ca * 1.6 * smoothstep(.002, .03, vBed.x) * (1. - smoothstep(.12, .5, vBed.x)) * uSunUp;
              }
              // set rock: dark basalt
              c = mix(c, vec3(.04, .036, .033), smoothstep(.002, .04, vBed.z));
              diffuseColor.rgb = c;
            }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .38, wetK);')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            {
              vec2 p = vWP.xz; vec2 gw = vec2(0.);
              // ripple marks the current left: crests across the way it flowed, sinuous, about 12 cm apart
              // only on the flat of the bed, not up the banks
              vec3 nWorld = normalize((vec4(normal, 0.) * viewMatrix).xyz);
              float rb = vBed.y * smoothstep(.93, .985, nWorld.y);
              if (rb > .01 && length(vFlowDir) > .05) {
                vec2 dir = normalize(vFlowDir), side = vec2(-dir.y, dir.x);
                float ph = dot(p, dir) * 52. + sin(dot(p, side) * 7. + nz(p * .3, 3) * 6.) * 1.4 + nz(p * .8, 2) * 4.;
                // ripples are steep on their downstream side
                float s = sin(ph), slope = cos(ph) * (s > 0. ? .6 : 1.4);
                gw += dir * slope * .1 * rb;
              }
              // fine grains up close
              gw += ngrad(p * 3.1, 3) * .05 * (1. - wetK * .6);
              vec3 nW = vec3(-gw.x, 0., -gw.y);
              normal = normalize(normal + (viewMatrix * vec4(nW, 0.)).xyz);
            }`);
    };
    mat.customProgramCacheKey = () => 'liquid-sand-2';
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; m.userData.u = u;
    return m;
  }

  // the liquid's surface: water that refracts the bed and is coloured by what it carries, with ripples moving with
  // the flow and foam; mud the same but thick; lava a glowing, crusting skin
  function liquidMesh(geo, kind) {
    const g = patchGeometry(geo), nv = R * R;
    g.setAttribute('aDepth', new T.BufferAttribute(new Float32Array(nv), 1));
    g.setAttribute('aFlow', new T.BufferAttribute(new Float32Array(nv * 4), 4));     // flow x, flow z, foam, turbidity or heat
    const u = { uTime: { value: 0 }, uNoise: { value: noise() } };
    let mat;
    if (kind === 'lava') {
      mat = new T.MeshStandardMaterial({ color: new T.Color('#1d1512'), roughness: .8, metalness: 0 });
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = 'attribute float aDepth; attribute vec4 aFlow; varying float vDepth; varying vec4 vFlow; varying vec3 vWP;\n'
          + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDepth = aDepth; vFlow = aFlow; vWP = (modelMatrix * vec4(position, 1.)).xyz / 100.;');
        sh.fragmentShader = `varying float vDepth; varying vec4 vFlow; varying vec3 vWP;\n${NOISE_GLSL}\n` + sh.fragmentShader
          .replace('void main() {', 'void main() {\n if (vDepth < .0015) discard;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              // molten under a skin that cracks into plates as it cools: bright in the cracks, dull on the plates
              vec2 p = vWP.xz - vFlow.xy * uTime * .02;
              float a = nz(p * .35, 0), b = nz(p * .9, 1);
              float crack = 1. - smoothstep(.0, .05, abs(a - .5) * (1. + b));
              float hot = clamp(vFlow.w, 0., 1.), lit = mix(.08 + crack * 1.1, 1., smoothstep(.72, .95, hot));
              totalEmissiveRadiance += mix(vec3(.9, .1, .01), vec3(3., 1.35, .32), hot) * hot * hot * lit * 2.4;
            }`);
      };
    } else {
      // clear water is faintly green over a long way; water carrying sand is tan over a few centimetres
      const silt = kind === 'mud' ? '#6b4a2a' : '#9c7a50', siltDist = kind === 'mud' ? 1.2 : 6, clear = kind === 'mud' ? '#7a5a3a' : '#7fa79a', clearDist = kind === 'mud' ? 2 : 260;
      mat = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .035, metalness: 0, ior: 1.333, transmission: 1, thickness: 1, specularIntensity: 1,
        attenuationColor: World.lin(clear), attenuationDistance: clearDist, envMapIntensity: 1 });
      Object.assign(u, { uSilt: { value: World.lin(silt) }, uSiltDist: { value: siltDist }, uClear: { value: World.lin(clear) }, uClearDist: { value: clearDist },
        uFoamCol: { value: World.lin(kind === 'mud' ? '#b39a7c' : '#efe9de') } });
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = 'attribute float aDepth; attribute vec4 aFlow; varying float vDepth; varying vec4 vFlow; varying vec3 vWP;\n'
          + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDepth = aDepth; vFlow = aFlow; vWP = (modelMatrix * vec4(position, 1.)).xyz / 100.;');
        const trans = T.ShaderChunk.transmission_fragment
          .replace('material.transmission = transmission;', 'material.transmission = transmission * (1. - foamK * .92);')
          .replace('material.thickness = thickness;', 'material.thickness = max(vDepth, .0) * 100. * 1.6;')
          .replace('material.attenuationDistance = attenuationDistance;', 'material.attenuationDistance = mix(uClearDist, uSiltDist, turb);')
          .replace('material.attenuationColor = attenuationColor;', 'material.attenuationColor = mix(uClear, uSilt, turb);');
        sh.fragmentShader = `uniform vec3 uSilt, uClear, uFoamCol; uniform float uSiltDist, uClearDist; varying float vDepth; varying vec4 vFlow; varying vec3 vWP; float foamK, turb;\n${NOISE_GLSL}\n`
          + sh.fragmentShader
            .replace('void main() {', 'void main() {\n if (vDepth < .0006) discard;')
            .replace('#include <color_fragment>', `#include <color_fragment>
              {
                // two layers of the pattern sliding with the flow, each fading in as the other resets, so it moves
                // without stretching
                vec2 fl = vFlow.xy; float t0 = fract(uTime * .45), t1 = fract(uTime * .45 + .5), w0 = 1. - abs(1. - 2. * t0);
                vec2 p = vWP.xz;
                float f0 = nz(p * .9 - fl * t0 * .9, 1) * .6 + nz(p * 2.6 - fl * t0 * 2.6, 3) * .4;
                float f1 = nz(p * .9 - fl * t1 * .9 + .37, 1) * .6 + nz(p * 2.6 - fl * t1 * 2.6 + .61, 3) * .4;
                float pat = mix(f1, f0, w0);
                // foam: patches of bubbles, more where there is more, thin lacy strands where there is little
                foamK = clamp(smoothstep(.62 - vFlow.z * .5, .78 - vFlow.z * .35, pat) * min(1., vFlow.z * 2.2), 0., 1.);
                turb = clamp(vFlow.w, 0., 1.);
                diffuseColor.rgb = mix(diffuseColor.rgb, uFoamCol, foamK);
              }`)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .55, foamK);')
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
              {
                vec2 fl = vFlow.xy, p = vWP.xz; float sp = min(length(fl), 2.5);
                float t0 = fract(uTime * .45), t1 = fract(uTime * .45 + .5), w0 = 1. - abs(1. - 2. * t0);
                vec2 g0 = ngrad(p * .7 - fl * t0 * .7, 0) * .7 + ngrad(p * 2.1 - fl * t0 * 2.1, 2) * .3;
                vec2 g1 = ngrad(p * .7 - fl * t1 * .7 + .41, 0) * .7 + ngrad(p * 2.1 - fl * t1 * 2.1 + .29, 2) * .3;
                vec2 gw = mix(g1, g0, w0) * (.006 + .03 * sp);
                // the wind's fine cat's-paws on still water
                gw += ngrad(p * 4.3 + uTime * vec2(.06, .045), 3) * .005;
                // calm at the very edge, where the film is thin
                gw *= smoothstep(.0006, .012, vDepth);
                normal = normalize(normal + (viewMatrix * vec4(-gw.x, 0., -gw.y, 0.)).xyz);
              }`)
            .replace('#include <transmission_fragment>', trans);
      };
    }
    mat.customProgramCacheKey = () => 'liquid-surface-2-' + kind;
    const m = new T.Mesh(g, mat); m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = 2; m.userData.u = u;
    return m;
  }

  // ----- a pour: the falling stream, and what it throws up where it lands -----
  // The stream leaves the spout level and falls under gravity; it speeds up as it falls, so it necks (the same water
  // through a narrower column), its skin roughens, and it fills with air and turns white low down.
  function streamGroup(src, kind, rate, groundY) {
    const grp = new T.Group(), h = src.h, v0 = src.v0, tf = Math.sqrt(2 * h / G), q = RATE.pour * rate;
    // a sheet as wide as the spout, thinning as it speeds up (the same water through a thinner sheet), widening a
    // little as it falls
    const w = src.w, SEG = 96, RAD = 18, verts = [], norms = [], uvs = [], idx = [];
    const r0 = q / (v0 * w);
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG, t = tf * s, v = Math.hypot(v0, G * t), th = Math.max(.004, q / (v * w)), a = w / 2 * (1 + .25 * s), b = th / 2;
      const cy = h - .5 * G * t * t, cz = v0 * t, ty = -G * t, tz = v0, tl = Math.hypot(ty, tz), ny = tz / tl, nz = -ty / tl;
      for (let j = 0; j <= RAD; j++) {
        const ang = j / RAD * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
        verts.push(ca * a * M, (cy + ny * sa * b) * M, (cz + nz * sa * b) * M);
        const ex = ca / a, en = sa / b, el = Math.hypot(ex, en); norms.push(ex / el, ny * en / el, nz * en / el);
        uvs.push(s, j / RAD);
      }
    }
    for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) { const a = i * (RAD + 1) + j, b = a + RAD + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(norms, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx);
    const u = { uTime: { value: 0 }, uNoise: { value: noise() } };
    let mat;
    if (kind === 'lava') mat = new T.MeshStandardMaterial({ color: '#2a1a12', emissive: new T.Color(2.4, .9, .2), emissiveIntensity: 1.2, roughness: .7 });
    else {
      mat = new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: .02, ior: 1.333, transmission: 1, thickness: Math.max(r0, .004) * M * 1.5, specularIntensity: 1,
        attenuationColor: World.lin(kind === 'mud' ? '#6b4a2a' : '#a9c9bf'), attenuationDistance: kind === 'mud' ? 1.5 : 200 });
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = `uniform float uTime; uniform sampler2D uNoise; varying vec2 vSUv;\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vSUv = uv;
          // its skin roughens as it falls
          float wob = texture2D(uNoise, vec2(uv.x * 3. - uTime * 2.2, uv.y)).r - .5;
          transformed += normal * wob * (.2 + uv.x * 1.8) * ${(Math.max(r0, .004) * M).toFixed(2)};`);
        const trans = T.ShaderChunk.transmission_fragment.replace('material.transmission = transmission;', 'material.transmission = transmission * (1. - airK * .85);');
        sh.fragmentShader = `uniform float uTime; uniform sampler2D uNoise; varying vec2 vSUv; float airK;\n` + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            {
              // streaks of air, more and more of them low down, racing down it
              float s = texture2D(uNoise, vec2(vSUv.y * 2., vSUv.x * 1.5 - uTime * 3.)).g;
              airK = smoothstep(.75 - vSUv.x * .45, .9 - vSUv.x * .35, s) * smoothstep(.15, .9, vSUv.x);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.95, .95, .93), airK);
            }`)
          .replace('#include <transmission_fragment>', trans);
      };
      mat.customProgramCacheKey = () => 'liquid-stream';
    }
    const tube = new T.Mesh(geo, mat); tube.renderOrder = 3; grp.add(tube);
    // droplets thrown up where it lands, each on its own arc, again and again
    if (kind !== 'lava') {
      const count = Math.round(80 + 260 * Math.min(1.5, rate)), drop = new T.InstancedMesh(new T.SphereGeometry(1, 8, 6),
        new T.MeshPhysicalMaterial({ color: kind === 'mud' ? '#8a6a48' : '#ffffff', roughness: .05, transmission: kind === 'mud' ? 0 : .9, thickness: 1, ior: 1.333 }), count);
      drop.frustumCulled = false; drop.userData.drops = true; drop.userData.n = count; grp.add(drop);
    }
    grp.userData = { u, tf, v0, h, rate, landZ: v0 * tf, w };
    return grp;
  }
  const m4 = new T.Matrix4(), qd = new T.Quaternion(), zAxis = new T.Vector3(0, 0, 1), tv = new T.Vector3(), sv = new T.Vector3();
  function splash(grp, t) {
    const drop = grp.children.find(c => c.userData.drops); if (!drop) return;
    const { landZ, rate } = grp.userData, n = drop.userData.n, life = .75, r = World.rng(5);
    const seeds = grp.userData.seeds || (grp.userData.seeds = Array.from({ length: n }, () => [r(), r(), r(), r(), r()]));
    for (let i = 0; i < n; i++) {
      const [a, b, c, d, e] = seeds[i], L = life * (.6 + .6 * a), age = ((t + b * 37.1) % L + L) % L;
      const ang = c * Math.PI * 2, out = (.6 + 1.9 * d) * Math.sqrt(rate + .2), upv = (.8 + 2.4 * e) * Math.sqrt(rate + .2);
      const vx = Math.cos(ang) * out, vz = Math.sin(ang) * out + .3, vy = upv - G * age;
      const y = upv * age - .5 * G * age * age;
      if (y < -.01) { m4.makeScale(0, 0, 0); drop.setMatrixAt(i, m4); continue; }
      const size = (.004 + .009 * a) * M;
      tv.set((vx * age + (b - .5) * grp.userData.w) * M, y * M, landZ * M + vz * age * M);
      sv.set(vx, vy, vz); const sp = sv.length(); qd.setFromUnitVectors(zAxis, sv.normalize());
      m4.compose(tv, qd, new T.Vector3(size, size, size * (1 + sp * 1.6)));
      drop.setMatrixAt(i, m4);
    }
    drop.instanceMatrix.needsUpdate = true;
  }

  // ----- drawing it each frame -----
  function paint(B, sim) {
    const s = sim.s, { base, wall } = sim.geo, n = N * N, lava = sim.kind === 'lava';
    const sand = B.liquidSand, top = B.liquidTop;
    const gnd = sim.g1 || (sim.g1 = new Float32Array(n)), lvl = sim.g2 || (sim.g2 = new Float32Array(n)), dd = sim.g3 || (sim.g3 = new Float32Array(n));
    const tb = sim.g4 || (sim.g4 = new Float32Array(n)), tmp = sim.g5 || (sim.g5 = new Float32Array(R * R));
    for (let k = 0; k < n; k++) { gnd[k] = (base[k] + s.dug[k] + s.rock[k]) * M; dd[k] = wall[k] ? 0 : s.d[k]; }
    // the water's level, carried a cell past its edge so it meets the bank where the bank rises out of it
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = i + j * N;
      if (dd[k] > .0006) { lvl[k] = gnd[k] + dd[k] * M; continue; }
      let best = Infinity;
      for (const kk of [i > 0 ? k - 1 : -1, i < N - 1 ? k + 1 : -1, j > 0 ? k - N : -1, j < N - 1 ? k + N : -1]) if (kk >= 0 && dd[kk] > .0006) best = Math.min(best, gnd[kk] + dd[kk] * M);
      lvl[k] = isFinite(best) ? best : gnd[k] - 4;
    }
    if (sand) {
      const pos = sand.geometry.attributes.position.array; up(gnd, tmp); for (let v = 0; v < R * R; v++) pos[v * 3 + 1] = tmp[v];
      up(s.wet, sand.geometry.attributes.aWet.array);
      const bed = sand.geometry.attributes.aBed.array, dir = sand.geometry.attributes.aDir.array;
      up(dd, bed, 4, 0); up(s.bed, bed, 4, 1); up(s.rock, bed, 4, 2); up(s.bx, bed, 4, 3); up(s.bz, dir);
      for (const a of ['position', 'aWet', 'aBed', 'aDir']) sand.geometry.attributes[a].needsUpdate = true;
      sand.geometry.computeVertexNormals();
    }
    {
      const pos = top.geometry.attributes.position.array; up(lvl, tmp); for (let v = 0; v < R * R; v++) pos[v * 3 + 1] = tmp[v] + (sand ? 0 : 1);
      up(dd, top.geometry.attributes.aDepth.array);
      const fl = top.geometry.attributes.aFlow.array;
      if (lava) for (let k = 0; k < n; k++) tb[k] = s.heat[k]; else for (let k = 0; k < n; k++) tb[k] = dd[k] > .0006 ? clamp(s.sed[k] / dd[k] * 25 + (sim.kind === 'mud' ? .8 : 0), 0, 1) : 0;
      up(s.vx, fl, 4, 0); up(s.vz, fl, 4, 1); up(s.foam, fl, 4, 2); up(tb, fl, 4, 3);
      top.geometry.attributes.position.needsUpdate = top.geometry.attributes.aDepth.needsUpdate = top.geometry.attributes.aFlow.needsUpdate = true;
      top.geometry.computeVertexNormals();
    }
    sim.drawn = true;
  }

  // the ground drawn under the patch is not drawn there: the patch takes its place
  function hole(rect, land) {
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
    const on = !!SURFACES[o.ground] && partsOf(o).length > 0;
    const lands = [B.land, B.mountainLand].filter(Boolean);
    if (!on) {
      World.rebuild(B, 'liquidSand', null); World.rebuild(B, 'liquidTop', null); World.rebuild(B, 'liquidStream', null);
      for (const l of lands) l.material?.userData.hole?.value.set(1e9, 1e9, -1e9, -1e9);
      return;
    }
    const sim = simulate(L, o, t), geo = sim.geo, place = [geo.X0, geo.Z0, o.groundColor, o.plants, sim.key].join('|');
    const sand = World.rebuild(B, 'liquidSand', geo.surf.tex ? place : null, () => sandMesh(o, geo));
    const top = World.rebuild(B, 'liquidTop', place + sim.kind, () => liquidMesh(geo, sim.kind));
    if ((sand && sand.userData.v !== sim.version) || top.userData.v !== sim.version) { paint(B, sim); if (sand) sand.userData.v = sim.version; top.userData.v = sim.version; }
    if (sand) { sand.position.y = ground; sand.userData.u.uTime.value = t;
      sand.userData.u.uSunUp.value = clamp(Math.sin(deg(clamp(+o.sunEl, -10, 90))) * 3 + .2, 0, 1); }
    top.position.y = ground; top.userData.u.uTime.value = t;
    const inset = CELL * 1.5;
    const rect = new T.Vector4((geo.X0 + inset) * M, (geo.Z0 + inset) * M, (geo.X0 + SIZE - inset) * M, (geo.Z0 + SIZE - inset) * M), none = new T.Vector4(1e9, 1e9, -1e9, -1e9);
    const under = o.ground === 'mountains' ? B.mountainLand : o.ground === 'floor' ? null : B.land;
    for (const l of lands) hole(l === under ? rect : none, l);
    // the falling streams, while they pour (one group, a stream for each spout)
    const pours = sim.srcs.map((src, i) => ({ src, i, rate: flowAt(src.P, t) })).filter(x => x.src.from === 'pour' && x.rate > .001);
    const skey = pours.length ? pours.map(x => [x.i, x.src.sx, x.src.sz, x.src.h, x.src.w, x.src.dir, x.rate.toFixed(2)].join(',')).join(';') + sim.kind : null;
    const st = World.rebuild(B, 'liquidStream', skey, () => {
      const grp = new T.Group();
      for (const x of pours) {
        const ci = clamp(Math.round((x.src.sx - geo.X0) / CELL - .5), 0, N - 1), cj = clamp(Math.round((x.src.sz - geo.Z0) / CELL - .5), 0, N - 1);
        const s = streamGroup(x.src, sim.kind, x.rate);
        s.userData.ck = ci + cj * N; s.userData.sx = x.src.sx; s.userData.sz = x.src.sz; s.rotation.y = Math.atan2(x.src.dir[0], x.src.dir[1]);
        grp.add(s);
      }
      return grp;
    });
    if (st) for (const s of st.children) {
      // the spout stands its height above the sand under it
      const k = s.userData.ck; s.position.set(s.userData.sx * M, ground + (geo.base[k] + sim.s.dug[k] + sim.s.rock[k]) * M, s.userData.sz * M);
      s.userData.u.uTime.value = t; splash(s, t);
    }
  });

  // ----- the part: in the scene editor, a marker where it comes from (not filmed) -----
  World.custom.liquid = P => {
    const grp = new T.Group(), up = (+(P.at?.[1]) || 0) * M, h = P.from === 'pour' || !P.from ? clamp(num(P.height, 3), .2, 40) * M : 0;
    const mark = new T.Mesh(new T.SphereGeometry(.14 * M, 16, 12), new T.MeshBasicMaterial({ color: '#3aa0ff', transparent: true, opacity: .85, depthTest: false }));
    mark.position.y = h - up; mark.renderOrder = 9; grp.add(mark);
    const ring = new T.Mesh(new T.RingGeometry(.35 * M, .42 * M, 32), new T.MeshBasicMaterial({ color: '#3aa0ff', side: T.DoubleSide, transparent: true, opacity: .7, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -up + 2; ring.renderOrder = 9; grp.add(ring);
    if (h) { const line = new T.Mesh(new T.CylinderGeometry(.01 * M, .01 * M, h, 6), mark.material); line.position.y = h / 2 - up; grp.add(line); }
    grp.traverse(x => { x.userData.guide = true; x.castShadow = x.receiveShadow = false; }); grp.userData.guide = true;
    return grp;
  };
  World.PARTS.push('liquid');
  SceneEd.add('liquid', { type: 'liquid', kind: 'water', from: 'pour', flow: 60, height: 3, carve: 60 }, 'Liquid');
  const opt = (k, v, list) => `<select data-k="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v ?? '') === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  const numIn = (k, v, step, label) => `<label class="f"><span>${label}</span><input type="number" step="${step}" data-k="${k}" value="${v}"></label>`;
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'liquid') return '';
      const from = P.from || 'pour';
      return `<div class="hd">Liquid</div>
        <label class="f wide"><span>Liquid</span>${opt('kind', P.kind || 'water', KIND_LIST)}</label>
        <label class="f wide"><span>Comes</span>${opt('from', from, FROM_LIST)}</label>
        ${numIn('flow', num(P.flow, 60), 5, 'Flow %')}${from === 'pour' ? numIn('height', num(P.height, 3), .1, 'Spout height m') + numIn('width', num(P.width, .3), .05, 'Spout width m') : ''}
        ${(P.kind || 'water') !== 'lava' ? numIn('carve', num(P.carve, 60), 5, 'Carves ground %') : ''}
        <p class="note">${from === 'pour' ? 'It pours from the blue marker, out the way the part faces (turn it to aim), and lands where it falls. ' : from === 'rain' ? 'Rain falls over the 50 m round the marker; turn the world\'s Rain up to see it fall. ' : from === 'flood' ? 'The flood comes in 9 m past the far side of the 50 m round the marker. ' : 'It wells up at the marker. '}It runs, pools, soaks in and carves the ground over 50 m round it. Delete the part to take the liquid away.</p>`;
    },
  });

  return { KINDS, RATE, SURFACES, simulate, N, SIZE, CELL, runs };
})();
