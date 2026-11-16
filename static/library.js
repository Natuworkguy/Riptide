// ---------- the 3D library ----------
// What a project's 3D worlds are made from, beyond the finishes Riptide paints itself: sky photos (.hdr) that light
// and back a world, materials made from a scanned surface's images (its colour, bumps, shine and shading), and
// models. They are imported from files (the scene editor's Import menu, or dropped on its viewport) and kept in the
// project, so they go wherever it goes.
const Library = (() => {
  const T = window.RiptideThree, M = World.M;
  const dataURL = blob => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });
  const newId = () => 'lib' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const stem = name => String(name).replace(/\.[^.]+$/, '');
  const MOST = 200e6;

  // ----- which image is which, by the names texture sets give them -----
  const ROLES = [['normal', /(^|[^a-z])(nor(mal)?(_?gl)?|nrm|norm)([^a-z]|$)/i], ['rough', /(^|[^a-z])(rough(ness)?|rgh)([^a-z]|$)/i],
    ['ao', /(^|[^a-z])(ao|ambient_?occlusion|occlusion)([^a-z]|$)/i], ['arm', /(^|[^a-z])arm([^a-z]|$)/i], ['metal', /(^|[^a-z])(metal(ness|lic)?|mtl)([^a-z]|$)/i],
    ['skip', /(^|[^a-z])(disp(lacement)?|height|bump|spec(ular)?|gloss|opacity|alpha|mask|preview|thumb)([^a-z]|$)/i],
    ['color', /(^|[^a-z])(diff(use)?|albedo|base_?colou?r|col(ou?r)?|basecolor)([^a-z]|$)/i]];
  const roleOf = name => (ROLES.find(([, re]) => re.test(stem(name))) || ['color'])[0];
  // the name the set shares: its file names less their role
  const setName = files => { const s = stem(files[0].name).replace(/[_\-. ]*(diff(use)?|albedo|base_?colou?r|col(ou?r)?|nor(mal)?(_?gl|_?dx)?|rough(ness)?|ao|arm|metal(ness|lic)?|disp(lacement)?|\d+k)\b.*$/i, '');
    return (s || stem(files[0].name)).replace(/[_\-]+/g, ' ').trim() || 'Material'; };

  // ----- importing -----
  async function importSky(file) {
    if (!/\.hdr$/i.test(file.name)) throw new Error(`${file.name} is not a .hdr sky photo`);
    if (file.size > MOST) throw new Error(`${file.name} is too big`);
    const id = newId(); S.assets[id] = { kind: 'hdri', name: stem(file.name), src: await dataURL(file) }; return id;
  }
  async function importMaterial(files) {
    const maps = {}, images = [...files].filter(f => /\.(jpe?g|png|webp|avif)$/i.test(f.name));
    if (!images.length) throw new Error('choose the material\'s images: its colour, and its normal, roughness and ambient occlusion maps if it has them');
    for (const f of images) { const r = roleOf(f.name); if (r !== 'skip' && !maps[r]) maps[r] = await dataURL(f); }
    if (!maps.color) throw new Error('none of those images is a colour map (its name would have diffuse, albedo, base colour or col in it)');
    const id = newId(); S.assets[id] = { kind: 'material', name: setName(images), maps }; return id;
  }
  async function importModel(file) {
    const format = R3D.modelFormat(file.name); if (!format) throw new Error(`${file.name} is not a .glb, .gltf, .fbx or .obj model`);
    if (file.size > MOST) throw new Error(`${file.name} is too big`);
    const ids = await addAssets([file]); if (!ids.length) throw new Error(`could not read ${file.name}`);
    return ids[0];
  }
  // files of any kind, sorted into what they are; materials from images chosen together
  async function importFiles(files, L) {
    files = [...files]; const done = [];
    const skies = files.filter(f => /\.hdr$/i.test(f.name)), models = files.filter(f => R3D.modelFormat(f.name)), images = files.filter(f => /\.(jpe?g|png|webp|avif)$/i.test(f.name));
    for (const f of skies) { const id = await importSky(f); L.p.hdri = id; if ((L.p.sunPower ?? 100) > 60) L.p.sunPower = 45; done.push(`${S.assets[id].name} lights the world`); }
    if (images.length) { const id = await importMaterial(images), P = SceneEd.selected;
      if (P && !['group', 'light', 'model', 'label'].includes(P.type)) { P.finish = 'lib:' + id; delete P.color; done.push(`${P.name || P.type} is ${S.assets[id].name}`); }
      else done.push(`${S.assets[id].name} is a finish now: pick a prop and choose it, or use it for the ground`); }
    for (const f of files.filter(f => /\.(nbt|schem|schematic)$/i.test(f.name))) { const id = await Blocks.importFile(f), P = { type: 'structure', asset: id, name: stem(f.name), at: SceneEd.spot(), block: 1 };
      (L.p.objects ||= []).push(P); World.ensureIds(L.p.objects); SceneEd.select(P.id); const a = S.assets[id]; done.push(`${P.name} is built in the scene (${a.size.join(' × ')} blocks)`); }
    for (const f of models) { const id = await importModel(f), P = { type: 'model', asset: id, name: stem(f.name), at: SceneEd.spot() };
      (L.p.objects ||= []).push(P); World.ensureIds(L.p.objects); SceneEd.select(P.id); done.push(`${P.name} is in the scene`); }
    if (!done.length) throw new Error('Riptide takes .hdr sky photos, a material\'s images (.jpg, .png, .webp), .glb, .gltf or .obj models, and block builds (.nbt structure files, .schem)');
    World.version++; SceneEd.refreshUI(); refresh(); status(done.join('; '));
  }

  // ----- what the world draws them with -----
  const texCache = new Map(), matCache = new Map(), envCache = new Map(), modelCache = new Map();
  const loaded = () => { World.version++; SceneEd.redraw(); if (typeof render === 'function') render(); };
  // what is still loading, so the server's renderer can wait for it before it sends a picture
  World.pending = 0;
  const begin = () => { World.pending++; let open = true; return ok => { if (open) { open = false; World.pending--; } if (ok !== false) loaded(); }; };
  function tex(src, color) {
    let t = texCache.get(src);
    if (!t) { const end = begin(); t = new T.TextureLoader().load(src, () => end(), undefined, () => end(false)); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; texCache.set(src, t); }
    if (color) t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  World.finishHook = (aid, color, P = {}, glow) => {
    const a = S.assets?.[aid]; if (!a || a.kind !== 'material') return World.finish('plastic', color);
    const size = P.size || [1, 1, 1], tile = Math.max(.05, +P.tile || 1), rep = Math.max(.25, Math.max(...size.map(Number).filter(Boolean)) / tile);
    const key = `${aid}|${color || ''}|${rep.toFixed(2)}|${glow || 0}`; if (matCache.has(key)) return matCache.get(key);
    const at = (src, c) => { if (!src) return null; const t = tex(src, c).clone(); t.repeat.set(rep, rep); t.needsUpdate = true; return t; };
    const metal = a.maps.metal || (a.maps.arm && /metal|steel|iron|chrome|alum|brass|copper|gold/i.test(a.name)) ? at(a.maps.metal || a.maps.arm) : null;
    const m = new T.MeshPhysicalMaterial({ map: at(a.maps.color, true), normalMap: at(a.maps.normal), roughnessMap: at(a.maps.rough || a.maps.arm),
      aoMap: at(a.maps.ao || a.maps.arm), metalnessMap: metal, metalness: metal ? 1 : 0, roughness: 1, color: new T.Color(color || '#ffffff') });
    if (glow) { m.emissive = new T.Color(color || '#ffffff'); m.emissiveIntensity = glow; }
    matCache.set(key, m); return m;
  };
  World.extraFinishes = () => Object.entries(S.assets || {}).filter(([, a]) => a.kind === 'material').map(([id]) => 'lib:' + id);
  World.finishName = f => f.startsWith('lib:') ? (S.assets?.[f.slice(4)]?.name || 'Imported material') : f;
  World.hdriHook = (B, o) => {
    const a = S.assets?.[o.hdri]; if (!a || a.kind !== 'hdri') return false;
    // drawn on the server: this tab never draws the sky, so it need not read the photo
    if (!World.renderer) return false;
    let c = envCache.get(o.hdri);
    if (!c) { c = {}; envCache.set(o.hdri, c); const end = begin();
      new T.HDRLoader().load(a.src, t => { t.mapping = T.EquirectangularReflectionMapping; c.tex = t;
        const pm = new T.PMREMGenerator(World.renderer); c.env = pm.fromEquirectangular(t).texture; pm.dispose(); end(); },
      undefined, () => { c.failed = true; end(false); status(`Could not read the sky photo ${a.name}`); }); }
    if (!c.tex) return false;
    const turn = World.deg(o.hdriTurn || 0), power = Math.max(0, (o.hdriPower ?? 100) / 100);
    B.scene.background = c.tex; B.scene.environment = c.env;
    B.scene.backgroundRotation.set(0, turn, 0); B.scene.environmentRotation.set(0, turn, 0);
    B.scene.backgroundIntensity = power; B.scene.environmentIntensity = power;
    return true;
  };
  // a model prop: the model at its own size (glTF is in metres), standing on the ground where it is put
  World.custom.model = (P, t = 0) => {
    const a = S.assets?.[P.asset]; if (!a?.src) return null;
    let c = modelCache.get(P.asset);
    if (!c) { c = {}; modelCache.set(P.asset, c); const end = begin();
      (async () => {
        const buf = await (await fetch(a.src)).arrayBuffer();
        let g;
        if (a.format === 'obj') { g = new T.OBJLoader().parse(new TextDecoder().decode(buf));
          g.traverse(m => { if (m.isMesh) { if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals(); m.material = World.finish('plastic', '#b8b8b8'); } }); }
        else if (a.format === 'fbx') {
          // an FBX, as Mixamo's characters and moves come: in centimetres, so a person 180 tall is made 1.8 m
          g = new T.FBXLoader().parse(buf, ''); c.clips = g.animations || [];
          const tall = new T.Box3().setFromObject(g).getSize(new T.Vector3()).y; if (tall > 20) g.scale.setScalar(.01);
        }
        else { const gl = await new T.GLTFLoader().parseAsync(buf, ''); g = gl.scene; c.clips = gl.animations || []; }
        // a model with no skeleton, given one to be posed (static/autorig.js), if asked
        let bones = false; g.traverse(n => { if (n.isBone) bones = true; });
        if (!bones && a.rig === 'auto' && World.autoRig) { try { c.autoRigged = World.autoRig(g, { mirror: !!a.rigMirror }); } catch (e) { console.warn('Could not rig the model', e); } }
        g.traverse(n => { if (n.isBone) c.bones = true; });
        const b = new T.Box3().setFromObject(g), ctr = b.getCenter(new T.Vector3());
        g.position.set(-ctr.x, -b.min.y, -ctr.z); const holder = new T.Group(); holder.add(g); c.group = holder; end();
      })().catch(() => { c.failed = true; end(false); status(`Could not read the model ${a.name}`); });
    }
    if (!c.group) return null;
    // a rigged model is copied with its skeleton, and plays the clip picked, at the world's time
    const g = T.SkeletonUtils.clone(c.group); g.scale.setScalar(M);
    const clip = P.clip && c.clips?.find(x => x.name === P.clip);
    if (clip) { const mix = new T.AnimationMixer(g.children[0]); mix.clipAction(clip).play();
      const len = clip.duration || 1, at = t * (+P.clipSpeed || 1) + (+P.clipOffset || 0); mix.setTime(P.clipOnce ? Math.min(at, len - 1e-3) : ((at % len) + len) % len); }
    // an outfit finish (holo, chrome, glow...) over every part of it, its skeleton still moving it
    if (P.outfit) { const m = World.finish(P.outfit, P.outfitColor || undefined); g.traverse(n => { if (n.isMesh) n.material = m; }); }
    // then the pose it was given, bone by bone, over its rest pose or its clip (static/pose.js)
    World.poseHook?.(g, P, t);
    return g;
  };
  World.clipsOf = id => modelCache.get(id)?.clips?.map(x => x.name) || [];
  // whether a model has loaded, and has a skeleton of its own or one given it
  World.modelInfo = id => { const c = modelCache.get(id); return c ? { loaded: !!c.group, bones: !!c.bones, autoRigged: !!c.autoRigged } : null; };
  // give a model a skeleton (or take it away, or turn it round): it is loaded again with it
  function rigModel(id, how) {
    const a = S.assets?.[id]; if (!a) return;
    if (how === 'off') { delete a.rig; delete a.rigMirror; } else { a.rig = 'auto'; if (how === 'mirror') a.rigMirror = !a.rigMirror; }
    modelCache.delete(id); World.version++;
    if (typeof setDirty === 'function') setDirty(true);
    setTimeout(() => { SceneEd.refreshUI?.(); SceneEd.redraw?.(); if (typeof refresh === 'function') refresh(); }, 50);
  }
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'model' || !P.asset) return '';
      const info = World.modelInfo(P.asset), a = S.assets?.[P.asset]; if (!info?.loaded || !a) return '';
      if (info.bones && !info.autoRigged) return '';
      if (!info.bones) return `<div class="hd">Pose it</div><p class="note">This model has no skeleton, so it cannot be posed yet. Riptide can give it one: it finds the head, the arms and the legs of a figure standing upright and binds the model to bones for them, so it can wave, point, sit or be posed joint by joint.</p>
        <div class="acts"><button class="tb small" data-rig="auto">Give it a skeleton</button></div>`;
      return `<div class="hd">Its skeleton</div><p class="note">Given by Riptide. If its left and right are the wrong way round (it was made facing away), turn it round. Pose it below.</p>
        <div class="acts"><button class="tb small" data-rig="mirror">Swap left and right</button><button class="tb small" data-rig="off">Take the skeleton away</button></div>`;
    },
    click(b) { const P = SceneEd.selected; if (!b.dataset.rig || P?.type !== 'model') return false; rigModel(P.asset, b.dataset.rig); return true; },
  });
  World.PARTS.push('model');

  // ----- in the scene editor: an Import menu, and files dropped on the viewport -----
  const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true; document.body.appendChild(picker);
  let pickFor = null;
  picker.addEventListener('change', async () => { const files = [...picker.files]; picker.value = ''; if (!files.length || !pickFor) return;
    try { await importFiles(files, pickFor); } catch (e) { status(e.message[0].toUpperCase() + e.message.slice(1)); } });
  function choose(L, accept) { pickFor = L; picker.accept = accept; picker.click(); }
  SceneEd.extras.push({
    mount(where) {
      if (where.querySelector('[data-lib]')) return;
      const b = document.createElement('button'); b.className = 'tb small'; b.dataset.lib = '1'; b.textContent = 'Import';
      b.title = 'Sky photos, materials from images, models and block builds, from your files (or drop them on the view)';
      b.onclick = () => UI.menu(b, [{ value: 'sky', label: 'Sky photo…', hint: '.hdr' }, { value: 'mat', label: 'Material from images…', hint: 'colour, normal, roughness, AO' },
        { value: 'model', label: 'Model…', hint: '.glb .gltf .obj' }, { value: 'blocks', label: 'Block build…', hint: '.nbt structure file, .schem' }], null,
        v => choose(SceneEd.layer, v === 'sky' ? '.hdr' : v === 'mat' ? 'image/*' : v === 'blocks' ? '.nbt,.schem,.schematic' : '.glb,.gltf,.obj'));
      where.appendChild(b);
      const vp = where.closest('.sced').querySelector('.vp');
      vp.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); vp.classList.add('drop'); } });
      vp.addEventListener('dragleave', () => vp.classList.remove('drop'));
      vp.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); vp.classList.remove('drop');
        try { await importFiles(e.dataTransfer.files, SceneEd.layer); } catch (err) { status(err.message[0].toUpperCase() + err.message.slice(1)); } });
    },
  });

  return { importFiles, importSky, importMaterial, importModel, choose, roleOf };
})();
