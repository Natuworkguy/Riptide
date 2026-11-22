// ---------- Interiors: a room and what is in it, in metres ----------
// A room is four walls, a floor of oak planks, a ceiling and skirting, with a window that lets the sun in (the world's
// own sun) behind a sheer curtain, a door, and a wall of patterned paper if asked. Then the things that make it a home:
// sofas with plump seat and back cushions on metal feet, an oak coffee table on a black steel frame with a shelf
// under it, a side table, a low oak TV unit, a TV, an open bookcase of oak boxes on steel poles full of books, floor and
// table lamps with linen shades, framed prints (botanical or mountains), a rug, cushions, a plant in a clay pot and an
// open book. Every surface is a real material: grain, weave, paper, paint that catches the light.
const Interior = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), deg = v => v * Math.PI / 180;
  const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const cache = new Map(), once = (k, make) => cache.get(k) || (cache.set(k, make()), cache.get(k));
  const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);
  const merge = gs => T.BufferGeometryUtils.mergeGeometries(gs.map(g => (g.index ? g.toNonIndexed() : g)));

  // ----- shapes -----
  // a box with rounded edges and corners, as anything upholstered or moulded is (an extruded rounded square, its
  // faces bevelled round)
  function rbox(w, h, d, r = .03, seg = 4) {
    r = Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001);
    const s = new T.Shape(), x = w / 2 - r, y = h / 2 - r;
    s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y); s.lineTo(w / 2, y);
    s.quadraticCurveTo(w / 2, h / 2, x, h / 2); s.lineTo(-x, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
    s.lineTo(-w / 2, -y); s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
    const g = new T.ExtrudeGeometry(s, { depth: Math.max(.001, d - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r,
      bevelSegments: seg, curveSegments: seg });
    g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g;
  }
  // a cushion: a rounded box puffed out in the middle, as a filled one is
  function cushion(w, h, d, puff = .25, r = .06) {
    const g = rbox(w, h, d, r, 5), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (w / 2), z = p.getZ(i) / (d / 2), y = p.getY(i) / (h / 2);
      const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
      p.setY(i, p.getY(i) * (1 + puff * k * (Math.abs(y) > .2 ? 1 : .3)));
    }
    g.computeVertexNormals(); return g;
  }
  const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new T.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const at = (g, x, y, z, ry = 0, rx = 0) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

  // ----- materials, drawn on canvases -----
  const tex = (key, size, draw, repeat = [1, 1], srgb = true) => once('tx|' + key, () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size; draw(cv.getContext('2d'), size);
    const t = new T.CanvasTexture(cv); if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; t.repeat.set(...repeat); return t;
  });
  const noise = (g, S, n, a, seed = 3) => { const r = rng(seed); for (let i = 0; i < n; i++) { const v = r() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},${a * r()})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); } };
  const mats = new Map(), mat = (key, make) => mats.get(key) || (mats.set(key, make()), mats.get(key));

  // oak: pale, with long grain lines and the odd darker streak
  function oakDraw(base = [205, 170, 120], seed = 5) {
    return (g, S) => {
      const r = rng(seed); g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) {
        const y = r() * S, dark = r() < .2, a = dark ? .18 : .07;
        g.strokeStyle = dark ? `rgba(110,72,35,${a})` : `rgba(255,240,215,${a})`; g.lineWidth = .6 + r() * 2.4;
        g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * .02 + i) * (2 + r() * 3)); g.stroke();
      }
      for (let i = 0; i < 6; i++) { // knots, stretched along the grain
        const x = r() * S, y = r() * S; const gr = g.createRadialGradient(x, y, 0, x, y, 10 + r() * 14);
        gr.addColorStop(0, 'rgba(95,60,30,.45)'); gr.addColorStop(1, 'rgba(95,60,30,0)'); g.save(); g.translate(x, y); g.scale(3, 1);
        g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - 30, y - 30, 60, 60); g.restore();
      }
      noise(g, S, 6000, .06, seed);
    };
  }
  const oak = (tone = 'pale') => mat('oak' + tone, () => {
    const base = tone === 'mid' ? [176, 136, 88] : [212, 178, 128];
    const map = tex('oak' + tone, 512, oakDraw(base, tone === 'mid' ? 9 : 5), [1, 1]);
    return new T.MeshPhysicalMaterial({ map, roughness: .58, metalness: 0, clearcoat: .25, clearcoatRoughness: .5 });
  });
  // a floor of planks: rows of boards, each its own tone, ends staggered, a dark hairline between
  const planks = () => mat('planks', () => {
    const map = tex('planks', 1024, (g, S) => {
      const r = rng(21), rows = 8, rh = S / rows;
      for (let j = 0; j < rows; j++) {
        let x = -r() * S * .6;
        while (x < S) {
          const len = S * (.35 + r() * .5), t = .85 + r() * .25;
          g.fillStyle = `rgb(${215 * t | 0},${185 * t | 0},${142 * t | 0})`; g.fillRect(x, j * rh, len, rh);
          for (let i = 0; i < 26; i++) { const y = j * rh + r() * rh; g.strokeStyle = `rgba(${r() < .3 ? '120,80,40' : '255,245,225'},${.05 + r() * .08})`;
            g.lineWidth = .5 + r() * 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - .5) * 3); g.stroke(); }
          g.fillStyle = 'rgba(70,45,25,.55)'; g.fillRect(x, j * rh, 1.5, rh); x += len;
        }
        g.fillStyle = 'rgba(70,45,25,.5)'; g.fillRect(0, j * rh, S, 1.5);
      }
      noise(g, S, 30000, .05, 22);
    }, [1, 1]);
    const rough = tex('planksR', 512, (g, S) => { g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, S, S); noise(g, S, 20000, .2, 23); }, [1, 1], false);
    return new T.MeshPhysicalMaterial({ map, roughnessMap: rough, roughness: .55, clearcoat: .35, clearcoatRoughness: .35 });
  });
  // paint on plaster: the colour, faintly uneven, matte
  const paint = color => mat('paint' + color, () => {
    const bump = tex('plaster', 512, (g, S) => { g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); noise(g, S, 40000, .12, 31); }, [6, 6], false);
    return new T.MeshStandardMaterial({ color: new T.Color(color), roughness: .92, bumpMap: bump, bumpScale: .4 });
  });
  // patterned paper: pointed arches in cream lines on a sage ground, an art deco leaf
  const wallpaper = color => mat('paper' + color, () => {
    const map = tex('paper' + color, 512, (g, S) => {
      g.fillStyle = color; g.fillRect(0, 0, S, S);
      const shade = g.createLinearGradient(0, 0, S, S); shade.addColorStop(0, 'rgba(255,255,255,.06)'); shade.addColorStop(1, 'rgba(0,0,0,.06)');
      g.fillStyle = shade; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(244,240,222,.92)'; g.lineWidth = 5; g.lineCap = 'round';
      const cw = S / 2, ch = S / 2;
      for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) for (const off of [0, .5]) {
        const x = (i + off) * cw, y = (j + off) * ch;
        g.beginPath(); g.moveTo(x, y + ch * .5); g.bezierCurveTo(x - cw * .5, y + ch * .1, x - cw * .5, y - ch * .1, x, y - ch * .5);
        g.bezierCurveTo(x + cw * .5, y - ch * .1, x + cw * .5, y + ch * .1, x, y + ch * .5); g.stroke();
        g.beginPath(); g.moveTo(x, y + ch * .3); g.bezierCurveTo(x - cw * .22, y + ch * .05, x - cw * .22, y - ch * .05, x, y - ch * .3);
        g.bezierCurveTo(x + cw * .22, y - ch * .05, x + cw * .22, y + ch * .05, x, y + ch * .3); g.stroke();
      }
      noise(g, S, 8000, .05, 41);
    }, [3, 3]);
    return new T.MeshStandardMaterial({ map, roughness: .85 });
  });
  // upholstery: a fine weave, light grey linen
  const fabric = color => mat('fab' + color, () => {
    const bump = tex('weave', 256, (g, S) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < S; i += 2) { g.fillStyle = `rgba(255,255,255,${i % 4 ? .12 : .05})`; g.fillRect(i, 0, 1, S); g.fillStyle = `rgba(0,0,0,${i % 4 ? .1 : .04})`; g.fillRect(0, i, S, 1); }
      noise(g, S, 9000, .15, 51);
    }, [14, 14], false);
    return new T.MeshPhysicalMaterial({ color: new T.Color(color), roughness: .95, sheen: .8, sheenRoughness: .6,
      sheenColor: new T.Color(color).lerp(new T.Color('#ffffff'), .4), bumpMap: bump, bumpScale: .6 });
  });
  const steel = () => mat('steel', () => new T.MeshStandardMaterial({ color: '#232427', roughness: .42, metalness: .75 }));
  const linen = () => mat('shade', () => new T.MeshPhysicalMaterial({ color: '#f1ede4', roughness: .9, transmission: .35, thickness: .01,
    side: T.DoubleSide, emissive: new T.Color('#fff3d6'), emissiveIntensity: 0 }));
  const sheer = () => mat('sheer', () => {
    const alpha = tex('sheer', 256, (g, S) => { g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, S, S);
      for (let x = 0; x < S; x += 2) { g.fillStyle = `rgba(255,255,255,${.1 + .08 * Math.sin(x * .35)})`; g.fillRect(x, 0, 1, S); } }, [4, 1], false);
    return new T.MeshPhysicalMaterial({ color: '#fbfaf6', roughness: .9, transparent: true, opacity: .72, alphaMap: alpha, side: T.DoubleSide,
      transmission: .2, depthWrite: false });
  });
  const clay = () => mat('clay', () => new T.MeshStandardMaterial({ color: '#b5653c', roughness: .85,
    bumpMap: tex('clayb', 256, (g, S) => { g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); noise(g, S, 9000, .3, 61); }, [2, 2], false), bumpScale: .5 }));
  const plain = (color, rough = .6, metal = 0) => mat(`pl${color}${rough}${metal}`, () => new T.MeshStandardMaterial({ color: new T.Color(color), roughness: rough, metalness: metal }));

  // ----- art for the frames -----
  function printDraw(kind, seed) {
    return (g, S) => {
      const r = rng(seed), W = S, H = S;
      if (kind === 'mountains') {
        const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#b9a6c4'); sky.addColorStop(.55, '#8d86ad'); sky.addColorStop(1, '#4d5d86');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        // faint triangles over the sky, the way a geometric print breaks it up
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * .05})`; g.beginPath(); const x = r() * W, y = r() * H * .6, s = 40 + r() * 120;
          g.moveTo(x, y - s); g.lineTo(x + s, y + s * .7); g.lineTo(x - s, y + s * .7); g.fill(); }
        for (const [y, c, n] of [[.55, '#5f6f9a', 5], [.66, '#3e4f7c', 7], [.78, '#2a3a63', 9], [.9, '#1d2a4c', 12]]) {
          g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
          for (let i = 0; i <= n; i++) { const x = i / n * W; g.lineTo(x - W / n / 2, H * y + (r() - .5) * 20); g.lineTo(x, H * (y - .14 - r() * .1)); }
          g.lineTo(W, H); g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(W * .47, H * .44); g.lineTo(W * .5, H * .38); g.lineTo(W * .53, H * .44); g.lineTo(W * .5, H * .42); g.fill();
        return;
      }
      // botanical: warm ground, a big leaf or a fern, dots and a blob, the way a modern print is
      const grounds = [['#d9a14f', '#e7b764'], ['#e8c25a', '#d58c4a'], ['#f0d58a', '#cf8f55']][seed % 3];
      g.fillStyle = grounds[0]; g.fillRect(0, 0, W, H);
      g.fillStyle = grounds[1]; g.beginPath(); g.ellipse(W * (.4 + r() * .3), H * (.35 + r() * .2), W * .3, H * .38, r(), 0, 7); g.fill();
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,250,235,${.15 + r() * .4})`; g.beginPath(); g.arc(r() * W, r() * H * .6, 2 + r() * 6, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(W * .3, H * .5, W * .1, H * .14, .3, 0, 7); g.fill();
      const leaf = (x, y, len, a, col) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(0, 0);
        g.quadraticCurveTo(len * .35, -len * .28, len, 0); g.quadraticCurveTo(len * .35, len * .28, 0, 0); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * .95, 0); g.stroke(); g.restore(); };
      if (seed % 3 === 1) { // a split monstera leaf
        g.save(); g.translate(W * .52, H * .62); g.fillStyle = '#1f6b56'; g.beginPath(); g.ellipse(0, 0, W * .26, H * .2, -.5, 0, 7); g.fill();
        g.strokeStyle = grounds[0]; g.lineWidth = 9; for (let i = -4; i <= 4; i++) { if (!i) continue; g.beginPath(); g.moveTo(0, 0); g.lineTo(i * W * .06, -H * .2 + Math.abs(i) * 8); g.stroke(); }
        g.restore(); g.fillStyle = '#4ea6b8'; g.beginPath(); g.arc(W * .62, H * .82, W * .05, 0, 7); g.fill();
      } else if (seed % 3 === 2) { // a plant in a bowl
        g.fillStyle = '#b8743c'; g.beginPath(); g.arc(W * .5, H * .78, W * .12, 0, Math.PI); g.fill();
        for (let i = 0; i < 7; i++) leaf(W * .5, H * .78, H * (.3 + r() * .2), -Math.PI / 2 + (i - 3) * .28, i % 2 ? '#3d8a5a' : '#5aa36a');
      } else { // a fern frond, leaves either side of a stem
        g.strokeStyle = '#2f6b47'; g.lineWidth = 4; g.beginPath(); g.moveTo(W * .3, H * .9); g.quadraticCurveTo(W * .45, H * .5, W * .62, H * .12); g.stroke();
        for (let i = 0; i < 16; i++) { const f = i / 16, x = W * (.3 + .32 * f), y = H * (.9 - .78 * f);
          leaf(x, y, W * .2 * (1 - f * .6), -Math.PI / 2 - .9, '#2f7a52'); leaf(x, y, W * .2 * (1 - f * .6), -Math.PI / 2 + .9, '#3d8a5a'); }
        leaf(W * .55, H * .7, W * .3, -.3, '#2c7a5b');
      }
      noise(g, S, 12000, .08, seed); // the grain of printed paper
    };
  }

  // ----- the pieces -----
  const P2 = (P, k, d) => num(P[k], d);
  const built = (P, key, make) => {
    const parts = once(key, make), g = new T.Group();
    // both sides of every face cast shadow: a wall or a ceiling seen edge-on by a low sun otherwise lets a band through
    for (const [geo, m] of parts) { if (!m.transparent) m.shadowSide = T.DoubleSide; const mesh = new T.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
    g.scale.setScalar(M); return g;
  };

  // a room: its floor at 0, centred on where it is placed; size is [width, height, depth]
  World.custom.room = P => {
    const [w, h, d] = (P.size || [5.2, 2.7, 6.6]).map(Number), wall = P.wall || '#ece9e2', accent = P.accent || '#e9dcc8';
    const paper = P.paper || '#8f9a6a', key = ['room', w, h, d, wall, accent, paper, P.paperWall, P.window].join('|');
    const g = built(P, key, () => {
      const out = [], t = .4;   // thick walls and ceiling, so the sun's shadow has no seam to leak through
      out.push([at(new T.PlaneGeometry(w, d), 0, 0, 0, 0, -Math.PI / 2), planks()]);
      planks().map.repeat.set(w / 1.6, d / 1.6);
      // the ceiling a slab over the tops of the walls, so no sun gets in where they meet
      out.push([box(w + 2 * t, t, d + 2 * t, 0, h + t / 2, 0), paint('#f4f3ef')]);
      // the walls, each a box so light does not leak through: back (far, -z), front (+z), left (-x), right (+x, with the window)
      out.push([box(w + 2 * t, h, t, 0, h / 2, -d / 2 - t / 2), paint(wall)]);
      out.push([box(w + 2 * t, h, t, 0, h / 2, d / 2 + t / 2), paint(wall)]);
      out.push([box(t, h, d, -w / 2 - t / 2, h / 2, 0), paint(accent)]);
      // the right wall, round a window 1.3 wide and 1.6 tall, a metre into the room from the back
      const wx = w / 2 + t / 2, fx = w / 2 + .03, wz = -d / 2 + 1.25, ww = 1.3, wy0 = .75, wy1 = 2.35;
      const right = P.paperWall === 'right' ? wallpaper(paper) : paint(wall);
      out.push([box(t, h, wz - ww / 2 + d / 2, wx, h / 2, (-d / 2 + wz - ww / 2) / 2), right]);
      out.push([box(t, h, d / 2 - (wz + ww / 2), wx, h / 2, (wz + ww / 2 + d / 2) / 2), right]);
      out.push([box(t, wy0, ww, wx, wy0 / 2, wz), right]);
      out.push([box(t, h - wy1, ww, wx, (wy1 + h) / 2, wz), right]);
      // the window's white frame, its sill and a glazing bar
      const frame = plain('#f2f1ec', .4);
      out.push([box(.06, .05, ww + .1, fx, wy0, wz), frame], [box(.16, .03, ww + .2, w / 2 - .02, wy0 - .02, wz), frame]);
      out.push([box(.06, .05, ww + .1, fx, wy1, wz), frame], [box(.06, wy1 - wy0, .05, fx, (wy0 + wy1) / 2, wz - ww / 2), frame]);
      out.push([box(.06, wy1 - wy0, .05, fx, (wy0 + wy1) / 2, wz + ww / 2), frame], [box(.04, wy1 - wy0, .03, fx, (wy0 + wy1) / 2, wz), frame]);
      // skirting all round, and a white door in the front wall
      const skirt = plain('#f3f2ee', .45);
      for (const [x, z, sw, sd] of [[0, -d / 2 + .01, w, .02], [0, d / 2 - .01, w, .02], [-w / 2 + .01, 0, .02, d], [w / 2 - .01, 0, .02, d]]) out.push([box(sw, .12, sd, x, .06, z), skirt]);
      const door = plain('#f5f4f0', .5);
      out.push([box(.86, 2.05, .04, w / 2 - .9, 1.025, d / 2 - .02), door], [box(.96, .06, .05, w / 2 - .9, 2.08, d / 2 - .025), skirt]);
      out.push([at(new T.SphereGeometry(.03, 12, 8), w / 2 - 1.22, 1.0, d / 2 - .08), plain('#c9c7c0', .3, .9)]);
      return out;
    });
    // the rest in the world's own units, beside the room's shell (which is built in metres and scaled up)
    const room = new T.Group(); room.add(g);
    // the curtain: a sheer panel in soft folds over the window, on a black rod
    const [ww, wz] = [1.3, -d / 2 + 1.25];
    const cg = new T.PlaneGeometry(ww * 1.1, 2.0, 60, 4), cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 22) * .035 + Math.sin(cp.getX(i) * 7.3) * .02);
    cg.computeVertexNormals(); cg.rotateY(-Math.PI / 2);
    const cur = new T.Mesh(cg, sheer()); cur.position.set((w / 2 - .14) * M, 1.42 * M, wz * M); cur.scale.setScalar(M); cur.userData.noShadow = true;
    const rod = new T.Mesh(at(new T.CylinderGeometry(.012, .012, ww + .5, 10), 0, 0, 0, 0, Math.PI / 2), steel());
    rod.position.set((w / 2 - .14) * M, 2.45 * M, wz * M); rod.scale.setScalar(M);
    room.add(cur, rod);
    // the light a room has from its walls and ceiling: what the sun through the window bounces round it
    const fill = clamp(num(P.fill, 60), 0, 300) / 100;
    if (fill > 0) {
      const sky = new T.HemisphereLight('#fff6ea', '#c9b59a', fill * .9); sky.position.set(0, h * M, 0); room.add(sky);
      const bounce = new T.PointLight('#ffe9cc', fill * 20, 9 * M, 1.4); bounce.position.set((w / 2 - 1.2) * M, 1.4 * M, wz * M); bounce.castShadow = false; room.add(bounce);
      // the daylight from the window itself, the sky seen through it: a broad, soft light from the window's place
      // across the room, falling off away from it, its shadows soft-edged as a big window's are
      const day = new T.SpotLight('#f3f6ff', fill * 400, 12 * M, deg(62), 1, 1.2);
      day.position.set((w / 2 - .05) * M, 1.75 * M, wz * M); day.target.position.set(-w / 2 * M, .3 * M, (wz + .9) * M);
      day.castShadow = true; day.shadow.mapSize.set(1024, 1024); day.shadow.radius = 9; day.shadow.blurSamples = 16;
      day.shadow.bias = -.0002; day.shadow.normalBias = .02 * M; day.shadow.camera.near = .05 * M; day.shadow.camera.far = 12 * M;
      room.add(day, day.target);
      // a little of the sky off the far wall, back into the room: the side the window does not reach is not black
      const back = new T.PointLight('#fff3e2', fill * 10, 8 * M, 1.6); back.position.set(-w / 4 * M, 2.2 * M, (d / 2 - 1) * M); room.add(back);
    }
    return room;
  };

  // a sofa: base, arms, seat and back cushions, on short metal feet. size [width, height, depth]; seats: how many
  World.custom.sofa = P => {
    const [w, h, d] = (P.size || [2.1, .82, .92]).map(Number), seats = clamp(num(P.seats, 2), 1, 4), color = P.color || '#dcdad5';
    return built(P, ['sofa', w, h, d, seats, color].join('|'), () => {
      const f = fabric(color), arm = .16, base = .2, foot = .07, inner = w - 2 * arm, out = [];
      out.push([at(rbox(w, base, d, .04), 0, foot + base / 2, 0), f]);
      for (const s of [-1, 1]) out.push([at(rbox(arm, .58, d, .07), s * (w / 2 - arm / 2), foot + .29, 0), f]);
      out.push([at(rbox(inner, h - foot - base, .2, .06), 0, foot + base + (h - foot - base) / 2, -d / 2 + .1), f]);
      const cw = inner / seats;
      for (let i = 0; i < seats; i++) {
        const x = -inner / 2 + cw * (i + .5);
        out.push([at(cushion(cw - .01, .16, d - .28, .18, .06), x, foot + base + .08, .06), f]);
        // back cushions lean back a little, with a tufted seam
        out.push([at(cushion(cw - .02, .5, .2, .12, .07), x, foot + base + .33, -d / 2 + .24, 0, -.14), f]);
      }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push([box(.05, foot, .05, x * (w / 2 - .08), foot / 2, z * (d / 2 - .08)), steel()]);
      return out;
    });
  };

  // a coffee table (or a console behind a sofa, or a side table): an oak top on a black steel frame, a shelf below
  World.custom.table = P => {
    const [w, h, d] = (P.size || [1.2, .42, .65]).map(Number), shelf = P.shelf !== false;
    return built(P, ['table', w, h, d, shelf, P.wood].join('|'), () => {
      const out = [], top = .045, leg = .035;
      out.push([at(rbox(w, top, d, .006, 2), 0, h - top / 2, 0), oak(P.wood || 'pale')]);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push([box(leg, h - top, leg, x * (w / 2 - leg / 2 - .02), (h - top) / 2, z * (d / 2 - leg / 2 - .02)), steel()]);
      for (const y of [h - top - .02, .12]) { out.push([box(w - .04, .025, .025, 0, y, d / 2 - .03), steel()], [box(w - .04, .025, .025, 0, y, -d / 2 + .03), steel()]);
        out.push([box(.025, .025, d - .04, w / 2 - .03, y, 0), steel()], [box(.025, .025, d - .04, -w / 2 + .03, y, 0), steel()]); }
      if (shelf) out.push([box(w - .08, .025, d - .08, 0, .14, 0), oak(P.wood || 'mid')]);
      return out;
    });
  };

  // a low TV unit: an open oak box, a divider, a few books in it
  World.custom.tvunit = P => {
    const [w, h, d] = (P.size || [1.7, .42, .42]).map(Number);
    return built(P, ['tvunit', w, h, d].join('|'), () => {
      const o = oak('pale'), t = .04, out = [];
      out.push([box(w, t, d, 0, h - t / 2, 0), o], [box(w, t, d, 0, t / 2 + .02, 0), o], [box(t, h, d, -w / 2 + t / 2, h / 2, 0), o], [box(t, h, d, w / 2 - t / 2, h / 2, 0), o]);
      out.push([box(w - 2 * t, h - 2 * t, .01, 0, h / 2, -d / 2 + .005), o]);
      for (const [g2, m] of books(5, .14, h - 2 * t - .04, d - .08, 11)) out.push([at(g2, -w / 2 + .12, t + .02, 0), m]);
      out.push([at(rbox(.32, .04, .24, .01), w / 2 - .4, t + .04, 0), plain('#2c2d30', .5)]);
      return out;
    });
  };

  // a run of books standing in a row from x=0, N of them, as wide as WIDE at most
  function books(n, wide, tall, deep, seed) {
    const r = rng(seed), out = [], cols = ['#e9e4d8', '#2f3f5a', '#c6a542', '#7c8b6a', '#b9413a', '#d8d2c2', '#3f5f4a', '#26272b', '#efe9da', '#8a6d4b'];
    let x = 0;
    for (let i = 0; i < n && x < wide + .5; i++) {
      const t = .018 + r() * .03, h2 = tall * (.75 + r() * .25), d2 = deep * (.8 + r() * .2);
      out.push([box(t, h2, d2, x + t / 2, h2 / 2, 0), plain(cols[(r() * cols.length) | 0], .7)]); x += t + .002;
    }
    return out;
  }

  // a TV, on a foot, its screen off: deep black glass with the room in it
  World.custom.tv = P => {
    const size = num(P.inches, 55), w = size * .0254 * .87, h = size * .0254 * .49;
    return built(P, ['tv', size].join('|'), () => [
      [box(w, h, .03, 0, h / 2 + .09, 0), plain('#121315', .35, .2)],
      [box(w - .02, h - .02, .002, 0, h / 2 + .09, .016), mat('screen', () => new T.MeshPhysicalMaterial({ color: '#050607', roughness: .05, clearcoat: 1, clearcoatRoughness: .02 }))],
      [box(.08, .09, .05, 0, .045, 0), plain('#1a1b1d', .4)], [at(rbox(.36, .015, .22, .006), 0, .008, 0), plain('#1a1b1d', .4)],
    ]);
  };

  // a floor lamp (height 1.6) or a table lamp (tall 0.5), a linen drum shade over a warm bulb
  World.custom.lamp = P => {
    const floor = P.kind !== 'table', H = floor ? num(P.tall, 1.62) : num(P.tall, .55), power = clamp(num(P.power, 0), 0, 400) / 100;
    const g = built(P, ['lamp', floor, H].join('|'), () => {
      const out = [], sw = floor ? .36 : .34, sh = floor ? .3 : .26;
      out.push([at(new T.CylinderGeometry(floor ? .13 : .11, floor ? .14 : .12, .02, 32), 0, .01, 0), floor ? steel() : plain('#3a2a20', .6)]);
      out.push([at(new T.CylinderGeometry(.012, .012, H - sh * .6, 12), 0, (H - sh * .6) / 2, 0), steel()]);
      const shade = new T.CylinderGeometry(sw * .42, sw / 2, sh, 48, 1, true); out.push([at(shade, 0, H - sh / 2, 0), linen()]);
      return out;
    });
    if (power > 0) { const l = new T.PointLight('#ffd9a0', power * 4, 6 * M, 1.6); l.position.set(0, (H - .18) * M, 0); l.castShadow = false; g.add(l);
      g.traverse(x => { if (x.isMesh && x.material === linen()) { x.material = x.material.clone(); x.material.emissiveIntensity = .6 * power; } }); }
    return g;
  };

  // an open bookcase: oak boxes stacked off-centre, carried on four steel poles, books and a box or two on its shelves
  World.custom.bookcase = P => {
    const [w, h, d] = (P.size || [1.1, 2.0, .36]).map(Number);
    return built(P, ['bookcase', w, h, d, P.seed].join('|'), () => {
      const o = oak('pale'), t = .03, out = [], r = rng(num(P.seed, 3));
      const shelves = [[0, .5, 0], [.52, .5, .28], [1.12, .42, 0], [1.6, .4, .3]];
      for (const [y, bh, off] of shelves) {
        if (y + bh > h) break;
        const bw = w * .78, x = -w / 2 + bw / 2 + off * (w - bw) / .3 * .5;
        out.push([box(bw, t, d, x, y + t / 2, 0), o], [box(bw, t, d, x, y + bh - t / 2, 0), o], [box(t, bh, d, x - bw / 2 + t / 2, y + bh / 2, 0), o], [box(t, bh, d, x + bw / 2 - t / 2, y + bh / 2, 0), o]);
        const n = 4 + (r() * 9 | 0);
        for (const [g2, m] of books(n, bw * .55, bh - t * 2 - .03, d * .8, (r() * 1e6) | 0)) out.push([at(g2, x - bw / 2 + .05 + r() * .1, y + t, 0), m]);
        if (r() < .7) for (let k = 0; k < 2; k++) out.push([box(.24, .03, .17, x + bw / 2 - .2, y + t + .015 + k * .032, 0), plain(['#5f6b52', '#a08566', '#d9d4c7'][k + (r() * 2 | 0)], .7)]);
      }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push([box(.028, h, .028, x * (w / 2 - .02), h / 2, z * (d / 2 - .02)), steel()]);
      return out;
    });
  };

  // a framed print: art of a kind (botanical, mountains), a pale oak frame and a white mount
  World.custom.print = P => {
    const [w, h] = (P.size || [.5, .7]).map(Number), kind = P.art || 'botanical', seed = num(P.seed, 1);
    return built(P, ['print', w, h, kind, seed].join('|'), () => {
      const art = mat(`art${kind}${seed}`, () => new T.MeshStandardMaterial({ map: tex(`art${kind}${seed}`, 512, printDraw(kind, seed)), roughness: .8 }));
      const fw = .025;
      return [[box(w, h, .025, 0, 0, .0125), oak('pale')], [box(w - fw * 2, h - fw * 2, .002, 0, 0, .026), plain('#f6f4ee', .9)],
        [at(new T.PlaneGeometry(w - fw * 2 - .05, h - fw * 2 - .05), 0, 0, .0275), art]];
    });
  };

  // a rug: a soft slab, blue-grey with a pale lattice of crosses
  World.custom.rug = P => {
    const [w, , d] = (P.size || [2.2, .01, 1.6]).map(Number), color = P.color || '#7d8ba6';
    return built(P, ['rug', w, d, color].join('|'), () => {
      const map = tex('rug' + color, 512, (g, S) => {
        g.fillStyle = color; g.fillRect(0, 0, S, S); noise(g, S, 50000, .18, 71);
        g.strokeStyle = 'rgba(235,236,240,.55)'; g.lineWidth = 3;
        for (let i = 0; i < 10; i++) for (let j = 0; j < 8; j++) { const x = (i + .5) * S / 10, y = (j + .5) * S / 8, s = 9;
          g.beginPath(); g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s); g.stroke(); }
        g.strokeStyle = 'rgba(235,236,240,.45)'; g.lineWidth = 6; g.strokeRect(14, 14, S - 28, S - 28);
      });
      return [[at(rbox(w, .012, d, .004, 2), 0, .006, 0), mat('rugm' + color, () => new T.MeshStandardMaterial({ map, roughness: 1,
        bumpMap: tex('rugb', 256, (g, S) => { g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); noise(g, S, 30000, .35, 72); }, [6, 6], false), bumpScale: .8 }))]];
    });
  };

  // a scatter cushion, square and plump, in a colour
  World.custom.pillow = P => {
    const s = num(P.size?.[0], .45), color = P.color || '#1d6b5c';
    return built(P, ['pillow', s, color].join('|'), () => [[at(cushion(s, .14, s, .55, .06), 0, 0, 0, 0, Math.PI / 2), fabric(color)]]);
  };

  // a succulent in a clay pot: thick pointed leaves in a rosette
  World.custom.plant = P => built(P, ['plant', P.seed].join('|'), () => {
    const r = rng(num(P.seed, 4)), out = [[at(new T.CylinderGeometry(.075, .06, .13, 32, 1), 0, .065, 0), clay()],
      [at(new T.CylinderGeometry(.082, .082, .025, 32), 0, .13, 0), clay()], [at(new T.CylinderGeometry(.07, .07, .01, 24), 0, .12, 0), plain('#3a2a1e', 1)]];
    const leafM = mat('leaf', () => new T.MeshPhysicalMaterial({ color: '#5c8f62', roughness: .55, sheen: .4, sheenColor: new T.Color('#b8d6b0') }));
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8 + ring * 2; i++) {
      const g = new T.ConeGeometry(.018, .16 - ring * .03, 6); g.translate(0, (.16 - ring * .03) / 2, 0); g.scale(1, 1, .45);
      g.rotateX(deg(70 - ring * 22 + r() * 8)); g.rotateY(i / (8 + ring * 2) * Math.PI * 2 + ring * .4); g.translate(0, .135, 0); out.push([g, leafM]);
    }
    return out;
  });

  // an open book lying flat, its pages fanned a little
  World.custom.book = P => built(P, 'book', () => {
    const pages = new T.PlaneGeometry(.17, .23, 12, 1), p = pages.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(Math.abs(p.getX(i)) / .17 * Math.PI) * .012);
    pages.computeVertexNormals(); const a = pages.clone(); a.translate(.085, 0, 0); const b = pages.clone(); b.translate(-.085, 0, 0);
    return [[at(merge([a, b]), 0, .012, 0, 0, -Math.PI / 2), plain('#f8f6f0', .85)], [box(.35, .008, .24, 0, .004, 0), plain('#e8e4da', .7)]];
  });

  // Indoors, the sky's own light does not reach every corner the way it does outdoors: the walls keep it out but for
  // the window. With a room in the world, the sky lights only a little from everywhere, and the sun through the
  // window, the room's own bounce and its lamps do the rest.
  World.stageHooks.push(({ B, o }) => {
    const inside = Array.isArray(o.objects) && o.objects.some(P => P && P.type === 'room' && !P.hidden);
    if (!inside) { if (B.wasEnv != null) { B.scene.environmentIntensity = B.wasEnv; B.sun.shadow.bias = B.wasBias; B.wasEnv = null; } return; }
    if (B.wasEnv == null) { B.wasEnv = B.scene.environmentIntensity ?? 1; B.wasBias = B.sun.shadow.bias; }
    B.scene.environmentIntensity = .14; B.hemi.intensity *= .15;
    // the sun's shadow held close to what casts it: outdoors a looser one hides acne on the ground, but indoors it
    // lets low sun slip through where a wall meets the ceiling and draws a bright band along the far wall
    B.sun.shadow.bias = -.00003;
  });

  World.PARTS.push('room', 'sofa', 'table', 'tvunit', 'tv', 'lamp', 'bookcase', 'print', 'rug', 'pillow', 'plant', 'book');
  SceneEd.add('room', { type: 'room', size: [5.2, 2.7, 6.6], wall: '#ece9e2', accent: '#e9dcc8', paper: '#8f9a6a', paperWall: '', fill: 60 }, 'Room');
  SceneEd.add('sofa', { type: 'sofa', size: [2.1, .82, .92], seats: 2, color: '#dcdad5' }, 'Sofa');
  SceneEd.add('table', { type: 'table', size: [1.2, .42, .65] }, 'Coffee table');
  SceneEd.add('tvunit', { type: 'tvunit', size: [1.7, .42, .42] }, 'TV unit');
  SceneEd.add('tv', { type: 'tv', inches: 55 }, 'TV');
  SceneEd.add('lamp', { type: 'lamp', kind: 'floor', power: 0 }, 'Lamp');
  SceneEd.add('bookcase', { type: 'bookcase', size: [1.1, 2.0, .36], seed: 3 }, 'Bookcase');
  SceneEd.add('print', { type: 'print', size: [.5, .7], art: 'botanical', seed: 1 }, 'Framed print');
  SceneEd.add('rug', { type: 'rug', size: [2.2, .01, 1.6], color: '#7d8ba6' }, 'Rug');
  SceneEd.add('pillow', { type: 'pillow', size: [.45, .45, .14], color: '#1d6b5c' }, 'Cushion');
  SceneEd.add('plant', { type: 'plant', seed: 4 }, 'Plant');
  SceneEd.add('book', { type: 'book' }, 'Open book');

  // ----- a scene to start from: a bright living room, the sun coming in through a sheer curtain -----
  // As a room is photographed for a listing: a wide lens from the doorway end, looking down the room to the TV wall,
  // the sofa's back and the console in the foreground, prints on the left wall, the window and shelves on the right.
  const W = 5.0, D = 5.6, z0 = -D / 2;
  World.PRESETS.livingroom = { label: 'Living room', hint: 'A bright, lived-in living room: sofas, oak and steel, prints, plants, the sun through a sheer curtain',
    p: { sky: 'day', sunEl: 15, sunAz: 100, sunPower: 150, clouds: 20, wind: 0, ground: 'none', fog: 0, haze: 0, dust: 6, eye: 1.55, heading: 0,
      pitch: -6, travel: 0, lens: 17, focus: 0, dof: 0, exposure: .3, bloom: 10, grain: 6, fringe: 3, ao: 70, streaks: 0, flare: 0, godrays: 0,
      letterbox: 'none', shutter: 0, render: 'preview' },
    objects: () => [
      { type: 'room', name: 'Room', at: [0, 0, 0], size: [W, 2.7, D], wall: '#eceae4', accent: '#ebdfcb', paper: '#8f9a6a', paperWall: '', fill: 75 },
      // the TV wall, at the far end
      { type: 'tvunit', name: 'TV unit', at: [0, 0, z0 + .23], size: [1.75, .42, .42] },
      { type: 'tv', name: 'TV', at: [0, .42, z0 + .2], inches: 65 },
      { type: 'print', name: 'Mountain print', at: [0, 1.95, z0 + .01], size: [1.15, .72], art: 'mountains', seed: 2 },
      { type: 'lamp', name: 'Floor lamp', at: [-1.7, 0, z0 + .35], kind: 'floor' },
      { type: 'lamp', name: 'Floor lamp', at: [1.75, 0, z0 + .35], kind: 'floor' },
      // the left wall: three botanical prints, a loveseat, a side table with a lamp
      ...[0, 1, 2].map(i => ({ type: 'print', name: 'Print', at: [-W / 2 + .01, 1.65, -1.25 + i * 1.0], turn: [0, 90, 0], size: [.62, .85], art: 'botanical', seed: i + 3 })),
      { type: 'sofa', name: 'Loveseat', at: [-1.85, 0, -.75], turn: [0, 90, 0], size: [1.55, .82, .9], seats: 1, color: '#e3e1dc' },
      { type: 'pillow', name: 'Cushion', at: [-2.0, .58, -.25], turn: [0, 70, 12], color: '#1d6b5c' },
      { type: 'table', name: 'Side table', at: [-1.95, 0, .5], size: [.55, .55, .55] },
      { type: 'lamp', name: 'Table lamp', at: [-1.95, .55, .5], kind: 'table' },
      // the middle: rug, coffee table, a plant and an open book on it
      { type: 'rug', name: 'Rug', at: [.05, 0, -1.0], size: [2.4, .01, 1.8], color: '#7b88a4' },
      { type: 'table', name: 'Coffee table', at: [.05, 0, -1.25], size: [1.25, .42, .7] },
      { type: 'plant', name: 'Plant', at: [-.15, .42, -1.3], seed: 4 },
      { type: 'book', name: 'Open book', at: [.25, .42, -1.12], turn: [0, -18, 0] },
      // the sofa facing the TV, its back to us, and the console behind it
      { type: 'sofa', name: 'Sofa', at: [.1, 0, .35], turn: [0, 180, 0], size: [2.25, .82, .95], seats: 2, color: '#dcdad5' },
      { type: 'pillow', name: 'Cushion', at: [-.78, .62, .58], turn: [0, 200, -10], color: '#1d6b5c' },
      { type: 'table', name: 'Console', at: [.1, 0, 1.12], size: [1.75, .72, .4], shelf: false },
      // the right wall: the bookcase by the window
      { type: 'bookcase', name: 'Bookcase', at: [W / 2 - .24, 0, -.05], turn: [0, -90, 0], size: [1.2, 2.05, .36], seed: 5 },
      { type: 'camera', id: 'cam', name: 'From the door', at: [0, 1.55, D / 2 - .45], turn: [-6, 0, 0], lens: 17 },
    ],
    shots: [{ t: 0, cam: 'cam' }] };

  return { rbox, cushion, printDraw };
})();
