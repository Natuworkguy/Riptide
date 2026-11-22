// ---------- Scopes: the picture's levels and colours, measured ----------
// What a colourist grades by, as the frame plays: Waveform (how bright the picture is, across it from left to
// right: blacks at the bottom, whites at the top, so crushed blacks and clipped whites show as flat lines), Parade
// (the same for red, green and blue side by side, to see a colour cast), Vectorscope (which hues are in it and how
// strongly, round the circle: the skin-tone line marks where faces belong) and Histogram (how much of the picture
// sits at each brightness). Shift+S, or Scopes in the command palette.
const Scopes = (() => {
  const KINDS = [['wave', 'Waveform'], ['parade', 'Parade'], ['vector', 'Vectorscope'], ['hist', 'Histogram']];
  let on = false, kind = 'wave';
  try { kind = localStorage.getItem('riptide.scope') || 'wave'; } catch {}
  const box = document.createElement('div'); box.id = 'scopes'; box.hidden = true;
  box.innerHTML = `<div class="sc-tabs">${KINDS.map(([k, n]) => `<button data-k="${k}">${n}</button>`).join('')}<button class="sc-x" title="Close (Shift+S)">×</button></div><canvas width="320" height="180"></canvas>`;
  document.getElementById('stage').appendChild(box);
  const out = box.querySelector('canvas'), g = out.getContext('2d');
  const tabs = () => box.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === kind));
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('sc-x')) return toggle(false);
    kind = b.dataset.k; try { localStorage.setItem('riptide.scope', kind); } catch {} tabs(); draw();
  });
  const small = document.createElement('canvas'), sg = small.getContext('2d', { willReadFrequently: true });

  function toggle(v) { on = v ?? !on; box.hidden = !on; if (on) { tabs(); draw(); } status(on ? 'Scopes on' : 'Scopes off'); }

  // a quarter of a second at most between measurements while it plays
  let lastAt = 0, waiting = false;
  function soon() {
    if (!on || waiting) return;
    const wait = Math.max(0, 120 - (performance.now() - lastAt)); waiting = true;
    setTimeout(() => { waiting = false; lastAt = performance.now(); draw(); }, wait);
  }

  function draw() {
    if (!on || typeof cv === 'undefined') return;
    const W = 240, H = Math.max(1, Math.round(W * cv.height / cv.width));
    small.width = W; small.height = H; sg.drawImage(cv, 0, 0, W, H);
    const d = sg.getImageData(0, 0, W, H).data, ow = out.width, oh = out.height;
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, ow, oh);
    const img = g.getImageData(0, 0, ow, oh), px = img.data;
    const add = (x, y, r, gg, b) => { if (x < 0 || y < 0 || x >= ow || y >= oh) return; const i = ((y | 0) * ow + (x | 0)) * 4;
      px[i] = Math.min(255, px[i] + r); px[i + 1] = Math.min(255, px[i + 1] + gg); px[i + 2] = Math.min(255, px[i + 2] + b); };
    const k = 40;     // how much each sample lights the trace
    if (kind === 'wave' || kind === 'parade') {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, r = d[i], gr = d[i + 1], b = d[i + 2];
        if (kind === 'wave') { const l = .2126 * r + .7152 * gr + .0722 * b; add(x / W * ow, (1 - l / 255) * (oh - 1), k * .8, k, k * .7); }
        else { const third = ow / 3, xx = x / W * third;
          add(xx, (1 - r / 255) * (oh - 1), k, 0, 0); add(third + xx, (1 - gr / 255) * (oh - 1), 0, k, 0); add(2 * third + xx, (1 - b / 255) * (oh - 1), 0, k * .4, k); }
      }
    } else if (kind === 'vector') {
      const cx = ow / 2, cy = oh / 2, R = oh / 2 - 6;
      for (let i = 0; i < d.length; i += 8) {
        const r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
        const cb = -.1146 * r - .3854 * gr + .5 * b, cr = .5 * r - .4542 * gr - .0458 * b;
        add(cx + cb * 2 * R, cy - cr * 2 * R, d[i] * .25 + 8, d[i + 1] * .25 + 8, d[i + 2] * .25 + 8);
      }
    } else {
      const bins = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
      for (let i = 0; i < d.length; i += 4) { bins[0][d[i]]++; bins[1][d[i + 1]]++; bins[2][d[i + 2]]++; }
      const most = Math.max(...bins.map(b => Math.max(...b.slice(1, 255)))) || 1;
      for (let c = 0; c < 3; c++) for (let v = 0; v < 256; v++) {
        const h = Math.min(1, bins[c][v] / most) * (oh - 4), x = v / 255 * (ow - 1);
        for (let y = 0; y < h; y++) add(x, oh - 1 - y, c === 0 ? 70 : 0, c === 1 ? 70 : 0, c === 2 ? 90 : 0);
      }
    }
    g.putImageData(img, 0, 0);
    // the scales
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.fillStyle = 'rgba(255,255,255,.4)'; g.font = '9px system-ui'; g.lineWidth = 1;
    if (kind === 'wave' || kind === 'parade') {
      for (const v of [0, 25, 50, 75, 100]) { const y = Math.round((1 - v / 100) * (oh - 1)) + .5; g.beginPath(); g.moveTo(0, y); g.lineTo(ow, y); g.stroke(); g.fillText(String(v), 2, Math.max(9, y - 2)); }
    } else if (kind === 'vector') {
      const cx = ow / 2, cy = oh / 2, R = oh / 2 - 6;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, R / 2, 0, Math.PI * 2); g.stroke();
      // the six colour targets, and the line skin falls on
      for (const [n, r, gr, b] of [['R', 1, 0, 0], ['Y', 1, 1, 0], ['G', 0, 1, 0], ['C', 0, 1, 1], ['B', 0, 0, 1], ['M', 1, 0, 1]]) {
        const cb = -.1146 * r - .3854 * gr + .5 * b, cr = .5 * r - .4542 * gr - .0458 * b; g.fillText(n, cx + cb * 2 * R * .75 - 3, cy - cr * 2 * R * .75 + 3); }
      const a = 123 * Math.PI / 180; g.strokeStyle = 'rgba(255,190,150,.35)'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R); g.stroke();
    }
  }

  // measured again whenever the picture is drawn
  const drawn = render;
  // eslint-disable-next-line no-global-assign
  render = function (...a) { const r = drawn.apply(this, a); soon(); return r; };
  return { toggle, draw, get on() { return on; }, set kind(k) { kind = k; tabs(); draw(); } };
})();
