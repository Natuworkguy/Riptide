// Riptide: a browser motion-design editor (layers, keyframes, timeline, MP4 export via the Python server).
const $ = s => document.querySelector(s);
const cv = $('#c'), ctx = cv.getContext('2d');
// status line in the footer (replaces pop-up toasts)
let stT; function status(m) { const s = $('#status'); s.textContent = m; s.classList.add('show'); clearTimeout(stT); stT = setTimeout(() => s.classList.remove('show'), 3500); }

// ---------- easing ----------
const P = Math.pow, PI = Math.PI;
const outB = t => { const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
const EASE_LIST = [
  ['linear', 'Linear', 'Basic', t => t],
  ['step', 'Hold', 'Basic', t => t < 1 ? 0 : 1],
  ['sineIn', 'Sine in', 'Gentle', t => 1 - Math.cos(t * PI / 2)],
  ['sineOut', 'Sine out', 'Gentle', t => Math.sin(t * PI / 2)],
  ['sineInOut', 'Sine in-out', 'Gentle', t => -(Math.cos(PI * t) - 1) / 2],
  ['easeIn', 'Cubic in', 'Standard', t => t * t * t],
  ['easeOut', 'Cubic out', 'Standard', t => 1 - P(1 - t, 3)],
  ['easeInOut', 'Cubic in-out', 'Standard', t => t < .5 ? 4 * t * t * t : 1 - P(-2 * t + 2, 3) / 2],
  ['quartOut', 'Quart out', 'Strong', t => 1 - P(1 - t, 4)],
  ['quartInOut', 'Quart in-out', 'Strong', t => t < .5 ? 8 * t ** 4 : 1 - P(-2 * t + 2, 4) / 2],
  ['expoIn', 'Expo in', 'Strong', t => t === 0 ? 0 : P(2, 10 * t - 10)],
  ['expoOut', 'Expo out', 'Strong', t => t === 1 ? 1 : 1 - P(2, -10 * t)],
  ['expoInOut', 'Expo in-out', 'Strong', t => t === 0 || t === 1 ? t : t < .5 ? P(2, 20 * t - 10) / 2 : (2 - P(2, -20 * t + 10)) / 2],
  ['circOut', 'Circ out', 'Strong', t => Math.sqrt(1 - P(t - 1, 2))],
  ['circInOut', 'Circ in-out', 'Strong', t => t < .5 ? (1 - Math.sqrt(1 - P(2 * t, 2))) / 2 : (Math.sqrt(1 - P(-2 * t + 2, 2)) + 1) / 2],
  ['backIn', 'Back in', 'Playful', t => 2.70158 * t ** 3 - 1.70158 * t * t],
  ['back', 'Back out', 'Playful', t => 1 + 2.70158 * P(t - 1, 3) + 1.70158 * P(t - 1, 2)],
  ['backInOut', 'Back in-out', 'Playful', t => { const c = 2.5949; return t < .5 ? (P(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (P(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; }],
  ['elastic', 'Elastic out', 'Playful', t => t === 0 || t === 1 ? t : P(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * PI / 3)) + 1],
  ['elasticIn', 'Elastic in', 'Playful', t => t === 0 || t === 1 ? t : -P(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * PI / 3))],
  ['spring', 'Spring', 'Playful', t => 1 - Math.cos(t * PI * 4.5) * Math.exp(-t * 6)],
  ['bounce', 'Bounce out', 'Playful', outB],
  ['bounceIn', 'Bounce in', 'Playful', t => 1 - outB(1 - t)],
];
const EASES = Object.fromEntries(EASE_LIST.map(e => [e[0], e[3]]));
const EASE_ITEMS = EASE_LIST.map(([value, label, group]) => ({ value, label, group }));
const easeName = v => EASE_LIST.find(e => e[0] === v)?.[1] || v;
function curveSVG(name, w = 34, h = 22) {
  const f = EASES[name], pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(`${(t * w).toFixed(1)},${(h - 4 - f(t) * (h - 8)).toFixed(1)}`); }
  return `<svg class="curve" viewBox="0 -2 ${w} ${h + 4}" width="${w}" height="${h}"><polyline points="${pts.join(' ')}"/></svg>`;
}

// ---------- model ----------
const ANIM = ['x', 'y', 'w', 'h', 'rotation', 'scale', 'sx', 'sy', 'opacity', 'radius', 'fill', 'fill2', 'gradAngle', 'stroke', 'strokeWidth',
  'blur', 'shadow', 'size', 'reveal', 'sweep', 'spacing', 'bright', 'contrast', 'sat', 'hue', 'gray', 'sepia', 'invert',
  'rotX', 'rotY', 'z', 'd', 'lightAngle', 'orbit', 'tilt', 'dolly', 'zoom'];
const ADJUST = ['bright', 'contrast', 'sat', 'hue', 'gray', 'sepia', 'invert'];
const COMMON = ['x', 'y', 'rotation', 'scale', 'sx', 'sy', 'opacity', 'blur', 'shadow', ...ADJUST];
// turned on X and Y and pushed back in depth: any layer with 3D on, and the 3D layers themselves
const DEPTH = ['rotX', 'rotY', 'z'];
const FLAT = [...COMMON, 'three', ...DEPTH];
const PROPS = {
  rect:    [...FLAT, 'w', 'h', 'radius', 'fill', 'grad', 'fill2', 'gradAngle', 'stroke', 'strokeWidth'],
  ellipse: [...FLAT, 'w', 'h', 'fill', 'grad', 'fill2', 'gradAngle', 'stroke', 'strokeWidth'],
  star:    [...FLAT, 'w', 'h', 'points', 'fill', 'grad', 'fill2', 'gradAngle', 'stroke', 'strokeWidth'],
  polygon: [...FLAT, 'w', 'h', 'points', 'radius', 'fill', 'grad', 'fill2', 'gradAngle', 'stroke', 'strokeWidth'],
  arc:     [...FLAT, 'w', 'h', 'sweep', 'stroke', 'strokeWidth'],
  wave:    [...FLAT, 'w', 'h', 'reveal', 'stroke', 'strokeWidth'],
  text:    [...FLAT, 'text', 'size', 'weight', 'spacing', 'reveal', 'fill', 'grad', 'fill2', 'gradAngle', 'stroke', 'strokeWidth'],
  image:   [...FLAT, 'w', 'h', 'radius', 'stroke', 'strokeWidth'],
  video:   [...FLAT, 'w', 'h', 'radius', 'stroke', 'strokeWidth'],
  shape3d: [...COMMON, ...DEPTH, 'w', 'h', 'd', 'shape', 'text', 'radius', 'fill', 'material', 'lightAngle'],
  model:   [...COMMON, ...DEPTH, 'w', 'h', 'lightAngle'],
  camera:  ['x', 'y', 'orbit', 'tilt', 'dolly', 'zoom', 'rotation'],
};
const GROUPS = [['Transform', ['x', 'y', 'w', 'h', 'd', 'rotation', 'scale', 'sx', 'sy']],
  ['3D', ['three', 'shape', 'rotX', 'rotY', 'z', 'material', 'lightAngle']], ['Camera', ['orbit', 'tilt', 'dolly', 'zoom']],
  ['Style', ['fill', 'grad', 'fill2', 'gradAngle', 'stroke', 'strokeWidth', 'radius', 'points', 'sweep', 'opacity']],
  ['Text', ['text', 'size', 'weight', 'spacing', 'reveal']], ['Effects', ['blur', 'shadow']], ['Adjust', ADJUST]];
const LABEL = { w: 'Width', h: 'Height', x: 'X', y: 'Y', rotation: 'Rotate', scale: 'Scale', sx: 'Stretch X', sy: 'Stretch Y',
  opacity: 'Opacity', radius: 'Corners', fill: 'Fill', grad: 'Gradient', fill2: 'Fill 2', gradAngle: 'Angle°', stroke: 'Stroke', strokeWidth: 'Stroke W', blur: 'Blur', shadow: 'Shadow',
  size: 'Font size', text: 'Text', points: 'Points', weight: 'Weight', reveal: 'Reveal', sweep: 'Sweep°', spacing: 'Tracking',
  bright: 'Brightness', contrast: 'Contrast', sat: 'Saturation', hue: 'Hue°', gray: 'Grayscale', sepia: 'Sepia', invert: 'Invert',
  three: '3D layer', shape: 'Shape', rotX: 'Rotate X', rotY: 'Rotate Y', z: 'Depth', d: 'Thickness', material: 'Material', lightAngle: 'Light°',
  orbit: 'Orbit°', tilt: 'Tilt°', dolly: 'Dolly', zoom: 'Zoom' };
// a camera's position is the point it looks at, and its rotation turns the whole view
const CAMERA_LABEL = { x: 'Look at X', y: 'Look at Y', rotation: 'Roll°' };
const STEP = { opacity: .05, scale: .05, sx: .05, sy: .05, reveal: .05, zoom: .05 };
const PALETTE = ['#7c5cff', '#ff5c8a', '#20c997', '#ffb020', '#3fa9ff', '#ff7a45'];
const DEFAULTS = { rotation: 0, scale: 1, sx: 1, sy: 1, opacity: 1, radius: 24, stroke: '#111111', strokeWidth: 0, blur: 0, shadow: 0,
  size: 120, text: 'Hello', weight: 800, spacing: 0, reveal: 1, sweep: 270, points: 5, w: 300, h: 300,
  bright: 100, contrast: 100, sat: 100, hue: 0, gray: 0, sepia: 0, invert: 0, grad: 'none', gradAngle: 90,
  three: false, rotX: 0, rotY: 0, z: 0, d: 300, shape: 'cube', material: 'glossy', lightAngle: -45, orbit: 0, tilt: 0, dolly: 0, zoom: 1 };
// A fill can be a gradient from Fill to Fill 2: linear at an angle (0° runs left to right, 90° top to bottom), or
// radial from the middle out. It spans the layer's own box, so it moves, scales and turns with the layer.
const GRADS = [['none', 'None'], ['linear', 'Linear'], ['radial', 'Radial']];
const COLORS = ['fill', 'fill2', 'stroke'];
function fillOf(c, o, w, h) {
  if ((o.grad !== 'linear' && o.grad !== 'radial') || !isColor(o.fill2)) return o.fill;
  let g;
  if (o.grad === 'radial') g = c.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, Math.hypot(w, h) / 2));
  else { const a = (o.gradAngle || 0) * PI / 180, dx = Math.cos(a), dy = Math.sin(a);
    const half = Math.max(1, Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2);
    g = c.createLinearGradient(-dx * half, -dy * half, dx * half, dy * half); }
  g.addColorStop(0, o.fill); g.addColorStop(1, o.fill2);
  return g;
}

let S = { w: 1080, h: 1080, bg: '#0b1026', dur: 5, layers: [] };
let time = 0, playing = false, loop = true, sel = null, selKey = null, uid = 1, freshLayer = null;

function makeLayer(type, p = {}, name) {
  const fill = PALETTE[S.layers.length % PALETTE.length];
  const L = { id: uid++, type, name: name || type[0].toUpperCase() + type.slice(1) + ' ' + uid,
    p: { ...DEFAULTS, x: S.w / 2, y: S.h / 2, fill, ...(type === 'arc' ? { strokeWidth: 24, stroke: fill } : {}), ...p }, keys: {} };
  S.layers.push(L); return L;
}
function newLayer(type) { const L = makeLayer(type); sel = L.id; selKey = null; freshLayer = L.id; refresh(); }

// ---------- keyframes ----------
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const isColor = v => typeof v === 'string' && v[0] === '#';
function lerp(a, b, k) {
  if (isColor(a) && isColor(b)) { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); }
  return +a + (+b - +a) * k;
}
// Every animatable property but the colours is a number: "0.5", as an agent may send it, is kept as 0.5.
const keyValue = (prop, v) => ANIM.includes(prop) && !['fill', 'fill2', 'stroke'].includes(prop) && typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : v;
function val(L, prop, t) {
  const ks = L.keys[prop];
  if (!ks || !ks.length) return L.p[prop];
  if (t <= ks[0].t) return ks[0].v;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t <= b.t) return lerp(a.v, b.v, (EASES[a.ease] || EASES.easeInOut)((t - a.t) / (b.t - a.t || 1)));
  }
  return ks[ks.length - 1].v;
}
const near = (a, b) => Math.abs(a - b) < 0.005;
function setKey(L, prop, t, v, ease) {
  if (fixed(L, prop)) return;
  t = Math.max(0, Math.min(S.dur, Math.round(t * 1000) / 1000)); v = keyValue(prop, v);
  const ks = (L.keys[prop] ||= []);
  const k = ks.find(k => near(k.t, t));
  if (k) { k.v = v; if (ease) k.ease = ease; } else ks.push({ t, v, ease: ease || 'easeInOut' });
  ks.sort((a, b) => a.t - b.t);
}
// width and height stay in proportion when a layer's aspect ratio is locked (images and videos start locked)
const aspectLocked = L => L.lockAspect ?? (L.type === 'image' || L.type === 'video');
// Locks on a layer's position, width or height (L.fix = { pos, w, h }): nothing changes a locked one, not dragging,
// typing, nudging, aligning, presets or an agent, until it is unlocked.
const FIX_OF = { x: 'pos', y: 'pos', w: 'w', h: 'h' };
const FIX_NAME = { pos: 'Position', w: 'Width', h: 'Height' };
const fixed = (L, prop) => !!L.fix?.[FIX_OF[prop]];
function toggleFix(L, which) {
  L.fix = { ...L.fix, [which]: !L.fix?.[which] };
  if (!Object.values(L.fix).some(Boolean)) delete L.fix;
  refresh(); status(`${FIX_NAME[which]} ${L.fix?.[which] ? 'locked' : 'unlocked'}`);
}
// Record: with it on, changing anything away from a layer's start animates the change. The value it had stays
// keyed at the layer's start and the new one is keyed at the playhead; a value already keyed gets a key here.
let recording = false;
function setProp(L, prop, v) {
  if (fixed(L, prop)) return;
  if (L.keys[prop]?.length) return setKey(L, prop, time, v);
  if (recording && ANIM.includes(prop) && time > lin(L) + 0.5 / FPS) {
    const was = L.p[prop];
    if (was === v) return;
    setKey(L, prop, lin(L), was); setKey(L, prop, time, v); return;
  }
  L.p[prop] = v;
}
function setRecording(on) {
  recording = on; $('#rec').classList.toggle('on', on); document.body.classList.toggle('recording', on);
  status(on ? 'Recording: move the playhead, then change anything to animate it' : 'Recording off');
}
function toggleKey(L, prop) {
  const ks = L.keys[prop] ||= [];
  const i = ks.findIndex(k => near(k.t, time));
  if (i >= 0) { ks.splice(i, 1); if (!ks.length) { L.p[prop] = val(L, prop, time); delete L.keys[prop]; } }
  else setKey(L, prop, time, val(L, prop, time));
  refresh();
}
const keyTimes = L => [...new Set(Object.values(L.keys).flat().map(k => Math.round(k.t * 1000) / 1000))].sort((a, b) => a - b);
const keysAt = (L, t) => Object.values(L.keys).flat().filter(k => near(k.t, t));

// ---------- rendering ----------
const FONT = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
function state(L, t) { const o = { ...L.p }; for (const k of ANIM) if (L.keys[k]?.length) o[k] = val(L, k, t); return o; }
function shapePath(c, L, o) {
  const w = o.w, h = o.h;
  c.beginPath();
  if (L.type === 'rect' || L.type === 'image' || L.type === 'video') c.roundRect(-w / 2, -h / 2, w, h, Math.max(0, Math.min(o.radius, Math.abs(w) / 2, Math.abs(h) / 2)));
  else if (L.type === 'ellipse') c.ellipse(0, 0, Math.abs(w / 2), Math.abs(h / 2), 0, 0, PI * 2);
  else if (L.type === 'star' || L.type === 'polygon') {
    const n = Math.max(3, Math.round(o.points)), star = L.type === 'star', m = star ? n * 2 : n;
    for (let i = 0; i < m; i++) { const a = i * 2 * PI / m - PI / 2, r = star && i % 2 ? .45 : 1;
      c.lineTo(Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r); }
    c.closePath();
  } else if (L.type === 'arc') {
    const sw = Math.max(0, Math.min(360, o.sweep)) * PI / 180;
    c.ellipse(0, 0, Math.abs(w / 2), Math.abs(h / 2), 0, -PI / 2, -PI / 2 + sw);
  } else if (L.type === 'wave') {
    // a wave curve (the original Wobble logo shape), scaled to w × h
    const X = x => (x - 16) / 20 * w, Y = y => (y - 18.5) / 10 * h;
    c.moveTo(X(6), Y(18.5));
    c.bezierCurveTo(X(8.6), Y(13.5), X(10.4), Y(13.5), X(12.6), Y(18.5));
    c.bezierCurveTo(X(14.8), Y(23.5), X(16.6), Y(23.5), X(19.2), Y(18.5));
    c.bezierCurveTo(X(21.8), Y(13.5), X(23.2), Y(13.5), X(26), Y(18.5));
  }
}
function textOf(o) { const s = String(o.text); return s.slice(0, Math.round(s.length * Math.max(0, Math.min(1, o.reveal)))); }
function setFont(c, o) { c.font = `${o.weight} ${o.size}px ${FONT}`; if ('letterSpacing' in c) c.letterSpacing = o.spacing + 'px'; }
function drawLayer(c, L, t) {
  if (L.type === 'camera') return;
  const o = state(L, t);
  if (L.id === editingId) o.reveal = 1;
  if (o.opacity <= 0) return;
  c.save();
  c.globalAlpha = Math.min(1, o.opacity);
  // a 3D layer is placed by the 3D view, which is laid over the whole canvas; effects apply to what it drew
  const deep = R3D.wants(L);
  if (!deep) { c.translate(o.x, o.y); c.rotate(o.rotation * PI / 180); c.scale(o.scale * o.sx, o.scale * o.sy); }
  { const f = [];
    if (o.blur > 0.05) f.push(`blur(${o.blur}px)`);
    if (o.bright !== 100) f.push(`brightness(${o.bright}%)`); if (o.contrast !== 100) f.push(`contrast(${o.contrast}%)`);
    if (o.sat !== 100) f.push(`saturate(${o.sat}%)`); if (o.hue) f.push(`hue-rotate(${o.hue}deg)`);
    if (o.gray) f.push(`grayscale(${o.gray}%)`); if (o.sepia) f.push(`sepia(${o.sepia}%)`); if (o.invert) f.push(`invert(${o.invert}%)`);
    if (f.length) c.filter = f.join(' '); }
  if (o.shadow > 0) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = o.shadow; c.shadowOffsetY = o.shadow / 3; }
  if (deep) R3D.draw(c, L, o, t, drawContent); else drawContent(c, L, o, t);
  c.restore();
}
// what a layer draws, centred on 0,0 at its own size: the layer, before it is moved, turned or scaled
function drawContent(c, L, o, t) {
  if (L.type === 'shape3d' || L.type === 'model') return placeholder3d(c, L, o);
  c.fillStyle = o.fill; c.strokeStyle = o.stroke; c.lineWidth = o.strokeWidth; c.lineJoin = 'round'; c.lineCap = 'round';
  if (L.type === 'text') {
    setFont(c, o); c.textAlign = 'left'; c.textBaseline = 'middle';
    const full = String(o.text).split('\n'), shown = textOf(o).split('\n'), lh = o.size * 1.1, y0 = -(full.length - 1) * lh / 2;
    c.fillStyle = fillOf(c, o, Math.max(10, ...full.map(s => c.measureText(s).width)), lh * full.length);
    // each line is anchored where its full text sits, so a typewriter reveal does not shift it
    shown.forEach((ln, i) => {
      const x = -c.measureText(full[i] || '').width / 2;
      if (o.strokeWidth > 0) c.strokeText(ln, x, y0 + i * lh);
      c.fillText(ln, x, y0 + i * lh);
    });
  } else {
    c.fillStyle = fillOf(c, o, Math.abs(o.w), Math.abs(o.h));
    shapePath(c, L, o);
    if (L.type === 'image' || L.type === 'video') {
      const img = L.type === 'video' ? videoFrame(L, t) : imageFor(L.p.asset);
      c.save(); c.clip();
      if ((L.type === 'video' ? img?.readyState >= 2 : img?.complete && img.naturalWidth)) c.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h);
      else { c.fillStyle = '#2a2a2a'; c.fill(); }
      c.restore();
    } else if (L.type !== 'arc' && L.type !== 'wave') c.fill();
    if (L.type === 'wave') { const len = Math.abs(o.w) * 1.35 + Math.abs(o.h) * 1.2, r = Math.max(0, Math.min(1, o.reveal));
      if (r < 1) c.setLineDash([len * r, len]); }
    if (o.strokeWidth > 0 && !(L.type === 'wave' && o.reveal <= 0)) { c.shadowColor = 'transparent'; c.stroke(); }
  }
}
// a solid with nothing to show yet (its model or font still loading, or no WebGL): its box, faintly
function placeholder3d(c, L, o) {
  c.save();
  if (R3D.wants(L)) { c.translate(o.x, o.y); c.rotate(o.rotation * PI / 180); c.scale(o.scale * o.sx, o.scale * o.sy); }
  c.fillStyle = L.type === 'model' ? 'rgba(128,128,128,.25)' : o.fill; c.globalAlpha *= L.type === 'model' ? 1 : .6;
  c.beginPath(); c.roundRect(-o.w / 2, -o.h / 2, o.w, o.h, Math.min(24, Math.abs(o.w) / 4, Math.abs(o.h) / 4)); c.fill();
  c.restore();
}
function bounds(L, t) {
  const o = state(L, t);
  if (L.type === 'camera') return { o, w: 0, h: 0 };
  if (L.type === 'text') { setFont(ctx, o); const ls = String(o.text).split('\n');
    return { o, w: Math.max(10, ...ls.map(s => ctx.measureText(s).width)), h: o.size * 1.1 * ls.length }; }
  return { o, w: Math.abs(o.w) + (L.type === 'arc' || L.type === 'wave' ? o.strokeWidth : 0), h: Math.abs(o.h) + (L.type === 'arc' || L.type === 'wave' ? o.strokeWidth : 0) };
}
function renderScene(c, t, scale = 1) {
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.fillStyle = S.bg; c.fillRect(0, 0, S.w, S.h);
  for (const L of S.layers) if (visibleAt(L, t)) { c.save(); c.globalCompositeOperation = L.blend || 'source-over'; drawLayer(c, L, t); c.restore(); }
  c.setTransform(1, 0, 0, 1, 0, 0);
}
// where a 3D layer that is turned, pushed back or seen by a moved camera lands on the canvas, as an outline; null
// for any other layer, which is a box turned in the plane like before
function hull3d(L, t) {
  if (!R3D.is3d(L) || !R3D.available) return null;
  const o = state(L, t); if (R3D.isFlat(L, o, t)) return null;
  const h = R3D.hull(L, t); return h.length >= 3 ? h : null;
}
function outline3d(c, hull) { c.beginPath(); hull.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.stroke(); }
// a camera, where it looks: a target
function cameraMark(c, L, k) {
  const o = state(L, time), r = 14 * k;
  c.save(); c.strokeStyle = '#4c8dff'; c.lineWidth = 1.5 * k; c.beginPath(); c.arc(o.x, o.y, r, 0, PI * 2);
  c.moveTo(o.x - r * 1.8, o.y); c.lineTo(o.x + r * 1.8, o.y); c.moveTo(o.x, o.y - r * 1.8); c.lineTo(o.x, o.y + r * 1.8); c.stroke(); c.restore();
}
R3D.changed = () => { if (!exporting) render(); };
R3D.placeholder = placeholder3d;
let guidesOn = false, snapGuides = null;
// axis-aligned box of a layer as drawn (scale, stretch and rotation included): centre and half extents
function box(L, t) {
  const hull = hull3d(L, t);
  if (hull) { const xs = hull.map(p => p[0]), ys = hull.map(p => p[1]), l = Math.min(...xs), r = Math.max(...xs), tp = Math.min(...ys), b = Math.max(...ys);
    return { x: (l + r) / 2, y: (tp + b) / 2, ex: (r - l) / 2, ey: (b - tp) / 2 }; }
  const { o, w, h } = bounds(L, t), bw = w * Math.abs(o.scale * o.sx) / 2, bh = h * Math.abs(o.scale * o.sy) / 2, r = o.rotation * PI / 180;
  return { x: o.x, y: o.y, ex: Math.abs(Math.cos(r)) * bw + Math.abs(Math.sin(r)) * bh, ey: Math.abs(Math.sin(r)) * bw + Math.abs(Math.cos(r)) * bh };
}
function render(showUI = true) {
  if (cv.width !== S.w || cv.height !== S.h) { cv.width = S.w; cv.height = S.h; }
  renderScene(ctx, time);
  const L = cur(), k = S.w / cv.getBoundingClientRect().width || 1;
  if (showUI && guidesOn) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = k; ctx.setLineDash([6 * k, 6 * k]);
    for (const f of [.05, .1]) ctx.strokeRect(S.w * f, S.h * f, S.w * (1 - 2 * f), S.h * (1 - 2 * f));
    ctx.setLineDash([]); ctx.beginPath(); const cx = S.w / 2, cy = S.h / 2, a = 14 * k;
    ctx.moveTo(cx - a, cy); ctx.lineTo(cx + a, cy); ctx.moveTo(cx, cy - a); ctx.lineTo(cx, cy + a); ctx.stroke(); ctx.restore();
  }
  const SL = selLayers();
  if (showUI && SL.length > 1) {
    ctx.save(); ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = k;
    for (const M of SL) { if (!visibleAt(M, time)) continue; const hm = hull3d(M, time); if (hm) { outline3d(ctx, hm); continue; }
      if (M.type === 'camera') { cameraMark(ctx, M, k); continue; } const { o, w, h } = bounds(M, time);
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rotation * PI / 180);
      const bw = w * Math.abs(o.scale * o.sx), bh = h * Math.abs(o.scale * o.sy); ctx.strokeRect(-bw / 2, -bh / 2, bw, bh); ctx.restore(); }
    const vis = SL.filter(M => visibleAt(M, time));
    if (vis.length) { const u = unionBox(vis); ctx.setLineDash([5 * k, 4 * k]); ctx.strokeRect(u.x - u.ex - 4 * k, u.y - u.ey - 4 * k, u.ex * 2 + 8 * k, u.ey * 2 + 8 * k); }
    ctx.restore();
  }
  const hl = showUI && SL.length === 1 && L && visibleAt(L, time) ? hull3d(L, time) : null;
  if (hl) { ctx.save(); ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = k; outline3d(ctx, hl); ctx.restore(); }
  else if (showUI && SL.length === 1 && L && L.type === 'camera' && visibleAt(L, time)) cameraMark(ctx, L, k);
  else if (showUI && SL.length === 1 && L && visibleAt(L, time)) {
    const { o, w, h } = bounds(L, time);
    const sx = o.scale * o.sx, sy = o.scale * o.sy;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rotation * PI / 180);
    const bw = w * Math.abs(sx), bh = h * Math.abs(sy);
    ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = 1 * k; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    if (L.type !== 'text' && !(L.fix?.w && L.fix?.h)) { const s = 7 * k; ctx.fillStyle = '#fff'; ctx.lineWidth = 1 * k;
      for (const [hx, hy] of HANDLES) { ctx.fillRect(hx * bw / 2 - s / 2, hy * bh / 2 - s / 2, s, s); ctx.strokeRect(hx * bw / 2 - s / 2, hy * bh / 2 - s / 2, s, s); } }
    ctx.restore();
  }
  if (showUI && snapGuides) {
    ctx.save(); ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    for (const x of snapGuides.x) { ctx.moveTo(x, 0); ctx.lineTo(x, S.h); }
    for (const y of snapGuides.y) { ctx.moveTo(0, y); ctx.lineTo(S.w, y); }
    ctx.stroke(); ctx.restore();
  }
  const D = dropTarget && S.layers.find(l => l.id === dropTarget);
  if (showUI && D) {
    const { o, w, h } = bounds(D, time);
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rotation * PI / 180);
    const bw = w * Math.abs(o.scale * o.sx) + 12 * k, bh = h * Math.abs(o.scale * o.sy) + 12 * k;
    ctx.fillStyle = 'rgba(76,141,255,.12)'; ctx.strokeStyle = '#4c8dff'; ctx.lineWidth = 1.5 * k;
    ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
const cur = () => S.layers.find(l => l.id === sel);
// Multi-selection. `sel` is the primary layer (the one the Design panel edits); `multi` holds every selected id while
// two or more are selected. Code that sets `sel` to a layer outside `multi` simply gets a single selection again.
let multi = new Set();
function selLayers() {
  if (sel != null && multi.size > 1 && multi.has(sel)) { const ls = S.layers.filter(l => multi.has(l.id)); if (ls.length > 1) return ls; }
  multi.clear(); const L = cur(); return L ? [L] : [];
}
const selIds = () => new Set(selLayers().map(l => l.id));
function setSelection(ids, primary) {
  ids = [...new Set(ids)].filter(id => S.layers.some(l => l.id === id));
  multi = new Set(ids.length > 1 ? ids : []);
  sel = ids.length ? (ids.includes(primary) ? primary : ids.at(-1)) : null; selKey = null;
}
// the axis-aligned box around several layers: centre and half extents, like box()
function unionBox(ls) {
  const bs = ls.map(L => box(L, time)), l = Math.min(...bs.map(b => b.x - b.ex)), r = Math.max(...bs.map(b => b.x + b.ex));
  const t = Math.min(...bs.map(b => b.y - b.ey)), btm = Math.max(...bs.map(b => b.y + b.ey));
  return { x: (l + r) / 2, y: (t + btm) / 2, ex: (r - l) / 2, ey: (btm - t) / 2 };
}

// ---------- canvas interaction ----------
function toCanvas(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * S.w / r.width, (e.clientY - r.top) * S.h / r.height]; }
function local(L, px, py) {
  const o = state(L, time), a = -o.rotation * PI / 180, dx = px - o.x, dy = py - o.y;
  return [(dx * Math.cos(a) - dy * Math.sin(a)) / (o.scale * o.sx || 1), (dx * Math.sin(a) + dy * Math.cos(a)) / (o.scale * o.sy || 1)];
}
let drag = null;
const marqueeEl = Object.assign(document.createElement('div'), { className: 'marquee' });
function hitLayer(px, py) {
  for (let i = S.layers.length - 1; i >= 0; i--) {
    const L = S.layers[i]; if (!visibleAt(L, time) || L.locked || L.type === 'camera') continue;
    const hull = hull3d(L, time); if (hull) { if (R3D.inside(hull, px, py)) return L; continue; }
    const { w, h } = bounds(L, time), [lx, ly] = local(L, px, py);
    if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return L;
  }
  return null;
}
// The resize handle under a point, as [hx, hy]: -1, 0 or 1 across and down, so [0, -1] is the top edge. Corners
// first, then anywhere along an edge.
const HANDLES = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
function handleAt(L, px, py, k) {
  if (L.type === 'text' || L.type === 'camera' || (L.fix?.w && L.fix?.h) || !visibleAt(L, time) || hull3d(L, time)) return null;
  const { w, h, o } = bounds(L, time), [lx, ly] = local(L, px, py), s = 12 * k / (o.scale || 1);
  for (const [hx, hy] of HANDLES.slice(0, 4))
    if (Math.abs(lx - hx * w / 2) < s && Math.abs(ly - hy * h / 2) < s) return [hx, hy];
  if (Math.abs(lx) < w / 2 && Math.abs(Math.abs(ly) - h / 2) < s * .7) return [0, Math.sign(ly)];
  if (Math.abs(ly) < h / 2 && Math.abs(Math.abs(lx) - w / 2) < s * .7) return [Math.sign(lx), 0];
  return null;
}
// The cursor says which way a handle resizes, turned with the layer.
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
function resizeCursor(L, [hx, hy]) {
  const deg = (Math.atan2(hy, hx) * 180 / PI + state(L, time).rotation + 360) % 180;
  return RESIZE_CURSORS[Math.round(deg / 45) % 4];
}
cv.addEventListener('pointermove', e => {
  if (drag) return; const L = selLayers().length === 1 ? cur() : null;
  const at = L && handleAt(L, ...toCanvas(e), S.w / cv.getBoundingClientRect().width);
  cv.style.cursor = at ? resizeCursor(L, at) : '';
});
// click selects; Shift/⌘-click adds or removes; dragging empty canvas draws a selection box (Shift/⌘ adds to it);
// dragging any selected layer moves the whole selection; corner handles resize a single layer
// Dragging with the middle button drags a copy: the layers, timeline bars and keyframes it grabs stay where they
// were, and what moves is a duplicate. The copy is made on the first move, so a middle click alone changes nothing.
// The layer that moves is the one picked up, renamed as the copy; the one left behind keeps its name.
function leaveCopies(ls) {
  for (const L of ls) {
    const c = JSON.parse(JSON.stringify(L)); c.id = uid++;
    S.layers.splice(S.layers.indexOf(L), 0, c);
    L.name = L.name.endsWith(' copy') ? L.name : L.name + ' copy';
  }
  status(ls.length > 1 ? `Duplicated ${ls.length} layers` : `Duplicated ${ls[0].name.replace(/ copy$/, '')}`);
}
addEventListener('mousedown', e => { if (e.button === 1 && (e.target === cv || e.target.closest?.('#tlc'))) e.preventDefault(); }, true);
cv.addEventListener('pointerdown', e => {
  UI.close();
  const [px, py] = toCanvas(e), L0 = cur(), group = selLayers(), k = S.w / cv.getBoundingClientRect().width;
  if (e.button === 1) {                                      // middle button: drag a copy of what is under it
    e.preventDefault();
    const hit = hitLayer(px, py); if (!hit) return;
    const inGroup = group.length > 1 && group.includes(hit);
    if (inGroup) sel = hit.id; else setSelection([hit.id]);
    const members = (inGroup ? group : [hit]).filter(m => !m.locked && !m.fix?.pos);
    if (!members.length) { status(`${hit.name}: its position is locked`); return; }
    drag = { mode: 'move', copy: true, L: hit, members: members.map(m => { const o = state(m, time); return { L: m, x: o.x, y: o.y }; }),
      ub: unionBox(members), px0: px, py0: py, was: false, x0: e.clientX, y0: e.clientY };
    cv.setPointerCapture(e.pointerId); refresh(true, false); return;
  }
  if (e.button > 1) return;
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;
  if (!additive && group.length === 1 && L0) {
    const at = handleAt(L0, px, py, k);
    if (at) { const o = state(L0, time);
      drag = { mode: 'resize', L: L0, hx: at[0], hy: at[1], o, w0: Math.abs(o.w), h0: Math.abs(o.h) }; cv.setPointerCapture(e.pointerId); return; }
  }
  const hit = hitLayer(px, py);
  if (additive && hit) {                                     // toggle one layer in or out of the selection
    const ids = group.map(l => l.id), on = ids.includes(hit.id);
    setSelection(on ? ids.filter(id => id !== hit.id) : [...ids, hit.id], on ? sel : hit.id);
    refresh(true, false); return;
  }
  if (hit) {
    const inGroup = group.length > 1 && group.includes(hit);
    if (inGroup) sel = hit.id; else setSelection([hit.id]);
    const members = (inGroup ? group : [hit]).filter(m => !m.locked && !m.fix?.pos);
    if (!members.length) { drag = { mode: 'still', L: hit, x0: e.clientX, y0: e.clientY }; cv.setPointerCapture(e.pointerId); refresh(true, false); return; }
    drag = { mode: 'move', L: hit, members: members.map(m => { const o = state(m, time); return { L: m, x: o.x, y: o.y }; }),
      ub: unionBox(members), px0: px, py0: py, was: !inGroup && L0 === hit, x0: e.clientX, y0: e.clientY };
  } else {
    if (!additive) setSelection([]);
    drag = { mode: 'marquee', px0: px, py0: py, base: additive ? group.map(l => l.id) : [], x0: e.clientX, y0: e.clientY };
  }
  cv.setPointerCapture(e.pointerId);
  refresh(true, false);
});
cv.addEventListener('pointermove', e => {
  if (!drag) return; const [px, py] = toCanvas(e), L = drag.L;
  if (!drag.moved && drag.mode !== 'resize' && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
  if (drag.mode === 'still') { if (!drag.moved) status(`${L.name}: its position is locked`); drag.moved = true; return; }
  if (drag.copy && !drag.moved) { leaveCopies(drag.members.map(m => m.L)); renderLayers(); }
  drag.moved = true;
  if (drag.mode === 'marquee') {
    const x1 = Math.min(drag.px0, px), x2 = Math.max(drag.px0, px), y1 = Math.min(drag.py0, py), y2 = Math.max(drag.py0, py);
    const ids = [...drag.base];
    for (const M of S.layers) { if (!visibleAt(M, time) || M.locked) continue; const b = box(M, time);
      if (b.x + b.ex >= x1 && b.x - b.ex <= x2 && b.y + b.ey >= y1 && b.y - b.ey <= y2) ids.push(M.id); }
    setSelection(ids, ids.includes(sel) ? sel : undefined);
    if (!marqueeEl.isConnected) document.body.appendChild(marqueeEl);
    Object.assign(marqueeEl.style, { left: Math.min(drag.x0, e.clientX) + 'px', top: Math.min(drag.y0, e.clientY) + 'px',
      width: Math.abs(e.clientX - drag.x0) + 'px', height: Math.abs(e.clientY - drag.y0) + 'px' });
    render(); renderLayers(); return;
  }
  if (drag.mode === 'move') {
    let dx = px - drag.px0, dy = py - drag.py0;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }        // Shift: one axis
    // snap the selection's edges and centre to the artboard and to other layers; red guides show what it snapped to
    snapGuides = null;
    if (snapOn && !(e.altKey || e.metaKey || e.ctrlKey)) {
      const tol = 7 * S.w / cv.getBoundingClientRect().width, me = drag.ub, hx = me.ex, hy = me.ey, mine = new Set(drag.members.map(m => m.L));
      const tx = [0, S.w / 2, S.w], ty = [0, S.h / 2, S.h];
      for (const O of S.layers) if (!mine.has(O) && visibleAt(O, time)) { const b = box(O, time); tx.push(b.x - b.ex, b.x, b.x + b.ex); ty.push(b.y - b.ey, b.y, b.y + b.ey); }
      const best = (v, half, ts) => { let r = null;
        for (const off of [-half, 0, half]) for (const t of ts) { const d = t - (v + off); if (Math.abs(d) <= tol && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, at: t }; }
        return r; };
      let nx = me.x + dx, ny = me.y + dy;
      const bx = best(nx, hx, tx), by = best(ny, hy, ty);
      if (bx) { nx += bx.d; dx += bx.d; } if (by) { ny += by.d; dy += by.d; }
      const hits = (v, half, ts) => [...new Set(ts.filter(t => [-half, 0, half].some(off => Math.abs(t - (v + off)) < .5)).map(Math.round))];
      snapGuides = { x: bx ? hits(nx, hx, tx) : [], y: by ? hits(ny, hy, ty) : [] };
    }
    for (const m of drag.members) { setProp(m.L, 'x', Math.round(m.x + dx)); setProp(m.L, 'y', Math.round(m.y + dy)); }
  } else resizeTo(drag, px, py, e);
  refresh(false); renderPropsValues();
});
// Resize from a handle. The side opposite it stays where it was, so the layer grows towards the pointer; with Alt
// (or a locked position) it grows from its centre instead. The edge being dragged snaps to the canvas's edges and
// centre and to other layers', unless snapping is off or ⌘/Ctrl is held. Shift flips keeping the proportions.
function resizeTo(d, px, py, e) {
  const L = d.L, a = d.o, kx = a.scale * a.sx || 1, ky = a.scale * a.sy || 1, r = a.rotation * PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r), dx = px - a.x, dy = py - a.y;
  const lx = (dx * cos + dy * sin) / kx, ly = (-dx * sin + dy * cos) / ky;      // the pointer, in the layer's frame
  const fromCentre = e.altKey || !!L.fix?.pos;
  const along = (hand, l, size0) => fromCentre ? Math.abs(l) * 2 : Math.max(4, (l + hand * size0 / 2) * hand);
  let w = d.hx ? along(d.hx, lx, d.w0) : d.w0, h = d.hy ? along(d.hy, ly, d.h0) : d.h0;
  // Snapping, while the layer is upright: where the dragged edge would land, on the canvas, to a target near it.
  snapGuides = null;
  if (snapOn && !(e.metaKey || e.ctrlKey) && Math.abs(Math.sin(r)) < 1e-6) {
    const tol = 7 * S.w / cv.getBoundingClientRect().width, tx = [0, S.w / 2, S.w], ty = [0, S.h / 2, S.h];
    for (const O of S.layers) if (O !== L && visibleAt(O, time)) { const b = box(O, time); tx.push(b.x - b.ex, b.x, b.x + b.ex); ty.push(b.y - b.ey, b.y, b.y + b.ey); }
    const snap = (hand, size, size0, k, c, ts) => {
      const edge = fromCentre ? c + hand * Math.sign(k * cos) * size / 2 * Math.abs(k) : c + Math.sign(k * cos) * (-hand * size0 / 2 + hand * size) * Math.abs(k);
      let best = null; for (const t of ts) if (Math.abs(t - edge) <= tol && (!best || Math.abs(t - edge) < Math.abs(best - edge))) best = t;
      if (best == null) return [size, null];
      const moved = (best - edge) / Math.abs(k) * Math.sign(k * cos) * hand;
      return [Math.max(4, size + (fromCentre ? 2 * moved : moved)), best];
    };
    const guides = { x: [], y: [] };
    if (d.hx) { const [nw, at] = snap(d.hx, w, d.w0, kx, a.x, tx); w = nw; if (at != null) guides.x.push(Math.round(at)); }
    if (d.hy) { const [nh, at] = snap(d.hy, h, d.h0, ky, a.y, ty); h = nh; if (at != null) guides.y.push(Math.round(at)); }
    if (guides.x.length || guides.y.length) snapGuides = guides;
  }
  // Keeping the proportions: a corner follows whichever side went further; a side takes the other with it.
  if (aspectLocked(L) !== e.shiftKey && !L.fix?.w && !L.fix?.h && d.w0 > 0 && d.h0 > 0) {
    if (d.hx && d.hy) { const f = Math.max(w / d.w0, h / d.h0); w = d.w0 * f; h = d.h0 * f; }
    else if (d.hx) h = d.h0 * w / d.w0; else w = d.w0 * h / d.h0;
  }
  if (L.fix?.w) w = d.w0; if (L.fix?.h) h = d.h0;
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
  setProp(L, 'w', w); setProp(L, 'h', h);
  if (fromCentre) return;
  // The centre moves by half the growth, towards the dragged side, turned with the layer.
  const cx = d.hx ? d.hx * (w - d.w0) / 2 * kx : 0, cy = d.hy ? d.hy * (h - d.h0) / 2 * ky : 0;
  // To the half pixel: an odd size centres between pixels, and the side that stays put stays exactly put.
  const half = v => Math.round(v * 2) / 2;
  setProp(L, 'x', half(a.x + cx * cos - cy * sin)); setProp(L, 'y', half(a.y + cx * sin + cy * cos));
}
cv.addEventListener('pointerup', () => {
  if (!drag) return; const d = drag; drag = null; snapGuides = null; marqueeEl.remove();
  if (d.mode === 'marquee') { refresh(true, false); const n = selLayers().length; if (d.moved && n) status(`${n} layer${n > 1 ? 's' : ''} selected`); return; }
  commit(); refresh();
  // clicking a text layer that was already selected starts editing it
  if (d.mode === 'move' && !d.moved && d.was && d.L.type === 'text') editText(d.L);
});
cv.addEventListener('dblclick', () => { const L = cur(); if (L?.type === 'text') editText(L); });

// ---------- on-canvas text editing ----------
// A transparent textarea sits over the text; the canvas keeps drawing it live, so it looks like typing in place.
let editingId = null;
function editText(L) {
  if (editingId) return; if (playing) togglePlay();
  editingId = L.id; const before = L.keys.text ? null : L.p.text, ta = document.createElement('textarea');
  ta.className = 'textedit'; ta.value = String(state(L, time).text); ta.spellcheck = false;
  document.body.appendChild(ta);
  const place = () => {
    const r = cv.getBoundingClientRect(), k = r.width / S.w, o = state(L, time), { w, h } = bounds(L, time);
    const s = o.scale * k;
    ta.style.cssText = `left:${r.left + o.x * k}px;top:${r.top + o.y * k}px;width:${w * s * Math.abs(o.sx) + 40}px;height:${h * s * Math.abs(o.sy) + 16}px;` +
      `font:${o.weight} ${o.size * s}px/${1.1} ${FONT};letter-spacing:${o.spacing * s}px;` +
      `transform:translate(-50%,-50%) rotate(${o.rotation}deg) scale(${o.sx},${o.sy})`;
  };
  place(); render(); ta.focus(); ta.select();
  ta.oninput = () => { setProp(L, 'text', ta.value); render(); place(); renderLayers(); };
  const finish = cancel => {
    if (editingId !== L.id) return; editingId = null;
    if (cancel && before != null) L.p.text = before;
    if (!String(L.p.text).trim() && !L.keys.text) L.p.text = 'Text';
    ta.remove(); refresh();
  };
  ta.onkeydown = e => { e.stopPropagation();
    if (e.key === 'Escape') finish(true);
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(false); } };
  ta.onblur = () => finish(false);
}

// ---------- icons (simple line icons, 16px grid) ----------
const ic = d => `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  rec: '<svg class="ico" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.5" fill="currentColor"/></svg>',
  rect: '<svg class="ico" viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2.2" fill="currentColor"/></svg>',
  ellipse: '<svg class="ico" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.8" fill="currentColor"/></svg>',
  star: ic('<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/>'),
  polygon: ic('<path d="M8 2l5.5 4-2.1 6.5H4.6L2.5 6z"/>'),
  arc: ic('<path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5"/>'),
  wave: ic('<path d="M1.5 9c1.6-3.4 2.8-3.4 4.2 0s2.6 3.4 4.2 0 2.6-3.4 4.4 0"/>'),
  text: ic('<path d="M3 4V3h10v1M8 3v10M6 13h4"/>'),
  eye: ic('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: ic('<path d="M2 2l12 12M6.5 4C7 3.7 7.5 3.5 8 3.5c4 0 6.5 4.5 6.5 4.5s-.7 1.2-1.9 2.4M4.1 5.2C2.5 6.4 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.3 2.7-.7"/>'),
  lock: ic('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>'),
  unlock: ic('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>'),
  trash: ic('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
  dup: ic('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>'),
  key: '<svg class="ico" viewBox="0 0 16 16"><path d="M8 2.5 13.5 8 8 13.5 2.5 8z" fill="currentColor"/></svg>',
  keyOff: ic('<path d="M8 3 13 8 8 13 3 8z"/>'),
  chev: ic('<path d="M4.5 6.5 8 10l3.5-3.5"/>'),
  play: '<svg class="ico" viewBox="0 0 16 16"><path d="M5 3.2v9.6c0 .4.5.7.8.4l7-4.8a.5.5 0 0 0 0-.8l-7-4.8c-.3-.3-.8 0-.8.4z" fill="currentColor"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor"/></svg>',
  start: ic('<path d="M4 3v10M12.5 3.5 6.5 8l6 4.5z"/>'),
  end: ic('<path d="M12 3v10M3.5 3.5 9.5 8l-6 4.5z"/>'),
  loop: ic('<path d="M3 7V6a2 2 0 0 1 2-2h7.5M10.5 2l2 2-2 2M13 9v1a2 2 0 0 1-2 2H3.5M5.5 14l-2-2 2-2"/>'),
  undo: ic('<path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H7"/>'),
  redo: ic('<path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H9"/>'),
  open: ic('<path d="M2 12.5V4a1 1 0 0 1 1-1h3l1.5 1.5H12a1 1 0 0 1 1 1V7"/><path d="M2 12.5 4 7.5h11l-2 5z"/>'),
  save: ic('<path d="M3 2.5h8l2.5 2.5v8.5h-11z"/><path d="M5 2.5v3.5h5V2.5M5 13.5v-4h6v4"/>'),
  file: ic('<path d="M4 1.5h5l3.5 3.5v9.5H4z"/><path d="M9 1.5V5h3.5"/>'),
  export: ic('<path d="M8 10V2M5 4.5 8 1.5l3 3M3 9v4.5h10V9"/>'),
  layers: ic('<path d="M8 2 14 5 8 8 2 5z"/><path d="M2 8l6 3 6-3M2 11l6 3 6-3"/>'),
  sliders: ic('<path d="M2 4h7M12 4h2M2 12h2M7 12h7M2 8h4M9 8h5"/><circle cx="10.5" cy="4" r="1.5"/><circle cx="5.5" cy="12" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>'),
  plus: ic('<path d="M8 3v10M3 8h10"/>'),
  check: ic('<path d="M3.5 8.5l3 3 6-7"/>'),
  sparkle: ic('<path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2"/>'),
  expand: ic('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>'),
  link: ic('<path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1"/>'),
  unlink: ic('<path d="M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1M2.5 2.5l2 2M11.5 11.5l2 2"/>'),
  alL: ic('<path d="M2.5 2v12"/><rect x="4.5" y="4" width="9" height="3" rx=".6"/><rect x="4.5" y="9" width="5.5" height="3" rx=".6"/>'),
  alC: ic('<path d="M8 2v12"/><rect x="3" y="4" width="10" height="3" rx=".6"/><rect x="5" y="9" width="6" height="3" rx=".6"/>'),
  alR: ic('<path d="M13.5 2v12"/><rect x="2.5" y="4" width="9" height="3" rx=".6"/><rect x="6" y="9" width="5.5" height="3" rx=".6"/>'),
  alT: ic('<path d="M2 2.5h12"/><rect x="4" y="4.5" width="3" height="9" rx=".6"/><rect x="9" y="4.5" width="3" height="5.5" rx=".6"/>'),
  alM: ic('<path d="M2 8h12"/><rect x="4" y="3" width="3" height="10" rx=".6"/><rect x="9" y="5" width="3" height="6" rx=".6"/>'),
  alB: ic('<path d="M2 13.5h12"/><rect x="4" y="2.5" width="3" height="9" rx=".6"/><rect x="9" y="6" width="3" height="5.5" rx=".6"/>'),
  distH: ic('<path d="M2.5 2v12M13.5 2v12"/><rect x="6.5" y="4.5" width="3" height="7" rx=".6"/>'),
  distV: ic('<path d="M2 2.5h12M2 13.5h12"/><rect x="4.5" y="6.5" width="7" height="3" rx=".6"/>'),
  center: ic('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><rect x="6" y="6" width="4" height="4" rx=".6"/>'),
  guides: ic('<rect x="2" y="3" width="12" height="10" rx="1"/><rect x="4.5" y="5.2" width="7" height="5.6" stroke-dasharray="1.5 1.5"/>'),
  marker: ic('<path d="M4 2.5h8v7l-4 4-4-4z"/>'),
  blade: ic('<path d="M8 1.5v13"/><path d="M3 5l3 3-3 3M13 5l-3 3 3 3"/>'),
  magnet: ic('<path d="M3.5 2.5v5a4.5 4.5 0 0 0 9 0v-5M3.5 5.5h3M9.5 5.5h3M6.5 2.5v5a1.5 1.5 0 0 0 3 0v-5"/>'),
  minus: ic('<path d="M3.5 8h9"/>'),
  prev: ic('<path d="M10 3.5 5.5 8l4.5 4.5"/>'),
  next: ic('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  audio: ic('<path d="M2.5 6.5v3M5 4.5v7M7.5 2.5v11M10 5v6M12.5 7v2"/>'),
  video: ic('<rect x="1.5" y="3.5" width="9.5" height="9" rx="1.5"/><path d="M11 7l3.5-2v6L11 9"/>'),
  play2: '<svg class="ico" viewBox="0 0 16 16"><path d="M5.5 4v8l6.5-4z" fill="currentColor"/></svg>',
  image: ic('<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3"/>'),
  upload: ic('<path d="M8 11V2.5M5 5.5l3-3 3 3M2.5 10v3.5h11V10"/>'),
  cube: ic('<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z"/><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6"/>'),
  model: ic('<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z"/><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6"/><circle cx="8" cy="8.2" r="1.3" fill="currentColor"/>'),
  camera: ic('<rect x="1.5" y="4.5" width="9" height="7" rx="1.5"/><path d="M10.5 7.2l4-2v5.6l-4-2"/>'),
};
ICON.shape3d = ICON.cube;

// ---------- history ----------
let hist = [], hi = -1, dirty = false;
function commit() {
  const s = JSON.stringify(S);
  if (hist[hi] === s) return;
  hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 150) hist.shift(); hi = hist.length - 1;
  if (hist.length > 1) setDirty(true);
  updateHistoryButtons();
}
function undoRedo(d) {
  const n = hi + d; if (n < 0 || n >= hist.length) return;
  hi = n; S = JSON.parse(hist[hi]); if (!cur()) sel = null; selKey = null; setDirty(true);
  refresh(true, false); updateHistoryButtons();
}
function updateHistoryButtons() { $('#undo').disabled = hi <= 0; $('#redo').disabled = hi >= hist.length - 1; }
function resetHistory() { hist = [JSON.stringify(S)]; hi = 0; updateHistoryButtons(); }

// ---------- layers panel ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// layer icons take the layer's colour, unless it is too dark to see on the panel
function iconColor(L) { const c = L.type === 'arc' || L.type === 'wave' ? L.p.stroke : L.p.fill, [r, g, b] = hex(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < .25 ? '#8b8b98' : c; }
function renderLayers() {
  const list = $('#layerList');
  if (!S.layers.length) { list.innerHTML = '<div class="empty">No layers yet.<br>Add a shape from the toolbar.</div>'; return; }
  const ss = selIds();
  list.innerHTML = [...S.layers].reverse().map(L => `
    <div class="layer ${ss.has(L.id) ? 'sel' : ''} ${L.hidden ? 'off' : ''} ${L.id === freshLayer ? 'fresh' : ''}" data-id="${L.id}" draggable="true">
      <span class="lt" style="color:${iconColor(L)}">${ICON[L.type]}</span>
      <span class="ln">${esc(L.name)}</span>
      ${Object.keys(L.keys).length ? '<span class="lk" title="Animated">' + ICON.key + '</span>' : ''}
      <button class="ib ${L.locked ? 'is-on' : ''}" data-act="lock" title="${L.locked ? 'Unlock' : 'Lock'}">${L.locked ? ICON.lock : ICON.unlock}</button>
      <button class="ib" data-act="vis" title="${L.hidden ? 'Show' : 'Hide'}">${L.hidden ? ICON.eyeOff : ICON.eye}</button>
    </div>`).join('');
  freshLayer = null;
}
$('#layerList').addEventListener('click', e => {
  const row = e.target.closest('.layer'); if (!row) return;
  const L = S.layers.find(l => l.id === +row.dataset.id), act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'vis') L.hidden = !L.hidden; else if (act === 'lock') L.locked = !L.locked;
  else if (e.metaKey || e.ctrlKey) { const ids = [...selIds()], on = ids.includes(L.id); setSelection(on ? ids.filter(i => i !== L.id) : [...ids, L.id], on ? sel : L.id); }
  else if (e.shiftKey && cur()) { const order = [...S.layers].reverse().map(l => l.id), a = order.indexOf(sel), b = order.indexOf(L.id);
    setSelection(order.slice(Math.min(a, b), Math.max(a, b) + 1), sel); }
  else setSelection([L.id]);
  refresh();
});
$('#layerList').addEventListener('dblclick', async e => {
  const row = e.target.closest('.layer'); if (!row) return;
  const L = S.layers.find(l => l.id === +row.dataset.id);
  const n = await UI.prompt('Rename layer', L.name, 'Rename'); if (n) { L.name = n; refresh(); }
});
let dragRow = null;
$('#layerList').addEventListener('dragstart', e => { dragRow = +e.target.closest('.layer')?.dataset.id; e.dataTransfer.effectAllowed = 'move'; });
$('#layerList').addEventListener('dragover', e => { e.preventDefault(); document.querySelectorAll('.layer.drop').forEach(r => r.classList.remove('drop')); e.target.closest('.layer')?.classList.add('drop'); });
$('#layerList').addEventListener('drop', e => {
  if (!dragRow) return; e.preventDefault(); const to = +e.target.closest('.layer')?.dataset.id; if (!dragRow || !to || to === dragRow) return;
  const from = S.layers.findIndex(l => l.id === dragRow), L = S.layers.splice(from, 1)[0];
  S.layers.splice(S.layers.findIndex(l => l.id === to) + (from > S.layers.findIndex(l => l.id === to) ? 1 : 0), 0, L);
  dragRow = null; refresh();
});
function duplicate() {
  const ls = selLayers(); if (!ls.length) return; const copies = [];
  for (const L of ls) {
    const c = JSON.parse(JSON.stringify(L)); c.id = uid++; c.name = L.name + ' copy'; c.p.x += 40; c.p.y += 40;
    for (const k of ['x', 'y']) (c.keys[k] || []).forEach(q => q.v += 40);
    S.layers.splice(S.layers.indexOf(L) + 1, 0, c); copies.push(c.id);
  }
  setSelection(copies); freshLayer = copies.at(-1); refresh(); status(ls.length > 1 ? `Duplicated ${ls.length} layers` : 'Duplicated ' + ls[0].name);
}
function removeLayer() { const ls = selLayers(); if (!ls.length) return; S.layers = S.layers.filter(l => !ls.includes(l)); setSelection([]); refresh();
  status(ls.length > 1 ? `Deleted ${ls.length} layers` : 'Deleted ' + ls[0].name); }

// ---------- properties panel ----------
const WEIGHTS = [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']];
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'],
  ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'],
  ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'], ['lighter', 'Add']];
const fmt = v => +(+v).toFixed(2);
let propsFor = null;
// the align bar: one layer aligns to the canvas, several to each other; centre moves the whole selection
function alignHTML(n) {
  const b = (how, icon, tip) => `<button class="ib" data-align="${how}" title="${tip}">${ICON[icon]}</button>`, rel = n > 1 ? 'the selection' : 'the canvas';
  return `<div class="sec"><div class="sech">Align</div><div class="alignbar">
    ${b('left', 'alL', `Align left to ${rel}  ⌥A`)}${b('hcenter', 'alC', `Centre horizontally on ${rel}  ⌥H`)}${b('right', 'alR', `Align right to ${rel}  ⌥D`)}<i></i>
    ${b('top', 'alT', `Align top to ${rel}  ⌥W`)}${b('vcenter', 'alM', `Centre vertically on ${rel}  ⌥V`)}${b('bottom', 'alB', `Align bottom to ${rel}  ⌥S`)}
    ${n > 2 ? `<i></i><button class="ib" data-dist="x" title="Distribute horizontally  ⌥⇧H">${ICON.distH}</button><button class="ib" data-dist="y" title="Distribute vertically  ⌥⇧V">${ICON.distV}</button>` : ''}</div>
    <div class="btnrow"><button class="tb small" data-center="xy">${ICON.center}<span>Centre on canvas</span></button>
      <button class="tb small" data-center="x" title="Centre horizontally on the canvas">↔</button><button class="tb small" data-center="y" title="Centre vertically on the canvas">↕</button></div></div>`;
}
function renderProps() {
  const L = cur(), Pn = $('#props');
  if (!L) { propsFor = null;
    Pn.innerHTML = `<div class="ph"><span>Animations</span></div><p class="note lead">Drag an animation onto a layer on the canvas, or onto a layer's row in the timeline to drop it at that moment. Select a layer to edit its properties.</p>${presetsHTML()}`; return; }
  const SL = selLayers();
  if (SL.length > 1) {                                       // several layers: what they can do together
    propsFor = null;
    Pn.innerHTML = `<div class="ph"><span>${SL.length} layers</span><span class="spacer"></span>
      <button class="ib" data-cmd="dup" title="Duplicate all (⌘D)">${ICON.dup}</button><button class="ib" data-cmd="del" title="Delete all (⌫)">${ICON.trash}</button></div>
      ${alignHTML(SL.length)}
      <div class="sec"><div class="sech">Selected</div><div class="sellist">${SL.slice().reverse().map(M => `<button class="selitem" data-only="${M.id}" title="Select only this layer"><span class="lt" style="color:${iconColor(M)}">${ICON[M.type]}</span>${esc(M.name)}</button>`).join('')}</div>
      <p class="note">Shift-click or ⌘-click layers to add or remove them. Drag on empty canvas to box-select. ⌘A selects all.</p></div>`;
    return;
  }
  const o = state(L, time), list = PROPS[L.type];
  let h = `<div class="ph ${propsFor !== L.id ? 'enter' : ''}"><span class="lt" style="color:${iconColor(L)}">${ICON[L.type]}</span>
    <input class="pname" data-name value="${esc(L.name)}" spellcheck="false">
    <button class="ib" data-cmd="dup" title="Duplicate (⌘D)">${ICON.dup}</button><button class="ib" data-cmd="del" title="Delete (⌫)">${ICON.trash}</button></div>
    <div class="tabs"><button class="tab ${tab === 'props' ? 'on' : ''}" data-tab="props">Design</button><button class="tab ${tab === 'anim' ? 'on' : ''}" data-tab="anim">Animate</button></div>`;
  if (tab === 'props') {
    const bl = BLENDS.find(b => b[0] === (L.blend || 'source-over'))[1];
    h += `<div class="sec"><div class="sech">Layer</div><div class="grid">
      <div class="row wide"><label>Blend</label><button class="selectbtn" data-menu="blend"><span>${bl}</span>${ICON.chev}</button></div>
      <div class="row"><label data-scrub="${1 / FPS}">In</label><input data-lt="in" value="${lin(L).toFixed(2)}" inputmode="decimal"><em class="unit">s</em></div>
      <div class="row"><label data-scrub="${1 / FPS}">Out</label><input data-lt="out" value="${lout(L).toFixed(2)}" inputmode="decimal"><em class="unit">s</em></div>
      ${L.type === 'video' ? `<div class="row wide"><label data-scrub="${1 / FPS}">Source in</label><input data-lt="vin" value="${(L.p.vin || 0).toFixed(2)}" inputmode="decimal"><em class="unit">s</em></div>` : ''}
      ${L.type === 'image' || L.type === 'video' ? `<div class="btnrow wide"><button class="tb small" data-cmd="flipx">Flip H</button><button class="tb small" data-cmd="flipy">Flip V</button><button class="tb small" data-cmd="fitcanvas" title="Resize the canvas to this image at full resolution">Fit canvas</button></div>` : ''}
      </div></div>` + alignHTML(1);
    for (const [g, keys] of GROUPS) {
      const ks = keys.filter(k => list.includes(k)); if (!ks.length) continue;
      h += `<div class="sec"><div class="sech">${g}</div><div class="grid">`;
      if (g === 'Adjust') h += `<div class="row wide"><label>Look</label><button class="selectbtn" data-menu="look"><span>Apply a look…</span>${ICON.chev}</button></div>`;
      for (const k of ks) {
        if ((k === 'fill2' || k === 'gradAngle') && (o.grad || 'none') === 'none') continue;
        if (k === 'gradAngle' && o.grad !== 'linear') continue;
        // turning and depth only once a flat layer is made 3D; letters only for 3D text, corners only for a cube
        if (DEPTH.includes(k) && !R3D.is3d(L)) continue;
        if (L.type === 'shape3d' && ((k === 'text' && o.shape !== 'text') || (k === 'radius' && o.shape !== 'cube'))) continue;
        const anim = ANIM.includes(k), here = L.keys[k]?.some(x => near(x.t, time)), keyed = L.keys[k]?.length, v = o[k];
        const fx = FIX_OF[k], isFixed = fixed(L, k);
        const kb = anim ? `<button class="kf ${keyed ? 'has' : ''} ${here ? 'here' : ''}" data-key="${k}" title="${here ? 'Remove keyframe' : 'Add keyframe at playhead'}"${isFixed ? ' disabled' : ''}>${here ? ICON.key : ICON.keyOff}</button>` : '<span class="kf"></span>';
        let field;
        if (k === 'grad') field = `<button class="selectbtn" data-menu="grad"><span>${(GRADS.find(g => g[0] === (v || 'none')) || GRADS[0])[1]}</span>${ICON.chev}</button>`;
        else if (COLORS.includes(k)) field = `<button class="swatch" data-color="${k}"><i style="background:${v}"></i><span>${v.toUpperCase()}</span></button>`;
        else if (k === 'text') field = `<textarea data-p="text" rows="2" spellcheck="false">${esc(v)}</textarea>`;
        else if (k === 'weight') field = `<button class="selectbtn" data-menu="weight"><span>${WEIGHTS.find(w => w[0] == v)?.[1] || v}</span>${ICON.chev}</button>`;
        else if (k === 'three') field = `<button class="switch ${v ? 'on' : ''}" data-cmd="three" title="${v ? 'Make it flat again' : 'Turn it in 3D, push it back, and let a camera move around it'}"><span>${v ? 'On' : 'Off'}</span><i></i></button>`;
        else if (k === 'shape') field = `<button class="selectbtn" data-menu="shape"><span>${R3D.SHAPES.find(x => x[0] === v)?.[1] || v}</span>${ICON.chev}</button>`;
        else if (k === 'material') field = `<button class="selectbtn" data-menu="material"><span>${R3D.MATERIALS.find(x => x[0] === v)?.[1] || v}</span>${ICON.chev}</button>`;
        else field = `<input data-p="${k}" value="${fmt(v)}" inputmode="decimal" spellcheck="false"${isFixed ? ' disabled' : ''}>`;
        const wide = ['fill', 'fill2', 'grad', 'stroke', 'text', 'weight', 'three', 'shape', 'material'].includes(k) ? ' wide' : '';
        // Keeping the proportions means nothing once either side is locked.
        const lock = k === 'w' && list.includes('h') && !L.fix?.w && !L.fix?.h ? `<button class="ib aspect ${aspectLocked(L) ? 'on' : ''}" data-cmd="aspect" title="${aspectLocked(L) ? 'Aspect ratio locked: click to unlock' : 'Lock aspect ratio'}">${aspectLocked(L) ? ICON.link : ICON.unlink}</button>` : '';
        const pin = fx ? `<button class="ib fix ${isFixed ? 'on' : ''}" data-fix="${fx}" title="${isFixed ? `${FIX_NAME[fx]} locked: click to unlock` : `Lock ${FIX_NAME[fx].toLowerCase()}`}">${isFixed ? ICON.lock : ICON.unlock}</button>` : '';
        h += `<div class="row${wide}${isFixed ? ' fixed' : ''}" data-row="${k}">${kb}<label ${field.startsWith('<input') && !isFixed ? `data-scrub="${STEP[k] || 1}"` : ''}>${(L.type === 'camera' && CAMERA_LABEL[k]) || LABEL[k]}</label>${field}${pin}${lock}</div>`;
      }
      h += '</div></div>';
    }
  } else h += presetsHTML(L);
  Pn.innerHTML = h; propsFor = L.id;
}
let tab = 'props';
function renderPropsValues() {
  const L = cur(); if (!L || tab !== 'props') return; const o = state(L, time);
  document.querySelectorAll('#props [data-p]').forEach(i => { if (i !== document.activeElement && i.dataset.p !== 'text') i.value = fmt(o[i.dataset.p]); });
  document.querySelectorAll('#props [data-color]').forEach(b => { const v = o[b.dataset.color]; b.querySelector('i').style.background = v; b.querySelector('span').textContent = v.toUpperCase(); });
  document.querySelectorAll('#props [data-key]').forEach(b => { const k = b.dataset.key, here = L.keys[k]?.some(x => near(x.t, time));
    b.classList.toggle('here', !!here); b.innerHTML = here ? ICON.key : ICON.keyOff; });
}
const Pn = $('#props');
Pn.addEventListener('input', e => {
  const L = cur(); if (!L) return;
  if (e.target.dataset.name !== undefined) { L.name = e.target.value; renderLayers(); renderTracks(); return; }
  if (e.target.dataset.lt) { const v = parseFloat(e.target.value); if (isNaN(v)) return;
    if (e.target.dataset.lt === 'vin') { L.p.vin = Math.max(0, Math.min(v, (S.assets[L.p.asset]?.dur || 0) - .05)); render(); return; }
    if (e.target.dataset.lt === 'in') L.in = Math.max(0, Math.min(v, lout(L) - 1 / FPS)); else L.out = Math.min(S.dur, Math.max(v, lin(L) + 1 / FPS));
    render(); renderTracks(); return; }
  const k = e.target.dataset.p; if (!k) return;
  if (k === 'text') setProp(L, k, e.target.value);
  else { const v = parseFloat(e.target.value); if (isNaN(v)) return;
    if ((k === 'w' || k === 'h') && aspectLocked(L)) { const o = state(L, time), other = k === 'w' ? 'h' : 'w';
      if (o.w > 0 && o.h > 0 && v > 0) { setProp(L, other, Math.max(1, Math.round(v * o[other] / o[k]))); renderPropsValues(); } }
    setProp(L, k, v); }
  render(); renderTracks();
});
Pn.addEventListener('change', () => refresh());
Pn.addEventListener('keydown', e => {
  const i = e.target; if (!i.dataset?.p || i.dataset.p === 'text') return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault();
    const s = (STEP[i.dataset.p] || 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
    i.value = fmt((parseFloat(i.value) || 0) + s); i.dispatchEvent(new Event('input', { bubbles: true })); }
  if (e.key === 'Enter') { i.blur(); refresh(); }
});
UI.scrub(Pn, (input) => input.dispatchEvent(new Event('input', { bubbles: true })));
Pn.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.preset && (dragJustEnded || !cur())) { if (!dragJustEnded) status('Drag it onto a layer, or select a layer first'); return; }
  if (t.dataset.align) return alignLayer(t.dataset.align);
  if (t.dataset.center) return centerOnCanvas(t.dataset.center);
  if (t.dataset.dist) return distribute(t.dataset.dist);
  if (t.dataset.only) { setSelection([+t.dataset.only]); return refresh(true, false); }
  if (t.dataset.cmd === 'dup') return duplicate();
  if (t.dataset.cmd === 'del') return removeLayer();
  const L = cur(); if (!L) return;
  if (t.dataset.key) toggleKey(L, t.dataset.key);
  else if (t.dataset.tab) { tab = t.dataset.tab; renderProps(); }
  else if (t.dataset.cmd === 'dup') duplicate();
  else if (t.dataset.cmd === 'del') removeLayer();
  else if (t.dataset.cmd === 'flipx' || t.dataset.cmd === 'flipy') { const k = t.dataset.cmd === 'flipx' ? 'sx' : 'sy'; setProp(L, k, -state(L, time)[k]); refresh(); }
  else if (t.dataset.cmd === 'fitcanvas') fitCanvasToImage(L);
  else if (t.dataset.cmd === 'three') { L.p.three = !L.p.three; refresh(); status(L.p.three ? `${L.name} is 3D: turn it with Rotate X and Y, push it back with Depth` : `${L.name} is flat again`); }
  else if (t.dataset.menu === 'shape')
    UI.menu(t, R3D.SHAPES.map(([value, label]) => ({ value, label })), L.p.shape, v => { L.p.shape = v; if (v === 'text') R3D.loadFont(); refresh(); });
  else if (t.dataset.menu === 'material')
    UI.menu(t, R3D.MATERIALS.map(([value, label]) => ({ value, label })), L.p.material, v => { L.p.material = v; refresh(); });
  else if (t.dataset.fix) toggleFix(L, t.dataset.fix);
  else if (t.dataset.cmd === 'aspect') { L.lockAspect = !aspectLocked(L); refresh(); status(L.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'); }
  else if (t.dataset.menu === 'look')
    UI.menu(t, Object.keys(LOOKS).map(n => ({ value: n, label: n })), null, n => { for (const [k, v] of Object.entries({ ...LOOK0, ...LOOKS[n] })) setProp(L, k, v); refresh(); status(`Look: ${n}`); });
  else if (t.dataset.color) { const k = t.dataset.color;
    UI.color(t, state(L, time)[k], c => { setProp(L, k, c); render(); renderPropsValues(); renderLayers(); }); }
  else if (t.dataset.menu === 'blend')
    UI.menu(t, BLENDS.map(([v, l]) => ({ value: v, label: l })), L.blend || 'source-over', v => { L.blend = v === 'source-over' ? undefined : v; refresh(); });
  else if (t.dataset.menu === 'grad')
    UI.menu(t, GRADS.map(([value, label]) => ({ value, label })), L.p.grad || 'none', v => {
      // A new gradient starts from the fill to the next colour along, rather than to itself.
      if (v !== 'none' && (!isColor(L.p.fill2) || L.p.fill2 === state(L, time).fill)) {
        const f = state(L, time).fill, i = PALETTE.indexOf(f);
        L.p.fill2 = PALETTE[(i + 1) % PALETTE.length] === f ? PALETTE[1] : PALETTE[(i + 1) % PALETTE.length];
      }
      L.p.gradAngle ??= 90; L.p.grad = v; refresh(); status(v === 'none' ? 'Solid fill' : `${v[0].toUpperCase() + v.slice(1)} gradient`);
    });
  else if (t.dataset.menu === 'weight')
    UI.menu(t, WEIGHTS.map(([v, l]) => ({ value: v, label: l, hint: v })), L.p.weight, v => { L.p.weight = v; refresh(); },
      it => `<b style="font-weight:${it.value};width:22px">Aa</b>`);
  else if (t.dataset.preset) applyPreset(L, t.dataset.preset);
});

// ---------- animation presets ----------
// Each preset writes keyframes starting at the playhead. add(prop, secondsFromStart, value, easeOutOfThisKey)
const PRESETS = {
  Entrance: {
    'Fade in': (a, o) => { a('opacity', 0, 0, 'sineOut'); a('opacity', .5, o.opacity); },
    'Pop in': (a, o) => { a('scale', 0, 0, 'back'); a('scale', .55, o.scale); a('opacity', 0, 0, 'sineOut'); a('opacity', .2, o.opacity); },
    'Rise': (a, o) => { a('y', 0, o.y + 140, 'expoOut'); a('y', .8, o.y); a('opacity', 0, 0, 'sineOut'); a('opacity', .45, o.opacity); },
    'Descend': (a, o) => { a('y', 0, o.y - 140, 'expoOut'); a('y', .8, o.y); a('opacity', 0, 0, 'sineOut'); a('opacity', .45, o.opacity); },
    'From left': (a, o) => { a('x', 0, o.x - 260, 'expoOut'); a('x', .8, o.x); a('opacity', 0, 0); a('opacity', .4, o.opacity); },
    'From right': (a, o) => { a('x', 0, o.x + 260, 'expoOut'); a('x', .8, o.x); a('opacity', 0, 0); a('opacity', .4, o.opacity); },
    'Zoom in': (a, o) => { a('scale', 0, o.scale * 2.2, 'expoOut'); a('scale', .7, o.scale); a('opacity', 0, 0, 'sineOut'); a('opacity', .4, o.opacity); },
    'Drop': (a, o) => { a('y', 0, -200, 'bounce'); a('y', 1, o.y); },
    'Flip in': (a, o) => { a('sx', 0, 0, 'back'); a('sx', .6, o.sx); },
    'Unfold': (a, o) => { a('sy', 0, 0, 'expoOut'); a('sy', .6, o.sy); },
    'Blur in': (a, o) => { a('blur', 0, 40, 'quartOut'); a('blur', .8, o.blur); a('opacity', 0, 0, 'sineOut'); a('opacity', .5, o.opacity); },
    'Spin in': (a, o) => { a('rotation', 0, o.rotation - 180, 'back'); a('rotation', .8, o.rotation); a('scale', 0, 0, 'back'); a('scale', .8, o.scale); },
    'Elastic': (a, o) => { a('scale', 0, 0, 'elastic'); a('scale', 1.1, o.scale); },
    'Squash': (a, o) => { a('sx', 0, 1.6 * o.sx, 'spring'); a('sy', 0, .3 * o.sy, 'spring'); a('sx', .9, o.sx); a('sy', .9, o.sy); a('opacity', 0, 0); a('opacity', .15, o.opacity); },
    'Typewriter': (a, o, L) => { if (L.type !== 'text') return 'Text layers only'; a('reveal', 0, 0, 'linear'); a('reveal', Math.min(2.5, String(o.text).length * .055), 1); },
    'Draw on': (a, o, L) => { if (L.type === 'wave') { a('reveal', 0, 0, 'expoInOut'); a('reveal', 1.1, 1); return; }
    if (L.type !== 'arc') return 'Arc and wave layers only'; a('sweep', 0, 0, 'expoInOut'); a('sweep', 1.1, o.sweep); },
  },
  Emphasis: {
    'Pulse': (a, o) => { a('scale', 0, o.scale, 'sineInOut'); a('scale', .25, o.scale * 1.15, 'sineInOut'); a('scale', .5, o.scale); },
    'Heartbeat': (a, o) => { [[0, 1], [.14, 1.2], [.28, 1], [.42, 1.14], [.7, 1]].forEach(([t, s]) => a('scale', t, o.scale * s, 'sineInOut')); },
    'Shake': (a, o) => { [0, 18, -16, 12, -8, 4, 0].forEach((d, i) => a('x', i * .06, o.x + d, 'sineInOut')); },
    'Wiggle': (a, o) => { [0, 10, -9, 7, -4, 0].forEach((d, i) => a('rotation', i * .08, o.rotation + d, 'sineInOut')); },
    'Swing': (a, o) => { [0, 15, -10, 5, -5, 0].forEach((d, i) => a('rotation', i * .15, o.rotation + d, 'sineInOut')); },
    'Jello': (a, o) => { [[1, 1], [1.25, .75], [.75, 1.25], [1.15, .85], [.95, 1.05], [1, 1]].forEach(([x, y], i) => { a('sx', i * .11, o.sx * x, 'sineInOut'); a('sy', i * .11, o.sy * y, 'sineInOut'); }); },
    'Tada': (a, o) => { [[1, 0], [.9, -3], [1.1, 3], [1.1, -3], [1.1, 3], [1, 0]].forEach(([s, r], i) => { a('scale', i * .12, o.scale * s, 'sineInOut'); a('rotation', i * .12, o.rotation + r, 'sineInOut'); }); },
    'Bounce': (a, o) => { a('y', 0, o.y, 'expoOut'); a('y', .25, o.y - 90, 'bounce'); a('y', .9, o.y); },
    'Flash': (a, o) => { [1, 0, 1, 0, 1].forEach((v, i) => a('opacity', i * .12, v * o.opacity, 'step')); },
    'Glow': (a, o) => { a('shadow', 0, o.shadow, 'sineInOut'); a('shadow', .4, 60, 'sineInOut'); a('shadow', .8, o.shadow); },
    'Color shift': (a, o) => { const nxt = PALETTE[(PALETTE.indexOf(o.fill) + 1) % PALETTE.length]; a('fill', 0, o.fill, 'sineInOut'); a('fill', .5, nxt, 'sineInOut'); a('fill', 1, o.fill); },
    'Spin 360': (a, o) => { a('rotation', 0, o.rotation, 'expoInOut'); a('rotation', 1, o.rotation + 360); },
  },
  Exit: {
    'Fade out': (a, o) => { a('opacity', 0, o.opacity, 'sineIn'); a('opacity', .5, 0); },
    'Pop out': (a, o) => { a('scale', 0, o.scale, 'backIn'); a('scale', .5, 0); },
    'Sink': (a, o) => { a('y', 0, o.y, 'expoIn'); a('y', .7, o.y + 160); a('opacity', 0, o.opacity, 'sineIn'); a('opacity', .7, 0); },
    'Lift off': (a, o) => { a('y', 0, o.y, 'expoIn'); a('y', .7, o.y - 160); a('opacity', 0, o.opacity, 'sineIn'); a('opacity', .7, 0); },
    'Zoom out': (a, o) => { a('scale', 0, o.scale, 'expoIn'); a('scale', .6, o.scale * 2); a('opacity', 0, o.opacity, 'sineIn'); a('opacity', .6, 0); },
    'Blur out': (a, o) => { a('blur', 0, o.blur, 'quartOut'); a('blur', .7, 40); a('opacity', 0, o.opacity, 'sineIn'); a('opacity', .7, 0); },
    'Fall': (a, o) => { a('y', 0, o.y, 'easeIn'); a('y', .9, S.h + 400); a('rotation', 0, o.rotation, 'easeIn'); a('rotation', .9, o.rotation + 35); },
    'Spin out': (a, o) => { a('rotation', 0, o.rotation, 'backIn'); a('rotation', .7, o.rotation + 180); a('scale', 0, o.scale, 'backIn'); a('scale', .7, 0); },
    'Erase': (a, o, L) => { if (L.type === 'text') { a('reveal', 0, 1, 'linear'); a('reveal', .6, 0); }
      else if (L.type === 'arc') { a('sweep', 0, o.sweep, 'expoInOut'); a('sweep', .8, 0); } else return 'Text and arc layers only'; },
  },
  '3D': {
    'Flip': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; a('rotY', 0, o.rotY, 'expoInOut'); a('rotY', .9, o.rotY + 180); },
    'Swing in': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; a('rotX', 0, o.rotX + 90, 'backOut'); a('rotX', .8, o.rotX); a('opacity', 0, 0, 'sineOut'); a('opacity', .3, o.opacity); },
    'Turn in': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; a('rotY', 0, o.rotY - 90, 'expoOut'); a('rotY', .8, o.rotY); a('opacity', 0, 0, 'sineOut'); a('opacity', .3, o.opacity); },
    'Fly in': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; a('z', 0, o.z + 2400, 'expoOut'); a('z', 1, o.z); a('opacity', 0, 0, 'sineOut'); a('opacity', .4, o.opacity); },
    'Fly out': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; a('z', 0, o.z, 'expoIn'); a('z', .8, o.z - 900); a('opacity', .4, o.opacity, 'sineIn'); a('opacity', .8, 0); },
    'Turntable': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; a('rotY', -1, o.rotY, 'linear'); a('rotY', 1e3, o.rotY + 360 * Math.max(1, Math.round(S.dur / 4))); },
    'Tumble': (a, o, L) => { if (L.type === 'camera') return 'Not for a camera'; const n = Math.max(1, Math.round(S.dur / 4));
      a('rotY', -1, o.rotY, 'linear'); a('rotY', 1e3, o.rotY + 360 * n); a('rotX', -1, o.rotX, 'linear'); a('rotX', 1e3, o.rotX + 180 * n); },
    'Orbit around': (a, o, L) => { if (L.type !== 'camera') return 'Camera layers only'; a('orbit', -1, o.orbit, 'linear'); a('orbit', 1e3, o.orbit + 360); },
    'Push in': (a, o, L) => { if (L.type !== 'camera') return 'Camera layers only'; a('dolly', 0, o.dolly, 'sineInOut'); a('dolly', 2, o.dolly + S.h * .6); },
    'Pull back': (a, o, L) => { if (L.type !== 'camera') return 'Camera layers only'; a('dolly', 0, o.dolly, 'sineInOut'); a('dolly', 2, o.dolly - S.h * .8); },
    'Crane up': (a, o, L) => { if (L.type !== 'camera') return 'Camera layers only'; a('tilt', 0, o.tilt, 'sineInOut'); a('tilt', 2, o.tilt + 35); },
  },
  'Loop (whole clip)': {
    'Float': (a, o) => loopKeys(a, 'y', 1.6, [o.y, o.y - 24]),
    'Breathe': (a, o) => loopKeys(a, 'scale', 2, [o.scale, o.scale * 1.08]),
    'Pendulum': (a, o) => loopKeys(a, 'rotation', 1.2, [o.rotation - 18, o.rotation + 18]),
    'Blink': (a, o) => loopKeys(a, 'opacity', .8, [o.opacity, o.opacity * .25]),
    'Spin': (a, o) => { a('rotation', -1, o.rotation, 'linear'); a('rotation', 1e3, o.rotation + 360 * Math.max(1, Math.round(S.dur / 3))); },
    'Orbit': (a, o) => { const r = 120, n = Math.max(1, Math.round(S.dur / 2.5)), q = S.dur / (n * 4);
      for (let i = 0; i <= n * 4; i++) { const ang = i * PI / 2; a('x', i * q, o.x + Math.round(Math.cos(ang) * r), i % 2 ? 'sineIn' : 'sineOut', true);
        a('y', i * q, o.y + Math.round(Math.sin(ang) * r), i % 2 ? 'sineOut' : 'sineIn', true); } },
    'Hue cycle': (a, o) => { const cs = [o.fill, ...PALETTE.filter(c => c !== o.fill).slice(0, 3), o.fill];
      cs.forEach((c, i) => a('fill', i * S.dur / (cs.length - 1), c, 'sineInOut', true)); },
  },
};
function loopKeys(a, prop, period, [v0, v1]) {
  const n = Math.max(1, Math.round(S.dur / period)), half = S.dur / n / 2;
  for (let i = 0; i <= n * 2; i++) a(prop, i * half, i % 2 ? v1 : v0, 'sineInOut', true);
}
function applyPreset(L, name) {
  const [, fn] = Object.values(PRESETS).flatMap(g => Object.entries(g)).find(([n]) => n === name);
  const t0 = time, o = state(L, t0), cleared = new Set(); let end = t0;
  // turning a flat layer in depth makes it a 3D layer
  if (!R3D.is3d(L) && PROPS[L.type].includes('three') && /rotX|rotY|'z'/.test(String(fn))) L.p.three = true;
  const add = (p, dt, v, ease, abs) => {
    // loops replace whatever keys were already on the property they drive
    if ((abs || dt === -1) && !cleared.has(p)) { cleared.add(p); delete L.keys[p]; }
    const t = Math.max(0, Math.min(S.dur, abs ? dt : (dt < 0 ? 0 : t0 + dt)));
    if (dt === -1) return setKey(L, p, 0, v, ease); if (dt >= 1e3) return setKey(L, p, S.dur, v, ease);
    setKey(L, p, t, v, ease || 'easeInOut'); end = Math.max(end, t); };
  const msg = fn(add, o, L);
  if (msg) return status(msg);
  sel = L.id; time = end; refresh(); status(`${name} added to ${L.name}`);
}
function presetMeta(fn, L) {
  const D = L || { type: 'rect', p: { ...DEFAULTS, fill: PALETTE[0] }, keys: {} }; let m = 0, loopy = false;
  if (!L && /Camera layers only/.test(String(fn))) return 'camera';
  const msg = fn((p, dt, v, e, abs) => { if (abs || dt === -1 || dt >= 1e3) loopy = true; else m = Math.max(m, dt); }, { ...D.p, x: 0, y: 0 }, D);
  return msg ? msg.replace(' layers only', ' only') : loopy ? 'loop' : m.toFixed(1) + 's';
}
function presetsHTML(L) {
  let h = '<div class="presets">';
  for (const [g, items] of Object.entries(PRESETS)) {
    h += `<div class="sec"><div class="sech">${g}</div><div class="chips">`;
    for (const [n, fn] of Object.entries(items)) h += `<button class="chip" data-preset="${n}">${n}<em>${presetMeta(fn, L)}</em></button>`;
    h += '</div></div>';
  }
  return h + `<p class="note">Click to apply at the playhead, or drag onto a layer in the viewer or the timeline.</p></div>`;
}

// ---------- timeline ----------
// One scroll container: a sticky ruler row on top, sticky name column on the left, lanes that grow with zoom.
let zoom = 1, snapOn = true, openRows = new Set();
const PAD = 12;
const tlEl = () => $('#tl');
const nmW = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nm')) || 200;
const PADR = 64; // room after the end so the end handle can be dragged further out
const laneW = () => Math.max(160, (tlEl().clientWidth - nmW() - PAD - PADR) * zoom + PAD + PADR);
const span = () => laneW() - PAD - PADR;
const t2x = t => PAD + t / S.dur * span();
const x2t = x => Math.max(0, Math.min(S.dur, (x - PAD) / span() * S.dur));
const FPS = 30, frame = t => Math.round(t * FPS) / FPS;
const lin = L => L.in ?? 0, lout = L => Math.min(S.dur, L.out ?? S.dur);
const visibleAt = (L, t) => !L.hidden && t >= lin(L) - 1e-6 && t <= lout(L) + 1e-6;

// snapping: playhead, markers, layer in/out points and keyframes, within 6px
function snapT(t, ev, skip) {
  if (!snapOn || ev?.shiftKey) return frame(t);
  const cands = [0, S.dur, time, ...(S.markers || []).map(m => m.t)];
  for (const L of S.layers) { if (L !== skip) cands.push(lin(L), lout(L)); for (const k of keyTimes(L)) cands.push(k); }
  for (const [, c] of allClips()) if (c !== skip) cands.push(c.start, c.start + c.len);
  const tol = 6 / span() * S.dur; let best = null, bd = tol;
  for (const c of cands) { const d = Math.abs(c - t); if (d < bd) { bd = d; best = c; } }
  showSnap(best);
  return best ?? frame(t);
}
function showSnap(t) {
  let s = $('#tlc .snapline'); if (t == null) return s?.remove();
  if (!s) { s = document.createElement('div'); s.className = 'snapline'; $('#tlc').appendChild(s); }
  s.style.left = nmW() + t2x(t) + 'px';
}
// ONCOPY, when given, lets the middle button drag a copy: it runs once, on the first move, to leave one behind
function dragOn(el, onMove, onUp, onCopy) {
  el.addEventListener('pointerdown', e => {
    const copy = e.button === 1 && !!onCopy;
    if (e.button && !copy) return; e.stopPropagation(); if (copy) e.preventDefault(); if (playing) togglePlay();
    const x0 = e.clientX; let moved = false;
    const mv = ev => { if (!moved && Math.abs(ev.clientX - x0) < 3) return; if (!moved && copy) onCopy(); moved = true; onMove(ev, ev.clientX - x0); };
    const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); showSnap(null); onUp(moved, ev); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
}
const rowEl = (cls, name, id) => { const r = document.createElement('div'); r.className = 'trow ' + cls; if (id != null) r.dataset.id = id;
  r.innerHTML = `<div class="tnm">${name}</div><div class="tln" style="width:${laneW()}px"></div>`; return r; };
function diamond(ln, L, t, prop) {
  const d = document.createElement('div'), isSel = selKey && selKey.id === L.id && near(selKey.t, t) && (selKey.prop ?? null) === (prop ?? null);
  d.className = 'dia' + (isSel ? ' sel' : ''); d.style.left = t2x(t) + 'px'; d.dataset.t = t; d.dataset.prop = prop || '';
  const props = prop ? [prop] : Object.keys(L.keys).filter(p => L.keys[p].some(k => near(k.t, t)));
  d.title = `${t.toFixed(2)}s  ${props.map(p => LABEL[p]).join(', ')}`;
  const ks = () => prop ? L.keys[prop].filter(k => near(k.t, t)) : keysAt(L, t);
  let grabbed = null, t0 = t;
  d.addEventListener('pointerdown', () => { sel = L.id; selKey = { id: L.id, t, prop }; grabbed = ks(); t0 = t; updateEaseButton(); renderSelKeys(); });
  dragOn(d, (ev, dx) => { const nt = snapT(x2t(t2x(t0) + dx), ev, null); grabbed.forEach(k => k.t = nt); selKey.t = nt; d.style.left = t2x(nt) + 'px'; time = nt; render(); placeHead(); },
    moved => { Object.values(L.keys).forEach(a => a.sort((p, q) => p.t - q.t)); if (moved) refresh(); else seek(t); },
    // the keys grabbed move on; copies of them stay where they were
    () => { for (const k of grabbed) for (const [p, a] of Object.entries(L.keys)) if (a.includes(k)) a.push({ ...k }); status('Duplicated the keyframe'); });
  ln.appendChild(d);
}
function renderSelKeys() { document.querySelectorAll('#tlc .dia.sel').forEach(d => d.classList.remove('sel')); }
function renderTracks() {
  const C = $('#tlc'), head = $('#head'), W = laneW();
  C.style.width = nmW() + W + 'px'; C.innerHTML = ''; C.appendChild(head);
  // ruler
  const R = rowEl('ruler', fmtTime(time)), rl = R.querySelector('.tln'), px = span() / S.dur;
  const step = [1 / FPS, 2 / FPS, 5 / FPS, 10 / FPS, .5, 1, 2, 5, 10].find(s => s * px >= 64) || 10;
  let h = '';
  for (let i = 0, t = 0; t <= S.dur + 1e-6; i++, t = i * step / 5) {
    const mj = i % 5 === 0;
    h += `<i class="tick${mj ? ' mj' : ''}" style="left:${t2x(t)}px"></i>` + (mj ? `<span class="tl" style="left:${t2x(t)}px">${fmtRuler(t, step)}</span>` : '');
  }
  rl.innerHTML = h;
  rl.addEventListener('pointerdown', e => scrubFrom(e, rl));
  rl.addEventListener('dblclick', e => addMarker(x2t(e.clientX - rl.getBoundingClientRect().left)));
  (S.markers || []).forEach((m, i) => {
    const k = document.createElement('div'); k.className = 'mk'; k.style.left = t2x(m.t) + 'px'; k.title = (m.label || 'Marker') + '  ·  double-click to rename, alt-click to delete';
    const lab = document.createElement('span'); lab.className = 'mklabel'; lab.style.left = t2x(m.t) + 'px'; lab.textContent = m.label || '';
    k.addEventListener('pointerdown', e => { if (e.altKey) { e.stopPropagation(); S.markers.splice(i, 1); refresh(); } });
    dragOn(k, (ev, dx) => { m.t = snapT(x2t(t2x(m._t ??= m.t) + dx), ev); k.style.left = lab.style.left = t2x(m.t) + 'px'; },
      moved => { delete m._t; if (!moved) seek(m.t); else refresh(); });
    k.addEventListener('dblclick', async e => { e.stopPropagation(); const n = await UI.prompt('Marker name', m.label || '', 'Rename'); if (n != null) { m.label = n; refresh(); } });
    rl.append(k, lab);
    const line = document.createElement('div'); line.className = 'mkline'; line.style.left = nmW() + t2x(m.t) + 'px'; C.appendChild(line);
  });
  C.appendChild(R);
  // end of the timeline: drag the handle to lengthen or shorten the composition
  const endH = document.createElement('div'); endH.className = 'endh'; endH.style.left = t2x(S.dur) + 'px';
  endH.title = `End ${fmtTime(S.dur)}  ·  drag to change the length`;
  endH.innerHTML = `<span>${fmtTime(S.dur)}</span>`;
  let d0 = 0, sp0 = 0;
  endH.addEventListener('pointerdown', () => { d0 = S.dur; sp0 = span(); });
  dragOn(endH, (ev, dx) => {
    const nd = Math.max(.5, Math.min(600, frame(d0 + dx / sp0 * d0)));
    endH.style.left = PAD + nd / d0 * sp0 + 'px'; endH.firstChild.textContent = fmtTime(nd); endH._nd = nd;
  }, moved => { if (moved && endH._nd) setDuration(endH._nd); });
  rl.appendChild(endH);
  const pastEnd = document.createElement('div'); pastEnd.className = 'pastend'; pastEnd.style.left = nmW() + t2x(S.dur) + 'px'; C.appendChild(pastEnd);
  if (!S.layers.length && !hasAudio()) C.insertAdjacentHTML('beforeend', '<div class="empty">Add a layer to start animating.</div>');
  // layers, top of the stack first
  for (const L of [...S.layers].reverse()) {
    const keyed = Object.keys(L.keys).filter(p => L.keys[p]?.length), open = openRows.has(L.id) && keyed.length;
    const row = rowEl('layer-row' + (selIds().has(L.id) ? ' sel' : '') + (L.hidden ? ' off' : ''),
      `<button class="twirl ${keyed.length ? '' : 'none'} ${open ? 'open' : ''}" title="Show keyframed properties"></button><span class="lt" style="color:${iconColor(L)}">${ICON[L.type]}</span><span class="ln">${esc(L.name)}</span>`, L.id);
    row.querySelector('.tnm').addEventListener('click', e => {
      if (e.target.closest('.twirl')) { openRows.has(L.id) ? openRows.delete(L.id) : openRows.add(L.id); return renderTracks(); }
      sel = L.id; selKey = null; refresh(); });
    const ln = row.querySelector('.tln');
    // trim bar: drag the body to slide the layer in time (with its keyframes), the ends to trim in/out
    const bar = document.createElement('div'); bar.className = 'trim ' + L.type;
    const place = () => { bar.style.left = t2x(lin(L)) + 'px'; bar.style.width = Math.max(4, t2x(lout(L)) - t2x(lin(L))) + 'px'; };
    place(); bar.innerHTML = '<div class="th l" title="Trim in  ["></div><div class="th r" title="Trim out  ]"></div>';
    let st = null;
    const begin = () => { st = { i: lin(L), o: lout(L), keys: Object.values(L.keys).flat().map(k => [k, k.t]) }; sel = L.id; };
    bar.querySelector('.l').addEventListener('pointerdown', begin);
    bar.querySelector('.r').addEventListener('pointerdown', begin);
    bar.addEventListener('pointerdown', e => { if (!e.target.closest('.th')) begin(); });
    dragOn(bar.querySelector('.l'), (ev, dx) => { L.in = Math.min(snapT(x2t(t2x(st.i) + dx), ev, L), lout(L) - 1 / FPS); place(); render(); }, m => m ? refresh() : seek(lin(L)));
    dragOn(bar.querySelector('.r'), (ev, dx) => { L.out = Math.max(snapT(x2t(t2x(st.o) + dx), ev, L), lin(L) + 1 / FPS); place(); render(); }, m => m ? refresh() : seek(lout(L)));
    dragOn(bar, (ev, dx) => {
      let d = x2t(t2x(st.i) + dx) - st.i; d = snapT(st.i + d, ev, L) - st.i;
      d = Math.max(-st.i, Math.min(S.dur - st.o, d));
      L.in = st.i + d; L.out = st.o + d; st.keys.forEach(([k, t0]) => k.t = Math.max(0, Math.min(S.dur, t0 + d)));
      place(); ln.querySelectorAll('.dia').forEach(x => x.remove()); keyTimes(L).forEach(t => diamond(ln, L, t)); render();
    }, m => { if (m) refresh(); else { sel = L.id; selKey = null; refresh(); } }, () => { leaveCopies([L]); renderLayers(); });
    ln.appendChild(bar);
    keyTimes(L).forEach(t => diamond(ln, L, t));
    ln.addEventListener('pointerdown', e => { if (e.target === ln) { selKey = null; scrubFrom(e, ln); } });
    C.appendChild(row);
    if (open) for (const p of keyed) {
      const pr = rowEl('prop-row', `<span class="ln">${LABEL[p]}</span><span class="kfnav"><button data-nav="-1" title="Previous keyframe">${ICON.prev}</button><button data-nav="0" title="Add or remove keyframe">${ICON.key}</button><button data-nav="1" title="Next keyframe">${ICON.next}</button></span>`, L.id);
      pr.querySelector('.kfnav').addEventListener('click', e => { const n = e.target.closest('[data-nav]')?.dataset.nav; if (n == null) return; sel = L.id;
        if (n === '0') return toggleKey(L, p);
        const ts = L.keys[p].map(k => k.t), nt = +n > 0 ? ts.find(t => t > time + 1e-4) : [...ts].reverse().find(t => t < time - 1e-4);
        if (nt != null) { selKey = { id: L.id, t: nt, prop: p }; seek(nt); } });
      const pl = pr.querySelector('.tln');
      L.keys[p].forEach(k => diamond(pl, L, k.t, p));
      pl.addEventListener('pointerdown', e => { if (e.target === pl) { selKey = null; scrubFrom(e, pl); } });
      C.appendChild(pr);
    }
  }
  for (const T of tracks()) C.appendChild(audioTrackRow(T));
  // The playhead runs the full height of the rows. It is measured without its own old height, which would otherwise
  // keep the timeline as tall as it ever was, scrolled into empty space after layers are removed.
  head.style.height = '0px'; head.style.height = C.scrollHeight + 'px';
  placeHead(); updateEaseButton(); renderZoom();
}
const fmtRuler = (t, step) => step < 1 ? (Number.isInteger(+t.toFixed(4)) ? `${Math.round(t)}s` : `${Math.floor(t)}:${String(Math.round((t % 1) * FPS)).padStart(2, '0')}`) : `${+t.toFixed(2)}s`;
function placeHead() {
  $('#head').style.transform = `translateX(${nmW() + t2x(time)}px)`; $('#tc').textContent = fmtTime(time);
  const r = $('#tlc .ruler .tnm'); if (r) r.textContent = fmtTime(time);
  if (playing) { const tl = tlEl(), x = nmW() + t2x(time); if (x > tl.scrollLeft + tl.clientWidth - 40 || x < tl.scrollLeft + nmW()) tl.scrollLeft = x - nmW() - 40; }
}
const fmtTime = t => { const f = Math.round(t * FPS), s = Math.floor(f / FPS);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`; };
function seek(t) { time = Math.max(0, Math.min(S.dur, t)); syncAudio(); refresh(); }
function scrubFrom(e, el) {
  if (playing) togglePlay();
  const mv = ev => { time = snapScrub(x2t(ev.clientX - el.getBoundingClientRect().left), ev); render(); placeHead(); renderPropsValues(); }; mv(e);
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); showSnap(null); refresh(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
const snapScrub = (t, ev) => { if (!snapOn || ev.shiftKey) return frame(t); const keep = time; time = -99; const r = snapT(t, ev); time = keep; return r; };

// zoom
function setZoom(z, anchorX) {
  const tl = tlEl(), before = anchorX != null ? (tl.scrollLeft + anchorX - nmW()) / laneW() : null;
  zoom = Math.max(1, Math.min(40, z)); renderTracks();
  if (before != null) tl.scrollLeft = before * laneW() - anchorX + nmW();
}
function renderZoom() { const f = Math.log(zoom) / Math.log(40); $('.zfill').style.width = f * 100 + '%'; $('.zknob').style.left = f * 100 + '%'; }
$('#zoomIn').onclick = () => setZoom(zoom * 1.5, tlEl().clientWidth / 2);
$('#zoomOut').onclick = () => setZoom(zoom / 1.5, tlEl().clientWidth / 2);
$('#zoomFit').onclick = () => setZoom(1);
$('.zoom').addEventListener('pointerdown', e => { const tr = $('.ztrack');
  const mv = ev => { const f = Math.max(0, Math.min(1, (ev.clientX - tr.getBoundingClientRect().left) / tr.offsetWidth)); setZoom(Math.pow(40, f), tlEl().clientWidth / 2); }; mv(e);
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
tlEl().addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey || e.altKey)) return; e.preventDefault();
  setZoom(zoom * Math.exp(-e.deltaY * .01), e.clientX - tlEl().getBoundingClientRect().left); }, { passive: false });
$('#rec').onclick = () => setRecording(!recording);
$('#snap').onclick = () => { snapOn = !snapOn; $('#snap').classList.toggle('on', snapOn); status('Snapping ' + (snapOn ? 'on' : 'off')); };

// markers
// timeline length: lengthening never moves anything; shortening clips layers and keys that would fall off the end
function setDuration(d) {
  d = Math.max(.5, Math.min(600, frame(d))); if (Math.abs(d - S.dur) < 1e-6) return;
  const grow = d > S.dur, old = S.dur; S.dur = d;
  for (const L of S.layers) {
    if (L.out != null && (L.out > d || (grow && Math.abs(L.out - old) < 1e-6))) L.out = grow ? d : Math.min(L.out, d);
    if (L.in != null && L.in >= d) L.in = Math.max(0, d - 1 / FPS);
  }
  time = Math.min(time, d); refresh(); status(`Timeline length ${fmtTime(d)}`);
}
async function askDuration() {
  const v = await UI.prompt('Timeline length (seconds)', String(+S.dur.toFixed(2)), 'Set length'); if (v == null) return;
  const n = parseFloat(v); if (isFinite(n) && n > 0) setDuration(n); else status('Enter a length in seconds');
}
$('#extend').onclick = e => UI.menu(e.currentTarget, [
  { value: 1, label: 'Add 1 second', hint: '+1s' }, { value: 5, label: 'Add 5 seconds', hint: '+5s' }, { value: 10, label: 'Add 10 seconds', hint: '+10s' },
  { value: 'fit', label: 'Fit to content', hint: 'trim' }, { value: 'set', label: 'Set length\u2026' }], null,
  v => {
    if (v === 'set') return askDuration();
    if (v === 'fit') { let end = .5; for (const L of S.layers) { end = Math.max(end, L.out ?? 0, ...keyTimes(L)); }
      for (const [, c] of allClips()) end = Math.max(end, c.start + c.len); return setDuration(end); }
    setDuration(S.dur + v);
  });
$('#outtc').parentElement.onclick = askDuration;
function addMarker(t = time) { (S.markers ||= []).push({ t: frame(t), label: '' }); S.markers.sort((a, b) => a.t - b.t); refresh(); status(`Marker at ${fmtTime(t)}`); }
$('#addMarker').onclick = () => addMarker();

// split: the layer ends at the playhead and a copy picks up from there (keyframes kept on both halves)
function splitLayer() {
  const L = cur(); if (!L) return hasAudio() ? splitAudio(selClip) : status('Select a layer or an audio clip to split');
  if (time <= lin(L) + 1e-3 || time >= lout(L) - 1e-3) return status('Move the playhead inside the layer to split it');
  const c = JSON.parse(JSON.stringify(L)); c.id = uid++; c.name = L.name + ' (2)'; c.in = time; L.out = time;
  S.layers.splice(S.layers.indexOf(L) + 1, 0, c); sel = c.id; refresh(); status(`Split ${L.name} at ${fmtTime(time)}`);
}
$('#split').onclick = splitLayer;

// keyframe easing
const keySel = () => { const L = S.layers.find(l => l.id === selKey?.id); if (!L) return [L, []];
  return [L, selKey.prop ? (L.keys[selKey.prop] || []).filter(k => near(k.t, selKey.t)) : keysAt(L, selKey.t)]; };
function updateEaseButton() {
  const [L, ks] = keySel(), b = $('#ease'), has = L && ks.length;
  b.disabled = !has; $('#delKey').disabled = !has;
  const e = has ? ks[0].ease || 'easeInOut' : null;
  $('#keyinfo').textContent = has ? `${L.name} · ${selKey.prop ? LABEL[selKey.prop] : ks.length + ' keys'} · ${fmtTime(selKey.t)}` : '';
  b.innerHTML = has ? `${curveSVG(e, 20, 13)}<span>${easeName(e)}</span>${ICON.chev}` : `<span>No keyframe selected</span>${ICON.chev}`;
}
$('#ease').onclick = e => { const [L, ks] = keySel(); if (!ks.length) return;
  UI.menu(e.currentTarget, EASE_ITEMS, ks[0].ease, v => { keySel()[1].forEach(k => k.ease = v); refresh(); status('Easing set to ' + easeName(v)); }, it => curveSVG(it.value)); };
$('#delKey').onclick = () => {
  const [L, ks] = keySel(); if (!ks.length) return;
  for (const p in L.keys) { const before = L.keys[p].length; L.keys[p] = L.keys[p].filter(k => !ks.includes(k));
    if (before && !L.keys[p].length) { L.p[p] = val(L, p, selKey.t); delete L.keys[p]; } }
  selKey = null; refresh();
};

// ---------- playback ----------
let last = 0;
// ---------- audio: tracks of clips ----------
// S.sounds       {id: {name, dur}}  the source files. Their bytes live in SND (outside the project state, so undo stays
//                fast) and are embedded only when saving.
// S.audioTracks  [{id, name, muted, volume, clips: [{id, sound, start, in, len, fadeIn, fadeOut}]}]
//                start: where the clip sits on the timeline; in: where in the source file it begins; len: how long it plays.
const SND = {};                          // sound id -> data: URL
const CLIPEL = new Map();                // clip id -> the <audio> element that plays it in the preview
let selClip = null;                      // selected clip id
const tracks = () => S.audioTracks || [];
const allClips = () => tracks().flatMap(T => T.clips.map(c => [T, c]));
const hasAudio = () => allClips().length > 0;
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const soundDur = c => S.sounds?.[c.sound]?.dur ?? c.in + c.len;
// a clip's loudness `at` seconds into it: linear fade in from its start and fade out into its end
function clipGain(c, at) {
  const fi = c.fadeIn > 0 ? Math.min(1, Math.max(0, at / c.fadeIn)) : 1;
  const fo = c.fadeOut > 0 ? Math.min(1, Math.max(0, (c.len - at) / c.fadeOut)) : 1;
  return fi * fo;
}
function syncAudio(force) {
  const live = new Set();
  for (const [T, c] of allClips()) {
    const src = SND[c.sound]; if (!src) continue;
    live.add(c.id);
    let el = CLIPEL.get(c.id);
    if (!el) { el = new Audio(); el.preload = 'auto'; CLIPEL.set(c.id, el); }
    if (el._src !== src) { el.src = src; el._src = src; }
    const at = time - c.start;
    el.muted = !!T.muted; el.volume = Math.max(0, Math.min(1, (T.volume ?? 1) * clipGain(c, at)));
    if (!playing || at < 0 || at >= c.len) { if (!el.paused) el.pause(); continue; }
    const want = c.in + at;
    if (force || Math.abs(el.currentTime - want) > .08) { try { el.currentTime = want; } catch {} }
    if (el.paused) el.play().catch(() => {});
  }
  for (const [id, el] of CLIPEL) if (!live.has(id)) { el.pause(); el.removeAttribute('src'); el.load(); CLIPEL.delete(id); }
}
// projects saved before multi-track audio had one soundtrack, S.audio, with its bytes inline; sounds keep theirs in .src
function adoptAudio(P) {
  if (P.audio && P.audio.src) {
    const A = P.audio, sid = newId('s'), start = A.offset || 0, len = Math.max(1 / FPS, Math.min(A.dur, (P.dur || A.dur) - start));
    (P.sounds ||= {})[sid] = { name: A.name, dur: A.dur, src: A.src };
    (P.audioTracks ||= []).push({ id: newId('t'), name: A.name.replace(/\.[^.]+$/, ''), muted: !!A.muted, volume: A.volume ?? 1,
      clips: [{ id: newId('c'), sound: sid, start, in: 0, len: len > 0 ? len : A.dur, fadeIn: A.fadeIn || 0, fadeOut: A.fadeOut || 0 }] });
  }
  delete P.audio;
  P.sounds ||= {}; P.audioTracks ||= [];
  for (const [sid, s] of Object.entries(P.sounds)) if (s.src) { SND[sid] = s.src; delete s.src; }
}
// add a sound (a data: URL) as a clip: on a new track unless `trackId` names one, starting at `at`, trimmed to the timeline
async function addSound(name, src, at = time, trackId = null) {
  const a = new Audio(); a.src = src;
  const dur = await new Promise(r => { a.onloadedmetadata = () => r(a.duration); a.onerror = () => r(0); });
  if (!dur || !isFinite(dur)) { status(`Could not read ${name}`); return null; }
  const sid = newId('s'); (S.sounds ||= {})[sid] = { name, dur }; SND[sid] = src;
  return addClip(sid, at, trackId);
}
function addClip(sid, at = time, trackId = null) {
  const snd = S.sounds[sid], start = frame(at < S.dur - .25 ? Math.max(0, at) : 0);
  const len = Math.max(1 / FPS, Math.min(snd.dur, S.dur - start));
  const c = { id: newId('c'), sound: sid, start, in: 0, len, fadeIn: 0, fadeOut: 0 };
  S.audioTracks ||= [];
  let T = trackId && S.audioTracks.find(x => x.id === trackId);
  if (!T) { T = { id: newId('t'), name: snd.name.replace(/\.[^.]+$/, ''), muted: false, volume: 1, clips: [] }; S.audioTracks.push(T); }
  T.clips.push(c); selClip = c.id; sel = null; selKey = null;
  syncAudio(true); refresh();
  status(`Added ${snd.name} at ${fmtTime(start)}` + (len < snd.dur - .01 ? ' · trimmed to the timeline, drag its right edge to lengthen' : ''));
  return c;
}
function findClip(id) { for (const T of tracks()) { const c = T.clips.find(x => x.id === id); if (c) return [T, c]; } return [null, null]; }
function deleteClip(id = selClip) {
  const [T, c] = findClip(id); if (!c) return;
  T.clips = T.clips.filter(x => x !== c); if (selClip === id) selClip = null;
  syncAudio(); refresh(); status(`Deleted ${S.sounds?.[c.sound]?.name || 'clip'}`);
}
// split at the playhead: the selected clip, or every clip under the playhead. Fade-in stays on the left half,
// fade-out on the right.
function splitAudio(onlyId = null) {
  const t = frame(time); let n = 0;
  for (const T of tracks()) for (let i = 0; i < T.clips.length; i++) {
    const c = T.clips[i];
    if (onlyId && c.id !== onlyId) continue;
    if (t <= c.start + 1e-3 || t >= c.start + c.len - 1e-3) continue;
    const cut = t - c.start;
    const r = { ...c, id: newId('c'), start: t, in: c.in + cut, len: c.len - cut, fadeIn: 0, fadeOut: Math.min(c.fadeOut, c.len - cut) };
    c.len = cut; c.fadeOut = 0; c.fadeIn = Math.min(c.fadeIn, cut);
    T.clips.splice(++i, 0, r); n++; if (onlyId) selClip = r.id;
  }
  if (!n) { status(onlyId ? 'Move the playhead inside the clip to split it' : 'No audio under the playhead'); return false; }
  syncAudio(true); refresh(); status(`Split ${n} audio clip${n > 1 ? 's' : ''} at ${fmtTime(t)}`); return true;
}
// fades can never overlap: fade in + fade out <= the clip's length
function clampFades(c) { c.fadeIn = Math.max(0, Math.min(c.fadeIn || 0, c.len)); c.fadeOut = Math.max(0, Math.min(c.fadeOut || 0, c.len - c.fadeIn)); }
// export: mix every unmuted clip between t0 and t1 into one 44.1 kHz stereo WAV, fades and track volumes included
const DECODED = new Map();
function decodeSound(sid) {
  if (!DECODED.has(sid)) DECODED.set(sid, (async () => {
    const buf = await (await fetch(SND[sid])).arrayBuffer(), ac = new (window.AudioContext || window.webkitAudioContext)();
    try { return await ac.decodeAudioData(buf); } finally { ac.close(); }
  })());
  return DECODED.get(sid);
}
async function mixAudio(t0, t1) {
  const SR = 44100, ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((t1 - t0) * SR)), SR); let any = false;
  for (const [T, c] of allClips()) {
    if (T.muted || !SND[c.sound]) continue;
    const a = Math.max(c.start, t0), b = Math.min(c.start + c.len, t1); if (b - a < 1e-3) continue;
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = await decodeSound(c.sound);
    src.connect(g).connect(ctx.destination);
    const vol = Math.max(0, Math.min(1, T.volume ?? 1)), n = Math.max(2, Math.ceil((b - a) * 200) + 1), curve = new Float32Array(n);
    for (let k = 0; k < n; k++) curve[k] = vol * clipGain(c, a - c.start + (b - a) * k / (n - 1));
    g.gain.setValueCurveAtTime(curve, a - t0, b - a);
    src.start(a - t0, c.in + (a - c.start), b - a); any = true;
  }
  return any ? wavBlob(await ctx.startRendering()) : null;
}
function wavBlob(ab) {
  const ch = ab.numberOfChannels, n = ab.length, dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((x, i) => dv.setUint8(o + i, x.charCodeAt(0)));
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true); dv.setUint32(24, ab.sampleRate, true); dv.setUint32(28, ab.sampleRate * ch * 2, true);
  dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => ab.getChannelData(i));
  for (let i = 0, o = 44; i < n; i++) for (let k = 0; k < ch; k++, o += 2) { const v = Math.max(-1, Math.min(1, chans[k][i])); dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); }
  return new Blob([dv], { type: 'audio/wav' });
}
function tick(ts) {
  if (!playing) return;
  time += (ts - last) / 1000; last = ts;
  if (time >= S.dur) { if (loop) { time %= S.dur; syncAudio(true); } else { time = S.dur; togglePlay(); return; } }
  syncAudio(); syncVideos(); render(); placeHead(); renderPropsValues(); requestAnimationFrame(tick);
}
function togglePlay() {
  playing = !playing; $('#play').innerHTML = playing ? ICON.pause : ICON.play; $('#play').classList.toggle('playing', playing);
  document.body.classList.toggle('is-playing', playing);
  if (playing) { if (time >= S.dur - 1e-3) time = 0; last = performance.now(); syncAudio(true); requestAnimationFrame(tick); }
  else { syncAudio(); syncVideos(); time = frame(time); refresh(); }
}
const step = n => { if (playing) togglePlay(); seek(frame(time) + n / FPS); };
$('#play').onclick = togglePlay;
$('#toStart').onclick = () => seek(0);
$('#toEnd').onclick = () => seek(S.dur);
$('#prevFrame').onclick = () => step(-1);
$('#nextFrame').onclick = () => step(1);
$('#loop').onclick = () => { loop = !loop; $('#loop').classList.toggle('on', loop); };
$('#guides').onclick = () => { guidesOn = !guidesOn; $('#guides').classList.toggle('on', guidesOn); render(); };

// ---------- audio tracks in the timeline ----------
const peaksCache = new Map();
function peaksFor(src) {
  if (peaksCache.has(src)) return peaksCache.get(src);
  const p = (async () => {
    const buf = await (await fetch(src)).arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)(), au = await ac.decodeAudioData(buf); ac.close();
    const ch = au.getChannelData(0), n = 4000, block = Math.floor(ch.length / n), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < block; j += 8) m = Math.max(m, Math.abs(ch[i * block + j])); out[i] = m; }
    return out;
  })();
  peaksCache.set(src, p); return p;
}
function audioTrackRow(T) {
  const row = rowEl('audio' + (T.muted ? ' off' : ''), `<span class="lt">${ICON.audio}</span><span class="ln" title="${esc(T.name)} · double-click to rename">${esc(T.name)}</span>
    <button class="ib" data-a="mute" title="${T.muted ? 'Unmute track' : 'Mute track'}">${T.muted ? ICON.eyeOff : ICON.eye}</button>
    <button class="ib" data-a="del" title="Delete track">${ICON.trash}</button>`);
  row.dataset.track = T.id;
  row.querySelector('[data-a=mute]').onclick = () => { T.muted = !T.muted; syncAudio(); refresh(); };
  row.querySelector('[data-a=del]').onclick = () => {
    S.audioTracks = tracks().filter(x => x !== T); if (T.clips.some(c => c.id === selClip)) selClip = null;
    syncAudio(); refresh(); status(`Deleted track ${T.name}`); };
  row.querySelector('.ln').addEventListener('dblclick', async () => { const n = await UI.prompt('Track name', T.name, 'Rename'); if (n) { T.name = n; refresh(); } });
  const ln = row.querySelector('.tln');
  for (const c of T.clips) ln.appendChild(clipEl(T, c));
  ln.addEventListener('pointerdown', e => { if (e.target === ln) { selClip = null; scrubFrom(e, ln); } });
  return row;
}
// one clip: drag the body to move it (also onto another audio track), the side edges to trim it, and the dots at its top
// corners to fade it in or out. Drag a dot back to its corner, or double-click it, to remove the fade.
function clipEl(T, c) {
  const el = document.createElement('div'), H = 36;
  el.className = 'clip' + (c.id === selClip && !cur() ? ' sel' : '') + (T.muted ? ' muted' : '');
  el.innerHTML = `<canvas></canvas><svg class="fadeline" preserveAspectRatio="none"><path vector-effect="non-scaling-stroke"/></svg>
    <span>${esc(S.sounds?.[c.sound]?.name || 'audio')}</span><div class="th l" title="Trim start"></div><div class="th r" title="Trim end"></div>
    <i class="fdot l"></i><i class="fdot r"></i>`;
  const cv = el.querySelector('canvas'), svg = el.querySelector('svg'), path = svg.firstElementChild, dl = el.querySelector('.fdot.l'), dr = el.querySelector('.fdot.r');
  const pps = () => span() / S.dur;                                   // pixels per second
  let pk = null;
  const draw = () => {
    if (!pk) return;
    const W = cv.width = Math.min(8000, Math.max(1, Math.round(el.offsetWidth * devicePixelRatio))), Hh = cv.height = Math.round(H * devicePixelRatio), g = cv.getContext('2d');
    const dur = soundDur(c); g.fillStyle = T.muted ? '#556' : '#7fc49c';
    for (let x = 0; x < W; x++) {
      const at = x / W * c.len, v = (pk[Math.floor((c.in + at) / dur * pk.length)] || 0) * clipGain(c, at), h = Math.max(1, v * Hh * .9);
      g.fillRect(x, (Hh - h) / 2, 1, h);
    }
  };
  const layout = () => {
    const w = Math.max(4, c.len * pps()), fi = c.fadeIn * pps(), fo = c.fadeOut * pps();
    el.style.left = t2x(c.start) + 'px'; el.style.width = w + 'px';
    dl.style.left = Math.min(w, fi) + 'px'; dr.style.left = Math.max(0, w - fo) + 'px';   // centred on the fade line's top end
    dl.classList.toggle('on', c.fadeIn > 0); dr.classList.toggle('on', c.fadeOut > 0);
    dl.title = c.fadeIn > 0 ? `Fade in ${c.fadeIn.toFixed(2)}s · drag, or double-click to remove` : 'Fade in: drag right';
    dr.title = c.fadeOut > 0 ? `Fade out ${c.fadeOut.toFixed(2)}s · drag, or double-click to remove` : 'Fade out: drag left';
    svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
    path.setAttribute('d', (c.fadeIn > 0 ? `M0 ${H} L${fi} 0 ` : '') + (c.fadeOut > 0 ? `M${w - fo} 0 L${w} ${H}` : ''));
  };
  layout();
  if (SND[c.sound]) peaksFor(SND[c.sound]).then(p => { pk = p; draw(); }).catch(() => {});
  const pick = () => { selClip = c.id; sel = null; selKey = null; document.querySelectorAll('#tlc .clip.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); };
  let st = null;
  const begin = () => { st = { start: c.start, in: c.in, len: c.len, fi: c.fadeIn, fo: c.fadeOut }; pick(); };
  for (const h of el.querySelectorAll('.th, .fdot')) h.addEventListener('pointerdown', begin);
  el.addEventListener('pointerdown', e => { if (!e.target.closest('.th, .fdot')) begin(); });
  const done = msg => moved => { if (moved) { syncAudio(true); refresh(); if (msg) status(msg()); } else refresh(); };
  // move: snap the start, and drop onto whichever audio track row the pointer is over
  let target = T;
  dragOn(el, (ev, dx) => {
    c.start = Math.max(0, snapT(x2t(t2x(st.start) + dx), ev, c)); layout();
    const r = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.trow.audio');
    document.querySelectorAll('#tlc .trow.audio.dropt').forEach(x => x.classList.remove('dropt'));
    target = (r && tracks().find(x => x.id === r.dataset.track)) || T;
    if (target !== T) r.classList.add('dropt');
  }, moved => {
    document.querySelectorAll('#tlc .trow.audio.dropt').forEach(x => x.classList.remove('dropt'));
    if (moved && target !== T) { T.clips = T.clips.filter(x => x !== c); target.clips.push(c); }
    done(() => `Moved to ${fmtTime(c.start)}${target !== T ? ' on ' + target.name : ''}`)(moved);
  });
  // trim: the left edge moves the start and the in-point together; the right edge sets the length (up to the source's end)
  dragOn(el.querySelector('.th.l'), (ev, dx) => {
    let d = snapT(x2t(t2x(st.start) + dx), ev, c) - st.start;
    d = Math.max(-st.in, -st.start, Math.min(st.len - 1 / FPS, d));
    c.start = st.start + d; c.in = st.in + d; c.len = st.len - d; clampFades(c); layout(); draw();
  }, done(() => `Clip starts at ${fmtTime(c.start)}`));
  dragOn(el.querySelector('.th.r'), (ev, dx) => {
    const end = snapT(x2t(t2x(st.start + st.len) + dx), ev, c);
    c.len = Math.max(1 / FPS, Math.min(soundDur(c) - c.in, end - c.start)); clampFades(c); layout(); draw();
  }, done(() => `Clip ends at ${fmtTime(c.start + c.len)}`));
  // fades: drag the dots; within 3 px of the corner counts as no fade
  const fadeDrag = (key, sign) => (ev, dx) => {
    let f = (key === 'fadeIn' ? st.fi : st.fo) + sign * dx / pps();
    // snap the dot's position on the timeline (playhead, markers, other clips' edges), then turn it back into a length
    const end = c.start + c.len, at = snapT(key === 'fadeIn' ? c.start + f : end - f, ev, c);
    f = key === 'fadeIn' ? at - c.start : end - at;
    f = Math.max(0, Math.min(c.len - (key === 'fadeIn' ? c.fadeOut : c.fadeIn), f));
    c[key] = f * pps() < 3 ? 0 : +f.toFixed(3); layout(); draw();
  };
  const fadeMsg = () => `Fade in ${c.fadeIn ? c.fadeIn.toFixed(2) + 's' : 'off'} · fade out ${c.fadeOut ? c.fadeOut.toFixed(2) + 's' : 'off'}`;
  dragOn(dl, fadeDrag('fadeIn', 1), done(fadeMsg));
  dragOn(dr, fadeDrag('fadeOut', -1), done(fadeMsg));
  for (const [d, key] of [[dl, 'fadeIn'], [dr, 'fadeOut']])
    d.addEventListener('dblclick', e => { e.stopPropagation(); c[key] = 0; syncAudio(); refresh(); status(fadeMsg()); });
  return el;
}

// ---------- fullscreen preview ----------
// the composition alone on black, scaled to fit the screen. Space plays, arrows step (Shift: a second), Home and End
// jump, click the bar to scrub, Esc or F leaves.
function fullscreenView() {
  if ($('#fsview')) return;
  const wrap = document.createElement('div'); wrap.id = 'fsview';
  wrap.innerHTML = `<canvas></canvas><div class="fsbar"><button class="ib fsplay"></button><span class="fstc"></span>
    <div class="fsprog"><i></i></div><button class="ib fsclose" title="Exit fullscreen  Esc">${ICON.expand}</button></div>`;
  document.body.appendChild(wrap);
  const c = wrap.querySelector('canvas'), g = c.getContext('2d'), bar = wrap.querySelector('.fsbar'), prog = wrap.querySelector('.fsprog');
  let raf = 0, idle = 0, open = true;
  const close = () => { if (!open) return; open = false; cancelAnimationFrame(raf); clearTimeout(idle); wrap.remove();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); refresh(true, false); };
  const frameLoop = () => {
    if (!open) return;
    const W = wrap.clientWidth, H = wrap.clientHeight, k = Math.min(W / S.w, H / S.h), dpr = devicePixelRatio || 1;
    const cw = Math.round(S.w * k * dpr), ch = Math.round(S.h * k * dpr);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; c.style.width = S.w * k + 'px'; c.style.height = S.h * k + 'px'; }
    renderScene(g, time, k * dpr);
    wrap.querySelector('.fsplay').innerHTML = playing ? ICON.pause : ICON.play;
    wrap.querySelector('.fstc').textContent = `${fmtTime(time)} / ${fmtTime(S.dur)}`;
    prog.firstElementChild.style.width = (time / S.dur * 100) + '%';
    raf = requestAnimationFrame(frameLoop);
  };
  // the controls fade out when the mouse rests
  const wake = () => { wrap.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => wrap.classList.add('idle'), 1800); };
  wrap.addEventListener('pointermove', wake);
  wrap.querySelector('.fsplay').onclick = e => { e.stopPropagation(); togglePlay(); };
  wrap.querySelector('.fsclose').onclick = e => { e.stopPropagation(); close(); };
  c.addEventListener('click', () => togglePlay());
  prog.addEventListener('pointerdown', e => {
    e.stopPropagation(); if (playing) togglePlay();
    const mv = ev => { const r = prog.getBoundingClientRect(); time = frame(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * S.dur); syncAudio(); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    mv(e); addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  // Its own keys, and none of the editor's: F would hide the panels behind it, and arrows would nudge a layer.
  const key = e => { if (!open) return removeEventListener('keydown', key, true);
    if (e.metaKey || e.ctrlKey) return;                       // the browser's own shortcuts
    e.stopImmediatePropagation();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, step = e.shiftKey ? 1 : 1 / FPS;
    const go = t => { if (playing) togglePlay(); time = frame(Math.max(0, Math.min(S.dur, t))); syncAudio(); };
    if (k === 'Escape' || k === 'f') close();
    else if (k === ' ') togglePlay();
    else if (k === 'ArrowLeft') go(time - step);
    else if (k === 'ArrowRight') go(time + step);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(S.dur);
    else return;
    e.preventDefault(); wake(); };
  addEventListener('keydown', key, true);
  document.addEventListener('fullscreenchange', function fc() { if (!document.fullscreenElement) { document.removeEventListener('fullscreenchange', fc); close(); } });
  wrap.requestFullscreen?.().catch(() => {});          // if the browser refuses, it still fills the window
  wake(); frameLoop();
}
$('#fullscreen').onclick = () => fullscreenView();

// ---------- artboard ----------
// Size presets, grouped. Changing size re-lays out the content: "Fit" scales it uniformly to fit the new frame
// and centres it (default), "Keep" leaves sizes alone and only re-centres. Keyframed positions move with it.
const SIZES = [
  ['Social', 'Instagram post', 1080, 1080], ['Social', 'Instagram portrait', 1080, 1350], ['Social', 'Story / Reel', 1080, 1920],
  ['Social', 'TikTok', 1080, 1920], ['Social', 'YouTube Shorts', 1080, 1920], ['Social', 'X / Twitter post', 1600, 900],
  ['Social', 'LinkedIn post', 1200, 1200], ['Social', 'Facebook cover', 1640, 624], ['Social', 'YouTube thumbnail', 1280, 720],
  ['Video', '720p HD', 1280, 720], ['Video', '1080p Full HD', 1920, 1080], ['Video', '1440p QHD', 2560, 1440],
  ['Video', '4K UHD', 3840, 2160], ['Video', 'Vertical 1080p', 1080, 1920], ['Video', 'Cinema 2.39:1', 2048, 858],
  ['Web', 'Banner 3:1', 1500, 500], ['Web', 'Leaderboard ad', 728, 90], ['Web', 'Open Graph image', 1200, 630],
  ['Web', 'Presentation 16:9', 1920, 1080], ['Web', 'Presentation 4:3', 1600, 1200],
  ['Other', 'Square', 1080, 1080], ['Other', 'Portrait 4:5', 1080, 1350], ['Other', 'Landscape 16:9', 1920, 1080],
];
let resizeMode = 'fit';
function resizeComp(w, h, mode = resizeMode) {
  w = Math.max(16, Math.min(8192, Math.round(w))); h = Math.max(16, Math.min(8192, Math.round(h)));
  if (w === S.w && h === S.h) return;
  const k = mode === 'fit' ? Math.min(w / S.w, h / S.h) : 1, ox = S.w / 2, oy = S.h / 2;
  const X = v => (v - ox) * k + w / 2, Y = v => (v - oy) * k + h / 2, Z = v => v * k;
  const map = { x: X, y: Y, ...(k !== 1 ? { w: Z, h: Z, size: Z, strokeWidth: Z, radius: Z, blur: Z, shadow: Z, spacing: Z } : {}) };
  for (const L of S.layers) for (const [p, f] of Object.entries(map)) {
    if (typeof L.p[p] === 'number') L.p[p] = Math.round(f(L.p[p]) * 100) / 100;
    for (const key of L.keys[p] || []) if (typeof key.v === 'number') key.v = Math.round(f(key.v) * 100) / 100;
  }
  S.w = w; S.h = h; refresh(); status(`Canvas ${w}×${h}${k !== 1 ? ` · content scaled ${Math.round(k * 100)}%` : ''}`);
}
function renderBoard() {
  $('#aw').value = S.w; $('#ah').value = S.h; $('#adur').value = +S.dur.toFixed(2); $('#outtc').textContent = fmtTime(S.dur);
  $('#abg').innerHTML = `<i style="background:${S.bg}"></i><span>${S.bg.toUpperCase()}</span>`;
  const m = SIZES.find(s => s[2] == S.w && s[3] == S.h);
  $('#asize').innerHTML = `<span>${m ? m[1] : `Custom ${ratio(S.w, S.h)}`}</span>${ICON.chev}`;
  $('#aresize').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === resizeMode));
}
const ratio = (w, h) => { const g = (a, b) => b ? g(b, a % b) : a, d = g(w, h), a = w / d, b = h / d; return a <= 32 && b <= 32 ? `${a}:${b}` : (w / h).toFixed(2) + ':1'; };
const board = (k, v) => { S[k] = v; time = Math.min(time, S.dur); refresh(); };
$('#aw').onchange = e => resizeComp(+e.target.value || S.w, S.h, 'keep');
$('#ah').onchange = e => resizeComp(S.w, +e.target.value || S.h, 'keep');
$('#adur').onchange = e => setDuration(+e.target.value || S.dur);
$('#abg').onclick = e => UI.color(e.currentTarget, S.bg, c => { S.bg = c; render(); renderBoard(); });
$('#asize').onclick = e => UI.menu(e.currentTarget,
  [...SIZES.map(([g, l, w, h]) => ({ group: g, value: l, label: l, hint: `${w}×${h}` })),
   { group: 'Custom', value: '__custom', label: 'Custom size…', hint: 'W × H' }],
  SIZES.find(s => s[2] == S.w && s[3] == S.h)?.[1],
  async v => {
    if (v !== '__custom') { const [, , w, h] = SIZES.find(s => s[1] === v); return resizeComp(w, h); }
    const r = await UI.prompt('Canvas size (width × height)', `${S.w} × ${S.h}`, 'Resize'); if (!r) return;
    const m = r.match(/(\d+)\s*[x×*, ]\s*(\d+)/i); if (!m) return status('Type a size like 1920 × 1080');
    resizeComp(+m[1], +m[2]);
  });
$('#aswap').onclick = () => resizeComp(S.h, S.w);
$('#aresize').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; resizeMode = b.dataset.v; renderBoard();
  status(resizeMode === 'fit' ? 'Resizing scales the content to fit the new frame' : 'Resizing keeps content at its size and re-centres it'); };
UI.scrub($('#board'), i => i.dispatchEvent(new Event('change')));
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => newLayer(b.dataset.add));
$('#help').onclick = e => UI.menu(e.currentTarget, [{ value: 'tutorial', label: 'Tutorial', hint: 'F1' }, { value: 'keys', label: 'Keyboard shortcuts', hint: '?' },
  { value: 'palette', label: 'Search commands', hint: isMac ? '⌘P' : 'Ctrl P' }], null, v => v === 'tutorial' ? Tutorial.resume() : v === 'keys' ? cheatSheet() : palette());
// 3D: the solid shapes, a model from a file, and the camera that films them
$('#add3d').onclick = e => UI.menu(e.currentTarget, [...R3D.SHAPES.map(([value, label]) => ({ value, label, group: 'Shapes' })),
  { value: 'model', label: 'Import a model…', hint: '.glb .gltf .obj', group: 'Model' }, { value: 'camera', label: 'Camera', group: 'Camera' }], null,
  v => v === 'model' ? modelInput.click() : v === 'camera' ? addCamera() : add3d(v),
  it => it.value === 'camera' ? ICON.camera : it.value === 'model' ? ICON.model : ICON.cube);

function refresh(full = true, record = true) {
  render(); placeHead();
  if (full) { renderLayers(); renderAssets(); renderProps(); renderTracks(); renderBoard(); if (record) commit(); }
}

// ---------- files: Save / Save As / Open, like a desktop app ----------
// Uses the File System Access API (the browser's own save/open dialogs) where available,
// and falls back to a download / file input elsewhere (Safari, Firefox).
let projectName = 'Untitled', fileHandle = null;
const FS = 'showSaveFilePicker' in window;
// .rip is the project file; .wob files from before the rename still open
const FILE_TYPES = [{ description: 'Riptide project', accept: { 'application/x-riptide+json': ['.rip', '.wob'] } }];
// video files live outside the project state (so undo stays fast) and are embedded only when saving
async function serialize() {
  const P = JSON.parse(JSON.stringify(S));
  for (const [id, a] of Object.entries(P.assets || {})) if (a.kind === 'video' && VBLOB[id]) a.src = await readURL(VBLOB[id]);
  // embed the sounds that clips still use, drop the rest
  const used = new Set((P.audioTracks || []).flatMap(T => T.clips.map(c => c.sound)));
  for (const sid of Object.keys(P.sounds || {})) if (used.has(sid) && SND[sid]) P.sounds[sid].src = SND[sid]; else delete P.sounds[sid];
  return JSON.stringify({ format: 'riptide', version: 3, project: P });
}
function setDirty(d) { dirty = d; $('#docname').textContent = projectName + '.rip'; $('#docstate').textContent = d ? 'Edited' : fileHandle ? 'Saved' : ''; document.title = (d ? '• ' : '') + projectName + ' · Riptide'; }
async function save(as = false) {
  try {
    if (FS) {
      if (as || !fileHandle) fileHandle = await showSaveFilePicker({ suggestedName: projectName + '.rip', types: FILE_TYPES });
      const w = await fileHandle.createWritable(); await w.write(await serialize()); await w.close();
      projectName = fileHandle.name.replace(/\.(rip|wob)$/i, '');
    } else {
      const n = await UI.prompt('Save project as', projectName, 'Download'); if (!n) return;
      projectName = n.replace(/\.(rip|wob)$/i, '');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([await serialize()], { type: 'application/x-riptide+json' })), download: projectName + '.rip' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    setDirty(false); status('Saved ' + projectName + '.rip');
  } catch (e) { if (e.name !== 'AbortError') UI.alert('Could not save', e.message); }
}
function loadText(text, name, handle = null) {
  const d = JSON.parse(text), p = d.format === 'riptide' || d.format === 'wobble' ? d.project : d;
  if (!p || !Array.isArray(p.layers) || !(p.w > 0) || !(p.h > 0)) throw new Error('This file is not a Riptide project.');
  p.layers.forEach(L => { L.p = { ...DEFAULTS, ...L.p }; L.keys ||= {}; }); p.assets ||= {}; p.markers ||= [];
  for (const [id, a] of Object.entries(p.assets)) if (a.kind === 'video' && a.src) {
    const src = a.src; delete a.src;
    fetch(src).then(r => r.blob()).then(b => { VBLOB[id] = b; VURL[id] = URL.createObjectURL(b); assetSig = ''; refresh(true, false); });
  }
  adoptAudio(p); selClip = null;
  S = { dur: 5, bg: '#0b1026', ...p }; projectName = name.replace(/\.(rip|wob)$/i, ''); fileHandle = handle;
  uid = Math.max(0, ...S.layers.map(l => l.id)) + 1; sel = null; selKey = null; time = 0;
  refresh(true, false); resetHistory(); setDirty(false); setMode(S.mode || 'video'); status('Opened ' + name);
}
async function confirmDiscard() { return !dirty || await UI.dialog({ title: 'Discard unsaved changes?', body: `${projectName}.rip has changes that are not saved.`, ok: 'Discard' }); }
const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.rip,.wob,application/json' });
picker.onchange = async () => { const f = picker.files[0]; picker.value = ''; if (!f) return;
  try { loadText(await f.text(), f.name); } catch (e) { UI.alert('Could not open ' + f.name, e.message); } };
async function openFile() {
  if (!await confirmDiscard()) return;
  if (!('showOpenFilePicker' in window)) return picker.click();
  try { const [h] = await showOpenFilePicker({ types: FILE_TYPES }); const f = await h.getFile(); loadText(await f.text(), f.name, h); }
  catch (e) { if (e.name !== 'AbortError') UI.alert('Could not open file', e.message); }
}
async function newFile() {
  if (!await confirmDiscard()) return;
  S = { w: 1080, h: 1080, bg: '#ffffff', dur: 5, layers: [], assets: {}, sounds: {}, audioTracks: [] }; selClip = null; projectName = 'Untitled'; fileHandle = null;
  sel = null; selKey = null; time = 0; refresh(true, false); resetHistory(); setDirty(false);
}
$('#new').onclick = newFile; $('#open').onclick = openFile; $('#save').onclick = () => save(false);
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
// drop files anywhere: images, video and audio are imported (placed where you drop them on the viewer), a .rip (or old .wob) opens.
// Images dragged straight from another web page arrive as a URL and are fetched.
const isMedia = f => /^(image|audio|video)\//.test(f.type) || !!R3D.modelFormat(f.name);
const dragKinds = e => [...e.dataTransfer.types];
addEventListener('dragover', e => { const t = dragKinds(e); if (t.includes('Files') || t.includes('text/uri-list')) { e.preventDefault(); document.body.classList.add('dropping'); } });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
async function filesFromURL(dt) {
  const html = dt.getData('text/html'), m = html && html.match(/<img[^>]+src="([^"]+)"/i);
  const url = m?.[1] || dt.getData('text/uri-list').split('\n').find(l => l && !l.startsWith('#'));
  if (!url) return [];
  try { const r = await fetch(url); if (!r.ok) throw 0; const b = await r.blob();
    const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'image') || 'image';
    return [new File([b], name, { type: b.type })];
  } catch { status('That site does not allow its image to be copied. Save it first, then drop the file.'); return []; }
}
async function importAt(files, e) {
  const ids = await addAssets(files.filter(isMedia)); const [px, py] = e?.target === cv ? toCanvas(e) : [];
  ids.forEach((id, i) => addImageLayer(id, px != null ? px + i * 30 : undefined, py != null ? py + i * 30 : undefined));
}
addEventListener('drop', async e => {
  if (e.defaultPrevented) return; e.preventDefault(); document.body.classList.remove('dropping');
  let files = [...e.dataTransfer.files];
  if (!files.length) files = await filesFromURL(e.dataTransfer);
  if (!files.length) return;
  if (files.some(isMedia)) return importAt(files, e);
  const f = files[0]; if (!await confirmDiscard()) return;
  try { loadText(await f.text(), f.name); } catch (err) { UI.alert('Could not open ' + f.name, err.message); }
});
// paste images or video from the clipboard (⌘V with a copied image)
addEventListener('paste', e => {
  if (e.target.matches?.('input,textarea')) return;
  const files = [...(e.clipboardData?.files || [])].filter(isMedia);
  if (files.length) { e.preventDefault(); importAt(files); }
});

// ---------- export ----------
// Frames are rendered here at the chosen size and frame rate, then the server encodes them with ffmpeg
// (MP4/H.264, WebM/VP9, GIF with a generated palette) or zips them (PNG sequence, no ffmpeg needed).
async function api(path, opts) { const r = await fetch(path, opts); if (!r.ok) throw new Error((await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); return r; }
let exportOpts = { format: 'mp4', fps: 30, res: 1080, quality: 'high', range: 'all', audio: true };
// resolution presets set the short side of the frame (1080p = 1920×1080 landscape, 1080×1920 portrait, 1080×1080 square)
const RES = [[0, 'Original'], [480, '480p'], [720, '720p'], [1080, '1080p'], [1440, '1440p'], [2160, '4K'], [4320, '8K']];
const resScale = res => res ? res / Math.min(S.w, S.h) : 1;
function exportDialog() {
  return new Promise(res => {
    const o = { ...exportOpts }, mk = (S.markers || []).slice().sort((a, b) => a.t - b.t);
    const still = () => S.mode === 'image' || o.format === 'still';
    const fields = () => [S.mode === 'image' ? null : ['format', 'Format', [['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF'], ['png', 'PNG seq.'], ['still', 'Still']]],
      still() ? ['img', 'Image type', [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']]] : null,
      still() && o.img !== 'png' ? ['q', 'Quality', [[.7, 'Low'], [.85, 'Medium'], [.95, 'High'], [1, 'Max']]] : null,
      still() ? null : ['fps', 'Frame rate', [[24, '24'], [25, '25'], [30, '30'], [60, '60']]],
      ['res', 'Resolution', RES],
      still() || o.format === 'gif' || o.format === 'png' ? null : ['quality', 'Quality', [['draft', 'Draft'], ['standard', 'Standard'], ['high', 'High'], ['max', 'Maximum']]],
      still() ? null : ['range', 'Range', [['all', 'Whole timeline'], ['markers', 'Between markers']]]].filter(Boolean);
    o.img ||= 'png'; o.q ||= .9;
    const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    const draw = () => {
      o.scale = resScale(o.res);
      const s = Math.round(S.w * o.scale / 2) * 2 + '×' + Math.round(S.h * o.scale / 2) * 2;
      const big = Math.round(S.w * o.scale) * Math.round(S.h * o.scale) > 9e6;
      const [a, b] = o.range === 'markers' && mk.length >= 2 ? [mk[0].t, mk.at(-1).t] : [0, S.dur];
      const canAudio = !still() && hasAudio() && (o.format === 'mp4' || o.format === 'webm'), nt = tracks().filter(T => T.clips.length).length;
      wrap.innerHTML = `<div class="modal"><h3>${still() ? 'Export image' : 'Export'}</h3><div class="form">${fields().map(([k, l, opts]) => `<div class="ff"><label>${l}</label><div class="seg">${opts.map(([v, t]) =>
        `<button data-k="${k}" data-v="${v}" class="${o[k] == v ? 'on' : ''}" ${k === 'range' && v === 'markers' && mk.length < 2 ? 'disabled title="Add two markers first"' : ''}>${t}</button>`).join('')}</div></div>`).join('')}
        ${still() ? '' : `<div class="ff"><label>Audio</label><button class="check ${canAudio && o.audio ? 'on' : ''}" data-audio ${canAudio ? '' : 'disabled'}><i></i>${hasAudio() ? `Include audio (${nt} track${nt > 1 ? 's' : ''})` : 'No audio'}</button></div>`}</div>
        <p class="formnote">${still() ? `${s} px · frame at ${fmtTime(time)}` : `${s} px · ${fmtTime(a)} to ${fmtTime(b)} · ${Math.round((b - a) * o.fps)} frames${o.format === 'png' ? ' · zipped' : ''}`}${big ? '<br>Large frames: rendering and uploading will take a while.' : ''}</p>
        <div class="mbtns"><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Export</button></div></div>`;
    };
    draw(); document.body.appendChild(wrap);
    const close = v => { wrap.remove(); res(v); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('button'); if (e.target === wrap) return close(null); if (!b) return;
      if (b.dataset.k) { const v = b.dataset.v; o[b.dataset.k] = isNaN(+v) ? v : +v; draw(); }
      else if (b.dataset.audio !== undefined) { o.audio = !o.audio; draw(); }
      else if (b.dataset.c !== undefined) close(null);
      else if (b.dataset.ok !== undefined) { exportOpts = o; close({ ...o, still: still(), start: o.range === 'markers' && mk.length >= 2 ? mk[0].t : 0, end: o.range === 'markers' && mk.length >= 2 ? mk.at(-1).t : S.dur }); }
    });
    const key = e => { if (!document.body.contains(wrap)) return removeEventListener('keydown', key, true);
      if (e.key === 'Escape') { e.stopPropagation(); close(null); } if (e.key === 'Enter') { e.stopPropagation(); wrap.querySelector('[data-ok]').click(); } };
    addEventListener('keydown', key, true);
  });
}
$('#export').onclick = async () => {
  if (playing) togglePlay();
  const o = await exportDialog(); if (!o) return;
  if (o.still) return exportStill(o);
  const btn = $('#export'), lab = btn.querySelector('span'), keep = time, sel0 = sel;
  const W = Math.round(S.w * o.scale / 2) * 2, H = Math.round(S.h * o.scale / 2) * 2;
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H; const octx = oc.getContext('2d');
  const frames = Math.max(1, Math.round((o.end - o.start) * o.fps)), ext = { mp4: 'mp4', webm: 'webm', gif: 'gif', png: 'zip' }[o.format];
  btn.disabled = true; btn.classList.add('busy'); sel = null;
  try {
    const { id } = await (await api('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fps: o.fps, format: o.format, quality: o.quality }) })).json();
    for (let f = 0; f < frames; f++) {
      time = o.start + f / o.fps; await seekVideos(time); renderScene(octx, time, W / S.w);
      const blob = await new Promise(r => oc.toBlob(r, 'image/png'));
      await api(`/api/export/${id}/frame/${f}`, { method: 'POST', body: blob });
      const p = (f + 1) / frames; btn.style.setProperty('--p', p * 100 + '%'); lab.textContent = `Rendering ${Math.round(p * 100)}%`;
      if (f % 10 === 0) { render(); placeHead(); }
    }
    if (o.audio && hasAudio() && (o.format === 'mp4' || o.format === 'webm')) {
      lab.textContent = 'Mixing audio…';
      const wav = await mixAudio(o.start, o.end);               // every track, fades and volumes, mixed in the browser
      if (wav) await api(`/api/export/${id}/audio?offset=0&volume=1`, { method: 'POST', body: wav });
    }
    lab.textContent = o.format === 'png' ? 'Packing…' : 'Encoding…';
    const out = await (await api(`/api/export/${id}/finish?duration=${o.end - o.start}`, { method: 'POST' })).blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(out), download: `${projectName}.${ext}` }); a.click();
    status(`Exported ${projectName}.${ext} · ${W}×${H} · ${o.fps} fps · ${(out.size / 1e6).toFixed(1)} MB`);
  } catch (e) { UI.alert('Export failed', e.message); }
  btn.disabled = false; btn.classList.remove('busy'); btn.style.removeProperty('--p'); lab.textContent = 'Export…'; time = keep; sel = sel0; refresh(true, false);
};

// still image export happens entirely in the browser (no server, no ffmpeg)
async function exportStill(o) {
  const W = Math.max(1, Math.round(S.w * o.scale)), H = Math.max(1, Math.round(S.h * o.scale));
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
  await seekVideos(time); renderScene(oc.getContext('2d'), time, W / S.w);
  const blob = await new Promise(r => oc.toBlob(r, 'image/' + o.img, o.q));
  if (!blob) return UI.alert('Export failed', `This browser cannot encode ${o.img.toUpperCase()}.`);
  const ext = o.img === 'jpeg' ? 'jpg' : o.img;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${projectName}.${ext}` }); a.click();
  status(`Exported ${projectName}.${ext} · ${W}×${H} · ${(blob.size / 1e3).toFixed(0)} KB`);
}

// ---------- clipboard ----------
let clip = null;
function copyLayer() { const L = cur(); if (!L) return; clip = JSON.stringify(L); status(`Copied ${L.name}`); }
function pasteLayer() {
  if (!clip) return; const c = JSON.parse(clip); c.id = uid++; c.name += ' copy';
  const i = S.layers.findIndex(l => l.id === sel); S.layers.splice(i < 0 ? S.layers.length : i + 1, 0, c); sel = c.id; refresh(); status(`Pasted ${c.name}`);
}

// ---------- keyboard ----------
// One table drives the shortcuts, the cheat sheet (?) and the command palette (⌘P), so they never disagree.
// keys: 'mod' is ⌘ on Mac / Ctrl elsewhere; several bindings per command are separated by '|'.
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
function nudge(dx, dy) { for (const L of selLayers()) { if (L.locked) continue; const o = state(L, time);
  if (dx) setProp(L, 'x', o.x + dx); if (dy) setProp(L, 'y', o.y + dy); } refresh(); }
// Align: one layer lines up with the canvas; several line up with each other (their combined box), or with the canvas
// when `toCanvas`. Centre moves the selection as a whole, keeping the layers' spacing. Distribute evens out the gaps.
const ALIGN_NAMES = { left: 'left', right: 'right', top: 'top', bottom: 'bottom', hcenter: 'centre horizontally', vcenter: 'centre vertically' };
function alignLayer(how, toCanvas = false) {
  const ls = selLayers().filter(L => !L.locked && !L.fix?.pos); if (!ls.length) return status(selLayers().length ? 'Its position is locked' : 'Select a layer first');
  const u = ls.length > 1 && !toCanvas ? unionBox(ls) : { x: S.w / 2, y: S.h / 2, ex: S.w / 2, ey: S.h / 2 };
  for (const L of ls) {
    const b = box(L, time), o = state(L, time);
    const to = { left: ['x', u.x - u.ex + b.ex], right: ['x', u.x + u.ex - b.ex], hcenter: ['x', u.x], top: ['y', u.y - u.ey + b.ey], bottom: ['y', u.y + u.ey - b.ey], vcenter: ['y', u.y] }[how];
    setProp(L, to[0], Math.round(o[to[0]] + to[1] - b[to[0]]));
  }
  refresh(); status(`${ls.length > 1 ? ls.length + ' layers' : ls[0].name}: ${ALIGN_NAMES[how]}${ls.length > 1 && !toCanvas ? '' : ' on the canvas'}`);
}
function centerOnCanvas(axes = 'xy') {
  const ls = selLayers().filter(L => !L.locked && !L.fix?.pos); if (!ls.length) return status(selLayers().length ? 'Its position is locked' : 'Select a layer first');
  const u = unionBox(ls), dx = axes.includes('x') ? S.w / 2 - u.x : 0, dy = axes.includes('y') ? S.h / 2 - u.y : 0;
  for (const L of ls) { const o = state(L, time); if (dx) setProp(L, 'x', Math.round(o.x + dx)); if (dy) setProp(L, 'y', Math.round(o.y + dy)); }
  refresh(); status(`Centred ${ls.length > 1 ? ls.length + ' layers' : ls[0].name} ${axes === 'xy' ? 'on the canvas' : axes === 'x' ? 'horizontally' : 'vertically'}`);
}
function distribute(axis) {
  const ls = selLayers().filter(L => !L.locked && !L.fix?.pos); if (ls.length < 3) return status('Select three or more layers whose position is not locked');
  const e = axis === 'x' ? 'ex' : 'ey', items = ls.map(L => ({ L, b: box(L, time) })).sort((p, q) => p.b[axis] - q.b[axis]);
  const first = items[0].b, last = items.at(-1).b, span = (last[axis] + last[e]) - (first[axis] - first[e]);
  const gap = (span - items.reduce((s, i) => s + 2 * i.b[e], 0)) / (items.length - 1);
  let edge = first[axis] - first[e];
  for (const { L, b } of items) { const c = edge + b[e]; setProp(L, axis, Math.round(state(L, time)[axis] + c - b[axis])); edge += 2 * b[e] + gap; }
  refresh(); status(`Distributed ${ls.length} layers ${axis === 'x' ? 'horizontally' : 'vertically'}`);
}
const selectAll = () => { setSelection(S.layers.filter(L => visibleAt(L, time) && !L.locked).map(L => L.id)); refresh(true, false);
  const n = selLayers().length; status(n ? `${n} layer${n > 1 ? 's' : ''} selected` : 'Nothing to select'); };
function selectNeighbour(d) {
  if (!S.layers.length) return; const order = [...S.layers].reverse(), i = order.findIndex(l => l.id === sel);
  sel = order[(i + d + order.length) % order.length].id; selKey = null; refresh(true, false);
}
function jumpKey(d) {
  const L = cur(), ts = L ? keyTimes(L) : [...new Set(S.layers.flatMap(keyTimes))].sort((a, b) => a - b);
  const t = d > 0 ? ts.find(x => x > time + 1e-4) : ts.filter(x => x < time - 1e-4).at(-1);
  if (t == null) return status(d > 0 ? 'No later keyframe' : 'No earlier keyframe'); if (playing) togglePlay(); seek(t);
}
function jumpMarker(d) {
  const ms = (S.markers || []).map(m => m.t), t = d > 0 ? ms.find(x => x > time + 1e-4) : ms.filter(x => x < time - 1e-4).at(-1);
  if (t == null) return status('No marker that way'); if (playing) togglePlay(); seek(t);
}
const EASE_CYCLE = ['linear', 'easeInOut', 'easeOut', 'easeIn', 'expoOut', 'expoInOut', 'backOut', 'elastic', 'bounce', 'step'];
function cycleEase(d) {
  const L = cur(); if (!L || !selKey) return status('Select a keyframe first');
  const ks = selKey.prop ? (L.keys[selKey.prop] || []).filter(k => near(k.t, selKey.t)) : keysAt(L, selKey.t); if (!ks.length) return;
  const avail = EASE_CYCLE.filter(e => EASE_ITEMS.some(i => i.value === e)), i = avail.indexOf(ks[0].ease || 'easeInOut');
  const next = avail[(i + d + avail.length) % avail.length]; ks.forEach(k => k.ease = next); refresh(); status('Easing: ' + easeName(next));
}
function removeKeysHere() { const L = cur(); if (!L) return; let n = 0;
  for (const p of Object.keys(L.keys)) { const before = L.keys[p].length; L.keys[p] = L.keys[p].filter(k => !near(k.t, time)); n += before - L.keys[p].length;
    if (!L.keys[p].length) { delete L.keys[p]; } }
  refresh(); status(n ? `Removed ${n} keyframes at ${fmtTime(time)}` : 'No keyframes here'); }
function slideLayer(edge) { const L = cur(); if (!L) return; const d = (edge === 'in' ? time - lin(L) : time - lout(L));
  if (L.in != null || d) L.in = Math.max(0, lin(L) + d); if (L.out != null) L.out = lout(L) + d;
  for (const ks of Object.values(L.keys)) ks.forEach(k => k.t = Math.max(0, k.t + d)); refresh(); status(`Moved ${L.name} ${d >= 0 ? '+' : ''}${d.toFixed(2)}s`); }
function setOpacity(v) { const L = cur(); if (!L) return; setProp(L, 'opacity', v); refresh(); status(`Opacity ${Math.round(v * 100)}%`); }
function focusMode() { document.body.classList.toggle('focus'); requestAnimationFrame(() => { renderTracks(); render(); });
  status(document.body.classList.contains('focus') ? 'Focus mode: panels hidden (F to bring them back)' : 'Panels shown'); }
const withL = fn => () => { const L = cur(); if (!L) return status('Select a layer first'); fn(L); };

const COMMANDS = [
  // File
  ['File', 'Save', 'mod+s', () => save(false)],
  ['File', 'Save as…', 'mod+shift+s', () => save(true)],
  ['File', 'Open…', 'mod+o', () => openFile()],
  ['File', 'Import media…', 'mod+i', () => assetInput.click()],
  ['File', 'Export…', 'mod+e', () => $('#export').click()],
  ['File', 'Save current frame as PNG', 'mod+shift+e', () => exportStill({ img: 'png', q: 1, scale: 1 })],
  // Edit
  ['Edit', 'Undo', 'mod+z', () => undoRedo(-1)],
  ['Edit', 'Redo', 'mod+shift+z|mod+y', () => undoRedo(1)],
  ['Edit', 'Copy layer', 'mod+c', () => copyLayer()],
  ['Edit', 'Cut layer', 'mod+x', () => { copyLayer(); removeLayer(); }],
  ['Edit', 'Paste layer', 'mod+v', () => pasteLayer()],
  ['Edit', 'Duplicate layer', 'mod+d', () => duplicate()],
  ['Edit', 'Delete layer, keyframe or audio clip', 'delete|backspace', () => { if (selKey) $('#delKey').click(); else if (selClip && !cur()) deleteClip(); else removeLayer(); }],
  ['Edit', 'Rename layer', 'f2', withL(renameLayer)],
  ['Edit', 'Edit text', 'enter', withL(L => L.type === 'text' ? editText(L) : null)],
  ['Edit', 'Select all layers', 'mod+a', () => selectAll()],
  ['Edit', 'Deselect', 'escape', () => { setSelection([]); selClip = null; refresh(); }],
  // Add
  ['Add', 'Rectangle', 'r', () => newLayer('rect')],
  ['Add', 'Ellipse', 'o', () => newLayer('ellipse')],
  ['Add', 'Polygon', 'p', () => newLayer('polygon')],
  ['Add', 'Star', 's', () => newLayer('star')],
  ['Add', 'Arc', 'a', () => newLayer('arc')],
  ['Add', 'Wave', 'w', () => newLayer('wave')],
  ['Add', 'Text', 't', () => newLayer('text')],
  ...R3D.SHAPES.map(([shape, label]) => ['Add', label === '3D text' ? label : `3D ${label.toLowerCase()}`, '', () => add3d(shape)]),
  ['Add', 'Camera', '', () => addCamera()],
  ['Add', 'Import a 3D model…', '', () => modelInput.click()],
  // Layer
  ['Layer', 'Select layer above', 'tab|alt+arrowup', () => selectNeighbour(-1)],
  ['Layer', 'Select layer below', 'shift+tab|alt+arrowdown', () => selectNeighbour(1)],
  ['Layer', 'Bring forward', 'mod+]', withL(L => arrange(L, 'up'))],
  ['Layer', 'Send backward', 'mod+[', withL(L => arrange(L, 'down'))],
  ['Layer', 'Bring to front', 'mod+shift+]', withL(L => arrange(L, 'front'))],
  ['Layer', 'Send to back', 'mod+shift+[', withL(L => arrange(L, 'back'))],
  ['Layer', 'Hide / show', 'h', withL(L => { L.hidden = !L.hidden; refresh(); })],
  ['Layer', 'Lock / unlock', 'l', withL(L => { L.locked = !L.locked; refresh(); status(L.locked ? 'Locked' : 'Unlocked'); })],
  ['Layer', 'Flip horizontal', 'shift+h', withL(L => { setProp(L, 'sx', -state(L, time).sx); refresh(); })],
  ['Layer', 'Flip vertical', 'shift+v', withL(L => { setProp(L, 'sy', -state(L, time).sy); refresh(); })],
  ['Layer', 'Opacity 10%–90%, 100%', '1|0', null],
  ['Layer', 'Reset rotation and scale', 'shift+r', withL(L => { setProp(L, 'rotation', 0); setProp(L, 'scale', 1); setProp(L, 'sx', 1); setProp(L, 'sy', 1); refresh(); })],
  ['Layer', 'Rotate 15° left / right', 'shift+,|shift+.', null],
  // Align
  ['Align', 'Align left', 'alt+a', () => alignLayer('left')],
  ['Align', 'Align right', 'alt+d', () => alignLayer('right')],
  ['Align', 'Align top', 'alt+w', () => alignLayer('top')],
  ['Align', 'Align bottom', 'alt+s', () => alignLayer('bottom')],
  ['Align', 'Centre horizontally', 'alt+h', () => alignLayer('hcenter')],
  ['Align', 'Centre vertically', 'alt+v', () => alignLayer('vcenter')],
  ['Align', 'Centre on canvas', 'alt+c', () => centerOnCanvas('xy')],
  ['Align', 'Distribute horizontally', 'alt+shift+h', () => distribute('x')],
  ['Align', 'Distribute vertically', 'alt+shift+v', () => distribute('y')],
  ['Align', 'Nudge 1 px (Shift: 10 px)', 'arrowleft|arrowright|arrowup|arrowdown', null],
  // Keyframes
  ['Keyframes', 'Record changes as animation', 'alt+r', () => setRecording(!recording)],
  ['Keyframes', 'Key every property here', 'k', withL(L => { for (const p of PROPS[L.type]) if (ANIM.includes(p)) setKey(L, p, time, val(L, p, time)); refresh(); status('Keyed every property at ' + fmtTime(time)); })],
  ['Keyframes', 'Remove keyframes here', 'shift+k', () => removeKeysHere()],
  ['Keyframes', 'Previous keyframe', 'j|alt+,', () => jumpKey(-1)],
  ['Keyframes', 'Next keyframe', ';|alt+.', () => jumpKey(1)],
  ['Keyframes', 'Next easing for keyframe', 'e', () => cycleEase(1)],
  ['Keyframes', 'Previous easing for keyframe', 'shift+e', () => cycleEase(-1)],
  // Timeline
  ['Timeline', 'Play / pause', 'space', () => togglePlay()],
  ['Timeline', 'Play from start', 'shift+space', () => { seek(0); if (!playing) togglePlay(); }],
  ['Timeline', 'Previous / next frame', ',|.', null],
  ['Timeline', 'Back / forward 10 frames', 'shift+arrowleft|shift+arrowright', null],
  ['Timeline', 'Back / forward 1 second', 'mod+arrowleft|mod+arrowright', null],
  ['Timeline', 'Go to start', 'home', () => seek(0)],
  ['Timeline', 'Go to end', 'end', () => seek(S.dur)],
  ['Timeline', 'Go to layer start', 'shift+home|i', withL(L => seek(lin(L)))],
  ['Timeline', 'Go to layer end', 'shift+end|u', withL(L => seek(lout(L) - 1 / FPS))],
  ['Timeline', 'Layer starts here', '[', withL(L => { L.in = Math.min(time, lout(L) - 1 / FPS); refresh(); status(`${L.name} starts at ${fmtTime(L.in)}`); })],
  ['Timeline', 'Layer ends here', ']', withL(L => { L.out = Math.max(time, lin(L) + 1 / FPS); refresh(); status(`${L.name} ends at ${fmtTime(L.out)}`); })],
  ['Timeline', 'Slide layer to start here', 'alt+[', () => slideLayer('in')],
  ['Timeline', 'Slide layer to end here', 'alt+]', () => slideLayer('out')],
  ['Timeline', 'Split layer or audio at playhead', 'mod+k', () => splitLayer()],
  ['Timeline', 'Add marker', 'm', () => addMarker()],
  ['Timeline', 'Previous marker', 'shift+m|alt+arrowleft', () => jumpMarker(-1)],
  ['Timeline', 'Next marker', 'alt+m|alt+arrowright', () => jumpMarker(1)],
  ['Timeline', 'Add 1 second to the end', 'mod+shift+=', () => setDuration(S.dur + 1)],
  ['Timeline', 'Toggle snapping', 'n', () => $('#snap').click()],
  ['Timeline', 'Zoom in', '=|+', () => $('#zoomIn').click()],
  ['Timeline', 'Zoom out', '-', () => $('#zoomOut').click()],
  ['Timeline', 'Zoom to fit', '\\', () => $('#zoomFit').click()],
  // View
  ['View', 'Command palette', 'mod+p|mod+shift+p', () => palette()],
  ['View', 'Keyboard shortcuts', '?', () => cheatSheet()],
  ['View', 'Tutorial', 'f1', () => Tutorial.resume()],
  ['View', 'Focus mode (hide panels)', 'f', () => focusMode()],
  ['Layer', 'Lock / unlock aspect ratio', 'shift+l', withL(L => { L.lockAspect = !aspectLocked(L); refresh(); status(L.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'); })],
  ['View', 'Safe areas', "'", () => $('#guides').click()],
  ['View', 'Fullscreen preview', 'shift+f', () => fullscreenView()],
  ['View', 'Video mode', 'alt+1', () => setMode('video')],
  ['View', 'Image mode', 'alt+2', () => setMode('image')],
  ['View', 'Design tab', 'alt+3', () => { tab = 'props'; renderProps(); }],
  ['View', 'Animate tab', 'alt+4', () => { tab = 'anim'; renderProps(); }],
].map(([group, label, keys, run]) => ({ group, label, keys: keys ? keys.split('|') : [], run }));

// normalise an event to the same form as the table: mod+alt+shift+key, lower case
function comboOf(e) {
  let k = e.key.toLowerCase();
  if (e.code === 'Space') k = 'space';
  if (e.altKey && /^(Key|Digit)/.test(e.code)) k = e.code.replace(/^(Key|Digit)/, '').toLowerCase();  // ⌥ changes e.key on Mac
  if (e.altKey && e.code === 'Comma') k = ','; if (e.altKey && e.code === 'Period') k = '.';
  if (e.code === 'BracketLeft') k = '['; if (e.code === 'BracketRight') k = ']';
  if (e.shiftKey && e.code === 'Comma') k = ','; if (e.shiftKey && e.code === 'Period') k = '.';
  if (e.shiftKey && e.code === 'Equal') k = '=';
  const shift = e.shiftKey && !(k === '?' || k === '+');
  return [(e.metaKey || e.ctrlKey) && 'mod', e.altKey && 'alt', shift && 'shift', k].filter(Boolean).join('+');
}
const BINDINGS = new Map(); for (const c of COMMANDS) if (c.run) for (const k of c.keys) BINDINGS.set(k, c);
const ALWAYS = new Set(['mod+s', 'mod+shift+s', 'mod+o', 'mod+e', 'mod+shift+e', 'mod+p', 'mod+shift+p']);  // work even while typing

addEventListener('keydown', e => {
  if (e.repeat && /^(mod\+[sopei]|mod\+shift)/.test(comboOf(e))) return;
  const combo = comboOf(e), typing = !!e.target.matches?.('input,textarea,[contenteditable]');
  if (document.querySelector('.modal-wrap, .palette') && combo !== 'escape') { if (!ALWAYS.has(combo) || document.querySelector('.palette')) return; }
  if (typing && !ALWAYS.has(combo)) return;
  const c = BINDINGS.get(combo);
  if (c) { e.preventDefault(); return c.run(); }
  // parametrised keys
  const sh = e.shiftKey, mod = e.metaKey || e.ctrlKey;
  if (!mod && !e.altKey && /^[0-9]$/.test(e.key) && cur()) { e.preventDefault(); return setOpacity(e.key === '0' ? 1 : +e.key / 10); }
  if (combo === ',' || combo === '.') return step(combo === ',' ? -1 : 1);
  if (combo === 'shift+,' || combo === 'shift+.') { const L = cur(); if (L) { setProp(L, 'rotation', state(L, time).rotation + (combo === 'shift+,' ? -15 : 15)); refresh(); } return; }
  if (/arrow(left|right|up|down)$/.test(combo) && !e.altKey) {
    e.preventDefault(); const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[combo.split('arrow')[1]];
    if (mod) return d[0] && step(d[0] * FPS);                                 // ⌘←/→: one second
    if (selLayers().some(L => !L.locked)) return nudge(d[0] * (sh ? 10 : 1), d[1] * (sh ? 10 : 1));
    if (d[0]) step(d[0] * (sh ? 10 : 1));                                     // nothing selected: arrows scrub
  }
});

// ---------- cheat sheet (?) ----------
const kbdHTML = k => (k === '+' ? ['+'] : k.replace(/\+\+$/, '+plus').split('+')).map(p => `<kbd>${({ mod: isMac ? '⌘' : 'Ctrl', alt: isMac ? '⌥' : 'Alt', shift: '⇧', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓',
  space: 'Space', escape: 'Esc', backspace: '⌫', delete: 'Del', enter: '↵', home: 'Home', end: 'End', tab: 'Tab', f2: 'F2', plus: '+' })[p] || p.toUpperCase()}</kbd>`).join('');
function cheatSheet() {
  if (document.querySelector('.cheat')) return document.querySelector('.cheat').remove();
  const groups = {}; for (const c of COMMANDS) (groups[c.group] ||= []).push(c);
  const w = document.createElement('div'); w.className = 'modal-wrap cheat';
  w.innerHTML = `<div class="modal sheet"><div class="sheethead"><h3>Keyboard shortcuts</h3><span>${COMMANDS.length} commands · <kbd>${isMac ? '⌘' : 'Ctrl'}</kbd><kbd>P</kbd> to search them</span></div>
    <div class="sheetcols">${Object.entries(groups).map(([g, cs]) => `<section><h4>${g}</h4>${cs.map(c =>
      `<div class="sc"><span>${esc(c.label)}</span><span class="keys">${c.keys.slice(0, 2).map(kbdHTML).join('<i>or</i>')}</span></div>`).join('')}</section>`).join('')}</div></div>`;
  w.onclick = e => { if (e.target === w) w.remove(); };
  document.body.appendChild(w);
  const off = e => { if (!w.isConnected) return removeEventListener('keydown', off, true);
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopImmediatePropagation(); w.remove(); } };
  addEventListener('keydown', off, true);
}

// ---------- command palette (⌘P) ----------
function palette() {
  if (document.querySelector('.palette')) return;
  const w = document.createElement('div'); w.className = 'palette-wrap';
  w.innerHTML = `<div class="palette"><input placeholder="Type a command, layer name, or a time like 2.5s" spellcheck="false"><div class="plist"></div></div>`;
  document.body.appendChild(w);
  const inp = w.querySelector('input'), list = w.querySelector('.plist'); let items = [], i = 0;
  const all = () => [
    ...COMMANDS.filter(c => c.run).map(c => ({ label: c.label, group: c.group, keys: c.keys[0], run: c.run })),
    ...[...S.layers].reverse().map(L => ({ label: `Select ${L.name}`, group: 'Layer', run: () => { sel = L.id; selKey = null; refresh(); } })),
    ...Object.entries(PRESETS).flatMap(([g, ps]) => Object.keys(ps).map(n => ({ label: `Animate: ${n}`, group: g, run: withL(L => applyPreset(L, n)) }))),
    ...SIZES.map(([g, l, sw, shh]) => ({ label: `Canvas: ${l}`, group: `${sw}×${shh}`, run: () => resizeComp(sw, shh) })),
  ];
  const score = (q, s) => { s = s.toLowerCase(); if (s.includes(q)) return 100 - s.indexOf(q);
    let j = 0; for (const ch of s) if (ch === q[j]) j++; return j === q.length ? 10 : -1; };
  const draw = () => {
    const q = inp.value.trim().toLowerCase(), tm = q.match(/^(\d+(?:\.\d+)?)\s*s?$/);
    items = tm ? [{ label: `Go to ${fmtTime(+tm[1])}`, group: 'Timeline', run: () => seek(+tm[1]) }] : [];
    items.push(...all().map(it => ({ it, s: q ? score(q, it.label + ' ' + it.group) : 0 })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 60).map(x => x.it));
    i = Math.min(i, Math.max(0, items.length - 1));
    list.innerHTML = items.length ? items.map((it, n) => `<button class="pi ${n === i ? 'on' : ''}" data-n="${n}"><span>${esc(it.label)}</span><em>${esc(it.group)}</em>${it.keys ? kbdHTML(it.keys) : ''}</button>`).join('')
      : '<div class="pempty">Nothing matches</div>';
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => w.remove(), go = n => { const it = items[n]; close(); it?.run(); };
  inp.oninput = () => { i = 0; draw(); };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); i = (i + 1) % Math.max(1, items.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); i = (i - 1 + items.length) % Math.max(1, items.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(i); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  list.onclick = e => { const b = e.target.closest('[data-n]'); if (b) go(+b.dataset.n); };
  w.onpointerdown = e => { if (e.target === w) close(); };
  draw(); inp.focus();
}
$('#undo').onclick = () => undoRedo(-1); $('#redo').onclick = () => undoRedo(1);
let rz; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { renderTracks(); render(); }); });
const drawer = which => { const c = 'show-' + which, on = !document.body.classList.contains(c);
  document.body.classList.remove('show-layers', 'show-props'); if (on) document.body.classList.add(c); };
$('#tLayers').onclick = () => drawer('layers');
$('#tProps').onclick = () => drawer('props');
$('#scrim').onclick = () => document.body.classList.remove('show-layers', 'show-props');
document.querySelectorAll('[data-icon]').forEach(b => b.insertAdjacentHTML('afterbegin', ICON[b.dataset.icon]));

// ---------- start-up project: a blank white canvas ----------
function blank() { S = { w: 1080, h: 1080, bg: '#ffffff', dur: 5, layers: [], assets: {}, markers: [], sounds: {}, audioTracks: [] }; sel = null; selKey = null; time = 0; }

// ---------- drag animations onto layers ----------
// Pick up an animation from the library and drop it on a layer in the viewer (applies at the playhead)
// or on a layer's timeline row (applies at the frame you drop it on).
let dropTarget = null, dragJustEnded = false;
Pn.addEventListener('pointerdown', e => {
  const chip = e.target.closest('.chip'); if (!chip || e.button) return;
  const name = chip.dataset.preset, x0 = e.clientX, y0 = e.clientY; let ghost = null, at = null, marker = null;
  const find = ev => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = el?.closest('.trow.layer-row, .trow.prop-row');
    if (row && el.closest('.tln')) { const ln = row.querySelector('.tln'); return { id: +row.dataset.id, t: frame(x2t(ev.clientX - ln.getBoundingClientRect().left)), row }; }
    if (el === cv) { const [px, py] = toCanvas(ev);
      for (let i = S.layers.length - 1; i >= 0; i--) { const L = S.layers[i]; if (!visibleAt(L, time) || L.locked) continue;
        const { w, h } = bounds(L, time), [lx, ly] = local(L, px, py);
        if (Math.abs(lx) <= w / 2 + 10 && Math.abs(ly) <= h / 2 + 10) return { id: L.id, t: time }; } }
    return null;
  };
  const mv = ev => {
    if (!ghost) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      ghost = document.createElement('div'); ghost.className = 'dragghost'; ghost.innerHTML = `${name}<b></b>`; document.body.appendChild(ghost);
      document.body.classList.add('dragging-anim'); chip.classList.add('lifted'); }
    ghost.style.transform = `translate(${ev.clientX + 12}px,${ev.clientY + 10}px)`;
    at = find(ev);
    document.querySelectorAll('.trow.dropt').forEach(r => r.classList.remove('dropt'));
    marker?.remove(); marker = null;
    const L = at && S.layers.find(l => l.id === at.id);
    ghost.classList.toggle('ok', !!L);
    ghost.querySelector('b').textContent = L ? `${L.name} · ${fmtTime(at.t)}` : '';
    if (at?.row) { at.row.classList.add('dropt'); marker = document.createElement('div'); marker.className = 'dropmark';
      marker.style.left = t2x(at.t) + 'px'; at.row.querySelector('.tln').appendChild(marker); }
    if (dropTarget !== (at?.id ?? null)) { dropTarget = at?.id ?? null; render(); }
  };
  const up = () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!ghost) return;
    dragJustEnded = true; setTimeout(() => dragJustEnded = false, 0);
    document.body.classList.remove('dragging-anim'); chip.classList.remove('lifted'); marker?.remove(); ghost.remove();
    document.querySelectorAll('.trow.dropt').forEach(r => r.classList.remove('dropt'));
    const L = at && S.layers.find(l => l.id === at.id);
    dropTarget = null;
    if (L) { time = at.t; applyPreset(L, name); } else render();
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

// ---------- assets: uploaded images, stored inside the project as data URLs ----------
const IMG = {};
function imageFor(id) {
  const a = S.assets?.[id]; if (!a) return null;
  let im = IMG[id];
  if (!im || im._src !== a.src) { im = new Image(); im._src = a.src; im.onload = () => render(); im.src = a.src; IMG[id] = im; }
  return im;
}
const readURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// ---------- video ----------
// Each video asset keeps its file as a Blob (VBLOB) with an object URL (VURL); each video layer gets its own
// <video> element so two layers can show different moments of the same clip.
const VBLOB = {}, VURL = {}, VEL = {};
async function addVideoAsset(f) {
  if (f.size > 500e6) { status(`${f.name} is over 500 MB`); return null; }
  const url = URL.createObjectURL(f), v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.src = url;
  const ok = await new Promise(r => { v.onloadedmetadata = () => r(true); v.onerror = () => r(false); setTimeout(() => r(false), 15000); });
  if (!ok || !v.videoWidth) { URL.revokeObjectURL(url); status(`This browser cannot play ${f.name} (try MP4/H.264 or WebM)`); return null; }
  const id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  VBLOB[id] = f; VURL[id] = url;
  S.assets[id] = { kind: 'video', name: f.name, w: v.videoWidth, h: v.videoHeight, dur: v.duration };
  return id;
}
const clipT = (L, t) => Math.max(0, Math.min((S.assets[L.p.asset]?.dur || 0) - .04, (L.p.vin || 0) + t - lin(L)));
function videoEl(L) {
  const url = VURL[L.p.asset]; if (!url) return null;
  let v = VEL[L.id];
  if (!v || v._url !== url) {
    v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v._url = url; v.src = url;
    v.addEventListener('seeked', () => { if (!playing) render(); }); v.addEventListener('loadeddata', () => render());
    VEL[L.id] = v;
  }
  return v;
}
// while paused, keep each video parked on the right frame (a seek re-renders when it lands)
function videoFrame(L, t) {
  const v = videoEl(L); if (!v) return null;
  if (!playing && !exporting) { const ct = clipT(L, t); if (Math.abs(v.currentTime - ct) > .02 && !v.seeking) v.currentTime = ct; }
  return v;
}
function syncVideos() {
  for (const L of S.layers) {
    if (L.type !== 'video') continue; const v = videoEl(L); if (!v) continue;
    const on = playing && visibleAt(L, time), ct = clipT(L, time);
    if (!on) { if (!v.paused) v.pause(); continue; }
    if (v.paused) { v.currentTime = ct; v.play().catch(() => {}); }
    else if (Math.abs(v.currentTime - ct) > .2) v.currentTime = ct;
  }
}
let exporting = false;
async function seekVideos(t) {
  exporting = true;
  await R3D.ready();
  await Promise.all(S.layers.filter(L => L.type === 'video' && visibleAt(L, t)).map(L => new Promise(res => {
    const v = videoEl(L); if (!v) return res(); v.pause();
    const ct = clipT(L, t); if (Math.abs(v.currentTime - ct) < .001 && v.readyState >= 2) return res();
    const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); }, to = setTimeout(done, 3000);
    v.addEventListener('seeked', done); v.currentTime = ct;
  })));
  exporting = false;
}
async function addAssets(files) {
  S.assets ||= {}; const ids = [];
  for (const f of files) {
    if (f.type.startsWith('audio/')) { if (f.size > 40e6) status(`${f.name} is over 40 MB`); else await addSound(f.name, await readURL(f)); continue; }
    if (f.type.startsWith('video/')) { const id = await addVideoAsset(f); if (id) ids.push(id); continue; }
    if (R3D.modelFormat(f.name)) { const id = await addModelAsset(f); if (id) ids.push(id); continue; }
    if (!f.type.startsWith('image/')) { status(`${f.name} is not an image, video or audio file`); continue; }
    if (f.size > 15e6) { status(`${f.name} is over 15 MB`); continue; }
    const src = await readURL(f), im = new Image(); im.src = src;
    try { await im.decode(); } catch { status(`Could not read ${f.name}`); continue; }
    const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    S.assets[id] = { name: f.name, src, w: im.naturalWidth || 512, h: im.naturalHeight || 512 };
    im._src = src; IMG[id] = im; ids.push(id);
  }
  if (ids.length) { refresh(); status(ids.length === 1 ? `Imported ${S.assets[ids[0]].name}` : `Imported ${ids.length} files`); }
  return ids;
}
// a 3D model: the file, kept in the project like an image, read by the 3D view when a layer needs it
async function addModelAsset(f) {
  const format = R3D.modelFormat(f.name);
  if (f.size > 50e6) { status(`${f.name} is over 50 MB`); return null; }
  if (format === 'gltf') {
    const text = await f.text();
    if (/"uri"\s*:\s*"(?!data:)/.test(text)) { status(`${f.name} keeps its data in other files: export it as one .glb and import that`); return null; }
  }
  const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  S.assets[id] = { kind: 'model', format, name: f.name, src: await readURL(new File([f], f.name, { type: R3D.MODEL_TYPES[format] })), w: 512, h: 512 };
  R3D.model(id);
  return id;
}
function addModelLayer(id, x = S.w / 2, y = S.h / 2) {
  const a = S.assets[id], side = Math.round(Math.min(S.w, S.h) * .55);
  const L = makeLayer('model', { asset: id, x: Math.round(x), y: Math.round(y), w: side, h: side, rotY: 25, rotX: -10 }, a.name.replace(/\.[^.]+$/, ''));
  sel = L.id; freshLayer = L.id; refresh();
}
// a solid shape, turned a little so it reads as 3D from the start
function add3d(shape = 'cube', x = S.w / 2, y = S.h / 2) {
  const side = Math.round(Math.min(S.w, S.h) * .32), text = shape === 'text';
  const L = makeLayer('shape3d', { shape, x: Math.round(x), y: Math.round(y), w: text ? side * 2.4 : side, h: side, d: text ? Math.round(side * .3) : side,
    rotX: text ? -12 : -22, rotY: text ? 18 : 32, text: text ? 'Riptide' : 'Hello' }, R3D.SHAPES.find(s => s[0] === shape)[1] + ' ' + uid);
  if (text) R3D.loadFont();
  sel = L.id; freshLayer = L.id; refresh(); status(`Added ${L.name}: turn it with Rotate X and Y, or add a camera to move around it`);
}
function addCamera() {
  if (S.layers.some(L => L.type === 'camera')) status('There is a camera already: the top one is the one that films');
  const L = makeLayer('camera', {}, 'Camera'); L.p.x = S.w / 2; L.p.y = S.h / 2;
  if (!S.layers.some(M => R3D.is3d(M))) status('Camera added. It films 3D layers: turn a layer to 3D, or add a 3D shape');
  sel = L.id; freshLayer = L.id; refresh();
}
function addImageLayer(id, x = S.w / 2, y = S.h / 2) {
  if (S.assets[id]?.kind === 'model') return addModelLayer(id, x, y);
  const a = S.assets[id], vid = a.kind === 'video', k = Math.min(1, (Math.min(S.w, S.h) * (vid ? 1 : .6)) / Math.max(a.w, a.h));
  if (vid && a.dur > S.dur + .05) { S.dur = Math.min(600, Math.ceil(a.dur * FPS) / FPS); status(`Timeline extended to ${fmtTime(S.dur)} to fit ${a.name}`); }
  const L = makeLayer(vid ? 'video' : 'image', { asset: id, x: Math.round(x), y: Math.round(y), w: Math.round(a.w * k), h: Math.round(a.h * k), radius: 0, strokeWidth: 0 },
    a.name.replace(/\.[^.]+$/, ''));
  if (vid) { L.in = frame(Math.min(time, Math.max(0, S.dur - a.dur))); L.out = Math.min(S.dur, L.in + a.dur); }
  sel = L.id; freshLayer = L.id; refresh();
}
let assetSig = '';
function renderAssets() {
  const ids = Object.keys(S.assets || {}), sids = Object.keys(S.sounds || {}).filter(k => SND[k]), usedS = new Set(allClips().map(([, c]) => c.sound));
  const sig = ids.join() + '|' + S.layers.filter(l => l.p.asset).map(l => l.p.asset).join() + '|' + sids.join() + '|' + [...usedS].join();
  if (sig === assetSig) return; assetSig = sig;
  $('#assetCount').textContent = ids.length + sids.length || '';
  const au = sids.map(k => { const s = S.sounds[k]; return `<div class="asset audio" data-sound="${k}" title="${esc(s.name)} · ${s.dur.toFixed(1)}s audio\nClick to add it at the playhead on a new track">${ICON.audio}<span>${esc(s.name)}</span>${usedS.has(k) ? '<i class="used"></i>' : ''}
      <button class="ib" data-rm-sound="${k}" title="Remove this audio and its clips">${ICON.trash}</button></div>`; }).join('');
  $('#assetGrid').innerHTML = (ids.length || sids.length) ? au + ids.map(id => { const a = S.assets[id], used = S.layers.some(l => l.p.asset === id);
    return `<div class="asset ${a.kind === 'video' ? 'video' : ''}" data-asset="${id}" title="${esc(a.name)} · ${a.kind === 'model' ? '3D model' : `${a.w}×${a.h}`}${a.dur ? ' · ' + fmtTime(a.dur) : ''}\nClick to add, or drag into the viewer">
      ${a.kind === 'video' ? `<video src="${VURL[id] || ''}#t=0.1" muted preload="metadata" playsinline></video><em class="dur">${fmtTime(a.dur)}</em>` : a.kind === 'model' ? `<span class="modelthumb">${ICON.model}</span>` : `<img src="${a.src}" alt="" draggable="false">`}<span>${esc(a.name)}</span>${used ? '<i class="used"></i>' : ''}
      <button class="ib" data-rm="${id}" title="Remove asset">${ICON.trash}</button></div>`; }).join('')
    : `<button class="assetdrop" id="assetEmpty">${ICON.upload}<b>Import media</b><span>Images, video or audio. You can also drop or paste files.</span></button>`;
}
const assetInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,video/*,audio/*,.glb,.gltf,.obj', multiple: true });
const modelInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.glb,.gltf,.obj' });
modelInput.onchange = async () => { const fs = [...modelInput.files]; modelInput.value = ''; const ids = await addAssets(fs); ids.forEach(id => addImageLayer(id)); };
assetInput.onchange = async () => { const fs = [...assetInput.files]; assetInput.value = ''; await addAssets(fs); };
$('#assetUpload').onclick = () => assetInput.click();
$('#assetGrid').addEventListener('click', async e => {
  if (e.target.closest('#assetEmpty')) return assetInput.click();
  const rm = e.target.closest('[data-rm]')?.dataset.rm;
  const rs = e.target.closest('[data-rm-sound]')?.dataset.rmSound;
  if (rs) { for (const T of tracks()) T.clips = T.clips.filter(c => c.sound !== rs); delete S.sounds[rs];
    if (!findClip(selClip)[1]) selClip = null; syncAudio(); refresh(); return status('Audio removed'); }
  const snd = e.target.closest('[data-sound]')?.dataset.sound;
  if (snd && S.sounds[snd]) return addClip(snd, time);
  if (rm) {
    const users = S.layers.filter(l => l.p.asset === rm);
    if (users.length && !await UI.dialog({ title: 'Remove this asset?', body: `${users.length} layer${users.length > 1 ? 's use' : ' uses'} it and will be deleted too.`, ok: 'Remove' })) return;
    S.layers = S.layers.filter(l => l.p.asset !== rm); delete S.assets[rm]; delete IMG[rm]; if (VURL[rm]) { URL.revokeObjectURL(VURL[rm]); delete VURL[rm]; delete VBLOB[rm]; } if (!cur()) sel = null; refresh(); return;
  }
});
// drag a thumbnail onto the canvas (or click it) to place the image
$('#assetGrid').addEventListener('pointerdown', e => {
  const t = e.target.closest('.asset'); if (!t || !t.dataset.asset || e.target.closest('[data-rm]') || e.button) return;
  const id = t.dataset.asset, x0 = e.clientX, y0 = e.clientY; let ghost = null;
  const mv = ev => {
    if (!ghost) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      const A = S.assets[id];
      ghost = document.createElement(A.kind === 'video' ? 'video' : A.kind === 'model' ? 'div' : 'img'); ghost.className = 'assetghost';
      if (A.kind === 'model') ghost.innerHTML = ICON.model; else ghost.src = A.kind === 'video' ? VURL[id] + '#t=0.1' : A.src; ghost.muted = true; document.body.appendChild(ghost);
      document.body.classList.add('dragging-anim'); }
    ghost.style.transform = `translate(${ev.clientX - 36}px,${ev.clientY - 36}px)`;
    ghost.classList.toggle('ok', document.elementFromPoint(ev.clientX, ev.clientY) === cv);
  };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); document.body.classList.remove('dragging-anim');
    if (!ghost) return addImageLayer(id);
    const onCanvas = document.elementFromPoint(ev.clientX, ev.clientY) === cv; ghost.remove();
    if (onCanvas) { const [px, py] = toCanvas(ev); addImageLayer(id, px, py); }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});

// ---------- image editing ----------
const LOOK0 = { bright: 100, contrast: 100, sat: 100, hue: 0, gray: 0, sepia: 0, invert: 0 };
const LOOKS = {
  Original: {}, Vivid: { contrast: 112, sat: 140 }, Warm: { sepia: 22, sat: 115, bright: 104 }, Cool: { hue: 190, sat: 80, sepia: 12, contrast: 104 },
  Faded: { contrast: 82, sat: 75, bright: 108 }, Vintage: { sepia: 45, contrast: 90, sat: 85, bright: 103 },
  Noir: { gray: 100, contrast: 135, bright: 95 }, Mono: { gray: 100 }, Punch: { contrast: 130, sat: 125, bright: 98 }, Negative: { invert: 100 },
};
function fitCanvasToImage(L) {
  const a = S.assets[L.p.asset]; if (!a) return;
  S.w = a.w; S.h = a.h; Object.assign(L.p, { x: a.w / 2, y: a.h / 2, w: a.w, h: a.h, rotation: 0, scale: 1 });
  for (const k of ['x', 'y', 'w', 'h', 'rotation', 'scale']) delete L.keys[k];
  refresh(); status(`Canvas is now ${a.w}×${a.h}`);
}
// image mode hides the timeline and turns export into still-image export
function setMode(m) {
  S.mode = m === 'image' ? 'image' : undefined;
  document.body.classList.toggle('mode-image', m === 'image');
  document.querySelectorAll('#mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'image' && playing) togglePlay();
  if (m === 'image' && tab === 'anim') tab = 'props';
  requestAnimationFrame(() => refresh(true, false));
}
$('#mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
// in image mode, importing the first image into an empty canvas opens it at full resolution
const _addImageLayer = addImageLayer;
addImageLayer = function (id, x, y) {
  const empty = !S.layers.length;
  _addImageLayer(id, x, y);
  if (S.mode === 'image' && empty) fitCanvasToImage(cur());
};

// ---------- resizable panels ----------
// A splitter is a handle you drag to set one size: the layers column's width (its right edge) and the layer list's
// height (the bar under it). Sizes are CSS custom properties, clamped, remembered, and reset with a double-click.
// While dragging, <html data-resizing="x|y"> shows the cursor everywhere and blocks text selection; nothing else on the
// page changes, so the layout cannot shift under the pointer. The size comes from the pointer's distance from where the
// drag started, never from re-measuring the layout mid-drag.
const panels = (() => {
  const KEY = 'riptide.panels', root = $('#app');
  const pref = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('wobble.panels') || '{}');
  const save = () => localStorage.setItem(KEY, JSON.stringify(pref));
  const sizes = {
    lw: { el: () => root, prop: '--lw', min: 170, max: () => Math.min(560, innerWidth - $('#props').offsetWidth - 320), now: () => $('#layers').offsetWidth },
    lh: { el: () => $('#layerList'), prop: '--lh', min: 56, max: () => Math.max(56, $('#layers').clientHeight - 90), now: () => $('#layerList').offsetHeight },
  };
  const clamp = (k, v) => Math.round(Math.max(sizes[k].min, Math.min(sizes[k].max(), v)));
  function apply() {
    for (const [k, s] of Object.entries(sizes)) {
      if (pref[k] != null) s.el().style.setProperty(s.prop, clamp(k, pref[k]) + 'px'); else s.el().style.removeProperty(s.prop);
    }
  }
  function splitter(handle, key, axis) {
    handle.addEventListener('pointerdown', e => {
      if (e.button) return;
      e.preventDefault(); e.stopPropagation();
      const start = axis === 'x' ? e.clientX : e.clientY, from = sizes[key].now();
      let raf = 0, pos = start;
      const frameUpdate = () => { raf = 0; pref[key] = clamp(key, from + pos - start); apply(); };
      const move = ev => { pos = axis === 'x' ? ev.clientX : ev.clientY; raf ||= requestAnimationFrame(frameUpdate); };
      const end = () => {
        for (const [t, f] of evs) handle.removeEventListener(t, f);
        if (raf) cancelAnimationFrame(raf);
        if (pos !== start) frameUpdate();
        handle.classList.remove('on'); delete document.documentElement.dataset.resizing;
        save(); renderTracks(); render();
      };
      const evs = [['pointermove', move], ['pointerup', end], ['pointercancel', end], ['lostpointercapture', end]];
      try { handle.setPointerCapture(e.pointerId); } catch {}
      for (const [t, f] of evs) handle.addEventListener(t, f);
      handle.classList.add('on'); document.documentElement.dataset.resizing = axis;
    });
    handle.addEventListener('dblclick', () => { delete pref[key]; apply(); save(); renderTracks(); render(); status('Panel size reset'); });
  }
  splitter($('#rsLayers'), 'lw', 'x');
  splitter($('#rsList'), 'lh', 'y');
  addEventListener('resize', apply);
  apply();
  return { apply };
})();

// ---------- intro ----------
// The splash logo draws its wave while a short loader fills, then flies into the header's logo spot.
(() => {
  const sp = $('#splash'), done = () => { document.body.classList.remove('booting'); sp?.remove(); setTimeout(() => Tutorial.offer(), 600); };
  if (!sp || matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
  setTimeout(() => {
    const from = sp.querySelector('.slogo'), to = $('.brand .mark');
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    sp.classList.add('leaving'); document.body.classList.remove('booting'); to.style.visibility = 'hidden';
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2), s = b.width / a.width;
    const fly = from.animate([{ transform: 'none' }, { transform: `translate(${dx * .55}px,${dy * .45}px) scale(${(1 + s) / 2}) rotate(-8deg)`, offset: .55 },
      { transform: `translate(${dx}px,${dy}px) scale(${s})` }], { duration: 650, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
    fly.onfinish = () => { to.style.visibility = ''; done(); };
  }, 1750);
})();

// ---------- context menu ----------
// Right-click anything: layers (viewer, layer list, timeline), keyframes, the ruler, media and empty canvas.
// Items: { label, icon, kbd, act, sub, danger, disabled, check } | '-' | { head, icon } | { swatches, act }
const CTX = { root: null };
function ctxClose() { CTX.root?.querySelectorAll('.ctx').forEach(m => m.remove()); CTX.root?.remove(); CTX.root = null; }
function ctxBuild(items, x, y, parent) {
  const m = document.createElement('div'); m.className = 'ctx'; m.setAttribute('role', 'menu');
  for (const it of items) {
    if (it === '-') { m.insertAdjacentHTML('beforeend', '<div class="csep"></div>'); continue; }
    if (it.head) { m.insertAdjacentHTML('beforeend', `<div class="chead">${it.icon || ''}<span>${esc(it.head)}</span>${it.note ? `<em>${esc(it.note)}</em>` : ''}</div>`); continue; }
    if (it.swatches) {
      const row = document.createElement('div'); row.className = 'cswatches';
      it.swatches.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.title = c; if (c === it.current) b.classList.add('on');
        b.onclick = () => { ctxClose(); it.act(c); }; row.appendChild(b); });
      m.appendChild(row); continue;
    }
    const b = document.createElement('button'); b.className = 'ci' + (it.danger ? ' danger' : '') + (it.sub ? ' hassub' : '');
    b.disabled = !!it.disabled; b.setAttribute('role', 'menuitem');
    b.innerHTML = `<span class="cic">${it.check ? ICON.check : it.icon || ''}</span><span class="cl">${esc(it.label)}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}${it.sub ? '<i class="carr"></i>' : ''}`;
    if (it.sub) {
      const openSub = () => {
        if (b._sub?.isConnected) return; m.querySelectorAll('.ci.open').forEach(o => { o.classList.remove('open'); o._sub?.remove(); });
        const r = b.getBoundingClientRect(); b.classList.add('open'); b._sub = ctxBuild(it.sub, r.right - 2, r.top - 5, b);
      };
      b.addEventListener('pointerenter', () => { clearTimeout(m._t); m._t = setTimeout(openSub, 90); });
      b.onclick = openSub; b._open = openSub;
    } else {
      b.addEventListener('pointerenter', () => { clearTimeout(m._t); m._t = setTimeout(() => m.querySelectorAll('.ci.open').forEach(o => { o.classList.remove('open'); o._sub?.remove(); }), 120); });
      b.onclick = () => { ctxClose(); it.act?.(); };
    }
    m.appendChild(b);
  }
  (CTX.root ||= Object.assign(document.createElement('div'), { className: 'ctxroot' })).appendChild(m);
  if (!CTX.root.isConnected) document.body.appendChild(CTX.root);
  const w = m.offsetWidth, h = m.offsetHeight;
  let px = x, py = y;
  if (px + w > innerWidth - 6) px = parent ? parent.getBoundingClientRect().left - w + 2 : innerWidth - w - 6;
  if (py + h > innerHeight - 6) py = Math.max(6, innerHeight - h - 6);
  m.style.left = Math.max(6, px) + 'px'; m.style.top = py + 'px';
  m.style.transformOrigin = `${px < x ? 'right' : 'left'} top`;
  return m;
}
function ctxOpen(e, items) { e.preventDefault(); e.stopPropagation(); UI.close?.(); ctxClose(); ctxBuild(items, e.clientX, e.clientY); }
addEventListener('pointerdown', e => { if (CTX.root && !e.target.closest('.ctx')) ctxClose(); }, true);
addEventListener('blur', ctxClose); addEventListener('resize', ctxClose);
addEventListener('wheel', e => { if (CTX.root && !e.target.closest('.ctx')) ctxClose(); }, { passive: true });
// keyboard: arrows move, right/left open/close submenus, Enter picks, Esc closes
addEventListener('keydown', e => {
  if (!CTX.root) return;
  const menus = [...CTX.root.querySelectorAll('.ctx')], m = menus.at(-1);
  const items = [...m.querySelectorAll('.ci:not(:disabled)')], i = items.indexOf(m.querySelector('.ci.kb'));
  const focus = n => { items.forEach(x => x.classList.remove('kb')); items[n]?.classList.add('kb'); };
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.key === 'Escape') ctxClose();
  else if (e.key === 'ArrowDown') focus((i + 1) % items.length);
  else if (e.key === 'ArrowUp') focus((i - 1 + items.length) % items.length);
  else if (e.key === 'ArrowRight' && items[i]?._open) { items[i]._open(); const s = CTX.root.querySelectorAll('.ctx'); s[s.length - 1].querySelector('.ci:not(:disabled)')?.classList.add('kb'); }
  else if (e.key === 'ArrowLeft' && menus.length > 1) { m.remove(); menus.at(-2).querySelector('.ci.open')?.classList.remove('open'); }
  else if (e.key === 'Enter' || e.key === ' ') items[i]?.click();
}, true);

const SWATCHES = ['#151515', '#ffffff', '#ff5a36', '#ffb020', '#2fbf71', '#4c8dff', '#8b5cf6', '#ec4899'];
function arrange(L, how) {
  const a = S.layers, i = a.indexOf(L); a.splice(i, 1);
  const j = { front: a.length, back: 0, up: Math.min(a.length, i + 1), down: Math.max(0, i - 1) }[how]; a.splice(j, 0, L); refresh();
}
async function renameLayer(L) { const n = await UI.prompt('Rename layer', L.name, 'Rename'); if (n?.trim()) { L.name = n.trim(); refresh(); } }
function layerItems(L) {
  if (!selIds().has(L.id)) setSelection([L.id]); else sel = L.id;     // right-clicking inside a selection keeps it
  refresh(true, false);
  const shape = L.type !== 'image' && L.type !== 'video', fillKey = L.type === 'arc' || L.type === 'wave' ? 'stroke' : 'fill';
  return [
    { head: L.name, icon: `<span style="color:${iconColor(L)}">${ICON[L.type]}</span>`, note: L.type },
    ...(shape ? [{ swatches: SWATCHES, current: String(state(L, time)[fillKey]).toLowerCase(), act: c => { setProp(L, fillKey, c); refresh(); } }, '-'] : []),
    { label: 'Copy', icon: ICON.dup, kbd: '⌘C', act: copyLayer },
    { label: 'Paste', kbd: '⌘V', disabled: !clip, act: pasteLayer },
    { label: 'Duplicate', kbd: '⌘D', act: duplicate },
    { label: 'Rename…', act: () => renameLayer(L) },
    '-',
    { label: 'Animate', icon: ICON.play2, sub: Object.entries(PRESETS).map(([g, items]) => ({ label: g, sub: Object.keys(items).map(n => ({ label: n, kbd: presetMeta(items[n], L), act: () => applyPreset(L, n) })) })) },
    { label: 'Blend mode', sub: BLENDS.map(([v, l]) => ({ label: l, check: (L.blend || 'source-over') === v, act: () => { L.blend = v === 'source-over' ? undefined : v; refresh(); } })) },
    ...(ADJUST.length ? [{ label: 'Look', sub: Object.keys(LOOKS).map(n => ({ label: n, act: () => { for (const [k, v] of Object.entries({ ...LOOK0, ...LOOKS[n] })) setProp(L, k, v); refresh(); status(`Look: ${n}`); } })) }] : []),
    { label: 'Align', sub: [
      { label: 'Centre on canvas', icon: ICON.center, kbd: '⌥C', act: () => centerOnCanvas('xy') },
      { label: 'Centre horizontally', icon: ICON.alC, kbd: '⌥H', act: () => alignLayer('hcenter') }, { label: 'Centre vertically', icon: ICON.alM, kbd: '⌥V', act: () => alignLayer('vcenter') }, '-',
      { label: 'Align left', icon: ICON.alL, kbd: '⌥A', act: () => alignLayer('left') }, { label: 'Align right', icon: ICON.alR, kbd: '⌥D', act: () => alignLayer('right') },
      { label: 'Align top', icon: ICON.alT, kbd: '⌥W', act: () => alignLayer('top') }, { label: 'Align bottom', icon: ICON.alB, kbd: '⌥S', act: () => alignLayer('bottom') },
      ...(selLayers().length > 2 ? ['-', { label: 'Distribute horizontally', icon: ICON.distH, act: () => distribute('x') }, { label: 'Distribute vertically', icon: ICON.distV, act: () => distribute('y') }] : [])] },
    { label: 'Arrange', sub: [
      { label: 'Bring to front', kbd: '', act: () => arrange(L, 'front') }, { label: 'Bring forward', act: () => arrange(L, 'up') },
      { label: 'Send backward', act: () => arrange(L, 'down') }, { label: 'Send to back', act: () => arrange(L, 'back') }] },
    '-',
    { label: 'Key all properties', icon: ICON.key, kbd: 'K', act: () => { for (const p of PROPS[L.type]) if (ANIM.includes(p)) setKey(L, p, time, val(L, p, time)); refresh(); status('Keyed every property at ' + fmtTime(time)); } },
    { label: 'Split at playhead', icon: ICON.blade, kbd: '⌘K', disabled: !(time > lin(L) && time < lout(L)), act: splitLayer },
    { label: 'Start here', kbd: '[', act: () => { L.in = Math.min(time, lout(L) - 1 / FPS); refresh(); } },
    { label: 'End here', kbd: ']', act: () => { L.out = Math.max(time, lin(L) + 1 / FPS); refresh(); } },
    ...(L.type === 'image' || L.type === 'video' ? [{ label: 'Fit canvas to media', act: () => fitCanvasToImage(L) }] : []),
    ...(L.type === 'text' ? [{ label: 'Edit text', kbd: '↵', act: () => editText(L) }] : []),
    '-',
    { label: L.hidden ? 'Show' : 'Hide', icon: L.hidden ? ICON.eye : ICON.eyeOff, act: () => { L.hidden = !L.hidden; refresh(); } },
    { label: L.locked ? 'Unlock' : 'Lock', icon: L.locked ? ICON.unlock : ICON.lock, act: () => { L.locked = !L.locked; refresh(); } },
    ...['pos', 'w', 'h'].map(which => ({ label: `${L.fix?.[which] ? 'Unlock' : 'Lock'} ${FIX_NAME[which].toLowerCase()}`, icon: L.fix?.[which] ? ICON.unlock : ICON.lock, act: () => toggleFix(L, which) })),
    { label: 'Delete', icon: ICON.trash, kbd: '⌫', danger: true, act: removeLayer },
  ];
}
function canvasItems(px, py) {
  const add = type => () => { newLayer(type); const L = cur(); L.p.x = Math.round(px); L.p.y = Math.round(py); refresh(); };
  return [
    { head: 'Canvas', note: `${S.w}×${S.h}` },
    { label: 'Add here', icon: ICON.plus, sub: [['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'], ['polygon', 'Polygon', 'P'], ['star', 'Star', ''], ['arc', 'Arc', 'A'], ['text', 'Text', 'T']]
      .map(([t, l, k]) => ({ label: l, icon: ICON[t], kbd: k, act: add(t) })) },
    { label: 'Paste', kbd: '⌘V', disabled: !clip, act: pasteLayer },
    { label: 'Import media…', icon: ICON.upload, act: () => assetInput.click() },
    '-',
    { label: 'Background', sub: [{ swatches: ['#ffffff', '#ece8e1', '#151515', '#0b1026', '#ff5a36', '#4c8dff', '#2fbf71', '#ffb020'], current: S.bg, act: c => { S.bg = c; refresh(); } }] },
    { label: 'Safe areas', check: guidesOn, kbd: "'", act: () => $('#guides').click() },
    { label: S.mode === 'image' ? 'Switch to video mode' : 'Switch to image mode', act: () => setMode(S.mode === 'image' ? 'video' : 'image') },
    '-',
    { label: 'Save frame as image…', act: () => exportStill({ img: 'png', q: 1, scale: 1 }) },
    { label: 'Export…', kbd: '⌘E', act: () => $('#export').click() },
  ];
}
function keyItems(L, t, prop) {
  selKey = { id: L.id, t, prop: prop || undefined }; sel = L.id; updateEaseButton();
  const ks = prop ? L.keys[prop].filter(k => near(k.t, t)) : keysAt(L, t), cur0 = ks[0]?.ease || 'easeInOut';
  const groups = {}; for (const it of EASE_ITEMS) if (it.value) (groups[it.group || 'Easing'] ||= []).push(it);
  return [
    { head: `${prop ? LABEL[prop] : 'Keyframe'} · ${fmtTime(t)}`, note: L.name },
    { label: 'Easing', sub: Object.entries(groups).map(([g, list]) => ({ label: g, sub: list.map(it => ({ label: it.label, check: it.value === cur0, act: () => { ks.forEach(k => k.ease = it.value); refresh(); status('Easing set to ' + easeName(it.value)); } })) })) },
    { label: 'Go to keyframe', act: () => seek(t) },
    { label: 'Move to playhead', disabled: near(t, time), act: () => { ks.forEach(k => k.t = time); Object.values(L.keys).forEach(a => a.sort((p, q) => p.t - q.t)); selKey.t = time; refresh(); } },
    '-',
    { label: ks.length > 1 ? `Delete ${ks.length} keyframes` : 'Delete keyframe', icon: ICON.trash, kbd: '⌫', danger: true, act: () => $('#delKey').click() },
  ];
}
function rulerItems(t) {
  return [
    { head: 'Timeline', note: fmtTime(t) },
    { label: 'Move playhead here', act: () => seek(t) },
    { label: 'Add marker here', icon: ICON.marker, kbd: 'M', act: () => addMarker(t) },
    { label: 'End timeline here', disabled: t < .5, act: () => setDuration(t) },
    '-',
    { label: 'Add 5 seconds', act: () => setDuration(S.dur + 5) },
    { label: 'Zoom to fit', kbd: '\\', act: () => setZoom(1) },
    { label: 'Snapping', check: snapOn, act: () => $('#snap').click() },
    { label: 'Clear markers', danger: true, disabled: !S.markers?.length, act: () => { S.markers = []; refresh(); } },
  ];
}
addEventListener('contextmenu', e => {
  const t = e.target;
  if (t.closest('input,textarea,.ctx')) return;            // keep the native menu for text fields
  const dia = t.closest('.dia'), lrow = t.closest('.layer, .trow.layer-row, .trow.prop-row'), asset = t.closest('.asset[data-asset]');
  if (dia) { const L = S.layers.find(l => l.id === +dia.closest('.trow').dataset.id); if (L) return ctxOpen(e, keyItems(L, +dia.dataset.t, dia.dataset.prop)); }
  if (t.closest('.trow.ruler')) { const ln = t.closest('.trow.ruler').querySelector('.tln'); return ctxOpen(e, rulerItems(frame(x2t(e.clientX - ln.getBoundingClientRect().left)))); }
  if (lrow) { const L = S.layers.find(l => l.id === +lrow.dataset.id); if (L) return ctxOpen(e, layerItems(L)); }
  if (asset) { const id = asset.dataset.asset, a = S.assets[id];
    return ctxOpen(e, [{ head: a.name, note: a.kind === 'video' ? fmtTime(a.dur) : `${a.w}×${a.h}` },
      { label: 'Add to canvas', icon: ICON.plus, act: () => addImageLayer(id) },
      { label: 'Remove from project', icon: ICON.trash, danger: true, act: () => asset.querySelector('[data-rm]').click() }]); }
  if (t === cv) {
    const [px, py] = toCanvas(e);
    for (let i = S.layers.length - 1; i >= 0; i--) { const L = S.layers[i]; if (!visibleAt(L, time)) continue;
      const { w, h } = bounds(L, time), [lx, ly] = local(L, px, py);
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return ctxOpen(e, layerItems(L)); }
    sel = null; refresh(true, false); return ctxOpen(e, canvasItems(px, py));
  }
  if (t.closest('#app')) e.preventDefault();               // no browser menu over the editor chrome
});

// ---------- live link for agents (MCP) ----------
// server.py relays requests from mcp_server.py over Server-Sent Events; each one runs here against the open project,
// goes through the normal edit path (so it shows up instantly, can be undone, and marks the file as edited),
// and the result is posted back.
const LIVE = (() => {
  const round = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
  const findTrack = v => { const ts = tracks(), T = ts.find(x => x.id === String(v)) || ts.find(x => x.name === String(v)) || (/^\d+$/.test(String(v)) ? ts[+v - 1] : null);
    if (!T) throw new Error(`no audio track "${v}". Tracks: ${ts.map((x, i) => `${i + 1} ${x.name} (${x.id})`).join(', ') || 'none'}`); return T; };
  const findL = a => { const L = S.layers.find(l => l.id === +a.id) || S.layers.find(l => l.name === a.id || l.name === a.name);
    if (!L) throw new Error(`No layer ${JSON.stringify(a.id ?? a.name)}. Call get_project for ids.`); return L; };
  const checkProp = (L, p) => { if (p === 'name' || PROPS[L.type].includes(p)) return;
    throw new Error(`${L.type} layers have no "${p}". Valid: ${PROPS[L.type].join(', ')}`); };
  const easeOK = e => { if (e && !EASE_ITEMS.some(i => i.value === e)) throw new Error(`Unknown easing "${e}". Valid: ${EASE_ITEMS.map(i => i.value).join(', ')}`); return e; };
  const layerInfo = (L, full) => {
    const props = {}; for (const p of PROPS[L.type]) props[p] = round(L.keys[p]?.length ? val(L, p, time) : L.p[p]);
    if (L.p.asset) props.asset = S.assets[L.p.asset]?.name;
    const keyframes = {}; for (const [p, ks] of Object.entries(L.keys)) if (ks.length) keyframes[p] = full ? ks.map(k => ({ t: round(k.t), v: round(k.v), ease: k.ease || 'easeInOut' })) : ks.length;
    return { id: L.id, name: L.name, type: L.type, in: round(lin(L)), out: round(lout(L)), hidden: !!L.hidden, locked: !!L.locked,
      locked_position: !!L.fix?.pos, locked_width: !!L.fix?.w, locked_height: !!L.fix?.h,
      blend: L.blend || 'normal', [full ? 'props' : 'props_at_playhead']: props, keyframes };
  };
  const summary = () => ({
    name: projectName, mode: S.mode || 'video', canvas: { width: S.w, height: S.h, background: S.bg }, duration: S.dur, fps: FPS,
    playhead: round(time), selected: sel, markers: (S.markers || []).map(m => ({ t: round(m.t), label: m.label || '' })),
    audio_tracks: tracks().map(T => ({ id: T.id, name: T.name, volume: T.volume ?? 1, muted: !!T.muted,
      clips: T.clips.map(c => ({ id: c.id, file: S.sounds?.[c.sound]?.name, start: round(c.start), end: round(c.start + c.len), source_start: round(c.in), fade_in: round(c.fadeIn || 0), fade_out: round(c.fadeOut || 0) })) })),
    layers: [...S.layers].reverse().map(L => layerInfo(L, false)),
    note: 'layers are listed top (front) first; coordinates are canvas pixels with x,y at the layer centre; times are seconds',
  });
  const frameURL = (t, width = 540) => {
    const k = Math.min(1, width / S.w), oc = document.createElement('canvas');
    oc.width = Math.max(1, Math.round(S.w * k)); oc.height = Math.max(1, Math.round(S.h * k));
    renderScene(oc.getContext('2d'), t, k); return oc.toDataURL('image/png');
  };
  const done = (msg, extra = {}) => { refresh(); status('Agent: ' + msg); return { ok: true, message: msg, ...extra }; };

  const ops = {
    get_project: () => summary(),
    get_layer: a => layerInfo(findL(a), true),
    list_capabilities: () => ({
      layer_types: Object.fromEntries(Object.entries(PROPS).filter(([t]) => !['image', 'video', 'model'].includes(t)).map(([t, ps]) => [t, ps])),
      shapes_3d: R3D.SHAPES.map(s => s[0]), materials_3d: R3D.MATERIALS.map(m => m[0]),
      easings: EASE_ITEMS.map(i => i.value), presets: Object.fromEntries(Object.entries(PRESETS).map(([g, it]) => [g, Object.keys(it)])),
      blend_modes: BLENDS.map(b => b[0] === 'source-over' ? 'normal' : b[0]), looks: Object.keys(LOOKS),
    }),
    render_frame: async a => { const t = Math.max(0, Math.min(S.dur, +(a.time ?? time))); await seekVideos(t);
      return { ok: true, time: t, png: frameURL(t, +a.width || 540) }; },
    render_frames: async a => {   // contact sheet of several moments, so an agent can see motion in one image
      const n = Math.max(2, Math.min(16, +a.count || 8)), ts = a.times?.length ? a.times.map(Number) : Array.from({ length: n }, (_, i) => i * S.dur / (n - 1) * .999);
      const cols = Math.min(4, ts.length), rows = Math.ceil(ts.length / cols), cw = Math.min(360, +a.width || 300), chh = Math.round(cw * S.h / S.w);
      const sh = document.createElement('canvas'); sh.width = cols * (cw + 6) - 6; sh.height = rows * (chh + 24) - 6; const g = sh.getContext('2d');
      g.fillStyle = '#111'; g.fillRect(0, 0, sh.width, sh.height);
      const oc = document.createElement('canvas'); oc.width = cw; oc.height = chh;
      for (const [i, t] of ts.entries()) { await seekVideos(t); renderScene(oc.getContext('2d'), t, cw / S.w);
        const x = (i % cols) * (cw + 6), y = Math.floor(i / cols) * (chh + 24); g.drawImage(oc, x, y + 18);
        g.fillStyle = '#ddd'; g.font = '12px ui-monospace, Menlo, monospace'; g.fillText(`${t.toFixed(2)}s`, x + 4, y + 13); }
      return { ok: true, times: ts.map(round), png: sh.toDataURL('image/png') };
    },
    add_layer: a => {
      if (!PROPS[a.type] || ['image', 'video', 'model'].includes(a.type)) throw new Error(`type must be one of ${Object.keys(PROPS).filter(t => !['image', 'video', 'model'].includes(t)).join(', ')}`);
      const props = a.props || {}; for (const p in props) if (!PROPS[a.type].includes(p)) throw new Error(`${a.type} layers have no "${p}"`);
      const L = makeLayer(a.type, props, a.name);
      if (a.in != null) L.in = +a.in; if (a.out != null) L.out = +a.out;
      sel = L.id; return done(`added ${L.type} "${L.name}"`, { id: L.id });
    },
    add_model: async a => {
      const format = R3D.modelFormat(a.file || ''); if (!format) throw new Error('the file must be .glb, .gltf or .obj');
      const props = a.props || {}; for (const p in props) if (!PROPS.model.includes(p)) throw new Error(`model layers have no "${p}"`);
      const blob = await (await fetch(a.src)).blob(), ids = await addAssets([new File([blob], a.file, { type: R3D.MODEL_TYPES[format] })]);
      if (!ids.length) throw new Error(`could not add ${a.file}`);
      addModelLayer(ids[0]); const L = cur(); if (a.name) L.name = String(a.name);
      for (const [p, v] of Object.entries(props)) L.p[p] = keyValue(p, v);
      return done(`added the model "${L.name}"`, { id: L.id });
    },
    add_image: async a => {
      const blob = await (await fetch(a.src)).blob();
      if (!blob.type.startsWith('image/')) throw new Error('that is not an image');
      const ids = await addAssets([new File([blob], a.file || 'image', { type: blob.type })]);
      if (!ids.length) throw new Error(`could not add ${a.file || 'the image'}`);
      addImageLayer(ids[0], a.x ?? undefined, a.y ?? undefined); const L = cur(); if (a.name) L.name = String(a.name);
      return done(`added the image "${L.name}"`, { id: L.id });
    },
    update_layer: a => {
      const L = findL(a), t = a.time != null ? +a.time : time, props = a.props || {};
      for (const [p, v] of Object.entries(props)) {
        checkProp(L, p);
        if (fixed(L, p)) throw new Error(`"${L.name}" has its ${FIX_NAME[FIX_OF[p]].toLowerCase()} locked: unlock it first (lock_${FIX_OF[p] === 'pos' ? 'position' : FIX_OF[p] === 'w' ? 'width' : 'height'}: false)`);
        if (p === 'name') { L.name = String(v); continue; }
        if (a.keyframe || L.keys[p]?.length) setKey(L, p, t, v, easeOK(a.ease) || 'easeInOut'); else L.p[p] = keyValue(p, v);
      }
      if (a.name) L.name = String(a.name);
      if (a.in !== undefined) L.in = a.in == null ? undefined : +a.in;
      if (a.out !== undefined) L.out = a.out == null ? undefined : +a.out;
      if (a.hidden != null) L.hidden = !!a.hidden; if (a.locked != null) L.locked = !!a.locked;
      for (const [arg, which] of [['lock_position', 'pos'], ['lock_width', 'w'], ['lock_height', 'h']])
        if (a[arg] != null && !!a[arg] !== !!L.fix?.[which]) { L.fix = { ...L.fix, [which]: !!a[arg] }; if (!Object.values(L.fix).some(Boolean)) delete L.fix; }
      if (a.blend) { const b = a.blend === 'normal' ? 'source-over' : a.blend; if (!BLENDS.some(x => x[0] === b)) throw new Error('unknown blend mode'); L.blend = b === 'source-over' ? undefined : b; }
      return done(`updated "${L.name}"`);
    },
    set_keyframes: a => {
      const L = findL(a); checkProp(L, a.prop); if (!ANIM.includes(a.prop)) throw new Error(`"${a.prop}" cannot be animated`);
      if (fixed(L, a.prop)) throw new Error(`"${L.name}" has its ${FIX_NAME[FIX_OF[a.prop]].toLowerCase()} locked: unlock it first`);
      if (a.replace) delete L.keys[a.prop];
      for (const k of a.keys || []) setKey(L, a.prop, Math.max(0, +k.t), k.v, easeOK(k.ease) || 'easeInOut');
      return done(`set ${(a.keys || []).length} keyframes on ${L.name}.${a.prop}`);
    },
    delete_keyframes: a => {
      const L = findL(a), props = a.prop ? [a.prop] : Object.keys(L.keys); let n = 0;
      for (const p of props) { const ks = L.keys[p] || [], keep = a.time == null ? [] : ks.filter(k => !near(k.t, +a.time));
        n += ks.length - keep.length; if (!keep.length && ks.length) { L.p[p] = val(L, p, a.time ?? time); delete L.keys[p]; } else L.keys[p] = keep; }
      return done(`deleted ${n} keyframes on ${L.name}`);
    },
    delete_layer: a => { const L = findL(a); S.layers = S.layers.filter(l => l !== L); if (sel === L.id) sel = null; return done(`deleted "${L.name}"`); },
    reorder_layer: a => { const L = findL(a); if (['front', 'back', 'up', 'down'].includes(a.to)) arrange(L, a.to);
      else { const i = S.layers.indexOf(L); S.layers.splice(i, 1); S.layers.splice(Math.max(0, Math.min(S.layers.length, +a.to)), 0, L); }
      return done(`moved "${L.name}"`); },
    apply_preset: a => { const L = findL(a), all = Object.assign({}, ...Object.values(PRESETS));
      if (!all[a.preset]) throw new Error(`Unknown preset. Valid: ${Object.keys(all).join(', ')}`);
      if (a.time != null) time = Math.max(0, Math.min(S.dur, +a.time)); applyPreset(L, a.preset); return { ok: true, message: `applied ${a.preset} to ${L.name}` }; },
    set_composition: a => {
      if (a.width || a.height) resizeComp(+a.width || S.w, +a.height || S.h, a.scale_content === false ? 'keep' : 'fit');
      if (a.background) S.bg = String(a.background); if (a.name) projectName = String(a.name);
      if (a.duration) setDuration(+a.duration); return done('updated the composition');
    },
    set_playhead: a => { seek(+a.time || 0); return { ok: true, time }; },
    select_layers: a => { setSelection((a.layers || []).map(x => findL({ id: x }).id)); refresh(true, false); return done(`selected ${selLayers().length} layer(s)`); },
    align_layers: a => {
      if (a.layers) setSelection(a.layers.map(x => findL({ id: x }).id));
      const how = String(a.how || 'center');
      if (how === 'center') centerOnCanvas('xy');
      else if (how === 'center_x' || how === 'center_y') centerOnCanvas(how.slice(-1));
      else if (how === 'distribute_x' || how === 'distribute_y') distribute(how.slice(-1));
      else if (ALIGN_NAMES[how]) alignLayer(how, a.relative_to === 'canvas');
      else throw new Error(`unknown "how": ${how}. Use center, center_x, center_y, left, right, top, bottom, hcenter, vcenter, distribute_x, distribute_y`);
      return done(`${how}: ${selLayers().map(l => l.name).join(', ')}`);
    },
    select_layer: a => { sel = a.id == null ? null : findL(a).id; refresh(true, false); return { ok: true }; },
    add_marker: a => { addMarker(+a.time); const m = S.markers.find(x => near(x.t, frame(+a.time))); if (m && a.label) m.label = String(a.label); refresh(); return { ok: true }; },
    // audio: tracks of clips. Clip and track ids come from get_project; a track can also be named or given as a 1-based number.
    add_audio: async a => {
      if (!a.src) throw new Error('pass an audio file');
      const T = a.track != null ? findTrack(a.track) : null;
      const c = await addSound(String(a.name || 'audio'), a.src, a.start != null ? +a.start : 0, T?.id);
      if (!c) throw new Error('could not decode that audio file');
      if (a.fade_in != null || a.fade_out != null) { c.fadeIn = +a.fade_in || 0; c.fadeOut = +a.fade_out || 0; clampFades(c); syncAudio(); }
      const [TT] = findClip(c.id);
      return done(`added ${S.sounds[c.sound].name} as clip ${c.id} on track "${TT.name}" (${TT.id}) at ${c.start}s, ${round(c.len)}s long`, { clip: c.id, track: TT.id });
    },
    update_audio_clip: a => {
      const [T, c] = findClip(String(a.clip)); if (!c) throw new Error(`no audio clip "${a.clip}". Clips: ${allClips().map(([, x]) => x.id).join(', ') || 'none'}`);
      const sd = soundDur(c);
      if (a.source_start != null) { const ni = Math.max(0, Math.min(sd - 1 / FPS, +a.source_start)); c.in = ni; c.len = Math.min(c.len, sd - ni); }
      if (a.start != null) c.start = Math.max(0, +a.start);
      if (a.length != null) c.len = Math.max(1 / FPS, Math.min(sd - c.in, +a.length));
      if (a.fade_in != null) c.fadeIn = Math.max(0, +a.fade_in);
      if (a.fade_out != null) c.fadeOut = Math.max(0, +a.fade_out);
      clampFades(c);
      if (a.track != null) { const NT = findTrack(a.track); if (NT !== T) { T.clips = T.clips.filter(x => x !== c); NT.clips.push(c); } }
      syncAudio(true);
      return done(`clip ${c.id}: ${round(c.start)}s to ${round(c.start + c.len)}s, fade in ${c.fadeIn}s, fade out ${c.fadeOut}s`);
    },
    split_audio: a => {
      if (a.time != null) time = Math.max(0, Math.min(S.dur, +a.time));
      if (a.clip != null && !findClip(String(a.clip))[1]) throw new Error(`no audio clip "${a.clip}"`);
      if (!splitAudio(a.clip != null ? String(a.clip) : null)) throw new Error('no audio clip under that time');
      return done(`split audio at ${round(time)}s`);
    },
    delete_audio_clip: a => { if (!findClip(String(a.clip))[1]) throw new Error(`no audio clip "${a.clip}"`); deleteClip(String(a.clip)); return done(`deleted clip ${a.clip}`); },
    set_audio_track: a => {
      const T = findTrack(a.track);
      if (a.delete) { S.audioTracks = tracks().filter(x => x !== T); syncAudio(); return done(`deleted track ${T.name}`); }
      if (a.name != null) T.name = String(a.name);
      if (a.volume != null) T.volume = Math.max(0, Math.min(1, +a.volume));
      if (a.muted != null) T.muted = !!a.muted;
      syncAudio(); return done(`track ${T.name}: volume ${T.volume ?? 1}${T.muted ? ', muted' : ''}`);
    },
    insert_time: a => {
      // open a gap: everything at or after `at` moves later by `seconds` (keyframes, layer starts/ends, markers);
      // layers that span `at` simply last longer, holding their values through the gap
      const at = +a.at, d = +a.seconds;
      if (!(at >= 0) || !(d > 0)) throw new Error('at must be >= 0 and seconds > 0');
      const e = 1e-6; let keys = 0, layers = 0;
      for (const L of S.layers) {
        for (const ks of Object.values(L.keys)) for (const k of ks) if (k.t >= at - e) { k.t = frame(k.t + d); keys++; }
        let moved = false;
        if (L.in != null && L.in >= at - e) { L.in = frame(L.in + d); moved = true; }
        if (L.out != null && L.out > at + e) { L.out = frame(L.out + d); moved = true; }
        if (moved) layers++;
      }
      for (const m of S.markers || []) if (m.t >= at - e) m.t = frame(m.t + d);
      for (const [, c] of allClips()) if (c.start >= at - e) c.start = frame(c.start + d);
      S.dur = +(S.dur + d).toFixed(3); refresh();
      return { ok: true, message: `inserted ${d}s at ${at}s: moved ${keys} keyframes and ${layers} layers; duration is now ${S.dur}s` };
    },
    undo: () => { undoRedo(-1); return { ok: true }; },
    redo: () => { undoRedo(1); return { ok: true }; },
    get_project_json: () => JSON.parse(JSON.stringify({ ...S, assets: Object.fromEntries(Object.entries(S.assets || {}).map(([id, a]) => [id, { ...a, src: undefined }])) })),
    new_project: a => { S = { w: +a.width || 1080, h: +a.height || 1080, bg: a.background || '#ffffff', dur: +a.duration || 5, layers: [], assets: {}, markers: [] };
      projectName = a.name || 'Untitled'; fileHandle = null; sel = null; selKey = null; time = 0; return done('started a new project'); },
  };

  let es = null, retry = 0;
  function connect() {
    es = new EventSource('/api/live/events');
    es.onopen = () => { retry = 0; $('#live').classList.add('on'); $('#live').title = 'Live link on: agents connected through the Riptide MCP server can see and edit this project'; };
    es.onerror = () => {
      $('#live').classList.remove('on'); $('#live').title = 'Live link offline (is server.py running?)';
      // the browser gives up for good on some failures (e.g. the server restarting); keep trying with backoff
      if (es.readyState === EventSource.CLOSED) { es.close(); setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++)); }
    };
    es.onmessage = async m => {
      const { id, op, args } = JSON.parse(m.data); let result;
      $('#live').classList.add('busy');
      try { if (!ops[op]) throw new Error(`Unknown operation "${op}"`); if (playing && op !== 'get_project') togglePlay(); result = await ops[op](args || {}); }
      catch (e) { result = { ok: false, error: e.message }; }
      $('#live').classList.remove('busy');
      fetch(`/api/live/result/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result ?? { ok: true }) });
    };
  }
  connect();
  addEventListener('focus', () => { if (es.readyState === EventSource.CLOSED) { retry = 0; connect(); } });
  return { ops };
})();

// ---------- start ----------
// collapsible inspector sections (remembered per section name)
const closedSecs = new Set();
document.addEventListener('click', e => { const h = e.target.closest('.sech'); if (!h || h.classList.contains('nocollapse')) return;
  const s = h.parentElement, k = h.textContent; s.classList.toggle('closed'); closedSecs[s.classList.contains('closed') ? 'add' : 'delete'](k); });
new MutationObserver(() => document.querySelectorAll('.sech').forEach(h => { if (closedSecs.has(h.textContent)) h.parentElement.classList.add('closed'); }))
  .observe($('#props'), { childList: true });
blank();
refresh(true, false); resetHistory(); setDirty(false);
