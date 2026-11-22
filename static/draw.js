// ---------- Draw: lines and shapes by hand, straight on the canvas ----------
// The Draw tool (D, or the pen in the toolbar) turns the canvas into paper: drag to draw, and each stroke becomes a
// Hand-drawn line layer, smoothed the way a steady hand would have drawn it. Its bar sets the pen: a line or a filled
// shape, the colour, the width and how much the stroke is smoothed. Draw on keys the line to draw itself on at the
// pace it was drawn; Join adds each stroke to the last drawing instead of making a layer of its own, so a doodle of
// several strokes is one layer that draws on stroke by stroke. Ink makes each line a brush pen's: fine where it
// touched down and lifted off, swelling between. Boil redraws its edges a little differently ten times a second, as
// a line drawn again on every frame of a hand-made film is. Together, with Draw on, that is an ink-line animation.
// Esc, D or Done puts the pen down.
const Draw = (() => {
  const SWATCHES = ['#141413', '#faf9f5', '#d97757', '#ff5a36', '#2f6bff', '#d7ff3a', '#c9c2f0'];
  const saved = (() => { try { return JSON.parse(localStorage.getItem('riptide.draw') || '{}'); } catch { return {}; } })();
  const opt = { mode: 'pen', color: '#141413', width: 10, smooth: 50, drawOn: true, join: false, ink: true, boil: true, ...saved };
  const keep = () => { try { localStorage.setItem('riptide.draw', JSON.stringify(opt)); } catch {} };
  let on = false, stroke = null, joinTo = null;

  // ----- the bar -----
  const stage = document.getElementById('stage');
  const bar = document.createElement('div'); bar.id = 'drawbar'; bar.hidden = true;
  const preview = document.createElement('canvas'); preview.id = 'drawpreview';
  stage.appendChild(preview); stage.appendChild(bar);
  function paintBar() {
    bar.innerHTML = `
      <div class="seg"><button data-mode="pen" class="${opt.mode === 'pen' ? 'on' : ''}" title="A line">Line</button>
        <button data-mode="shape" class="${opt.mode === 'shape' ? 'on' : ''}" title="A closed, filled shape">Shape</button></div>
      <div class="sw">${SWATCHES.map(c => `<button data-color="${c}" style="background:${c}" class="${opt.color === c ? 'on' : ''}" title="${c}"></button>`).join('')}
        <label class="pick" title="Any colour"><input type="color" value="${opt.color}"></label></div>
      <label class="num" title="How thick the line is">Width <input type="range" min="1" max="80" value="${opt.width}" data-k="width"><b>${opt.width}</b></label>
      <label class="num" title="How much a shaky stroke is smoothed">Smooth <input type="range" min="0" max="100" value="${opt.smooth}" data-k="smooth"><b>${opt.smooth}</b></label>
      <button class="tog ${opt.drawOn ? 'on' : ''}" data-tog="drawOn" title="Key the line to draw itself on at the pace you drew it">Draw on</button>
      <button class="tog ${opt.join ? 'on' : ''}" data-tog="join" title="Add each stroke to the last drawing, as one layer">Join</button>
      <button class="tog ${opt.ink ? 'on' : ''}" data-tog="ink" title="A brush pen's line: fine at the ends, swelling where it pressed">Ink</button>
      <button class="tog ${opt.boil ? 'on' : ''}" data-tog="boil" title="The line trembles, redrawn by hand on every frame">Boil</button>
      <button class="tb small done">Done</button>`;
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.mode) opt.mode = b.dataset.mode;
    else if (b.dataset.color) opt.color = b.dataset.color;
    else if (b.dataset.tog) opt[b.dataset.tog] = !opt[b.dataset.tog];
    else if (b.classList.contains('done')) return toggle(false);
    keep(); paintBar();
  });
  bar.addEventListener('input', e => {
    const t = e.target;
    if (t.type === 'color') { opt.color = t.value; keep(); return; }
    if (t.dataset.k) { opt[t.dataset.k] = +t.value; t.nextElementSibling.textContent = t.value; keep(); }
  });
  bar.addEventListener('change', e => { if (e.target.type === 'color') paintBar(); });
  // keys typed into the bar's own controls are its own
  bar.addEventListener('keydown', e => e.stopPropagation());

  function toggle(v) {
    on = v ?? !on;
    document.body.classList.toggle('drawing', on);
    bar.hidden = !on; preview.hidden = !on;
    document.getElementById('drawTool')?.classList.toggle('on', on);
    if (on) { joinTo = null; paintBar(); place(); status('Draw: drag on the canvas. D, Esc or Done when you are finished'); }
    else status('Put the pen down');
  }

  // the preview sits exactly over the canvas, in screen pixels
  function place() {
    const r = cv.getBoundingClientRect(), s = stage.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    Object.assign(preview.style, { left: r.left - s.left + 'px', top: r.top - s.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (preview.width !== w || preview.height !== h) { preview.width = w; preview.height = h; }
  }
  addEventListener('resize', () => { if (on) place(); });

  function drawPreview() {
    const g = preview.getContext('2d'), k = preview.width / S.w;
    g.clearRect(0, 0, preview.width, preview.height);
    if (!stroke || stroke.pts.length < 2) return;
    g.save(); g.scale(k, k); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = opt.color; g.lineWidth = opt.width;
    g.beginPath(); stroke.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    if (opt.mode === 'shape') { g.closePath(); g.globalAlpha = .85; g.fill(); } else g.stroke();
    g.restore();
  }

  // ----- strokes into paths -----
  // a moving average evens out the shake, then points that add nothing to the shape are dropped
  // (Ramer-Douglas-Peucker), then the rest are joined by curves through every point (Catmull-Rom, as Bezier curves)
  function smooth(pts, amount) {
    const n = Math.round(amount / 100 * 6); if (n < 1 || pts.length < 5) return pts;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      let x = 0, y = 0, c = 0;
      for (let j = Math.max(0, i - n); j <= Math.min(pts.length - 1, i + n); j++) { x += pts[j][0]; y += pts[j][1]; c++; }
      return [x / c, y / c, p[2]];
    });
  }
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let far = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > far) { far = d; at = i; }
    }
    if (far <= eps) return [pts[0], pts[pts.length - 1]];
    return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
  }
  const r1 = v => Math.round(v * 10) / 10;
  function curve(pts, closed) {
    if (pts.length === 1) return `M${r1(pts[0][0])} ${r1(pts[0][1])}h.1`;
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    const P = i => closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))];
    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  function shapeOf(strokes, width) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = width / 2 + 2; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const w = Math.max(4, x1 - x0), h = Math.max(4, y1 - y0);
    const pathd = strokes.map(s => curve(s.pts.map(([x, y]) => [x - x0, y - y0]), s.closed)).join(' ');
    return { x: x0 + w / 2, y: y0 + h / 2, w: r1(w), h: r1(h), vb: `0 0 ${r1(w)} ${r1(h)}`, pathd };
  }

  function finish() {
    const s = stroke; stroke = null; drawPreview();
    if (!s || s.pts.length < 2) return;
    const raw = s.pts, eps = .4 + opt.smooth / 100 * 2.6;
    const pts = simplify(smooth(raw, opt.smooth), eps);
    const closed = opt.mode === 'shape', took = Math.max(.25, (raw[raw.length - 1][2] - raw[0][2]) / 1000);
    const one = { pts: pts.map(([x, y]) => [x, y]), closed, took };
    let L = opt.join && joinTo ? S.layers.find(l => l.id === joinTo) : null;
    if (L && L.drawn) {
      // drawn into the last drawing: moved since, its strokes are where it is now
      const dx = L.p.x - L.drawnAt[0], dy = L.p.y - L.drawnAt[1];
      L.drawn.forEach(st => st.pts.forEach(p => { p[0] += dx; p[1] += dy; }));
      L.drawn.push(one);
    } else {
      L = makeLayer('path', { stroke: opt.color, strokeWidth: closed ? 0 : opt.width, pfill: closed, fill: opt.color, reveal: 1,
        ink: opt.ink && !closed ? 70 : 0, boil: opt.boil ? 1.5 : 0 }, closed ? 'Drawn shape' : opt.ink ? 'Ink line' : 'Drawing');
      L.drawn = [one];
    }
    const shape = shapeOf(L.drawn, opt.width);
    Object.assign(L.p, shape); L.drawnAt = [shape.x, shape.y];
    if (opt.drawOn && !closed) {
      // the pen's pace: every stroke of it, one after the other, from the playhead
      const total = L.drawn.reduce((n, st) => n + st.took, 0);
      delete L.keys.reveal; setKey(L, 'reveal', time, 0, 'linear'); setKey(L, 'reveal', Math.min(S.dur, time + total), 1, 'linear');
    }
    joinTo = L.id; sel = L.id; selKey = null; selKeys = [];
    refresh();
  }

  // ----- the pen on the canvas: before the canvas's own handling, which would select and move layers -----
  cv.addEventListener('pointerdown', e => {
    if (!on || e.button !== 0) return;
    e.stopImmediatePropagation(); e.preventDefault(); place();
    const [x, y] = toCanvas(e); stroke = { pts: [[x, y, performance.now()]] };
    cv.setPointerCapture(e.pointerId);
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!on || !stroke) return;
    e.stopImmediatePropagation();
    const [x, y] = toCanvas(e), [px, py] = stroke.pts[stroke.pts.length - 1];
    if (Math.hypot(x - px, y - py) < .75) return;
    stroke.pts.push([x, y, performance.now()]); drawPreview();
  }, true);
  const up = e => { if (!on || !stroke) return; e.stopImmediatePropagation(); finish(); };
  cv.addEventListener('pointerup', up, true);
  cv.addEventListener('pointercancel', () => { stroke = null; drawPreview(); }, true);
  addEventListener('keydown', e => {
    if (on && e.key === 'Escape' && !document.querySelector('.modal-wrap, .palette')) { e.stopImmediatePropagation(); toggle(false); }
  }, true);

  document.getElementById('drawTool').onclick = () => toggle();
  return { toggle, get on() { return on; }, opt, curve, simplify, shapeOf };
})();
