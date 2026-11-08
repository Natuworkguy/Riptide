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
  const MOVES = [['walk', 'Walk'], ['run', 'Run'], ['idle', 'Stand'], ['wave', 'Wave'], ['dance', 'Dance'], ['sit', 'Sit']];
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
    else if (move === 'sit') Object.assign(q, { thighL: 90, thighR: 90, kneeL: 90, kneeR: 90, armL: 20, armR: 20, elbowL: 40, elbowR: 40, bob: -.45, lean: 0 });
    else Object.assign(q, { armL: 3, armR: -3, elbowL: 6, elbowR: 6, bob: Math.sin(t * 1.6) * .004, lean: 0, sway: Math.sin(t * .7) * 1.5 });
    return q;
  }
  const cap = (r, len) => once(`cap${r}|${len}`, () => { const g = new T.CapsuleGeometry(r, Math.max(.001, len - 2 * r), 6, 12); g.translate(0, -len / 2, 0); return g; });
  function person(o, t) {
    const h = clamp(+o.height || 1.75, .5, 3), k = h / 1.75, move = o.move || 'idle';
    const skin = mat('plastic', o.skin || '#c68e6a'), shirt = mat('rubber', o.shirt || '#2f5d8a'), pants = mat('rubber', o.pants || '#2b2b33'), shoes = mat('leatherette', o.shoes || '#1a1a1a');
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
      const hip = new T.Group(); hip.position.set(side * .095, -.02, 0); hip.rotation.x = deg(-(q['thigh' + n] || 0)); hips.add(hip);
      hip.add(new T.Mesh(cap(.068, .45), pants));
      const kn = new T.Group(); kn.position.y = -.44; kn.rotation.x = deg(q['knee' + n] || 0); hip.add(kn);
      kn.add(new T.Mesh(cap(.055, .44), pants));
      const foot = new T.Mesh(once('foot', () => { const g = new T.BoxGeometry(.1, .07, .25); g.translate(0, 0, .06); return g; }), shoes); foot.position.y = -.45; kn.add(foot);
    }
    root.scale.setScalar(k);
    return root;
  }
  World.custom.person = (P, t = 0) => {
    const moving = P.keys?.at?.length >= 2, g = new T.Group();
    g.add(person({ ...P, dist: moving && (P.move === 'walk' || P.move === 'run') ? travelled(P, t) : null }, t));
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
      if (P.type === 'person') return `<div class="hd">Person</div><label class="f"><span>Does</span>${opt('move', P.move || 'idle', MOVES)}</label>
        <label class="f"><span>Height m</span><input type="number" step=".01" data-k="height" value="${+P.height || 1.75}"></label>
        ${color('skin', P.skin || '#c68e6a', 'Skin')}${color('shirt', P.shirt || '#2f5d8a', 'Top')}${color('pants', P.pants || '#2b2b33', 'Trousers')}${color('hairColor', P.hairColor || '#1c140e', 'Hair')}
        <p class="note">Key their place to send them somewhere: walking or running, their steps keep pace with how far they go.</p>`;
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
