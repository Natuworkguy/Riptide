// A humanoid figure: a mannequin whose joints are layer properties, so every one can be keyframed, posed by
// dragging on the canvas, driven by the pose presets, or handed to the physics as a ragdoll.
//
// Angles are in degrees. 0 everywhere is standing straight with the arms hanging. A positive angle turns a limb
// clockwise, as the canvas turns things: a positive hip swings the leg towards the left of the screen, a positive
// knee folds the shin back the same way. Shoulder, elbow, hip and knee are each relative to the part above, the
// spine to the hips and the neck to the chest. "Side" turns the figure from facing you (0) to side on (100).
const Figure = (() => {
  const JOINTS = ['neck', 'spine', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
  const LABELS = { neck: 'Neck°', spine: 'Spine°', shoulderL: 'L shoulder°', elbowL: 'L elbow°', shoulderR: 'R shoulder°', elbowR: 'R elbow°',
    hipL: 'L hip°', kneeL: 'L knee°', hipR: 'R hip°', kneeR: 'R knee°', side: 'Side view %', limb: 'Limb width %', caps: 'Joint caps %' };
  // lengths in units of u, an eighth and a bit of the height
  const U = 8.4, TORSO = 3, NECK_UP = .75, HEAD_R = .62, UPPER_ARM = 1.45, FOREARM = 1.35, THIGH = 1.95, SHIN = 1.95, PELVIS_Y = .15;
  const R = d => d * Math.PI / 180;
  // the direction a limb at angle a points: straight down at 0
  const dir = a => [-Math.sin(R(a)), Math.cos(R(a))];
  const add = (p, a, len) => { const [dx, dy] = dir(a); return [p[0] + dx * len, p[1] + dy * len]; };
  const angleOf = (dx, dy) => Math.atan2(-dx, dy) * 180 / Math.PI;

  function sizes(o) {
    const u = Math.abs(o.h) / U, wide = Math.max(.2, Math.abs(o.w) / (Math.abs(o.h) * .5 || 1));
    const side = Math.max(0, Math.min(1, (o.side ?? 0) / 100));
    return { u, wide, side, thick: u * .46 * (o.limb ?? 100) / 100 * Math.min(1.6, wide) };
  }

  // Every joint's point, in the layer's own coordinates (its centre at 0,0, before it is moved, turned or scaled).
  function joints(o) {
    const { u, wide, side } = sizes(o), g = 1 - side * .85;
    const pelvis = [0, PELVIS_Y * u];
    const spine = o.spine || 0;
    const chest = add(pelvis, spine + 180, TORSO * u);
    const shoulderAt = add(pelvis, spine + 180, (TORSO - .3) * u);
    const across = [Math.cos(R(spine)), Math.sin(R(spine))];
    const sh = .88 * u * wide * g, hp = .38 * u * wide * g;
    const shoulderL = [shoulderAt[0] - across[0] * sh, shoulderAt[1] - across[1] * sh];
    const shoulderR = [shoulderAt[0] + across[0] * sh, shoulderAt[1] + across[1] * sh];
    const head = add(chest, spine + (o.neck || 0) + 180, NECK_UP * u);
    const aL = spine + (o.shoulderL || 0), aR = spine + (o.shoulderR || 0);
    const elbowL = add(shoulderL, aL, UPPER_ARM * u), elbowR = add(shoulderR, aR, UPPER_ARM * u);
    const handL = add(elbowL, aL + (o.elbowL || 0), FOREARM * u), handR = add(elbowR, aR + (o.elbowR || 0), FOREARM * u);
    const hipL = [pelvis[0] - hp, pelvis[1]], hipR = [pelvis[0] + hp, pelvis[1]];
    const kneeL = add(hipL, o.hipL || 0, THIGH * u), kneeR = add(hipR, o.hipR || 0, THIGH * u);
    const footL = add(kneeL, (o.hipL || 0) + (o.kneeL || 0), SHIN * u), footR = add(kneeR, (o.hipR || 0) + (o.kneeR || 0), SHIN * u);
    return { pelvis, chest, head, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hipL, hipR, kneeL, kneeR, footL, footR };
  }

  const shade = (hex, k) => {
    if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) * k);
    return '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  };

  function limb(c, a, b, w) { c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }

  // Drawn as a wooden artist's mannequin: rounded limbs, a tapered chest, a head, and the joints a shade lighter.
  function draw(c, o, fill) {
    const { u, wide, side, thick } = sizes(o), J = joints(o);
    const base = typeof fill === 'string' ? fill : o.fill, back = shade(o.fill, .78), light = shade(o.fill, 1.18);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const outline = o.strokeWidth > 0;
    const part = (col, fn) => {
      if (outline) { c.strokeStyle = o.stroke; c.lineWidth = 0; fn(o.stroke, o.strokeWidth * 2); }
      c.strokeStyle = col; fn(col, 0);
    };
    const leg = (s, col) => part(col, (cl, extra) => { c.strokeStyle = cl;
      limb(c, J['hip' + s], J['knee' + s], thick * 1.15 + extra); limb(c, J['knee' + s], J['foot' + s], thick + extra);
      // a foot, pointing the way the figure faces when it is side on
      const toe = (o.sx ?? 1) < 0 ? -1 : 1, f = J['foot' + s];
      limb(c, f, [f[0] + toe * u * (.25 + .35 * side), f[1] + u * .08], thick * .8 + extra); });
    const arm = (s, col) => part(col, (cl, extra) => { c.strokeStyle = cl;
      limb(c, J['shoulder' + s], J['elbow' + s], thick + extra); limb(c, J['elbow' + s], J['hand' + s], thick * .9 + extra); });
    // the far side first, darker, so it reads as behind when the figure is turned
    leg('L', back); arm('L', back);
    // the chest: a rounded wedge from the hips to the shoulders
    const sp = o.spine || 0, across = [Math.cos(R(sp)), Math.sin(R(sp))], g = 1 - side * .55;
    const top = 1.05 * u * wide * g, bot = .62 * u * wide * g;
    const shoulderAt = add(J.pelvis, sp + 180, (TORSO - .15) * u), waist = add(J.pelvis, sp + 180, .1 * u);
    const pts = [[shoulderAt[0] - across[0] * top, shoulderAt[1] - across[1] * top], [shoulderAt[0] + across[0] * top, shoulderAt[1] + across[1] * top],
      [waist[0] + across[0] * bot, waist[1] + across[1] * bot], [waist[0] - across[0] * bot, waist[1] - across[1] * bot]];
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    c.fillStyle = base; c.lineWidth = thick * .7; c.strokeStyle = base; c.stroke(); c.fill();
    if (outline) { c.lineWidth = o.strokeWidth; c.strokeStyle = o.stroke; c.stroke(); }
    // the neck and head
    part(base, (cl, extra) => { c.strokeStyle = cl; limb(c, J.chest, add(J.chest, sp + (o.neck || 0) + 180, .35 * u), thick * .7 + extra); });
    c.beginPath(); c.ellipse(J.head[0], J.head[1], HEAD_R * u * (1 - side * .08), HEAD_R * u * 1.12, R(sp + (o.neck || 0)), 0, Math.PI * 2);
    c.fillStyle = base; c.fill(); if (outline) { c.lineWidth = o.strokeWidth; c.strokeStyle = o.stroke; c.stroke(); }
    leg('R', base); arm('R', base);
    // joints, a little lighter, as strong as Joint caps says: 0 hides them
    const caps = Math.max(0, Math.min(100, o.caps ?? 100)) / 100;
    if (caps > 0) {
      const alpha = c.globalAlpha; c.globalAlpha = alpha * caps; c.fillStyle = light;
      for (const k of ['elbowL', 'elbowR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'hipL', 'hipR']) {
        const p = J[k]; c.beginPath(); c.arc(p[0], p[1], thick * (k.startsWith('shoulder') || k.startsWith('hip') ? .52 : .42), 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = alpha;
    }
    for (const k of ['handL', 'handR']) { const p = J[k]; c.beginPath(); c.arc(p[0], p[1], thick * .55, 0, Math.PI * 2); c.fillStyle = k === 'handL' ? back : base; c.fill(); }
  }

  // The points to drag on the canvas, and which joints each turns.
  const HANDLES = [['head', 'neck'], ['chest', 'spine'], ['elbowL', 'shoulderL'], ['handL', 'armL'], ['elbowR', 'shoulderR'], ['handR', 'armR'],
    ['kneeL', 'hipL'], ['footL', 'legL'], ['kneeR', 'hipR'], ['footR', 'legR']];

  // Two-bone reach: the angles of the first and second bone that put the end at TARGET from ROOT, bending the way
  // the limb bends now. BASE is the angle the first bone is measured from.
  function reach(root, target, l1, l2, base, bendSign) {
    const dx = target[0] - root[0], dy = target[1] - root[1];
    const d = Math.max(1e-6, Math.min(l1 + l2 - 1e-3, Math.hypot(dx, dy)));
    const toward = angleOf(dx, dy);
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const cosB = Math.max(-1, Math.min(1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
    const sgn = bendSign >= 0 ? 1 : -1;
    const first = toward - sgn * Math.acos(cosA) * 180 / Math.PI;
    const bend = sgn * (180 - Math.acos(cosB) * 180 / Math.PI);
    return [first - base, bend];
  }

  // The joint angles that put handle WHICH (a name from HANDLES) at local point P; {} when it changes nothing.
  function pose(o, which, p) {
    const { u } = sizes(o), J = joints(o), sp = o.spine || 0;
    const norm = a => ((a + 540) % 360) - 180;
    if (which === 'neck') return { neck: Math.max(-80, Math.min(80, norm(angleOf(p[0] - J.chest[0], p[1] - J.chest[1]) - 180 - sp))) };
    if (which === 'spine') return { spine: Math.max(-120, Math.min(120, norm(angleOf(p[0] - J.pelvis[0], p[1] - J.pelvis[1]) - 180))) };
    if (which === 'shoulderL' || which === 'shoulderR') {
      const s = which.slice(-1), at = J['shoulder' + s];
      return { [which]: norm(angleOf(p[0] - at[0], p[1] - at[1]) - sp) };
    }
    if (which === 'hipL' || which === 'hipR') {
      const s = which.slice(-1), at = J['hip' + s];
      return { [which]: norm(angleOf(p[0] - at[0], p[1] - at[1])) };
    }
    if (which === 'armL' || which === 'armR') {
      const s = which.slice(-1), bend = o['elbow' + s] || (s === 'L' ? -1 : 1);
      const [a, b] = reach(J['shoulder' + s], p, UPPER_ARM * u, FOREARM * u, sp, bend);
      return { ['shoulder' + s]: norm(a), ['elbow' + s]: norm(b) };
    }
    if (which === 'legL' || which === 'legR') {
      const s = which.slice(-1), bend = o['knee' + s] || 1;
      const [a, b] = reach(J['hip' + s], p, THIGH * u, SHIN * u, 0, bend);
      return { ['hip' + s]: norm(a), ['knee' + s]: norm(b) };
    }
    return {};
  }

  // Poses for the presets: a frame each, joints only.
  const STAND = Object.fromEntries(JOINTS.map(j => [j, 0]));
  const POSES = {
    stand: STAND,
    tpose: { ...STAND, shoulderL: 90, shoulderR: -90 },
    sit: { ...STAND, hipL: -90, hipR: -90, kneeL: 90, kneeR: 90, shoulderL: -15, shoulderR: -15, elbowL: -40, elbowR: -40 },
    crouch: { ...STAND, spine: -10, hipL: -60, hipR: -60, kneeL: 110, kneeR: 110, shoulderL: -30, shoulderR: -30, elbowL: -30, elbowR: -30 },
    reach: { ...STAND, shoulderL: 160, shoulderR: -160, elbowL: 10, elbowR: -10, spine: 0 },
    cheer: { ...STAND, shoulderL: 145, shoulderR: -145, elbowL: 25, elbowR: -25, neck: 0 },
  };

  return { JOINTS, LABELS, joints, draw, sizes, pose, HANDLES, POSES, UNITS: { U, TORSO, NECK_UP, HEAD_R, UPPER_ARM, FOREARM, THIGH, SHIN, PELVIS_Y }, angleOf, dir };
})();
