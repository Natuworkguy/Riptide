// ---------- architecture: a coffered dome, and the sun let in through an opening ----------
// A coffered dome is the inside of a sphere cut into rows of sunken panels, each stepped back in rings, the steps
// set deeper at the bottom than the top so they read from below. A sunbeam is the sun through one opening (an
// oculus, a window): a hard, nearly parallel shaft that throws a bright disc and crisp shadows. Both in metres.
const Arch = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), deg = v => v * Math.PI / 180;
  const cache = new Map(), once = (k, make) => cache.get(k) || (cache.set(k, make()), cache.get(k));
  const num = (v, d) => (v == null || v === '' || Number.isNaN(+v) ? d : +v);

  // ----- a coffered dome -----
  // Built in the dome's own angles: AZ round it, EL up it (radians), D how far behind the dome's face (metres).
  // The viewer stands at its centre and faces -z, so the panels face inwards.
  function coffers(o) {
    const R = clamp(num(o.radius, 21.6), 2, 200), rows = clamp(Math.round(num(o.rows, 5)), 1, 12), cols = clamp(Math.round(num(o.cols, 9)), 1, 40);
    const span = deg(clamp(num(o.span, 120), 10, 360)), el0 = deg(clamp(num(o.from, 8), -30, 80)), el1 = deg(clamp(num(o.to, 62), -20, 89));
    const steps = clamp(Math.round(num(o.steps, 4)), 1, 6), depth = clamp(num(o.depth, .9), .05, 5), rib = clamp(num(o.rib, .7), .05, 5);
    const pos = [], uv = [], sub = 3;
    const at = (az, el, d) => { const r = R + d, c = Math.cos(el); return [r * c * Math.sin(az), r * Math.sin(el), -r * c * Math.cos(az)]; };
    // one four-sided patch between corners (az, el, d), split finer so it follows the curve
    const patch = (a, b, c, e) => {
      const P = (u, v) => [0, 1, 2].map(i => (1 - u) * (1 - v) * a[i] + u * (1 - v) * b[i] + u * v * c[i] + (1 - u) * v * e[i]);
      for (let i = 0; i < sub; i++) for (let j = 0; j < sub; j++) {
        const q = [P(i / sub, j / sub), P((i + 1) / sub, j / sub), P((i + 1) / sub, (j + 1) / sub), P(i / sub, (j + 1) / sub)];
        for (const k of [0, 1, 2, 0, 2, 3]) { const [az, el, d] = q[k]; pos.push(...at(az, el, d)); uv.push(az * R / 1.6, el * R / 1.6); }
      }
    };
    const rowH = (el1 - el0) / rows, colW = span / cols, ribA = rib / R;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const az0 = -span / 2 + c * colW, az1 = az0 + colW, e0 = el0 + r * rowH, e1 = e0 + rowH;
      // the coffers shrink in width as the dome closes in, as real ones do: their panels are sized by the arc at their height
      const shrink = Math.cos((e0 + e1) / 2), w = colW * Math.max(.3, shrink);
      // each ring of the step: its inset from the cell's edge at that step (angles), the bottom set in most
      const ring = k => { const s = k / steps, side = ribA / 2 / Math.max(.3, shrink) + s * (w * .24), top = ribA / 2 + s * rowH * .16, bot = ribA / 2 + s * rowH * .32;
        return { a0: az0 + side, a1: az1 - side, b0: e0 + bot, b1: e1 - top, d: depth * k / steps }; };
      const O = { a0: az0, a1: az1, b0: e0, b1: e1, d: 0 };
      const frame = (A, B, d) => {   // the flat band between rectangle A (outer) and B (inner), at depth d
        patch([A.a0, A.b0, d], [A.a1, A.b0, d], [B.a1, B.b0, d], [B.a0, B.b0, d]);
        patch([B.a0, B.b1, d], [B.a1, B.b1, d], [A.a1, A.b1, d], [A.a0, A.b1, d]);
        patch([A.a0, A.b0, d], [B.a0, B.b0, d], [B.a0, B.b1, d], [A.a0, A.b1, d]);
        patch([B.a1, B.b0, d], [A.a1, A.b0, d], [A.a1, A.b1, d], [B.a1, B.b1, d]);
      };
      const wall = (A, d0, d1) => {   // the step's riser: rectangle A from depth d0 back to d1
        patch([A.a0, A.b0, d0], [A.a1, A.b0, d0], [A.a1, A.b0, d1], [A.a0, A.b0, d1]);
        patch([A.a1, A.b1, d0], [A.a0, A.b1, d0], [A.a0, A.b1, d1], [A.a1, A.b1, d1]);
        patch([A.a0, A.b1, d0], [A.a0, A.b0, d0], [A.a0, A.b0, d1], [A.a0, A.b1, d1]);
        patch([A.a1, A.b0, d0], [A.a1, A.b1, d0], [A.a1, A.b1, d1], [A.a1, A.b0, d1]);
      };
      frame(O, ring(0), 0);
      for (let k = 0; k < steps; k++) { const A = ring(k), B = ring(k + 1); wall(A, A.d, B.d); frame(A, B, B.d); }
      const L = ring(steps); patch([L.a0, L.b0, L.d], [L.a1, L.b0, L.d], [L.a1, L.b1, L.d], [L.a0, L.b1, L.d]);
    }
    // the plain band of dome under the coffers and the one over them
    const band = (b0, b1) => { const n = 24; for (let i = 0; i < n; i++) { const a = -span / 2 + span * i / n, b = a + span / n; patch([a, b0, 0], [b, b0, 0], [b, b1, 0], [a, b1, 0]); } };
    band(Math.max(-.2, el0 - deg(10)), el0); band(el1, Math.min(deg(89), el1 + deg(12)));
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    return g;
  }
  // stone: old plaster over brick, a little yellow, pitted and stained, rough
  function stone(color) {
    return once('stone' + color, () => {
      const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
      const hc = document.createElement('canvas'); hc.width = hc.height = S; const h = hc.getContext('2d');
      let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      g.fillStyle = '#b8b0a0'; g.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
      for (let i = 0; i < 260; i++) { const x = r() * S, y = r() * S, rad = 6 + r() * 60, v = r();
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, v < .5 ? `rgba(70,62,48,${.04 + r() * .05})` : `rgba(255,248,230,${.04 + r() * .06})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      // pits and scratches: dark in colour, low in height
      for (let i = 0; i < 9000; i++) { const x = r() * S, y = r() * S, w = 1 + r() * 2.5; const v = 40 + r() * 70;
        g.fillStyle = `rgba(${v},${v - 6},${v - 14},${.25 + r() * .35})`; g.fillRect(x, y, w, w * (.5 + r())); h.fillStyle = `rgba(0,0,0,${.3 + r() * .4})`; h.fillRect(x, y, w, w); }
      for (let i = 0; i < 400; i++) { const x = r() * S, y = r() * S, a = r() * Math.PI, l = 4 + r() * 18; h.strokeStyle = 'rgba(0,0,0,.35)'; h.lineWidth = 1;
        h.beginPath(); h.moveTo(x, y); h.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); h.stroke(); }
      for (let i = 0; i < 20000; i++) { const v = r() * 255; h.fillStyle = `rgba(${v},${v},${v},.12)`; h.fillRect(r() * S, r() * S, 1.5, 1.5); }
      const map = new T.CanvasTexture(cv), bump = new T.CanvasTexture(hc); map.colorSpace = T.SRGBColorSpace;
      for (const t of [map, bump]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; }
      return new T.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.4, color: new T.Color(color), roughness: .95, metalness: 0, side: T.DoubleSide });
    });
  }
  World.custom.coffers = P => {
    const key = ['cof', P.radius, P.rows, P.cols, P.span, P.from, P.to, P.steps, P.depth, P.rib].join('|');
    const geo = once(key, () => coffers(P));
    const m = new T.Mesh(geo, stone(P.color || '#c9bfa4')); m.castShadow = m.receiveShadow = true;
    const g = new T.Group(); g.add(m); g.scale.setScalar(M);
    // the dim light that fills a dome from its opening and off its own walls: soft from everywhere, a little more from above
    const amb = clamp(num(P.ambient, 18), 0, 200) / 100, tint = new T.Color(P.ambientColor || '#5b6a5c');
    if (amb > 0) { const h = new T.HemisphereLight(tint, tint.clone().multiplyScalar(.35), amb * 1.6); const d = new T.DirectionalLight(tint, amb * 1.2);
      d.position.set(.2, 1, .35); d.castShadow = false; g.add(h, d, d.target); }
    return g;
  };

  // ----- a sunbeam: the sun through one opening -----
  // It shines along its own +z (turn it to aim), from where it is placed, and its size is the opening's: the disc
  // it throws is that wide wherever it lands, as the sun's rays are all but parallel. Soft is how blurred its edge is.
  World.custom.sunbeam = P => {
    const size = clamp(num(P.size?.[0], 8), .1, 200), reach = clamp(num(P.reach, 40), 1, 500), soft = clamp(num(P.soft, 6), 0, 100) / 100;
    const g = new T.Group();
    // a spot so far back along its own axis that its rays are nearly parallel, its cone exactly the opening wide at the target
    const back = reach * 6, angle = Math.atan((size / 2) / (back + reach));
    const l = new T.SpotLight(new T.Color(P.color || '#fff1d6'), clamp(num(P.power, 100), 0, 10000) / 100 * 9, 0, angle * (1 + soft * .5), soft, 0);
    l.position.set(0, 0, -back * M); l.target.position.set(0, 0, reach * M); g.add(l, l.target);
    l.castShadow = P.shadows !== false;
    l.shadow.mapSize.set(4096, 4096); l.shadow.bias = -.00012; l.shadow.normalBias = .02 * M; l.shadow.radius = 1 + soft * 6;
    l.shadow.camera.near = back * M * .9; l.shadow.camera.far = (back + reach * 2) * M;
    return g;
  };

  World.PARTS.push('coffers', 'sunbeam');
  SceneEd.add('coffers', { type: 'coffers', radius: 21.6, rows: 5, cols: 9, span: 120, from: 8, to: 62, steps: 4, depth: .9, rib: .7, color: '#c9bfa4' }, 'Coffered dome');
  SceneEd.add('sunbeam', { type: 'sunbeam', size: [8, 1, 1], reach: 40, soft: 6, power: 100, color: '#fff1d6' }, 'Sunbeam');
  SceneEd.extras.push({
    inspector(P) {
      const n = (k, label, v, step = 1) => `<label class="f"><span>${label}</span><input type="number" step="${step}" data-k="${k}" value="${v}"></label>`;
      if (P.type === 'coffers') return `<div class="hd">Coffered dome</div>${n('radius', 'Radius m', num(P.radius, 21.6), .5)}${n('rows', 'Rows', num(P.rows, 5))}${n('cols', 'Coffers a row', num(P.cols, 9))}
        ${n('span', 'Round it°', num(P.span, 120), 5)}${n('from', 'From height°', num(P.from, 8))}${n('to', 'To height°', num(P.to, 62))}${n('steps', 'Steps', num(P.steps, 4))}
        ${n('depth', 'Depth m', num(P.depth, .9), .05)}${n('rib', 'Ribs m', num(P.rib, .7), .05)}${n('ambient', 'Light in the shade %', num(P.ambient, 18))}
        <label class="f"><span>Shade colour</span><input type="color" data-k="ambientColor" value="${P.ambientColor || '#5b6a5c'}"></label>
        <label class="f"><span>Stone</span><input type="color" data-k="color" value="${P.color || '#c9bfa4'}"></label>
        <p class="note">You stand at its middle; it rises round you. Turn it to face where you want it.</p>`;
      if (P.type === 'sunbeam') return `<div class="hd">Sunbeam</div>${n('reach', 'Reach m', num(P.reach, 40))}${n('soft', 'Soft edge %', num(P.soft, 6))}${n('power', 'Power', num(P.power, 100), 10)}
        <label class="f"><span>Colour</span><input type="color" data-k="color" value="${P.color || '#fff1d6'}"></label>
        <p class="note">The sun through one opening: Size (width) is how wide the disc of light is. Turn it to aim it.</p>`;
      return '';
    },
  });

  // ----- a scene to start from: sun through the oculus on a coffered dome -----
  World.PRESETS.oculus = { label: 'Oculus', hint: 'Looking up into a coffered dome, a disc of sun on it from the opening at the top',
    p: { sky: 'studio', sunEl: 60, sunAz: 0, sunPower: 0, clouds: 0, wind: 0, ground: 'none', fog: 0, dust: 0, eye: 0, heading: 0, pitch: 0, travel: 0,
      lens: 50, focus: 0, dof: 0, exposure: 0, bloom: 12, grain: 22, fringe: 6, ao: 60, streaks: 0, flare: 0, godrays: 0, letterbox: 'none', render: 'preview' },
    objects: () => [
      { type: 'coffers', name: 'Dome', at: [0, 0, 0], radius: 21.6, rows: 5, cols: 9, span: 120, from: 6, to: 64, steps: 4, depth: .7, rib: .7, color: '#c9bfa4', ambient: 30, ambientColor: '#4f6e58' },
      // the sun comes down through the oculus at the top and lands on the far side, high up
      { type: 'sunbeam', name: 'Sun through the oculus', at: [0, 15, 8], turn: [181, 4, 0], size: [5.6, 1, 1], reach: 23, soft: 4, power: 140, color: '#fff0d2' },
      // what little light the disc throws back round the dome: a dim, green-grey fill
      { type: 'camera', id: 'cam', name: 'Looking up', at: [0, 0, 0], turn: [46, 0, -28], lens: 36 },
    ],
    shots: [{ t: 0, cam: 'cam' }] };
  return { coffers };
})();
