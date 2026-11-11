// ---------- photoreal 3D, rendered natively ----------
// A world whose Render is "Photoreal" is not drawn in this tab, nor by a browser on the server: Riptide's server
// path traces it with Cycles, Blender's renderer, run as a native program (see native/ in the repository). It
// runs on the Mac's own graphics through Metal, or on a PC's card, or on the processor, and fits in a 16 GB
// laptop. This tab still works out what each frame is, without drawing anything: where the camera is and what it
// sees, the sun and sky, and the props and 3D layers (sent as a glTF). The server builds the land, forest, grass
// and sky itself, at full quality, and sends back the picture.
//
// While editing, a quick picture (fewer light samples, smaller) comes back for the frame shown, and the last one
// stays up while the next is made. An export waits for each frame at full quality.
const Native = (() => {
  const T = window.RiptideThree;
  if (!T || typeof World === 'undefined') return null;
  const prev = { draw: World.draw, prepareFrame: World.prepareFrame };
  const M = World.M;
  let server = null;                  // what /api/native/status said
  const views = new Map();            // layer id -> { key, img, busy, want, error }
  const finals = new Map();           // layer id -> { key, img }: frames finished for an export
  const keyOf = (L, o, t) => `${L.id}|${t}|${JSON.stringify(o)}|${World.version}`;
  const redraw = () => { if (typeof render === 'function') render(); };

  function askStatus(setup = false) {
    return fetch('/api/native/status' + (setup ? '?setup=1' : '')).then(r => r.json()).catch(() => ({ available: false, why: 'Riptide\'s server is not answering' }))
      .then(s => { const was = server; server = s;
        if (s.setting_up) setTimeout(() => askStatus().then(redraw), 3000);
        else if (was?.setting_up && s.available) { status('The native renderer is ready'); for (const v of views.values()) v.key = ''; redraw(); }
        return s; });
  }

  // ----- what a frame is, for the renderer -----
  async function describe(L, o, t, W, H, quality) {
    const { B, cam } = World.stage(L, o, t);
    const eye = +o.eye || 1.7, pos = cam.position.clone().divideScalar(M); pos.y += eye;
    const dir = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), up = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const world = {};
    for (const k of World.FIELDS) if (k !== 'objects' && k !== 'shots') world[k] = o[k];
    const job = { world, width: W, height: H, quality, t,
      camera: { pos: pos.toArray(), dir: dir.toArray(), up: up.toArray(), fov: cam.fov, aspect: W / H,
        focus: (cam.userData.focus || cam.userData.d || 1000) / M, dof: +(cam.userData.dof ?? o.dof) || 0 },
      props: { scale: 1 / M, lift: eye } };
    if (quality === 'final' && +o.samples > 0) job.samples = +o.samples;
    job.glb = await propsGlb(B);
    return job;
  }
  // the props and 3D layers as a glTF: what is only for the editor (camera guides, light beams drawn as cones,
  // dust drawn as points) is left out, as the renderer makes its own light and air
  async function propsGlb(B) {
    const roots = [B.props, ...(B.members || [])].filter(Boolean);
    if (!roots.length || !T.GLTFExporter) return null;
    const hidden = [];
    for (const r of roots) r.traverse(n => {
      if (n.visible && (n.userData.guide || n.userData.bulb || n.isPoints || n.material?.isShaderMaterial)) { n.visible = false; hidden.push(n); } });
    let count = 0; for (const r of roots) r.traverse(n => { if (n.isMesh && n.visible) count++; });
    try {
      if (!count) return null;
      const bin = await new T.GLTFExporter().parseAsync(roots, { binary: true, onlyVisible: true });
      return b64(new Uint8Array(bin));
    } finally { for (const n of hidden) n.visible = true; }
  }
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

  async function ask(job) {
    const r = await fetch('/api/native/frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) });
    const out = await r.json().catch(() => ({ error: `the server answered ${r.status}` }));
    if (!r.ok || out.error) throw new Error(out.error || `the server answered ${r.status}`);
    const img = new Image(); img.src = out.image; await img.decode();
    return { img, ms: out.ms, device: out.device };
  }

  // ----- the canvas: the last picture up while the next is made -----
  function view(L, o, t) {
    let v = views.get(L.id); if (!v) views.set(L.id, v = { key: '', img: null, busy: false, want: null, error: '' });
    const key = keyOf(L, o, t);
    if (v.key !== key && v.want?.key !== key) { v.want = { key, L, o: JSON.parse(JSON.stringify(o)), t }; clearTimeout(v.timer); v.timer = setTimeout(() => pump(v), 220); }
    return v;
  }
  async function pump(v) {
    if (v.busy || !v.want) return;
    if (!server) await askStatus();
    if (!server.available) { if (!server.setting_up) await askStatus(true); redraw(); return; }
    const w = v.want; v.want = null; v.busy = true;
    // a quick look while things change (small, few light samples), then, once they stop, a cleaner one
    const good = !!w.good, side = good ? 1280 : 640;
    const k = Math.min(1, side / Math.max(S.w, S.h)), W = Math.max(16, Math.round(S.w * k)), H = Math.max(16, Math.round(S.h * k));
    try {
      const out = await ask(await describe(w.L, w.o, w.t, W, H, good ? 'good' : 'draft'));
      v.img = out.img; v.key = w.key; v.good = good;
      v.error = ''; v.ms = out.ms;
    } catch (e) { v.error = e.message; v.key = w.key; }
    v.busy = false; redraw();
    if (v.want) pump(v);
    else if (!good && !v.error) { clearTimeout(v.timer); v.timer = setTimeout(() => { if (!v.want && !v.busy && v.key === w.key) { v.want = { ...w, good: true }; pump(v); } }, 700); }
  }
  function placeholder(c, text) {
    c.save(); c.fillStyle = '#14161c'; c.fillRect(0, 0, S.w, S.h); c.fillStyle = 'rgba(255,255,255,.6)';
    c.font = `${Math.round(S.h / 32)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    String(text).split('\n').forEach((line, i, all) => c.fillText(line, S.w / 2, S.h / 2 + (i - (all.length - 1) / 2) * S.h / 24));
    c.restore();
  }
  World.draw = (c, L, o, t) => {
    if (o.render !== 'native') return prev.draw(c, L, o, t);
    const fin = finals.get(L.id);
    if (fin && fin.key === keyOf(L, o, t)) { c.drawImage(fin.img, 0, 0, S.w, S.h); World.bars(c, o); return true; }
    const v = view(L, o, t);
    if (v.img) c.drawImage(v.img, 0, 0, S.w, S.h);
    else if (server && !server.available) placeholder(c, server.setting_up ? `${server.step || 'Setting up the native renderer'}…` : `Photoreal cannot render here: ${server.why}`);
    else placeholder(c, v.error ? `Photoreal: ${v.error}` : 'Tracing the light…');
    World.bars(c, o);
    return true;
  };
  // an export: every native world's frame rendered in full first; the rest as before
  World.prepareFrame = async t => {
    const k = typeof exportFrame === 'function' && typeof exportOpts !== 'undefined' ? exportFrame(exportOpts).k || 1 : 1;
    for (const L of S.layers) {
      if (L.type !== 'world' || L.hidden || !visibleAt(L, t)) continue;
      const o = state(L, t); if (o.render !== 'native') continue;
      if (!server?.available) await askStatus(true);
      // the first time: wait while the renderer installs (it says what it is doing), then go on
      for (let i = 0; !server?.available && server?.setting_up && i < 1200; i++) {
        status(`${server.step || 'Setting up the native renderer'}…`);
        await new Promise(r => setTimeout(r, 1500)); await askStatus();
      }
      if (!server?.available) throw new Error(`Photoreal cannot render here: ${server?.why || 'the native renderer is not ready'}`);
      const W = Math.max(16, Math.min(8192, Math.round(S.w * k))), H = Math.max(16, Math.min(8192, Math.round(S.h * k)));
      const out = await ask(await describe(L, o, t, W, H, 'final'));
      finals.set(L.id, { key: keyOf(L, o, t), img: out.img });
    }
    return prev.prepareFrame(t);
  };

  return { describe, ask, askStatus, get status() { return server; }, views, finals };
})();
