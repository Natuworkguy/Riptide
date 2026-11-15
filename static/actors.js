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
  World.custom.car = (P, t = 0) => {
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
      armL: -22 * s, armR: 22 * s, elbowL: 18, elbowR: 18, bob: Math.abs(c) * .03, lean: 3 });
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
  // ----- a real-looking person: MakeHuman's free (CC0) body, rigged, built by tools/make_people.py -----
  // The same moves as the mannequin drive its skeleton: each joint turned about the model's own axes (it faces +Z and
  // its bones stand unturned at rest), then any pose given by hand is laid over that (static/pose.js), so a person can
  // walk on its own and be posed joint by joint, or keyed pose to pose.
  const BODIES = { man: 'people/man.glb', woman: 'people/woman.glb' };
  const bodyCache = new Map();
  function body(kind) {
    let c = bodyCache.get(kind);
    if (!c) {
      c = {}; bodyCache.set(kind, c); World.pending++;
      new T.GLTFLoader().load(BODIES[kind], gl => {
        c.group = gl.scene; c.tall = new T.Box3().setFromObject(gl.scene).getSize(new T.Vector3()).y || 1.75;
        // how far down and out each arm hangs at rest (MakeHuman's A pose), to turn the moves' arm angles into turns from it
        const at = n => { const b = gl.scene.getObjectByName(n); return b ? b.getWorldPosition(new T.Vector3()) : null; };
        const sh = at('mixamorigLeftArm'), el = at('mixamorigLeftForeArm');
        c.armRest = sh && el ? Math.atan2(el.x - sh.x, sh.y - el.y) * 180 / Math.PI : 45;
        World.pending--; World.version++; SceneEd.redraw?.(); if (typeof render === 'function') render();
      }, undefined, () => { c.failed = true; World.pending--; });
    }
    return c.group ? c : null;
  }
  const looks = new Map();
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
      if (!want) return;
      const k = n.material.name + want;
      if (!set[k]) { set[k] = n.material.clone(); set[k].color = new T.Color(want); if (n.material.name === 'skin') set[k].color.lerp(new T.Color('#ffffff'), .35); }
      n.material = set[k];
    });
  }
  function realPerson(o, t) {
    const c = body(o.body === 'woman' ? 'woman' : 'man'); if (!c) return null;
    const move = o.move || 'idle', cadence = move === 'run' ? 2.9 : 1.85;
    const ph = o.dist != null ? o.dist / (move === 'run' ? 2.6 : 1.45) : t * cadence / 2 + (o.phase || 0);
    const q = pose(move, ph, t + (o.phase || 0));
    const g = T.SkeletonUtils.clone(c.group), bone = n => g.getObjectByName('mixamorig' + n), r = d => d * Math.PI / 180;
    const turn = (n, x = 0, y = 0, z = 0) => { const b = bone(n); if (b) b.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(r(x), r(y), r(z), 'XYZ'))); };
    // legs: forward from the hip, the knee bending back, a little apart on a board
    for (const [s, n, side] of [['L', 'Left', 1], ['R', 'Right', -1]]) {
      turn(n + 'UpLeg', -(q['thigh' + s] || 0), 0, side * (q.spread || 0));
      turn(n + 'Leg', q['knee' + s] || 0);
      // arms: from hanging at rest, forward and out, the elbow bending forward
      turn(n + 'Arm', -(q['arm' + s] || 0), 0, side * (6 + (q['arm' + s + 'side'] || 0) - c.armRest));
      turn(n + 'ForeArm', -(q['elbow' + s] || 0) * .8, 0, 0);
    }
    turn('Spine', q.lean || 0, (q.twist || 0) / 2, 0); turn('Spine1', 0, (q.twist || 0) / 2, 0);
    turn('Hips', 0, 0, q.sway || 0);
    const hips = bone('Hips'); if (hips) hips.position.y += (q.bob || 0) * c.tall / 1.75;
    dress(g, o);
    const root = new T.Group(); root.add(g);
    root.scale.setScalar(clamp(+o.height || c.tall, .5, 3) / c.tall);
    return root;
  }
  World.custom.person = (P, t = 0) => {
    const moving = P.keys?.at?.length >= 2, g = new T.Group(), o = { ...P, dist: moving && (P.move === 'walk' || P.move === 'run') ? travelled(P, t) : null };
    // a real-looking person unless asked for the old mannequin; the mannequin while the body is still loading
    const real = P.body !== 'mannequin' ? realPerson(o, t) : null;
    if (real) {
      World.poseHook?.(real, P, t);
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
    const g = new T.Group(), n = clamp(Math.round(+P.count || 20), 1, 200), [w, , d] = (P.size || [12, 1, 8]).map(Number), r = rng(+P.seed || 7), move = P.move || 'walk';
    for (let i = 0; i < n; i++) {
      const x0 = (r() - .5) * w, z0 = (r() - .5) * d, a = r() * Math.PI * 2, speed = move === 'run' ? 3 + r() * 1.5 : move === 'walk' ? 1.1 + r() * .5 : 0;
      const span = Math.max(w, d) * .9 + 2, h = 1.58 + r() * .35, ph = r();
      const look = { shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], pants: PANTS[Math.floor(r() * PANTS.length)], skin: SKINS[Math.floor(r() * SKINS.length)], hairColor: r() > .7 ? '#7a5a3a' : '#16100c' };
      // each goes back and forth along a line of their own, turning at its ends
      const s = speed * t + ph * span * 2, leg = ((s % (span * 2)) + span * 2) % (span * 2), back = leg > span, along = (back ? span * 2 - leg : leg) - span / 2;
      const node = P.asset ? World.custom.model({ asset: P.asset, clip: P.clip, clipOffset: ph * 3, clipSpeed: P.clipSpeed }, t) : person({ ...look, height: h, move, phase: ph * 4, dist: speed ? s : null }, t);
      if (!node) continue;
      const holder = new T.Group(); holder.add(node);
      let x = x0 + Math.sin(a) * along, z = z0 + Math.cos(a) * along;
      x = clamp(x, -w / 2, w / 2); z = clamp(z, -d / 2, d / 2);
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
      if (P.type === 'car') return `<div class="hd">Car</div><label class="f"><span>Lights</span>${opt('lights', P.lights === false ? 'off' : '', [['', 'On'], ['off', 'Off']])}</label>
        <label class="f"><span>Beams</span>${opt('beams', P.beams ? '1' : '', [['', 'None'], ['1', 'Light the road (night)']])}</label>
        <p class="note">Key its place two or more times and it drives: its wheels turn and steer, and it faces the way it goes.</p>`;
      if (P.type === 'person') return `<div class="hd">Person</div><label class="f"><span>Body</span>${opt('body', P.body || 'man', [['man', 'Man'], ['woman', 'Woman'], ['mannequin', 'Mannequin']])}</label>
        <label class="f"><span>Does</span>${opt('move', P.move || 'idle', MOVES)}</label>
        <label class="f"><span>Height m</span><input type="number" step=".01" data-k="height" value="${+P.height || 1.75}"></label>
        <label class="f"><span>Outfit</span>${opt('outfit', P.outfit || '', [['', 'Clothes'], ['holo', 'Holographic shards'], ['chrome', 'Chrome'], ['glow', 'Glowing'], ['gold', 'Gold']])}</label>
        ${color('skin', P.skin || '#c68e6a', 'Skin')}${color('shirt', P.shirt || '#2f5d8a', 'Top')}${color('pants', P.pants || '#2b2b33', 'Trousers')}${color('hairColor', P.hairColor || '#1c140e', 'Hair')}${color('shoes', P.shoes || '#1a1a1a', 'Shoes')}
        <p class="note">Key their place to send them somewhere: walking or running, their steps keep pace with how far they go. Pose turns any joint by hand, over what they are doing.</p>`;
      if (P.type === 'crowd') { const models = Object.entries(S.assets || {}).filter(([, a]) => a.kind === 'model').map(([id, a]) => [id, a.name]);
        return `<div class="hd">Crowd</div><label class="f"><span>People</span><input type="number" step="1" min="1" max="200" data-k="count" value="${+P.count || 20}"></label>
        <label class="f"><span>Do</span>${opt('move', P.move || 'walk', MOVES.filter(m => m[0] !== 'sit'))}</label>
        <label class="f"><span>Mix</span><input type="number" step="1" data-k="seed" value="${+P.seed || 7}" title="Another number, another crowd"></label>
        <label class="f"><span>As</span>${opt('asset', P.asset || '', [['', 'Mannequins'], ...models])}</label>
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
  return { pose, person, travelled, MOVES };
})();
