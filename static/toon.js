// ---------- characters: stylized people that act, for animated films ----------
// A "Character" prop is a cartoon person built to act on camera: a big round head with large eyes that blink, dart
// and follow what they look at, lids and brows that make the expressions, and a mouth that smiles, frowns and talks
// in step with what they say. The body stands on a skeleton with the usual bone names, so the scene editor's pose
// presets, hand posing and pose keys all work on it. It acts from a list of actions in time ("acts": walk, run,
// jump, wave, talk, cheer, think, shrug, point, take, dance, sneak, proud, look, idle), each easing into the next,
// with anticipation, squash and stretch on the big moves. Its mood (the face) comes with each act, or from its own
// list ("moods"). Everything is worked out from the world's time alone, in metres, so a frame is the same however
// it is reached. It faces +Z; its left is +X.
const Toon = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deg = d => d * Math.PI / 180, mix = (a, b, f) => a + (b - a) * f, smooth = f => { f = clamp(f, 0, 1); return f * f * (3 - 2 * f); };
  const TAU = Math.PI * 2;

  // ----- body shapes: lengths in metres at the build's own height; the whole figure is scaled to "height" -----
  const BUILDS = {
    kid: { h: 1.2, head: .2, skull: [1, .98, .97], eye: .27, leg: .44, legR: [.058, .046], foot: [.2, .075, .09], hips: [.26, .19], waist: [.25, .18], chest: [.28, .19], torso: .3, neck: .04, arm: [.17, .16], armR: [.042, .035], hand: .058, sleeves: 'short', legs: 'shorts', hairStyle: 'spiky' },
    tiny: { h: .85, head: .2, skull: [1.02, .97, .98], eye: .3, leg: .24, legR: [.056, .046], foot: [.14, .06, .075], hips: [.25, .21], waist: [.26, .22], chest: [.24, .19], torso: .22, neck: .02, arm: [.11, .1], armR: [.04, .034], hand: .048, sleeves: 'short', legs: 'shorts', hairStyle: 'curly' },
    adult: { h: 1.75, head: .16, skull: [.94, 1.04, .98], eye: .22, leg: .78, legR: [.07, .05], foot: [.27, .09, .105], hips: [.34, .22], waist: [.31, .2], chest: [.39, .23], torso: .5, neck: .07, arm: [.28, .26], armR: [.05, .039], hand: .078, sleeves: 'long', legs: 'trousers', hairStyle: 'swoop' },
    strong: { h: 1.95, head: .15, skull: [.92, 1.06, 1], eye: .2, leg: .74, legR: [.09, .062], foot: [.31, .1, .125], hips: [.42, .28], waist: [.44, .3], chest: [.8, .44], torso: .66, neck: .1, arm: [.34, .32], armR: [.09, .068], hand: .11, sleeves: 'long', legs: 'trousers', hairStyle: 'short' },
    round: { h: 1.65, head: .16, skull: [1, .98, 1], eye: .23, leg: .58, legR: [.078, .056], foot: [.26, .09, .115], hips: [.5, .4], waist: [.62, .52], chest: [.5, .38], torso: .58, neck: .03, arm: [.26, .25], armR: [.058, .046], hand: .082, sleeves: 'long', legs: 'trousers', hairStyle: 'bald' },
    tall: { h: 1.9, head: .15, skull: [.9, 1.08, .96], eye: .22, leg: .9, legR: [.056, .041], foot: [.27, .08, .095], hips: [.28, .18], waist: [.26, .17], chest: [.34, .2], torso: .58, neck: .06, arm: [.33, .31], armR: [.039, .032], hand: .072, sleeves: 'long', legs: 'trousers', hairStyle: 'bun' },
  };
  const BUILD_LIST = [['kid', 'Kid'], ['tiny', 'Toddler'], ['adult', 'Grown-up'], ['strong', 'Strong'], ['round', 'Round'], ['tall', 'Tall and thin']];
  const HAIR_LIST = [['short', 'Short'], ['spiky', 'Spiky'], ['swoop', 'Swept fringe'], ['bob', 'Bob'], ['bun', 'Bun'], ['ponytail', 'Ponytail'], ['curly', 'Curly'], ['bald', 'None']];
  // where the joints are, worked out from a build
  function layoutOf(B) {
    const ankle = B.foot[1] * .6, hip = ankle + B.leg, shoulder = hip + B.torso, neckTop = shoulder + B.neck, headC = neckTop + B.head * .8;
    return { ankle, hip, shoulder, neckTop, headC, top: headC + B.head * B.skull[1] * 1.04 };
  }

  // ----- shapes, kept once made: a figure is built again every frame it moves -----
  const geos = new Map(), once = (k, make) => { let g = geos.get(k); if (!g) { g = make(); geos.set(k, g); } return g; };
  const q3 = v => Math.round(v * 1000) / 1000;
  // a smooth closed shape through rings from the bottom up: [y, half width, half depth, x offset, z offset]; a ring of
  // no size is a pole
  function loft(rings, seg = 28) {
    const pos = [], idx = [], start = [], pole = r => r[1] < 1e-5 && r[2] < 1e-5;
    for (const r of rings) {
      start.push(pos.length / 3); const [y, rx, rz, ox = 0, oz = 0] = r;
      if (pole(r)) { pos.push(ox, y, oz); continue; }
      for (let s = 0; s < seg; s++) { const a = s / seg * TAU; pos.push(ox + Math.sin(a) * rx, y, oz + Math.cos(a) * rz); }
    }
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = start[i], b = start[i + 1], pa = pole(rings[i]), pb = pole(rings[i + 1]);
      for (let s = 0; s < seg; s++) {
        const s1 = (s + 1) % seg;
        if (pa && pb) continue;
        if (pa) idx.push(a, b + s1, b + s);
        else if (pb) idx.push(a + s, a + s1, b);
        else idx.push(a + s, a + s1, b + s1, a + s, b + s1, b + s);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // a limb: round at both ends, hanging down from 0 to -len, r1 at the top and r2 at the bottom, a little fuller in
  // the middle; flat makes it thinner front to back
  function limb(len, r1, r2, bulge = .06, flat = 1) {
    return once(`limb|${q3(len)}|${q3(r1)}|${q3(r2)}|${bulge}|${flat}`, () => {
      const rings = [[-len - r2, 0, 0]];
      for (let k = 1; k <= 6; k++) { const a = -Math.PI / 2 + k / 6 * Math.PI / 2; rings.push([-len + Math.sin(a) * r2, Math.cos(a) * r2, Math.cos(a) * r2 * flat]); }
      for (let j = 1; j < 8; j++) { const s = j / 8, r = mix(r2, r1, s) * (1 + bulge * Math.sin(Math.PI * s)); rings.push([-len + len * s, r, r * flat]); }
      for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; rings.push([Math.sin(a) * r1, Math.cos(a) * r1, Math.cos(a) * r1 * flat]); }
      rings[rings.length - 1] = [r1, 0, 0];
      return loft(rings, 24);
    });
  }
  // a blob through rings given as [y, width, depth, z offset], rounded off at both ends
  function blob(key, rings, seg = 32) {
    return once(key, () => {
      const out = [], first = rings[0], last = rings[rings.length - 1];
      out.push([first[0] - first[2] * .25, 0, 0, 0, first[3] || 0]);
      out.push([first[0] - first[2] * .2, first[1] / 2 * .55, first[2] / 2 * .55, 0, first[3] || 0]);
      out.push([first[0] - first[2] * .1, first[1] / 2 * .88, first[2] / 2 * .88, 0, first[3] || 0]);
      // between the given rings, on a smooth curve through all of them, so the outline has no steps or bumps
      const cr = (p0, p1, p2, p3, f) => .5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
      for (let i = 0; i + 1 < rings.length; i++) {
        const a = rings[Math.max(0, i - 1)], b = rings[i], c = rings[i + 1], d = rings[Math.min(rings.length - 1, i + 2)];
        for (let k = 0; k < 5; k++) { const f = k / 5, v = j => cr(a[j] || 0, b[j] || 0, c[j] || 0, d[j] || 0, f);
          out.push([mix(b[0], c[0], f), Math.max(1e-3, v(1)) / 2, Math.max(1e-3, v(2)) / 2, 0, v(3)]); }
      }
      out.push([last[0], last[1] / 2, last[2] / 2, 0, last[3] || 0]);
      out.push([last[0] + last[2] * .1, last[1] / 2 * .85, last[2] / 2 * .85, 0, last[3] || 0]);
      out.push([last[0] + last[2] * .18, last[1] / 2 * .5, last[2] / 2 * .5, 0, last[3] || 0]);
      out.push([last[0] + last[2] * .22, 0, 0, 0, last[3] || 0]);
      return loft(out, seg);
    });
  }
  // a blob in the spine's space, each point tied to the spine (below the waist) and the chest bone (from the ribs
  // up), with a soft blend between them where the body bends
  const trunkGeo = (key, rings, Lt) => once(key + '|skin', () => {
    const g = blob(key, rings).clone(), y = g.attributes.position, n = y.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const u = y.getY(i) / Lt + .3, w = smooth((u - .45) / .3); si[i * 4 + 1] = 1; sw[i * 4] = 1 - w; sw[i * 4 + 1] = w; }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4)); return g;
  });
  const sphere = (seg = 32) => once('sphere' + seg, () => new T.SphereGeometry(1, seg, Math.round(seg * .7)));
  // a shell over half a ball, for the eyelids: the top half (up) or the bottom half
  const shell = up => once('shell' + up, () => new T.SphereGeometry(1, 28, 10, 0, TAU, up ? 0 : Math.PI / 2, Math.PI / 2));
  // the front half of a thin ring along a lid's edge: its lashes
  const lashes = () => once('lashes', () => { const g = new T.TorusGeometry(1, .07, 6, 24, Math.PI); g.rotateX(Math.PI / 2); return g; });
  // a cap on a ball's front, for the iris and the pupil
  const cap = a => once('cap' + a, () => { const g = new T.SphereGeometry(1, 28, 6, 0, TAU, 0, a); g.rotateX(Math.PI / 2); return g; });
  // a shoe: rounded, flat underneath, the toe a little fuller than the heel
  const shoe = (len, h, w) => once(`shoe|${q3(len)}|${q3(h)}|${q3(w)}`, () => {
    const g = new T.SphereGeometry(1, 28, 18), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), toe = clamp((z + 1) / 2, 0, 1);
      p.setXYZ(i, x * w / 2 * (.85 + .3 * toe), Math.max(y, -.2) * h * .6 + h * .12, z * len / 2);
    }
    g.computeVertexNormals(); return g;
  });

  // ----- what they are made of -----
  // A rim of light round the edges, from behind (the animated-feature look turns it on: filmlook.js): it lifts a
  // character off whatever is behind it, the way a back light does on a film set, without lighting the floor.
  const rim = { uRim: { value: 0 }, uRimCol: { value: new T.Color(1, .95, .88) }, uRimDir: { value: new T.Vector3(0, .6, -.8) } };
  World.toonRim = rim;
  const withRim = m => {
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, rim);
      sh.fragmentShader = 'uniform float uRim; uniform vec3 uRimCol; uniform vec3 uRimDir;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
        `#include <dithering_fragment>
        if (uRim > 0.) { vec3 vd = normalize(vViewPosition); float f = pow(1. - abs(dot(normal, vd)), 3.);
          gl_FragColor.rgb += uRimCol * uRim * f * clamp(.35 + .65 * dot(normal, normalize(uRimDir)), 0., 1.); }`);
    };
    m.customProgramCacheKey = () => 'toonRim'; return m;
  };
  const mats = new Map();
  function mat(kind, color) {
    const key = kind + '|' + color; let m = mats.get(key); if (m) return m;
    const c = World.lin ? World.lin(color) : new T.Color(color);
    const light = c.clone().lerp(new T.Color(1, 1, 1), .35);
    if (kind === 'skin') m = new T.MeshPhysicalMaterial({ color: c, roughness: .52, sheen: .35, sheenColor: light, sheenRoughness: .45, clearcoat: .08, clearcoatRoughness: .5 });
    else if (kind === 'cloth') m = new T.MeshPhysicalMaterial({ color: c, roughness: .82, sheen: .7, sheenColor: light, sheenRoughness: .6 });
    else if (kind === 'hair') m = new T.MeshPhysicalMaterial({ color: c, roughness: .42, sheen: .5, sheenColor: light, sheenRoughness: .3, clearcoat: .2, clearcoatRoughness: .35 });
    else if (kind === 'gloss') m = new T.MeshPhysicalMaterial({ color: c, roughness: .12, clearcoat: 1, clearcoatRoughness: .05 });
    else if (kind === 'shoe') m = new T.MeshPhysicalMaterial({ color: c, roughness: .4, clearcoat: .4, clearcoatRoughness: .3 });
    else if (kind === 'glow') m = new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 1 });
    else m = new T.MeshPhysicalMaterial({ color: c, roughness: .6 });
    m.userData.toon = kind; if (kind !== 'glow') withRim(m); mats.set(key, m); return m;
  }
  const shade = (hex, f) => { const c = new T.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); };
  const mesh = (g, m, at, scale) => { const x = new T.Mesh(g, m); if (at) x.position.set(...at); if (scale) x.scale.set(...(Array.isArray(scale) ? scale : [scale, scale, scale])); return x; };

  // ----- hair: a ball just bigger than the head, pulled inside it where there is no hair -----
  function hairGeo(style) {
    return once('hair|' + style, () => {
      const g = new T.SphereGeometry(1, 56, 40), p = g.attributes.position;
      // where the hair starts, front, side and back (heights on the head, -1 to 1)
      const line = { short: [.52, .12, -.42], spiky: [.5, .15, -.4], swoop: [.46, .1, -.45], bob: [.36, -.62, -.66], bun: [.55, .2, -.35], ponytail: [.56, .18, -.4], curly: [.45, .05, -.5] }[style] || [.5, .1, -.4];
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const az = Math.atan2(x, z), cf = Math.cos(az), at = line[1] + (line[0] - line[1]) * Math.pow(Math.max(0, cf), 1.5) + (line[2] - line[1]) * Math.pow(Math.max(0, -cf), 1.5);
        let r = 1.07;
        if (style === 'spiky') r += .3 * Math.pow(Math.max(0, Math.sin(az * 5 + 1) * Math.sin(Math.acos(clamp(y, -1, 1)) * 6)), 3) * clamp((y + .2) / .8, 0, 1);
        if (style === 'curly') r += .07 * (Math.sin(az * 9) * Math.sin(y * 13) + 1);
        if (style === 'swoop') r += .16 * smooth((x + .1) / .9) * smooth((y - .35) / .4) * Math.max(0, cf);
        if (style === 'bob') r += .07 * smooth((-y + .1) / .7);
        if (style === 'short' || style === 'bun' || style === 'ponytail') r += .02 * Math.sin(az * 3) * Math.sin(y * 4);
        const w = smooth((y - at + .05) / .1);
        r = mix(.93, r, w);
        p.setXYZ(i, x * r, y * r, z * r);
      }
      g.computeVertexNormals(); return g;
    });
  }

  // ----- the mouth: drawn on the head's surface from its shape -----
  // open (0 shut to 1 wide open), smile (-1 frown to 1 grin), wide (how far the corners reach), round ("oo"), skew
  // (one corner up: a smirk). Angles on the head in radians, the mouth's middle a little under the equator.
  const mouthCache = new Map();
  function mouthGeos(m) {
    const k = [m.open, m.smile, m.wide, m.round, m.skew].map(v => Math.round(v * 40) / 40), key = k.join('|');
    let hit = mouthCache.get(key); if (hit) return hit;
    const [open, smile, wide, round, skew] = k, N = 24, e0 = -.46;
    const halfW = .2 + .2 * wide - .12 * round;
    const c = x => smile * .11 * (x * x) - Math.abs(smile) * .015 + skew * .06 * x;
    const up = x => c(x) * (1 - .55 * open) + open * (.07 + .07 * round) * Math.pow(Math.max(0, 1 - x * x), .5) + .006 * Math.pow(Math.max(0, 1 - x * x), .3);
    const lo = x => c(x) * (1 - .2 * open) - open * (.17 + .05 * round) * Math.pow(Math.max(0, 1 - x * x), round > .3 ? .5 : .75) - .012 * Math.pow(Math.max(0, 1 - x * x), .3);
    const at = (x, y, r) => { const az = x * halfW, el = e0 + y; return [Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r]; };
    // a strip between two curves, over part of the mouth's width
    const strip = (top, bottom, r, from = -1, to = 1) => {
      const pos = [], nor = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const x = mix(from, to, i / N);
        for (const y of [bottom(x), top(x)]) { const p = at(x, y, r), l = Math.hypot(...p); pos.push(...p); nor.push(p[0] / l, p[1] / l, p[2] / l); }
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
    };
    hit = { inside: strip(up, lo, 1.004) };
    if (open > .12) {
      const tw = .72 - .25 * round;
      hit.teeth = strip(up, x => Math.max(lo(x) + .01, up(x) - .045 - .02 * open), 1.008, -tw, tw);
      hit.tongue = strip(x => Math.min(up(x) - .01, lo(x) + .05 + .06 * open), lo, 1.007, -.6 + .2 * round, .6 - .2 * round);
    }
    if (mouthCache.size > 600) { const [first, v] = mouthCache.entries().next().value; mouthCache.delete(first); Object.values(v).forEach(g => g.dispose()); }
    mouthCache.set(key, hit); return hit;
  }

  // ----- faces: brows, lids and mouth for each mood -----
  // brow: up/down; tilt: degrees, inner ends down (cross) or up (worried); arch: the left brow up and the right down;
  // lidU, lidL: where the upper and lower lid edges are, degrees on the eye (up is +); lidTilt: lids slanted in;
  // smile, open, wide, round, skew: the mouth; pupil: how big the pupils are; squint: cheeks pushing the lower lid up
  const MOODS = {
    neutral: { brow: 0, tilt: 0, arch: 0, lidU: 38, lidL: -50, lidTilt: 0, smile: .12, open: 0, wide: .4, round: 0, skew: 0, pupil: 1 },
    happy: { brow: .04, tilt: -6, lidU: 30, lidL: -26, smile: .75, open: .12, wide: .62 },
    joy: { brow: .09, tilt: -10, lidU: 30, lidL: -20, smile: .95, open: .62, wide: .78, pupil: 1.08 },
    laugh: { brow: .08, tilt: -12, lidU: -2, lidL: -8, smile: 1, open: .72, wide: .82 },
    sad: { brow: .03, tilt: -20, lidU: 20, lidL: -40, lidTilt: -10, smile: -.65, open: 0, wide: .32 },
    angry: { brow: -.07, tilt: 22, lidU: 16, lidL: -30, lidTilt: 16, smile: -.5, open: .16, wide: .55 },
    surprised: { brow: .16, tilt: -4, lidU: 58, lidL: -58, smile: 0, open: .72, wide: .26, round: .7, pupil: .78 },
    scared: { brow: .12, tilt: -18, lidU: 52, lidL: -52, smile: -.45, open: .42, wide: .7, pupil: .7 },
    smug: { brow: .01, tilt: 5, arch: .06, lidU: 12, lidL: -30, smile: .5, open: 0, wide: .48, skew: .7 },
    determined: { brow: -.04, tilt: 13, lidU: 22, lidL: -32, lidTilt: 8, smile: -.08, open: 0, wide: .44 },
    worried: { brow: .06, tilt: -15, lidU: 34, lidL: -42, smile: -.28, open: .04, wide: .36, skew: -.25 },
    think: { brow: .02, tilt: -3, arch: .08, lidU: 28, lidL: -40, smile: -.1, open: 0, wide: .3, skew: .55 },
    unsure: { brow: .1, tilt: -8, arch: .03, lidU: 36, lidL: -42, smile: -.3, open: 0, wide: .5, skew: .2 },
    sleepy: { brow: -.02, tilt: -4, lidU: 2, lidL: -30, smile: 0, open: 0, wide: .35 },
    shout: { brow: -.05, tilt: 18, lidU: 30, lidL: -36, lidTilt: 10, smile: -.2, open: .9, wide: .7, round: .2 },
  };
  const MOOD_LIST = [['neutral', 'Calm'], ['happy', 'Happy'], ['joy', 'Overjoyed'], ['laugh', 'Laughing'], ['sad', 'Sad'], ['angry', 'Cross'], ['surprised', 'Surprised'],
    ['scared', 'Scared'], ['smug', 'Smug'], ['determined', 'Determined'], ['worried', 'Worried'], ['think', 'Thinking'], ['unsure', 'Unsure'], ['sleepy', 'Sleepy'], ['shout', 'Shouting']];
  const moodOf = name => ({ ...MOODS.neutral, ...(MOODS[name] || {}) });
  const mixMood = (a, b, f) => Object.fromEntries(Object.keys(MOODS.neutral).map(k => [k, mix(a[k], b[k], f)]));

  // ----- acting: each action is a pose at U seconds into it -----
  // A pose: bone turns in degrees ({Hips: [x, y, z]...}, over the rest pose: arms hanging, facing +Z), y (the body
  // raised, metres at the build's own size), s (squash and stretch: 1 none, under 1 squashed, over 1 stretched) and
  // eyes ([up, across] degrees). Names on the left side mirror to the right with sym().
  const sym = (out, part, [x, y, z]) => { out['Left' + part] = [x, y, z]; out['Right' + part] = [x, -y, -z]; return out; };
  const relaxed = () => sym(sym({}, 'Arm', [-2, 0, 9]), 'ForeArm', [-14, 0, 0]);
  // bending the knees with the feet kept flat on the ground: thighs forward, shins back; how far the hips drop
  function crouch(b, th, legLen) { sym(b, 'UpLeg', [-th, 0, 0]); sym(b, 'Leg', [th * 2, 0, 0]); sym(b, 'Foot', [-th, 0, 0]); return -legLen * (1 - Math.cos(deg(th))); }
  // a steady pseudo-random number for a slot of time
  const hash = (n, seed) => { let x = (Math.imul((n | 0) + 1, 2654435761) ^ seed) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  // where the eyes wander when nothing holds them: a new spot every second or two
  function darts(u, seed) {
    const slot = Math.floor(u / 1.6), f = smooth((u - slot * 1.6) / .08);
    const at = n => [(hash(n, seed) - .5) * 8, (hash(n + 7919, seed) - .5) * 16];
    const a = at(slot - 1), b = at(slot); return [mix(a[0], b[0], f), mix(a[1], b[1], f)];
  }
  const ACTIONS = {
    idle: { label: 'Stand', pose(u, c) {
      const br = Math.sin(TAU * u / 3.4), sw = Math.sin(TAU * u / 5.3 + c.seed % 7);
      const b = sym(sym({}, 'Arm', [-2 + br, 0, 9 + 1.5 * br]), 'ForeArm', [-12, 0, 0]);
      Object.assign(b, { Hips: [0, 2 * sw, 1.5 * sw], Spine: [1.5 + 1.2 * br, -1.5 * sw, -sw], Spine1: [1 + br, 0, 0], Neck: [-1.5 * br, 0, 0],
        Head: [Math.sin(u * .7), 5 * Math.sin(u * .31 + c.seed), 2 * Math.sin(u * .43)], LeftUpLeg: [0, 0, -1.5 * sw], RightUpLeg: [0, 0, -1.5 * sw], LeftLeg: [2, 0, 0], RightLeg: [2, 0, 0], LeftFoot: [-2, 0, 1.5 * sw], RightFoot: [-2, 0, 1.5 * sw] });
      return { b, y: 0, s: 1 + .006 * br, eyes: darts(u, c.seed) };
    } },
    walk: { label: 'Walk', pose(u, c) { return stride(u, c, { cycle: 1.9, A: 28, knee: 52, bob: .045, lean: 5, arms: 22, fore: 18, rate: .95 }); } },
    run: { label: 'Run', pose(u, c) { return stride(u, c, { cycle: 3.3, A: 46, knee: 95, bob: .07, lean: 14, arms: 42, fore: 80, rate: 1.6, run: true }); } },
    sneak: { label: 'Sneak', mood: 'smug', pose(u, c) {
      const ph = TAU * (c.moving ? c.dist / (c.legLen * 1.2) : u * .55), s = Math.sin(ph), cc = Math.cos(ph), b = {};
      const y = crouch(b, 22, c.legLen);
      b.LeftUpLeg = [-22 - 30 * s, 0, 0]; b.RightUpLeg = [-22 + 30 * s, 0, 0];
      b.LeftLeg = [44 + 45 * Math.max(0, cc), 0, 0]; b.RightLeg = [44 + 45 * Math.max(0, -cc), 0, 0];
      b.LeftFoot = [-(b.LeftUpLeg[0] + b.LeftLeg[0]) * .8 + 12, 0, 0]; b.RightFoot = [-(b.RightUpLeg[0] + b.RightLeg[0]) * .8 + 12, 0, 0];
      sym(b, 'Arm', [-38, 0, 14]); sym(b, 'ForeArm', [-105, 0, 0]); sym(b, 'Hand', [35, 0, 0]);
      Object.assign(b, { Hips: [0, -6 * s, 0], Spine: [16, 6 * s, 0], Spine1: [6, 3 * s, 0], Neck: [-10, 0, 0], Head: [-6, -3 * s, 0] });
      return { b, y: y + .03 * cc * cc, s: 1, eyes: [0, 18 * Math.sin(u * .9)] };
    } },
    jump: { label: 'Jump', mood: 'determined', len: a => jumpTimes(a).len, pose(u, c, a) {
      const J = jumpTimes(a), b = relaxed(); let y = 0, s = 1, mood = null;
      if (u < J.ant) { const f = smooth(u / J.ant); y = crouch(b, 48 * f, c.legLen); sym(b, 'Arm', [38 * f, 0, 12]); b.Spine = [20 * f, 0, 0]; b.Head = [-14 * f, 0, 0]; s = 1 - .1 * f; }
      else if (u < J.ant + J.push) { const f = (u - J.ant) / J.push; y = crouch(b, 48 * (1 - f), c.legLen); sym(b, 'Arm', [38 - 190 * f, 0, 12 + 10 * f]); b.Spine = [20 - 26 * f, 0, 0]; s = .9 + .32 * f; }
      else if (u < J.ant + J.push + J.air) {
        const f = (u - J.ant - J.push) / J.air, k = Math.sin(Math.PI * f);
        y = 4 * J.h * f * (1 - f); sym(b, 'UpLeg', [-50 * k, 0, 4]); sym(b, 'Leg', [85 * k, 0, 0]); sym(b, 'Foot', [-20 * k, 0, 0]);
        sym(b, 'Arm', [-152 + 90 * f, 0, 22 + 25 * f]); sym(b, 'ForeArm', [-10 - 20 * k, 0, 0]); b.Spine = [-6 + 12 * f, 0, 0]; b.Head = [-8 + 14 * f, 0, 0];
        s = f < .5 ? 1.22 - .44 * f : 1 + .2 * (f - .5); mood = f > .3 ? 'joy' : null;
      } else if (u < J.ant + J.push + J.air + J.land) { const f = (u - J.ant - J.push - J.air) / J.land; y = crouch(b, 52 * smooth(f), c.legLen); sym(b, 'Arm', [-62 + 40 * f, 0, 45]); b.Spine = [6 + 16 * f, 0, 0]; s = 1.1 - .28 * Math.sin(f * Math.PI / 2); mood = 'joy'; }
      else { const f = smooth((u - J.ant - J.push - J.air - J.land) / J.rec); y = crouch(b, 52 * (1 - f), c.legLen); sym(b, 'Arm', [-22 * (1 - f), 0, 45 - 36 * f]); b.Spine = [22 * (1 - f), 0, 0]; s = .82 + .18 * f + .05 * Math.sin(Math.PI * f); mood = 'happy'; }
      return { b, y, s, mood };
    } },
    wave: { label: 'Wave', mood: 'happy', pose(u, c) {
      const w = Math.sin(TAU * 2.2 * u), b = relaxed();
      b.RightArm = [-8, 0, -95]; b.RightForeArm = [0, 0, -62 + 20 * w]; b.RightHand = [0, 0, -14 * Math.sin(TAU * 2.2 * u + .7)];
      Object.assign(b, { Spine: [0, -4, -3], Head: [0, -3, 7 + 2 * w], LeftArm: [-2, 0, 10] });
      return { b, y: 0, s: 1, eyes: [0, 0] };
    } },
    talk: { label: 'Talk', pose(u, c) {
      const g1 = Math.sin(u * 2.3 + c.seed), g2 = Math.sin(u * 1.7 + 1 + c.seed), g3 = Math.sin(u * 3.1);
      const b = { LeftArm: [-16 - 10 * g1, 0, 14], LeftForeArm: [-58 - 16 * g2, 22 * g1, 0], LeftHand: [0, 0, -12], RightArm: [-12 - 10 * g2, 0, -14], RightForeArm: [-52 - 16 * g1, -22 * g2, 0], RightHand: [0, 0, 12],
        Spine: [2, 4 * Math.sin(u * .9), 0], Spine1: [1, 2 * g3, 0], Head: [2 * Math.sin(u * 4.7), 6 * Math.sin(u * .8), 3 * Math.sin(u * 1.3)] };
      return { b, y: 0, s: 1, eyes: darts(u, c.seed).map(v => v * .5) };
    } },
    cheer: { label: 'Cheer', mood: 'joy', pose(u, c) {
      const f = TAU * 2 * u, p = Math.sin(f), b = {};
      const y = crouch(b, 16 * Math.max(0, -p), c.legLen);
      sym(b, 'Arm', [-12, 0, 150 + 12 * p]); sym(b, 'ForeArm', [-10, 0, 12 + 14 * p]); sym(b, 'Hand', [0, 0, 10]);
      Object.assign(b, { Spine: [-6, 0, 0], Head: [-12, 0, 4 * Math.sin(f / 2)] });
      return { b, y: y + .07 * Math.max(0, p), s: 1 + .08 * p, eyes: [10, 0] };
    } },
    think: { label: 'Think', mood: 'think', pose(u, c) {
      const sw = Math.sin(u * .8), b = { RightArm: [-42, 6, -14], RightForeArm: [-138, -18, 0], RightHand: [24, 0, 0], LeftArm: [-30, 32, 14], LeftForeArm: [-92, 0, -30],
        Spine: [-1, -4, 0], Neck: [-3, 0, 0], Head: [-9, 10 + 3 * sw, 10] };
      return { b, y: 0, s: 1, eyes: [14, -18 + 3 * sw] };
    } },
    shrug: { label: 'Shrug', mood: 'unsure', len: () => 1.6, pose(u) {
      const f = u < .35 ? smooth(u / .35) : u < 1.05 ? 1 : 1 - smooth((u - 1.05) / .55), b = relaxed();
      sym(b, 'Arm', [-16 * f - 2 * (1 - f), 0, 9 + 22 * f]); sym(b, 'ForeArm', [-14 - 64 * f, 55 * f, 0]); sym(b, 'Hand', [0, 0, -22 * f]);
      Object.assign(b, { Spine: [-3 * f, 0, 0], Head: [-6 * f, 0, 13 * f] });
      return { b, y: 0, s: 1 + .045 * f, eyes: [6 * f, 0] };
    } },
    point: { label: 'Point', mood: 'determined', pose(u) {
      const b = relaxed(); b.RightArm = [-82, -8, -6]; b.RightForeArm = [-6, 0, 0]; b.RightHand = [0, 0, 0];
      Object.assign(b, { Spine: [0, -12, 0], Head: [0, -14, 0], LeftArm: [-4, 0, 12] });
      return { b, y: 0, s: 1, eyes: [0, -6] };
    } },
    take: { label: 'Surprised take', mood: 'surprised', hold: true, len: () => .75, pose(u, c) {
      const b = relaxed(); let y = 0, s = 1;
      if (u < .1) { const f = u / .1; y = crouch(b, 16 * f, c.legLen); s = 1 - .1 * f; b.Head = [10 * f, 0, 0]; b.Spine = [8 * f, 0, 0]; }
      else { const f = smooth((u - .1) / .18), g = smooth((u - .3) / .45);
        y = crouch(b, 16 * (1 - f), c.legLen) + .03 * f * (1 - g); s = .9 + .32 * f - .16 * g;
        sym(b, 'Arm', [-32 * f, 0, 10 + 62 * f - 8 * g]); sym(b, 'ForeArm', [-30 * f, 0, 0]); sym(b, 'Hand', [0, 0, -20 * f]);
        b.Spine = [-15 * f + 5 * g, 0, 0]; b.Head = [-12 * f + 4 * g, 0, 0]; }
      return { b, y, s, eyes: [0, 0] };
    } },
    dance: { label: 'Dance', mood: 'joy', pose(u, c) {
      const ph = TAU * u * 112 / 60, h = Math.sin(ph / 2), b = {};
      const y = crouch(b, 14 * Math.abs(Math.sin(ph)), c.legLen);
      b.LeftArm = [-22, 0, 40 + 70 * Math.max(0, h)]; b.RightArm = [-22, 0, -(40 + 70 * Math.max(0, -h))]; sym(b, 'ForeArm', [-62, 0, 0]);
      Object.assign(b, { Hips: [0, 14 * h, 7 * h], Spine: [2, -10 * h, -4 * h], Head: [0, 6 * h, 9 * h] });
      return { b, y, s: 1 + .03 * Math.cos(ph), eyes: [4, 0] };
    } },
    proud: { label: 'Hands on hips', mood: 'smug', pose(u) {
      const br = Math.sin(TAU * u / 3.6), b = {};
      sym(b, 'Arm', [6, 0, 44]); sym(b, 'ForeArm', [12, 0, -100]); sym(b, 'Hand', [0, 0, -20]); sym(b, 'UpLeg', [0, 0, 6]); sym(b, 'Foot', [0, 0, -6]);
      Object.assign(b, { Spine: [-7 + br, 0, 0], Spine1: [-3, 0, 0], Neck: [-4, 0, 0], Head: [-8, 4 * Math.sin(u * .4), 0] });
      return { b, y: -.005, s: 1 + .006 * br, eyes: [0, 0] };
    } },
    look: { label: 'Look around', mood: 'worried', pose(u) {
      const sw = Math.sin(TAU * u / 4), b = relaxed();
      Object.assign(b, { Spine: [0, 10 * sw, 0], Neck: [0, 12 * sw, 0], Head: [-3, 26 * sw, 2 * sw] });
      return { b, y: 0, s: 1, eyes: [2, 18 * Math.sin(TAU * (u + .25) / 4)] };
    } },
  };
  // walking and running: in step with how far the figure has gone on its path, or on the spot
  function stride(u, c, o) {
    const ph = TAU * (c.moving ? c.dist / (c.legLen * o.cycle) : u * o.rate), s = Math.sin(ph), cc = Math.cos(ph), b = {};
    b.LeftUpLeg = [-o.A * s - (o.run ? 12 : 3), 0, 0]; b.RightUpLeg = [o.A * s - (o.run ? 12 : 3), 0, 0];
    b.LeftLeg = [6 + o.knee * Math.pow(Math.max(0, cc), 1.3), 0, 0]; b.RightLeg = [6 + o.knee * Math.pow(Math.max(0, -cc), 1.3), 0, 0];
    b.LeftFoot = [-(b.LeftUpLeg[0] + b.LeftLeg[0]) * .75 - 8 * Math.max(0, s), 0, 0]; b.RightFoot = [-(b.RightUpLeg[0] + b.RightLeg[0]) * .75 - 8 * Math.max(0, -s), 0, 0];
    b.Hips = [0, -7 * s, -3 * cc]; b.Spine = [o.lean, 9 * s, 0]; b.Spine1 = [2, 4 * s, 0]; b.Neck = [-o.lean * .4, 0, 0]; b.Head = [-o.lean * .4, -2 * s, 0];
    b.LeftArm = [o.arms * s - (o.run ? 15 : 0), 0, 8]; b.RightArm = [-o.arms * s - (o.run ? 15 : 0), 0, -8];
    b.LeftForeArm = [-o.fore - 14 * Math.max(0, -s), 0, 0]; b.RightForeArm = [-o.fore - 14 * Math.max(0, s), 0, 0];
    return { b, y: o.bob * (cc * cc - .6), s: 1 + (o.run ? .06 : .025) * (cc * cc - .5), eyes: [0, 0] };
  }
  // a jump's timing: crouch, push off, the air, the landing and getting up; HEIGHT metres at the build's own size
  function jumpTimes(a) {
    const h = clamp(+(a?.height ?? .6) || .6, .05, 6), air = Math.max(.35, 2 * Math.sqrt(2 * h / 9.8) * 1.2);
    const J = { h, ant: .38, push: .12, air, land: .12, rec: .45 }; J.len = J.ant + J.push + J.air + J.land + J.rec; return J;
  }
  const ACT_LIST = Object.entries(ACTIONS).map(([k, v]) => [k, v.label]);
  const mixPose = (a, b, f) => {
    const out = { b: {}, y: mix(a.y || 0, b.y || 0, f), s: mix(a.s ?? 1, b.s ?? 1, f), eyes: [mix(a.eyes?.[0] || 0, b.eyes?.[0] || 0, f), mix(a.eyes?.[1] || 0, b.eyes?.[1] || 0, f)] };
    for (const k of new Set([...Object.keys(a.b), ...Object.keys(b.b)])) { const x = a.b[k] || [0, 0, 0], z = b.b[k] || [0, 0, 0]; out.b[k] = [mix(x[0], z[0], f), mix(x[1], z[1], f), mix(x[2], z[2], f)]; }
    out.mood = f < .5 ? a.mood : b.mood; return out;
  };
  // one act's pose at T: a one-off action (a jump, a shrug) settles back to standing when it is done
  function actPose(act, u, c) {
    const A = ACTIONS[act?.do] || ACTIONS.idle, len = A.len?.(act);
    if (len != null && u > len) {
      const end = A.pose(len, c, act); if (A.hold) return end;
      const idle = ACTIONS.idle.pose(u - len, c); return mixPose(end, idle, smooth((u - len) / .4));
    }
    return A.pose(Math.max(0, u), c, act);
  }
  // the list of acts, sorted, each lasting until the next
  const actsOf = P => (Array.isArray(P.acts) ? P.acts : []).filter(a => a && ACTIONS[a.do]).map(a => ({ ...a, t: +a.t || 0 })).sort((a, b) => a.t - b.t);
  function actingAt(P, t, c) {
    const acts = actsOf(P);
    if (!acts.length) acts.push({ t: 0, do: c.moving ? (P.move === 'run' ? 'run' : 'walk') : 'idle' });
    let i = -1; for (let k = 0; k < acts.length; k++) if (acts[k].t <= t + 1e-6) i = k;
    if (i < 0) i = 0;
    const cur = acts[i], prev = acts[i - 1], blend = clamp(+(cur.blend ?? .3) || .3, .02, 3);
    let pose = actPose(cur, t - cur.t, c);
    const moodName = a => a.mood || ACTIONS[a.do]?.mood || P.mood || 'neutral';
    let mood = moodOf(pose.mood || moodName(cur));
    if (prev && t - cur.t < blend) {
      const f = smooth((t - cur.t) / blend), before = actPose(prev, t - prev.t, c);
      pose = mixPose(before, pose, f); mood = mixMood(moodOf(before.mood || moodName(prev)), mood, f);
    }
    // a list of moods of its own wins over the acts' ones
    const moods = (Array.isArray(P.moods) ? P.moods : []).filter(m => m && MOODS[m.mood]).map(m => ({ ...m, t: +m.t || 0 })).sort((a, b) => a.t - b.t);
    let j = -1; for (let k = 0; k < moods.length; k++) if (moods[k].t <= t + 1e-6) j = k;
    if (j >= 0) { const m = moods[j], p = moods[j - 1], f = smooth((t - m.t) / .25); mood = p && f < 1 ? mixMood(moodOf(p.mood), moodOf(m.mood), f) : moodOf(m.mood); }
    return { pose, mood };
  }

  // ----- the figure -----
  function figure(P, t) {
    const B = BUILDS[P.build] || BUILDS.kid, L = layoutOf(B), height = clamp(+P.height || B.h, .3, 6), k = height / L.top;
    const seed = [...String(P.id || P.name || 'toon')].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const moving = P.keys?.at?.length >= 2, dist = moving && typeof Actors !== 'undefined' ? Actors.travelled(P, t) / k : 0;
    const c = { P, t, legLen: B.leg, moving, dist, seed: seed % 1000 };
    const { pose, mood } = actingAt(P, t, c);
    const skin = P.skin || '#e0a98a', top = P.top || '#3f8fc9', bottom = P.bottom || '#33415c', shoes = P.shoes || '#f3efe6', hair = P.hair || '#3b2417';
    const suit = P.outfit === 'suit', accent = P.accent || '#f2b134';
    const sleeves = P.sleeves || (suit ? 'long' : B.sleeves), legs = P.legs || (suit ? 'trousers' : B.legs), hairStyle = P.hairStyle || B.hairStyle;
    const mSkin = mat('skin', skin), mTop = mat('cloth', top), mBottom = mat('cloth', suit ? top : bottom), mShoe = suit ? mat('gloss', accent) : mat('shoe', shoes);
    const mHand = suit ? mat('cloth', accent) : mSkin;

    // squash and stretch, keeping the volume: from the feet, so they stay on the ground
    const ex = clamp((P.squash ?? 100) / 100, 0, 3), st = (+World.keyed(P, 'stretch', t, P.stretch ?? 1) || 1) * (1 + ((pose.s ?? 1) - 1) * ex);
    const root = new T.Group(), body = new T.Group(); root.add(body);
    body.scale.set(k / Math.sqrt(st), k * st, k / Math.sqrt(st)); body.position.y = (pose.y || 0) * k;
    const bone = (name, at, parent) => { const b = new T.Bone(); b.name = name; b.position.set(...at); (parent || body).add(b); return b; };
    const hips = bone('Hips', [0, L.hip, 0]);
    const spine = bone('Spine', [0, B.torso * .3, 0], hips), chest = bone('Spine1', [0, B.torso * .35, 0], spine);
    const neck = bone('Neck', [0, B.torso * .35, 0], chest), head = bone('Head', [0, B.neck, 0], neck);
    // the trunk: hips and seat in the trousers' colour, then the top over it
    const [hw, hd] = B.hips, [ww, wd] = B.waist, [cw, cd] = B.chest, Lt = B.torso, belly = P.build === 'round' ? wd * .18 : 0;
    hips.add(mesh(blob(`pelvis|${P.build}`, [[-B.legR[0] * 1.2, hw * .9, hd * .9, 0], [0, hw, hd, 0], [Lt * .2, mix(hw, ww, .6) * .96, mix(hd, wd, .6) * .92, belly * .5], [Lt * .3, ww * .88, wd * .85, belly]]), mBottom));
    // the top's outline from the waist (u .3 of the way from the hips to the shoulders) up
    const trunk = u => { const f = smooth((u - .3) / .5), g = smooth((u - .88) / .14);
      return [mix(ww, cw, f) * (1 - .15 * g), mix(wd, cd, f) * (1 - .1 * g), belly * (1 - smooth((u - .3) / .45))]; };
    const ringsAt = (us, from, grow = 1) => us.map(u => { const [w, d, z] = trunk(u); return [(u - from) * Lt, w * grow, d * grow, z]; });
    const hem = ringsAt([.17], .3, 1.08); hem[0][2] = Math.max(hem[0][2], hd * 1.04);
    // one piece from the hem to the shoulders, skinned to both bones: it bends smoothly where the spine bends, with
    // no seam between belly and chest
    const shirt = new T.SkinnedMesh(trunkGeo(`trunk|${P.build}`, [...hem, ...ringsAt([.32, .45, .58, .72, .86, .95, 1], .3)], Lt), mTop);
    shirt.frustumCulled = false; spine.add(shirt);
    if (suit) spine.add(mesh(blob(`belt|${P.build}`, [[-Lt * .02, ww * 1.06, wd * 1.06, belly], [Lt * .06, ww * 1.06, wd * 1.06, belly]], 32), mat('gloss', P.belt || shade(accent, .5))));
    else if (legs === 'skirt') hips.add(mesh(blob(`skirt|${P.build}`, [[-B.leg * .42, hw * 1.7, hd * 1.6, 0], [-B.leg * .1, hw * 1.25, hd * 1.2, 0], [Lt * .3, ww * 1.02, wd * 1.02, belly]], 36), mBottom));
    neck.add(mesh(limb(B.neck + B.head * .25, B.head * .36, B.head * .4), mSkin, [0, B.neck + B.head * .25, 0]));

    // arms: from the shoulders, sleeves as asked; mitten hands with a thumb
    for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
      const [a1, a2] = B.arm, [r1, r2] = B.armR, sh = bone(side + 'Arm', [sx * (cw / 2 - r1 * .75), B.torso * .35 - r1 * 1.15, 0], chest);
      const fore = bone(side + 'ForeArm', [0, -a1, 0], sh), hand = bone(side + 'Hand', [0, -a2, 0], fore);
      sh.add(mesh(limb(a1, r1, r1 * .86, .1), sleeves === 'long' ? mTop : mSkin));
      if (sleeves === 'short') sh.add(mesh(limb(a1 * .45, r1 * 1.28, r1 * 1.22, 0), mTop));
      fore.add(mesh(limb(a2, r1 * .86, r2, .12), sleeves === 'long' && !suit ? mTop : suit ? mTop : mSkin));
      if (suit) fore.add(mesh(limb(a2 * .35, r2 * 1.25, r2 * 1.15, 0), mHand, [0, -a2 * .65, 0]));
      const hs = B.hand;
      hand.add(mesh(sphere(24), mHand, [0, -hs * .5, hs * .05], [hs * .3, hs * .6, hs * .5]));
      const thumb = mesh(limb(hs * .32, hs * .14, hs * .11, 0), mHand, [-sx * hs * .14, -hs * .25, hs * .34]); thumb.rotation.set(deg(-50), 0, deg(-sx * 25)); hand.add(thumb);
    }
    // legs: trousers, shorts or bare under a skirt; shoes
    for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
      const [r1, r2] = B.legR, half = B.leg / 2, up = bone(side + 'UpLeg', [sx * (hw / 2 - r1 * 1.05), -.01, 0], hips);
      const shin = bone(side + 'Leg', [0, -half, 0], up), foot = bone(side + 'Foot', [0, -half, 0], shin);
      const bare = legs === 'shorts' || legs === 'skirt';
      up.add(mesh(limb(half, r1, r1 * .82, .12), bare ? mSkin : mBottom));
      if (legs === 'shorts') up.add(mesh(limb(half * .55, r1 * 1.25, r1 * 1.2, 0), mBottom));
      shin.add(mesh(limb(half, r1 * .82, r2, .14), bare ? mSkin : mBottom));
      if (bare) shin.add(mesh(limb(half * .25, r2 * 1.12, r2 * 1.1, 0), mat('cloth', P.socks || '#f4f1ea'), [0, -half * .72, 0]));
      if (suit) shin.add(mesh(limb(half * .5, r2 * 1.3, r2 * 1.2, 0), mShoe, [0, -half * .5, 0]));
      const [fl, fh, fw] = B.foot;
      foot.add(mesh(shoe(fl, fh, fw), mShoe, [0, -L.ankle, fl * .22]));
    }

    // the head: a ball, scaled to the build's skull; everything on the face in its units (radius 1, facing +Z)
    const skull = new T.Group(); skull.position.set(0, B.head * .8, B.head * .03); skull.scale.set(B.head * B.skull[0], B.head * B.skull[1], B.head * B.skull[2]); head.add(skull);
    skull.add(mesh(sphere(40), mSkin));
    // nose and ears
    skull.add(mesh(sphere(20), mat('skin', shade(skin, .97)), [0, -.14, .96], P.build === 'tall' ? [.15, .17, .2] : [.15, .12, .12]));
    for (const sx of [1, -1]) skull.add(mesh(sphere(20), mSkin, [sx * .97, -.04, -.05], [.12, .26, .17]));
    if (hairStyle !== 'bald') {
      const mh = mat('hair', hair);
      skull.add(mesh(hairGeo(hairStyle), mh));
      if (hairStyle === 'bun') skull.add(mesh(sphere(24), mh, [0, .98, -.38], .36));
      if (hairStyle === 'ponytail') { const tail = mesh(limb(.75, .2, .1, .3), mh, [0, .55, -.95]); tail.rotation.x = deg(-28 - 8 * Math.sin(t * 2.6)); skull.add(tail); }
    }
    // mood, with a blink now and then and the lip sync from what they say
    const blink = typeof Actors !== 'undefined' && Actors.blinkAt ? Actors.blinkAt(P, t) : 0;
    const lip = typeof Actors !== 'undefined' && Actors.mouthAt ? Actors.mouthAt(P, t) : { open: 0, wide: 0, round: 0, talking: false };
    const m = mood;
    // eyes, on bones so a pose's "@look" and the look-at turn them; an iris with a dark rim, a pupil and a glint
    const er = B.eye, ey = .06, ex2 = .3 + er * .35, ez = Math.sqrt(Math.max(0, 1 - ex2 * ex2 - ey * ey)) - er * .45;
    const iris = P.eyes || '#5b3a22', mWhite = mat('gloss', '#f6f3ec'), mIris = mat('gloss', iris), mRim = mat('gloss', shade(iris, .35)), mPupil = mat('gloss', '#0b0807');
    for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
      const eye = new T.Bone(); eye.name = side + 'Eye'; eye.position.set(sx * ex2, ey, ez); skull.add(eye);
      eye.rotation.set(deg(-clamp(pose.eyes?.[0] || 0, -35, 35)), deg(clamp(pose.eyes?.[1] || 0, -40, 40)), 0, 'YXZ');
      eye.add(mesh(sphere(32), mWhite, null, er));
      eye.add(mesh(cap(.62), mRim, null, er * 1.003));
      eye.add(mesh(cap(.56), mIris, null, er * 1.006));
      eye.add(mesh(cap(.27 * clamp(m.pupil, .5, 1.6)), mPupil, null, er * 1.009));
      eye.add(mesh(sphere(12), mat('glow', '#ffffff'), [-.33 * er, .36 * er, .88 * er], er * .085));
      // lids: shells just bigger than the eye, turned down over it; slanted for cross or sad
      const lid = new T.Group(); lid.position.copy(eye.position); lid.rotation.z = deg(sx * m.lidTilt); skull.add(lid);
      const upAt = mix(m.lidU, -6, blink), loAt = mix(m.lidL, -12, blink * .7);
      const upper = mesh(shell(true), mSkin, null, er * 1.1); upper.rotation.x = deg(-upAt); lid.add(upper);
      const lash = mesh(lashes(), mat('gloss', P.lashes || '#2a1a14'), null, er * 1.1); lash.rotation.x = deg(-upAt); lid.add(lash);
      const lower = mesh(shell(false), mSkin, null, er * 1.04); lower.rotation.x = deg(-loAt); lid.add(lower);
      // brows: a short tapered bar on the forehead
      const bx = sx * (ex2 + .02), by = ey + er + .13 + m.brow + sx * m.arch, bz = Math.sqrt(Math.max(0, 1 - bx * bx - by * by)) + .02;
      const brow = new T.Group(); brow.position.set(bx, by, bz); brow.rotation.set(-Math.asin(clamp(by, -1, 1)) * .8, Math.atan2(bx, bz) * .9, deg(sx * m.tilt), 'YXZ'); skull.add(brow);
      const bar = mesh(limb(er * 1.25, er * .17, er * .11, 0, .7), mat('hair', P.brows || shade(hair === '#f3efe6' ? '#8a7b6a' : hair, .8)), [-sx * er * .62, 0, 0]);
      bar.rotation.z = deg(sx * 90); brow.add(bar);
    }
    // the mouth: the mood's shape, opened and shaped further by what they say
    const talk = lip.talking ? 1 : 0;
    const mouth = { open: clamp(Math.max(m.open, lip.open * .9 + m.open * .3 * talk), 0, 1), smile: m.smile * (1 - .35 * talk * lip.open), wide: clamp(mix(m.wide, lip.wide, talk * .6), 0, 1), round: clamp(Math.max(m.round, lip.round), 0, 1), skew: m.skew };
    const mg = mouthGeos(mouth);
    skull.add(mesh(mg.inside, mat('skin', P.mouthColor || '#4a1820')));
    if (mg.teeth) skull.add(mesh(mg.teeth, mat('gloss', '#f8f6f0')));
    if (mg.tongue) skull.add(mesh(mg.tongue, mat('skin', '#d4646e')));
    // a little nod while talking
    if (talk) pose.b.Head = (pose.b.Head || [0, 0, 0]).map((v, i) => v + [2.2 * Math.sin(t * 5.3) * (.4 + lip.open), 1.2 * Math.sin(t * 2.1), 0][i]);

    // the trunk's skin takes the bones as they stand now, at rest, before the pose turns them
    root.updateMatrixWorld(true); shirt.bind(new T.Skeleton([spine, chest]));
    // the acting pose on the bones (the rest is arms hanging, feet together, facing +Z)
    body.traverse(n => { if (n.isBone && pose.b[n.name]) { const [x, y, z] = pose.b[n.name]; n.rotation.set(deg(x), deg(y), deg(z), 'XYZ'); } });
    root.userData.toonOf = P.id; root.userData.toon = { k, B, L, st, head, neck, skull };
    return root;
  }

  World.custom.toon = (P, t = 0) => {
    const g = new T.Group(), f = figure(P, t);
    // a pose from the scene editor (presets, joints by hand, pose keys) over the acting
    World.poseHook?.(f, P, t);
    g.add(f); g.scale.setScalar(M); return g;
  };
  World.PARTS.push('toon');
  // where a camera aims on a character: its face, unless told the body or the feet
  const aimWas = World.aimHeight;
  World.aimHeight = (Q, a) => {
    if (Q?.type !== 'toon') return aimWas ? aimWas(Q, a) : null;
    const B = BUILDS[Q.build] || BUILDS.kid, L = layoutOf(B), k = clamp(+Q.height || B.h, .3, 6) / L.top;
    return (a === 'feet' ? .1 : a === 'body' ? L.hip * 1.15 : L.headC) * k;
  };

  // ----- looking at something: the head and then the eyes turn to another prop, or to the camera -----
  // "look": a prop's id or name, or "camera"; "looks": [{t, at}] to change what they look at over time ("at": null
  // to look ahead again). The head turns at most 60° across and 35° up or down, the eyes the rest.
  const lookAtTime = (P, t) => {
    const list = (Array.isArray(P.looks) ? P.looks : []).filter(l => l && 'at' in l).map(l => ({ ...l, t: +l.t || 0 })).sort((a, b) => a.t - b.t);
    if (!list.length) return P.look ? { at: P.look, w: 1 } : null;
    let i = -1; for (let k = 0; k < list.length; k++) if (list[k].t <= t + 1e-6) i = k;
    if (i < 0) return P.look ? { at: P.look, w: 1 } : null;
    const cur = list[i], prev = list[i - 1], f = smooth((t - cur.t) / .35);
    if (f >= 1 || !prev) return cur.at ? { at: cur.at, w: prev ? 1 : f } : null;
    return { at: cur.at, from: prev.at, w: f };
  };
  function targetOf(at, ctx) {
    if (!at) return null;
    if (at === 'camera') return ctx.cam?.position?.clone() || null;
    if (Array.isArray(at)) return new T.Vector3((+at[0] || 0) * M, (+at[1] || 0) * M + ctx.ground, (+at[2] || 0) * M);
    let node = null, Q = null;
    ctx.B.props?.traverse(n => { if (!node && n.userData.toonOf != null && (n.userData.toonOf === at)) node = n; });
    if (node) { const h = node.userData.toon; const p = new T.Vector3(); h.skull.getWorldPosition(p); return p; }
    const f = World.findPart?.(ctx.o.objects, at); Q = f?.P || f;
    const pm = World.partMatrix(ctx.o, Q?.id || at, ctx.t); if (!pm) return null;
    const p = new T.Vector3(); pm.m.decompose(p, new T.Quaternion(), new T.Vector3()); p.y += (+(pm.P.size?.[1]) || 0) * M / 2; return p;
  }
  const turnTo = (bone, target, amount, maxYaw, maxPitch) => {
    // the target in the bone's parent's space, from the bone: how far across and up it is from straight ahead
    const par = bone.parent; par.updateMatrixWorld(true);
    const local = par.worldToLocal(target.clone()).sub(bone.position);
    const yaw = clamp(Math.atan2(local.x, local.z), -maxYaw, maxYaw) * amount, pitch = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -maxPitch, maxPitch) * amount;
    bone.quaternion.premultiply(new T.Quaternion().setFromEuler(new T.Euler(-pitch, yaw, 0, 'YXZ')));
    bone.updateMatrixWorld(true);
  };
  World.stageHooks.push(ctx => {
    const { B, o, t } = ctx; if (!B.props) return;
    const roots = []; B.props.traverse(n => { if (n.userData.toonOf != null && n.userData.toon) roots.push(n); });
    for (const r of roots) {
      const P = (o.objects && World.findPart?.(o.objects, r.userData.toonOf)) || null, Q = P?.P || P; if (!Q) continue;
      const L = lookAtTime(Q, t); if (!L) continue;
      const tgt = targetOf(L.at, { ...ctx }), from = L.from ? targetOf(L.from, { ...ctx }) : null;
      const h = r.userData.toon;
      // the world may be staged more than once for a frame: start each time from the pose, not from the last turn
      const base = h.lookBase || (h.lookBase = { neck: h.neck.quaternion.clone(), head: h.head.quaternion.clone() });
      h.neck.quaternion.copy(base.neck); h.head.quaternion.copy(base.head); r.updateMatrixWorld(true);
      // with no earlier target, it turns from looking ahead; told to look ahead again, it turns back from the last one
      let goal = tgt, w = L.w;
      if (from && tgt) { goal = from.clone().lerp(tgt, L.w); w = 1; } else if (from) { goal = from; w = 1 - L.w; }
      if (!goal || w <= 0) continue;
      turnTo(h.neck, goal, .35 * w, deg(60), deg(35)); turnTo(h.head, goal, .65 * w, deg(60), deg(35));
      // the eyes take what the head could not
      h.skull.updateMatrixWorld(true);
      for (const name of ['LeftEye', 'RightEye']) { const e = h.skull.getObjectByName(name); if (!e) continue; e.quaternion.identity(); turnTo(e, goal, w, deg(35), deg(28)); }
    }
  });

  // ----- scenery to go with the characters: round, soft, simple shapes in the same materials -----
  // kind: tree, bush, rock, bench, fence (size[0] long), lamp, flowers. color is the main colour (leaves, stone, wood,
  // petals), color2 the second (trunk, iron, stalks). seed changes the shape.
  const rngOf = seed => { let v = (Math.abs(seed | 0) || 1) * 9301 % 233280; return () => (v = (v * 9301 + 49297) % 233280) / 233280; };
  const rbox = (w, h, d, r) => once(`rbox|${q3(w)}|${q3(h)}|${q3(d)}|${q3(r)}`, () => new T.RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)));
  const rockGeo = seed => once('rock|' + seed, () => {
    let g = new T.IcosahedronGeometry(1, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv');
    // one point where faces meet, so the rock shades smooth, not cut into facets
    g = T.BufferGeometryUtils?.mergeVertices ? T.BufferGeometryUtils.mergeVertices(g) : g;
    const p = g.attributes.position, r = rngOf(seed), w = [r(), r(), r()].map(v => v * 6);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 1 + .12 * Math.sin(x * 2.1 + w[0]) * Math.cos(y * 1.7 + w[1]) + .08 * Math.sin(z * 2.6 + w[2]); p.setXYZ(i, x * f, Math.max(y * f, -.35), z * f); }
    g.computeVertexNormals(); return g;
  });
  const SCENERY = {
    tree(P, g, r) {
      const h = 1.7, leaf = P.color || '#5fa843', wood = P.color2 || '#7a5236';
      g.add(mesh(limb(h, .09, .15, .05), mat('plain', wood), [0, h, 0]));
      // a crown of round clumps, the biggest on top
      const clumps = [[0, h + .75, 0, 1]];
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r() * .8, d = .55 + r() * .25; clumps.push([Math.cos(a) * d, h + .35 + r() * .55, Math.sin(a) * d, .55 + r() * .25]); }
      clumps.forEach(([x, y, z, s], i) => g.add(mesh(sphere(28), mat('plain', shade(leaf, .88 + .2 * ((i * .37 + r()) % 1))), [x, y, z], [s, s * .88, s])));
    },
    bush(P, g, r) {
      const leaf = P.color || '#4f9a3c';
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r(), d = i ? .3 + r() * .1 : 0, s = i ? .3 + r() * .1 : .42;
        g.add(mesh(sphere(24), mat('plain', shade(leaf, .9 + .15 * r())), [Math.cos(a) * d, s * .8, Math.sin(a) * d], [s, s * .85, s])); }
    },
    rock(P, g) { g.add(mesh(rockGeo(P.seed || 1), mat('plain', P.color || '#7b7f88'), [0, .25, 0], [.6, .4, .5])); },
    bench(P, g) {
      const wood = mat('plain', P.color || '#b5743c'), iron = mat('gloss', P.color2 || '#33363d'), L = 1.6;
      for (let i = 0; i < 3; i++) g.add(mesh(rbox(L, .04, .12, .02), wood, [0, .45, -.14 + i * .14]));
      for (let i = 0; i < 2; i++) { const b = mesh(rbox(L, .11, .035, .015), wood, [0, .62 + i * .15, -.26]); b.rotation.x = deg(-12); g.add(b); }
      for (const x of [-.65, .65]) { g.add(mesh(rbox(.06, .45, .06, .02), iron, [x, .225, .1])); g.add(mesh(rbox(.06, .85, .06, .02), iron, [x, .43, -.25]));
        g.add(mesh(rbox(.06, .05, .42, .02), iron, [x, .43, -.06])); }
    },
    fence(P, g) {
      const len = Math.max(.5, +P.size?.[0] || 4), paint = mat('plain', P.color || '#f2ece0'), n = Math.max(2, Math.round(len / .22));
      for (let i = 0; i < n; i++) { const x = -len / 2 + (i + .5) * len / n; g.add(mesh(rbox(.1, .8, .04, .02), paint, [x, .4, 0]));
        const tip = mesh(new T.ConeGeometry(.071, .08, 4), paint, [x, .84, 0]); tip.rotation.y = Math.PI / 4; tip.scale.z = .4; g.add(tip); }
      for (const y of [.25, .6]) g.add(mesh(rbox(len, .07, .03, .012), paint, [0, y, -.035]));
    },
    lamp(P, g) {
      const iron = mat('gloss', P.color2 || '#2b2f36');
      g.add(mesh(rbox(.24, .1, .24, .03), iron, [0, .05, 0])); g.add(mesh(new T.CylinderGeometry(.04, .055, 2.6, 16), iron, [0, 1.35, 0]));
      g.add(mesh(sphere(28), mat('glow', P.color || '#ffe3a6'), [0, 2.85, 0], .2)); g.add(mesh(new T.ConeGeometry(.16, .12, 16), iron, [0, 3.08, 0]));
    },
    // a lawn: size[0] across, flat in the middle and rising into soft hills at its edge, in two greens
    lawn(P, g) {
      const R = Math.max(8, +P.size?.[0] || 80) / 2, n = 120, sd = (+P.seed || 1) * 1.7, geo = new T.PlaneGeometry(R * 2, R * 2, n, n); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, col = new Float32Array(p.count * 3), a = World.lin(P.color || '#4f9440'), b = World.lin(P.color2 || '#7fbf56'), c = new T.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z) / R;
        const hill = smooth((d - .4) / .6) * R * .16 * (.55 + .45 * Math.sin(x * .11 + sd) * Math.cos(z * .09 - sd));
        p.setY(i, hill + .04 * Math.sin(x * .7 + sd) * Math.sin(z * .6));
        const f = clamp(.5 + .3 * Math.sin(x * .23 + Math.sin(z * .17 + sd) * 2) * Math.cos(z * .19 - x * .05) + .2 * smooth((d - .5) / .5), 0, 1);
        c.copy(a).lerp(b, f); col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals();
      const m = once('lawnMat', () => { const x = new T.MeshPhysicalMaterial({ vertexColors: true, roughness: .95 }); x.userData.toon = 'plain'; return x; });
      const lawn = mesh(geo, m); lawn.userData.noInk = false; g.add(lawn);
    },
    flowers(P, g, r) {
      const stalk = mat('plain', P.color2 || '#4c8a34'), cols = P.color ? [P.color] : ['#f2c94c', '#ef6f6c', '#f7f3ea', '#b07cd8'];
      for (let i = 0; i < 14; i++) { const a = r() * TAU, d = Math.sqrt(r()) * .45, h = .18 + r() * .14, x = Math.cos(a) * d, z = Math.sin(a) * d;
        g.add(mesh(new T.CylinderGeometry(.008, .01, h, 5), stalk, [x, h / 2, z])); g.add(mesh(sphere(12), mat('plain', cols[i % cols.length]), [x, h + .02, z], [.045, .03, .045])); }
    },
  };
  const SCENERY_LIST = Object.keys(SCENERY);
  World.custom.scenery = P => {
    const g = new T.Group(), make = SCENERY[P.kind] || SCENERY.tree; make(P, g, rngOf(P.seed || 1));
    g.traverse(n => { if (n.isMesh) { n.castShadow = P.kind !== 'lawn'; n.receiveShadow = true; } });
    const out = new T.Group(); out.add(g); out.scale.setScalar(M); return out;
  };

  // ----- a short to start from: a family in a park, a big jump, six shots in ten seconds -----
  // A boy runs in and waves; his dad says "Watch this!" and leaps out of the frame; the boy's jaw drops; the dad lands
  // hard and strikes a pose; the mom calls him a show-off while the boy cheers. Every time in it is in seconds, so
  // set the project to 10 s.
  World.PRESETS.cartoon = { label: 'Cartoon short', hint: 'A ten second cartoon in a park: a family, a big jump, six shots, in the animated feature look',
    p: { sky: 'day', sunEl: 36, sunAz: 145, sunPower: 105, clouds: 25, wind: 1, ground: 'none', fog: 3, dust: 0, eye: 1.6, heading: 0, pitch: 0, travel: 0,
      lens: 35, focus: 0, dof: 18, exposure: .3, bloom: 16, grain: 4, fringe: 3, ao: 45, streaks: 0, flare: 0, godrays: 0, letterbox: 'none', render: 'preview',
      style: 'feature', ink: 100, rim: 70 },
    objects: () => [
      { type: 'scenery', kind: 'lawn', name: 'Lawn', at: [0, 0, 0], size: [90, 1, 90] },
      { type: 'scenery', kind: 'tree', name: 'Tree', at: [-4.2, 0, -4.5], seed: 2 }, { type: 'scenery', kind: 'tree', name: 'Big tree', at: [4.6, 0, -6.5], seed: 5, scale: 1.3 },
      { type: 'scenery', kind: 'tree', name: 'Far tree', at: [-9, 0, -12], seed: 8, scale: 1.5 }, { type: 'scenery', kind: 'tree', name: 'Far tree', at: [10, 0, -14], seed: 3, scale: 1.6 },
      { type: 'scenery', kind: 'bush', name: 'Bush', at: [-2.6, 0, -2.4], seed: 3 }, { type: 'scenery', kind: 'bush', name: 'Bush', at: [3.4, 0, -2.2], seed: 6 },
      { type: 'scenery', kind: 'rock', name: 'Rock', at: [3.3, 0, .6], seed: 4 },
      { type: 'scenery', kind: 'bench', name: 'Bench', at: [.6, 0, -3.1] }, { type: 'scenery', kind: 'fence', name: 'Fence', at: [0, 0, -8], size: [16, 1, 1] },
      { type: 'scenery', kind: 'lamp', name: 'Lamp', at: [-1.9, 0, -3.4] }, { type: 'scenery', kind: 'flowers', name: 'Flowers', at: [2.2, 0, -2.6], seed: 7 },
      { type: 'scenery', kind: 'flowers', name: 'Flowers', at: [-3.4, 0, -.8], seed: 9 },
      // the boy runs in from the left and stops by his dad. They are placed so that the camera sees their faces when
      // they look at each other: the boy further back, his dad nearer the camera
      { id: 'boy', type: 'toon', name: 'Boy', build: 'kid', hairStyle: 'spiky', top: '#e8553f', bottom: '#2f4a6d', at: [-1.3, 0, -.9],
        keys: { at: [{ t: 0, v: [-7, 0, -.9], ease: 'linear' }, { t: 1.4, v: [-2.7, 0, -.9], ease: 'sineOut' }, { t: 1.95, v: [-1.3, 0, -.9] }], turn: [{ t: 0, v: [0, 90, 0] }, { t: 2, v: [0, 90, 0] }, { t: 2.4, v: [0, 45, 0] }] },
        acts: [{ t: 0, do: 'run' }, { t: 1.95, do: 'wave', mood: 'joy' }, { t: 3.4, do: 'idle', mood: 'happy' }, { t: 4.4, do: 'take' }, { t: 5.6, do: 'cheer', mood: 'joy' }, { t: 7.7, do: 'dance', mood: 'laugh' }],
        looks: [{ t: 1.7, at: 'dad' }] },
      // the dad: a boast to the camera, a jump twice his height, a landing that squashes him, a pose
      { id: 'dad', type: 'toon', name: 'Dad', build: 'strong', hairStyle: 'swoop', hair: '#3b2417', top: '#e8b84a', bottom: '#3d4450', at: [1, 0, .6], turn: [0, -30, 0],
        acts: [{ t: 0, do: 'proud' }, { t: 2.75, do: 'talk', mood: 'determined' }, { t: 3.6, do: 'jump', height: 1.6 }, { t: 6.1, do: 'proud', mood: 'smug' }, { t: 8.3, do: 'cheer', mood: 'laugh' }],
        say: [{ t: 2.8, text: 'Watch this!' }], looks: [{ t: 0, at: 'boy' }, { t: 2.7, at: 'camera' }, { t: 3.5, at: null }, { t: 6.2, at: 'camera' }] },
      // the mom, by the bench: she watches, then says what she thinks of it
      { id: 'mom', type: 'toon', name: 'Mom', build: 'tall', hair: '#6b2e1a', hairStyle: 'bun', top: '#3a8f9a', bottom: '#4a3b6b', at: [-.2, 0, -2.6], turn: [0, 15, 0],
        acts: [{ t: 0, do: 'idle', mood: 'happy' }, { t: 3.5, do: 'idle', mood: 'worried' }, { t: 6.7, do: 'shrug', mood: 'smug' }, { t: 8.4, do: 'idle', mood: 'happy' }],
        say: [{ t: 6.8, text: 'Show-off.' }], looks: [{ t: 0, at: 'boy' }, { t: 3.4, at: 'dad' }, { t: 6.6, at: 'camera' }, { t: 8.2, at: 'boy' }] },
      // the cameras, in the order they are cut to
      { id: 'track', type: 'camera', name: 'Tracking', at: [-4, 1.1, 2.6], follow: 'boy', offset: [.8, .9, 3.4], lag: .25, lens: 32 },
      { id: 'wide', type: 'camera', name: 'Wide', at: [-.4, 1.4, 4.8], lookAt: 'mom', aim: 'body', lens: 30 },
      { id: 'dadmid', type: 'camera', name: 'Dad medium', at: [1.6, 1.35, 3.9], lookAt: 'dad', aim: 'body', lens: 36 },
      { id: 'boycu', type: 'camera', name: 'Boy close', at: [-.25, .7, .55], lookAt: 'boy', lens: 42 },
      { id: 'landing', type: 'camera', name: 'Landing', at: [2, .45, 2.9], lookAt: 'dad', aim: 'body', lens: 26 },
      { id: 'family', type: 'camera', name: 'Family', at: [.1, 1.4, 5], lookAt: 'mom', aim: 'body', lens: 30,
        keys: { at: [{ t: 6.6, v: [.1, 1.4, 5], ease: 'sineInOut' }, { t: 10, v: [.1, 1.3, 4.2] }] } },
    ],
    shots: [{ t: 0, cam: 'track' }, { t: 1.6, cam: 'wide' }, { t: 2.7, cam: 'dadmid' }, { t: 4.35, cam: 'boycu' }, { t: 5.2, cam: 'landing' }, { t: 6.6, cam: 'family' }] };

  // ----- in the scene editor -----
  SceneEd.add('toon', { type: 'toon', build: 'kid', face: 'travel', acts: [{ t: 0, do: 'idle' }] }, 'Character');
  for (const k of SCENERY_LIST) SceneEd.add('scenery', { type: 'scenery', kind: k, seed: 1, ...(k === 'fence' ? { size: [4, 1, 1] } : {}) }, `Scenery: ${k}`);
  const opt = (k, v, list) => `<select data-k="${k}">${list.map(([a, b]) => `<option value="${a}"${String(v ?? '') === a ? ' selected' : ''}>${b}</option>`).join('')}</select>`;
  const col = (k, v, label) => `<label class="f"><span>${label}</span><input type="color" data-k="${k}" value="${v}"></label>`;
  // scenery: which piece, its shape and its second colour (its main colour is the usual Colour)
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'scenery') return '';
      const names = { tree: 'Tree', bush: 'Bush', rock: 'Rock', bench: 'Bench', fence: 'Fence (Size: its length)', lamp: 'Park lamp', flowers: 'Flowers', lawn: 'Lawn (Size: across)' };
      return `<div class="hd">Scenery</div>
        <label class="f wide"><span>Kind</span><select data-k="kind">${SCENERY_LIST.map(k => `<option value="${k}"${(P.kind || 'tree') === k ? ' selected' : ''}>${names[k] || k}</option>`).join('')}</select></label>
        <label class="f"><span>Shape</span><input type="number" step="1" data-k="seed" value="${+P.seed || 1}"></label>
        <label class="f"><span>Colour 2</span><input type="color" data-k="color2" value="${P.color2 || '#7a5236'}"></label>`;
    },
  });
  SceneEd.extras.push({
    inspector(P) {
      if (P.type !== 'toon') return '';
      const B = BUILDS[P.build] || BUILDS.kid, acts = actsOf(P);
      return `<div class="hd">Character</div>
        <label class="f"><span>Build</span>${opt('build', P.build || 'kid', BUILD_LIST)}</label>
        <label class="f"><span>Height m</span><input type="number" step=".05" data-k="height" value="${+P.height || B.h}"></label>
        <label class="f"><span>Hair</span>${opt('hairStyle', P.hairStyle || B.hairStyle, HAIR_LIST)}</label>
        <label class="f"><span>Outfit</span>${opt('outfit', P.outfit || 'casual', [['casual', 'Everyday clothes'], ['suit', 'Hero suit']])}</label>
        <label class="f"><span>Sleeves</span>${opt('sleeves', P.sleeves || B.sleeves, [['long', 'Long'], ['short', 'Short'], ['none', 'None']])}</label>
        <label class="f"><span>Legs</span>${opt('legs', P.legs || B.legs, [['trousers', 'Trousers'], ['shorts', 'Shorts'], ['skirt', 'Skirt']])}</label>
        <label class="f"><span>Mood</span>${opt('mood', P.mood || 'neutral', MOOD_LIST)}</label>
        <label class="f"><span>Squash %</span><input type="number" step="10" data-k="squash" value="${P.squash ?? 100}"></label>
        ${col('skin', P.skin || '#e0a98a', 'Skin')}${col('hair', P.hair || '#3b2417', 'Hair colour')}${col('eyes', P.eyes || '#5b3a22', 'Eyes')}
        ${col('top', P.top || '#3f8fc9', 'Top')}${col('bottom', P.bottom || '#33415c', 'Bottom')}${col('shoes', P.shoes || '#f3efe6', 'Shoes')}
        ${P.outfit === 'suit' ? col('accent', P.accent || '#f2b134', 'Gloves and boots') : ''}
        <label class="f wide"><span>Says</span><input type="text" data-k="say" value="${typeof P.say === 'string' ? P.say.replace(/"/g, '&quot;') : ''}"></label>
        <label class="f"><span>From s</span><input type="number" step=".1" data-k="sayAt" value="${+P.sayAt || 0}"></label>
        <label class="f wide"><span>Looks at</span><input type="text" data-k="look" placeholder="a prop's id, or camera" value="${P.look || ''}"></label>
        <div class="hd">Acts</div>
        ${acts.map((a, i) => `<label class="f"><span>${a.t.toFixed(1)} s</span><select data-toon-act="${i}">${ACT_LIST.map(([v, l]) => `<option value="${v}"${a.do === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`).join('')}
        <label class="f wide"><span>At the playhead</span><select data-toon-add><option value="">Add an act…</option>${ACT_LIST.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
        <p class="note">Acts ease into each other. A jump, a shrug or a take is done in a second or so and goes back to standing. Pose any joint below on top of the acting.</p>`;
    },
    input(el, P) {
      if (P?.type !== 'toon') return false;
      if (el.dataset.toonAct != null) { const acts = actsOf(P), i = +el.dataset.toonAct; if (acts[i]) { acts[i].do = el.value; P.acts = acts; } return true; }
      if (el.dataset.toonAdd != null && el.value) {
        const t = typeof S !== 'undefined' ? +(S.t || 0) : 0, acts = actsOf(P).filter(a => Math.abs(a.t - t) > .01); acts.push({ t: Math.round(t * 10) / 10, do: el.value });
        P.acts = acts.sort((a, b) => a.t - b.t); return true;
      }
      return false;
    },
  });

  return { BUILDS, MOODS, ACTIONS, figure, moods: MOOD_LIST, acts: ACT_LIST, builds: BUILD_LIST, hairStyles: HAIR_LIST, scenery: SCENERY_LIST };
})();
