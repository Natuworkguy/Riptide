// ---------- modelling ----------
// Any prop can be made an editable mesh: its points and faces, kept in the prop ({v: [x, y, z, …] in metres,
// f: [[a, b, c, d], …]}), shaped in the scene editor. Edit mesh (Tab) picks points or faces and moves, turns and
// scales them with the gizmo, and extrudes, insets, bevels, loop-cuts, deletes and merges; Subdivision rounds it off
// (Catmull-Clark) and Smooth shades it so; booleans join one prop with another, cut one from another or keep their
// overlap; Sculpt pushes, pulls, smooths, grabs, inflates and flattens it with a brush.
const Mesh = (() => {
  const T = window.RiptideThree, M = World.M;
  T.BufferGeometry.prototype.computeBoundsTree = T.computeBoundsTree; T.BufferGeometry.prototype.disposeBoundsTree = T.disposeBoundsTree;
  const r4 = v => Math.round(v * 1e4) / 1e4;

  // ----- mesh data -----
  const V = (m, i) => [m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const centre = (m, f) => mul(f.reduce((s, i) => add(s, V(m, i)), [0, 0, 0]), 1 / f.length);
  const faceNormal = (m, f) => { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = V(m, f[i]), b = V(m, f[(i + 1) % f.length]);
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); } return norm(n); };
  const ek = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  function edges(m) {
    const E = new Map();
    m.f.forEach((f, fi) => f.forEach((a, i) => { const b = f[(i + 1) % f.length], k = ek(a, b); let e = E.get(k); if (!e) E.set(k, e = { a, b, faces: [] }); e.faces.push(fi); }));
    return E;
  }
  const push = (m, p) => { m.v.push(r4(p[0]), r4(p[1]), r4(p[2])); return m.v.length / 3 - 1; };
  function compact(m) {
    const used = new Map(), v = [];
    for (const f of m.f) for (const i of f) if (!used.has(i)) { used.set(i, v.length / 3); v.push(m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]); }
    m.v = v; m.f = m.f.map(f => f.map(i => used.get(i)));
  }

  // ----- primitives as meshes of quads -----
  function grid(m, corner, du, dv, nu, nv) {
    const base = m.v.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) push(m, add(corner, add(mul(du, i / nu), mul(dv, j / nv))));
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i; m.f.push([a, a + 1, a + nu + 2, a + nu + 1]); }
  }
  function cube(w, h, d, n = 1) {
    const m = { v: [], f: [] }, x = w / 2, y = h / 2, z = d / 2;
    grid(m, [-x, -y, z], [w, 0, 0], [0, h, 0], n, n); grid(m, [x, -y, -z], [-w, 0, 0], [0, h, 0], n, n);
    grid(m, [x, -y, z], [0, 0, -d], [0, h, 0], n, n); grid(m, [-x, -y, -z], [0, 0, d], [0, h, 0], n, n);
    grid(m, [-x, y, z], [w, 0, 0], [0, 0, -d], n, n); grid(m, [-x, -y, -z], [w, 0, 0], [0, 0, d], n, n);
    return merge(m, 1e-5);
  }
  function cylinder(r0, r1, h, n = 24, rows = 1) {
    const m = { v: [], f: [] };
    for (let j = 0; j <= rows; j++) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = r0 + (r1 - r0) * j / rows; push(m, [Math.sin(a) * r, -h / 2 + h * j / rows, Math.cos(a) * r]); }
    for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n; m.f.push([a, b, b + n, a + n]); }
    if (r0 > 1e-6) m.f.push([...Array(n).keys()].reverse());
    if (r1 > 1e-6) m.f.push([...Array(n).keys()].map(i => rows * n + i));
    return m;
  }
  function sphere(w, h, d, n = 24, rings = 12) {
    const m = { v: [], f: [] };
    for (let j = 1; j < rings; j++) for (let i = 0; i < n; i++) { const t = j / rings * Math.PI, a = i / n * Math.PI * 2;
      push(m, [Math.sin(t) * Math.sin(a) * w / 2, Math.cos(t) * h / 2, Math.sin(t) * Math.cos(a) * d / 2]); }
    const top = push(m, [0, h / 2, 0]), bot = push(m, [0, -h / 2, 0]);
    for (let j = 0; j < rings - 2; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n; m.f.push([a, a + n, b + n, b]); }
    for (let i = 0; i < n; i++) { m.f.push([top, i, (i + 1) % n]); const o = (rings - 2) * n; m.f.push([bot, o + (i + 1) % n, o + i]); }
    return m;
  }
  // any geometry: its triangles, points shared where they meet
  function fromGeometry(g) {
    const m = { v: [], f: [] }, p = g.attributes.position, idx = g.index;
    for (let i = 0; i < p.count; i++) m.v.push(r4(p.getX(i)), r4(p.getY(i)), r4(p.getZ(i)));
    const n = idx ? idx.count : p.count; for (let i = 0; i < n; i += 3) m.f.push(idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2]);
    return merge(m, 1e-5);
  }
  function editable(P) {
    if (P.type === 'sketch' && window.Sketch) return Sketch.toMesh(P);
    const s = (P.size || [1, 1, 1]).map(Number);
    if (P.type === 'box' && !(P.round > 0)) return cube(s[0], s[1], s[2]);
    if (P.type === 'cylinder') return cylinder(s[0] / 2, (P.r2 != null ? +P.r2 : s[0] / 2), s[1], 32);
    if (P.type === 'cone') return cylinder(s[0] / 2, 0, s[1], 32);
    if (P.type === 'sphere') return sphere(s[0], s[1], s[2]);
    const g = World.partGeometry(P); return g ? fromGeometry(g) : cube(.5, .5, .5);
  }

  // ----- what a mesh draws as: subdivided (Catmull-Clark), in triangles, each knowing its face -----
  function subdivide(m) {
    const E = edges(m), out = { v: [], f: [] }, nv = m.v.length / 3;
    const fp = m.f.map(f => centre(m, f));
    const ep = new Map(); for (const [k, e] of E) ep.set(k, e.faces.length === 2 ? mul(add(add(V(m, e.a), V(m, e.b)), add(fp[e.faces[0]], fp[e.faces[1]])), .25) : mul(add(V(m, e.a), V(m, e.b)), .5));
    const vf = Array.from({ length: nv }, () => []), ve = Array.from({ length: nv }, () => []);
    m.f.forEach((f, fi) => f.forEach(i => vf[i].push(fi))); for (const e of E.values()) { ve[e.a].push(e); ve[e.b].push(e); }
    for (let i = 0; i < nv; i++) {
      const P = V(m, i), n = vf[i].length, bound = ve[i].filter(e => e.faces.length < 2);
      if (!n) { push(out, P); continue; }
      if (bound.length) { const a = bound.map(e => V(m, e.a === i ? e.b : e.a)); push(out, mul(add(mul(P, 6), a.reduce(add, [0, 0, 0])), 1 / (6 + a.length))); continue; }
      const F = mul(vf[i].reduce((s, fi) => add(s, fp[fi]), [0, 0, 0]), 1 / n), R = mul(ve[i].reduce((s, e) => add(s, mul(add(V(m, e.a), V(m, e.b)), .5)), [0, 0, 0]), 1 / ve[i].length);
      push(out, mul(add(add(F, mul(R, 2)), mul(P, n - 3)), 1 / n));
    }
    const fi0 = fp.map(p => push(out, p)), ei = new Map(); for (const [k, p] of ep) ei.set(k, push(out, p));
    m.f.forEach((f, j) => f.forEach((a, i) => { const b = f[(i + 1) % f.length], z = f[(i + f.length - 1) % f.length]; out.f.push([a, ei.get(ek(a, b)), fi0[j], ei.get(ek(z, a))]); }));
    return out;
  }
  // a face in triangles: a fan for three or four corners; more, cut as the shape it is (an L or a star is not
  // convex, and a fan across it would fill in what is not there), each turned the way the face faces
  function triangles(m, f) {
    if (f.length <= 4) { const out = []; for (let i = 1; i < f.length - 1; i++) out.push([f[0], f[i], f[i + 1]]); return out; }
    const n = faceNormal(m, f), ax = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
    const [i0, i1] = [[1, 2], [2, 0], [0, 1]][ax], pts = f.map(i => new T.Vector2(m.v[i * 3 + i0], m.v[i * 3 + i1]));
    const out = [];
    for (const [a, b, c] of T.ShapeUtils.triangulateShape(pts, [])) {
      const A = V(m, f[a]), B = V(m, f[b]), C = V(m, f[c]);
      out.push(dot(cross(sub(B, A), sub(C, A)), n) >= 0 ? [f[a], f[b], f[c]] : [f[a], f[c], f[b]]);
    }
    return out;
  }
  function geometry(m, level = 0, smooth = false) {
    for (let i = 0; i < Math.min(4, level); i++) m = subdivide(m);
    const pos = [], tri = [], idx = [];
    for (let i = 0; i < m.v.length; i++) pos.push(m.v[i]);
    m.f.forEach((f, fi) => { for (const t of triangles(m, f)) { idx.push(...t); tri.push(fi); } });
    let g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    if (!smooth) g = g.toNonIndexed();
    g.computeVertexNormals(); g.userData.tri = tri;
    return g;
  }
  // in the world: built again when the mesh changes; while it is being edited, its cage as it is
  const built = new Map();
  World.custom.mesh = P => {
    if (!P.mesh?.v?.length) return null;
    const lvl = state_.editing === P.id ? 0 : Math.max(0, Math.round(+P.subdiv || 0)), key = `${P.meshRev || 0}|${lvl}|${!!P.smooth}`;
    let c = built.get(P.id);
    if (!c || c.key !== key) { c?.g.dispose(); c = { key, g: geometry(P.mesh, lvl, !!P.smooth && lvl >= 0) }; built.set(P.id, c); }
    return c.g;
  };
  World.PARTS.push('mesh');

  // ----- editing -----
  const state_ = { editing: null, mode: 'face', sel: new Set(), pivot: new T.Object3D(), start: null, sculpt: null, pending: null };
  const ed = () => SceneEd.api, P_ = () => SceneEd.selected;
  const meshNode = () => { const n = ed().findNode(state_.editing); let m = null; n?.traverse(x => { if (!m && x.isMesh && x.userData.partId === state_.editing) m = x; }); return m; };
  function changed(P, record = true) { P.meshRev = (P.meshRev || 0) + 1; if (record) SceneEd.record(); else SceneEd.redraw(); World.version++; }
  function makeEditable(P) {
    if (P.type === 'mesh') return P;
    const m = editable(P), keep = ['id', 'name', 'at', 'turn', 'scale', 'keys', 'finish', 'color', 'glow', 'spin', 'bob', 'children', 'hidden'];
    if (P.type === 'sketch' && P.name?.endsWith(' sketch')) P.name = P.name.replace(/ sketch$/, '');
    for (const k of Object.keys(P)) if (!keep.includes(k)) delete P[k];
    P.type = 'mesh'; P.mesh = m; P.meshRev = 1; if (!P.finish) P.finish = 'plastic';
    return P;
  }
  function startEdit(P, mode = 'face') { makeEditable(P); state_.editing = P.id; state_.mode = mode; state_.sel.clear(); state_.sculpt = null; changed(P, false); SceneEd.refreshUI(); }
  function stopEdit() { const P = find(); state_.editing = null; state_.sel.clear(); state_.sculpt = null; ed().gizmo.detach(); if (P) changed(P); SceneEd.refreshUI(); }
  const find = () => state_.editing ? World.findPart(SceneEd.layer?.p.objects, state_.editing)?.P : null;

  // what is picked, as points (a face picks its corners)
  const selPoints = P => { const s = new Set(); if (state_.mode === 'vertex') state_.sel.forEach(i => s.add(i)); else state_.sel.forEach(fi => P.mesh.f[fi]?.forEach(i => s.add(i))); return [...s]; };
  function placePivot(P) {
    const pts = selPoints(P), mesh = meshNode(), gz = ed().gizmo;
    if (!pts.length || !mesh) { if (gz.object === state_.pivot) gz.detach(); return; }
    const c = mul(pts.reduce((s, i) => add(s, V(P.mesh, i)), [0, 0, 0]), 1 / pts.length);
    if (state_.pivot.parent !== mesh) mesh.add(state_.pivot);
    if (!state_.start) { state_.pivot.position.set(...c); state_.pivot.rotation.set(0, 0, 0); state_.pivot.scale.set(1, 1, 1); state_.pivot.updateMatrix(); }
    if (gz.object !== state_.pivot) gz.attach(state_.pivot);
  }
  // the gizmo moving what is picked: every picked point by how the pivot moved since the drag began
  function hookGizmo() {
    const gz = ed().gizmo; if (gz.userData.meshHooked) return; gz.userData.meshHooked = true;
    gz.addEventListener('dragging-changed', e => { const P = find(); if (!P || gz.object !== state_.pivot) return;
      if (e.value) { state_.pivot.updateMatrix(); state_.start = { m: state_.pivot.matrix.clone().invert(), pts: selPoints(P).map(i => [i, V(P.mesh, i)]) }; }
      else { state_.start = null; changed(P); } });
    gz.addEventListener('objectChange', () => { const P = find(); if (!P || gz.object !== state_.pivot || !state_.start) return;
      state_.pivot.updateMatrix(); const d = state_.pivot.matrix.clone().multiply(state_.start.m), v = new T.Vector3();
      for (const [i, p] of state_.start.pts) { v.set(...p).applyMatrix4(d); P.mesh.v[i * 3] = r4(v.x); P.mesh.v[i * 3 + 1] = r4(v.y); P.mesh.v[i * 3 + 2] = r4(v.z); }
      live(P); });
  }
  // the mesh redrawn at once, without building the whole world again
  function live(P) { const mesh = meshNode(); if (!mesh) return; const g = geometry(P.mesh, 0, !!P.smooth); mesh.geometry = g;
    P.meshRev = (P.meshRev || 0) + 1; built.set(P.id, { key: `${P.meshRev}|0|${!!P.smooth}`, g }); SceneEd.redraw(); }

  // ----- tools -----
  function extrude(P, dist = .1) {
    const m = P.mesh, S = [...state_.sel]; if (state_.mode !== 'face' || !S.length) return say('Pick faces to extrude');
    const inSel = new Set(S), E = edges(m), nm = norm(S.reduce((s, fi) => add(s, faceNormal(m, m.f[fi])), [0, 0, 0])), map = new Map();
    for (const fi of S) for (const i of m.f[fi]) if (!map.has(i)) map.set(i, push(m, add(V(m, i), mul(nm, dist))));
    for (const fi of S) { const f = m.f[fi];
      f.forEach((a, i) => { const b = f[(i + 1) % f.length], e = E.get(ek(a, b));
        if (e.faces.filter(x => inSel.has(x)).length === 1) m.f.push([a, b, map.get(b), map.get(a)]); });
      m.f[fi] = f.map(i => map.get(i)); }
    ed().gizmo.setMode('translate'); changed(P);
  }
  function inset(P, amount = .2, lift = 0) {
    const m = P.mesh, S = [...state_.sel]; if (state_.mode !== 'face' || !S.length) return say('Pick faces to inset');
    for (const fi of S) { const f = m.f[fi], c = centre(m, f), n = faceNormal(m, f);
      const inner = f.map(i => push(m, add(add(V(m, i), mul(sub(c, V(m, i)), amount)), mul(n, lift))));
      f.forEach((a, i) => m.f.push([a, f[(i + 1) % f.length], inner[(i + 1) % f.length], inner[i]])); m.f[fi] = inner; }
    changed(P);
  }
  function loopCut(P, turn = false) {
    const m = P.mesh, fi0 = [...state_.sel][0]; if (state_.mode !== 'face' || fi0 == null || m.f[fi0].length !== 4) return say('Pick a four-sided face to cut a loop through');
    const E = edges(m), ring = [], seen = new Set();
    // walk from the face across its opposite edges, both ways, through four-sided faces
    const walk = (fi, enter) => { while (fi != null && !seen.has(fi) && m.f[fi].length === 4) { seen.add(fi); ring.push([fi, enter]);
      const f = m.f[fi], a = f[(enter + 2) % 4], b = f[(enter + 3) % 4], e = E.get(ek(a, b)), next = e.faces.find(x => x !== fi);
      if (next == null) break; const g = m.f[next]; enter = g.findIndex((x, i) => ek(x, g[(i + 1) % g.length]) === ek(a, b)); fi = next; } };
    const s = turn ? 1 : 0; walk(fi0, s);
    { const f = m.f[fi0], a = f[s], b = f[(s + 1) % 4], e = E.get(ek(a, b)), back = e.faces.find(x => x !== fi0);
      if (back != null && !seen.has(back)) { const g = m.f[back]; walk(back, g.findIndex((x, i) => ek(x, g[(i + 1) % g.length]) === ek(a, b))); } }
    const mid = new Map(), midOf = (a, b) => { const k = ek(a, b); if (!mid.has(k)) mid.set(k, push(m, mul(add(V(m, a), V(m, b)), .5))); return mid.get(k); };
    for (const [fi, en] of ring) { const f = m.f[fi], v0 = f[en], v1 = f[(en + 1) % 4], v2 = f[(en + 2) % 4], v3 = f[(en + 3) % 4];
      const m1 = midOf(v0, v1), m2 = midOf(v2, v3); m.f[fi] = [v0, m1, m2, v3]; m.f.push([m1, v1, v2, m2]); }
    state_.sel.clear(); changed(P); say(`Cut a loop through ${ring.length} face${ring.length > 1 ? 's' : ''}`);
  }
  function remove(P) {
    const m = P.mesh;
    if (state_.mode === 'face') { const S = state_.sel; m.f = m.f.filter((_, i) => !S.has(i)); }
    else { const S = state_.sel; m.f = m.f.filter(f => !f.some(i => S.has(i))); }
    state_.sel.clear(); compact(m); changed(P);
  }
  function merge(m, eps = .001) {
    const key = (i) => [0, 1, 2].map(k => Math.round(m.v[i * 3 + k] / eps)).join(','), to = new Map(), map = [], v = [];
    for (let i = 0; i < m.v.length / 3; i++) { const k = key(i); if (!to.has(k)) { to.set(k, v.length / 3); v.push(m.v[i * 3], m.v[i * 3 + 1], m.v[i * 3 + 2]); } map[i] = to.get(k); }
    m.v = v; m.f = m.f.map(f => f.map(i => map[i]).filter((x, j, a) => x !== a[(j + 1) % a.length])).filter(f => f.length >= 3);
    return m;
  }
  function applySubdiv(P) { const lvl = Math.max(1, Math.round(+P.subdiv || 1)); let m = P.mesh; for (let i = 0; i < lvl; i++) m = subdivide(m);
    m.v = m.v.map(r4); P.mesh = m; P.subdiv = 0; state_.sel.clear(); changed(P); say(`Applied: ${m.f.length} faces now`); }

  // ----- booleans: one prop with another, the result a mesh in the first's place -----
  function booleanWith(A, B2, op) {
    const W = ed().B, nodeA = ed().findNode(A.id), nodeB = ed().findNode(B2.id); if (!nodeA || !nodeB) return say('Both have to be in view');
    const brush = node => { const parts = []; node.updateMatrixWorld(true);
      node.traverse(x => { if (x.isMesh && x.visible) { let g = x.geometry.clone(); g.applyMatrix4(x.matrixWorld); if (g.index) g = g.toNonIndexed();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals(); parts.push(g); } });
      const g = T.BufferGeometryUtils.mergeGeometries(parts); const b = new T.Brush(g); b.updateMatrixWorld(); return b; };
    const ev = new T.Evaluator(); ev.attributes = ['position', 'normal'];
    const out = ev.evaluate(brush(nodeA), brush(nodeB), T.CSG[op]);
    // back into the first prop's own space, in metres
    const inv = new T.Matrix4().copy(nodeA.matrixWorld).invert().premultiply(new T.Matrix4().makeScale(1 / M, 1 / M, 1 / M));
    const g = out.geometry.clone(); g.applyMatrix4(inv);
    const keep = { id: A.id, name: A.name, at: A.at, turn: A.turn, scale: A.scale, keys: A.keys, finish: A.finish, color: A.color, glow: A.glow };
    for (const k of Object.keys(A)) delete A[k]; Object.assign(A, Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined)));
    A.type = 'mesh'; A.mesh = fromGeometry(g); A.meshRev = 1; A.smooth = false;
    const f = World.findPart(SceneEd.layer.p.objects, B2.id); if (f && op !== 'ADDITION') { f.P.hidden = true; } else if (f) f.list.splice(f.list.indexOf(f.P), 1);
    void W; changed(A); say(op === 'SUBTRACTION' ? `Cut ${B2.name || B2.type} out (it is hidden, not gone)` : op === 'ADDITION' ? 'Joined' : `Kept the overlap (${B2.name || B2.type} is hidden)`);
  }

  // ----- sculpting -----
  const BRUSHES = [['draw', 'Draw'], ['smooth', 'Smooth'], ['grab', 'Grab'], ['inflate', 'Inflate'], ['flatten', 'Flatten']];
  const brush = { kind: 'draw', radius: .15, strength: .5 };
  let neighbours = null;
  function sculptAt(P, e, first) {
    const mesh = meshNode(), a = ed(); if (!mesh || !a.cam) return false;
    const r = a.canvas.getBoundingClientRect(), ray = new T.Raycaster(); ray.firstHitOnly = true;
    ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), a.cam);
    if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree();
    const hits = []; T.acceleratedRaycast.call(mesh, ray, hits);
    const h = hits.sort((x, y) => x.distance - y.distance)[0];
    if (!h && brush.kind !== 'grab') return true;
    const m = P.mesh, inv = new T.Matrix4().copy(mesh.matrixWorld).invert();
    if (first) { neighbours = Array.from({ length: m.v.length / 3 }, () => new Set()); for (const f of m.f) f.forEach((x, i) => { const y = f[(i + 1) % f.length]; neighbours[x].add(y); neighbours[y].add(x); });
      state_.grab = h ? { p: h.point.clone().applyMatrix4(inv), d: h.distance } : null; }
    const at = h ? h.point.clone().applyMatrix4(inv) : null, n = h ? h.face.normal.clone() : null, R = brush.radius, k = brush.strength * (e.ctrlKey || e.metaKey ? -1 : 1);
    if (brush.kind === 'grab') { if (!state_.grab) return true;
      const p = new T.Vector3(); ray.ray.at(state_.grab.d, p); p.applyMatrix4(inv); const d = p.clone().sub(state_.grab.p); state_.grab.p.copy(p);
      for (let i = 0; i < m.v.length / 3; i++) { const q = V(m, i), w = falloff(Math.hypot(q[0] - p.x + d.x, q[1] - p.y + d.y, q[2] - p.z + d.z), R); if (w > 0) { m.v[i * 3] += d.x * w; m.v[i * 3 + 1] += d.y * w; m.v[i * 3 + 2] += d.z * w; } } }
    else for (let i = 0; i < m.v.length / 3; i++) {
      const q = V(m, i), w = falloff(Math.hypot(q[0] - at.x, q[1] - at.y, q[2] - at.z), R); if (w <= 0) continue;
      let dlt;
      if (brush.kind === 'draw') dlt = mul([n.x, n.y, n.z], .01 * k * w);
      else if (brush.kind === 'inflate') { const vn = vertexNormal(m, i); dlt = mul(vn, .01 * k * w); }
      else if (brush.kind === 'smooth') { const ns = [...neighbours[i]]; if (!ns.length) continue; const avg = mul(ns.reduce((s, j) => add(s, V(m, j)), [0, 0, 0]), 1 / ns.length); dlt = mul(sub(avg, q), .5 * Math.abs(k) * w); }
      else { const off = dot(sub(q, [at.x, at.y, at.z]), [n.x, n.y, n.z]); dlt = mul([n.x, n.y, n.z], -off * .3 * Math.abs(k) * w); }
      m.v[i * 3] += dlt[0]; m.v[i * 3 + 1] += dlt[1]; m.v[i * 3 + 2] += dlt[2];
    }
    live(P); mesh.geometry.computeBoundsTree();
    return true;
  }
  const falloff = (d, R) => d >= R ? 0 : (1 - (d / R) ** 2) ** 2;
  function vertexNormal(m, i) { let n = [0, 0, 0]; for (const f of m.f) if (f.includes(i)) n = add(n, faceNormal(m, f)); return norm(n); }

  // ----- picking in the viewport -----
  function pickAt(P, e) {
    const mesh = meshNode(), a = ed(); if (!mesh || !a.cam) return;
    const r = a.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!e.shiftKey) state_.sel.clear();
    if (state_.mode === 'vertex') {
      let best = -1, bd = 12; const v = new T.Vector3();
      for (let i = 0; i < P.mesh.v.length / 3; i++) { v.set(...V(P.mesh, i)).applyMatrix4(mesh.matrixWorld).project(a.cam);
        const sx = (v.x + 1) / 2 * r.width, sy = (1 - v.y) / 2 * r.height, d = Math.hypot(sx - x, sy - y); if (v.z < 1 && d < bd) { bd = d; best = i; } }
      if (best >= 0) { if (state_.sel.has(best) && e.shiftKey) state_.sel.delete(best); else state_.sel.add(best); }
    } else {
      const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(x / r.width * 2 - 1, -y / r.height * 2 + 1), a.cam);
      const h = ray.intersectObject(mesh, false)[0];
      if (h) { const fi = mesh.geometry.userData.tri?.[h.faceIndex]; if (fi != null) { if (state_.sel.has(fi) && e.shiftKey) state_.sel.delete(fi); else state_.sel.add(fi); } }
    }
    placePivot(P); SceneEd.refreshUI();
  }
  // what editing shows: every edge, the points, what is picked
  let temp = [];
  function overlay(helpers) {
    for (const x of temp) { x.geometry.dispose(); x.material.dispose(); } temp = [];
    const P = find(), mesh = meshNode(); if (!P || !mesh) return;
    const before = helpers.length;
    hookGizmo(); placePivot(P);
    const m = P.mesh, seg = []; for (const e of edges(m).values()) seg.push(...V(m, e.a), ...V(m, e.b));
    const lines = new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(seg, 3)), new T.LineBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: .65, depthTest: true }));
    lines.applyMatrix4(mesh.matrixWorld); helpers.push(lines);
    if (state_.mode === 'vertex') { const pts = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(m.v, 3)),
        new T.PointsMaterial({ color: 0x0b0d12, size: 6, sizeAttenuation: false }));
      pts.applyMatrix4(mesh.matrixWorld); helpers.push(pts);
      const on = [...state_.sel].flatMap(i => V(m, i)); if (on.length) { const sp = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(on, 3)), new T.PointsMaterial({ color: 0xff9a2e, size: 9, sizeAttenuation: false, depthTest: false }));
        sp.applyMatrix4(mesh.matrixWorld); helpers.push(sp); } }
    else if (state_.sel.size) { const tri = []; for (const fi of state_.sel) { const f = m.f[fi]; if (!f) continue; for (let i = 1; i < f.length - 1; i++) tri.push(...V(m, f[0]), ...V(m, f[i]), ...V(m, f[i + 1])); }
      const hl = new T.Mesh(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(tri, 3)), new T.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: .4, side: T.DoubleSide, depthTest: false }));
      hl.applyMatrix4(mesh.matrixWorld); helpers.push(hl); }
    // made for this frame only: let go of at the next
    temp = helpers.slice(before);
  }

  let msg = '';
  const say = t => { msg = t; status(t); };
  let downAt = null, sculpting = false;
  SceneEd.extras.push({
    ownsGizmo: () => !!state_.editing && !!find(),
    overlay(helpers) { if (state_.editing && !state_.sculpt) overlay(helpers); },
    pointer(type, e) {
      const P = find(), gz = ed().gizmo;
      if (state_.pending && type === 'up') { const id = pickProp(e); const A = World.findPart(SceneEd.layer.p.objects, state_.pending.a)?.P, B2 = id && World.findPart(SceneEd.layer.p.objects, id)?.P;
        const op = state_.pending.op; state_.pending = null; if (A && B2 && A !== B2) booleanWith(A, B2, op); else say('Pick another prop to do it with'); return true; }
      if (state_.pending) return type === 'down';
      if (!P) return false;
      if (state_.sculpt) {
        if (e.button !== 0 || e.altKey) return false;
        if (type === 'down') { sculpting = true; ed().canvas.setPointerCapture(e.pointerId); sculptAt(P, e, true); return true; }
        if (type === 'move' && sculpting) return sculptAt(P, e, false);
        if (type === 'up' && sculpting) { sculpting = false; changed(P); return true; }
        return false;
      }
      if (gz.axis != null || gz.dragging) return false;
      if (type === 'down' && e.button === 0) { downAt = [e.clientX, e.clientY]; return false; }
      if (type === 'up' && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 4) { downAt = null; pickAt(P, e); return true; }
      return false;
    },
    key(e) {
      const P = find(), k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Tab') { if (P) stopEdit(); else { const S2 = P_(); if (S2 && !['group', 'light', 'model', 'label'].includes(S2.type)) startEdit(S2); else return false; } return true; }
      if (!P) return false;
      if (state_.sculpt) { if (k === 'escape') { state_.sculpt = null; SceneEd.refreshUI(); return true; } if (k === '[') brush.radius = Math.max(.01, brush.radius / 1.2); else if (k === ']') brush.radius *= 1.2; else return false; SceneEd.refreshUI(); return true; }
      if (k === '1') state_.mode = 'vertex', state_.sel.clear(); else if (k === '3') state_.mode = 'face', state_.sel.clear();
      else if (k === 'e' && !mod) extrude(P); else if (k === 'i' && !mod) inset(P); else if (k === 'b' && mod) inset(P, .25, .03);
      else if (k === 'r' && mod) loopCut(P, e.shiftKey); else if (k === 'x' || k === 'delete') remove(P);
      else if (k === 'a' && !mod) { const n = state_.mode === 'face' ? P.mesh.f.length : P.mesh.v.length / 3; if (state_.sel.size === n) state_.sel.clear(); else for (let i = 0; i < n; i++) state_.sel.add(i); }
      else if (k === 'm' && !mod) { merge(P.mesh); state_.sel.clear(); changed(P); }
      else if (k === 'escape') { if (state_.sel.size) state_.sel.clear(); else stopEdit(); }
      else if (k === 'g') ed().gizmo.setMode('translate'); else if (k === 'r') ed().gizmo.setMode('rotate'); else if (k === 's') ed().gizmo.setMode('scale');
      else return false;
      placePivot(P); SceneEd.refreshUI(); return true;
    },
    inspector(P) {
      if (['group', 'light', 'model', 'label'].includes(P.type)) return '';
      const editing = state_.editing === P.id, b = (act, label, title = '') => `<button class="tb small" data-mesh="${act}" title="${title}">${label}</button>`;
      let h = `<div class="hd">Modelling</div>`;
      if (!editing) {
        h += `<div class="acts">${b('edit', P.type === 'mesh' ? 'Edit mesh' : 'Make editable', 'Tab')}${b('sculpt', 'Sculpt')}</div>`;
        if (P.type === 'mesh') h += `<label class="f"><span>Subdivide</span><input type="number" min="0" max="4" step="1" data-k="subdiv" value="${+P.subdiv || 0}"></label>
          <label class="f"><span>Smooth</span><select data-k="smooth"><option value="">Flat</option><option value="1"${P.smooth ? ' selected' : ''}>Smooth</option></select></label>
          <div class="acts">${+P.subdiv ? b('apply', 'Apply subdivision') : ''}</div>`;
        h += `<div class="acts">${b('ADDITION', 'Join with…', 'Then pick the other prop')}${b('SUBTRACTION', 'Cut with…', 'Then pick the prop to cut away')}${b('INTERSECTION', 'Keep overlap with…')}</div>`;
        if (state_.pending) h += `<p class="note">Now pick the other prop in the view.</p>`;
        return h;
      }
      if (state_.sculpt) return h + `<div class="seg brush">${BRUSHES.map(([k, l]) => `<button data-brush="${k}" class="${brush.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="f"><span>Radius m</span><input type="number" step=".01" data-brushk="radius" value="${brush.radius.toFixed(3)}"></label>
        <label class="f"><span>Strength</span><input type="number" step=".05" data-brushk="strength" value="${brush.strength}"></label>
        <p class="note">Drag on it to sculpt; Ctrl (⌘) does the opposite; [ and ] size the brush; Alt-drag to orbit.</p><div class="acts">${b('subdivide', 'Add detail', 'Subdivide it once, for finer sculpting')}${b('done', 'Done')}</div>`;
      const n = state_.sel.size;
      return h + `<div class="seg pickmode"><button data-mesh="vertex" class="${state_.mode === 'vertex' ? 'on' : ''}">Points 1</button><button data-mesh="face" class="${state_.mode === 'face' ? 'on' : ''}">Faces 3</button></div>
        <p class="note">${n ? `${n} ${state_.mode === 'face' ? 'face' : 'point'}${n > 1 ? 's' : ''} picked` : 'Click to pick; Shift adds; A picks all'} · ${P.mesh.v.length / 3} points, ${P.mesh.f.length} faces</p>
        <div class="acts">${b('extrude', 'Extrude', 'E')}${b('inset', 'Inset', 'I')}${b('bevel', 'Bevel', 'Ctrl B')}${b('loop', 'Loop cut', 'Ctrl R; Shift the other way')}${b('del', 'Delete', 'X')}${b('merge', 'Merge', 'M: points at the same place')}${b('done', 'Done', 'Tab')}</div>`;
    },
    click(btn) {
      const a = btn.dataset.mesh, P = P_();
      if (btn.dataset.brush) { brush.kind = btn.dataset.brush; SceneEd.refreshUI(); return true; }
      if (!a || !P) return false;
      const E = find();
      if (a === 'edit') startEdit(P);
      else if (a === 'sculpt') { startEdit(P); state_.sculpt = true; ed().gizmo.detach(); SceneEd.refreshUI(); }
      else if (a === 'apply') applySubdiv(P);
      else if (a === 'subdivide' && E) { E.subdiv = 1; applySubdiv(E); }
      else if (['ADDITION', 'SUBTRACTION', 'INTERSECTION'].includes(a)) { state_.pending = { a: P.id, op: a }; say('Now pick the other prop'); SceneEd.refreshUI(); }
      else if (!E) return false;
      else if (a === 'vertex' || a === 'face') { state_.mode = a; state_.sel.clear(); }
      else if (a === 'extrude') extrude(E); else if (a === 'inset') inset(E); else if (a === 'bevel') inset(E, .25, .03);
      else if (a === 'loop') loopCut(E); else if (a === 'del') remove(E); else if (a === 'merge') { merge(E.mesh); state_.sel.clear(); changed(E); }
      else if (a === 'done') stopEdit();
      placePivot(E || P); SceneEd.refreshUI(); return true;
    },
  });
  // the brush's numbers, typed in the inspector
  document.addEventListener('change', e => { const k = e.target.dataset?.brushk; if (k) brush[k] = Math.max(.001, +e.target.value || brush[k]); });
  function pickProp(e) {
    const a = ed(); if (!a.cam) return null;
    const r = a.canvas.getBoundingClientRect(), ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), a.cam);
    for (const h of ray.intersectObject(a.B.props, true)) { let n = h.object; while (n && !n.userData.partId) n = n.parent; if (n) return n.userData.partId; }
    return null;
  }
  return { editable, subdivide, geometry, makeEditable, startEdit, stopEdit, booleanWith, get state() { return state_; }, brush, extrude, inset, loopCut };
})();
