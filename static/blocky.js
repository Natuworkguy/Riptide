// ---------- block figures: posable people made of boxes, dressed by a skin picture ----------
// A head, a body, two arms and two legs, each a box, on a skeleton with the usual bone names, so the scene editor
// poses it like any rigged model: presets (sit, wave, point...), any joint by hand, and keyed from pose to pose.
// It is dressed by a skin: a 64 x 64 picture in the layout block-figure skins are commonly drawn in (each box's six
// faces unfolded, with an outer layer for hats, hair and jackets). Bring one in under Media and pick it as the
// figure's Skin; with none, it paints its own from the colours given. Sizes are in skin pixels, 1/18 m each.
const Blocky = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PX = 1 / 18;                   // metres per skin pixel: a figure is 32 of them tall, about 1.8 m
  // each part: its box (w, h, d in pixels) and where its faces start in the skin, inner layer then outer layer
  const PARTS = {
    head: { size: [8, 8, 8], uv: [0, 0], over: [32, 0] },
    body: { size: [8, 12, 4], uv: [16, 16], over: [16, 32] },
    armR: { size: [4, 12, 4], uv: [40, 16], over: [40, 32] },
    armL: { size: [4, 12, 4], uv: [32, 48], over: [48, 48] },
    legR: { size: [4, 12, 4], uv: [0, 16], over: [0, 32] },
    legL: { size: [4, 12, 4], uv: [16, 48], over: [0, 48] },
  };

  // a box whose six faces show the right parts of the skin. The figure faces +Z; its right side is -X.
  function boxGeo(size, [u, v], grow = 0) {
    const [w, h, d] = size, g = new T.BoxGeometry((w + grow) * PX, (h + grow) * PX, (d + grow) * PX);
    const rect = (x, y, rw, rh) => [[x, y], [x + rw, y], [x, y + rh], [x + rw, y + rh]];  // TL, TR, BL, BR
    // three.js box faces: +x, -x, +y, -y, +z, -z; each face's corners top-left, top-right, bottom-left, bottom-right
    const faces = [
      rect(u + d + w, v + d, d, h),      // +x: its left side
      rect(u, v + d, d, h),              // -x: its right side
      rect(u + d, v, w, d),              // +y: top
      rect(u + d + w, v, w, d),          // -y: bottom
      rect(u + d, v + d, w, h),          // +z: front
      rect(u + d + w + d, v + d, w, h),  // -z: back
    ];
    const uvs = g.attributes.uv;
    faces.forEach((f, i) => f.forEach(([x, y], k) => uvs.setXY(i * 4 + k, x / 64, 1 - y / 64)));
    uvs.needsUpdate = true;
    return g;
  }
  const geos = new Map(), geo = (part, outer) => {
    const k = part + (outer ? '+' : ''); if (!geos.has(k)) { const p = PARTS[part]; geos.set(k, boxGeo(p.size, outer ? p.over : p.uv, outer ? (part === 'head' ? 1 : .5) : 0)); }
    return geos.get(k);
  };

  // ----- the skin: a picture brought in, or one painted from colours -----
  const skins = new Map();
  function painted(o) {
    const key = ['paint', o.skinTone, o.hair, o.shirt, o.pants, o.shoes, o.eyes, o.belt].join('|');
    if (skins.has(key)) return skins.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const fill = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    // every face of a box at once: its unfolded region
    const box = (c, [u, v], [w, h, d]) => { fill(c, u + d, v, w * 2, d); fill(c, u, v + d, (d + w) * 2, h); };
    const skin = o.skinTone || '#d6a685', hair = o.hair || '#141210', shirt = o.shirt || '#d97757', pants = o.pants || '#3b4a3f', shoes = o.shoes || '#e3dacc';
    box(skin, PARTS.head.uv, PARTS.head.size);
    // hair: the top, a fringe across the front, the back and sides longer
    fill(hair, 8, 0, 8, 8); fill(hair, 8, 8, 8, 2); fill(hair, 0, 8, 8, 4); fill(hair, 16, 8, 8, 4); fill(hair, 24, 8, 8, 6);
    // the face: eyes (white, then the colour), a nose shadow, a mouth
    fill('#ffffff', 9, 12, 2, 1); fill('#ffffff', 13, 12, 2, 1); fill(o.eyes || '#5a3d2b', 10, 12, 1, 1); fill(o.eyes || '#5a3d2b', 13, 12, 1, 1);
    fill('rgba(0,0,0,.12)', 11, 13, 2, 1); fill('#8a5a4a', 11, 14, 2, 1);
    box(shirt, PARTS.body.uv, PARTS.body.size);
    // a belt round the waist, and buttons down the front with it, for a uniform
    if (o.belt) { fill(o.belt, 16, 30, 24, 1); fill('rgba(255,220,120,.85)', 23, 30, 2, 1); for (const y of [22, 25, 28]) fill('rgba(0,0,0,.35)', 23, y, 1, 1); }
    for (const part of ['armR', 'armL']) { const p = PARTS[part], [u, v] = p.uv; box(skin, p.uv, p.size); fill(shirt, u + 4, v, 4, 4); fill(shirt, u, v + 4, 16, 5); }
    for (const part of ['legR', 'legL']) { const p = PARTS[part], [u, v] = p.uv; box(pants, p.uv, p.size); fill(shoes, u, v + 4 + 10, 16, 2); fill(shoes, u + 8, v, 4, 4); }
    // a little shading so faces read: darker under the arms' sleeves and down the body's sides
    fill('rgba(0,0,0,.08)', 16, 20, 4, 12); fill('rgba(0,0,0,.08)', 28, 20, 4, 12);
    const t = texOf(cv); skins.set(key, t); return t;
  }
  function texOf(img) { const t = new T.Texture(img); t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.colorSpace = T.SRGBColorSpace; t.needsUpdate = true; return t; }
  // a skin picture from the project's media, by its asset id: loaded once, then kept
  function fromAsset(id) {
    // a picture taken out of the project is gone from the figure too
    const a = (typeof S !== 'undefined' && S.assets?.[id]) || null; if (!a?.src) { skins.delete('asset:' + id); return null; }
    if (skins.has('asset:' + id)) return skins.get('asset:' + id);
    const im = new Image(); World.pending++;
    skins.set('asset:' + id, null);
    im.onload = () => { skins.set('asset:' + id, texOf(im)); World.pending--; World.version++; SceneEd.redraw?.(); if (typeof render === 'function') render(); };
    im.onerror = () => { World.pending--; };
    im.src = a.src;
    return null;
  }
  const mats = new Map();
  function matsFor(tex) {
    let m = mats.get(tex);
    if (!m) { m = { inner: new T.MeshStandardMaterial({ map: tex, roughness: .85, metalness: 0, alphaTest: .5, transparent: false }),
      outer: new T.MeshStandardMaterial({ map: tex, roughness: .85, metalness: 0, alphaTest: .5, transparent: true, side: T.DoubleSide }) }; mats.set(tex, m); }
    return m;
  }

  // ----- what a figure holds: a pixel picture, given its one pixel of thickness -----
  // Drawn here, in Riptide's own pixel style: a sword, a pickaxe, an axe, a shovel, a torch, each in wood, stone,
  // iron, gold, diamond or netherite. On a 16 x 16 grid, held at the bottom-left, pointing up to the right.
  const MATS = { wood: '#a0784a', stone: '#8b8b8d', iron: '#dcdcdc', gold: '#f2cf45', diamond: '#5ee3d8', netherite: '#4d4649' };
  const HANDLE = '#7a5a34';
  function itemPixels(kind, mat) {
    const px = Array.from({ length: 16 }, () => Array(16).fill(null)), C = new T.Color(MATS[mat] || MATS.iron), H = new T.Color(HANDLE);
    const light = C.clone().multiplyScalar(1.22), dark = C.clone().multiplyScalar(.62), hdark = H.clone().multiplyScalar(.7);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      // along the diagonal from the bottom-left (u) and across it (v)
      const u = (x + 15 - y) / 2, v = x - 15 + y; let c = null;
      if (kind === 'sword') {
        if (u >= 5 && u <= 14.6 && Math.abs(v) <= (u > 13.6 ? 0 : 1)) c = v < 0 ? dark : v > 0 ? C : light;
        else if (u >= 4 && u < 5 && Math.abs(v) <= 3) c = dark;
        else if (u >= 1 && u < 4 && v === 0) c = (u | 0) % 2 ? H : hdark;
        else if (u >= 0 && u < 1 && Math.abs(v) <= 1) c = dark;
      } else if (kind === 'pickaxe' || kind === 'axe' || kind === 'shovel') {
        const top = kind === 'shovel' ? 9.5 : 13.6;
        if (u >= .5 && u <= top && v === 0) c = (u | 0) % 2 ? H : hdark;
        if (kind === 'pickaxe') { const uc = 12.6 - v * v / 14; if (Math.abs(u - uc) <= .9 && Math.abs(v) <= 7) c = u > uc ? light : C; if (Math.abs(u - uc) <= .9 && Math.abs(v) === 7) c = dark; }
        if (kind === 'axe' && u >= 9 && u <= 14 && v <= -1 && v >= -1 - (u - 9) * 1.15 && v >= -6) c = v <= -5 || u >= 13.5 ? light : (u + v) % 3 === 0 ? dark : C;
        if (kind === 'shovel' && u >= 9.5 && u <= 14.5 && Math.abs(v) <= (u > 13.5 ? 1 : 2)) c = v < 0 ? dark : v > 0 ? C : light;
      } else if (kind === 'torch') {
        if ((x === 7 || x === 8) && y >= 6 && y <= 15) c = x === 7 ? H : hdark;
        if ((x === 7 || x === 8) && (y === 4 || y === 5)) c = new T.Color('#ffd23a');
        if ((x === 7 || x === 8) && y === 3) c = new T.Color('#fff2b0');
        if ((x === 6 || x === 9) && y === 5) c = new T.Color('#ff8a1e');
      }
      px[y][x] = c;
    }
    // a dark rim round it, so it reads against anything
    const rim = new T.Color('#1d1a18'), out = px.map(r => r.slice());
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!px[y][x] && kind !== 'torch') {
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px[y + dy]?.[x + dx])) out[y][x] = rim; }
    return out;
  }
  const items = new Map(), IPX = 1 / 26;
  function itemGeometry(kind, mat) {
    const k = kind + '|' + mat; if (items.has(k)) return items.get(k);
    const px = itemPixels(kind, mat), pos = [], nor = [], col = [];
    const quad = (a, b, c, d, n, cc) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); col.push(cc.r, cc.g, cc.b); } };
    const on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && !!px[y][x];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = px[y][x]; if (!c) continue;
      // the picture's x right and y up, one pixel thick in z, its middle at 0
      const x0 = x - 8, x1 = x - 7, y0 = 8 - y - 1, y1 = 8 - y, z0 = -.5, z1 = .5;
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c);
      const e = c.clone().multiplyScalar(.8);
      if (!on(x + 1, y)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], e);
      if (!on(x - 1, y)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], e);
      if (!on(x, y - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], e);
      if (!on(x, y + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], e);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.scale(IPX, IPX, IPX); items.set(k, g); return g;
  }
  const itemMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .1 });
  // in the hand: the grip in the fist, the picture standing upright along the way the figure faces, tip forward
  function held(kind, mat) {
    const mesh = new T.Mesh(itemGeometry(kind, mat), kind === 'torch' ? new T.MeshStandardMaterial({ vertexColors: true, emissive: new T.Color('#ffb347'), emissiveIntensity: .25 }) : itemMat);
    mesh.castShadow = true;
    const grip = kind === 'torch' ? [0, -4.5] : [-5.5, -5.5];
    mesh.position.set(-grip[0] * IPX, -grip[1] * IPX, 0);
    const a = new T.Group(); a.add(mesh);
    if (kind !== 'torch') a.rotation.z = -Math.PI / 4;
    const b = new T.Group(); b.add(a); b.rotation.y = -Math.PI / 2;
    const c = new T.Group(); c.add(b); c.rotation.x = kind === 'torch' ? -Math.PI / 2 + .25 : -.35;
    return c;
  }
  // a hat, made of boxes over the head (sizes in skin pixels, the head 8 across)
  const hatMats = new Map(), hatMat = c => { if (!hatMats.has(c)) hatMats.set(c, new T.MeshStandardMaterial({ color: new T.Color(c), roughness: .85 })); return hatMats.get(c); };
  function hat(kind, color, band) {
    const g = new T.Group(), c = color || '#3f5a2a', d = band || '#' + new T.Color(c).multiplyScalar(.55).getHexString(T.SRGBColorSpace);
    const box = (w, h, dd, x, y, z, col) => { const m = new T.Mesh(new T.BoxGeometry(w * PX, h * PX, dd * PX), hatMat(col)); m.position.set(x * PX, y * PX, z * PX); m.castShadow = true; g.add(m); return m; };
    if (kind === 'cap') { box(9.4, 1.2, 9.4, 0, 8.4, 0, d); box(9, 2.2, 9, 0, 9.9, -.2, c); const brim = box(8.6, .6, 3.6, 0, 8.1, 5.9, d); brim.rotation.x = .18; box(2, 1.2, .4, 0, 9.3, 4.75, '#e2b93b'); }
    else if (kind === 'beanie') { box(9, 3.2, 9, 0, 8.3, 0, c); box(9.3, 1, 9.3, 0, 7.4, 0, d); }
    else if (kind === 'helmet') { box(9.6, 3.8, 9.6, 0, 7.8, 0, c || '#c8c8c8'); box(9.8, .8, 9.8, 0, 6.2, 0, d); }
    else if (kind === 'tophat') { box(11.5, .6, 11.5, 0, 8.4, 0, c); box(7.4, 6, 7.4, 0, 11.7, 0, c); box(7.6, 1, 7.6, 0, 9.3, 0, d); }
    return g;
  }

  // ----- the figure: bones with the usual names, a box on each -----
  function figure(P, t) {
    const skinTex = (P.skin && fromAsset(P.skin)) || painted(P), m = matsFor(skinTex);
    const bone = (name, x, y, z) => { const b = new T.Bone(); b.name = name; b.position.set(x * PX, y * PX, z * PX); return b; };
    const hips = bone('Hips', 0, 12, 0), spine = bone('Spine', 0, 0, 0), head = bone('Head', 0, 12, 0);
    const armR = bone('RightArm', -6, 10, 0), armL = bone('LeftArm', 6, 10, 0), legR = bone('RightUpLeg', -2, 0, 0), legL = bone('LeftUpLeg', 2, 0, 0);
    // the bones' far ends, so a preset knows which way each part points
    const tipOf = (name, parent, y) => { const b = bone(name, 0, y, 0); parent.add(b); };
    hips.add(spine, legR, legL); spine.add(head, armR, armL);
    tipOf('HeadTop', head, 8); tipOf('RightHand', armR, -10); tipOf('LeftHand', armL, -10); tipOf('RightFoot', legR, -12); tipOf('LeftFoot', legL, -12);
    const put = (b, part, y) => {
      for (const outer of [false, true]) { if (outer && P.outer === false) continue;
        const mesh = new T.Mesh(geo(part, outer), outer ? m.outer : m.inner); mesh.position.y = y * PX; mesh.castShadow = mesh.receiveShadow = true; b.add(mesh); }
    };
    put(spine, 'body', 6); put(head, 'head', 4); put(armR, 'armR', -4); put(armL, 'armL', -4); put(legR, 'legR', -6); put(legL, 'legL', -6);
    // the arms hang a little out from the body so they don't sink into it
    armR.position.x -= .001; armL.position.x += .001;
    // what it holds, in each hand, and a hat
    if (P.hold && P.hold !== 'none') { const it = held(P.hold, P.holdMat || 'iron'); it.position.set(0, -9.5 * PX, .3 * PX); armR.add(it); }
    if (P.holdLeft && P.holdLeft !== 'none') { const it = held(P.holdLeft, P.holdLeftMat || 'iron'); it.position.set(0, -9.5 * PX, .3 * PX); armL.add(it); }
    if (P.hat && P.hat !== 'none') head.add(hat(P.hat, P.hatColor, P.hatBand));
    // what it is doing before any pose by hand: standing, walking, running, talking, saluting, swinging, waving
    const move = P.move || 'idle', rate = move === 'run' ? 1.6 : move === 'walk' ? .9 : move === 'talk' ? .7 : .3, s = Math.sin(t * Math.PI * 2 * rate);
    const turn = (b, x, z = 0, y = 0) => b.quaternion.setFromEuler(new T.Euler(x, y, z));
    const holding = !!(P.hold && P.hold !== 'none');
    if (move === 'walk') { turn(armR, s * .7 - (holding ? .25 : 0)); turn(armL, -s * .7); turn(legR, -s * .6); turn(legL, s * .6); }
    else if (move === 'run') { turn(armR, s * 1.1 - (holding ? .3 : 0)); turn(armL, -s * 1.1); turn(legR, -s * 1); turn(legL, s * 1); turn(spine, .12); hips.position.y += Math.abs(s) * PX * 1.2; }
    else if (move === 'wave') { turn(armL, 0, .05); turn(armR, Math.PI + .2, -.35 + s * .35); }
    else if (move === 'talk') {
      // the hands go with the words, the head nods
      const s2 = Math.sin(t * 5.3) * .5 + Math.sin(t * 3.1 + 1) * .5;
      turn(armR, -.45 - Math.max(0, s2) * .55 - (holding ? .2 : 0), -.12); turn(armL, -.2 - Math.max(0, -s2) * .4, .1); turn(head, Math.sin(t * 4.2) * .07, 0, Math.sin(t * 1.7) * .08);
    }
    else if (move === 'salute') { turn(armR, -2.35, .55, -.15); turn(armL, 0, .04); turn(head, -.04); }
    else if (move === 'attack') {
      // a swing down and across, again and again
      const ph = (t * 1.6) % 1, k = ph < .3 ? ph / .3 : 1 - (ph - .3) / .7, e = k * k * (3 - 2 * k);
      turn(armR, -2.4 + e * 2.1 * (ph < .3 ? 1 : 1), -.2 + e * .3); turn(armL, 0, .05); turn(spine, 0, 0, (ph < .3 ? e : e) * -.15);
    }
    else { turn(armR, (holding ? -.28 : 0), -.05 - s * .02); turn(armL, 0, .05 + s * .02); }
    const root = new T.Group(); root.add(hips);
    World.poseHook?.(root, P, t);
    root.scale.setScalar(clamp(+P.height || 1.8, .2, 10) / 1.8);
    return root;
  }
  World.custom.blocky = (P, t = 0) => { const g = new T.Group(); g.add(figure(P, t)); g.scale.setScalar(M); return g; };

  World.PARTS.push('blocky');
  SceneEd.add('blocky', { type: 'blocky', move: 'idle', height: 1.8 }, 'Block figure');
  const opt = (k, v, list) => `<select data-k="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v ?? '') === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  const col = (k, v, label) => `<label class="f"><span>${label}</span><input type="color" data-k="${k}" value="${v}"></label>`;
  const ITEMS = [['none', 'Nothing'], ['sword', 'Sword'], ['pickaxe', 'Pickaxe'], ['axe', 'Axe'], ['shovel', 'Shovel'], ['torch', 'Torch']];
  const MAT_LIST = Object.keys(MATS).map(k => [k, k[0].toUpperCase() + k.slice(1)]);
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'blocky') return '';
      const pics = Object.entries((typeof S !== 'undefined' && S.assets) || {}).filter(([, a]) => !a.kind && a.w === 64 && (a.h === 64 || a.h === 32)).map(([id, a]) => [id, a.name]);
      return `<div class="hd">Block figure</div>
        <label class="f wide"><span>Skin</span>${opt('skin', P.skin || '', [['', 'Painted from the colours below'], ...pics, ...(P.skin && !pics.some(x => x[0] === P.skin) ? [[P.skin, 'A picture no longer in Media']] : [])])}</label>
        <label class="f"><span>Does</span>${opt('move', P.move || 'idle', [['idle', 'Stand'], ['walk', 'Walk'], ['run', 'Run'], ['talk', 'Talk'], ['salute', 'Salute'], ['attack', 'Swing'], ['wave', 'Wave']])}</label>
        <label class="f"><span>Holds</span>${opt('hold', P.hold || 'none', ITEMS)}</label>${P.hold && P.hold !== 'none' && P.hold !== 'torch' ? `<label class="f"><span>Made of</span>${opt('holdMat', P.holdMat || 'iron', MAT_LIST)}</label>` : ''}
        <label class="f"><span>Left hand</span>${opt('holdLeft', P.holdLeft || 'none', ITEMS)}</label>${P.holdLeft && P.holdLeft !== 'none' && P.holdLeft !== 'torch' ? `<label class="f"><span>Made of</span>${opt('holdLeftMat', P.holdLeftMat || 'iron', MAT_LIST)}</label>` : ''}
        <label class="f"><span>Hat</span>${opt('hat', P.hat || 'none', [['none', 'None'], ['cap', 'Peaked cap'], ['beanie', 'Beanie'], ['helmet', 'Helmet'], ['tophat', 'Top hat']])}</label>
        ${P.hat && P.hat !== 'none' ? col('hatColor', P.hatColor || '#3f5a2a', 'Hat colour') : ''}
        <label class="f"><span>Height m</span><input type="number" step=".05" data-k="height" value="${+P.height || 1.8}"></label>
        <label class="f"><span>Outer layer</span>${opt('outer', P.outer === false || P.outer === 'off' ? 'off' : '', [['', 'Shown'], ['off', 'Hidden']])}</label>
        ${P.skin && pics.some(x => x[0] === P.skin) ? '' : col('skinTone', P.skinTone || '#d6a685', 'Skin') + col('hair', P.hair || '#141210', 'Hair') + col('eyes', P.eyes || '#5a3d2b', 'Eyes') + col('shirt', P.shirt || '#d97757', 'Top') + col('pants', P.pants || '#3b4a3f', 'Trousers') + col('shoes', P.shoes || '#e3dacc', 'Shoes') + col('belt', P.belt || '#2b2118', 'Belt')}
        <p class="note">A skin is a 64 × 64 picture of each box's faces unfolded, in the usual block-figure layout. Import one under Media and pick it here. Pose it below: presets, or any joint by hand.</p>`;
    },
  });
  const was = World.custom.blocky; World.custom.blocky = (P, t) => was({ ...P, outer: !(P.outer === false || P.outer === 'off') }, t);
  return { PARTS, painted };
})();
