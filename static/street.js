// ---------- street clutter: the things a real street is full of ----------
// Along a kerb or a wall: wheelie bins with their lids, black bin bags slumped in a heap and shining wet, fire
// hydrants, bollards, parking meters, newspaper boxes, a post box. Each built round, bevelled and worn, the same
// for the same seed. And on the buildings: iron fire escapes zig-zagging down the front, drainpipes, a water tank
// or two on the roof. All in metres.
const Street = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const cache = new Map(), once = (k, make) => cache.get(k) || (cache.set(k, make()), cache.get(k));
  const merge = gs => T.BufferGeometryUtils.mergeGeometries(gs.map(g => g.index ? g.toNonIndexed() : g));
  const at = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
  // a box with its edges rounded, as anything moulded or pressed is
  function rbox(w, h, d, r = .02, seg = 3) {
    const s = new T.Shape(), x = w / 2 - r, y = h / 2 - r;
    s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y); s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
    s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y); s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
    const g = new T.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: seg, curveSegments: seg });
    g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g;
  }
  const lathe = (pts, seg = 24) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg);
  // grime: a material's colour darkened at the bottom and in streaks, so nothing looks fresh from the factory
  const grimeTex = once('grime', () => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d'), r = rng(17);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#fff'); gr.addColorStop(.7, '#e6e6e6'); gr.addColorStop(1, '#7a7a7a'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,55,50,${.05 + r() * .12})`; g.fillRect(r() * 64, r() * 120, 1 + r() * 3, 40 + r() * 140); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r() * .1})`; g.fillRect(r() * 64, r() * 256, 1, 1); }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
  });
  const mats = new Map();
  function mat(key, o) {
    if (!mats.has(key)) { const m = new T.MeshPhysicalMaterial({ roughness: .6, metalness: 0, ...o }); m.userData.wets = !!o.wets; mats.set(key, m); }
    return mats.get(key);
  }
  const PLASTIC = c => mat('plastic' + c, { color: new T.Color(c), roughness: .55, clearcoat: .2, clearcoatRoughness: .5, map: grimeTex, wets: true });
  const PAINT = c => mat('paint' + c, { color: new T.Color(c), roughness: .42, metalness: .25, clearcoat: .5, clearcoatRoughness: .3, map: grimeTex, wets: true });
  const IRON = mat('iron', { color: new T.Color('#1c1d1f'), roughness: .5, metalness: .8, map: grimeTex, wets: true });
  const STEEL = mat('steel', { color: new T.Color('#8a8d90'), roughness: .3, metalness: 1, map: grimeTex, wets: true });
  // bin bags: thin black plastic, very glossy, a soft sheen where it stretches
  const BAG = mat('bag', { color: new T.Color('#0b0b0c'), roughness: .16, clearcoat: 1, clearcoatRoughness: .08, sheen: .5, sheenColor: new T.Color('#3a3d44'), sheenRoughness: .3, wets: true });

  // ----- the pieces -----
  const PIECES = {
    // a wheelie bin: tapered body, a lid that overhangs, two wheels and an axle
    bin: r => {
      const c = ['#23452c', '#1d2c4a', '#3a3a3c', '#6a4a12', '#5a1c18'][Math.floor(r() * 5)];
      const body = rbox(.58, 1.0, .72, .04); body.translate(0, .55, 0);
      const pos = body.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = .86 + .14 * clamp((y - .05) / 1, 0, 1); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
      body.computeVertexNormals();
      const lid = rbox(.62, .05, .8, .02); lid.translate(0, 1.08, .02); lid.rotateX(r() < .2 ? -.25 : 0);
      const handle = new T.CylinderGeometry(.018, .018, .5, 10); handle.rotateZ(Math.PI / 2); handle.translate(0, 1.0, -.4);
      const wheels = [-.24, .24].map(x => { const w = new T.CylinderGeometry(.1, .1, .05, 20); w.rotateZ(Math.PI / 2); w.translate(x, .1, -.32); return w; });
      return [[merge([body, lid]), PLASTIC(c)], [merge([handle]), PLASTIC(c)], [merge(wheels), mat('tyre', { color: new T.Color('#111'), roughness: .8 })]];
    },
    // a heap of black bags: lumps squashed and leaning on each other, knotted at the top
    bags: r => {
      const gs = [], n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const s = .26 + r() * .14, g = new T.SphereGeometry(s, 22, 16), p = g.attributes.position;
        for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
          const wob = 1 + .12 * Math.sin(x * 19 + i) * Math.sin(z * 17 + y * 13) + .06 * Math.sin(y * 31 + i * 3);
          p.setXYZ(k, x * wob * 1.05, (y < 0 ? y * .55 : y * .9) * wob, z * wob); }
        // the knot
        const knot = new T.ConeGeometry(.05, .12, 10); knot.translate(0, s * .9 + .04, 0);
        const bag = merge([g, knot]); bag.computeVertexNormals();
        bag.rotateZ((r() - .5) * .5); bag.rotateX((r() - .5) * .4);
        gs.push(at(bag, (r() - .5) * .7, s * .55 + (i > 2 ? .25 : 0), (r() - .5) * .5, r() * 6));
      }
      return [[merge(gs), BAG]];
    },
    // a fire hydrant: base flange, barrel, bonnet, caps and nuts
    hydrant: r => {
      const red = PAINT(r() < .7 ? '#a3191a' : '#c9a21a');
      const barrel = lathe([[0, 0], [.16, 0], [.16, .05], [.12, .07], [.11, .1], [.11, .55], [.13, .58], [.13, .62], [.1, .66], [.06, .74], [.03, .78], [0, .79]], 28);
      const caps = [-1, 1].map(s => { const c = new T.CylinderGeometry(.06, .065, .1, 18); c.rotateZ(Math.PI / 2); c.translate(s * .14, .45, 0); return c; });
      const front = new T.CylinderGeometry(.075, .08, .1, 18); front.rotateX(Math.PI / 2); front.translate(0, .42, .13);
      const nut = new T.CylinderGeometry(.025, .03, .05, 5); nut.translate(0, .8, 0);
      const chain = new T.TorusGeometry(.08, .006, 6, 24, Math.PI); chain.rotateY(Math.PI / 2); chain.rotateZ(Math.PI); chain.translate(.14, .38, 0);
      return [[merge([barrel, ...caps, front, nut]), red], [chain, STEEL]];
    },
    // a bollard: a steel post, a reflective band near the top
    bollard: r => {
      const post = lathe([[0, 0], [.085, 0], [.085, .85], [.07, .92], [.03, .96], [0, .965]], 24);
      const band = new T.CylinderGeometry(.087, .087, .06, 24); band.translate(0, .78, 0);
      return [[post, r() < .5 ? IRON : PAINT('#2b2d30')], [band, mat('reflect', { color: new T.Color('#c9c9c2'), roughness: .25, metalness: .6, emissive: new T.Color('#191919') })]];
    },
    // a parking meter: a post and its head with a little window
    meter: r => {
      const post = new T.CylinderGeometry(.03, .035, 1.15, 12); post.translate(0, .575, 0);
      const head = rbox(.2, .32, .14, .03); head.translate(0, 1.32, 0);
      const window_ = new T.PlaneGeometry(.12, .07); window_.translate(0, 1.38, .071);
      return [[merge([post]), IRON], [head, PAINT('#3a3e44')], [window_, mat('meterglass', { color: new T.Color('#0a0c0e'), roughness: .05, emissive: new T.Color('#0c2a14'), clearcoat: 1 })]];
    },
    // a newspaper box: steel, a window in its door, on short legs
    paperbox: r => {
      const c = ['#1d4f8a', '#b2221d', '#e2c11a', '#1f6a3a'][Math.floor(r() * 4)];
      const box = rbox(.5, .8, .45, .02); box.translate(0, .55, 0);
      const win = new T.PlaneGeometry(.38, .3); win.translate(0, .7, .226);
      const legs = [-.2, .2].flatMap(x => [-.15, .15].map(z => { const l = new T.CylinderGeometry(.015, .015, .15, 6); l.translate(x, .075, z); return l; }));
      return [[box, PAINT(c)], [win, mat('boxglass', { color: new T.Color('#11161b'), roughness: .04, clearcoat: 1, metalness: .2 })], [merge(legs), IRON]];
    },
  };
  const KINDS = Object.keys(PIECES);

  // ----- along a kerb or a wall -----
  World.custom.clutter = P => {
    const len = clamp(+P.size?.[2] || 40, 2, 400), seed = +P.seed || 3, want = String(P.kinds || 'bin,bags,hydrant,bollard,meter,paperbox').split(',').filter(k => PIECES[k]);
    const every = clamp(+P.every || 3.5, .6, 50);
    const c = once(['clut', len, seed, want.join(), every].join('|'), () => {
      const r = rng(seed * 977), byMat = new Map();
      for (let z = -len / 2 + r() * every; z < len / 2; z += every * (.6 + r() * .8)) {
        const kind = want[Math.floor(r() * want.length)], turn = kind === 'bags' || kind === 'bin' ? (r() - .5) * .6 : 0, x = (r() - .5) * .3;
        // bins come in twos and threes, side by side
        const copies = kind === 'bin' ? 1 + Math.floor(r() * 3) : 1;
        for (let k = 0; k < copies; k++) for (const [geo, m] of PIECES[kind](r)) {
          const g = geo.clone(); g.rotateY(turn + (kind === 'bin' ? Math.PI / 2 * (P.side === 'left' ? 1 : -1) : 0)); g.translate(x, 0, z + k * .68);
          if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g.index ? g.toNonIndexed() : g);
        }
      }
      return [...byMat].map(([m, gs]) => [T.BufferGeometryUtils.mergeGeometries(gs), m]);
    });
    const g = new T.Group();
    for (const [geo, m] of c) { const mesh = new T.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
    g.scale.setScalar(M); return g;
  };

  // ----- on a building's face: fire escapes, drainpipes; on its roof: water tanks -----
  // FACE is the building's front, w wide and h high, facing +z at z = d/2
  function escape(w, h, d, r) {
    const out = [], floors = Math.floor((h - 4.4) / 3.1), x0 = (r() - .5) * Math.max(0, w - 4.5), bw = 3.2;
    if (floors < 1) return out;
    for (let f = 0; f < floors; f++) {
      const y = 4.4 + f * 3.1 + .35, z = d / 2 + .6;
      // the landing: a grating of bars, a rail round it, the posts
      for (let k = 0; k <= 12; k++) { const b = new T.BoxGeometry(.02, .03, 1.1); b.translate(x0 - bw / 2 + k * bw / 12, y, z); out.push(b); }
      for (const zz of [z - .55, z + .55]) { const b = new T.BoxGeometry(bw, .05, .04); b.translate(x0, y, zz); out.push(b); }
      const rail = new T.BoxGeometry(bw, .03, .03); rail.translate(x0, y + .95, z + .55); out.push(rail);
      const mid = new T.BoxGeometry(bw, .02, .02); mid.translate(x0, y + .5, z + .55); out.push(mid);
      for (let k = 0; k <= 6; k++) { const p = new T.BoxGeometry(.02, .95, .02); p.translate(x0 - bw / 2 + k * bw / 6, y + .47, z + .55); out.push(p); }
      for (const s of [-1, 1]) { const rr = new T.BoxGeometry(.03, .03, 1.1); rr.translate(x0 + s * bw / 2, y + .95, z); out.push(rr);
        const br = new T.BoxGeometry(.04, .04, .9); br.rotateX(-.6); br.translate(x0 + s * (bw / 2 - .1), y - .3, z - .2); out.push(br); }
      // the stair down to the landing below: two stringers and the treads, alternating sides
      if (f > 0) {
        const dir = f % 2 ? 1 : -1, run = 2.4, rise = 3.1, steps = 14;
        for (const zz of [z - .45, z + .1]) { const s = new T.BoxGeometry(Math.hypot(run, rise), .12, .02); s.rotateZ(dir * Math.atan2(rise, run)); s.translate(x0 + dir * .1, y - rise / 2, zz); out.push(s); }
        for (let k = 0; k < steps; k++) { const t = new T.BoxGeometry(.18, .02, .55); t.translate(x0 + dir * (-run / 2 + .1 + k * run / steps), y - rise + (k + 1) * rise / steps, z - .18); out.push(t); }
      }
    }
    return out;
  }
  function pipes(w, h, d, r) {
    const out = [];
    for (const x of [-w / 2 + .25, w / 2 - .25]) {
      if (r() < .4) continue;
      const p = new T.CylinderGeometry(.05, .05, h - .3, 12); p.translate(x, h / 2, d / 2 + .08); out.push(p);
      for (let y = 1; y < h; y += 2) { const c = new T.CylinderGeometry(.065, .065, .06, 12); c.translate(x, y, d / 2 + .08); out.push(c); }
      const shoe = new T.CylinderGeometry(.05, .05, .3, 12); shoe.rotateX(-.8); shoe.translate(x, .2, d / 2 + .2); out.push(shoe);
    }
    return out;
  }
  function roof(w, h, d, r) {
    const out = [];
    if (r() < .55) {
      // a timber water tank on legs, with its conical hat
      const x = (r() - .5) * (w - 4), z = (r() - .5) * (d - 4), R = 1.3 + r() * .5;
      const tank = lathe([[R, 0], [R * 1.03, 2.6], [R * 1.05, 2.7], [.1, 3.6], [0, 3.62]], 28); tank.translate(x, h + 1.4, z); out.push(['wood', tank]);
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const l = new T.BoxGeometry(.15, 1.4, .15); l.translate(x + lx * R * .65, h + .7, z + lz * R * .65); out.push(['iron', l]); }
      for (let k = 0; k < 4; k++) { const hoop = new T.TorusGeometry(R * 1.02, .015, 6, 40); hoop.rotateX(Math.PI / 2); hoop.translate(x, h + 1.7 + k * .6, z); out.push(['iron', hoop]); }
    }
    // a few boxes of plant and vents
    for (let i = 0; i < 2 + Math.floor(r() * 3); i++) { const b = rbox(1 + r() * 1.4, .7 + r() * .6, .8 + r(), .03); b.translate((r() - .5) * (w - 2), h + .45, (r() - .5) * (d - 2)); out.push(['plant', b]); }
    const parapet = new T.BoxGeometry(w, .9, .2); parapet.translate(0, h + .45, d / 2 - .1); out.push(['plant', parapet]);
    return out;
  }
  const wasBuilding = World.custom.building;
  World.custom.building = (P, t) => {
    const g = wasBuilding(P, t);
    if (P.style === 'simple' || P.details === false || P.details === 'off') return g;
    const [w, h, d] = (P.size || [12, 30, 12]).map(Number);
    const c = once(['bdet', w, h, d, P.seed].join('|'), () => {
      const r = rng((+P.seed || 1) * 613), iron = [], other = { wood: [], iron: [], plant: [] };
      // on both sides that face across (a street runs past one of them), each built as if it were the front, then turned
      for (const turn of [Math.PI / 2, -Math.PI / 2]) {
        const here = [];
        if (r() < .65 && h > 9) here.push(...escape(d, h, w, r));
        here.push(...pipes(d, h, w, r));
        for (const geo of here) { geo.rotateY(turn); iron.push(geo); }
      }
      for (const [k, geo] of roof(w, h, d, r)) other[k].push(geo);
      const parts = [];
      const all = [...iron, ...other.iron];
      if (all.length) parts.push([merge(all), IRON]);
      if (other.wood.length) parts.push([merge(other.wood), mat('tankwood', { color: new T.Color('#4a3a2c'), roughness: .85, map: grimeTex })]);
      if (other.plant.length) parts.push([merge(other.plant), mat('roofplant', { color: new T.Color('#5c5e60'), roughness: .6, metalness: .3, map: grimeTex })]);
      return parts;
    });
    const holder = new T.Group();
    for (const [geo, m] of c) { const mesh = new T.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; holder.add(mesh); }
    holder.scale.setScalar(M); g.add(holder);
    return g;
  };

  World.PARTS.push('clutter');
  SceneEd.add('clutter', { type: 'clutter', size: [1, 1, 40], seed: 3, every: 3.5 }, 'Street clutter');
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'clutter') return '';
      return `<div class="hd">Street clutter</div><label class="f"><span>Every m</span><input type="number" step=".5" data-k="every" value="${+P.every || 3.5}"></label>
        <label class="f"><span>Mix</span><input type="number" step="1" data-k="seed" value="${+P.seed || 3}" title="Another number, another street"></label>
        <label class="f wide"><span>Things</span><input data-k="kinds" value="${P.kinds || KINDS.join(',')}" title="Any of ${KINDS.join(', ')}"></label>
        <p class="note">Bins, bin bags, hydrants, bollards, parking meters and newspaper boxes along its length (the third size).</p>`;
    },
  });
  return { PIECES, KINDS };
})();
