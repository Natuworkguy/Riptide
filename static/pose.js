// ---------- posing a figure ----------
// A rigged model (a .glb or .gltf with a skeleton, from Mixamo, a VRM, Blender, Unreal...) can be posed in the scene
// editor: a preset for the whole body (sitting, on a throne, arms down, waving, pointing), then any joint turned by
// hand. The pose is kept on the prop as each bone's turn from its rest pose, in degrees (P.pose), laid over its
// animation clip if it plays one; and keyed at the playhead it becomes poseKeys, eased from key to key.
// Presets aim each limb in a direction in the model's own space (it faces +Z, as glTF models do), so they work on
// any skeleton whose bones are named the usual ways, whatever way its bones' own axes point.
const Pose = (() => {
  const T = window.RiptideThree, deg = d => d * Math.PI / 180, rad = r => r * 180 / Math.PI, r1 = v => Math.round(v * 10) / 10;

  // ----- which bone is which, by the names rigs give them -----
  const clean = n => String(n || '').toLowerCase().replace(/^.*[:|]/, '').replace(/^mixamorig/, '').replace(/[\s_.-]/g, '');
  const SIDES = { l: ['left', 'l'], r: ['right', 'r'] };
  const sided = (side, names) => names.flatMap(n => SIDES[side].flatMap(s => [s + n, n + s]));
  const ROLES = {
    hips: ['hips', 'pelvis', 'hip'], spine: ['spine', 'spine1', 'spine01', 'chest'], neck: ['neck', 'neck01'], head: ['head'],
    ...Object.fromEntries(['l', 'r'].flatMap(s => [
      [`upLeg${s}`, sided(s, ['upleg', 'upperleg', 'thigh'])], [`leg${s}`, sided(s, ['leg', 'lowerleg', 'calf', 'shin', 'knee'])],
      [`arm${s}`, sided(s, ['arm', 'upperarm', 'uparm'])], [`fore${s}`, sided(s, ['forearm', 'lowerarm', 'elbow'])],
      [`hand${s}`, sided(s, ['hand', 'wrist'])], [`foot${s}`, sided(s, ['foot', 'ankle'])],
    ])),
  };
  function rolesOf(root) {
    const bones = []; root.traverse(n => { if (n.isBone) bones.push(n); });
    const found = {};
    for (const [role, names] of Object.entries(ROLES)) {
      const b = bones.find(x => names.includes(clean(x.name)));
      if (b) found[role] = b;
    }
    return { bones, found };
  }

  // ----- applying a pose -----
  const qOf = a => new T.Quaternion().setFromEuler(new T.Euler(deg(a[0] || 0), deg(a[1] || 0), deg(a[2] || 0), 'XYZ'));
  // the pose at T: P.pose, or eased between the keys either side of T
  function poseAt(P, t) {
    const keys = (P.poseKeys || []).filter(k => k && k.pose).sort((a, b) => a.t - b.t);
    if (!keys.length) return P.pose || {};
    if (t <= keys[0].t) return keys[0].pose;
    if (t >= keys.at(-1).t) return keys.at(-1).pose;
    const i = keys.findIndex(k => k.t > t), a = keys[i - 1], b = keys[i], f = (t - a.t) / (b.t - a.t), e = f * f * (3 - 2 * f), out = {};
    for (const name of new Set([...Object.keys(a.pose), ...Object.keys(b.pose)])) {
      const q = qOf(a.pose[name] || [0, 0, 0]).slerp(qOf(b.pose[name] || [0, 0, 0]), e), r = new T.Euler().setFromQuaternion(q, 'XYZ');
      out[name] = [rad(r.x), rad(r.y), rad(r.z)];
    }
    return out;
  }
  // over the rest pose (or the clip's frame): each bone's own turn, kept on it for the gizmo to read back
  World.poseHook = (g, P, t) => {
    const pose = poseAt(P, World.worldTime ? t : t), bones = [];
    g.traverse(n => { if (n.isBone) bones.push(n); });
    for (const b of bones) { b.userData.rest = b.quaternion.clone(); const a = pose[b.name]; if (a) b.quaternion.multiply(qOf(a)); }
    if (bones.length) g.userData.posable = true;
  };
  // a bone's turn from its rest, in degrees: what the gizmo wrote, back into the pose
  function turnOf(b) {
    const q = (b.userData.rest || new T.Quaternion()).clone().invert().multiply(b.quaternion), e = new T.Euler().setFromQuaternion(q, 'XYZ');
    return [r1(rad(e.x)), r1(rad(e.y)), r1(rad(e.z))];
  }

  // ----- presets: each limb aimed in a direction, in the model's own space (+Z ahead, +Y up, +X its left) -----
  const PRESETS = {
    sit: { label: 'Sit', hint: 'On a chair: thighs forward, shins down, hands on the knees',
      aim: { upLegl: [.08, -.05, 1], upLegr: [-.08, -.05, 1], legl: [0, -1, .05], legr: [0, -1, .05],
        arml: [.15, -.85, .5], armr: [-.15, -.85, .5], forel: [.05, -.45, 1], forer: [-.05, -.45, 1] } },
    throne: { label: 'Throne', hint: 'Sat back, knees apart, forearms along the armrests',
      aim: { spine: [0, 1, -.12], upLegl: [.35, -.08, 1], upLegr: [-.35, -.08, 1], legl: [.08, -1, .1], legr: [-.08, -1, .1],
        arml: [.35, -.9, .15], armr: [-.35, -.9, .15], forel: [.1, -.08, 1], forer: [-.1, -.08, 1] } },
    down: { label: 'Arms down', hint: 'Standing, arms at its sides',
      aim: { arml: [.12, -1, 0], armr: [-.12, -1, 0], forel: [.08, -1, .05], forer: [-.08, -1, .05], upLegl: [.03, -1, 0], upLegr: [-.03, -1, 0], legl: [0, -1, 0], legr: [0, -1, 0] } },
    wave: { label: 'Wave', hint: 'Right hand up',
      aim: { arml: [.12, -1, 0], forel: [.08, -1, .05], armr: [-1, .25, 0], forer: [-.2, 1, .1] } },
    point: { label: 'Point', hint: 'Right arm out ahead',
      aim: { arml: [.12, -1, 0], forel: [.08, -1, .05], armr: [-.1, .05, 1], forer: [-.05, .05, 1] } },
  };
  // the child that shows where a bone points: the named next bone, else its first bone child
  const NEXT = { upLegl: 'legl', upLegr: 'legr', legl: 'footl', legr: 'footr', arml: 'forel', armr: 'forer', forel: 'handl', forer: 'handr', spine: 'neck' };
  const tip = (b, role, found) => (NEXT[role] && found[NEXT[role]]) || b.children.find(c => c.isBone);
  // P.pose for PRESET on the model built in NODE: each listed bone turned so it points where the preset says
  function presetPose(node, P, preset) {
    const { found } = rolesOf(node), aim = PRESETS[preset]?.aim || {};
    // start from rest: no pose, built fresh
    node.traverse(n => { if (n.isBone && n.userData.rest) n.quaternion.copy(n.userData.rest); });
    node.updateMatrixWorld(true);
    const space = new T.Quaternion(); node.getWorldQuaternion(space);   // the model's own turn in the world
    const order = ['hips', 'spine', 'neck', 'head', 'upLegl', 'upLegr', 'legl', 'legr', 'arml', 'armr', 'forel', 'forer'];
    for (const role of order) {
      const b = found[role], want = aim[role]; if (!b || !want) continue;
      const c = tip(b, role, found); if (!c) continue;
      const a = new T.Vector3(), z = new T.Vector3(); b.getWorldPosition(a); c.getWorldPosition(z);
      const now = z.sub(a).normalize(), goal = new T.Vector3(...want).normalize().applyQuaternion(space);
      if (now.lengthSq() < 1e-9) continue;
      const turn = new T.Quaternion().setFromUnitVectors(now, goal);
      // a turn in the world, as a turn of the bone in its parent's space
      const pw = new T.Quaternion(); b.parent.getWorldQuaternion(pw);
      const bw = new T.Quaternion(); b.getWorldQuaternion(bw);
      b.quaternion.copy(pw.clone().invert().multiply(turn).multiply(bw));
      b.updateMatrixWorld(true);
    }
    const pose = {};
    node.traverse(n => { if (n.isBone && n.userData.rest) { const t3 = turnOf(n); if (t3.some(v => Math.abs(v) > .05)) pose[n.name] = t3; } });
    return pose;
  }

  // ----- in the scene editor -----
  const st = { on: false, bone: '', start: null };
  const ed = () => SceneEd.api, P_ = () => SceneEd.selected;
  const nodeOf = P => P ? ed().findNode(P.id) : null;
  const posable = P => P?.type === 'model' && (() => { let y = false; nodeOf(P)?.traverse(n => { if (n.isBone) y = true; }); return y; })();
  const boneIn = (node, name) => { let b = null; node?.traverse(n => { if (!b && n.isBone && n.name === name) b = n; }); return b; };
  const keyed = P => (P.poseKeys || []).length > 0;
  function write(P, pose, record = true) {
    if (keyed(P)) {
      const t = Math.round(SceneEd.time * 1000) / 1000, k = P.poseKeys.find(k => Math.abs(k.t - t) < .005);
      if (k) k.pose = pose; else { P.poseKeys.push({ t, pose }); P.poseKeys.sort((a, b) => a.t - b.t); }
    } else P.pose = pose;
    if (record) SceneEd.record(); else SceneEd.redraw();
  }
  const current = P => JSON.parse(JSON.stringify(keyed(P) ? poseAt(P, SceneEd.time) : P.pose || {}));
  let hooked = false;
  function hook() {
    if (hooked) return; hooked = true;
    const gz = ed().gizmo;
    gz.addEventListener('dragging-changed', e => { const P = P_(), b = gz.object;
      if (!b?.isBone || !P) return;
      if (!e.value) { const pose = current(P); pose[b.name] = turnOf(b); write(P, pose); } });
    gz.addEventListener('objectChange', () => { if (gz.object?.isBone) SceneEd.redraw(); });
  }
  // the joints, as dots to click; the picked one brighter
  let temp = [];
  function overlay(helpers) {
    for (const x of temp) { x.geometry.dispose(); x.material.dispose(); } temp = [];
    const P = P_(); if (!st.on || !posable(P)) return;
    const node = nodeOf(P), pts = [], on = [];
    node.updateMatrixWorld(true);
    node.traverse(n => { if (n.isBone) { const v = new T.Vector3(); n.getWorldPosition(v); (n.name === st.bone ? on : pts).push(v.x, v.y, v.z); } });
    const dots = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(pts, 3)),
      new T.PointsMaterial({ color: 0x9fd0ff, size: 7, sizeAttenuation: false, depthTest: false, transparent: true, opacity: .85 }));
    const hot = new T.Points(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(on, 3)),
      new T.PointsMaterial({ color: 0xff9a2e, size: 11, sizeAttenuation: false, depthTest: false }));
    helpers.push(dots, hot); temp = [dots, hot];
    // the gizmo on the picked joint: it is built again with the pose, so found again each frame
    const b = st.bone && boneIn(node, st.bone), gz = ed().gizmo;
    if (b && gz.object !== b && !gz.dragging) { gz.attach(b); gz.setMode('rotate'); gz.setSpace('local'); }
    if (!b && gz.object?.isBone) gz.detach();
  }
  function pickJoint(e) {
    const P = P_(), node = nodeOf(P), { cam, canvas } = ed(); if (!node || !cam) return false;
    const r = canvas.getBoundingClientRect(); let best = null, bd = 16;
    node.traverse(n => { if (!n.isBone) return; const v = new T.Vector3(); n.getWorldPosition(v); v.project(cam);
      if (v.z > 1) return; const x = (v.x + 1) / 2 * r.width, y = (1 - v.y) / 2 * r.height, d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top));
      if (d < bd) { bd = d; best = n.name; } });
    if (!best) return false;
    st.bone = best; SceneEd.refreshUI(); return true;
  }
  let downAt = null;
  SceneEd.extras.push({
    ownsGizmo: () => st.on && posable(P_()),
    overlay(helpers) { hook(); overlay(helpers); },
    pointer(type, e) {
      if (!st.on || !posable(P_())) return false;
      const gz = ed().gizmo; if (gz.axis != null || gz.dragging) return false;
      if (type === 'down' && e.button === 0) { downAt = [e.clientX, e.clientY]; return false; }
      if (type === 'up' && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 4) { downAt = null; return pickJoint(e); }
      return false;
    },
    key(e) {
      if (!st.on) return false;
      if (e.key === 'Escape') { if (st.bone) st.bone = ''; else st.on = false; ed().gizmo.detach(); SceneEd.refreshUI(); return true; }
      return false;
    },
    inspector(P) {
      if (!posable(P)) return '';
      const b = (act, label, title = '', on = false) => `<button class="tb small${on ? ' on' : ''}" data-pose="${act}" title="${title}">${label}</button>`;
      const pose = current(P), node = nodeOf(P), bones = []; node?.traverse(n => { if (n.isBone) bones.push(n.name); });
      let h = `<div class="hd">Pose</div><div class="acts">${Object.entries(PRESETS).map(([k, p]) => b('preset:' + k, p.label, p.hint)).join('')}${b('reset', 'Rest', 'Back to the pose it came in')}</div>`;
      h += `<div class="acts">${b('bones', st.on ? 'Done posing' : 'Pose joints', 'Show the joints: click one and turn it', st.on)}${b('key', keyed(P) ? 'Key pose here' : 'Key this pose', 'Keep this pose at the playhead; between keys it eases from one to the next')}${keyed(P) ? b('unkey', 'Remove key', 'The key at the playhead') : ''}</div>`;
      if (st.on) {
        h += `<label class="f"><span>Joint</span><select data-posebone><option value="">Pick one</option>${bones.map(n => `<option${n === st.bone ? ' selected' : ''}>${n.replace(/[&<>"]/g, '')}</option>`).join('')}</select></label>`;
        if (st.bone) { const a = pose[st.bone] || [0, 0, 0];
          h += ['X', 'Y', 'Z'].map((ax, i) => `<label class="f"><span>Turn ${ax}°</span><input type="number" step="1" data-poseaxis="${i}" value="${r1(a[i])}"></label>`).join('') + `<div class="acts">${b('clearbone', 'Reset joint')}</div>`; }
        h += `<p class="note">Click a joint in the view, then turn it with the rings; Esc lets go.</p>`;
      }
      if (keyed(P)) h += `<p class="note">${P.poseKeys.length} pose key${P.poseKeys.length > 1 ? 's' : ''}: ${P.poseKeys.map(k => k.t.toFixed(2) + 's').join(', ')}</p>`;
      return h;
    },
    click(btn) {
      const a = btn.dataset.pose, P = P_(); if (!a || !P) return false;
      if (a.startsWith('preset:')) { write(P, presetPose(nodeOf(P), P, a.slice(7))); status(`Posed: ${PRESETS[a.slice(7)].label}`); }
      else if (a === 'reset') write(P, {});
      else if (a === 'bones') { st.on = !st.on; if (!st.on) { st.bone = ''; ed().gizmo.detach(); } }
      else if (a === 'key') { const pose = current(P), t = Math.round(SceneEd.time * 1000) / 1000;
        P.poseKeys = (P.poseKeys || []).filter(k => Math.abs(k.t - t) >= .005); P.poseKeys.push({ t, pose }); P.poseKeys.sort((x, y) => x.t - y.t);
        delete P.pose; SceneEd.record(); }
      else if (a === 'unkey') { const t = SceneEd.time; P.poseKeys = P.poseKeys.filter(k => Math.abs(k.t - t) >= .005); if (!P.poseKeys.length) { P.pose = current(P); delete P.poseKeys; } SceneEd.record(); }
      else if (a === 'clearbone' && st.bone) { const pose = current(P); delete pose[st.bone]; write(P, pose); }
      SceneEd.refreshUI(); return true;
    },
  });
  // the joint picker and the angle fields
  document.addEventListener('change', e => {
    const P = P_(); if (!P || !e.target.closest?.('.sced')) return;
    if (e.target.matches('[data-posebone]')) { st.bone = e.target.value; SceneEd.refreshUI(); }
    else if (e.target.matches('[data-poseaxis]') && st.bone) { const pose = current(P), a = pose[st.bone] || [0, 0, 0]; a[+e.target.dataset.poseaxis] = +e.target.value || 0; pose[st.bone] = a; write(P, pose); }
  }, true);
  return { PRESETS, presetPose, poseAt, rolesOf };
})();
