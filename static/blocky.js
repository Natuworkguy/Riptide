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
    const key = ['paint', o.skinTone, o.hair, o.shirt, o.pants, o.shoes, o.eyes].join('|');
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
    // what it is doing before any pose by hand: standing, walking, waving
    const move = P.move || 'idle', s = Math.sin(t * Math.PI * 2 * (move === 'walk' ? .9 : .3));
    const turn = (b, x, z = 0) => b.quaternion.setFromEuler(new T.Euler(x, 0, z));
    if (move === 'walk') { turn(armR, s * .7); turn(armL, -s * .7); turn(legR, -s * .6); turn(legL, s * .6); }
    else if (move === 'wave') { turn(armL, 0, .05); turn(armR, Math.PI + .2, -.35 + s * .35); }
    else { turn(armR, 0, -.05 - s * .02); turn(armL, 0, .05 + s * .02); }
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
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'blocky') return '';
      const pics = Object.entries((typeof S !== 'undefined' && S.assets) || {}).filter(([, a]) => !a.kind && a.w === 64 && (a.h === 64 || a.h === 32)).map(([id, a]) => [id, a.name]);
      return `<div class="hd">Block figure</div>
        <label class="f wide"><span>Skin</span>${opt('skin', P.skin || '', [['', 'Painted from the colours below'], ...pics, ...(P.skin && !pics.some(x => x[0] === P.skin) ? [[P.skin, 'A picture no longer in Media']] : [])])}</label>
        <label class="f"><span>Does</span>${opt('move', P.move || 'idle', [['idle', 'Stand'], ['walk', 'Walk'], ['wave', 'Wave']])}</label>
        <label class="f"><span>Height m</span><input type="number" step=".05" data-k="height" value="${+P.height || 1.8}"></label>
        <label class="f"><span>Outer layer</span>${opt('outer', P.outer === false || P.outer === 'off' ? 'off' : '', [['', 'Shown'], ['off', 'Hidden']])}</label>
        ${P.skin && pics.some(x => x[0] === P.skin) ? '' : col('skinTone', P.skinTone || '#d6a685', 'Skin') + col('hair', P.hair || '#141210', 'Hair') + col('eyes', P.eyes || '#5a3d2b', 'Eyes') + col('shirt', P.shirt || '#d97757', 'Top') + col('pants', P.pants || '#3b4a3f', 'Trousers') + col('shoes', P.shoes || '#e3dacc', 'Shoes')}
        <p class="note">A skin is a 64 × 64 picture of each box's faces unfolded, in the usual block-figure layout. Import one under Media and pick it here. Pose it below: presets, or any joint by hand.</p>`;
    },
  });
  const was = World.custom.blocky; World.custom.blocky = (P, t) => was({ ...P, outer: !(P.outer === false || P.outer === 'off') }, t);
  return { PARTS, painted };
})();
