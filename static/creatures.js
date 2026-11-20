// ---------- creatures ----------
// Animals for a world layer, as props: a humpback whale for now. Its body is turned on a lathe from a profile
// (rounded head, the widest part a little ahead of the middle, a long tail stock), dark above and pale beneath with
// the grooves of its throat, long pale flippers, a small dorsal hump and wide flukes. Set "breach" to a time and it
// breaches then: up out of the water, rolling as it rises, and back down on its side and back, throwing a splash
// as it leaves the water and a bigger one as it lands. "rate" under 1 is slow motion, as whales are usually filmed.
(() => {
  const T = window.RiptideThree, M = World.M, deg = v => v * Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const LENGTH = 13;   // metres, nose to fluke notch
  let made = null;

  // r(u): the body's radius along it, u from the tail (0) to the nose (1), as a share of its length
  const radius = u => {
    if (u < .06) return .02 + u / .06 * .03;                      // the tail stock at the flukes
    if (u < .62) return .05 + Math.pow((u - .06) / .56, 1.6) * .075; // swelling towards the chest
    const f = (u - .62) / .38; return .125 * Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.6))) + .004; // the head, round at the nose
  };
  function body() {
    const pts = [], n = 64;
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push(new T.Vector2(Math.max(.001, radius(u)) * LENGTH, (u - .5) * LENGTH)); }
    const g = new T.LatheGeometry(pts, 72);
    // its length along z (nose forward), a little wider than deep, the belly flatter than the back
    g.rotateX(Math.PI / 2);
    const pos = g.attributes.position, col = [], dark = new T.Color('#1d2328'), pale = new T.Color('#c9cdcd'), grooveC = new T.Color('#9aa1a4');
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i); const z = pos.getZ(i), u = z / LENGTH + .5;
      x *= 1.12; if (y < 0) y *= .82; pos.setX(i, x); pos.setY(i, y);
      const ang = Math.atan2(y, x), under = clamp((-Math.sin(ang) - .05) / .55, 0, 1);
      // throat grooves: pale stripes running back from the jaw to the navel, underneath only
      const groove = u > .45 && u < .97 && under > .5 ? Math.pow(Math.max(0, Math.sin(ang * 46)), 6) * .35 : 0;
      const c = dark.clone().lerp(pale.clone().lerp(grooveC, groove), Math.pow(under, 1.5) * (u > .2 ? 1 : .6));
      // a mottled back: patches a shade lighter
      const mott = .5 + .5 * Math.sin(z * 2.1 + Math.cos(x * 3.3) * 2) * Math.sin(x * 1.7 + z * .9);
      c.offsetHSL(0, 0, (mott - .5) * .025);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    return g;
  }
  // a flipper: long and narrow, knobbed along its leading edge, pale
  function flipper() {
    const g = new T.SphereGeometry(1, 32, 12); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const along = (x + 1) / 2; // 0 at the body, 1 at the tip
      const w = .55 * (1 - along * .75) + .12 * Math.max(0, Math.sin(along * 22)) * (z > 0 ? 1 : 0);
      p.setXYZ(i, x * LENGTH * .16 + LENGTH * .16, y * .06 * (1 - along * .6), z * w); }
    g.computeVertexNormals(); return g;
  }
  function flukes() {
    const shape = new T.Shape(); const s = LENGTH * .13;
    shape.moveTo(0, 0); shape.bezierCurveTo(s * .9, s * .15, s * 1.9, s * .05, s * 2.2, -s * .55);
    shape.bezierCurveTo(s * 1.4, -s * .35, s * .5, -s * .55, s * .12, -s * .2);
    shape.lineTo(-s * .12, -s * .2);
    shape.bezierCurveTo(-s * .5, -s * .55, -s * 1.4, -s * .35, -s * 2.2, -s * .55);
    shape.bezierCurveTo(-s * 1.9, s * .05, -s * .9, s * .15, 0, 0);
    const g = new T.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 3, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0, 0); return g;
  }
  function whaleMesh() {
    if (made) return made.clone(true);
    const skin = new T.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: 0, side: T.DoubleSide });
    const paleSkin = new T.MeshStandardMaterial({ color: '#cfd3d3', roughness: .42, side: T.DoubleSide });
    const darkSkin = new T.MeshStandardMaterial({ color: '#1f252a', roughness: .38, side: T.DoubleSide });
    const g = new T.Group();
    g.add(new T.Mesh(body(), skin));
    for (const side of [1, -1]) {
      const f = new T.Mesh(flipper(), paleSkin); f.scale.x = side;
      f.position.set(side * LENGTH * .1, -LENGTH * .06, LENGTH * .14); f.rotation.set(0, side * deg(-30), side * deg(-28)); g.add(f);
    }
    const fl = new T.Mesh(flukes(), darkSkin); fl.position.set(0, 0, -LENGTH * .5); g.add(fl);
    const fin = new T.Mesh(new T.ConeGeometry(.28, .6, 16), darkSkin); fin.position.set(0, LENGTH * .085, -LENGTH * .2); fin.rotation.x = deg(-35); g.add(fin);
    g.traverse(x => { if (x.isMesh) { x.castShadow = x.receiveShadow = true; } });
    made = g; return g.clone(true);
  }

  // Where the breach has it at local time A seconds into it (already slowed): height of its middle above the water,
  // how far it has pitched up and rolled over, and whether it shows at all.
  const RISE = 17, DEPTH = 8;
  function breachAt(a) {
    const land = (RISE + Math.sqrt(RISE * RISE - 2 * 9.8 * 0)) / 9.8;   // back to where it started
    if (a < 0) return { y: -DEPTH - 6, pitch: 75, roll: 0, shown: false };
    if (a > land + 1.5) return { y: -DEPTH - 6, pitch: 0, roll: 120, shown: false };
    const y = -DEPTH + RISE * a - 4.9 * a * a;
    return { y, pitch: 78 - 26 * a, roll: Math.min(115, a * 52), shown: true };
  }

  World.custom.whale = (P, t = 0) => {
    const g = new T.Group(), rate = clamp(+P.rate || 1, .05, 4), size = clamp(+P.scale || 1, .2, 3);
    const w = whaleMesh(); w.scale.setScalar(M * size);
    if (P.breach != null) {
      const a = (t - (+P.breach || 0)) * rate, b = breachAt(a);
      w.visible = b.shown;
      // the body pivots round its middle: pitched nose-up, then rolling onto its side and back as it falls
      w.position.y = b.y * M * size;
      w.rotation.set(deg(-b.pitch), 0, deg(b.roll), 'YXZ');
      // splashes: as it leaves the water, and as it falls back in
      const out = (DEPTH - 3) / RISE + .08, back = (RISE + Math.sqrt(RISE * RISE - 2 * 9.8 * (DEPTH - 2))) / 9.8;
      for (const [id, at, sc] of [['out', out, 1.1], ['in', back, 2.2]]) {
        const s = World.custom.fx({ id: `${P.id}-${id}`, kind: 'splash', start: (+P.breach || 0) + at / rate, rate, scale: sc * size, amount: 90, wind: +P.wind || 1.5 }, t);
        if (s) g.add(s);
      }
    } else {
      // swimming at the surface: a slow roll of the back, the flukes rising now and then
      w.position.y = (-.6 + .25 * Math.sin(t * .7)) * M * size;
      w.rotation.x = deg(3 * Math.sin(t * .7));
    }
    g.add(w);
    return g;
  };
  if (window.SceneEd) SceneEd.add('whale', { type: 'whale', scale: 1, breach: 1, rate: .5 }, 'Humpback whale');
})();
