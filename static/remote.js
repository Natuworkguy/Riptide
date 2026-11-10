// ---------- 3D drawn by Riptide's server ----------
// A 3D world is the heaviest thing Riptide draws: its sky, water, shadows, lens and path tracer all run on the
// graphics card, and a big scene can use up what the browser lets one tab have and take the editor down with it.
// So, when Riptide's server can, worlds are drawn there instead, by a browser of its own with no window (see
// render_host.py): this tab sends it the project and shows the pictures it sends back, for the canvas, the scene
// editor's view and every frame of an export. The scene editor still builds the scene here, without drawing it, to
// know what a click lands on; only its handles are drawn here. If the server's browser falls over, the server starts
// another; if the server cannot draw at all, this tab draws as it always did.
//
// The same page, opened by the server with ?renderhost=1, is the other side: window.RenderHost takes the project and
// answers each request with a picture.
const Remote = (() => {
  const T = window.RiptideThree, here = new URLSearchParams(location.search), host = here.get('renderhost') === '1';
  const KEY = 'riptide.remote3d';
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = v => { try { localStorage.setItem(KEY, v); } catch { /* the choice lasts this visit only */ } };
  const local = { draw: World.draw, prepareFrame: World.prepareFrame };
  let pref = read();                  // 'off' keeps worlds in this tab; anything else draws them on the server when it can
  let server = null;                  // what /api/render/status said; null until it answers (drawn there meanwhile)
  let down = '';                      // why the server is not drawing right now, if it is not
  let fails = 0;

  const R = {
    host,
    get on() { return !host && pref !== 'off' && server?.available !== false && !down; },
    get why() { return down || server?.why || ''; },
    get step() { return server?.setting_up ? server.step : ''; },
    get available() { return !!server?.available; },
    received: 0,          // pictures the server has sent
    set(on) { pref = on ? 'on' : 'off'; write(pref); down = ''; fails = 0; World.version++; redraw();
      status(on ? '3D worlds are drawn by Riptide\'s server' : '3D worlds are drawn in this tab'); },
  };
  const redraw = () => { if (typeof render === 'function') render(); SceneEd.redraw?.(); };

  // what the server says it can do; asked again while it sets itself up (installing Playwright, finding a browser)
  function ask() {
    fetch('/api/render/status').then(r => r.ok ? r.json() : { available: false, why: 'This Riptide server cannot draw 3D' })
      .catch(() => ({ available: false, why: 'Riptide\'s server is not answering' }))
      .then(s => {
        const was = server; server = s;
        if (s.setting_up) setTimeout(ask, 3000);
        else if (was?.setting_up && s.available) status('Riptide\'s server can draw 3D now');
        if (!s.available && pref !== 'off' && S.layers.some(L => L.type === 'world')) status(`3D worlds are drawn in this tab: ${s.why}`);
        redraw();
      });
  }
  if (!host) ask();

  // ----- the project, sent when it changes; its imported files sent once each -----
  const sent = new Map();     // asset id -> what was sent of it
  let lastProject = '', rev = 0;
  const sigOf = a => [a.kind || 'image', a.name, a.src?.length || 0, ...Object.entries(a.maps || {}).map(([k, v]) => k + v.length)].join('|');
  async function sync() {
    const assets = {};
    for (const [id, a] of Object.entries(S.assets || {})) {
      if (a.kind === 'video') continue;
      const sig = sigOf(a); assets[id] = { kind: a.kind, name: a.name, w: a.w, h: a.h, format: a.format, sig };
      if ((a.src || a.maps) && sent.get(id) !== sig) {
        const r = await fetch('/api/render/asset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, asset: { ...a, sig } }) });
        if (!r.ok) throw new Error('the server would not take ' + (a.name || 'a file'));
        sent.set(id, sig);
      }
    }
    const p = JSON.stringify({ ...S, assets });
    if (p === lastProject) return null;
    lastProject = p; rev++; return p;
  }
  async function ask(frame) {
    const p = await sync();
    const body = `{"rev":${rev},"frame":${JSON.stringify(frame)}${p ? `,"project":${p}` : ''}}`;
    const r = await fetch('/api/render/frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const out = await r.json().catch(() => ({ error: `the server answered ${r.status}` }));
    if (!r.ok || out.error) { if (p) lastProject = ''; throw new Error(out.error || `the server answered ${r.status}`); }
    if (out.skipped) return out;
    const img = new Image(); img.src = out.image; await img.decode();
    return { img, done: out.done !== false, ms: out.ms };
  }
  function failed(e) {
    if (++fails < 3) return;
    down = e.message; World.version++;
    status(`3D worlds are drawn in this tab for now: ${down}`); redraw();
    // try the server again in a while
    setTimeout(() => { down = ''; fails = 0; redraw(); }, 30000);
  }

  // ----- views: each shows the newest picture it has while the next is drawn -----
  const views = new Map();
  function view(id, frame, after) {
    let v = views.get(id); if (!v) { v = { img: null, key: '', done: true, busy: false, want: null }; views.set(id, v); }
    v.want = frame; v.after = after;
    if (!v.busy) pump(v);
    return v;
  }
  async function pump(v) {
    const frame = v.want; if (!frame) return;
    const key = JSON.stringify(frame);
    // the same picture again only while it is still clearing up (path traced), or if the project changed
    if (key === v.key && v.done && JSON.stringify({ ...S, assets: undefined }) === v.project) return;
    v.busy = true;
    try {
      const out = await ask({ ...frame, view_id: v.id || (v.id = 'v' + Math.random().toString(36).slice(2, 8)) });
      if (!out.skipped) { R.received++; v.img = out.img; v.done = out.done; v.key = key; v.project = JSON.stringify({ ...S, assets: undefined }); fails = 0; v.after?.(); }
    } catch (e) { failed(e); v.want = null; }
    v.busy = false;
    if (R.on && v.want) setTimeout(() => pump(v), 0);
  }

  // ----- the canvas -----
  const finals = new Map();   // layer id -> a finished frame, for an export
  const plainKey = (L, o, t) => `${L.id}|${t}|${JSON.stringify(o)}`;
  World.draw = (c, L, o, t) => {
    if (!R.on) return local.draw(c, L, o, t);
    const k = c.getTransform().a || 1, W = Math.max(1, Math.min(8192, Math.round(S.w * k))), H = Math.max(1, Math.min(8192, Math.round(S.h * k)));
    const fin = finals.get(L.id);
    if (fin && fin.key === plainKey(L, o, t)) { c.drawImage(fin.img, 0, 0, S.w, S.h); return true; }
    const v = view('layer:' + L.id, { kind: 'layer', layer: L.id, t, w: W, h: H }, () => typeof render === 'function' && render());
    if (v.img) c.drawImage(v.img, 0, 0, S.w, S.h);
    else { c.save(); c.fillStyle = '#14161c'; c.fillRect(0, 0, S.w, S.h); c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `${Math.round(S.h / 30)}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(R.step ? `${R.step}…` : 'Drawing on Riptide\'s server…', S.w / 2, S.h / 2); c.restore(); }
    return true;
  };
  // an export's frames: each drawn whole on the server (path traced, motion blurred) before it is used
  World.prepareFrame = async t => {
    if (!R.on) return local.prepareFrame(t);
    const k = typeof exportFrame === 'function' && typeof exportOpts !== 'undefined' ? exportFrame(exportOpts).k || 1 : 1;
    const fps = (typeof exportOpts !== 'undefined' && +exportOpts.fps) || 30;
    for (const L of S.layers) {
      if (L.type !== 'world' || L.hidden || !visibleAt(L, t)) continue;
      const o = state(L, t), W = Math.max(1, Math.min(8192, Math.round(S.w * k))), H = Math.max(1, Math.min(8192, Math.round(S.h * k)));
      try { const out = await ask({ kind: 'layer', layer: L.id, t, w: W, h: H, final: true, fps }); finals.set(L.id, { key: plainKey(L, o, t), img: out.img }); }
      catch (e) { down = e.message; status(`3D worlds are drawn in this tab for now: ${down}`); return local.prepareFrame(t); }
    }
  };

  // ----- the scene editor: its picture from the server, its handles drawn here -----
  // camera: where the editor's camera stands; mode: 'free' (lit plainly), 'film' (as filmed) or 'path' (path traced)
  R.sceneView = (spec, after) => view('scene', { kind: 'view', ...spec }, after);
  R.sceneShot = spec => ask({ kind: 'view', ...spec });
  let ov = null;
  R.overlay = () => { if (ov) return ov;
    try { ov = new T.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false }); ov.setClearColor(0, 0); } catch { ov = null; }
    return ov; };

  if (!host) return R;

  // ===== the server's side: this page, in the server's own browser =====
  const store = {};           // imported files, by id
  let grid = null, box = null;
  const nodeFor = (B, id) => { if (!id) return null; if (String(id).startsWith('L:')) return B.members?.find(n => n.userData.layerId === id.slice(2)) || null;
    let hit = null; B.props?.traverse(n => { if (!hit && n.userData.partId === id && !n.isMesh) hit = n; }); return hit; };
  // what loads after a frame is asked for (a model, a sky photo, a texture) is waited for, a while
  const settle = async draw => {
    for (let i = 0; i < 40; i++) {
      const v = World.version; await draw();
      await new Promise(r => setTimeout(r, i ? 120 : 30));
      if (World.version === v && !(World.pending > 0)) return true;
    }
    return false;
  };
  const picture = (cv, final) => cv.toDataURL(final ? 'image/png' : 'image/jpeg', .9);
  window.RenderHost = {
    asset(id, a) { store[id] = a; },
    project(p) {
      for (const [id, a] of Object.entries(p.assets || {})) if (store[id]?.sig === a.sig) p.assets[id] = store[id];
      Fonts?.adopt?.(p.fonts);
      S = { dur: 5, bg: '#0b1026', ...p };
      World.version++;
    },
    async frame(f) {
      const t0 = performance.now();
      try {
        const L = S.layers.find(x => String(x.id) === String(f.layer));
        if (!L || L.type !== 'world') return { error: 'there is no 3D world with that id' };
        if (!World.gl()) return { error: 'the server\'s browser has no WebGL' };
        const W = Math.max(1, Math.min(8192, Math.round(+f.w || S.w))), H = Math.max(1, Math.min(8192, Math.round(+f.h || S.h)));
        if (f.kind === 'view') return await sceneFrame(L, f, W, H, t0);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
        if (f.fps && typeof exportOpts !== 'undefined') exportOpts = { ...exportOpts, fps: +f.fps };
        const t = +f.t || 0;
        await R3D.ready?.();
        const done = await settle(async () => {
          if (f.final) await local.prepareFrame(t);
          c.setTransform(W / S.w, 0, 0, H / S.h, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, S.w, S.h);
          local.draw(c, L, state(L, t), t);
        });
        return { image: picture(cv, f.final), done, ms: Math.round(performance.now() - t0) };
      } catch (e) { return { error: e.message || String(e) }; }
    },
  };
  async function sceneFrame(L, f, W, H, t0) {
    const t = +f.t || 0, o = state(L, t), Rr = World.renderer;
    let st, cam, done = true;
    const once = () => {
      World.showGuides = !!f.guides; st = World.stage(L, o, t); World.showGuides = false;
      if (f.mode === 'film' || !f.camera) cam = st.cam;
      else { const c = f.camera; cam = new T.PerspectiveCamera(c.fov || 40, W / H, c.near || 5, c.far || 4e6);
        cam.position.fromArray(c.position); cam.quaternion.fromArray(c.quaternion); cam.userData = { ...st.cam.userData }; cam.updateMatrixWorld(); cam.updateProjectionMatrix(); }
    };
    const helpers = [];
    const show = () => {
      if (f.grid != null) { grid ||= Object.assign(new T.GridHelper(40 * World.M, 40, 0x6f7480, 0x3a3d45), {}); grid.material.transparent = true; grid.material.opacity = .45;
        grid.position.set(0, st.ground + 1, 0); helpers.push(grid); }
      const n = nodeFor(st.B, f.box); if (n) { box ||= new T.BoxHelper(new T.Object3D(), 0x5b98ff); box.setFromObject(n); helpers.push(box); }
      for (const x of helpers) st.B.scene.add(x);
    };
    const hide = () => { for (const x of helpers) st.B.scene.remove(x); helpers.length = 0; };
    if (Rr.domElement.width !== W || Rr.domElement.height !== H) Rr.setSize(W, H, false);
    if (f.mode === 'path' && PathTrace?.trace) {
      once();
      done = PathTrace.trace(L, o, t, st.B, cam, W, H, Math.max(1, Math.round(+o.samples || 128)), Math.max(30, Math.min(1500, +f.budget || 250)));
    } else {
      await settle(async () => { once(); show(); try { if (f.mode === 'film') World.shoot(st.B, cam, o, t, W, H); else Rr.render(st.B.scene, cam); } finally { hide(); } });
    }
    return { image: picture(Rr.domElement, f.final), done, ms: Math.round(performance.now() - t0) };
  }
  // ready once the editor's scripts have run
  setTimeout(() => { window.RenderHostReady = true; }, 0);
  return R;
})();
World.remote = Remote;
