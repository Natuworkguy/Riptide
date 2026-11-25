// ---------- actors: cars and people ----------
// Things that move like they are alive, in a 3D world. A car drives along its path (key its place, and it faces the
// way it goes), its wheels turning with the distance and steering into the bends, its head and tail lights lit. A
// person walks, runs, waves, dances or stands, the walk in step with how far they go. A crowd is many people
// coming and going across an area. Imported rigged models play their own animation clips (see library.js).
// Everything is in metres, worked out from the world's time alone, so a frame is the same however it is reached.
const Actors = (() => {
  const T = window.RiptideThree, M = World.M, deg = v => v * Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const geo = new Map(), once = (k, make) => geo.get(k) || (geo.set(k, make()), geo.get(k));
  const mat = (finish, color, glow) => World.finish(finish, color, glow);
  const glowMat = new Map(), light = (c, power) => { const k = c + power; if (!glowMat.has(k)) glowMat.set(k, new T.MeshStandardMaterial({ color: 0x111111, emissive: new T.Color(c), emissiveIntensity: power }));
    return glowMat.get(k); };

  // how far a prop has gone along its keyed path by world time T (metres), for wheels and footsteps
  function travelled(P, t) {
    // on a road: how far along it, from where its drive starts
    if (P.road != null) { const rk = P.keys?.road; return rk?.length ? Math.abs((+World.keyed(P, 'road', t, 0) || 0) - (+rk[0].v || 0)) : 0; }
    const ks = P.keys?.at; if (!ks?.length) return 0;
    const t0 = ks[0].t; let d = 0, last = World.keyed(P, 'at', t0, P.at);
    for (let x = t0 + .05; x <= t; x += .05) { const p = World.keyed(P, 'at', x, P.at); d += Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]); last = p; }
    const p = World.keyed(P, 'at', t, P.at); return d + Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]);
  }

  // ----- a car -----
  function profile(pts) { const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath(); return s; }
  function extrude(pts, width, bevel) {
    const g = new T.ExtrudeGeometry(profile(pts), { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 4 });
    g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
  }
  const BODY = [[-2.25, .3], [2.15, .3], [2.3, .44], [2.27, .62], [1.65, .78], [.6, .9], [-1.3, .93], [-2.12, .9], [-2.3, .64]];
  const CABIN = [[.6, .88], [.02, 1.33], [-.86, 1.34], [-1.38, .91]];
  // ----- a real-looking car: built by tools/make_cars.py (a sedan, a hatchback, an SUV, a taxi) -----
  const CAR_KINDS = [['sedan', 'Saloon'], ['hatch', 'Hatchback'], ['suv', 'SUV'], ['taxi', 'Taxi'], ['classic', 'Simple (the old block car)']];
  const carCache = new Map(), carLooks = new Map();
  function carModel(kind) {
    let c = carCache.get(kind);
    if (!c) {
      c = {}; carCache.set(kind, c); World.pending++;
      new T.GLTFLoader().load(`cars/${kind}.glb`, gl => {
        c.scene = gl.scene; c.info = gl.parser.json.extras || {};
        c.wheel = gl.scene.getObjectByName('wheel'); c.wheel.removeFromParent();
        gl.scene.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; n.material = carMaterial(n.material); } });
        World.pending--; World.version++; SceneEd.redraw?.(); if (typeof render === 'function') render();
      }, undefined, () => { c.failed = true; World.pending--; });
    }
    return c.scene ? c : null;
  }
  // what each part is made of, made to look real: clear-coated paint, deep glass, lenses that light up
  function carMaterial(m) {
    // every shiny part mirrors the world round the car (see the stage hook below), the way paint and glass do
    const name = m.name, P = (o) => { const x = new T.MeshPhysicalMaterial({ name, ...o }); if (['paint', 'glass', 'trim_gloss', 'headlight', 'taillight', 'chrome', 'mirror', 'alloy'].includes(name)) x.userData.carEnv = true; return x; };
    if (name === 'paint') return P({ map: m.map, color: m.color, roughness: .38, metalness: .55, clearcoat: 1, clearcoatRoughness: .04 });
    if (name === 'glass') return P({ color: new T.Color('#06080a'), roughness: .02, metalness: .1, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6 });
    if (name === 'trim_gloss') return P({ color: new T.Color('#050506'), roughness: .1, clearcoat: 1, clearcoatRoughness: .05 });
    if (name === 'headlight') return P({ color: new T.Color('#5a6068'), roughness: .12, metalness: .3, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: .5, emissive: new T.Color('#fff2dc'), emissiveIntensity: 0 });
    if (name === 'drl') return P({ color: new T.Color('#ffffff'), roughness: .2, emissive: new T.Color('#eef4ff'), emissiveIntensity: 0 });
    if (name === 'taillight') return P({ color: new T.Color('#5a0306'), roughness: .05, clearcoat: 1, emissive: new T.Color('#ff1208'), emissiveIntensity: 0 });
    if (name === 'chrome' || name === 'mirror') return P({ color: m.color, roughness: .06, metalness: 1 });
    if (name === 'alloy') return P({ color: m.color, roughness: .25, metalness: 1, clearcoat: .6 });
    if (name === 'sign') return P({ color: m.color, emissive: new T.Color('#ffd27a'), emissiveIntensity: 0 });
    return m;
  }
  // its paint in the colour given, and its lights on or off: each combination its own set of materials
  function carLook(c, P) {
    const key = [P.model, P.color, P.finish, P.lights !== false].join('|');
    let set = carLooks.get(key);
    if (!set) {
      set = new Map(); carLooks.set(key, set);
      const on = P.lights !== false;
      c.scene.traverse(n => { if (!n.isMesh || set.has(n.material)) return;
        const m = n.material, name = m.name; let x = m;
        if (name === 'paint') { x = m.clone(); x.color = new T.Color(P.color || '#c0392b');
          if (P.finish && P.finish !== 'paint') { const f = mat(P.finish, P.color || '#c0392b'); x = f.clone(); } }
        else if (name === 'headlight') { x = m.clone(); x.emissiveIntensity = on ? 6 : 0; if (on) x.color = new T.Color('#cfd6dd'); }
        else if (name === 'drl') { x = m.clone(); x.emissiveIntensity = on ? 9 : .2; }
        else if (name === 'taillight') { x = m.clone(); x.emissiveIntensity = on ? 3.2 : 0; }
        else if (name === 'sign') { x = m.clone(); x.emissiveIntensity = on ? 3 : 0; }
        set.set(m, x); });
    }
    return set;
  }
  function realCar(P, t) {
    const c = carModel(P.model || 'sedan'); if (!c) return null;
    const g = new T.Group(), body = c.scene.clone(), look = carLook(c, P);
    body.traverse(n => { if (n.isMesh) n.material = look.get(n.material) || n.material; });
    g.add(body);
    const dist = travelled(P, t), R = c.info.wheel_r || .33, spin = dist / R;
    const h0 = World.heading(P, t - .15), h1 = World.heading(P, t + .15);
    let steer = 0; if (h0 != null && h1 != null) { let d = h1 - h0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; steer = clamp(d * 2.2, -.55, .55); }
    for (const [x, y, z] of c.info.wheels || []) {
      const holder = new T.Group(), spinner = new T.Group(), w = c.wheel.clone();
      w.traverse(n => { if (n.isMesh) n.material = look.get(n.material) || n.material; });
      if (x < 0) w.rotation.y = Math.PI;
      holder.position.set(x, y, z); if (z > 0) holder.rotation.y = steer;
      spinner.rotation.x = spin; spinner.add(w); holder.add(spinner); g.add(holder);
    }
    if (P.beams) for (const x of [-.6, .6]) { const s = new T.SpotLight(0xfff1d8, 1.1, 40 * M, deg(24), .6, 0); s.position.set(x, .7, 2.3); s.target.position.set(x * 1.4, -.2, 16); s.castShadow = false; g.add(s, s.target); }
    if (P.lights !== false) for (const x of [-.6, .6]) { const r = new T.PointLight(0xff1a0a, .5, 3 * M, 2); r.position.set(x, .8, -2.5); g.add(r); }
    g.scale.setScalar(M); return g;
  }
  // what the cars mirror: the world round them, caught each frame from a little above the road where the camera is,
  // so their paint and glass carry the neon, the shop windows and the lamps around them
  World.stageHooks.push(({ B, cam, ground, Rr }) => {
    if (!Rr || !B.props) return;
    const mats = new Set(); B.props.traverse(n => { if (n.isMesh && n.material?.userData?.carEnv) mats.add(n.material); });
    if (!mats.size) return;
    if (!B.carCube) { // eight bits a channel: a pixel some part of the world draws as not-a-number is written as nothing here, where in
      // half floats it was carried into the paint and the glass, and spread by bloom over the whole picture
      B.carCube = new T.WebGLCubeRenderTarget(128, { type: T.UnsignedByteType, colorSpace: T.SRGBColorSpace, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
      B.carCam = new T.CubeCamera(.1 * M, 3000 * M, B.carCube); }
    B.carCam.position.set(cam.position.x, ground + 1.1 * M, cam.position.z - 3 * M);
    const hide = [B.wetFx, B.rainFx].filter(Boolean), was = hide.map(h => h.visible); hide.forEach(h => { h.visible = false; });
    for (const m of mats) m.envMap = null;
    B.carCam.update(Rr, B.scene);
    hide.forEach((h, i) => { h.visible = was[i]; });
    for (const m of mats) { m.envMap = B.carCube.texture; m.envMapIntensity = m.name === 'glass' ? 1.4 : 1; }
  });
  World.custom.car = (P, t = 0) => {
    if (P.model !== 'classic') { const real = realCar(P, t); if (real) return real; }
    const g = new T.Group(), paint = mat(P.finish || 'paint', P.color || '#c0392b');
    g.add(new T.Mesh(once('carBody', () => extrude(BODY, 1.84, .06)), paint));
    const glass = new T.Mesh(once('carCabin', () => extrude(CABIN, 1.5, .05)), mat('glass', '#20262c'));
    const roof = new T.Mesh(once('carRoof', () => { const b = new T.BoxGeometry(1.38, .05, .82); b.translate(0, 1.355, -.42); return b; }), paint);
    g.add(glass, roof);
    // lights: white at the front, red at the back
    const head = once('carHead', () => new T.BoxGeometry(.34, .09, .05)), tail = once('carTail', () => new T.BoxGeometry(.4, .08, .04));
    for (const x of [-.62, .62]) {
      const h = new T.Mesh(head, light('#fff4dc', P.lights === false ? 0 : 3)); h.position.set(x, .62, 2.27); g.add(h);
      const r = new T.Mesh(tail, light('#ff1a0c', P.lights === false ? .3 : 3.5)); r.position.set(x, .74, -2.28); g.add(r);
    }
    if (P.beams) for (const x of [-.62, .62]) { const s = new T.SpotLight(0xfff1d8, 1.6, 30 * M, deg(26), .6, 0); s.position.set(x, .62, 2.3); s.target.position.set(x * 1.6, 0, 14); s.castShadow = false; g.add(s, s.target); }
    // wheels: turned by how far it has gone, the front ones steered into the bend
    const dist = travelled(P, t), spin = dist / .34;
    const h0 = World.heading(P, t - .15), h1 = World.heading(P, t + .15);
    let steer = 0; if (h0 != null && h1 != null) { let d = h1 - h0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; steer = clamp(d * 2.2, -.55, .55); }
    const tyre = once('tyre', () => { const c = new T.CylinderGeometry(.34, .34, .25, 32); c.rotateZ(Math.PI / 2); return c; });
    const rim = once('rim', () => { const c = new T.CylinderGeometry(.22, .22, .26, 24); c.rotateZ(Math.PI / 2); return c; });
    const spoke = once('spoke', () => new T.BoxGeometry(.27, .4, .05));
    for (const [x, z] of [[-.82, 1.36], [.82, 1.36], [-.82, -1.34], [.82, -1.34]]) {
      const w = new T.Group(), wheel = new T.Group(); w.position.set(x, .34, z); if (z > 0) w.rotation.y = steer;
      wheel.add(new T.Mesh(tyre, mat('rubber', '#141414')), new T.Mesh(rim, mat('aluminium')));
      const sp = new T.Mesh(spoke, mat('aluminium')); sp.position.x = Math.sign(x) * .03; wheel.add(sp);
      wheel.rotation.x = spin; w.add(wheel); g.add(w);
    }
    g.scale.setScalar(M); return g;
  };

  // ----- a person -----
  const MOVES = [['walk', 'Walk'], ['run', 'Run'], ['idle', 'Stand'], ['wave', 'Wave'], ['dance', 'Dance'], ['sit', 'Sit'],
    ['skate', 'Skate'], ['ollie', 'Ollie'], ['kickflip', 'Kickflip']];
  const SKATE = ['skate', 'ollie', 'kickflip'];
  // a trick's moment, U from 0 to 1 over TRICK seconds: crouch, pop, up in the air, come down, land and roll on.
  // How high the rider is (m), how much the knees bend, and the board's nose up and its flip, at that moment.
  const TRICK = 1.6;
  function trick(u, flip) {
    const air = u > .3 && u < .78 ? Math.sin((u - .3) / .48 * Math.PI) : 0;
    const crouch = u < .3 ? Math.sin(u / .3 * Math.PI / 2) : u > .78 ? Math.sin((1 - u) / .22 * Math.PI / 2) * .8 : .25 + air * .6;
    const nose = u > .26 && u < .45 ? Math.sin((u - .26) / .19 * Math.PI) * 28 : 0;
    const spin = flip && u > .32 && u < .7 ? (u - .32) / .38 * 360 : 0;
    return { air: air * .62, crouch, nose, spin };
  }
  // joint angles (degrees) for a move at phase PH (a step's turn, 0 to 1)
  function pose(move, ph, t) {
    const s = Math.sin(ph * Math.PI * 2), c = Math.cos(ph * Math.PI * 2), q = {};
    if (move === 'walk') Object.assign(q, { thighL: 26 * s, thighR: -26 * s, kneeL: Math.max(0, -s) * 45 + 5, kneeR: Math.max(0, s) * 45 + 5,
      armL: -16 * s, armR: 16 * s, elbowL: 8 + 14 * Math.max(0, -s), elbowR: 8 + 14 * Math.max(0, s), bob: Math.abs(c) * .025, lean: 2, twist: 4 * s, sway: 1.5 * c });
    else if (move === 'run') Object.assign(q, { thighL: 50 * s, thighR: -50 * s, kneeL: Math.max(0, -s) * 95 + 15, kneeR: Math.max(0, s) * 95 + 15,
      armL: -45 * s, armR: 45 * s, elbowL: 85, elbowR: 85, bob: Math.abs(c) * .07, lean: 12 });
    else if (move === 'wave') Object.assign(q, { armR: 0, armRside: 150, elbowR: 25 + 25 * Math.sin(t * 7), armL: 4, elbowL: 8, bob: 0, lean: 0, breathe: t });
    else if (move === 'dance') Object.assign(q, { thighL: 14 * s, thighR: -14 * c, kneeL: 20 + 15 * s, kneeR: 20 - 15 * c, armLside: 70 + 50 * s, armRside: 70 + 50 * c,
      elbowL: 50, elbowR: 50, bob: Math.abs(s) * .06, lean: 0, sway: 10 * Math.sin(ph * Math.PI * 4), twist: 15 * s });
    else if (SKATE.includes(move)) {
      // side-on over the board, knees bent, arms out for balance; a trick crouches, pops and tucks
      const k = move === 'skate' ? .35 + .05 * Math.sin(t * 2.2) : trick(((t / TRICK) % 1 + 1) % 1, move === 'kickflip').crouch;
      Object.assign(q, { thighL: 18 + 50 * k, thighR: 10 + 50 * k, kneeL: 20 + 95 * k, kneeR: 20 + 95 * k, spread: 16,
        armLside: 55 + 15 * Math.sin(t * 1.7), armRside: 45 + 15 * Math.cos(t * 1.3), armL: -10, armR: 20, elbowL: 25, elbowR: 30,
        bob: -.3 * k, lean: 10 + 18 * k, twist: 4 * Math.sin(t * 1.1), sway: 3 * Math.sin(t * 1.9) });
    }
    else if (move === 'sit') Object.assign(q, { thighL: 90, thighR: 90, kneeL: 90, kneeR: 90, armL: 20, armR: 20, elbowL: 40, elbowR: 40, bob: -.45, lean: 0 });
    else Object.assign(q, { armL: 3, armR: -3, elbowL: 6, elbowR: 6, bob: Math.sin(t * 1.6) * .004, lean: 0, sway: Math.sin(t * .7) * 1.5 });
    return q;
  }
  const cap = (r, len) => once(`cap${r}|${len}`, () => { const g = new T.CapsuleGeometry(r, Math.max(.001, len - 2 * r), 6, 12); g.translate(0, -len / 2, 0); return g; });
  // a skateboard, its nose lifted and turned over as the trick TR says
  function makeBoard(o, tr) {
    const board = new T.Group(); board.position.y = .075;
    const deck = once('deck', () => new T.BoxGeometry(.21, .018, .8)), wheelG = once('swheel', () => { const g = new T.CylinderGeometry(.027, .027, .03, 16); g.rotateZ(Math.PI / 2); return g; });
    const flip = new T.Group(); flip.rotation.z = deg(tr.spin); flip.rotation.x = deg(-tr.nose); board.add(flip);
    flip.add(new T.Mesh(deck, mat(o.boardFinish || 'paint', o.board || '#1d2b7a')));
    for (const [x, z] of [[-.08, .27], [.08, .27], [-.08, -.27], [.08, -.27]]) { const w = new T.Mesh(wheelG, mat('plastic', '#f2efe6')); w.position.set(x, -.04, z); flip.add(w); }
    return board;
  }
  // the board under a real-looking person, who stands side-on to it, rising with them in a trick
  function boardFor(P, t) {
    const tr = P.move === 'skate' ? { air: 0, nose: 0, spin: 0 } : trick(((t / TRICK) % 1 + 1) % 1, P.move === 'kickflip');
    const holder = new T.Group(); holder.add(makeBoard(P, tr)); holder.position.y = tr.air;
    holder.rotation.y = deg(90); return holder;
  }
  function person(o, t) {
    const h = clamp(+o.height || 1.75, .5, 3), k = h / 1.75, move = o.move || 'idle';
    // an outfit finish (holo, chrome, glow...) covers them head to toe, bar the shoes
    const suit = o.outfit ? mat(o.outfit, o.outfitColor || undefined) : null;
    const skin = suit || mat('plastic', o.skin || '#c68e6a'), shirt = suit || mat('rubber', o.shirt || '#2f5d8a'), pants = suit || mat('rubber', o.pants || '#2b2b33'), shoes = mat('leatherette', o.shoes || '#1a1a1a');
    const cadence = move === 'run' ? 2.9 : 1.85, ph = o.dist != null ? o.dist / (move === 'run' ? 2.6 : 1.45) : t * cadence / 2 + (o.phase || 0);
    const q = pose(move, ph, t + (o.phase || 0)), root = new T.Group(), hips = new T.Group();
    hips.position.y = .95 + (q.bob || 0); hips.rotation.z = deg(q.sway || 0); hips.rotation.y = deg(q.twist || 0); root.add(hips);
    const torso = new T.Group(); torso.rotation.x = deg(q.lean || 0); hips.add(torso);
    const body = new T.Mesh(once('torso', () => { const g = new T.CapsuleGeometry(.15, .32, 6, 14); g.scale(1.15, 1, .75); g.translate(0, .27, 0); return g; }), shirt); torso.add(body);
    const pelvis = new T.Mesh(once('pelvis', () => { const g = new T.SphereGeometry(.15, 14, 10); g.scale(1.1, .7, .8); return g; }), pants); hips.add(pelvis);
    const head = new T.Mesh(once('head', () => { const g = new T.SphereGeometry(.105, 18, 14); g.scale(.9, 1.1, 1); return g; }), skin); head.position.y = .67; torso.add(head);
    const neck = new T.Mesh(cap(.045, .12), skin); neck.position.y = .58; torso.add(neck);
    if (o.hair !== 'none') { const hair = new T.Mesh(once('hair', () => { const g = new T.SphereGeometry(.11, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55); g.scale(.93, 1.1, 1.04); return g; }), mat('rubber', o.hairColor || '#1c140e')); hair.position.y = .685; torso.add(hair); }
    for (const side of [-1, 1]) {
      const n = side < 0 ? 'L' : 'R';
      const sh = new T.Group(); sh.position.set(side * .2, .5, 0); sh.rotation.x = deg(-(q['arm' + n] || 0)); sh.rotation.z = deg(side * (6 + (q['arm' + n + 'side'] || 0))); torso.add(sh);
      sh.add(new T.Mesh(cap(.048, .3), shirt));
      const el = new T.Group(); el.position.y = -.3; el.rotation.x = deg(-(q['elbow' + n] || 0)); sh.add(el);
      el.add(new T.Mesh(cap(.04, .26), skin));
      const hand = new T.Mesh(once('hand', () => new T.SphereGeometry(.045, 10, 8)), skin); hand.position.y = -.28; el.add(hand);
      const hip = new T.Group(); hip.position.set(side * .095, -.02, 0); hip.rotation.x = deg(-(q['thigh' + n] || 0)); hip.rotation.z = deg(side * (q.spread || 0)); hips.add(hip);
      hip.add(new T.Mesh(cap(.068, .45), pants));
      const kn = new T.Group(); kn.position.y = -.44; kn.rotation.x = deg(q['knee' + n] || 0); hip.add(kn);
      kn.add(new T.Mesh(cap(.055, .44), pants));
      const foot = new T.Mesh(once('foot', () => { const g = new T.BoxGeometry(.1, .07, .25); g.translate(0, 0, .06); return g; }), shoes); foot.position.y = -.45; kn.add(foot);
    }
    if (SKATE.includes(move)) {
      // on a board, the rider side-on to it: in a trick both go up, the board's nose lifting and, in a kickflip,
      // the board turning over under them
      const tr = move === 'skate' ? { air: 0, nose: 0, spin: 0 } : trick(((t / TRICK) % 1 + 1) % 1, move === 'kickflip');
      root.position.y = tr.air;
      root.rotation.y = deg(-80);
      const board = makeBoard(o, tr); board.rotation.y = deg(80); root.add(board);
    }
    root.scale.setScalar(k);
    return root;
  }
  // ----- a real-looking person: a Microsoft Rocketbox avatar (MIT), photographed skin, clothes and hair, rebuilt by tools/make_people_rocketbox.js -----
  // The same moves as the mannequin drive its skeleton: each joint turned about the model's own axes (it faces +Z and
  // its bones stand unturned at rest), then any pose given by hand is laid over that (static/pose.js), so a person can
  // walk on its own and be posed joint by joint, or keyed pose to pose.
  // the photographed people, and the classic ones (MakeHuman's CC0 body, built by tools/make_people.py), whose
  // clothes, skin and hair take any colours
  const BODIES = { man: 'people/man.glb', woman: 'people/woman.glb', classicMan: 'people/classic-man.glb', classicWoman: 'people/classic-woman.glb' };
  // twelve more photographed people, Rocketbox avatars too (MIT), built by tools/make_people_more.py: Man 2 to Man 8
  // and Woman 2 to Woman 6 in the Body menu, and all of them in a crowd set to People (everyone)
  const MORE_MEN = ['01', '03', '05', '06', '08', '10', '12'], MORE_WOMEN = ['01', '04', '05', '08', '10'];
  for (const n of MORE_MEN) BODIES['rb-male-' + n] = `people/rocketbox/male-adult-${n}.glb`;
  for (const n of MORE_WOMEN) BODIES['rb-female-' + n] = `people/rocketbox/female-adult-${n}.glb`;
  const PEOPLE = { m: ['man', ...MORE_MEN.map(n => 'rb-male-' + n)], f: ['woman', ...MORE_WOMEN.map(n => 'rb-female-' + n)] };
  const BODY_CHOICES = [['man', 'Man'], ...MORE_MEN.map((n, i) => ['rb-male-' + n, `Man ${i + 2}`]), ['woman', 'Woman'], ...MORE_WOMEN.map((n, i) => ['rb-female-' + n, `Woman ${i + 2}`]),
    ['classicMan', 'Man (classic)'], ['classicWoman', 'Woman (classic)'], ['mannequin', 'Mannequin']];
  const isPhoto = b => /^(man|woman|rb-)/.test(b || 'man');
  const bodyCache = new Map();
  function body(kind) {
    let c = bodyCache.get(kind);
    if (!c) {
      c = {}; bodyCache.set(kind, c); World.pending++;
      new T.GLTFLoader().load(BODIES[kind], gl => {
        liven(gl.scene, !kind.startsWith('classic'));
        c.group = gl.scene; c.tall = new T.Box3().setFromObject(gl.scene).getSize(new T.Vector3()).y || 1.75;
        // how far down and out each arm hangs at rest, to turn the moves' arm angles into turns from it
        const at = n => { const b = gl.scene.getObjectByName(n); return b ? b.getWorldPosition(new T.Vector3()) : null; };
        const sh = at('mixamorigLeftArm'), el = at('mixamorigLeftForeArm');
        c.armRest = sh && el ? Math.atan2(el.x - sh.x, sh.y - el.y) * 180 / Math.PI : 45;
        // the classic bodies stand with their elbows already bent: straighten them by that much
        const fa = at('mixamorigLeftForeArm'), hd = at('mixamorigLeftHand');
        c.elbowRest = kind.startsWith('classic') ? 24 : fa && hd ? Math.atan2(hd.z - fa.z, fa.y - hd.y) * 180 / Math.PI : 0;
        // the photographed people walk on legs reached to their feet; the classic ones keep the simple swing
        c.legs = kind.startsWith('classic') ? null : legsOf(gl.scene);
        World.pending--; World.version++; SceneEd.redraw?.(); if (typeof render === 'function') render();
      }, undefined, () => { c.failed = true; World.pending--; });
    }
    return c.group ? c : null;
  }
  const looks = new Map();
  // a skin colour as a tint over the painted skin (whose own tone is about #c8906e): the same tone leaves it as painted
  const skinTint = hex => { const c = new T.Color(hex), b = new T.Color('#c8906e'); return new T.Color(Math.min(1.6, c.r / b.r), Math.min(1.6, c.g / b.g), Math.min(1.6, c.b / b.b)); };
  // ----- skin, eyes, hair and cloth that read as real -----
  // One photographed map holds skin, clothes, hair and eyes together, so a mask is made from it first: skin by its
  // colour (warm, saturated enough, not too dark), the eyeballs by where they sit on the map, hair by its dark brown.
  // Then light bleeds a little red past the shadow's edge on skin, as it does through flesh; skin gets a faint oily
  // second sheen and fine pores catching the light; the eyes a wet, sharp highlight; hair a soft sheen; cloth the
  // fuzz of fabric at grazing angles.
  const masks = new Map();
  function skinMask(map, head) {
    const key = map.uuid + head; if (masks.has(key)) return masks.get(key);
    const img = map.image, n = 512, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d', { willReadFrequently: true });
    let tex = null;
    try {
      x.drawImage(img, 0, 0, n, n);
      const d = x.getImageData(0, 0, n, n), p = d.data;
      const ss = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
        let hue = 0; if (mx > mn) hue = mx === r ? ((g - b) / (mx - mn)) * 60 : mx === g ? (2 + (b - r) / (mx - mn)) * 60 : (4 + (r - g) / (mx - mn)) * 60; if (hue < 0) hue += 360;
        const warm = hue < 48 || hue > 340 ? 1 : 0;
        const skin = warm * ss(.17, .27, sat) * (1 - ss(.72, .9, sat)) * ss(.42, .58, mx);
        const hair = head ? (1 - ss(.22, .38, mx)) * (hue < 60 || hue > 300 ? 1 : 0) * (p[i + 3] > 0 ? 1 : 0) : 0;
        p[i] = skin * 255; p[i + 1] = 0; p[i + 2] = hair * 255; p[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      // soften the edges, so no outline shows where skin meets cloth
      x.filter = 'blur(2px)'; x.drawImage(cv, 0, 0); x.filter = 'none';
      if (head) {
        // the eyeballs: wet, with nothing else of skin about them
        x.globalCompositeOperation = 'source-over';
        const gr = x.createRadialGradient(.28 * n, .05 * n, 0, .28 * n, .05 * n, .075 * n);
        gr.addColorStop(0, 'rgb(0,255,0)'); gr.addColorStop(.8, 'rgb(0,255,0)'); gr.addColorStop(1, 'rgba(0,255,0,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(.28 * n, .05 * n, .075 * n, 0, Math.PI * 2); x.fill();
      }
      tex = new T.CanvasTexture(cv); tex.flipY = map.flipY; tex.channel = map.channel;
    } catch { tex = null; }
    masks.set(key, tex); return tex;
  }
  // fine pores and creases: a tiled normal map of small bumps, for skin seen close
  let poreTex = null;
  function pores() {
    if (poreTex) return poreTex;
    const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const x = cv.getContext('2d'), h = new Float32Array(n * n), r = rng(91);
    for (let k = 0; k < 2600; k++) { const cx = r() * n, cy = r() * n, rad = .6 + r() * 1.6, dep = .4 + r() * .6;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d2 = (dx * dx + dy * dy) / (rad * rad); if (d2 > 1) continue;
        const ix = ((Math.round(cx) + dx) % n + n) % n, iy = ((Math.round(cy) + dy) % n + n) % n; h[iy * n + ix] -= dep * (1 - d2); } }
    for (let i = 0; i < h.length; i++) h[i] += (r() - .5) * .25;
    const img = x.createImageData(n, n), at = (i, j) => h[((j + n) % n) * n + ((i + n) % n)];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dx = at(i + 1, j) - at(i - 1, j), dy = at(i, j + 1) - at(i, j - 1), k = (j * n + i) * 4, s = 1.6;
      const v = new T.Vector3(-dx * s, -dy * s, 1).normalize();
      img.data[k] = (v.x * .5 + .5) * 255; img.data[k + 1] = (v.y * .5 + .5) * 255; img.data[k + 2] = (v.z * .5 + .5) * 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    poreTex = new T.CanvasTexture(cv); poreTex.wrapS = poreTex.wrapT = T.RepeatWrapping; poreTex.colorSpace = T.NoColorSpace;
    return poreTex;
  }
  function realSkin(mat, mask) {
    mat.sheen = 1; mat.sheenRoughness = .8; mat.clearcoat = 1;   // turned on here, set per pixel below
    mat.userData.mask = mask;
    mat.onBeforeCompile = sh => {
      sh.uniforms.skinMask = { value: mask }; sh.uniforms.poreMap = { value: pores() };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D skinMask; uniform sampler2D poreMap;
float skinAmt = 0.0, wetAmt = 0.0, hairAmt = 0.0;
// light that has travelled a little way through flesh: red goes furthest, blue least
vec3 skinWrap( float nl ) { vec3 w = vec3( .5, .24, .14 ); vec3 r = clamp( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0, 1.0 ); return r * r * ( 3.0 - 2.0 * r ) * .55 + r * .45; }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
vec3 smk = texture2D( skinMask, vMapUv ).rgb; skinAmt = smk.r * ( 1.0 - smk.g ); wetAmt = smk.g; hairAmt = smk.b * ( 1.0 - smk.g );`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, clamp( roughnessFactor, .38, .58 ), skinAmt );
roughnessFactor = mix( roughnessFactor, max( roughnessFactor, .55 ), hairAmt );
roughnessFactor = mix( roughnessFactor, .04, wetAmt );`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 pn = texture2D( poreMap, vMapUv * 38.0 ).xyz * 2.0 - 1.0; vec3 t = normalize( cross( normal, vec3( 0.0, 1.0, .001 ) ) ), b = cross( normal, t );
  normal = normalize( mix( normal, normalize( t * pn.x * .35 + b * pn.y * .35 + normal * pn.z ), skinAmt * .6 ) ); }`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
material.clearcoat = max( skinAmt * .14, wetAmt );
material.clearcoatRoughness = mix( .32, .0, wetAmt );
material.sheenColor = mix( diffuseColor.rgb * .45, diffuseColor.rgb * .9, hairAmt ) * ( 1.0 - skinAmt ) * ( 1.0 - wetAmt );
material.sheenRoughness = mix( .75, .35, hairAmt );`)
        .replace('#include <lights_physical_pars_fragment>', T.ShaderChunk.lights_physical_pars_fragment.replace(
          'reflectedLight.directDiffuse += irradiance *',
          'reflectedLight.directDiffuse += mix( irradiance, skinWrap( dot( geometryNormal, directLight.direction ) ) * directLight.color, skinAmt ) *'));
    };
    mat.customProgramCacheKey = () => 'riptide-skin';
    return mat;
  }
  // ----- rounder bodies -----
  // Each triangle split in four, the new points pushed out onto the curve the normals describe (Phong
  // tessellation), so a shoulder, a jaw or the back of a head is round in profile rather than a few flat facets.
  // The new points take the bones of both ends of their edge, the strongest four of them, so they bend with the body.
  function smoothSkin(geo) {
    if (!geo.index || geo.userData.smoothed) return geo;
    const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index.array;
    if (!nor) return geo;
    const names = Object.keys(geo.attributes), src = {}, out = {};
    for (const k of names) src[k] = geo.attributes[k];
    const n0 = pos.count, mids = new Map(), extra = [];
    const key = (a, b) => a < b ? a * n0 + b : b * n0 + a;
    const tri = [];
    const mid = (a, b) => { const k = key(a, b); let m = mids.get(k); if (m == null) { m = n0 + extra.length; mids.set(k, m); extra.push([a, b]); } return m; };
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      tri.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const total = n0 + extra.length, P = new T.Vector3(), A = new T.Vector3(), B = new T.Vector3(), NA = new T.Vector3(), NB = new T.Vector3(), Q = new T.Vector3();
    for (const k of names) {
      const at = src[k], size = at.itemSize, arr = new at.array.constructor(total * size);
      arr.set(at.array.subarray(0, n0 * size));
      extra.forEach(([a, b], j) => {
        const o = (n0 + j) * size;
        if (k === 'position') {
          A.fromBufferAttribute(pos, a); B.fromBufferAttribute(pos, b); NA.fromBufferAttribute(nor, a); NB.fromBufferAttribute(nor, b);
          P.addVectors(A, B).multiplyScalar(.5);
          // the midpoint pulled onto each end's tangent plane, the two averaged, three quarters of the way
          Q.copy(P).addScaledVector(NA, -P.clone().sub(A).dot(NA)).add(P.clone().addScaledVector(NB, -P.clone().sub(B).dot(NB))).multiplyScalar(.5);
          P.lerp(Q, .75); arr[o] = P.x; arr[o + 1] = P.y; arr[o + 2] = P.z;
        } else if (k === 'normal') {
          NA.fromBufferAttribute(nor, a); NB.fromBufferAttribute(nor, b); NA.add(NB).normalize(); arr[o] = NA.x; arr[o + 1] = NA.y; arr[o + 2] = NA.z;
        } else if (k === 'skinIndex' || k === 'skinWeight') {
          if (k === 'skinWeight') return;   // done with the indices
          const w = new Map(), I = src.skinIndex, W = src.skinWeight;
          for (const v of [a, b]) for (let q = 0; q < 4; q++) { const bi = I.getComponent(v, q), wv = W.getComponent(v, q) * .5; if (wv > 0) w.set(bi, (w.get(bi) || 0) + wv); }
          const top = [...w.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), sum = top.reduce((s, x) => s + x[1], 0) || 1;
          out.weights = out.weights || new Float32Array(total * 4);
          for (let q = 0; q < 4; q++) { arr[o + q] = top[q] ? top[q][0] : 0; out.weights[(n0 + j) * 4 + q] = top[q] ? top[q][1] / sum : 0; }
        } else for (let q = 0; q < size; q++) arr[o + q] = (at.array[a * size + q] + at.array[b * size + q]) / 2;
      });
      out[k] = new T.BufferAttribute(arr, size, at.normalized);
    }
    if (out.weights) { const W = out.skinWeight; const wa = W.array; for (let i = n0 * 4; i < total * 4; i++) wa[i] = out.weights[i]; }
    const g = new T.BufferGeometry();
    for (const k of names) g.setAttribute(k, out[k]);
    g.setIndex(new T.BufferAttribute(total > 65535 ? new Uint32Array(tri) : new Uint16Array(tri), 1));
    for (const gr of geo.groups) g.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
    g.userData.smoothed = true; g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
    return g;
  }
  // skin that reads as alive: a soft sheen at grazing angles, light that seems to glow through it, wet eyes
  function liven(scene, smooth = false) {
    scene.traverse(n => {
      if (!n.isMesh) return;
      if (smooth && n.isSkinnedMesh) n.geometry = smoothSkin(n.geometry);
      const m = n.material, name = m.name;
      if (name === 'skin') {
        const s = new T.MeshPhysicalMaterial({ name, map: m.map, color: m.color, roughness: .52, metalness: 0, sheen: .6, sheenRoughness: .55,
          sheenColor: new T.Color('#ff9a80'), emissive: new T.Color('#5a1a10'), emissiveIntensity: .12, clearcoat: .08, clearcoatRoughness: .5 });
        n.material = s;
      } else if (['sclera', 'iris', 'limbus', 'pupil'].includes(name)) {
        n.material = new T.MeshPhysicalMaterial({ name, color: m.color, roughness: .2, clearcoat: 1, clearcoatRoughness: .03 });
      } else if (name === 'head' || name === 'body') {
        // a photographed skin and clothes: a little sheen at grazing angles, and light that seems to glow through the face
        // (the head's map carries the scalp's hair too, so nothing here may tint it)
        n.material = new T.MeshPhysicalMaterial({ name, map: m.map, normalMap: m.normalMap, normalScale: new T.Vector2(.8, .8), roughnessMap: m.roughnessMap,
          metalnessMap: m.metalnessMap, roughness: m.roughnessMap ? 1 : .7, metalness: m.metalnessMap ? 1 : 0, specularIntensity: .6 });
        const mask = m.map && skinMask(m.map, name === 'head'); if (mask) realSkin(n.material, mask);
      } else if (name === 'hair' && m.map) {
        // hair cards: cut out by their own alpha, a soft sheen along them
        n.material = new T.MeshPhysicalMaterial({ name, map: m.map, alphaTest: .5, side: T.DoubleSide, roughness: .85, sheen: .2, sheenRoughness: .6, sheenColor: new T.Color('#5a4434') });
      } else if (name === 'hair') {
        n.material = new T.MeshPhysicalMaterial({ name, color: m.color, roughness: .62, sheen: 1, sheenRoughness: .35, sheenColor: new T.Color('#7a6050') });
      }
    });
  }
  // its clothes, skin and hair in the colours given (each set of colours its own materials), or an outfit over it all
  function dress(g, o) {
    const key = o.outfit ? 'outfit:' + o.outfit + (o.outfitColor || '') : [o.skin, o.shirt, o.pants, o.hairColor, o.shoes].join('|');
    let set = looks.get(key);
    if (!set) {
      set = {};
      if (o.outfit) set.all = mat(o.outfit, o.outfitColor || undefined);
      looks.set(key, set);
    }
    const tint = { top: o.shirt, pants: o.pants, hair: o.hairColor, shoes: o.shoes, skin: o.skin };
    g.traverse(n => {
      if (!n.isMesh) return;
      if (set.all && !['sclera', 'iris', 'pupil'].includes(n.material.name)) { n.material = set.all; return; }
      const want = tint[n.material.name];
      // a person photographed in their own clothes and hair keeps them
      if (!want || n.material.map && n.material.name !== 'skin') return;
      const k = n.material.name + want;
      if (!set[k]) { set[k] = n.material.clone(); set[k].color = n.material.name === 'skin' ? skinTint(want) : new T.Color(want); }
      n.material = set[k];
    });
  }
  // ----- how the photographed people walk, run and stand -----
  // Worked out from the ground up: where each foot is (planted while it bears weight, so it never slides, then
  // lifted, swung forward and set down heel first), the hips over them (rising and falling, swaying over the leg that
  // bears weight, the pelvis turning with the stride and dropping on the side that swings), and each leg reached to
  // its foot (two bones, the knee bending forward). Above: the shoulders turn against the hips, the arms swing a beat
  // behind the opposite leg, the head stays level and looks ahead, the fingers rest half curled. Standing, the weight
  // shifts from one leg to the other now and then, the chest rises with each breath, the eyes and head wander a little.
  const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
  const fract = x => x - Math.floor(x), smooth = x => x * x * (3 - 2 * x), TAU = Math.PI * 2;
  // a smooth wander for idle movement: a few slow sines, the same for the same seed
  const wander = (t, s) => Math.sin(t * .31 + s) * .5 + Math.sin(t * .17 + s * 2.3) * .35 + Math.sin(t * .53 + s * 4.1) * .15;
  // the legs' measurements, taken from the body at rest
  function legsOf(scene) {
    const at = n => { const b = scene.getObjectByName('mixamorig' + n); return b ? b.getWorldPosition(new T.Vector3()) : null; };
    const hips = at('Hips'), up = at('LeftUpLeg'), knee = at('LeftLeg'), foot = at('LeftFoot'), toe = at('LeftToeBase');
    if (!hips || !up || !knee || !foot || !toe) return null;
    return { hipsY: hips.y, hipX: Math.abs(up.x - hips.x), hipDY: up.y - hips.y, hipDZ: up.z - hips.z, thigh: up.distanceTo(knee), shin: knee.distanceTo(foot),
      ankleY: foot.y, toeZ: toe.z - foot.z, toeY: toe.y - foot.y, footZ: foot.z - up.z };
  }
  // how far one cycle (two steps) carries a body with these legs
  const strideOf = (L, run) => (run ? 2.8 : 1.5) * L.hipsY;
  // the hips and both feet at phase PH (cycles of two steps) for a walk or run, in the body's own space (metres, +Z ahead)
  function stride(L, run, ph) {
    const S = strideOf(L, run), duty = run ? .34 : .6, feet = {};
    for (const [s, off] of [['L', 0], ['R', .5]]) {
      const u = fract(ph + off);
      let z, lift = 0, pitch = 0, toe = 0;
      if (u < duty) {
        // planted: the body passes over it, at the body's own speed
        const a = u / duty; z = S * duty * ((run ? .38 : .43) - a);
        if (a < .12) pitch = (run ? 6 : 14) * (1 - a / .12) ** 2;            // heel first, the sole rolling down flat
        if (a > .6) { const r = (a - .6) / .4; pitch = -(run ? 30 : 28) * r * r; toe = -pitch * .85; }   // the heel rising, the toes bending
      } else {
        const s2 = (u - duty) / (1 - duty), e = s2 - Math.sin(s2 * TAU) / TAU;
        z = S * duty * ((run ? -.62 : -.57) + e);
        lift = (run ? .2 : .06) * Math.sin(Math.PI * Math.min(1, s2 * 1.15)) ** (run ? 1 : 1.4);
        pitch = s2 < .5 ? -(run ? 30 : 28) * (1 - s2 / .5) ** 1.5 : (run ? 6 : 14) * ((s2 - .5) / .5) ** 2;
        toe = s2 < .2 ? (run ? 25 : 29) * (1 - s2 / .2) : 0;
      }
      // a heel off the ground lifts the ankle, as the foot turns about its toes
      const heel = pitch < 0 ? L.toeZ * Math.sin(-pitch * Math.PI / 180) : 0;
      feet[s] = { z, y: L.ankleY + lift + heel, pitch, toe };
    }
    // the hips: highest over a planted foot when walking, lowest when running (the knee taking the landing)
    const mid = duty / 2, w = TAU * 2 * (ph - mid);
    const bob = run ? -.03 * Math.cos(w) - .045 : .017 * Math.cos(w) - .052;
    const side = Math.cos(TAU * (ph - mid));        // + over the left foot, - over the right
    return { feet, bob, shift: side * (run ? .012 : .028), turn: -Math.cos(TAU * ph) * (run ? 9 : 6), drop: side * (run ? 3 : 4.5),
      lean: run ? 9 : 2.5, arms: run ? 34 : 14, elbow: run ? 82 : 9, swing: Math.cos(TAU * (ph - (run ? .03 : .06))) };
  }
  // a leg reached from its hip joint to its ankle: [thigh forward, thigh out, knee bend] in degrees
  function reach(L, d) {
    const len = Math.min(d.length(), (L.thigh + L.shin) * .9995), a = L.thigh, b = L.shin;
    const out = Math.asin(clamp(d.x / Math.max(1e-6, d.length()), -1, 1));
    const fwd = Math.atan2(d.z, -d.y);
    const alpha = Math.acos(clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1));
    const knee = Math.PI - Math.acos(clamp((a * a + b * b - len * len) / (2 * a * b), -1, 1));
    return [(fwd + alpha) * 180 / Math.PI, out * 180 / Math.PI, knee * 180 / Math.PI];
  }
  const q4 = (x, y, z, order = 'XYZ') => new T.Quaternion().setFromEuler(new T.Euler(deg(x), deg(y), deg(z), order));
  // drive the skeleton of G for MOVE at phase PH (walk and run) or time T (standing); false for any other move
  function gait(g, c, o, move, ph, t) {
    const L = c.legs; if (!L || !['walk', 'run', 'idle'].includes(move)) return false;
    const bone = n => g.getObjectByName('mixamorig' + n), seed = (+o.phase || 0) * 7.3;
    const set = (n, q) => { const b = bone(n); if (b) b.quaternion.copy(q); };
    const run = move === 'run';
    let st;
    if (move === 'idle') {
      // the weight on one leg, then after a while the other: the hips over it, the other knee eased
      const w = clamp(Math.sin(t * .23 + seed) * 1.6, -1, 1), breathe = Math.sin(t * 1.55 + seed);
      st = { feet: { L: { z: .03, y: L.ankleY, pitch: 0, toe: 0, x: .02 }, R: { z: -.02, y: L.ankleY, pitch: 0, toe: 0, x: -.02 } },
        bob: -.012 - Math.abs(w) * .008 + breathe * .002, shift: w * .03, turn: w * 2.5 + wander(t, seed) * 1.5, drop: -w * 3.5, lean: .5,
        arms: 0, elbow: 10, swing: 0, breathe, idle: w };
    } else st = stride(L, run, ph);
    // the hips
    const hips = bone('Hips');
    if (hips) {
      hips.position.y += st.bob; hips.position.x += st.shift;
      hips.quaternion.copy(q4(0, st.turn, st.drop, 'YXZ'));
    }
    const hq = hips ? hips.quaternion.clone() : new T.Quaternion(), inv = hq.clone().invert();
    const hipsAt = new T.Vector3(st.shift, L.hipsY + st.bob, 0);
    for (const [s, n, side] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
      const f = st.feet[s];
      const joint = hipsAt.clone().add(new T.Vector3(side * L.hipX, L.hipDY, L.hipDZ).applyQuaternion(hq));
      const target = new T.Vector3(side * (L.hipX + (f.x || 0) * side) + (move === 'idle' ? 0 : side * .01), f.y, f.z + L.footZ);
      const d = target.sub(joint).applyQuaternion(inv);
      const [fwd, out, knee] = reach(L, d);
      set(n + 'UpLeg', q4(-fwd, 0, out * 1));
      set(n + 'Leg', q4(knee, 0, 0));
      // the foot: level with the ground (or as pitched), whatever the leg above it did
      const above = -fwd + knee;
      set(n + 'Foot', q4(-f.pitch - above, 0, -out * .6));
      set(n + 'ToeBase', q4(-f.toe, 0, 0));
    }
    // the spine turns back against the hips, so the shoulders swing the other way; the chest breathes
    const twist = -st.turn * 1.9, br = st.breathe || 0;
    set('Spine', q4(st.lean * .5, twist * .3, -st.drop * .5));
    set('Spine1', q4(st.lean * .3 - br * .6, twist * .35, -st.drop * .3));
    set('Spine2', q4(st.lean * .2 - br * .8, twist * .35, -st.drop * .2));
    // the head level and looking ahead, whatever the body under it does; a little wander when still
    const look = move === 'idle' ? wander(t * 1.4, seed + 3) * 9 : 0, nod = move === 'idle' ? wander(t * 1.1, seed + 9) * 3 : 0;
    const under = st.turn + twist;
    set('Neck', q4(-st.lean * .6 + br * .4, (-under + look) * .45, st.drop * .25));
    set('Head', q4(-st.lean * .4 + nod + br * .5, (-under + look) * .55, st.drop * .25));
    // the arms: hanging a little forward and out, swinging against the legs, the elbows easing as they come forward
    for (const [s, n, side] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
      const sw = st.swing * side * -1;                    // the left arm comes forward as the right leg does
      const fwd = st.arms * sw + (run ? 6 : 2) + (move === 'idle' ? wander(t * .8, seed + side) * 1.5 : 0);
      const outA = 7 + (run ? 6 : 0) + (st.idle ? Math.max(0, st.idle * side) * 1.5 : 0) + Math.abs(sw) * (run ? 3 : 1);
      set(n + 'Shoulder', q4(-sw * (run ? 4 : 2.5), 0, side * (br * .8)));
      set(n + 'Arm', q4(-fwd, side * -6, side * (outA - c.armRest)));
      const elbow = st.elbow + Math.max(0, fwd) * (run ? .35 : .4) + (move === 'idle' ? 4 + br : 0);
      set(n + 'ForeArm', q4(0, side * -elbow * .1, 0).multiply(q4(-(elbow - c.elbowRest), 0, 0)));
      // the hand turned in a little, the wrist easing with the swing
      set(n + 'Hand', q4(-4 - sw * (run ? 4 : 6), side * -10, side * 4));
      // fingers half curled and spread a touch, the little finger most; the thumb across a little
      FINGERS.forEach((f, i) => {
        const curl = (run ? 38 : 16) + i * 5;
        set(`${n}Hand${f}1`, q4(0, 0, -side * curl * .7).multiply(q4((i - 1.5) * 3, 0, 0)));
        set(`${n}Hand${f}2`, q4(0, 0, -side * curl));
        set(`${n}Hand${f}3`, q4(0, 0, -side * curl * .7));
      });
      set(`${n}HandThumb1`, q4(0, side * 10, -side * 6)); set(`${n}HandThumb2`, q4(0, 0, -side * 10)); set(`${n}HandThumb3`, q4(0, 0, -side * 12));
    }
    return true;
  }
  function realPerson(o, t) {
    const c = body(BODIES[o.body] ? o.body : 'man'); if (!c) return null;
    const move = o.move || 'idle', cadence = move === 'run' ? 2.9 : 1.85;
    const ph = o.dist != null ? o.dist / (c.legs ? strideOf(c.legs, move === 'run') : move === 'run' ? 2.6 : 1.45) : t * cadence / 2 + (o.phase || 0);
    const q = pose(move, ph, t + (o.phase || 0));
    const g = T.SkeletonUtils.clone(c.group), bone = n => g.getObjectByName('mixamorig' + n), r = d => d * Math.PI / 180;
    const turn = (n, x = 0, y = 0, z = 0) => { const b = bone(n); if (b) b.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(r(x), r(y), r(z), 'XYZ'))); };
    if (!gait(g, c, o, move, ph, t + (o.phase || 0))) {
    // legs: forward from the hip, the knee bending back, a little apart on a board
    for (const [s, n, side] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
      turn(n + 'UpLeg', -(q['thigh' + s] || 0), 0, side * (q.spread || 0));
      turn(n + 'Leg', q['knee' + s] || 0);
      // arms: from hanging at rest, forward and out, the elbow bending forward
      turn(n + 'Arm', -(q['arm' + s] || 0), 0, side * (6 + (q['arm' + s + 'side'] || 0) - c.armRest));
      turn(n + 'ForeArm', -((q['elbow' + s] || 0) - c.elbowRest) * .8, 0, 0);
    }
    turn('Spine', q.lean || 0, (q.twist || 0) / 2, 0); turn('Spine1', 0, (q.twist || 0) / 2, 0);
    turn('Hips', 0, 0, q.sway || 0);
    const hips = bone('Hips'); if (hips) hips.position.y += (q.bob || 0) * c.tall / 1.75;
    }
    dress(g, o);
    const root = new T.Group(); root.add(g);
    root.scale.setScalar(clamp(+o.height || c.tall, .5, 3) / c.tall);
    return root;
  }
  // ----- blinking -----
  // How shut the eyes are at T, 0 to 1: a natural blink every 2 to 6 seconds (unless "blink" is false; the same times
  // for the same person every time, now and then two together), and the pose's "@blink" (0 to 100, keyed like any
  // pose) on top, to shut them on purpose. A blink shuts in 0.07 s, stays shut for 0.03 s and opens in 0.12 s.
  const blinkShape = u => u < 0 ? 0 : u < .07 ? u / .07 : u < .1 ? 1 : u < .22 ? 1 - (u - .1) / .12 : 0;
  function blinkAt(P, t) {
    let a = 0;
    if (P.blink !== false && P.blink !== 'off') {
      let h = 2166136261; for (const ch of String(P.id || P.name || 'person')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      const rand = k => { let x = (h ^ Math.imul(k + 1, 2654435761)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
      for (let k = 0, at = .4 + rand(999) * 2; at <= t + .01 && k < 2000; k++) {
        a = Math.max(a, blinkShape(t - at));
        at += rand(k) < .12 ? .32 : 2 + rand(k + 500) * 4;
      }
    }
    const held = typeof Pose !== 'undefined' ? Pose.poseAt(P, t)?.['@blink'] : null;
    if (held) a = Math.max(a, clamp((+held[0] || 0) / 100, 0, 1));
    return a;
  }
  // the lids drawn together: the upper one most of the way down, the lower a little up (the photographed people
  // have bones for each lid; the classic ones have none, and keep their eyes open)
  function blinkLids(g, a) {
    if (a <= 0) return;
    for (const side of ['L', 'R']) {
      let top = null, bottom = null;
      g.traverse(n => { if (n.isBone && n.name === `face_${side}EyeBlinkTop`) top = n; if (n.isBone && n.name === `face_${side}EyeBlinkBottom`) bottom = n; });
      if (!top || !bottom || top.parent !== bottom.parent) continue;
      const gap = bottom.position.clone().sub(top.position);
      top.position.addScaledVector(gap, .8 * a); bottom.position.addScaledVector(gap, -.2 * a);
    }
  }
  // ----- talking -----
  // A person talks from "say": what they say, as text ({"t": when it starts, "text", "rate": letters a second, 14
  // by default}, or a list of them, or a plain string from "sayAt" seconds), its mouth shapes worked out from the
  // letters: the jaw drops for open vowels, the corners spread for "ee" and draw in for "oo", the lips meet for m, b
  // and p. With "voice" (the soundtrack, "mix", or one of the project's tracks) the mouth opens as that voice is
  // loud, on the same frames every time: the text, if there is any, still shapes it.
  const VISEMES = { a: [.85, .35, 0], e: [.55, .7, 0], i: [.4, .85, 0], y: [.4, .8, 0], o: [.65, 0, .85], u: [.35, 0, 1], w: [.25, 0, 1],
    m: [0, .1, 0], b: [0, .1, 0], p: [0, .1, 0], f: [.15, .35, 0], v: [.15, .35, 0], ' ': [.12, .2, 0] };
  const visemeOf = ch => VISEMES[ch] || (/[a-z0-9]/.test(ch) ? [.32, .35, 0] : null);   // other letters: half open
  function linesOf(P) {
    if (typeof P.say === 'string') return P.say.trim() ? [{ t: +P.sayAt || 0, text: P.say }] : [];
    return Array.isArray(P.say) ? P.say.filter(l => l && l.text) : [];
  }
  // the mouth the text asks for at T: [open, wide, round], and whether a line is being said
  function textMouth(P, t) {
    for (const line of linesOf(P)) {
      const rate = clamp(+line.rate || 14, 4, 30), text = String(line.text).toLowerCase();
      let at = +line.t || 0;
      if (t < at) continue;
      const marks = [];
      for (const ch of text) { const v = visemeOf(ch); if (v) { marks.push([at, v]); at += 1 / rate; } else { marks.push([at, [0, .1, 0]]); at += .25; } }
      if (t > at + .15) continue;
      marks.push([at, [0, .1, 0]]);
      // from one shape to the next, eased, each shape a little ahead of its own sound
      const i = marks.findIndex(([m], k) => k + 1 < marks.length && t < marks[k + 1][0]);
      if (i < 0) return { m: [0, .1, 0], on: true };
      const [a0, va] = marks[i], [a1, vb] = marks[i + 1], f = clamp((t - a0) / Math.max(.001, a1 - a0), 0, 1), e = f * f * (3 - 2 * f);
      return { m: va.map((v, k) => v + (vb[k] - v) * e), on: true };
    }
    return { m: [0, 0, 0], on: false };
  }
  function voiceLevel(P, t) {
    if (!P.voice || typeof Reactive === 'undefined') return null;
    const tracks = S.audioTracks || [], source = P.voice !== 'mix' && tracks.some(T => T.id === P.voice) ? P.voice : 'mix';
    const bands = Reactive.bandsOf(source); if (!bands) return null;
    const series = bands[source === 'mix' ? 'vocals' : 'level'] || bands.level; if (!series) return null;
    const x = Math.max(0, t * 60), i = Math.floor(x), f = x - i, at = k => series[Math.min(series.length - 1, k)] || 0;
    return clamp((at(i) * (1 - f) + at(i + 1) * f) * 1.5, 0, 1);
  }
  function mouthAt(P, t) {
    // a little smoothing either side, as a real mouth cannot jump
    let o = 0, w = 0, r = 0, on = false;
    for (const d of [-.035, 0, .035]) { const x = textMouth(P, t + d); o += x.m[0]; w += x.m[1]; r += x.m[2]; on = on || x.on; }
    o /= 3; w /= 3; r /= 3;
    const v = voiceLevel(P, t);
    if (v != null) { o = on ? Math.min(1, o * .5 + v * .8) : v; if (!on) { w = .3; r = 0; } }
    return { open: o, wide: w, round: r, talking: on || (v != null && v > .05) };
  }
  // the photographed people's jaw, lips and mouth corners moved to the shape; a small nod as they talk
  function shapeMouth(g, m, t) {
    if (!m.talking && m.open < .01) return;
    const bone = {}; g.traverse(n => { if (n.isBone && /^face_|^mixamorigHead$/.test(n.name)) bone[n.name] = n; });
    if (!bone.face_MJaw) return;
    bone.face_MJaw.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(deg(15 * m.open), 0, 0)));
    for (const [side, s] of [['L', 1], ['R', -1]]) {
      const c = bone[`face_${side}MouthCorner`]; if (c) { c.position.x += s * (.006 * m.wide - .007 * m.round); c.position.z += .003 * m.round; c.position.y -= .002 * m.open; }
      const u = bone[`face_${side}Upperlip`]; if (u) { u.position.z += .003 * m.round; u.position.y += .0015 * m.open; u.position.x -= s * .002 * m.round; }
      const lo = bone[`face_${side}MouthBottom`]; if (lo) { lo.position.z += .003 * m.round; lo.position.x -= s * .002 * m.round; }
    }
    if (bone.face_MUpperLip) { bone.face_MUpperLip.position.z += .004 * m.round; bone.face_MUpperLip.position.y += .002 * m.open; }
    if (bone.face_MBottomLip) bone.face_MBottomLip.position.z += .004 * m.round;
    if (m.talking && bone.mixamorigHead) bone.mixamorigHead.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(deg(1.6 * Math.sin(t * 5.3) * (.4 + m.open)), deg(1.2 * Math.sin(t * 2.1)), 0)));
  }
  World.custom.person = (P, t = 0) => {
    const moving = P.keys?.at?.length >= 2, g = new T.Group(), o = { ...P, dist: moving && (P.move === 'walk' || P.move === 'run') ? travelled(P, t) : null };
    // a real-looking person unless asked for the old mannequin; the mannequin while the body is still loading
    const real = P.body !== 'mannequin' ? realPerson(o, t) : null;
    if (real) {
      World.poseHook?.(real, P, t);
      blinkLids(real, blinkAt(P, t));
      shapeMouth(real, mouthAt(P, t), t);
      g.add(real);
      // on a board: side-on to it, both going up together in a trick
      if (SKATE.includes(P.move)) { const b = boardFor(P, t); real.position.y = b.position.y; g.add(b); }
    } else g.add(person(o, t));
    g.scale.setScalar(M); return g;
  };

  // ----- a crowd -----
  const SHIRTS = ['#2f5d8a', '#b23a3a', '#e6e2d6', '#1f1f24', '#4f7a3a', '#c98a2b', '#6b4a8a', '#2a8a8a', '#d8d0c0', '#8a2b4f'];
  const PANTS = ['#2b2b33', '#3b4a63', '#5a4a3a', '#1a1a1a', '#7a7a80', '#2c3a2c'], SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3a21'];
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  World.custom.crowd = (P, t = 0) => {
    if (P.asset === 'mannequin') P = { ...P, asset: '', body: 'mannequin' };
    // everyone: each person one of all fourteen photographed people, picked with a dice of their own, so the rest of
    // the crowd (where they walk, how fast, how tall) is the same as with two faces
    const everyone = P.asset === 'everyone'; if (everyone) P = { ...P, asset: '' };
    const g = new T.Group(), n = clamp(Math.round(+P.count || 20), 1, 200), [w, , d] = (P.size || [12, 1, 8]).map(Number), r = rng(+P.seed || 7), move = P.move || 'walk';
    for (let i = 0; i < n; i++) {
      const x0 = (r() - .5) * w, z0 = (r() - .5) * d, speed = move === 'run' ? 3 + r() * 1.5 : move === 'walk' ? 1.1 + r() * .5 : 0;
      // which way they go: along a long, narrow area (a pavement), its length, either way, a little off straight; in a
      // squarer one, any way
      const long = Math.max(w, d) > Math.min(w, d) * 2.5, along0 = d >= w ? 0 : Math.PI / 2;
      const a = long ? along0 + (r() < .5 ? 0 : Math.PI) + (r() - .5) * .12 : r() * Math.PI * 2;
      const h = 1.58 + r() * .35, ph = r();
      const look = { shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], pants: PANTS[Math.floor(r() * PANTS.length)], skin: SKINS[Math.floor(r() * SKINS.length)], hairColor: r() > .7 ? '#7a5a3a' : '#16100c' };
      // each goes back and forth along the part of their line that lies inside the area, turning at its ends: never
      // stopped at an edge with their legs still walking
      const dx = Math.sin(a), dz = Math.cos(a), lim = (p0, dd, half) => Math.abs(dd) < 1e-6 ? [-1e9, 1e9] : [(-half - p0) / dd, (half - p0) / dd].sort((p, q) => p - q);
      const [ax0, ax1] = lim(x0, dx, w / 2), [az0, az1] = lim(z0, dz, d / 2), lo = Math.max(ax0, az0), hi = Math.min(ax1, az1), span = Math.max(.01, hi - lo);
      const s = speed * t + ph * span * 2, leg = ((s % (span * 2)) + span * 2) % (span * 2), back = leg > span, along = lo + (back ? span * 2 - leg : leg);
      // real-looking men and women, mixed (the mannequin only while their bodies load, or if asked for)
      const who = { ...look, body: r() < .5 ? 'woman' : 'man', move, phase: ph * 4, dist: speed ? s : null };
      who.height = who.body === 'woman' ? 1.55 + (h - 1.58) * .6 : 1.66 + (h - 1.58) * .6;
      if (everyone) { const set = PEOPLE[who.body === 'woman' ? 'f' : 'm']; who.body = set[Math.floor(rng((+P.seed || 7) * 7919 + i * 104729)() * set.length)]; }
      const node = P.asset ? World.custom.model({ asset: P.asset, clip: P.clip, clipOffset: ph * 3, clipSpeed: P.clipSpeed }, t)
        : (P.body !== 'mannequin' && realPerson(who, t)) || person({ ...look, height: h, move, phase: ph * 4, dist: speed ? s : null }, t);
      if (!node) continue;
      const holder = new T.Group(); holder.add(node);
      const x = x0 + dx * along, z = z0 + dz * along;
      holder.position.set(x * M, 0, z * M); holder.rotation.y = a + (back ? Math.PI : 0); if (!P.asset) holder.scale.setScalar(M);
      g.add(holder);
    }
    return g;
  };
  World.PARTS.push('car', 'person', 'crowd');
  SceneEd.add('car', { type: 'car', finish: 'paint', color: '#c0392b', face: 'travel' }, 'Car');
  SceneEd.add('person', { type: 'person', move: 'walk', face: 'travel', height: 1.75 }, 'Person');
  SceneEd.add('crowd', { type: 'crowd', count: 24, move: 'walk', size: [14, 1, 10] }, 'Crowd');

  // ----- the inspector -----
  const opt = (k, v, list) => `<select data-k="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v ?? '') === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  const color = (k, v, label) => `<label class="f"><span>${label}</span><input type="color" data-k="${k}" value="${v}"></label>`;
  SceneEd.extras.push({
    inspector(P) {
      if (P.type === 'car') return `<div class="hd">Car</div><label class="f"><span>Kind</span>${opt('model', P.model || 'sedan', CAR_KINDS)}</label><label class="f"><span>Lights</span>${opt('lights', P.lights === false ? 'off' : '', [['', 'On'], ['off', 'Off']])}</label>
        <label class="f"><span>Beams</span>${opt('beams', P.beams ? '1' : '', [['', 'None'], ['1', 'Light the road (night)']])}</label>
        <p class="note">Key its place two or more times and it drives: its wheels turn and steer, and it faces the way it goes.</p>`;
      if (P.type === 'person') return `<div class="hd">Person</div><label class="f"><span>Body</span>${opt('body', P.body || 'man', BODY_CHOICES)}</label>
        <label class="f"><span>Does</span>${opt('move', P.move || 'idle', MOVES)}</label>
        <label class="f"><span>Height m</span><input type="number" step=".01" data-k="height" value="${+P.height || 1.75}"></label>
        ${isPhoto(P.body) ? `<label class="f"><span>Says</span><textarea data-k="say" rows="2" placeholder="Words to lip sync">${Array.isArray(P.say) ? '' : (P.say || '').replace(/</g, '&lt;')}</textarea></label>
        ${Array.isArray(P.say) ? `<p class="note">${P.say.length} line${P.say.length > 1 ? 's' : ''} to say, set by an agent.</p>` : ''}
        <label class="f"><span>From s</span><input type="number" step=".1" data-k="sayAt" value="${+P.sayAt || 0}"></label>
        <label class="f"><span>Voice</span>${opt('voice', P.voice || '', [['', 'None (the words alone)'], ['mix', 'The soundtrack'], ...(S.audioTracks || []).map(T => [T.id, T.name || 'A track'])])}</label>` : ''}
        ${isPhoto(P.body) ? `<label class="f"><span>Blinks</span>${opt('blink', P.blink === false || P.blink === 'off' ? 'off' : '', [['', 'Now and then'], ['off', 'Never']])}</label>` : ''}
        <label class="f"><span>Outfit</span>${opt('outfit', P.outfit || '', [['', 'Clothes'], ['holo', 'Holographic shards'], ['chrome', 'Chrome'], ['glow', 'Glowing'], ['gold', 'Gold']])}</label>
        ${/^(classic|mannequin)/.test(P.body || '') ? color('skin', P.skin || '#c8906e', 'Skin') + color('shirt', P.shirt || '#2f5d8a', 'Top') + color('pants', P.pants || '#2b2b33', 'Trousers') + color('hairColor', P.hairColor || '#1c140e', 'Hair') + color('shoes', P.shoes || '#1a1a1a', 'Shoes')
          : '<p class="note">They wear their own clothes and hair. The classic man and woman take any colours.</p>'}
        <p class="note">Key their place to send them somewhere: walking or running, their steps keep pace with how far they go. Pose turns any joint by hand, over what they are doing.</p>`;
      if (P.type === 'crowd') { const models = Object.entries(S.assets || {}).filter(([, a]) => a.kind === 'model').map(([id, a]) => [id, a.name]);
        return `<div class="hd">Crowd</div><label class="f"><span>People</span><input type="number" step="1" min="1" max="200" data-k="count" value="${+P.count || 20}"></label>
        <label class="f"><span>Do</span>${opt('move', P.move || 'walk', MOVES.filter(m => m[0] !== 'sit'))}</label>
        <label class="f"><span>Mix</span><input type="number" step="1" data-k="seed" value="${+P.seed || 7}" title="Another number, another crowd"></label>
        <label class="f"><span>As</span>${opt('asset', P.asset || '', [['', 'People'], ['everyone', 'People (everyone)'], ['mannequin', 'Mannequins'], ...models])}</label>
        ${P.asset ? `<label class="f"><span>Clip</span>${opt('clip', P.clip || '', [['', 'None'], ...World.clipsOf(P.asset).map(c => [c, c])])}</label>` : ''}
        <p class="note">They come and go across its size (width and depth, in metres).</p>`; }
      if (P.type === 'model') { const clips = World.clipsOf(P.asset); if (!clips.length) return '';
        return `<div class="hd">Animation</div><label class="f"><span>Clip</span>${opt('clip', P.clip || '', [['', 'None'], ...clips.map(c => [c, c])])}</label>
        <label class="f"><span>Speed</span><input type="number" step=".05" data-k="clipSpeed" value="${+P.clipSpeed || 1}"></label>
        <label class="f"><span>Start at s</span><input type="number" step=".05" data-k="clipOffset" value="${+P.clipOffset || 0}"></label>
        <label class="f"><span>Plays</span>${opt('clipOnce', P.clipOnce ? '1' : '', [['', 'Round and round'], ['1', 'Once']])}</label>`; }
      return '';
    },
  });
  // the inspector's values come back as text: what they mean
  const was = World.custom.car;
  World.custom.car = (P, t) => was({ ...P, lights: P.lights === 'off' || P.lights === false ? false : true, beams: P.beams === '1' || P.beams === true }, t);
  return { pose, person, realPerson, travelled, MOVES };
})();
