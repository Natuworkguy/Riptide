// ---------- giving a model a skeleton, so it can be posed ----------
// A character made as a plain 3D model (an .obj, or a .glb or .fbx with no bones) has nothing to pose. Here it is
// given a skeleton, the way an auto-rigger does: the model is measured (its height, where its body is widest, where
// its arms leave its sides and whether they are held out or hang, where its legs part), joints are placed for a hips,
// spine, chest, neck and head, two arms to the hands and two legs to the feet, named as rigs name them, and every
// point of its surface is bound to the bones nearest it, more to the nearer, so it bends smoothly at the joints.
// Then the pose presets (wave, point, sit...), turning joints by hand and keyed poses all work on it, as on any
// rigged model. It assumes a figure standing upright, as characters are modelled; one modelled facing away can be
// turned round (its left and right swap).
(() => {
  const T = window.RiptideThree; if (!T || typeof World === 'undefined') return;
  const v3 = (x, y, z) => new T.Vector3(x, y, z);

  // points spread over the model's whole surface (not just its corners, which a plain model has few of), in the
  // model's own space: so many on each face for its size
  function pointsOf(root) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), tris = [];
    let area = 0;
    root.traverse(m => { if (!m.isMesh || m.isSkinnedMesh) return;
      const geo = m.geometry, pos = geo.attributes.position, idx = geo.index, mat = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const n = idx ? idx.count : pos.count, at = i => new T.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mat);
      for (let i = 0; i + 2 < n; i += 3) { const a = at(i), b = at(i + 1), c = at(i + 2), s = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(c, a)).length() / 2;
        tris.push([a, b, c, s]); area += s; } });
    const want = 40000, pts = []; let r = 7;
    const rnd = () => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (const [a, b, c, s] of tris) {
      let k = s / area * want; const whole = Math.floor(k); k = whole + (rnd() < k - whole ? 1 : 0); k = Math.max(k, 1);
      for (let j = 0; j < k; j++) { let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
        pts.push(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v); }
    }
    return new Float32Array(pts);
  }
  const quantile = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

  // ----- where the joints go -----
  function measure(pts, mirror) {
    const n = pts.length / 3; let y0 = Infinity, y1 = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { y0 = Math.min(y0, pts[i * 3 + 1]); y1 = Math.max(y1, pts[i * 3 + 1]); cx += pts[i * 3]; cz += pts[i * 3 + 2]; }
    cx /= n; cz /= n; const H = y1 - y0, at = f => y0 + f * H, s = mirror ? -1 : 1;
    const slice = (a, b) => { const xs = [], zs = []; for (let i = 0; i < n; i++) { const y = pts[i * 3 + 1]; if (y >= at(a) && y <= at(b)) { xs.push(pts[i * 3] - cx); zs.push(pts[i * 3 + 2] - cz); } } return { xs, zs }; };
    // the trunk: out from the middle until the first gap, which is between the body and an arm hanging beside it
    // (no gap, the arms held out or touching: most of the points at the waist are body)
    const waist = slice(.5, .75), bin = H / 120, occ = new Uint8Array(200);
    for (const x of waist.xs) { const k = Math.floor(Math.abs(x) / bin); if (k < 200) occ[k] = 1; }
    let edge = -1; for (let k = 1; k < 199; k++) if (occ[k - 1] && !occ[k]) { edge = k; break; }
    const tail = edge > 0 && occ.slice(edge).some(Boolean);
    const half = Math.max(H * .05, tail ? edge * bin : quantile(waist.xs.map(Math.abs), .6)), mid = quantile(waist.zs, .5);
    // the arms: whatever sticks out beyond the trunk between the hips and the shoulders, on each side
    const arm = side => {
      const p = []; for (let i = 0; i < n; i++) { const x = (pts[i * 3] - cx) * side, y = pts[i * 3 + 1]; if (y > at(.38) && y < at(.86) && x > half * 1.08) p.push([x, y, pts[i * 3 + 2] - cz]); }
      if (p.length < 8) return null;
      // the hand is the point of the arm furthest from the top of the trunk; the shoulder is where the arm meets it
      const top = v3(half * .9, at(.8), mid); let far = p[0], fd = 0;
      for (const q of p) { const d = Math.hypot(q[0] - top.x, q[1] - top.y, (q[2] - top.z) * .5); if (d > fd) { fd = d; far = q; } }
      // the shoulder: the middle of the arm near its top
      const high = p.filter(q => q[1] > at(.74)), sx = high.length ? quantile(high.map(q => q[0]), .5) : half * 1.1;
      return { shoulder: v3(Math.max(half * .9, sx), at(.8), mid), hand: v3(far[0], far[1], far[2]) };
    };
    // the legs: what is below the crotch, left and right of the middle
    const leg = side => { const xs = []; for (let i = 0; i < n; i++) { const x = (pts[i * 3] - cx) * side, y = pts[i * 3 + 1]; if (y < at(.35) && y > at(.05) && x > 0) xs.push(x); }
      return xs.length ? quantile(xs, .5) : half * .45; };
    const J = {}, put = (name, p, side = 0) => { J[name] = v3(cx + p.x * (side || 1) * (side ? s : 1), p.y, cz + p.z); };
    put('Hips', v3(0, at(.52), mid)); put('Spine', v3(0, at(.6), mid)); put('Spine1', v3(0, at(.7), mid)); put('Neck', v3(0, at(.84), mid)); put('Head', v3(0, at(.88), mid));
    put('HeadTop_End', v3(0, y1, mid));
    for (const [side, nm] of [[1, 'Left'], [-1, 'Right']]) {
      const a = arm(side) || { shoulder: v3(half * .85, at(.8), mid), hand: v3(half * 1.1, at(.45), mid) };
      const elbow = a.shoulder.clone().lerp(a.hand, .5), wrist = a.shoulder.clone().lerp(a.hand, .86);
      put(nm + 'Shoulder', v3(half * .35, at(.8), mid), side); put(nm + 'Arm', a.shoulder, side); put(nm + 'ForeArm', elbow, side); put(nm + 'Hand', wrist, side);
      put(nm + 'HandTip', a.hand, side);
      const lx = leg(side); put(nm + 'UpLeg', v3(lx, at(.5), mid), side); put(nm + 'Leg', v3(lx, at(.27), mid), side); put(nm + 'Foot', v3(lx, at(.05), mid), side);
      put(nm + 'ToeBase', v3(lx, at(.01), mid + H * .06), side);
    }
    return { J, H, half };
  }

  // ----- the skeleton: bones placed at the joints, each child where its joint is from its parent's -----
  const TREE = [['Hips', null], ['Spine', 'Hips'], ['Spine1', 'Spine'], ['Neck', 'Spine1'], ['Head', 'Neck'], ['HeadTop_End', 'Head'],
    ...['Left', 'Right'].flatMap(s => [[s + 'Shoulder', 'Spine1'], [s + 'Arm', s + 'Shoulder'], [s + 'ForeArm', s + 'Arm'], [s + 'Hand', s + 'ForeArm'], [s + 'HandTip', s + 'Hand'],
      [s + 'UpLeg', 'Hips'], [s + 'Leg', s + 'UpLeg'], [s + 'Foot', s + 'Leg'], [s + 'ToeBase', s + 'Foot']])];
  // the bones a point can belong to: each a segment from its joint to the next one down its chain
  const SEGMENTS = [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop_End'],
    ...['Left', 'Right'].flatMap(s => [[s + 'Shoulder', s + 'Arm'], [s + 'Arm', s + 'ForeArm'], [s + 'ForeArm', s + 'Hand'], [s + 'Hand', s + 'HandTip'],
      [s + 'UpLeg', s + 'Leg'], [s + 'Leg', s + 'Foot'], [s + 'Foot', s + 'ToeBase']])];

  World.autoRig = (root, opts = {}) => {
    let has = false; root.traverse(n => { if (n.isBone || n.isSkinnedMesh) has = true; }); if (has) return false;
    const pts = pointsOf(root); if (pts.length < 30) return false;
    const { J, H, half: trunk } = measure(pts, !!opts.mirror);
    const bones = {}, list = [];
    for (const [name, parent] of TREE) {
      const b = new T.Bone(); b.name = name; bones[name] = b; list.push(b);
      if (parent) { bones[parent].add(b); b.position.copy(J[name]).sub(J[parent]); } else b.position.copy(J[name]);
    }
    // the skeleton hangs from the model itself; its bones' places worked out before the rest pose is taken from them
    root.add(list[0]); root.updateMatrixWorld(true);
    const skeleton = new T.Skeleton(list), index = new Map(list.map((b, i) => [b.name, i]));
    // which side of the body a point is on, so an arm never pulls the trunk or the other arm with it
    const cx = J.Hips.x, half = trunk, sideOf = name => (name.startsWith('Left') ? 1 : name.startsWith('Right') ? -1 : 0) * (opts.mirror ? -1 : 1);
    const segs = SEGMENTS.map(([a, b]) => ({ a: J[a], b: J[b], bone: index.get(a), name: a, arm: /Arm|Hand|Shoulder/.test(a), leg: /Leg|Foot|Toe/.test(a) }));
    const ab = new T.Vector3(), ap = new T.Vector3(), q = new T.Vector3();
    const dist = (p, s) => { ab.subVectors(s.b, s.a); ap.subVectors(p, s.a); const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-9, ab.lengthSq()))); q.copy(s.a).addScaledVector(ab, t); return p.distanceTo(q); };
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), meshes = [];
    root.traverse(m => { if (m.isMesh && !m.isSkinnedMesh) meshes.push(m); });
    for (const m of meshes) {
      // the mesh's points in the model's space, its own placing built into them
      const geo = m.geometry.clone(); geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const pos = geo.attributes.position, nv = pos.count, si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), p = new T.Vector3();
      for (let i = 0; i < nv; i++) {
        p.fromBufferAttribute(pos, i);
        const x = (p.x - cx), y = p.y, side = Math.sign(x);
        // a point out past the trunk at arm height is an arm's; below the hips, a leg's on its side
        // (arms hang down past the hips, so outside the trunk is arm down to well below them)
        const armZone = Math.abs(x) > half * 1.02 && y > J.Hips.y - H * .2 && y < J.Neck.y + H * .04, legZone = !armZone && y < J.Hips.y - H * .03;
        const cands = segs.filter(s => {
          const sd = sideOf(s.name);
          if (armZone) return s.arm && sd === side;
          if (legZone) return s.leg && (sd === side || Math.abs(x) < H * .01);
          return !s.leg && !(s.arm && !/Shoulder/.test(s.name)) || (s.arm && /Shoulder/.test(s.name) && sd === side) || (s.leg && /UpLeg/.test(s.name) && y > J.Hips.y - H * .08);
        });
        const scored = (cands.length ? cands : segs).map(s => ({ s, d: dist(p, s) })).sort((a, b) => a.d - b.d).slice(0, 3);
        let tot = 0; const w = scored.map(({ d }) => { const v = 1 / Math.pow(d + H * .02, 4); tot += v; return v; });
        scored.forEach(({ s }, k) => { si[i * 4 + k] = s.bone; sw[i * 4 + k] = w[k] / tot; });
      }
      geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
      const sk = new T.SkinnedMesh(geo, m.material); sk.name = m.name; sk.castShadow = m.castShadow; sk.receiveShadow = m.receiveShadow;
      m.parent.remove(m); root.add(sk); sk.updateMatrixWorld(true); sk.bind(skeleton);
    }
    root.userData.autoRigged = true;
    return true;
  };
})();
