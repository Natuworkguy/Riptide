// ---------- sketch and push/pull ----------
// Modelling by drawing, the way CAD apps on a tablet work: sketch a flat shape on the ground or on any face of a prop
// (a rectangle, a circle or a polygon, snapped to a 5 cm grid), then pull the arrow on it to extrude it into a solid.
// Pull it into the prop it was drawn on and it cuts a hole or a pocket instead. Any face of a solid can be pushed or
// pulled the same way, a box and a cylinder included, and a sketch can be revolved round its left edge into a
// turned part (a vase, a wheel, a knob). A sketch stays a sketch: its size, its depth and its turn are numbers in the
// inspector, typed exactly, until Make editable turns it into a mesh to model further.
// Units: metres. A sketch is a prop of type 'sketch': {shape: 'rect' | 'circle' | 'poly', w, d (a rectangle), r (a
// circle), loop: [[x, z], ...] (a polygon), depth (m; 0 for a flat sketch), revolve (degrees; 0 for none), host (the
// prop it was drawn on)}, in its own space: drawn on its X-Z plane, extruded along its Y.
const Sketch = (() => {
  const T = window.RiptideThree; if (!T || typeof World === 'undefined' || typeof SceneEd === 'undefined') return null;
  const M = World.M, r4 = v => Math.round(v * 1e4) / 1e4, GRID = .05, CIRCLE = 48;
  const ed = () => SceneEd.api, objs = () => SceneEd.layer?.p.objects || [];
  const st = { tool: null, plane: null, pts: [], drag: null, hover: null, push: null, temp: [] };
  let label = null;

  // ----- the outline of a sketch, in its own X-Z plane -----
  function loopOf(P) {
    if (P.shape === 'rect') { const w = Math.max(.001, +P.w || .5) / 2, d = Math.max(.001, +P.d || .5) / 2; return [[-w, -d], [w, -d], [w, d], [-w, d]]; }
    if (P.shape === 'circle') { const r = Math.max(.001, +P.r || .25), n = Math.max(3, Math.round(+P.sides || CIRCLE));
      return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; }); }
    return Array.isArray(P.loop) && P.loop.length >= 3 ? P.loop.map(p => [+p[0] || 0, +p[1] || 0]) : [[-.25, -.25], [.25, -.25], [0, .25]];
  }
  const area = L => { let a = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  // one way round (positive area in x-z), so the faces built from it point out
  const ccw = L => area(L) < 0 ? L.slice().reverse() : L.slice();

  // ----- a sketch as a solid: points and faces, like any editable mesh -----
  function toMesh(P) {
    const L = ccw(loopOf(P)), n = L.length, m = { v: [], f: [] }, put = p => { m.v.push(r4(p[0]), r4(p[1]), r4(p[2])); return m.v.length / 3 - 1; };
    const turn = Math.max(-360, Math.min(360, +P.revolve || 0));
    if (turn) {
      // round the line x = the outline's left edge, along Z, by TURN degrees
      const x0 = Math.min(...L.map(p => p[0])), full = Math.abs(turn) >= 360, segs = Math.max(4, Math.round(64 * Math.abs(turn) / 360)), rings = full ? segs : segs + 1;
      for (let j = 0; j < rings; j++) { const a = turn * Math.PI / 180 * j / segs;
        for (const [x, z] of L) { const r = x - x0; put([x0 + r * Math.cos(a), r * Math.sin(a), z]); } }
      for (let j = 0; j < segs; j++) { const a = j * n, b = ((j + 1) % rings) * n;
        for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; m.f.push(turn > 0 ? [a + i, b + i, b + i2, a + i2] : [a + i, a + i2, b + i2, b + i]); } }
      if (!full) { m.f.push([...Array(n).keys()].map(i => i)); m.f.push([...Array(n).keys()].map(i => segs * n + i).reverse()); if (turn < 0) { m.f[m.f.length - 2].reverse(); m.f[m.f.length - 1].reverse(); } }
      return m;
    }
    const d = +P.depth || 0, y0 = Math.min(0, d), y1 = Math.max(0, d);
    for (const [x, z] of L) put([x, y0, z]);
    for (const [x, z] of L) put([x, y1, z]);
    // with a loop counter-clockwise from above, the top runs one way and the bottom the other
    m.f.push([...Array(n).keys()].map(i => n + i).reverse());
    m.f.push([...Array(n).keys()]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; m.f.push([i, n + i, n + j, j]); }
    return m;
  }
  const solid = P => Math.abs(+P.depth || 0) > 1e-4 || Math.abs(+P.revolve || 0) > .01;

  // ----- drawn in the world: a flat sketch only in the editor's own views; a solid like any part -----
  const cache = new Map();
  World.custom.sketch = P => {
    const key = JSON.stringify([P.shape, P.w, P.d, P.r, P.sides, P.loop, P.depth, P.revolve]);
    let c = cache.get(P.id);
    if (!c || c.key !== key) { c?.geo?.dispose(); c = { key, geo: solid(P) ? Mesh.geometry(toMesh(P), 0, false) : null, flat: solid(P) ? null : loopOf(P) }; cache.set(P.id, c); }
    const g = new T.Group();
    if (c.geo) { const mesh = new T.Mesh(c.geo, World.finish(P.finish || 'plastic', P.color || '#d5d9df', P.glow, P)); mesh.scale.setScalar(M); g.add(mesh); return g; }
    const shape = new T.Shape(c.flat.map(([x, z]) => new T.Vector2(x * M, z * M))), fill = new T.ShapeGeometry(shape); fill.rotateX(Math.PI / 2);
    g.add(new T.Mesh(fill, new T.MeshBasicMaterial({ color: 0x5b98ff, transparent: true, opacity: .22, side: T.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })));
    const line = new T.LineLoop(new T.BufferGeometry().setFromPoints(c.flat.map(([x, z]) => new T.Vector3(x * M, .2, z * M))), new T.LineBasicMaterial({ color: 0x5b98ff }));
    g.add(line); g.userData.guide = true; return g;
  };
  World.PARTS.push('sketch');

  // ----- the plane being drawn on -----
  function rayOf(e) {
    const a = ed(); if (!a.cam) return null;
    // drawn by the server, nothing here renders the view's camera or the props: their matrices are brought up to date
    a.cam.updateMatrixWorld(); a.B?.props?.updateMatrixWorld(true);
    const r = a.canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), a.cam);
    return ray;
  }
  // a plane from a face that was clicked, else the ground
  function planeAt(e) {
    const ray = rayOf(e), a = ed(); if (!ray || !a.B?.props) return null;
    for (const h of ray.intersectObject(a.B.props, true)) {
      let n = h.object; while (n && !n.userData.partId) n = n.parent;
      if (!n || !h.face || n.userData.guide || !h.object.visible) continue;
      const nrm = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
      const u = Math.abs(nrm.y) > .9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0).cross(nrm).normalize();
      return { o: h.point.clone(), n: nrm, u, v: u.clone().cross(nrm).normalize(), host: n.userData.partId };
    }
    const o = a.B.props.getWorldPosition(new T.Vector3());
    return { o, n: new T.Vector3(0, 1, 0), u: new T.Vector3(1, 0, 0), v: new T.Vector3(0, 0, 1), host: null };
  }
  function onPlane(e, pl, free) {
    const ray = rayOf(e); if (!ray) return null;
    const hit = ray.ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(pl.n, pl.o), new T.Vector3()); if (!hit) return null;
    const d = hit.sub(pl.o), s = free ? .001 : GRID;
    return [Math.round(d.dot(pl.u) / M / s) * s, Math.round(d.dot(pl.v) / M / s) * s];
  }
  const toWorld = (pl, [x, y], lift = 0) => pl.o.clone().addScaledVector(pl.u, x * M).addScaledVector(pl.v, y * M).addScaledVector(pl.n, lift);

  // ----- a finished outline becomes a sketch prop -----
  function commit(pl, kind, a) {
    let c, P;
    if (kind === 'rect') { c = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2]; P = { shape: 'rect', w: r4(Math.abs(a[1][0] - a[0][0])), d: r4(Math.abs(a[1][1] - a[0][1])) }; if (P.w < .005 || P.d < .005) return say('Drag out a rectangle'); }
    else if (kind === 'circle') { c = a[0]; P = { shape: 'circle', r: r4(Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1])) }; if (P.r < .005) return say('Drag out a circle'); }
    else { c = [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length]; P = { shape: 'poly', loop: a.map(p => [r4(p[0] - c[0]), r4(p[1] - c[1])]) }; }
    // its place and turn in the props' own space, in metres: its X along the plane's u, Y the normal, Z along v
    const at = ed().B.props.worldToLocal(toWorld(pl, c));
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(pl.u, pl.n, pl.v)), eu = new T.Euler().setFromQuaternion(q, 'YXZ');
    Object.assign(P, { type: 'sketch', name: kind === 'rect' ? 'Rectangle sketch' : kind === 'circle' ? 'Circle sketch' : 'Polygon sketch',
      at: [r4(at.x / M), r4(at.y / M), r4(at.z / M)], turn: [eu.x, eu.y, eu.z].map(v => r4(v * 180 / Math.PI)), depth: 0, ...(pl.host ? { host: pl.host } : {}) });
    objs().push(P); World.ensureIds(objs()); SceneEd.select(P.id); SceneEd.record();
    say('Pull the arrow to extrude it' + (pl.host ? '; pull it into the prop it is on to cut a hole' : ''));
  }

  // ----- push/pull: an arrow on a sketch or a face, dragged along its normal -----
  // where the arrow stands and points, in the world, for what is picked now
  function arrowFor() {
    if (st.push?.live) return st.push;
    const P = SceneEd.selected; if (!P || st.tool && st.tool !== 'push') return null;
    const node = ed().findNode(P.id); if (!node) return null;
    node.updateMatrixWorld(true);
    if (P.type === 'sketch' && !(+P.revolve)) {
      const L = loopOf(P), d = +P.depth || 0, c = [L.reduce((s, p) => s + p[0], 0) / L.length, L.reduce((s, p) => s + p[1], 0) / L.length];
      const base = node.localToWorld(new T.Vector3(c[0] * M, d * M, c[1] * M)), n = new T.Vector3(0, 1, 0).transformDirection(node.matrixWorld).normalize();
      return { P, kind: 'sketch', base, n, start: d };
    }
    if (st.tool === 'push' && st.face && st.face.id === P.id) return st.face;
    return null;
  }
  function screen(p) { ed().cam.updateMatrixWorld(); const a = ed(), r = a.canvas.getBoundingClientRect(), v = p.clone().project(a.cam); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height, v.z]; }
  function arrowLen(A) { return Math.max(20, ed().cam.position.distanceTo(A.base) * .12); }
  function nearArrow(e, A) {
    const a = ed(), r = a.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const p = screen(A.base), q = screen(A.base.clone().addScaledVector(A.n, arrowLen(A)));
    const dx = q[0] - p[0], dy = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] + dx * t - x, p[1] + dy * t - y) < 14;
  }
  // how far along the arrow's line the pointer is: the closest point on it to the pointer's ray
  function along(e, A) {
    const ray = rayOf(e); if (!ray) return 0;
    const w0 = A.base.clone().sub(ray.ray.origin), b = A.n.dot(ray.ray.direction), d = A.n.dot(w0), e2 = ray.ray.direction.dot(w0), den = 1 - b * b;
    return den < 1e-6 ? 0 : (b * e2 - d) / den / M;
  }
  // a face of any prop, to push or pull: the prop made a mesh first, the face found by where it was hit
  function pickFace(e) {
    const ray = rayOf(e), a = ed(); if (!ray) return null;
    for (const h of ray.intersectObject(a.B.props, true)) {
      let n = h.object; while (n && !n.userData.partId) n = n.parent;
      if (!n || !h.face || n.userData.guide) continue;
      const P = World.findPart(objs(), n.userData.partId)?.P; if (!P || ['light', 'camera', 'group', 'label', 'model', 'car', 'person'].includes(P.type)) continue;
      return { P, point: h.point.clone(), obj: h.object, normal: h.face.normal.clone() };
    }
    return null;
  }
  function startFacePush(hit) {
    let P = hit.P;
    if (P.type === 'sketch') { SceneEd.select(P.id); return null; }
    const local = hit.obj.worldToLocal(hit.point.clone()), wasMesh = P.type === 'mesh';
    Mesh.makeEditable(P);
    // the face facing the way the hit did, through the point hit
    const m = P.mesh, V = i => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]];
    const hn = wasMesh ? hit.normal : hit.normal; let best = -1, bd = 1e9;
    m.f.forEach((f, fi) => {
      const pts = f.map(V), c = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / pts.length);
      const a = new T.Vector3(...pts[0]), b = new T.Vector3(...pts[1]), cc = new T.Vector3(...pts[2]), fn = b.clone().sub(a).cross(cc.clone().sub(a)).normalize();
      if (fn.dot(hn) < .97) return;
      const off = Math.abs(local.clone().sub(a).dot(fn)), dist = off * 10 + local.distanceTo(new T.Vector3(...c));
      if (dist < bd) { bd = dist; best = fi; }
    });
    if (best < 0) { say('Could not find that face to push'); return null; }
    P.meshRev = (P.meshRev || 0) + 1; World.version++;
    const f = m.f[best], pts = f.map(V), c = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / pts.length);
    const node = ed().findNode(P.id); node?.updateMatrixWorld(true);
    // the mesh's own space is metres, scaled up by M under the prop's node
    const toW = v => node ? node.localToWorld(v.clone().multiplyScalar(M)) : v.clone().multiplyScalar(M);
    const a = new T.Vector3(...pts[0]), b = new T.Vector3(...pts[1]), cc = new T.Vector3(...pts[2]), ln = b.clone().sub(a).cross(cc.clone().sub(a)).normalize();
    const base = toW(new T.Vector3(...c)), n = toW(new T.Vector3(...c).add(ln)).sub(base).normalize();
    return { P, kind: 'face', fi: best, base, n, ln: ln.toArray(), start: 0 };
  }
  // the face pulled out (or pushed in) by D metres: new side faces the first time, then its points moved
  function moveFace(A, d) {
    const m = A.P.mesh;
    if (!A.made) { const f = m.f[A.fi], top = f.map(i => { m.v.push(m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]); return m.v.length / 3 - 1; });
      f.forEach((a, i) => m.f.push([a, f[(i + 1) % f.length], top[(i + 1) % f.length], top[i]])); m.f[A.fi] = top;
      A.made = top.map(i => [i, [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]]]); }
    for (const [i, p] of A.made) for (let k = 0; k < 3; k++) m.v[i * 3 + k] = r4(p[k] + A.ln[k] * d);
    A.P.meshRev = (A.P.meshRev || 0) + 1; World.version++; SceneEd.redraw();
  }

  // ----- what the tools show: the outline being drawn, the arrow, the size -----
  function showLabel(e, text) {
    const vp = ed().canvas.parentElement; if (!label) { label = document.createElement('div'); label.className = 'sk-dim'; }
    if (label.parentElement !== vp) vp.appendChild(label);
    if (!text) { label.hidden = true; return; }
    const r = ed().canvas.getBoundingClientRect(); label.hidden = false; label.textContent = text;
    label.style.left = `${e.clientX - r.left + 14}px`; label.style.top = `${e.clientY - r.top + 14}px`;
  }
  const m3 = v => `${(+v).toFixed(3).replace(/\.?0+$/, '') || 0} m`;
  function overlay(helpers) {
    for (const x of st.temp) { x.geometry?.dispose(); } st.temp = [];
    const before = helpers.length, blue = 0x5b98ff;
    // the outline being drawn
    if (st.plane && (st.drag || st.pts.length)) {
      let L = [];
      if (st.drag?.kind === 'rect') { const [a, b] = [st.drag.a, st.drag.b]; L = [a, [b[0], a[1]], b, [a[0], b[1]]]; }
      else if (st.drag?.kind === 'circle') { const r = Math.hypot(st.drag.b[0] - st.drag.a[0], st.drag.b[1] - st.drag.a[1]); L = Array.from({ length: CIRCLE }, (_, i) => { const t = i / CIRCLE * Math.PI * 2; return [st.drag.a[0] + Math.cos(t) * r, st.drag.a[1] + Math.sin(t) * r]; }); }
      else L = st.hover ? [...st.pts, st.hover] : st.pts;
      if (L.length >= 2) { const line = new (st.tool === 'poly' ? T.Line : T.LineLoop)(new T.BufferGeometry().setFromPoints(L.map(p => toWorld(st.plane, p, .3))), new T.LineBasicMaterial({ color: blue, depthTest: false }));
        helpers.push(line); }
      if (st.tool === 'poly' && st.pts.length) helpers.push(new T.Points(new T.BufferGeometry().setFromPoints(st.pts.map(p => toWorld(st.plane, p, .3))), new T.PointsMaterial({ color: 0xffffff, size: 7, sizeAttenuation: false, depthTest: false })));
    }
    // a flat sketch has its arrow, not the move gizmo
    const Sel = SceneEd.selected; if (Sel?.type === 'sketch' && !solid(Sel) && ed().gizmo.object) ed().gizmo.detach();
    // the arrow
    const A = arrowFor();
    if (A && ed().cam) { const len = arrowLen(A), hot = st.push?.live;
      const arrow = new T.ArrowHelper(A.n, A.base, len, hot ? 0xffc04d : 0xff8a1f, len * .28, len * .14);
      arrow.traverse(x => { if (x.material) { x.material.depthTest = false; x.material.transparent = true; } x.renderOrder = 999; });
      helpers.push(arrow); }
    st.temp = helpers.slice(before).flatMap(x => { const out = []; x.traverse(y => { if (y.geometry) out.push(y); }); return out; });
  }

  // ----- the pointer -----
  const say = t => status(t);
  function pointer(type, e) {
    if (!SceneEd.layer || !ed().cam || e.button > 0 && type === 'down') return false;
    // pulling an arrow, whatever tool is on
    if (type === 'down') { const A = arrowFor(); if (A && nearArrow(e, A)) { st.push = { ...A, live: true, from: along(e, A) - A.start };
      ed().canvas.setPointerCapture(e.pointerId); return true; } }
    if (st.push?.live) {
      if (type === 'move') { const raw = along(e, st.push) - st.push.from, d = r4(e.altKey ? raw : Math.round(raw / .01) * .01);
        if (st.push.kind === 'sketch') { st.push.P.depth = d; World.version++; SceneEd.redraw(); }
        else moveFace(st.push, d);
        st.push.d = d; showLabel(e, (d >= 0 ? '↑ ' : '↓ ') + m3(Math.abs(d))); return true; }
      if (type === 'up') { const A = st.push; st.push = null; showLabel(e, ''); finishPush(A); return true; }
      return true;
    }
    if (!st.tool) return false;
    if (st.tool === 'push') {
      if (type !== 'down') return false;
      const hit = pickFace(e); if (!hit) return false;
      const A = startFacePush(hit); if (!A) return true;
      SceneEd.select(A.P.id); st.face = A; st.push = { ...A, live: true, from: along(e, A) };
      ed().canvas.setPointerCapture(e.pointerId); return true;
    }
    // drawing
    const free = e.altKey;
    if (type === 'down') {
      if (!st.plane) st.plane = planeAt(e);
      const p = onPlane(e, st.plane, free); if (!p) return true;
      if (st.tool === 'poly') {
        if (st.pts.length >= 3) { const s0 = screen(toWorld(st.plane, st.pts[0])), r = ed().canvas.getBoundingClientRect();
          if (Math.hypot(s0[0] - (e.clientX - r.left), s0[1] - (e.clientY - r.top)) < 12) { closePoly(); return true; } }
        st.pts.push(p); SceneEd.redraw(); return true;
      }
      st.drag = { kind: st.tool, a: p, b: p }; ed().canvas.setPointerCapture(e.pointerId); return true;
    }
    if (type === 'move') {
      if (!st.plane) return false;
      const p = onPlane(e, st.plane, free); if (!p) return true;
      if (st.drag) { st.drag.b = p; const w = Math.abs(p[0] - st.drag.a[0]), h = Math.abs(p[1] - st.drag.a[1]);
        showLabel(e, st.drag.kind === 'rect' ? `${m3(w)} × ${m3(h)}` : `r ${m3(Math.hypot(w, h))}`); }
      else if (st.tool === 'poly' && st.pts.length) { st.hover = p; const q = st.pts[st.pts.length - 1]; showLabel(e, m3(Math.hypot(p[0] - q[0], p[1] - q[1]))); }
      SceneEd.redraw(); return !!st.drag;
    }
    if (type === 'up' && st.drag) { const D = st.drag; st.drag = null; showLabel(e, ''); commit(st.plane, D.kind, [D.a, D.b]); st.plane = null; return true; }
    return false;
  }
  function closePoly() {
    if (st.pts.length < 3) return say('A polygon needs three points or more');
    const pl = st.plane, pts = st.pts.slice(); st.pts = []; st.hover = null; st.plane = null; showLabel({ clientX: 0, clientY: 0 }, '');
    if (Math.abs(area(pts)) < 1e-5) return say('Those points make no area');
    commit(pl, 'poly', pts);
  }
  // a pull let go: a sketch pulled into the prop it was drawn on cuts it
  function finishPush(A) {
    const P = A.P;
    if (A.kind === 'sketch' && P.host && (+P.depth || 0) < -1e-4) {
      const host = World.findPart(objs(), P.host)?.P;
      if (host && !host.hidden) { World.version++; SceneEd.redraw(); setTimeout(() => { Mesh.booleanWith(host, P, 'SUBTRACTION');
        if (host.name?.endsWith(' sketch')) host.name = host.name.replace(/ sketch$/, ''); SceneEd.refreshUI(); say(`Cut ${m3(-P.depth)} into ${host.name || host.type}`); }, 30); return; }
    }
    if (A.kind === 'face') { st.face = null; }
    SceneEd.record();
    if (A.d != null) say(`${A.kind === 'face' ? 'Face' : 'Sketch'} ${A.d >= 0 ? 'pulled out' : 'pushed in'} ${m3(Math.abs(A.d))}`);
  }

  // ----- the header's tools, the keys and the inspector -----
  const TOOLS = [['rect', 'Rectangle', 'Sketch a rectangle: drag on the ground or on a face  ⇧R'], ['circle', 'Circle', 'Sketch a circle: drag out from its middle  ⇧C'],
    ['poly', 'Polygon', 'Sketch a polygon: click its corners, then the first again or Enter  ⇧P'], ['push', 'Push/pull', 'Drag any face of a prop in or out  ⇧U']];
  let bar = null;
  function setTool(t) {
    st.tool = st.tool === t ? null : t; st.plane = null; st.pts = []; st.drag = null; st.hover = null; st.face = null;
    if (st.tool && st.tool !== 'push' && ed().gizmo.object) ed().gizmo.detach();
    bar?.querySelectorAll('[data-sk]').forEach(b => b.classList.toggle('on', b.dataset.sk === st.tool));
    if (st.tool) say(TOOLS.find(x => x[0] === st.tool)[2].split('  ')[0] + ' · Alt for no grid · Esc to stop');
    SceneEd.redraw();
  }
  SceneEd.extras.push({
    mount(el) { bar = document.createElement('div'); bar.className = 'seg sketch'; bar.innerHTML = TOOLS.map(([k, l, t]) => `<button data-sk="${k}" title="${t}">${l}</button>`).join(''); el.appendChild(bar); },
    // a flat sketch shows its pull arrow alone; drawing and pulling keep the move gizmo away
    ownsGizmo: () => !!st.tool && st.tool !== 'push' || !!st.push?.live || (SceneEd.selected?.type === 'sketch' && !solid(SceneEd.selected)),
    overlay(helpers) { overlay(helpers); },
    pointer,
    key(e) {
      const k = e.key.toLowerCase();
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && { r: 'rect', c: 'circle', p: 'poly', u: 'push' }[k]) { setTool({ r: 'rect', c: 'circle', p: 'poly', u: 'push' }[k]); return true; }
      if (!st.tool) return false;
      if (k === 'enter' && st.tool === 'poly') { closePoly(); return true; }
      if (k === 'backspace' && st.tool === 'poly' && st.pts.length) { st.pts.pop(); SceneEd.redraw(); return true; }
      if (k === 'escape') { if (st.pts.length || st.drag) { st.pts = []; st.drag = null; st.plane = null; SceneEd.redraw(); } else setTool(null); return true; }
      return false;
    },
    click(btn) {
      if (btn.dataset.sk) { setTool(btn.dataset.sk); return true; }
      const a = btn.dataset.skact, P = SceneEd.selected; if (!a || !P) return false;
      if (a === 'revolve') { P.revolve = +P.revolve ? 0 : 360; P.depth = 0; }
      else if (a === 'cut') { const host = World.findPart(objs(), P.host)?.P; if (host) { if (!(+P.depth < 0)) P.depth = -Math.max(.05, Math.abs(+P.depth || .1)); World.version++; SceneEd.redraw();
        setTimeout(() => Mesh.booleanWith(host, P, 'SUBTRACTION'), 30); return true; } }
      else if (a === 'flip') P.depth = -(+P.depth || 0);
      SceneEd.record(); return true;
    },
    inspector(P) {
      if (P.type !== 'sketch') return '';
      const f = (k, l, v, step = .01) => `<label class="f"><span>${l}</span><input type="number" step="${step}" data-k="${k}" value="${v}"></label>`;
      let h = `<div class="hd">Sketch</div>`;
      if (P.shape === 'rect') h += f('w', 'Width m', +P.w || 0) + f('d', 'Length m', +P.d || 0);
      else if (P.shape === 'circle') h += f('r', 'Radius m', +P.r || 0) + f('sides', 'Sides', +P.sides || CIRCLE, 1);
      else h += `<p class="note">${loopOf(P).length} corners</p>`;
      h += f('depth', 'Depth m', +P.depth || 0) + f('revolve', 'Revolve °', +P.revolve || 0, 1);
      h += `<div class="acts"><button class="tb small" data-skact="revolve" title="Turn it round its left edge into a solid">${+P.revolve ? 'Extrude instead' : 'Revolve'}</button>`
        + `<button class="tb small" data-skact="flip" title="Extrude the other way">Flip</button>`
        + (P.host ? `<button class="tb small" data-skact="cut" title="Cut it into the prop it was drawn on">Cut into prop</button>` : '') + `</div>`
        + `<p class="note">${solid(P) ? 'Pull the orange arrow to change its depth; Make editable (above) to model it further as a mesh.' : 'Pull the orange arrow to extrude it.'}</p>`;
      return h;
    },
  });
  // typed sizes go in through the inspector's own fields (data-k), as every prop's do

  return { toMesh, loopOf, setTool, get state() { return st; } };
})();
