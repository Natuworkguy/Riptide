// ---------- 3D ----------
// Any layer can be made a 3D layer (turned on X and Y, pushed back in depth), solid shapes and imported models are
// layers of their own, and a camera layer looks at all of it. One WebGL renderer draws each 3D layer in turn, into
// the same 2D canvas as everything else, so layer order, blend modes, opacity and effects work as for any layer.
// World units are canvas pixels: with no camera, or one left where it starts, depth 0 lines up with the canvas
// exactly, so a 3D layer that is not turned looks just as it did flat.
const R3D = (() => {
  const T = window.RiptideThree;
  const SHAPES = [['cube', 'Cube'], ['sphere', 'Sphere'], ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['torus', 'Torus'], ['text', '3D text']];
  const MATERIALS = [['matte', 'Matte'], ['glossy', 'Glossy'], ['metal', 'Metal']];
  const LOOK = { matte: { roughness: .85, metalness: 0, env: .35, coat: 0 }, glossy: { roughness: .3, metalness: 0, env: .7, coat: 1 },
    metal: { roughness: .25, metalness: 1, env: 1.1, coat: 0 } };
  const FOV = 40;                                 // degrees, at zoom 1: about a 50 mm lens
  const CAMERA0 = { orbit: 0, tilt: 0, dolly: 0, zoom: 1, rotation: 0 };
  let renderer = null, canvas = null, env = null, failed = !T;
  const flat = document.createElement('canvas'), fctx = flat.getContext('2d');
  const geoms = new Map(), models = new Map(), loading = new Set();
  let font = null, fontLoad = null;
  const deg = v => (+v || 0) * Math.PI / 180;

  function gl() {
    if (renderer || failed) return renderer;
    try {
      canvas = document.createElement('canvas');
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      const pm = new T.PMREMGenerator(renderer);
      env = pm.fromScene(new T.RoomEnvironment(), .04).texture; pm.dispose();
    } catch (e) { failed = true; renderer = null; console.warn('3D is off: this browser has no WebGL.', e); }
    return renderer;
  }
  const ok = () => !!gl();

  // ----- which layers are 3D, and the camera -----
  const solid = L => L.type === 'shape3d' || L.type === 'model';
  const is3d = L => solid(L) || (!!L.p.three && L.type !== 'camera');
  const wants = L => is3d(L) && ok();
  function cameraLayer(t) {
    for (let i = S.layers.length - 1; i >= 0; i--) { const L = S.layers[i]; if (L.type === 'camera' && visibleAt(L, t)) return L; }
    return null;
  }
  function cameraState(t) {
    const C = cameraLayer(t);
    return C ? { ...CAMERA0, ...state(C, t) } : { ...CAMERA0, x: S.w / 2, y: S.h / 2 };
  }
  // the camera as it stands at T: one that has not moved sees depth 0 as the canvas, pixel for pixel
  function cameraAt(t) {
    const o = cameraState(t), half = deg(FOV / 2), d0 = (S.h / 2) / Math.tan(half), zoom = Math.max(.05, +o.zoom || 1);
    const cam = new T.PerspectiveCamera(2 * Math.atan(Math.tan(half) / zoom) * 180 / Math.PI, S.w / S.h, 1, 1e6);
    const tx = o.x - S.w / 2, ty = -(o.y - S.h / 2), d = Math.max(1, d0 - (+o.dolly || 0)), a = deg(o.orbit), b = deg(o.tilt);
    cam.position.set(tx + d * Math.sin(a) * Math.cos(b), ty + d * Math.sin(b), d * Math.cos(a) * Math.cos(b));
    cam.up.set(0, 1, 0); cam.lookAt(tx, ty, 0);
    if (o.rotation) cam.rotateZ(-deg(o.rotation));
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    return cam;
  }
  const cameraStill = t => { const o = cameraState(t);
    return !o.orbit && !o.tilt && !o.dolly && (+o.zoom || 1) === 1 && !o.rotation && o.x === S.w / 2 && o.y === S.h / 2; };
  // a 3D layer that is not turned or pushed back, under a camera that has not moved, behaves as a flat one
  const isFlat = (L, o, t) => !solid(L) && !o.rotX && !o.rotY && !o.z && cameraStill(t);

  // where a layer sits: centre, depth (positive is further away), turned Z then Y then X, scaled
  function place(obj, o) {
    obj.position.set(o.x - S.w / 2, -(o.y - S.h / 2), -(+o.z || 0));
    obj.rotation.set(-deg(o.rotX), deg(o.rotY), -deg(o.rotation), 'XYZ');
  }

  // ----- shapes -----
  function geometry(o) {
    const shape = o.shape || 'cube';
    if (shape === 'text') return textGeometry(o);
    const round = shape === 'cube' ? Math.max(0, Math.min(.5, (+o.radius || 0) / Math.max(1, Math.min(Math.abs(o.w), Math.abs(o.h), Math.abs(o.d || 1))))) : 0;
    const key = shape + ':' + round.toFixed(3);
    if (geoms.has(key)) return geoms.get(key);
    let g;
    if (shape === 'sphere') g = new T.SphereGeometry(.5, 64, 32);
    else if (shape === 'cylinder') g = new T.CylinderGeometry(.5, .5, 1, 72, 1);
    else if (shape === 'cone') g = new T.ConeGeometry(.5, 1, 72, 1);
    else if (shape === 'torus') { g = new T.TorusGeometry(.36, .14, 40, 120); }
    else g = round > .001 ? new T.RoundedBoxGeometry(1, 1, 1, 5, round) : new T.BoxGeometry(1, 1, 1);
    geoms.set(key, g);
    return g;
  }
  function loadFont() {
    if (font || fontLoad) return fontLoad;
    loading.add('font');
    fontLoad = fetch('vendor/three/droid_sans_bold.typeface.json').then(r => r.json())
      .then(data => { font = new T.FontLoader().parse(data); geoms.forEach((g, k) => k.startsWith('text:') && geoms.delete(k)); })
      .catch(e => console.warn('No font for 3D text', e))
      .finally(() => { loading.delete('font'); R3D.changed?.(); });
    return fontLoad;
  }
  // 3D text is made one unit tall, then fitted into the layer's width and height without stretching
  function textGeometry(o) {
    const text = String(o.text || ' ').slice(0, 200), key = 'text:' + text;
    if (geoms.has(key)) return geoms.get(key);
    if (!font) { loadFont(); return null; }
    const g = new T.TextGeometry(text, { font, size: 1, depth: 1, curveSegments: 8, bevelEnabled: true, bevelThickness: .03, bevelSize: .02, bevelSegments: 3 });
    g.computeBoundingBox(); const b = g.boundingBox, s = new T.Vector3(); b.getSize(s);
    g.translate(-(b.min.x + s.x / 2), -(b.min.y + s.y / 2), -(b.min.z + s.z / 2));
    g.scale(1 / Math.max(1e-3, s.x), 1 / Math.max(1e-3, s.y), 1 / Math.max(1e-3, s.z));
    g.userData.aspect = s.x / Math.max(1e-3, s.y);
    if (geoms.size > 60) for (const k of [...geoms.keys()].filter(k => k.startsWith('text:')).slice(0, 20)) { geoms.get(k).dispose(); geoms.delete(k); }
    geoms.set(key, g);
    return g;
  }
  // a shape's size in the world: its box, but 3D text keeps the proportions of its letters inside that box
  function shapeSize(o, g) {
    let w = Math.abs(o.w), h = Math.abs(o.h);
    if ((o.shape || 'cube') === 'text' && g?.userData.aspect) { const a = g.userData.aspect; if (w / h > a) w = h * a; else h = w / a; }
    return [w, h, Math.max(1, Math.abs(+o.d || 1))];
  }
  function material(o) {
    const look = LOOK[o.material] || LOOK.glossy;
    return new T.MeshPhysicalMaterial({ color: new T.Color(isColor(o.fill) ? o.fill : '#cccccc'), roughness: look.roughness, metalness: look.metalness,
      clearcoat: look.coat, clearcoatRoughness: .15, envMapIntensity: look.env });
  }

  // ----- models -----
  const MODEL_TYPES = { glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj' };
  const modelFormat = name => (String(name).match(/\.(glb|gltf|obj)$/i)?.[1] || '').toLowerCase();
  function model(id) {
    if (models.has(id)) return models.get(id);
    const a = S.assets?.[id]; if (!a?.src || loading.has(id)) return null;
    loading.add(id);
    fetch(a.src).then(r => r.arrayBuffer()).then(buf => new Promise((res, rej) => {
      if (a.format === 'obj') {
        const g = new T.OBJLoader().parse(new TextDecoder().decode(buf));
        // an OBJ has no materials worth keeping, and often no normals: a plain grey, shaded
        g.traverse(m => { if (!m.isMesh) return; if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
          m.material = new T.MeshStandardMaterial({ color: 0xb4b4b4, roughness: .7, metalness: 0, envMapIntensity: .45, side: T.DoubleSide }); });
        res(g);
      } else new T.GLTFLoader().parse(buf, '', gl => res(gl.scene), rej);
    })).then(group => {
      const box = new T.Box3().setFromObject(group), size = new T.Vector3(), centre = new T.Vector3();
      box.getSize(size); box.getCenter(centre);
      if (!(size.x > 0 || size.y > 0)) throw new Error('it has nothing in it to show');
      group.position.sub(centre);
      models.set(id, { group, size });
    }).catch(e => { models.set(id, { error: String(e?.message || e) }); status?.(`Could not read the 3D model ${a.name}`); })
      .finally(() => { loading.delete(id); R3D.changed?.(); });
    return null;
  }
  // a model fills its layer's box as far as it can without being stretched
  function modelSize(o, m) {
    const s = Math.min(Math.abs(o.w) / Math.max(1e-3, m.size.x), Math.abs(o.h) / Math.max(1e-3, m.size.y));
    return [m.size.x * s, m.size.y * s, m.size.z * s, s];
  }

  // ----- lights -----
  function light(scene, o) {
    scene.environment = env;
    scene.add(new T.HemisphereLight(0xffffff, 0x444455, .45));
    const sun = new T.DirectionalLight(0xffffff, 1.8), a = deg(o.lightAngle ?? -45);
    sun.position.set(Math.sin(a), Math.cos(a), 1.1).multiplyScalar(1000);
    scene.add(sun);
  }

  // ----- a layer, in the world -----
  // what draws LAYER: a textured card for a flat layer made 3D, a lit solid for a shape, the model itself
  function object(L, o, t, k, drawContent) {
    const pivot = new T.Group();
    if (L.type === 'shape3d') {
      const g = geometry(o); if (!g) return null;
      const [w, h, d] = shapeSize(o, g), mesh = new T.Mesh(g, material(o));
      mesh.scale.set(w, h, d); pivot.add(mesh); pivot.userData.dispose = () => mesh.material.dispose();
    } else if (L.type === 'model') {
      const m = model(L.p.asset); if (!m || m.error) return null;
      const [, , , s] = modelSize(o, m), inner = new T.Group();
      inner.add(m.group); inner.scale.setScalar(s); pivot.add(inner);
      pivot.userData.dispose = () => inner.remove(m.group);
    } else {
      // the layer as it looks flat, at the size it will be seen, on a card
      const { w, h } = bounds(L, t), pad = Math.max(4, (+o.strokeWidth || 0) + 4), cw = w + pad * 2, ch = h + pad * 2;
      const r = Math.min(k * 1.5, 4096 / Math.max(cw, ch, 1));
      flat.width = Math.max(1, Math.round(cw * r)); flat.height = Math.max(1, Math.round(ch * r));
      fctx.setTransform(r, 0, 0, r, flat.width / 2, flat.height / 2); fctx.clearRect(-cw, -ch, cw * 2, ch * 2);
      fctx.globalAlpha = 1; fctx.filter = 'none';
      drawContent(fctx, L, o, t);
      // a texture of its own each time: one reused across the layers of a frame keeps showing the first of them
      const tex = new T.CanvasTexture(flat); tex.colorSpace = T.SRGBColorSpace; tex.premultiplyAlpha = true;
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, toneMapped: false, premultipliedAlpha: true, depthWrite: false });
      const card = new T.Mesh(new T.PlaneGeometry(cw, ch), mat);
      pivot.add(card); pivot.userData.dispose = () => { card.geometry.dispose(); mat.dispose(); tex.dispose(); };
    }
    place(pivot, o);
    pivot.scale.set(o.scale * o.sx, o.scale * o.sy, o.scale);
    return pivot;
  }

  // Draw L into C, a canvas whose transform maps canvas pixels to its own: the 3D view at full size, laid over it.
  function draw(c, L, o, t, drawContent) {
    const R = gl(); if (!R) return false;
    const k = c.getTransform().a || 1, W = Math.max(1, Math.min(8192, Math.round(S.w * k))), H = Math.max(1, Math.min(8192, Math.round(S.h * k)));
    if (canvas.width !== W || canvas.height !== H) R.setSize(W, H, false);
    const scene = new T.Scene(), obj = object(L, o, t, k, drawContent);
    if (!obj) { R3D.placeholder?.(c, L, o); return true; }
    if (L.type !== 'shape3d' && L.type !== 'model') scene.environment = null; else light(scene, o);
    scene.add(obj);
    R.render(scene, cameraAt(t));
    c.drawImage(canvas, 0, 0, S.w, S.h);
    obj.userData.dispose?.();
    return true;
  }

  // ----- where a 3D layer lands on the canvas, for selecting it -----
  function corners(L, o, t) {
    let w, h, d;
    if (L.type === 'shape3d') [w, h, d] = shapeSize(o, (o.shape || 'cube') === 'text' ? textGeometry(o) : null);
    else if (L.type === 'model') { const m = models.get(L.p.asset); [w, h, d] = m && !m.error ? modelSize(o, m) : [Math.abs(o.w), Math.abs(o.h), 0]; }
    else { const b = bounds(L, t); w = b.w; h = b.h; d = 0; }
    const obj = new T.Object3D(); place(obj, o); obj.scale.set(o.scale * o.sx, o.scale * o.sy, o.scale); obj.updateMatrixWorld();
    const cam = cameraAt(t), out = [];
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of d ? [-.5, .5] : [0]) {
      const v = new T.Vector3(x * w, y * h, z * d).applyMatrix4(obj.matrixWorld).project(cam);
      if (v.z < 1) out.push([(v.x + 1) / 2 * S.w, (1 - v.y) / 2 * S.h]);
    }
    return out;
  }
  // the outline of those corners: a convex hull, clockwise
  function hull(L, t) {
    if (!T) return [];
    const ps = corners(L, state(L, t), t).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (ps.length < 3) return ps;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of ps) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
    for (const p of ps.slice().reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function inside(poly, x, y) {
    let on = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi || 1e-9) + xi) on = !on;
    }
    return on;
  }

  // ----- before an export: every model and the font read in -----
  async function ready() {
    for (const L of S.layers) { if (L.type === 'model') model(L.p.asset); if (L.type === 'shape3d' && L.p.shape === 'text') loadFont(); }
    for (let i = 0; i < 600 && loading.size; i++) await new Promise(r => setTimeout(r, 50));
  }
  const forget = id => { const m = models.get(id); m?.group?.traverse(o => { o.geometry?.dispose?.(); }); models.delete(id); };

  return { SHAPES, MATERIALS, MODEL_TYPES, modelFormat, ok, is3d, solid, wants, draw, hull, inside, isFlat, ready, forget, cameraLayer, model, loadFont,
    get available() { return !!T; } };
})();
