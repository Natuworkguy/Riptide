// ---------- the scene editor ----------
// A 3D world's own workspace, over the editor: its props in an outliner, a viewport to fly round them freely or to
// look through the film camera, gizmos to move, turn and scale what is picked, and its settings beside. Every
// change is the world layer's (its objects), so it is undone, saved and exported like any other, and a prop's
// place, turn and scale keyframe at the playhead once a key is set on them.
const SceneEd = (() => {
  const T = window.RiptideThree, M = World.M, deg = v => v * Math.PI / 180, rad = v => v * 180 / Math.PI;
  const r3 = v => Math.round(v * 1000) / 1000;
  let L = null, wrap = null, canvas = null, g2 = null, cam = null, orbit = null, gizmo = null, grid = null, box = null;
  let selId = null, view = 'free', dirty = true, raf = 0, playing = false, lastT = 0, holding = false, B = null;
  const SPEED_LOCK_KEY = 'riptide.ghostSpeedLock', WHEEL_STEP_MS = 180;
  const ghost = { keys: new Set(), look: null, speed: 1, wheelAt: 0, wantLock: false,
    speedLock: (() => { try { return localStorage.getItem(SPEED_LOCK_KEY) === '1'; } catch { return false; } })() };   // the ghost view: fly the viewport camera, WASD/QE and drag to look
  const extras = [];          // what later modules add to the header (the library, the render mode)
  const ADD = [['box', 'Box', { size: [.5, .5, .5] }], ['rbox', 'Rounded box', { type: 'box', size: [.5, .5, .5], round: .05 }],
    ['cylinder', 'Cylinder', { size: [.4, .6, 1] }], ['sphere', 'Sphere', { size: [.5, .5, .5] }], ['cone', 'Cone', { size: [.4, .6, 1] }],
    ['torus', 'Torus', { size: [.5, 1, .12] }], ['capsule', 'Capsule', { size: [.25, .7, 1] }],
    ['tower', 'Lattice tower', { type: 'truss', size: [1.2, 8, 1.2], bays: 8, rod: .03, taper: .4, finish: 'steel' }],
    ['beam', 'Lattice beam', { type: 'truss', size: [.25, 3, .25], bays: 10, rod: .012, turn: [0, 0, 90], finish: 'steel' }],
    ['label', 'Screen', { size: [.4, .25, 1], text: 'TEXT', color: '#f2f2f2', background: '#050505' }],
    ['point', 'Point light', { type: 'light', light: 'point', color: '#ffe8cc', power: 120 }],
    ['spot', 'Spot light', { type: 'light', light: 'spot', color: '#ffffff', power: 200, angle: 30, soft: 40, turn: [-35, 0, 0] }],
    ['group', 'Empty group', { type: 'group', children: [] }]];
  // what later modules add to the Add menu: [kind, label, spec]
  const ADD_MORE = ADD;

  const objs = () => (L.p.objects ||= []);
  // props key on world time: the timeline's, slowed or sped by the world's speed
  const wt = () => World.worldTime(L, time);
  // the 3D shapes and models above the world, up to the next world: layers of their own, picked as 'L:' + their id
  const isLay = id => typeof id === 'string' && id.startsWith('L:');
  const layers3d = () => { const out = []; for (let j = S.layers.indexOf(L) + 1; j < S.layers.length; j++) { const x = S.layers[j];
    if (x.type === 'world') break; if (x.type === 'shape3d' || x.type === 'model') out.push(x); } return out; };
  const selLayer = () => isLay(selId) ? S.layers.find(x => x.id === selId.slice(2)) || null : null;
  let gnd = 0, snap = true;
  const found = () => selId && !isLay(selId) ? World.findPart(objs(), selId) : null;
  const sel = () => found()?.P || null;
  const nameOf = P => P.name || (P.type === 'camera' ? 'Camera' : P.type === 'model' ? 'Model' : P.type === 'light' ? `${P.light === 'spot' ? 'Spot' : 'Point'} light` : P.type === 'truss' ? 'Lattice' : P.type === 'label' ? 'Screen'
    : (P.type || 'group')[0].toUpperCase() + (P.type || 'group').slice(1));
  const touch = (record = false) => { dirty = true; if (record) { refresh(); } };

  // ----- building the workspace, once -----
  function build() {
    wrap = document.createElement('div'); wrap.className = 'sced'; wrap.hidden = true;
    wrap.innerHTML = `<header><b class="ttl">Scene</b><span class="nm"></span>
      <div class="seg tools"><button data-tool="translate" title="Move  G / W">Move</button><button data-tool="rotate" title="Turn  R / E">Turn</button><button data-tool="scale" title="Scale  S">Scale</button></div>
      <button class="tb small" data-act="add">+ Add</button><span class="extras"></span>
      <div class="seg"><button data-act="snap" class="on" title="Drop what you move onto the ground, or onto the top of what it is over">Snap</button></div>
      <div class="seg"><button data-act="speedlock"${ghost.speedLock ? ' class="on"' : ''} title="Ghost view: scrolling changes the speed in steady, fixed steps, for trackpads and Magic Mice">Speed lock</button></div>
      <div class="seg views"><button data-view="free" title="Fly round the scene">Free</button><button data-view="ghost" title="Fly through the scene  V">Ghost</button><button data-view="film" title="Look through the film camera">Film camera</button></div>
      <span class="sp"></span><button class="tb small" data-act="shot" title="Save this view as a PNG, without the grid or handles">Screenshot</button><button class="tb primary" data-act="done">Done</button></header>
      <aside class="outl"><div class="hd">Scene</div><div class="tree"></div></aside>
      <main class="vp"><canvas></canvas><div class="hint">Drag to orbit · right-drag to pan · scroll to zoom · click a prop to pick it</div></main>
      <aside class="insp"></aside>
      <footer><button class="tb small" data-act="play">Play</button><input type="range" class="scrub" min="0" step="0.01"><span class="tm"></span></footer>`;
    document.body.appendChild(wrap);
    canvas = wrap.querySelector('canvas'); g2 = canvas.getContext('2d');
    cam = new T.PerspectiveCamera(40, 1, 5, 4e6);
    orbit = new T.OrbitControls(cam, canvas); orbit.enableDamping = false; orbit.addEventListener('change', () => { dirty = true; });
    gizmo = new T.TransformControls(cam, canvas); gizmo.setSize(.9);
    gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; holding = e.value; if (B) B.hold = e.value;
      if (!e.value) { if (snap && gizmo.mode === 'translate') drop(); writeBack(); refresh(); renderInsp(); } });
    gizmo.addEventListener('objectChange', () => { writeBack(); dirty = true; renderInsp(true); });
    gizmo.addEventListener('change', () => { dirty = true; });
    grid = new T.GridHelper(40 * M, 40, 0x6f7480, 0x3a3d45); grid.material.transparent = true; grid.material.opacity = .45;
    box = new T.BoxHelper(new T.Object3D(), 0x5b98ff);
    wrap.addEventListener('click', onClick);
    wrap.querySelector('.scrub').addEventListener('input', e => { time = +e.target.value; render(); dirty = true; footer(); });
    wrap.querySelector('.insp').addEventListener('change', onInsp);
    wrap.querySelector('.insp').addEventListener('input', e => { if (e.target.type === 'color' || e.target.type === 'range') onInsp(e, false); });
    let down = null;
    // a tool (editing a mesh, sculpting) takes the pointer first when it wants it
    const hook = (type, e) => extras.some(x => x.pointer?.(type, e));
    canvas.addEventListener('pointerdown', e => { if (hook('down', e)) { down = null; e.stopImmediatePropagation(); return; } }, true);
    canvas.addEventListener('pointermove', e => { if (hook('move', e)) e.stopImmediatePropagation(); }, true);
    canvas.addEventListener('pointerup', e => { if (hook('up', e)) { down = null; e.stopImmediatePropagation(); } }, true);
    canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY];
      if (view === 'ghost') { if (!locked()) lockCursor(); ghost.look = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); } });
    canvas.addEventListener('pointermove', e => { if (view !== 'ghost') return;
      // locked: the cursor stays hidden in the middle and every move turns the view, round and round with no edge;
      // not locked (the browser refused): drag to look, as before
      let dx, dy;
      if (locked()) { dx = e.movementX; dy = e.movementY; }
      else { if (!ghost.look) return; dx = e.clientX - ghost.look[0]; dy = e.clientY - ghost.look[1]; ghost.look = [e.clientX, e.clientY]; }
      const eu = new T.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
      eu.y -= dx * .004; eu.x = Math.max(-1.55, Math.min(1.55, eu.x - dy * .004)); eu.z = 0; cam.quaternion.setFromEuler(eu); dirty = true; });
    canvas.addEventListener('wheel', e => { if (view !== 'ghost') return; e.preventDefault(); e.stopImmediatePropagation();
      // Speed lock: trackpads and Magic Mice send floods of uneven, momentum-carried deltas; with it on, the scroll
      // changes the speed by one fixed step at a steady pace (at most one step every WHEEL_STEP_MS), whatever the delta
      if (!e.deltaY) return;
      if (ghost.speedLock) { const now = performance.now(); if (now - ghost.wheelAt < WHEEL_STEP_MS) return; ghost.wheelAt = now; }
      ghost.speed = Math.max(.1, Math.min(20, ghost.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); hint(); }, { capture: true, passive: false });
    document.addEventListener('pointerlockchange', () => {
      // the lock went (Esc, which the browser keeps for itself while locked, or the tab losing focus): leave the ghost view
      if (!locked() && view === 'ghost' && ghost.wantLock) { ghost.wantLock = false; setView('free'); }
      else if (view === 'ghost') hint();
    });
    document.addEventListener('pointerlockerror', () => {
      if (view === 'ghost') { ghost.wantLock = false; status('The browser would not lock the cursor: drag to look instead'); hint(); }
    });
    canvas.addEventListener('pointerup', e => { ghost.look = null; if (view === 'ghost') { down = null; return; } if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4 && !gizmo.dragging && gizmo.axis == null) pick(e); down = null; });
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', e => { ghost.keys.delete(e.code); }, true);
    addEventListener('blur', () => ghost.keys.clear());
    new ResizeObserver(() => { dirty = true; }).observe(wrap.querySelector('.vp'));
  }

  function open(layer) {
    if (!World.gl()) return status('3D worlds need WebGL, which this browser does not have');
    if (!wrap) build();
    L = layer; World.ensureIds(objs()); selId = null; view = 'free'; orbit.enabled = true; ghost.keys.clear(); ghost.look = null; wrap.hidden = false; hint();
    // start where the film camera stands, looking where it looks
    const film = World.camera(time, state(L, time)); cam.position.copy(film.position); cam.fov = film.fov; orbit.target.copy(film.userData.target); orbit.update();
    wrap.querySelector('.nm').textContent = L.name;
    for (const x of extras) x.mount?.(wrap.querySelector('.extras'));
    renderTree(); renderInsp(); footer(); tools(); dirty = true; cancelAnimationFrame(raf); loop();
  }
  function close() { if (!wrap || wrap.hidden) return; unlockCursor(); stopPlay(); gizmo.detach(); wrap.hidden = true; cancelAnimationFrame(raf); L = null; refresh(); }

  // ----- the viewport -----
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!L || wrap.hidden) return;
    if (view === 'ghost') fly();
    if (playing) { const now = performance.now(); time += (now - lastT) / 1000; lastT = now; if (time > S.dur) time = loop_ ? 0 : (stopPlay(), S.dur); footer(); dirty = true; }
    const vp = wrap.querySelector('.vp'), w = vp.clientWidth, h = vp.clientHeight, pr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) { canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr); dirty = true; }
    const keep = extras.some(x => x.busy?.());
    if (!dirty && !keep) return;
    dirty = false;
    draw(w, h, pr);
  }
  const loop_ = true;
  // ----- the ghost view: a viewing aid only; it moves the viewport's own camera, never the film camera -----
  let flyT = 0;
  function fly() {
    const now = performance.now(), dt = Math.min(.1, (now - (flyT || now)) / 1000); flyT = now;
    const K = ghost.keys, v = new T.Vector3((K.has('KeyD') ? 1 : 0) - (K.has('KeyA') ? 1 : 0), (K.has('KeyE') ? 1 : 0) - (K.has('KeyQ') ? 1 : 0),
      (K.has('KeyS') ? 1 : 0) - (K.has('KeyW') ? 1 : 0));
    if (!v.lengthSq()) return;
    const fast = K.has('ShiftLeft') || K.has('ShiftRight') ? 4 : 1;
    v.normalize().multiplyScalar(4 * M * ghost.speed * fast * dt);
    const up = v.y; v.y = 0; v.applyQuaternion(cam.quaternion); v.y += up;   // forward follows the look, Q/E go straight down/up
    cam.position.add(v); dirty = true;
  }
  function setView(v) {
    if (v === view) return;
    if (view === 'ghost') {   // hand back to the orbit, round a point just ahead of where the ghost stopped
      const d = Math.max(5 * M, cam.position.distanceTo(orbit.target));
      orbit.target.copy(cam.position).add(new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(d)); orbit.update();
    }
    view = v; ghost.keys.clear(); ghost.look = null; flyT = 0;
    if (view === 'ghost') lockCursor(); else unlockCursor();
    orbit.enabled = view === 'free'; if (view !== 'free') gizmo.detach();
    hint(); tools(); dirty = true;
  }
  // The ghost view hides the cursor and keeps it in the middle (the Pointer Lock API), so looking can turn past 360°.
  function locked() { return document.pointerLockElement === canvas; }
  function lockCursor() {
    if (locked() || !canvas.requestPointerLock) return;
    ghost.wantLock = true;
    try { const p = canvas.requestPointerLock(); if (p?.catch) p.catch(() => { ghost.wantLock = false; hint(); }); }
    catch { ghost.wantLock = false; }
  }
  function unlockCursor() { ghost.wantLock = false; if (locked()) document.exitPointerLock(); }
  function hint() { wrap.querySelector('.vp .hint').textContent = view === 'ghost'
    ? `Ghost view · WASD to fly · Q/E down/up · ${locked() || ghost.wantLock ? 'move the mouse' : 'drag'} to look · Shift for speed · scroll to change speed (${ghost.speed.toFixed(1)}×) · Esc to leave`
    : 'Drag to orbit · right-drag to pan · scroll to zoom · click a prop to pick it'; }
  function draw(w, h, pr) {
    World.showGuides = view !== 'film' && !extras.some(x => x.helpers && !x.helpers());
    const o = state(L, time), staged = World.stage(L, o, time); World.showGuides = false; B = staged.B; B.hold = holding; gnd = staged.ground;
    const R = World.renderer, film = view === 'film', W = canvas.width, H = canvas.height;
    let camera = cam;
    if (film) camera = staged.cam; else { cam.aspect = W / H; cam.updateProjectionMatrix(); }
    // what is picked: the gizmo on it and a box round it, in the free view
    const node = selId ? findNode(selId) : null;
    if (view === 'ghost' || extras.some(x => x.ownsGizmo?.())) { if (view === 'ghost' && gizmo.object) gizmo.detach(); }
    else if (node && gizmo.object !== node) gizmo.attach(node); else if (!node && gizmo.object) gizmo.detach();
    const helpers = [];
    // no grid or gizmo in a view drawn as filmed (path traced)
    if (!film && !shooting && !extras.some(x => x.helpers && !x.helpers())) { grid.position.set(0, staged.ground + 1, 0); helpers.push(grid); if (node) { box.setFromObject(node); helpers.push(box); if (view !== 'ghost') helpers.push(gizmo.getHelper()); } }
    if (!film && !shooting) for (const x of extras) x.overlay?.(helpers, B);
    for (const x of helpers) B.scene.add(x);
    // the frame: as filmed (in the film view, or with a mode such as path tracing), else lit plainly and fast
    const fw = film ? Math.round(Math.min(W, H * S.w / S.h)) : W, fh = film ? Math.round(fw * S.h / S.w) : H;
    if (R.domElement.width !== fw || R.domElement.height !== fh) R.setSize(fw, fh, false);
    const special = extras.find(x => x.render?.(L, o, time, B, camera, fw, fh, film));
    if (!special) { if (film) World.shoot(B, camera, o, time, fw, fh); else R.render(B.scene, camera); }
    for (const x of helpers) B.scene.remove(x);
    g2.fillStyle = '#0d0e11'; g2.fillRect(0, 0, W, H);
    g2.drawImage(R.domElement, (W - fw) / 2, (H - fh) / 2, fw, fh);
  }
  // a screenshot: the view drawn again without the grid, box and handles, at the viewport's full pixel size
  // (the film view keeps only its frame, without the bars round it)
  let shooting = false;
  function shoot() {
    if (!L) return;
    const vp = wrap.querySelector('.vp'), pr = Math.min(2, devicePixelRatio || 1);
    shooting = true; try { draw(vp.clientWidth, vp.clientHeight, pr); } finally { shooting = false; }
    const R = World.renderer, fw = R.domElement.width, fh = R.domElement.height;
    const oc = document.createElement('canvas'); oc.width = fw; oc.height = fh;
    oc.getContext('2d').drawImage(canvas, (canvas.width - fw) / 2, (canvas.height - fh) / 2, fw, fh, 0, 0, fw, fh);
    dirty = true;   // put the grid and handles back
    const name = `${(typeof projectName !== 'undefined' && projectName) || 'Untitled'} - ${L.name} ${time.toFixed(2)}s.png`;
    oc.toBlob(blob => { if (!blob) return status('Could not make the screenshot');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
      status(`Saved ${name} · ${fw}×${fh}`); }, 'image/png');
  }
  function findNode(id) { if (isLay(id)) return B?.members?.find(n => n.userData.layerId === id.slice(2)) || null;
    let hit = null; B?.props?.traverse(n => { if (!hit && n.userData.partId === id && !n.isMesh) hit = n; }); return hit; }
  // snapping: what was moved comes down (or up) onto the highest surface under it, else the ground; lights stay where they are
  function drop() {
    const n = gizmo.object; if (!n || !B || sel()?.type === 'light') return;
    n.updateMatrixWorld(true);
    const b3 = new T.Box3().setFromObject(n); if (b3.isEmpty()) return;
    const mine = new Set(); n.traverse(x => mine.add(x));
    const others = [...(B.props ? [B.props] : []), ...(B.members || [])], ray = new T.Raycaster(), c = b3.getCenter(new T.Vector3()), sz = b3.getSize(new T.Vector3());
    let top = gnd;
    // the middle and four points in from the corners, cast down from halfway up it
    for (const [fx, fz] of [[0, 0], [-.35, -.35], [.35, -.35], [-.35, .35], [.35, .35]]) {
      ray.set(new T.Vector3(c.x + fx * sz.x, b3.min.y + sz.y / 2, c.z + fz * sz.z), new T.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(others, true).find(h => !mine.has(h.object) && h.object.visible);
      if (hit && hit.point.y > top) top = hit.point.y;
    }
    n.position.y += top - b3.min.y; n.updateMatrixWorld(true);
  }
  function pick(e) {
    if (!B || view !== 'free') return;
    const r = canvas.getBoundingClientRect(), ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), cam);
    const hits = ray.intersectObjects([B.props, ...(B.members || [])], true);
    let id = null;
    for (const h of hits) { let n = h.object; while (n && !n.userData.partId && !n.userData.layerId) n = n.parent;
      if (n) { id = n.userData.layerId ? 'L:' + n.userData.layerId : n.userData.partId; break; } }
    // Alt picks the group a part is in
    if (id && e.altKey) { const f = World.findPart(objs(), id); if (f?.parent) id = f.parent.id; }
    select(id);
  }
  function select(id) { selId = id; if (!id) gizmo.detach(); renderTree(); renderInsp(); dirty = true; }

  // ----- what the gizmo moved, into the prop: its value, or its key at the playhead -----
  function setVal(P, prop, v) {
    const ks = P.keys?.[prop];
    if (Array.isArray(ks) && ks.length) { const t = Math.round(wt() * 1000) / 1000, k = ks.find(k => Math.abs(k.t - t) < .005);
      if (k) k.v = v; else { ks.push({ t, v, ease: 'easeInOut' }); ks.sort((a, b) => a.t - b.t); } }
    else P[prop] = v;
  }
  // a 3D layer's own place, turn and scale (in the editor's pixels and degrees), keyed at the playhead if it is keyed
  function layerVals(n) {
    const e = new T.Euler().setFromQuaternion(n.quaternion, 'XYZ');
    return { x: r3(n.position.x + S.w / 2), y: r3(S.h / 2 - n.position.y), z: r3(-n.position.z),
      rotX: r3(-rad(e.x)), rotY: r3(rad(e.y)), rotation: r3(-rad(e.z)), scale: r3(n.scale.z) };
  }
  function setLayer(Y, vals) {
    for (const [k, v] of Object.entries(vals)) { if (fixed(Y, k)) continue;
      if (Y.keys[k]?.length) setKey(Y, k, time, v, 'easeInOut'); else Y.p[k] = v; }
  }
  function writeBack() {
    const Y = selLayer(); if (Y) { if (gizmo.object) setLayer(Y, layerVals(gizmo.object)); return; }
    const P = sel(), n = gizmo.object; if (!P || !n) return;
    // the gizmo on something else (points of a mesh being edited) moves only that
    if (n.userData.partId !== P.id) return;
    setVal(P, 'at', [r3(n.position.x / M), r3(n.position.y / M), r3(n.position.z / M)]);
    const e = new T.Euler().setFromQuaternion(n.quaternion, 'YXZ');
    setVal(P, 'turn', [r3(rad(e.x)), r3(rad(e.y)), r3(rad(e.z))]);
    const s = [r3(n.scale.x), r3(n.scale.y), r3(n.scale.z)];
    setVal(P, 'scale', s.every(v => v === s[0]) ? s[0] : s);
  }

  // ----- the outliner -----
  function renderTree() {
    const rows = [];
    const walk = (list, depth) => { for (const P of list || []) { rows.push(`<div class="row${P.id === selId ? ' on' : ''}${P.hidden ? ' off' : ''}" data-id="${P.id}" style="padding-left:${10 + depth * 14}px">
      <span class="ty">${P.type === 'light' ? '☀' : P.type === 'group' ? '▾' : '◆'}</span><span class="n">${esc(nameOf(P))}</span>${P.keys && Object.values(P.keys).some(k => k?.length) ? '<i class="kd" title="Keyframed"></i>' : ''}
      <button class="eye" data-eye="${P.id}" title="${P.hidden ? 'Show' : 'Hide'}  H">${P.hidden ? '○' : '●'}</button></div>`); walk(P.children, depth + 1); } };
    walk(objs(), 0);
    const lays = layers3d();
    if (lays.length) { rows.push('<div class="hd">3D layers</div>');
      for (const Y of lays) rows.push(`<div class="row${'L:' + Y.id === selId ? ' on' : ''}${Y.hidden ? ' off' : ''}" data-id="L:${Y.id}" style="padding-left:10px" title="A layer of its own: its shape and look are in its Design panel">
        <span class="ty">${Y.type === 'model' ? '▣' : '◇'}</span><span class="n">${esc(Y.name)}</span>${Object.values(Y.keys || {}).some(k => k?.length) ? '<i class="kd" title="Keyframed"></i>' : ''}</div>`); }
    wrap.querySelector('.tree').innerHTML = rows.join('') || '<div class="empty">No props yet. Add one from + Add.</div>';
  }

  // ----- the inspector: the picked prop, or the world -----
  const num = (k, v, step = .01, label = k) => `<label class="f"><span>${label}</span><input data-k="${k}" type="number" step="${step}" value="${v ?? ''}"></label>`;
  const vec = (k, v, label, step) => { const has = sel()?.keys?.[k]?.length, here = sel()?.keys?.[k]?.some(x => Math.abs(x.t - wt()) < .005);
    return `<div class="vec"><div class="vh"><span>${label}</span><button class="key${has ? ' has' : ''}${here ? ' here' : ''}" data-key="${k}" title="${here ? 'Remove the key here' : 'Key it at the playhead'}">◆</button></div>
      <div class="v3">${[0, 1, 2].map(i => `<input data-k="${k}" data-i="${i}" type="number" step="${step}" value="${r3(v[i] ?? 0)}">`).join('')}</div></div>`; };
  function cur(P, prop, base) { const ks = P.keys?.[prop]; if (!ks?.length) return base;
    const n = gizmo.object; if (n && sel() === P) { if (prop === 'at') return [n.position.x / M, n.position.y / M, n.position.z / M];
      if (prop === 'turn') { const e = new T.Euler().setFromQuaternion(n.quaternion, 'YXZ'); return [rad(e.x), rad(e.y), rad(e.z)]; }
      if (prop === 'scale') return [n.scale.x, n.scale.y, n.scale.z]; }
    return base; }
  // a 3D layer, in metres from the world's centre and its ground like the props; it is turned and scaled in the editor's own terms
  function layerInsp(el, Y, valuesOnly) {
    const n = findNode('L:' + Y.id), o = state(Y, time);
    const at = n ? [n.position.x / M, (n.position.y - gnd) / M, n.position.z / M] : [(o.x - S.w / 2) / M, (S.h / 2 - o.y - gnd) / M, -(+o.z || 0) / M];
    const turn = [+o.rotX || 0, +o.rotY || 0, +o.rotation || 0], v = n ? layerVals(n) : null;
    if (v) { turn[0] = v.rotX; turn[1] = v.rotY; turn[2] = v.rotation; }
    const sc = v ? v.scale : +o.scale || 1;
    if (valuesOnly && el.dataset.for === 'L:' + Y.id) { for (const i of el.querySelectorAll('input[data-k][data-i]')) if (document.activeElement !== i)
      i.value = r3(i.dataset.k === 'at' ? at[+i.dataset.i] : i.dataset.k === 'turn' ? turn[+i.dataset.i] : sc); return; }
    el.dataset.for = 'L:' + Y.id;
    const nokey = s => s.replace(/<button class="key[^>]*>◆<\/button>/, '');
    el.innerHTML = `<div class="hd">${esc(Y.name)}</div>` + nokey(vec('at', at, 'Position m', .01)) + nokey(vec('turn', turn, 'Turn ° (X, Y, Z)', 1))
      + num('scale', r3(sc), .01, 'Scale') + `<p class="note">A ${Y.type === 'model' ? 'model' : '3D shape'} layer in this world. Its shape, size, look and keyframes are in its Design panel.</p>`;
  }
  function onLayerInsp(Y, i) {
    const k = i.dataset.k, v = +i.value; if (!isFinite(v)) return;
    const vals = {};
    if (k === 'scale') vals.scale = v;
    else if (k === 'at') { const j = +i.dataset.i; if (j === 0) vals.x = r3(v * M + S.w / 2); else if (j === 1) vals.y = r3(S.h / 2 - (v * M + gnd)); else vals.z = r3(-v * M); }
    else if (k === 'turn') vals[['rotX', 'rotY', 'rotation'][+i.dataset.i]] = v;
    else return;
    setLayer(Y, vals); dirty = true; refresh();
  }
  function renderInsp(valuesOnly = false) {
    const el = wrap.querySelector('.insp'), P = sel(), Y = selLayer();
    if (Y) return layerInsp(el, Y, valuesOnly);
    if (valuesOnly && P && el.dataset.for === P.id) { for (const i of el.querySelectorAll('input[data-k][data-i]')) if (document.activeElement !== i) {
      const k = i.dataset.k, v = k === 'at' ? cur(P, 'at', P.at || [0, 0, 0]) : k === 'turn' ? cur(P, 'turn', P.turn || [0, 0, 0]) : k === 'scale' ? cur(P, 'scale', [].concat(P.scale ?? 1)) : null;
      if (v) i.value = r3(k === 'scale' && v.length === 1 ? v[0] : v[+i.dataset.i]); } return; }
    el.dataset.for = P?.id || '';
    if (!P) { el.innerHTML = `<div class="hd">World</div><p class="note">Pick a prop in the viewport or the outliner to move, turn and change it. The world's sky, ground, air and lens are in its layer's Design panel.</p>
      <div class="acts"><button class="tb small" data-act="add">+ Add a prop</button></div>` + extras.map(x => x.worldInspector?.(L) || '').join(''); return; }
    const at = cur(P, 'at', P.at || [0, 0, 0]), turn = cur(P, 'turn', P.turn || [0, 0, 0]), sc = [].concat(cur(P, 'scale', P.scale ?? 1)), s3 = sc.length === 1 ? [sc[0], sc[0], sc[0]] : sc;
    const size = P.size || [1, 1, 1], t = P.type || 'group';
    let h = `<div class="hd">${esc(nameOf(P))}</div><label class="f wide"><span>Name</span><input data-k="name" value="${esc(P.name || '')}" placeholder="${esc(nameOf(P))}"></label>`;
    h += vec('at', at, 'Position m', .01) + vec('turn', turn, 'Turn °', 1) + vec('scale', s3, 'Scale', .01);
    if (!['group', 'light', 'model', 'mesh', 'camera', 'car', 'person', 'fx'].includes(t)) {
      const lab = t === 'cylinder' || t === 'cone' ? ['Diameter', 'Height', ''] : t === 'torus' ? ['Ring', '', 'Tube'] : t === 'label' ? ['Width', 'Height', ''] : t === 'capsule' ? ['Diameter', 'Length', ''] : ['Width', 'Height', 'Depth'];
      h += `<div class="vec"><div class="vh"><span>Size m</span></div><div class="v3">${[0, 1, 2].map(i => lab[i] ? `<input data-k="size" data-i="${i}" type="number" step=".01" title="${lab[i]}" value="${r3(+size[i] || 1)}">` : '<span></span>').join('')}</div></div>`;
    }
    if (t === 'box') h += num('round', P.round || 0, .005, 'Corners m');
    if (t === 'truss') h += num('bays', P.bays || 8, 1, 'Bays') + num('rod', P.rod || .02, .002, 'Rod m') + num('taper', P.taper || 0, .05, 'Taper');
    if (t === 'label') h += `<label class="f wide"><span>Text</span><textarea data-k="text" rows="3">${esc(P.text || '')}</textarea></label>
      <label class="f"><span>Ink</span><input data-k="color" type="color" value="${P.color || '#f2f2f2'}"></label><label class="f"><span>Back</span><input data-k="background" type="color" value="${P.background || '#050505'}"></label>`;
    if (t === 'light') h += `<label class="f"><span>Kind</span><select data-k="light"><option value="point"${P.light !== 'spot' ? ' selected' : ''}>Point</option><option value="spot"${P.light === 'spot' ? ' selected' : ''}>Spot</option></select></label>
      <label class="f"><span>Colour</span><input data-k="color" type="color" value="${P.color || '#ffffff'}"></label>${num('power', P.power ?? 100, 5, 'Power')}${P.light === 'spot' ? num('angle', P.angle ?? 35, 1, 'Cone °') + num('soft', P.soft ?? 40, 5, 'Soft %') : ''}`;
    if (!['group', 'light', 'label', 'model', 'camera', 'person', 'fx'].includes(t)) {
      const fins = [...World.FINISHES, ...(World.extraFinishes?.() || [])];
      h += `<label class="f wide"><span>Finish</span><select data-k="finish">${fins.map(f => `<option value="${esc(f)}"${(P.finish || 'plastic') === f ? ' selected' : ''}>${esc(World.finishName?.(f) || f)}</option>`).join('')}</select></label>
        <label class="f"><span>Colour</span><input data-k="color" type="color" value="${P.color || '#' + World.lin(World.FINISH_LOOKS[P.finish || 'plastic']?.color || '#cccccc').getHexString(T.SRGBColorSpace)}"></label>${num('glow', P.glow || 0, .1, 'Glow')}`;
    }
    h += vec('spin', P.spin || [0, 0, 0], 'Spin °/s', 1).replace(/<button class="key[^>]*>◆<\/button>/, '') + num('bob', P.bob || 0, .01, 'Bob m');
    h += `<div class="acts"><button class="tb small" data-act="dup" title="Ctrl D">Duplicate</button><button class="tb small" data-act="wrap">Group it</button>
      ${t === 'group' && P.children?.length ? '<button class="tb small" data-act="ungroup">Ungroup</button>' : ''}<button class="tb small" data-act="del" title="Delete">Delete</button></div>`;
    for (const x of extras) h += x.inspector?.(P) || '';
    el.innerHTML = h;
  }
  function onInsp(e, record = true) {
    const i = e.target, k = i.dataset.k, Y = selLayer(); if (Y && k) { if (record) onLayerInsp(Y, i); return; }
    const P = sel(); if (!k || !P) return;
    let v = i.type === 'number' ? +i.value : i.value;
    if (i.dataset.i != null) { const idx = +i.dataset.i;
      const base = k === 'at' ? cur(P, 'at', P.at || [0, 0, 0]) : k === 'turn' ? cur(P, 'turn', P.turn || [0, 0, 0]) : k === 'scale' ? [].concat(cur(P, 'scale', P.scale ?? 1)) : (P[k] || [0, 0, 0]);
      const arr = (base.length === 1 ? [base[0], base[0], base[0]] : [...base]).map(Number); arr[idx] = v; v = arr; }
    if (['at', 'turn', 'scale'].includes(k)) setVal(P, k, k === 'scale' && v.every(x => x === v[0]) ? v[0] : v);
    else if (k === 'name') { if (v) P.name = v; else delete P.name; renderTree(); }
    else P[k] = v;
    if (k === 'light') renderInsp();
    dirty = true; if (record) refresh();
  }

  // ----- actions -----
  const clone = P => { const c = structuredClone(P); const re = n => { n.id = null; (n.children || []).forEach(re); }; re(c); return c; };
  function add(kind) {
    const spec = ADD.find(a => a[0] === kind); if (!spec) return;
    const P = { type: spec[2].type || kind, ...structuredClone(spec[2]) };
    // in front of where the view looks, standing on the ground
    const tgt = orbit.target, up = P.type === 'light' ? 2.5 : P.turn && P.type === 'truss' ? .5 : (P.size?.[1] || .5) / 2;
    P.at = [r3(tgt.x / M), r3(up), r3(tgt.z / M)];
    const host = sel()?.type === 'group' ? (sel().children ||= []) : objs();
    host.push(P); World.ensureIds(objs()); selId = P.id; renderTree(); renderInsp(); dirty = true; refresh();
  }
  function act(a, btn) {
    const f = found();
    if (a === 'add') return UI.menu(btn, ADD.map(([value, label]) => ({ value, label })), null, add);
    if (a === 'done') return close();
    if (a === 'shot') return shoot();
    if (a === 'play') return playing ? stopPlay() : startPlay();
    if (a === 'snap') { snap = !snap; btn?.classList.toggle('on', snap); return; }
    if (a === 'speedlock') { ghost.speedLock = !ghost.speedLock; btn?.classList.toggle('on', ghost.speedLock);
      try { localStorage.setItem(SPEED_LOCK_KEY, ghost.speedLock ? '1' : '0'); } catch { /* private mode: it lasts this session */ }
      return; }
    if (!f) return;
    if (a === 'dup') { const c = clone(f.P); if (Array.isArray(c.at)) c.at = [c.at[0] + .3, c.at[1], c.at[2]]; f.list.splice(f.list.indexOf(f.P) + 1, 0, c); World.ensureIds(objs()); selId = c.id; }
    if (a === 'del') { f.list.splice(f.list.indexOf(f.P), 1); selId = null; gizmo.detach(); }
    if (a === 'wrap') { const g = { type: 'group', name: 'Group', at: f.P.at || [0, 0, 0], children: [f.P] }; f.P.at = [0, 0, 0]; f.list.splice(f.list.indexOf(f.P), 1, g); World.ensureIds(objs()); selId = g.id; }
    if (a === 'ungroup') { const at = f.P.at || [0, 0, 0]; const kids = f.P.children.map(c => ({ ...c, at: (c.at || [0, 0, 0]).map((v, i) => +v + (+at[i] || 0)) }));
      f.list.splice(f.list.indexOf(f.P), 1, ...kids); selId = kids[0]?.id || null; }
    renderTree(); renderInsp(); dirty = true; refresh();
  }
  function onClick(e) {
    const b = e.target.closest('button, .row'); if (!b || !wrap.contains(b)) return;
    if (b.dataset.tool) { gizmo.setMode(b.dataset.tool); tools(); return; }
    if (b.dataset.view) { setView(b.dataset.view); return; }
    if (b.dataset.eye) { const f = World.findPart(objs(), b.dataset.eye); if (f) { f.P.hidden = !f.P.hidden; if (!f.P.hidden) delete f.P.hidden; renderTree(); dirty = true; refresh(); } return; }
    if (b.dataset.key) { const P = sel(); if (!P) return; const k = b.dataset.key, t = Math.round(wt() * 1000) / 1000;
      P.keys ||= {}; const ks = (P.keys[k] ||= []), at = ks.findIndex(x => Math.abs(x.t - t) < .005);
      const now = cur(P, k, k === 'scale' ? [].concat(P.scale ?? 1) : P[k] || [0, 0, 0]);
      const v = !Array.isArray(now) ? r3(+now) : k === 'scale' && (now.length === 1 || now.every(x => r3(x) === r3(now[0]))) ? r3(now[0]) : now.map(r3);
      if (at >= 0) ks.splice(at, 1); else { ks.push({ t, v, ease: 'easeInOut' }); ks.sort((a, b) => a.t - b.t); }
      if (!ks.length) delete P.keys[k];
      renderTree(); renderInsp(); dirty = true; refresh(); return; }
    if (b.dataset.act) { act(b.dataset.act, b); return; }
    if (b.dataset.id) select(b.dataset.id);
    const x = extras.find(x => x.click?.(b)); if (x) dirty = true;
  }
  function tools() { for (const b of wrap.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === gizmo.mode);
    for (const b of wrap.querySelectorAll('[data-view]')) b.classList.toggle('on', b.dataset.view === view); }
  function onKey(e) {
    if (!wrap || wrap.hidden) return;
    if (e.target.closest?.('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (extras.some(x => x.key?.(e))) { e.preventDefault(); e.stopPropagation(); return; }
    const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey; let used = true;
    if (view === 'ghost' && !mod && /^(Key[WASDQE]|Shift(Left|Right))$/.test(e.code)) { ghost.keys.add(e.code); e.preventDefault(); e.stopPropagation(); return; }
    if (k === 'escape' && view === 'ghost') setView('free');
    else if (k === 'v' && !mod) setView(view === 'ghost' ? 'free' : 'ghost');
    else if (k === 'escape') { if (selId) select(null); else close(); }
    else if ((k === 'g' || k === 'w') && !mod) gizmo.setMode('translate');
    else if ((k === 'r' || k === 'e') && !mod) gizmo.setMode('rotate');
    else if (k === 's' && !mod) gizmo.setMode('scale');
    else if (mod && k === 'd') act('dup');
    else if (k === 'delete' || k === 'backspace' || k === 'x' && !mod) act('del');
    else if (k === 'h' && !mod && sel()) { const P = sel(); P.hidden = !P.hidden; if (!P.hidden) delete P.hidden; renderTree(); dirty = true; refresh(); }
    else if (k === 'f' && selId) { const n = findNode(selId); if (n) { const b3 = new T.Box3().setFromObject(n), c = b3.getCenter(new T.Vector3()), r = Math.max(30, b3.getSize(new T.Vector3()).length());
      cam.position.sub(orbit.target).setLength(r * 1.6).add(c); orbit.target.copy(c); orbit.update(); dirty = true; } }
    else if (k === ' ') playing ? stopPlay() : startPlay();
    else if (mod && k === 'z') { undoRedo(e.shiftKey ? 1 : -1); L = S.layers.find(x => x.id === L.id) || L; renderTree(); renderInsp(); dirty = true; }
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); tools(); }
    else e.stopPropagation();
  }
  function footer() { const s = wrap.querySelector('.scrub'); s.max = S.dur; s.value = time; wrap.querySelector('.tm').textContent = `${time.toFixed(2)}s / ${S.dur.toFixed(2)}s`;
    wrap.querySelector('[data-act="play"]').textContent = playing ? 'Pause' : 'Play'; }
  function startPlay() { playing = true; lastT = performance.now(); footer(); }
  function stopPlay() { playing = false; if (wrap) footer(); render(); }

  return { open, close, get layer() { return L; }, get open_() { return !!L; }, redraw() { dirty = true; }, extras, refreshUI() { if (L) { renderTree(); renderInsp(); dirty = true; } },
    select, get selected() { return sel(); }, get selectedId() { return selId; },
    // for tools that work in the viewport
    get api() { return { cam: view === 'film' ? null : cam, canvas, gizmo, orbit, B, findNode, view }; },
    setView: v => setView(v), add: (kind, spec, label) => { if (spec) ADD.push([kind, label || kind, spec]); }, get time() { return wt(); },
    record() { refresh(); renderTree(); renderInsp(); dirty = true; },
    // where a new prop goes: on the ground, where the view looks
    spot() { const t = orbit?.target; return t ? [r3(t.x / M), 0, r3(t.z / M)] : [0, 0, 0]; } };
})();
