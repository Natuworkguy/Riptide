// ---------- shots ----------
// Cameras placed in a 3D world, and the cuts between them. A camera prop stands and turns like any prop (keyed, it
// flies along a smooth path through its keys), looks at a prop or the way it travels, has its own lens, focus and
// depth of field, and a hand-held shake. The world's shot list cuts from one to the next at times on the timeline,
// as an edit does; before the first cut, and in a cut to none, the world's own camera films.
const Shots = (() => {
  const T = window.RiptideThree, M = World.M;

  // what a camera prop looks like in the scene editor (never in a frame): a body, a lens, the way it points
  const guideMat = new T.MeshBasicMaterial({ color: 0xffb020 }), lineMat = new T.LineBasicMaterial({ color: 0xffb020, transparent: true, opacity: .7 });
  const bodyGeo = new T.BoxGeometry(.18, .12, .22), lensGeo = new T.CylinderGeometry(.045, .055, .1, 16), frusta = new Map();
  World.custom.camera = P => {
    const g = new T.Group(), body = new T.Mesh(bodyGeo, guideMat), lens = new T.Mesh(lensGeo, guideMat);
    lens.rotation.x = Math.PI / 2; lens.position.z = -.16; g.add(body, lens);
    const f = 2 * Math.tan(Math.atan(12 / Math.max(6, +P.lens || 35))) * .9, w = f * 16 / 9, z = -.9;
    const pts = [[0, 0, -.2], [-w / 2, -f / 2, z], [0, 0, -.2], [w / 2, -f / 2, z], [0, 0, -.2], [w / 2, f / 2, z], [0, 0, -.2], [-w / 2, f / 2, z],
      [-w / 2, -f / 2, z], [w / 2, -f / 2, z], [w / 2, -f / 2, z], [w / 2, f / 2, z], [w / 2, f / 2, z], [-w / 2, f / 2, z], [-w / 2, f / 2, z], [-w / 2, -f / 2, z]].flat();
    const fk = (+P.lens || 35); if (!frusta.has(fk)) frusta.set(fk, new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(pts, 3)));
    g.add(new T.LineSegments(frusta.get(fk), lineMat));
    g.scale.setScalar(M); g.traverse(x => { x.userData.guide = true; x.castShadow = x.receiveShadow = false; }); g.userData.guide = true;
    return g;
  };
  World.PARTS.push('camera');
  SceneEd.add('camera', { type: 'camera', lens: 35, shake: 0, turn: [0, 0, 0] }, 'Camera');

  const props = (L, skip) => { const out = []; const walk = (list, d) => { for (const P of list || []) { if (P.id !== skip && P.type !== 'camera') out.push([P.id, '  '.repeat(d) + (P.name || P.type)]); walk(P.children, d + 1); } };
    walk(L.p.objects, 0); return out; };
  const sel = (k, v, opts, none) => `<select data-k="${k}"><option value="">${none}</option>${opts.map(([id, n]) => `<option value="${id}"${v === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const shotsOf = L => (L.p.shots ||= []);
  const fmtT = t => `${(+t).toFixed(2)}s`;
  function cutTo(L, cam) {
    const t = Math.round(time * 1000) / 1000, list = shotsOf(L), at = list.find(s => Math.abs(s.t - t) < .005);
    if (at) at.cam = cam; else list.push({ t, cam });
    list.sort((a, b) => a.t - b.t); SceneEd.record();
    status(cam ? `Cuts to this camera at ${fmtT(t)}` : `Cuts back to the world's own camera at ${fmtT(t)}`);
  }

  SceneEd.extras.push({
    inspector(P) {
      const L = SceneEd.layer; if (!L) return '';
      let h = '';
      // anything that moves: along a smooth path through its keys, facing the way it goes
      if (P.keys?.at?.length >= 2 || P.type === 'camera' || P.type === 'car') {
        h += `<div class="hd">Motion</div>
          <label class="f"><span>Path</span><select data-k="path"><option value="">Smooth</option><option value="straight"${P.path === 'straight' ? ' selected' : ''}>Straight lines</option></select></label>
          <label class="f"><span>Faces</span><select data-k="face"><option value="">Its turn</option><option value="travel"${P.face === 'travel' ? ' selected' : ''}>The way it travels</option></select></label>`;
      }
      if (P.type !== 'camera') return h;
      const cuts = shotsOf(L).filter(s => s.cam === P.id).map(s => fmtT(s.t)).join(', ');
      return `<div class="hd">Camera</div>
        <label class="f"><span>Lens mm</span><input type="number" step="1" data-k="lens" value="${+P.lens || 35}"></label>
        <label class="f"><span>Looks at</span>${sel('lookAt', P.lookAt, props(L, P.id), 'Where it is turned')}</label>
        <label class="f"><span>Focus on</span>${sel('focusOn', P.focusOn, props(L, P.id), 'What it looks at')}</label>
        <label class="f"><span>Focus m</span><input type="number" step=".1" data-k="focus" value="${+P.focus || 0}" title="0: what it looks at, or focuses on"></label>
        <label class="f"><span>Depth of field</span><input type="number" step="5" data-k="dof" value="${+P.dof || 0}" title="0: the world's"></label>
        <label class="f"><span>Hand-held</span><input type="number" step="5" min="0" max="100" data-k="shake" value="${+P.shake || 0}"></label>
        <p class="note">${cuts ? `Cut to at ${cuts}.` : 'Not in the edit yet.'} Key its place and turn to fly it; three keys or more make a smooth path.</p>
        <div class="acts"><button class="tb small" data-shot="cut">Cut to it here</button><button class="tb small" data-shot="look">Look through it</button></div>`;
    },
    worldInspector(L) {
      const list = shotsOf(L), names = Object.fromEntries((function all(arr, out = []) { for (const P of arr || []) { out.push([P.id, P.name || 'Camera']); all(P.children, out); } return out; })(L.p.objects));
      return `<div class="hd">Shots</div>${list.length ? list.map((s, i) => `<div class="shotrow"><span class="t">${fmtT(s.t)}</span><span class="n">${esc(s.cam ? names[s.cam] || 'A camera since deleted' : "The world's camera")}</span>
        <button class="eye" data-shotgo="${s.t}" title="Go there">↦</button><button class="eye" data-shotdel="${i}" title="Remove this cut">✕</button></div>`).join('')
        : '<p class="note">Add cameras (+ Add, Camera), then Cut to it here at each moment the edit should cut. Before the first cut the world\'s own camera films.</p>'}
        <div class="acts"><button class="tb small" data-shot="world">Cut to the world's camera here</button></div>`;
    },
    click(b) {
      const L = SceneEd.layer, P = SceneEd.selected;
      if (b.dataset.shotgo != null) { time = +b.dataset.shotgo; render(); SceneEd.refreshUI(); return true; }
      if (b.dataset.shotdel != null) { shotsOf(L).splice(+b.dataset.shotdel, 1); SceneEd.record(); return true; }
      if (b.dataset.shot === 'world') { cutTo(L, ''); return true; }
      if (!P || P.type !== 'camera') return false;
      if (b.dataset.shot === 'cut') { cutTo(L, P.id); return true; }
      if (b.dataset.shot === 'look') { if (!shotsOf(L).some(s => s.cam === P.id)) cutTo(L, P.id); else { const s = shotsOf(L).find(x => x.cam === P.id); time = s.t; render(); }
        SceneEd.setView('film'); return true; }
      return false;
    },
  });
  return { cutTo };
})();
