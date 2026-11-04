// Realistic physics for layers, with matter.js underneath.
//
// A layer's Physics is None, Falls (a rigid body: it drops, tumbles, bounces off and slides along everything else)
// or Fixed (a solid surface things land on; keyframe it and it pushes them as it moves). A falling layer follows its
// keyframes until its Start time, then physics takes over with the speed its keyframes had at that moment, plus any
// Velocity and Spin set, so animating a layer and letting go throws it. A Figure that falls is a ragdoll: every
// limb its own body, joined at the shoulders, elbows, hips, knees and neck.
//
// The whole scene is simulated from 0 in fixed steps and remembered, so any frame can be shown, scrubbed or
// exported and comes out the same every time. It is worked out again only when something that changes it does.
const Physics = (() => {
  const STEP = 1 / 120, SAMPLE = 1 / 60, MOST = 120;
  const KINDS = [['none', 'None'], ['falls', 'Falls'], ['fixed', 'Fixed']];
  const WALLS = [['floor', 'Floor'], ['box', 'Floor and walls'], ['none', 'None']];
  const FIELDS = ['phys', 'bounce', 'friction', 'mass', 'vx', 'vy', 'spin', 'physAt'];
  const SCENE = ['gravity', 'walls', 'drag'];
  let sig = null, sim = null, building = false;
  // how a layer's own state is read without physics: set by the app
  let keyState = null, boundsOf = null;

  const wants = L => L.p && L.p.phys && L.p.phys !== 'none' && L.type !== 'camera' && L.type !== 'shape3d' && L.type !== 'model'
    && !(typeof R3D !== 'undefined' && R3D.is3d(L));
  const on = () => S.layers.some(wants);
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

  function signature() {
    const ls = S.layers.filter(wants);
    if (!ls.length) return '';
    return JSON.stringify([S.w, S.h, S.dur, S.gravity, S.walls, S.drag,
      ls.map(L => [L.id, L.type, L.p, L.keys, L.in, L.out])]);
  }

  // the world point of local point P on a layer in state O
  const toWorld = (o, p) => { const k = o.scale ?? 1, [x, y] = rot(p[0] * k * (o.sx ?? 1), p[1] * k * (o.sy ?? 1), rad(o.rotation || 0)); return [o.x + x, o.y + y]; };

  function bodyFor(L, o, t, opts) {
    const M = Matter, b = boundsOf(L, t), k = Math.abs(o.scale ?? 1);
    const w = Math.max(2, b.w * k * Math.abs(o.sx ?? 1)), h = Math.max(2, b.h * k * Math.abs(o.sy ?? 1));
    let body;
    if (L.type === 'ellipse') {
      if (Math.abs(w - h) < .06 * Math.max(w, h)) body = M.Bodies.circle(o.x, o.y, (w + h) / 4, opts, 40);
      else { const pts = []; for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; pts.push({ x: Math.cos(a) * w / 2, y: Math.sin(a) * h / 2 }); }
        body = M.Bodies.fromVertices(o.x, o.y, [pts], opts); }
    } else if (L.type === 'polygon' || L.type === 'star') {
      // a star collides as the polygon round its points
      const n = Math.max(3, Math.round(o.points || 5)), pts = [];
      for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n - Math.PI / 2; pts.push({ x: Math.cos(a) * w / 2, y: Math.sin(a) * h / 2 }); }
      body = M.Bodies.fromVertices(o.x, o.y, [pts], opts);
    } else {
      const r = L.type === 'rect' ? Math.max(0, Math.min((o.radius || 0) * k, w / 2 - 1, h / 2 - 1)) : 0;
      body = M.Bodies.rectangle(o.x, o.y, w, h, r > 1 ? { ...opts, chamfer: { radius: r } } : opts);
    }
    // fromVertices puts the body's position at the shape's centre of mass: remember where the layer's centre is
    const a = rad(o.rotation || 0);
    const off = rot(body.position.x - o.x, body.position.y - o.y, 0);
    M.Body.setAngle(body, a);
    M.Body.setPosition(body, { x: o.x + rot(off[0], off[1], a)[0], y: o.y + rot(off[0], off[1], a)[1] });
    return { body, off };
  }

  function material(L) {
    const p = L.p;
    return { restitution: Math.max(0, Math.min(1.2, (p.bounce ?? 40) / 100)), friction: Math.max(0, Math.min(2, (p.friction ?? 30) / 100)),
      frictionStatic: Math.max(0, Math.min(3, (p.friction ?? 30) / 100 * 1.6)), frictionAir: Math.max(0, Math.min(.5, (S.drag ?? 1) / 1000)),
      density: .001 * Math.max(.05, p.mass ?? 1) };
  }

  // the speed the keyframes give a layer at time T, in pixels and degrees a second
  function keySpeed(L, t) {
    const dt = 1 / 60, a = keyState(L, Math.max(0, t - dt)), b = keyState(L, t);
    const q = t > dt ? 1 / dt : 0;
    return { vx: (b.x - a.x) * q, vy: (b.y - a.y) * q, va: ((b.rotation || 0) - (a.rotation || 0)) * q };
  }

  function launch(L, item, t, bodies) {
    const s = keySpeed(L, t), p = L.p;
    const vx = (s.vx + (+p.vx || 0)) / 60, vy = (s.vy + (+p.vy || 0)) / 60, va = rad(s.va + (+p.spin || 0)) / 60;
    for (const b of bodies) { Matter.Body.setVelocity(b, { x: vx, y: vy }); Matter.Body.setAngularVelocity(b, va); }
  }

  // A figure as a ragdoll: a body for the chest, the head and each bone, pinned together where they meet.
  function ragdoll(L, o, opts) {
    const M = Matter, J = Figure.joints(o), { u, thick, wide } = Figure.sizes(o), k = Math.abs(o.scale ?? 1) * Math.abs(o.sy ?? 1);
    const W = p => toWorld(o, p), group = M.Body.nextGroup(true), parts = {};
    const bone = (name, a, b, t) => {
      const A = W(a), B = W(b), len = Math.max(2, Math.hypot(B[0] - A[0], B[1] - A[1]));
      const body = M.Bodies.rectangle((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, len, Math.max(3, t * k), { ...opts, collisionFilter: { group }, chamfer: { radius: Math.max(1, t * k / 2 - .5) } });
      M.Body.setAngle(body, Math.atan2(B[1] - A[1], B[0] - A[0]));
      parts[name] = { body, len };
    };
    bone('torso', J.pelvis, J.chest, 1.6 * u * wide);
    const head = W(J.head);
    parts.head = { body: M.Bodies.circle(head[0], head[1], Figure.UNITS.HEAD_R * u * k, { ...opts, collisionFilter: { group } }), len: 0 };
    for (const s of ['L', 'R']) {
      bone('upper' + s, J['shoulder' + s], J['elbow' + s], thick);
      bone('fore' + s, J['elbow' + s], J['hand' + s], thick * .9);
      bone('thigh' + s, J['hip' + s], J['knee' + s], thick * 1.15);
      bone('shin' + s, J['knee' + s], J['foot' + s], thick);
    }
    const pin = (a, b, at) => {
      const P = W(at), A = parts[a].body, B = parts[b].body;
      return M.Constraint.create({ bodyA: A, pointA: { x: P[0] - A.position.x, y: P[1] - A.position.y },
        bodyB: B, pointB: { x: P[0] - B.position.x, y: P[1] - B.position.y }, length: 0, stiffness: .95, damping: .05 });
    };
    const joins = [pin('torso', 'head', J.chest)];
    for (const s of ['L', 'R']) joins.push(pin('torso', 'upper' + s, J['shoulder' + s]), pin('upper' + s, 'fore' + s, J['elbow' + s]),
      pin('torso', 'thigh' + s, J['hip' + s]), pin('thigh' + s, 'shin' + s, J['knee' + s]));
    return { parts, joins };
  }

  function build() {
    building = true;
    try {
      const M = Matter, engine = M.Engine.create({ positionIterations: 12, velocityIterations: 10, constraintIterations: 6 });
      engine.gravity.x = 0; engine.gravity.y = 1; engine.gravity.scale = (S.gravity ?? 1800) / 1e6;
      const T = 400, walls = S.walls || 'floor', st = { isStatic: true, friction: .6, restitution: .2 };
      if (walls !== 'none') M.Composite.add(engine.world, M.Bodies.rectangle(S.w / 2, S.h + T / 2, S.w + T * 4, T, st));
      if (walls === 'box') M.Composite.add(engine.world, [M.Bodies.rectangle(-T / 2, S.h / 2, T, S.h * 4, st),
        M.Bodies.rectangle(S.w + T / 2, S.h / 2, T, S.h * 4, st), M.Bodies.rectangle(S.w / 2, -S.h * 2 - T / 2, S.w + T * 4, T, st)]);
      const items = S.layers.filter(wants).map(L => ({ L, kind: L.p.phys, start: L.p.phys === 'fixed' ? lin(L) : Math.max(lin(L), +L.p.physAt || 0),
        end: lout(L), made: false, gone: false, frames: [], first: 0 }));
      const dur = Math.min(S.dur, MOST), steps = Math.ceil(dur / STEP) + 1;
      let sample = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i * STEP;
        for (const it of items) {
          if (!it.made && t >= it.start - 1e-9 && t < it.end) {
            const o = keyState(it.L, t), opts = { ...material(it.L), isStatic: it.kind === 'fixed' };
            if (it.L.type === 'figure' && it.kind === 'falls') {
              const r = ragdoll(it.L, o, opts); it.rag = r;
              M.Composite.add(engine.world, [...Object.values(r.parts).map(p => p.body), ...r.joins]);
              launch(it.L, it, t, Object.values(r.parts).map(p => p.body));
              it.o = o;
            } else {
              const made = bodyFor(it.L, o, t, opts); it.body = made.body; it.off = made.off;
              M.Composite.add(engine.world, it.body);
              if (it.kind === 'falls') launch(it.L, it, t, [it.body]);
            }
            it.made = true; it.first = sample;
          }
          if (it.made && !it.gone && t >= it.end) {
            M.Composite.remove(engine.world, it.rag ? [...Object.values(it.rag.parts).map(p => p.body), ...it.rag.joins] : it.body);
            it.gone = true;
          }
          // a fixed layer that is keyframed moves, and pushes what it meets
          if (it.made && !it.gone && it.kind === 'fixed' && Object.keys(it.L.keys).length) {
            const o = keyState(it.L, t), a = rad(o.rotation || 0), off = rot(it.off[0], it.off[1], a);
            M.Body.setPosition(it.body, { x: o.x + off[0], y: o.y + off[1] }, true);
            M.Body.setAngle(it.body, a, true);
          }
        }
        if (t >= sample * SAMPLE - 1e-9) {
          for (const it of items) if (it.made && !it.gone && it.kind === 'falls') it.frames[sample - it.first] = record(it);
          sample++;
        }
        M.Engine.update(engine, STEP * 1000);
      }
      sim = new Map(items.map(it => [it.L.id, it]));
    } catch (error) {
      console.error('physics', error);
      sim = new Map();
    } finally { building = false; }
  }

  function record(it) {
    if (!it.rag) return [it.body.position.x, it.body.position.y, it.body.angle];
    const P = it.rag.parts, ang = b => Figure.angleOf(Math.cos(b.angle), Math.sin(b.angle));
    const tor = P.torso.body, ax = [Math.cos(tor.angle), Math.sin(tor.angle)];
    const pelvis = [tor.position.x - ax[0] * P.torso.len / 2, tor.position.y - ax[1] * P.torso.len / 2];
    const chest = [tor.position.x + ax[0] * P.torso.len / 2, tor.position.y + ax[1] * P.torso.len / 2];
    const head = P.head.body.position;
    const out = [pelvis[0], pelvis[1], ang(tor), Figure.angleOf(head.x - chest[0], head.y - chest[1])];
    for (const s of ['L', 'R']) out.push(ang(P['upper' + s].body), ang(P['fore' + s].body), ang(P['thigh' + s].body), ang(P['shin' + s].body));
    return out;
  }

  const norm = a => ((a % 360) + 540) % 360 - 180;
  const mix = (a, b, f) => a + (b - a) * f;
  const mixAngle = (a, b, f) => a + norm(b - a) * f;

  // State O of layer L at time T, with what the physics did to it.
  function apply(L, t, o) {
    if (building || !keyState) return o;
    if (sig === null || !sim) prepare();
    const it = sim && sim.get(L.id);
    if (!it || it.kind !== 'falls' || !it.made || t < it.start || !it.frames.length) return o;
    const at = Math.max(0, (t - it.start) / SAMPLE), i = Math.min(it.frames.length - 1, Math.floor(at)), j = Math.min(it.frames.length - 1, i + 1), f = Math.min(1, at - i);
    const A = it.frames[i], B = it.frames[j] || A;
    if (!A) return o;
    if (!it.rag) {
      const x = mix(A[0], B[0], f), y = mix(A[1], B[1], f), a = mixAngle(deg(A[2]), deg(B[2]), f);
      const off = rot(it.off[0], it.off[1], rad(a));
      o.x = x - off[0]; o.y = y - off[1]; o.rotation = a;
      return o;
    }
    // a ragdoll: the chest's angle turns the whole figure, every joint is what its bones say
    const flip = Math.sign((o.scale ?? 1) * (o.sx ?? 1)) || 1;
    const g = n => mixAngle(A[n], B[n], f);
    const torso = g(2), whole = torso - 180;
    o.rotation = whole; o.spine = 0;
    o.neck = norm(flip * (g(3) - torso));
    let n = 4;
    for (const s of ['L', 'R']) {
      const up = g(n), fore = g(n + 1), thigh = g(n + 2), shin = g(n + 3); n += 4;
      o['shoulder' + s] = norm(flip * (up - whole)); o['elbow' + s] = norm(flip * (fore - up));
      o['hip' + s] = norm(flip * (thigh - whole)); o['knee' + s] = norm(flip * (shin - thigh));
    }
    const px = mix(A[0], B[0], f), py = mix(A[1], B[1], f), { u } = Figure.sizes(o), k = o.scale ?? 1;
    const back = rot(0, Figure.UNITS.PELVIS_Y * u * k * (o.sy ?? 1), rad(whole));
    o.x = px - back[0]; o.y = py - back[1];
    return o;
  }

  // Worked out again when the scene changed in a way that matters to it.
  function prepare() {
    if (!keyState || typeof Matter === 'undefined') return;
    const now = signature();
    if (now === sig && sim) return;
    sig = now;
    if (!now) { sim = new Map(); return; }
    build();
  }

  return { KINDS, WALLS, FIELDS, SCENE, wants, on, apply, prepare, init(fns) { keyState = fns.keyState; boundsOf = fns.bounds; },
    forget() { sig = null; sim = null; } };
})();
