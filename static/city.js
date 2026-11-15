// ---------- the city: streets, buildings, signs and street furniture that read as a real place ----------
// A street is asphalt with worn markings, kerbs and paving; a building is a facade of real-sized storeys, its ground
// floor a row of shopfronts, its windows each a room (lamps, curtains, blinds, a television's glow, or dark glass);
// blade signs hang out over the pavement in neon tubes or light boxes; lamp posts light the road; wires sag between
// poles; every light blooms a little in the wet air. All in metres, all worked out from numbers alone, the same
// whichever frame is asked for.
const City = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const cache = new Map(), once = (k, make) => cache.get(k) || (cache.set(k, make()), cache.get(k));
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const texOf = (cv, srgb = true, rep = [1, 1]) => { const t = new T.CanvasTexture(cv); if (srgb) t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 8; return t; };
  // a normal map from a height canvas (white high, black low)
  function normalFrom(hc, strength = 2) {
    const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data, out = canvas(w, h), og = out.getContext('2d'), d = og.createImageData(w, h);
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      d.data[i] = (-dx / l * .5 + .5) * 255; d.data[i + 1] = (dy / l * .5 + .5) * 255; d.data[i + 2] = (1 / l * .5 + .5) * 255; d.data[i + 3] = 255;
    }
    og.putImageData(d, 0, 0); const t = texOf(out, false); return t;
  }
  function grain(g, w, h, n, alpha, light, r) {
    for (let i = 0; i < n; i++) { const v = light ? 200 + r() * 55 : r() * 40; g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
  }

  // ----- a street: asphalt, markings, kerbs, pavements -----
  // One tile of road, 12 m wide by 24 m long: the colour, how rough each spot is (worn, patched, oily) and its bumps.
  function roadTiles(width) {
    return once('road' + width, () => {
      const PX = 48, w = Math.round(width * PX), h = 24 * PX, r = rng(5);
      const col = canvas(w, h), g = col.getContext('2d'), rough = canvas(w, h), q = rough.getContext('2d'), ht = canvas(w, h), b = ht.getContext('2d');
      g.fillStyle = '#2a2a2b'; g.fillRect(0, 0, w, h); q.fillStyle = '#b8b8b8'; q.fillRect(0, 0, w, h); b.fillStyle = '#808080'; b.fillRect(0, 0, w, h);
      // patches of newer and older tarmac, a darker band where tyres run, oil down the middle of each lane
      for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * h, pw = 60 + r() * 260, ph = 80 + r() * 400, v = 30 + r() * 22;
        g.fillStyle = `rgb(${v},${v},${v + 1})`; g.fillRect(x, y, pw, ph); q.fillStyle = `rgb(${150 + r() * 80},0,0)`; q.fillRect(x, y, pw, ph); }
      for (const lane of [-.25, .25]) { const cx = w / 2 + lane * w;
        const gr = g.createLinearGradient(cx - 40, 0, cx + 40, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(8,8,8,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(cx - 40, 0, 80, h); q.fillStyle = 'rgba(40,40,40,.5)'; q.fillRect(cx - 30, 0, 60, h);
        for (const tyre of [-1, 1]) { const tx = cx + tyre * .8 * PX; q.fillStyle = 'rgba(70,70,70,.5)'; q.fillRect(tx - 18, 0, 36, h); g.fillStyle = 'rgba(70,70,72,.25)'; g.fillRect(tx - 18, 0, 36, h); } }
      grain(g, w, h, 60000, .5, false, r); grain(g, w, h, 30000, .35, true, r);
      for (let i = 0; i < 90000; i++) { const v = 100 + r() * 155; b.fillStyle = `rgb(${v},${v},${v})`; b.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      // cracks, sealed with darker tar
      g.strokeStyle = 'rgba(10,10,10,.8)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 10; j++) { x += (r() - .5) * 40; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
      // markings: a dashed line down the middle, solid edges, worn through in places
      const paint = (x, y, pw, ph) => { g.fillStyle = '#d8d6cf'; g.fillRect(x, y, pw, ph); q.fillStyle = '#585858'; q.fillRect(x, y, pw, ph); b.fillStyle = '#9a9a9a'; b.fillRect(x, y, pw, ph);
        for (let i = 0; i < pw * ph / 30; i++) { g.fillStyle = 'rgba(42,42,43,.9)'; g.fillRect(x + r() * pw, y + r() * ph, 2 + r() * 4, 2 + r() * 4); } };
      for (let y = 0; y < h; y += 9 * PX) paint(w / 2 - .06 * PX, y + PX, .12 * PX, 3 * PX);
      for (const x of [.5 * PX, w - .62 * PX]) paint(x, 0, .12 * PX, h);
      // a drain cover near each kerb and a manhole in one lane
      for (const x of [.75 * PX, w - 1.15 * PX]) { g.fillStyle = '#151515'; g.fillRect(x, h * .4, .4 * PX, .9 * PX); g.strokeStyle = '#3a3a3a'; g.lineWidth = 3;
        for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(x + 4, h * .4 + 6 + k * 6); g.lineTo(x + .4 * PX - 4, h * .4 + 6 + k * 6); g.stroke(); } }
      g.fillStyle = '#232220'; g.beginPath(); g.arc(w * .3, h * .7, .32 * PX, 0, 7); g.fill(); g.strokeStyle = '#3d3a36'; g.lineWidth = 4; g.stroke();
      return { map: texOf(col), rough: texOf(rough, false), normal: normalFrom(ht, 1.2) };
    });
  }
  // paving: 8 m by 16 m before it repeats, slabs a little uneven in colour, and the dirt a pavement gathers: dark
  // grime along the kerb and the walls, drip stains, gum, a spill or two, oil where cars stood, tyre scuffs
  const PAVE = [8, 16];
  function pavingTiles() {
    return once('paving', () => {
      const PX = 48, w = PAVE[0] * PX, h = PAVE[1] * PX, S = .6 * PX, r = rng(9), col = canvas(w, h), g = col.getContext('2d'), ht = canvas(w, h), b = ht.getContext('2d');
      const ro = canvas(w, h), q = ro.getContext('2d');
      g.fillStyle = '#7e7b75'; g.fillRect(0, 0, w, h); b.fillStyle = '#c8c8c8'; b.fillRect(0, 0, w, h); q.fillStyle = '#9a9a9a'; q.fillRect(0, 0, w, h);
      for (let y = 0; y < h / S; y++) for (let x = 0; x < w / S; x++) { const v = 118 + r() * 26; g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(x * S + 1, y * S + 1, S - 2, S - 2);
        if (r() < .04) { g.fillStyle = 'rgba(30,28,25,.35)'; g.fillRect(x * S + 1, y * S + 1, S - 2, S - 2); } }   // a slab replaced, darker
      // the joints are real gaps between the slabs (see slabs()); here only the grit that collects along them
      g.strokeStyle = 'rgba(30,28,25,.45)'; g.lineWidth = 2;
      for (let i = 0; i <= w / S; i++) { g.beginPath(); g.moveTo(i * S, 0); g.lineTo(i * S, h); g.stroke(); }
      for (let i = 0; i <= h / S; i++) { g.beginPath(); g.moveTo(0, i * S); g.lineTo(w, i * S); g.stroke(); }
      for (let i = 0; i < 9000; i++) { const v = 150 + r() * 105; b.fillStyle = `rgb(${v},${v},${v})`; b.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      grain(g, w, h, 40000, .35, false, r); grain(g, w, h, 12000, .18, true, r);
      const blot = (x, y, rad, rgba, n = 7) => { for (let k = 0; k < n; k++) { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x + (r() - .5) * rad, y + (r() - .5) * rad, rad * (.4 + r() * .6), rad * (.3 + r() * .5), r() * 3, 0, 7); g.fill(); } };
      // grime: darker along both long edges (the kerb on one side, the wall on the other), fading inwards
      for (const [x0, x1] of [[0, .9 * PX], [w - .9 * PX, w]]) { const gr = g.createLinearGradient(x0, 0, x1, 0); const dark = 'rgba(18,16,14,.55)', none = 'rgba(18,16,14,0)';
        gr.addColorStop(0, x0 === 0 ? dark : none); gr.addColorStop(1, x0 === 0 ? none : dark); g.fillStyle = gr; g.fillRect(x0, 0, x1 - x0, h); }
      // big damp and dirt patches, coffee and drink spills, oil, rust from a sign post
      for (let i = 0; i < 16; i++) blot(r() * w, r() * h, (.3 + r() * 1.1) * PX, `rgba(${18 + r() * 14},${16 + r() * 10},${12 + r() * 8},${.12 + r() * .18})`);
      for (let i = 0; i < 5; i++) blot(r() * w, r() * h, (.15 + r() * .3) * PX, 'rgba(60,34,14,.3)', 4);
      for (let i = 0; i < 4; i++) { const x = r() * w, y = r() * h; blot(x, y, .5 * PX, 'rgba(8,8,10,.45)', 5); q.fillStyle = 'rgba(30,30,30,.6)'; q.beginPath(); q.arc(x, y, .35 * PX, 0, 7); q.fill(); }
      for (let i = 0; i < 3; i++) blot(r() * w, r() * h, .25 * PX, 'rgba(90,40,10,.35)', 3);
      // drips from awnings and ledges: a line of small dark spots along the wall side
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(15,14,12,${.15 + r() * .3})`; g.beginPath(); g.arc(w - (.2 + r() * .5) * PX, r() * h, 1 + r() * 3, 0, 7); g.fill(); }
      // chewing gum: flat pale-grey and black discs, lots of them
      for (let i = 0; i < 220; i++) { const v = r() < .7 ? 38 + r() * 25 : 95 + r() * 25; g.fillStyle = `rgba(${v},${v},${v - 4},${.35 + r() * .35})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, 7); g.fill(); }
      // cigarette ends and grit along the joints, a few cracked slabs
      for (let i = 0; i < 25; i++) { g.save(); g.translate(r() * w, r() * h); g.rotate(r() * 6); g.fillStyle = r() < .6 ? 'rgba(170,160,140,.7)' : 'rgba(120,80,45,.7)'; g.fillRect(0, 0, 3, 1); g.restore(); }
      g.strokeStyle = 'rgba(15,14,12,.8)'; b.strokeStyle = '#8a8a8a'; g.lineWidth = b.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) { let x = r() * w, y = r() * h; for (const c of [g, b]) { c.beginPath(); c.moveTo(x, y); let xx = x, yy = y; for (let j = 0; j < 5; j++) { xx += (r() - .5) * 20; yy += (r() - .5) * 20; c.lineTo(xx, yy); } c.stroke(); } }
      return { map: texOf(col), normal: normalFrom(ht, 3), rough: texOf(ro, false) };
    });
  }
  // paving slabs as solid pieces: 0.6 m square with a joint between, each sitting a little high or low and tipped a
  // little, the way slabs settle. The dirt is painted by where a spot is on the pavement, not by slab, so a stain
  // runs on across the joints as a real one does.
  function slabs(x0, w, len, top, seed) {
    const S = .6, gap = .006, r = rng(seed), pos = [], uv = [], z0 = -len / 2, sides = [];
    const quad = (a, b, c, d) => { for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); uv.push((p[0] - x0) / PAVE[0], (p[2] - z0) / PAVE[1]); } };
    for (let x = x0; x < x0 + w - .05; x += S) for (let z = z0; z < z0 + len - .05; z += S) {
      const ax = x + gap / 2, bx = Math.min(x + S, x0 + w) - gap / 2, az = z + gap / 2, bz = Math.min(z + S, z0 + len) - gap / 2;
      const lift = (r() - .5) * .006 - (r() < .03 ? .006 : 0), tx = (r() - .5) * .004, tz = (r() - .5) * .004, h = (px, pz) => top + lift + tx * (px - ax) / S + tz * (pz - az) / S;
      const A = [ax, h(ax, az), az], B = [bx, h(bx, az), az], C = [bx, h(bx, bz), bz], D = [ax, h(ax, bz), bz], lo = top - .008;
      quad(A, D, C, B);                                                       // the top
      sides.push([[ax, lo, az], A, B, [bx, lo, az]], [[bx, lo, az], B, C, [bx, lo, bz]], [[bx, lo, bz], C, D, [ax, lo, bz]], [[ax, lo, bz], D, A, [ax, lo, az]]);
    }
    const tops = pos.length / 3; for (const q of sides) quad(...q);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    g.addGroup(0, tops, 0); g.addGroup(tops, pos.length / 3 - tops, 1);
    return g;
  }
  World.custom.street = P => {
    const width = clamp(+P.roadWidth || 12, 4, 40), side = clamp(P.pavement != null && P.pavement !== '' ? +P.pavement : 4, 0, 20), len = clamp(+P.size?.[2] || 200, 10, 2000), kerb = .14;
    const key = `street|${width}|${side}|${len}`;
    const c = once(key, () => {
      const rt = roadTiles(width), road = new T.MeshStandardMaterial({ map: rt.map.clone(), roughnessMap: rt.rough.clone(), normalMap: rt.normal.clone(), roughness: 1, metalness: 0, normalScale: new T.Vector2(.25, .25), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      // drawn over any floor under it, however far off: a few centimetres apart is too close for the depth buffer at a distance
      for (const t of [road.map, road.roughnessMap, road.normalMap]) { t.repeat.set(1, len / 24); t.needsUpdate = true; }
      const pv = pavingTiles(), pave = new T.MeshStandardMaterial({ map: pv.map.clone(), normalMap: pv.normal.clone(), roughnessMap: pv.rough.clone(), roughness: .9, normalScale: new T.Vector2(.25, .25) });
      for (const t of [pave.map, pave.normalMap, pave.roughnessMap]) { t.repeat.set((side - .3) / PAVE[0], len / PAVE[1]); t.needsUpdate = true; }
      for (const t of [pave.map, pave.normalMap, pave.roughnessMap]) { t.repeat.set(1, 1); t.needsUpdate = true; }
      const grout = new T.MeshBasicMaterial({ color: new T.Color('#0b0a09') });  // the joints: deep and narrow, no light gets in
      const stone = new T.MeshStandardMaterial({ color: new T.Color('#8a8781'), roughness: .5 });
      for (const m of [pave, stone, road]) m.userData.wets = true;
      const rg = new T.PlaneGeometry(width, len); rg.rotateX(-Math.PI / 2); rg.translate(0, .02, 0);
      const parts = [{ g: rg, m: road }];
      if (side > 0) for (const s of [-1, 1]) {
        // the bed the slabs are laid on, dark in the joints, then the slabs themselves
        const x0 = width / 2 + .3, pw = side - .3;
        const pg = new T.BoxGeometry(pw, kerb - .007, len); pg.translate(s * (x0 + pw / 2), (kerb - .007) / 2, 0); parts.push({ g: pg, m: grout });
        parts.push({ g: slabs(s > 0 ? x0 : -x0 - pw, pw, len, kerb, 7 + (s > 0)), m: [pave, grout] });
        const kg = new T.BoxGeometry(.3, kerb, len); kg.translate(s * (width / 2 + .15), kerb / 2, 0); parts.push({ g: kg, m: stone });
      }
      return parts;
    });
    const g = new T.Group();
    for (const p of c) { const m = new T.Mesh(p.g, p.m); m.receiveShadow = true; g.add(m); }
    g.scale.setScalar(M); return g;
  };

  // ----- a building: a facade of storeys and rooms -----
  const MATERIALS = {
    brick: { base: '#5a3328', mortar: '#3a2a24', unit: [.24, .075] },
    darkbrick: { base: '#3a2622', mortar: '#2a221f', unit: [.24, .075] },
    concrete: { base: '#6a6864', mortar: '#55534f', unit: [1.5, 3.2] },
    tile: { base: '#8c8a82', mortar: '#6e6c66', unit: [.3, .3] },
    panel: { base: '#3c4046', mortar: '#25282c', unit: [1.2, 1.6] },
  };
  const ROOMS = [['#ffcf8a', .9], ['#ffe2b0', .8], ['#fff1d6', .7], ['#cfe0ff', .5], ['#ffd59c', .85]];
  const SHOPS = ['#fff4e0', '#f0f6ff', '#ffe9c4', '#ffffff', '#e8fff4'];
  function facade(P, w, h) {
    const key = ['fac', w, h, P.seed, P.wall, P.lit, P.shops].join('|');
    return once(key, () => {
      const PX = 40, W = Math.round(w * PX), H = Math.round(h * PX), r = rng((+P.seed || 1) * 7919);
      const wall = MATERIALS[P.wall] || Object.values(MATERIALS)[Math.floor(r() * 5)];
      const col = canvas(W, H), g = col.getContext('2d'), em = canvas(W, H), e = em.getContext('2d'), ht = canvas(W, H), b = ht.getContext('2d'), ro = canvas(W, H), q = ro.getContext('2d');
      g.fillStyle = wall.base; g.fillRect(0, 0, W, H); e.fillStyle = '#000'; e.fillRect(0, 0, W, H); b.fillStyle = '#c0c0c0'; b.fillRect(0, 0, W, H); q.fillStyle = '#d8d8d8'; q.fillRect(0, 0, W, H);
      // the wall's units (bricks, panels) and its dirt: streaks down from every ledge, darker near the ground
      const [ux, uy] = wall.unit;
      g.strokeStyle = wall.mortar; b.strokeStyle = '#909090'; g.lineWidth = b.lineWidth = Math.max(1, uy * PX * .12);
      for (let y = 0, row = 0; y < H; y += uy * PX, row++) {
        for (const c of [g, b]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
        for (let x = (row % 2) * ux * PX / 2; x < W; x += ux * PX) for (const c of [g, b]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + uy * PX); c.stroke(); }
      }
      for (let i = 0; i < W * H / 60; i++) { const v = r(); g.fillStyle = v < .5 ? `rgba(0,0,0,${r() * .12})` : `rgba(255,255,255,${r() * .05})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3); }
      const dirt = g.createLinearGradient(0, H - 4 * PX, 0, H); dirt.addColorStop(0, 'rgba(0,0,0,0)'); dirt.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = dirt; g.fillRect(0, 0, W, H);
      const storey = 3.1, ground = 4.4, floors = Math.max(0, Math.floor((h - ground) / storey));
      const bays = Math.max(1, Math.round(w / (1.7 + r() * .7))), bay = w / bays, ww = Math.min(bay - .45, 1 + r() * .5), wh = 1.45 + r() * .3;
      const lit = clamp((P.lit ?? 45) / 100, 0, 1);
      // upper floors: each window a room
      for (let f = 0; f < floors; f++) {
        const yTop = H - (ground + (f + 1) * storey) * PX, sill = yTop + (storey - wh - .55) * PX;
        // a ledge along each floor, and the streak of grime below it
        g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, yTop + storey * PX - 4, W, 4); b.fillStyle = '#e0e0e0'; b.fillRect(0, yTop + storey * PX - 5, W, 5);
        const roomOn = r() < .9;
        for (let i = 0; i < bays; i++) {
          const x = (i * bay + (bay - ww) / 2) * PX, y = sill, pw = ww * PX, ph = wh * PX;
          // the opening: set back from the wall, a stone sill under it
          b.fillStyle = '#303030'; b.fillRect(x - 3, y - 3, pw + 6, ph + 6); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - 3, y - 3, pw + 6, ph + 6);
          g.fillStyle = '#7d7a73'; g.fillRect(x - 6, y + ph + 2, pw + 12, 6); b.fillStyle = '#ffffff'; b.fillRect(x - 6, y + ph + 2, pw + 12, 6);
          const on = roomOn && r() < lit;
          if (on) {
            const [tone, power] = ROOMS[Math.floor(r() * ROOMS.length)], tv = r() < .08;
            // the room: brighter at the ceiling where its lamp is, a back wall, maybe a curtain, blinds or a silhouette
            const gr = e.createLinearGradient(0, y, 0, y + ph); gr.addColorStop(0, tone); gr.addColorStop(.55, tone); gr.addColorStop(1, '#3a2a1c');
            e.globalAlpha = .45 + power * .55 * (.6 + r() * .4); e.fillStyle = tv ? '#7aa8ff' : gr; e.fillRect(x, y, pw, ph);
            if (r() < .4) { e.fillStyle = 'rgba(30,20,12,.55)'; e.fillRect(x + pw * (.55 + r() * .3), y + ph * .45, pw * .3, ph * .55); }        // furniture
            const cover = r();
            if (cover < .3) { const cw = pw * (.25 + r() * .3), cc = ['#b03a2e', '#e8d8b8', '#5a7a4a', '#c99a3a', '#7a5a8a'][Math.floor(r() * 5)];
              e.globalAlpha = .9; e.fillStyle = cc; e.fillRect(x, y, cw, ph); e.fillRect(x + pw - cw * .8, y, cw * .8, ph); }                            // curtains, lit through
            else if (cover < .5) { e.globalAlpha = .55; e.fillStyle = '#1a140c'; for (let k = 0; k < ph; k += 5) e.fillRect(x, y + k, pw, 2); }  // blinds
            e.globalAlpha = 1;
            g.fillStyle = '#151210'; g.fillRect(x, y, pw, ph);
            q.fillStyle = '#101010'; q.fillRect(x, y, pw, ph);
          } else {
            // dark glass: a faint sky in it, darker at the bottom
            const gr = g.createLinearGradient(0, y, 0, y + ph); gr.addColorStop(0, '#1d2630'); gr.addColorStop(1, '#0a0d11'); g.fillStyle = gr; g.fillRect(x, y, pw, ph);
            q.fillStyle = '#0c0c0c'; q.fillRect(x, y, pw, ph);
            if (r() < .25) { e.fillStyle = 'rgba(40,50,70,.25)'; e.fillRect(x, y, pw, ph); }
          }
          // the frame and its glazing bar
          g.fillStyle = r() < .5 ? '#d8d4ca' : '#2a2a2a'; const fw = 3;
          g.fillRect(x, y, pw, fw); g.fillRect(x, y + ph - fw, pw, fw); g.fillRect(x, y, fw, ph); g.fillRect(x + pw - fw, y, fw, ph); g.fillRect(x + pw / 2 - 1.5, y, 3, ph);
          e.fillStyle = '#000'; e.fillRect(x + pw / 2 - 1.5, y, 3, ph); e.fillRect(x, y, pw, fw); e.fillRect(x, y + ph - fw, pw, fw);
        }
      }
      // the ground floor: shopfronts, each a lit window under a fascia, or a shutter pulled down
      const shopsN = Math.max(1, Math.round(w / (4 + r() * 2))), sw = w / shopsN, shops = [];
      for (let i = 0; i < shopsN; i++) {
        const x0 = (i * sw + .25) * PX, x1 = ((i + 1) * sw - .25) * PX, top = H - ground * PX, fascia = top + .25 * PX, glassTop = fascia + .75 * PX, bottom = H - .35 * PX;
        g.fillStyle = '#1a1a1c'; g.fillRect(x0, fascia, x1 - x0, .7 * PX); b.fillStyle = '#e8e8e8'; b.fillRect(x0, fascia, x1 - x0, .7 * PX);
        if (r() < .15 && P.shops !== 'open') {
          // a steel shutter
          g.fillStyle = '#55585c'; g.fillRect(x0, glassTop, x1 - x0, bottom - glassTop);
          for (let y = glassTop; y < bottom; y += 6) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, y, x1 - x0, 2); b.fillStyle = '#707070'; b.fillRect(x0, y, x1 - x0, 2); }
          continue;
        }
        const tone = SHOPS[Math.floor(r() * SHOPS.length)], gr = e.createLinearGradient(0, glassTop, 0, bottom);
        gr.addColorStop(0, tone); gr.addColorStop(.7, mix(tone, '#806a50', .35)); gr.addColorStop(1, '#3a3028');
        e.globalAlpha = .38 + r() * .22; e.fillStyle = gr; e.fillRect(x0, glassTop, x1 - x0, bottom - glassTop); e.globalAlpha = 1;
        // shelves and goods, people inside
        // inside: rows of shelving and goods, soft (seen through glass, out of focus), a counter, the odd person
        e.save(); e.beginPath(); e.rect(x0, glassTop, x1 - x0, bottom - glassTop); e.clip(); e.filter = 'blur(3px)';
        for (let k = 0; k < 3; k++) { const sy = glassTop + (.35 + k * .2) * (bottom - glassTop);
          for (let xx = x0 + 4; xx < x1 - 4; xx += 6 + r() * 10) { e.fillStyle = `rgba(${60 + r() * 120},${50 + r() * 90},${40 + r() * 70},${.25 + r() * .3})`; e.fillRect(xx, sy - 10 - r() * 14, 5 + r() * 8, 12 + r() * 12); }
          e.fillStyle = 'rgba(40,32,26,.35)'; e.fillRect(x0, sy, x1 - x0, 4); }
        e.fillStyle = 'rgba(30,24,20,.5)'; e.fillRect(x0 + (x1 - x0) * (.1 + r() * .4), bottom - .95 * PX, (x1 - x0) * .35, .95 * PX);
        for (let k = 0; k < 2; k++) if (r() < .45) { const px = x0 + r() * (x1 - x0 - 30); e.fillStyle = 'rgba(25,20,18,.7)';
          e.beginPath(); e.ellipse(px + .2 * PX, bottom - .85 * PX, .2 * PX, .85 * PX, 0, 0, 7); e.fill(); e.beginPath(); e.arc(px + .2 * PX, bottom - 1.78 * PX, .11 * PX, 0, 7); e.fill(); }
        e.restore();
        shops.push({ x: (x0 + x1) / 2 / PX, w: (x1 - x0) / PX, tone });
        g.fillStyle = '#0c0c0d'; g.fillRect(x0, glassTop, x1 - x0, bottom - glassTop); q.fillStyle = '#080808'; q.fillRect(x0, glassTop, x1 - x0, bottom - glassTop);
        // mullions and a door
        g.fillStyle = '#2b2b2d'; e.fillStyle = '#000'; for (const xm of [x0, x1 - 4, (x0 + x1) / 2]) { g.fillRect(xm, glassTop, 4, bottom - glassTop); e.fillRect(xm, glassTop, 4, bottom - glassTop); }
        // the fascia's name, lit from above
        const names = ['MARKET', 'PHARMACY', 'NOODLE HOUSE', 'DELI', 'BOOKS', 'LAUNDRY', 'CAFE', 'KEBAB', 'HAIR', 'OPTICIAN', 'GROCER', 'BAKERY'];
        const nm = names[Math.floor(r() * names.length)], nc = ['#f4efe2', '#ffd36a', '#ff6a5a', '#7ad8ff', '#ffffff'][Math.floor(r() * 5)];
        e.font = `700 ${Math.round(.42 * PX)}px Helvetica, Arial, sans-serif`; e.textAlign = 'center'; e.textBaseline = 'middle'; e.fillStyle = nc; e.globalAlpha = .9;
        e.fillText(nm, (x0 + x1) / 2, fascia + .35 * PX, x1 - x0 - 20); e.globalAlpha = 1;
        g.font = e.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = nc; g.fillText(nm, (x0 + x1) / 2, fascia + .35 * PX, x1 - x0 - 20);
      }
      // a cornice at the top
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, W, .5 * PX); b.fillStyle = '#ffffff'; b.fillRect(0, 0, W, .45 * PX);
      return { map: texOf(col), emissive: texOf(em), normal: normalFrom(ht, 2.2), rough: texOf(ro, false), shops };
    });
  }
  const spillTex = () => once('spill', () => { const cv = canvas(64, 128), g = cv.getContext('2d');
    // across: soft at both ends; along (away from the glass, which is at the top of the picture): fading fast
    const along = g.createLinearGradient(0, 0, 0, 128); along.addColorStop(0, 'rgba(255,255,255,1)'); along.addColorStop(.35, 'rgba(255,255,255,.35)'); along.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = along; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = 'destination-in'; const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(.2, 'rgba(0,0,0,1)'); across.addColorStop(.8, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = across; g.fillRect(0, 0, 64, 128);
    const t = new T.CanvasTexture(cv); return t; });
  const wasBuilding = World.custom.building;
  World.custom.building = (P, t) => {
    if (P.style === 'simple') return wasBuilding(P, t);
    const [w, h, d] = (P.size || [12, 30, 12]).map(Number), key = ['bld', w, h, d, P.seed, P.wall, P.lit, P.glow, P.shops].join('|');
    const c = once(key, () => {
      const f = facade(P, w, h), side = facade({ ...P, seed: (+P.seed || 1) + 101, shops: 'open' }, d, h);
      const make = (fx, rep) => new T.MeshStandardMaterial({ map: fx.map, emissive: 0xffffff, emissiveMap: fx.emissive, emissiveIntensity: clamp(+P.glow || 1.4, 0, 20),
        normalMap: fx.normal, roughnessMap: fx.rough, roughness: .85, metalness: 0, normalScale: new T.Vector2(1.2, 1.2) });
      const front = make(f), sideM = make(side), roof = new T.MeshStandardMaterial({ color: '#2a2a2c', roughness: .9 });
      const geo = new T.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0);
      // a cornice that juts out, and the odd air-conditioning box on the wall
      const extra = [];
      const corn = new T.BoxGeometry(w + .3, .35, d + .3); corn.translate(0, h - .2, 0); extra.push(corn);
      const r = rng((+P.seed || 1) * 31);
      for (let i = 0; i < Math.round(w * h / 60); i++) { if (r() > .5) continue; const bx = new T.BoxGeometry(.8, .55, .35);
        bx.translate((r() - .5) * (w - 1.5), 4.6 + Math.floor(r() * Math.max(1, (h - 6) / 3.1)) * 3.1 + .2, d / 2 + .17); extra.push(bx); }
      const ex = T.BufferGeometryUtils.mergeGeometries(extra.map(e => e.index ? e.toNonIndexed() : e));
      // the light a lit shop window throws out across the pavement in front of it: a warm pool, brightest at the glass
      const spill = f.shops.map(sh => { const pg = new T.PlaneGeometry(sh.w * 1.15, 3.2); pg.rotateX(-Math.PI / 2); pg.translate(sh.x - w / 2, .16, d / 2 + 1.6);
        const m = new T.MeshBasicMaterial({ map: spillTex(), color: new T.Color(sh.tone).multiplyScalar(.1 * clamp(+P.glow || 1.4, 0, 20) / 1.4), transparent: true, blending: T.AdditiveBlending, depthWrite: false });
        return new T.Mesh(pg, m); });
      return { geo, mats: [sideM, sideM, roof, roof, front, front], ex, spill, exMat: new T.MeshStandardMaterial({ color: '#6c6c68', roughness: .6, metalness: .2 }) };
    });
    const g = new T.Group(), mesh = new T.Mesh(c.geo, c.mats); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
    const ex = new T.Mesh(c.ex, c.exMat); ex.castShadow = true; g.add(ex);
    for (const sp of c.spill) g.add(sp.clone());
    g.scale.setScalar(M); return g;
  };

  // ----- a hanging sign: neon tubes or a light box, out over the pavement, lit on both faces -----
  function signFace(text, color, kind, w, h) {
    return once(['sign', text, color, kind, w, h].join('|'), () => {
      const PX = 160, W = Math.round(w * PX), H = Math.round(h * PX), col = canvas(W, H), g = col.getContext('2d'), em = canvas(W, H), e = em.getContext('2d');
      const letters = [...String(text || 'BAR')], vertical = h > w * 1.5;
      g.fillStyle = kind === 'box' ? '#f2efe8' : '#0b0b0d'; g.fillRect(0, 0, W, H);
      e.fillStyle = kind === 'box' ? '#c8c4b8' : '#000'; e.fillRect(0, 0, W, H);
      const draw = (c, glow) => {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const n = vertical ? letters.length : 1, size = vertical ? Math.min(W * .72, H / n * .82) : Math.min(H * .62, W / Math.max(3, letters.length) * 1.5);
        c.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        const spots = vertical ? letters.map((l, i) => [l, W / 2, (i + .5) * H / n]) : [[letters.join(''), W / 2, H / 2]];
        for (const [l, x, y] of spots) {
          if (kind === 'box') { c.fillStyle = color; c.fillText(l, x, y); continue; }
          // a glass tube: a glow round it, the coloured tube, a hot core
          c.lineJoin = 'round';
          if (glow) { c.shadowColor = color; c.shadowBlur = size * .35; }
          c.strokeStyle = color; c.lineWidth = size * .09; c.strokeText(l, x, y);
          c.shadowBlur = 0; c.strokeStyle = glow ? mix(color, '#ffffff', .65) : mix(color, '#000', .2); c.lineWidth = size * .035; c.strokeText(l, x, y);
        }
      };
      draw(g, false); draw(e, true);
      // the frame of the box
      for (const c of [g]) { c.strokeStyle = '#1c1c1e'; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8); }
      return { map: texOf(col), emissive: texOf(em) };
    });
  }
  function mix(a, b, k) { const x = new T.Color(a).lerp(new T.Color(b), k); return '#' + x.getHexString(); }
  World.custom.sign = (P, t = 0) => {
    const [w, h, d] = (P.size || [.7, 2.6, .22]).map(Number), color = P.color || '#ff3b6b', kind = P.kind === 'box' ? 'box' : 'neon';
    const on = P.flicker ? (Math.sin(t * 29.7) * Math.sin(t * 9.3 + 2) > -.4 ? 1 : .1) : 1;
    const f = signFace(P.text || 'BAR', color, kind, w, h);
    const key = ['signm', P.text, color, kind, w, h, d, P.glow].join('|');
    const c = once(key, () => {
      const face = new T.MeshStandardMaterial({ map: f.map, emissive: 0xffffff, emissiveMap: f.emissive, emissiveIntensity: clamp(+P.glow || 4, 0, 30), roughness: .3, metalness: 0 });
      const edge = new T.MeshStandardMaterial({ color: '#141416', roughness: .4, metalness: .5 });
      const box = new T.BoxGeometry(d, h, w); // facing along x: it hangs out from a wall that faces +x or -x
      const bracket = new T.BoxGeometry(.6, .05, .05); bracket.translate(0, h / 2 + .05, 0);
      return { box, bracket, mats: [face, face, edge, edge, edge, edge], edge, face };
    });
    c.face.emissiveIntensity = clamp(+P.glow || 4, 0, 30) * on;
    const g = new T.Group(), m = new T.Mesh(c.box, c.mats); g.add(m, new T.Mesh(c.bracket, c.edge));
    if (P.lightUp !== false) { const l = new T.PointLight(new T.Color(color), 2.5 * on * clamp(+P.glow || 4, 0, 30) / 4, 9 * M, 2); l.position.set(0, 0, 0); g.add(l); }
    g.add(halo(color, Math.max(w, h) * 1.6, .5 * on));
    g.scale.setScalar(M); return g;
  };

  // ----- light in wet air: a soft glow round a light, bigger than the light -----
  const haloTex = once('halo', () => { const cv = canvas(128, 128), g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.2, 'rgba(255,255,255,.35)'); gr.addColorStop(.5, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(cv); return t; });
  const haloMats = new Map();
  function halo(color, size, strength = .5) {
    const k = color + strength.toFixed(2);
    if (!haloMats.has(k)) haloMats.set(k, new T.SpriteMaterial({ map: haloTex, color: new T.Color(color).multiplyScalar(strength), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    const s = new T.Sprite(haloMats.get(k)); s.scale.set(size, size, 1); s.renderOrder = 5; return s;
  }

  // ----- a lamp post: a pole, an arm out over the road, a head that lights the street -----
  World.custom.lamppost = (P, t = 0) => {
    const hgt = clamp(+P.size?.[1] || 7, 2, 20), reach = clamp(P.reach != null && P.reach !== '' ? +P.reach : 1.6, 0, 6), color = P.color || '#ffc98a';
    const c = once('lamp' + hgt + '|' + reach, () => {
      const metal = new T.MeshStandardMaterial({ color: '#2a2c2e', roughness: .45, metalness: .7 });
      const pole = new T.CylinderGeometry(.06, .1, hgt, 16); pole.translate(0, hgt / 2, 0);
      const base = new T.CylinderGeometry(.16, .18, .5, 16); base.translate(0, .25, 0);
      const arm = new T.CylinderGeometry(.04, .04, reach, 10); arm.rotateZ(Math.PI / 2); arm.translate(reach / 2, hgt - .1, 0);
      const head = new T.BoxGeometry(.6, .12, .28); head.translate(reach, hgt - .14, 0);
      const geo = T.BufferGeometryUtils.mergeGeometries([pole, base, arm, head].map(g => g.toNonIndexed()));
      const lens = new T.PlaneGeometry(.5, .2); lens.rotateX(Math.PI / 2); lens.translate(reach, hgt - .205, 0);
      return { geo, metal, lens };
    });
    const g = new T.Group(); const m = new T.Mesh(c.geo, c.metal); m.castShadow = true; g.add(m);
    const lens = new T.Mesh(c.lens, once('lampLens' + color, () => new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(6), side: T.DoubleSide }))); g.add(lens);
    const s = new T.SpotLight(new T.Color(color), clamp(+P.power || 220, 0, 5000) / 100 * 8, 30 * M, 1.05, .6, 2);
    s.position.set(reach * M, (hgt - .25) * M, 0); s.target.position.set(reach * M, 0, 0); s.castShadow = !!P.shadows;
    const h = halo(color, 2.6, .35); h.position.set(reach, hgt - .3, 0); g.add(h);
    const out = new T.Group(); g.scale.setScalar(M); out.add(g, s, s.target); return out;
  };

  // ----- wires sagging between two points -----
  World.custom.wires = P => {
    const len = clamp(+P.size?.[0] || 20, 1, 200), n = clamp(Math.round(+P.count || 3), 1, 8), sag = clamp(P.sag != null && P.sag !== '' ? +P.sag : .8, 0, 10);
    const c = once(['wires', len, n, sag].join('|'), () => {
      const gs = [];
      for (let i = 0; i < n; i++) { const pts = []; for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push(new T.Vector3((u - .5) * len, -sag * (1 - (2 * u - 1) ** 2) - i * .25, i * .18)); }
        gs.push(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 48, .012, 5, false)); }
      return { geo: T.BufferGeometryUtils.mergeGeometries(gs), mat: new T.MeshStandardMaterial({ color: '#111', roughness: .6 }) };
    });
    const m = new T.Mesh(c.geo, c.mat); m.scale.setScalar(M); return m;
  };

  World.PARTS.push('street', 'sign', 'lamppost', 'wires');
  SceneEd.add('street', { type: 'street', roadWidth: 12, pavement: 4, size: [1, 1, 200] }, 'Street');
  SceneEd.add('sign', { type: 'sign', text: 'BAR', color: '#ff3b6b', kind: 'neon', glow: 4, size: [.7, 2.6, .22] }, 'Hanging sign');
  SceneEd.add('lamppost', { type: 'lamppost', size: [1, 7, 1], reach: 1.6, power: 220, color: '#ffc98a' }, 'Lamp post');
  SceneEd.add('wires', { type: 'wires', count: 3, sag: .8, size: [20, 1, 1] }, 'Overhead wires');
  const opt = (k, v, list) => `<select data-k="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v ?? '') === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  SceneEd.extras.push({
    inspector(P) {
      if (P.type === 'street') return `<div class="hd">Street</div><label class="f"><span>Road m</span><input type="number" step=".5" data-k="roadWidth" value="${+P.roadWidth || 12}"></label>
        <label class="f"><span>Pavement m</span><input type="number" step=".5" data-k="pavement" value="${P.pavement ?? 4}"></label>`;
      if (P.type === 'sign') return `<div class="hd">Hanging sign</div><label class="f wide"><span>Words</span><input data-k="text" value="${esc(P.text || '')}"></label>
        <label class="f"><span>Colour</span><input type="color" data-k="color" value="${P.color || '#ff3b6b'}"></label>
        <label class="f"><span>Kind</span>${opt('kind', P.kind || 'neon', [['neon', 'Neon tubes'], ['box', 'Light box']])}</label>
        <label class="f"><span>Glow</span><input type="number" step=".5" data-k="glow" value="${+P.glow || 4}"></label>
        <label class="f"><span>Flicker</span>${opt('flicker', P.flicker ? '1' : '', [['', 'Steady'], ['1', 'Flickers']])}</label>`;
      if (P.type === 'lamppost') return `<div class="hd">Lamp post</div><label class="f"><span>Power</span><input type="number" step="10" data-k="power" value="${+P.power || 220}"></label>
        <label class="f"><span>Reach m</span><input type="number" step=".1" data-k="reach" value="${P.reach ?? 1.6}"></label>
        <label class="f"><span>Colour</span><input type="color" data-k="color" value="${P.color || '#ffc98a'}"></label>`;
      if (P.type === 'building' && P.style !== 'simple') return `<div class="hd">Facade</div><label class="f"><span>Wall</span>${opt('wall', P.wall || '', [['', 'Mixed'], ...Object.keys(MATERIALS).map(k => [k, k[0].toUpperCase() + k.slice(1)])])}</label>`;
      return '';
    },
  });
  const wasSign = World.custom.sign; World.custom.sign = (P, t) => wasSign({ ...P, flicker: P.flicker === '1' || P.flicker === true }, t);

  // ----- wet: the world's Wet ground darkens and glosses the street's tarmac, paving and kerbs too -----
  World.stageHooks.push(({ B, o }) => {
    const wet = o.ground !== 'ocean' && o.ground !== 'none' ? clamp(+o.wet || 0, 0, 100) / 100 : 0;
    B.props?.traverse(n => { if (!n.isMesh) return; for (const m of Array.isArray(n.material) ? n.material : [n.material]) { if (!m?.userData.wets) continue;
      m.userData.dry ??= { r: m.roughness, c: m.color.clone() }; m.roughness = m.userData.dry.r * (1 - wet * .55); m.color.copy(m.userData.dry.c).multiplyScalar(1 - wet * .35); } });
  });
  // ----- wet ground: what it mirrors is smeared down the way rain-soaked tarmac smears it, broken up by ripples -----
  World.stageHooks.push(({ B }) => {
    const m = B.wetFx?.material; if (!m || m.userData.streaked) return; m.userData.streaked = true;
    m.fragmentShader = m.fragmentShader.replace(/vec4 base = texture2DProj\( tDiffuse, vUv \);/, `
      vec2 q0 = vW.xz / 100.; float n0 = vn(q0 * 3.1) - .5, n1 = vn(q0 * 7.7 + 3.) - .5;
      vec4 uv0 = vUv; uv0.x += (n0 * .003 + n1 * .002) * vUv.w;
      vec4 base = vec4(0.); float wsum = 0.;
      for (int i = 0; i < 12; i++) { float k = float(i) / 11.; float wt = 1. - k * .85; vec4 u = uv0; u.y -= k * .05 * vUv.w; base += texture2DProj(tDiffuse, u) * wt; wsum += wt; }
      base /= wsum;`);
    m.needsUpdate = true;
  });

  return { halo, facade };
})();
