// Pixel work for finishing a layer: keying out a green (or any) screen, colour grading (white balance, exposure,
// levels and curves), and 3D LUTs from .cube files. Each runs over a layer's pixels after it is drawn, so it sees
// exactly what the layer shows, its effects included.
const Grade = (() => {
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hexRGB = c => /^#[0-9a-f]{6}$/i.test(c || '') ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : [0, 177, 64];

  // ---------- curves ----------
  // A curve is points [x, y] from 0 to 1, joined by a smooth line that never overshoots between two points
  // (monotone cubic), so a curve that only rises never dips.
  const IDENTITY = [[0, 0], [1, 1]];
  const isIdentity = pts => !pts || pts.length < 2 || pts.every(([x, y]) => Math.abs(x - y) < 1e-4);
  function curveTable(pts) {
    const T = new Float32Array(256);
    const P = (pts && pts.length >= 2 ? pts : IDENTITY).slice().sort((a, b) => a[0] - b[0]);
    const n = P.length, xs = P.map(p => p[0]), ys = P.map(p => p[1]), d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
    for (let v = 0, i = 0; v < 256; v++) {
      const x = v / 255; let y;
      if (x <= xs[0]) y = ys[0];
      else if (x >= xs[n - 1]) y = ys[n - 1];
      else {
        while (i < n - 2 && x > xs[i + 1]) i++;
        const h = xs[i + 1] - xs[i] || 1e-6, t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
        y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
      }
      T[v] = clamp(y, 0, 1);
    }
    return T;
  }
  // a curve at any x from 0 to 1, between its table's steps
  const sample = (T, x) => { const f = clamp(x, 0, 1) * 255, i = Math.min(254, f | 0); return T[i] + (T[i + 1] - T[i]) * (f - i); };

  // ---------- grading ----------
  const GRADE = ['temp', 'tint', 'expo', 'lvBlack', 'gamma', 'lvWhite', 'outBlack', 'outWhite'];
  const NEUTRAL = { temp: 0, tint: 0, expo: 0, lvBlack: 0, gamma: 1, lvWhite: 255, outBlack: 0, outWhite: 255 };
  const curvesOn = c => !!c && ['rgb', 'r', 'g', 'b'].some(k => !isIdentity(c[k]));
  // whether the grade changes anything: a layer left neutral is drawn straight, with no pixel work
  const graded = (o, curves) => GRADE.some(k => Math.abs((+o[k] || 0) - NEUTRAL[k]) > 1e-4 && o[k] != null) || curvesOn(curves);
  // The grade, as one table per channel: white balance and exposure, then levels, then the channel's own curve,
  // then the RGB curve. Built once per change, so grading a frame is three lookups a pixel.
  const tableCache = new Map();
  function tables(o, curves) {
    const key = GRADE.map(k => (+o[k] || 0).toFixed(3)).join(',') + JSON.stringify(curves || null);
    if (tableCache.has(key)) return tableCache.get(key);
    const ct = { rgb: curveTable(curves?.rgb), r: curveTable(curves?.r), g: curveTable(curves?.g), b: curveTable(curves?.b) };
    // warmer is more red and less blue; a positive tint is magenta (less green)
    const t = (+o.temp || 0) / 100, ti = (+o.tint || 0) / 100, ex = 2 ** (+o.expo || 0);
    const wb = [1 + t * .25, 1 - ti * .2, 1 - t * .25];
    const lb = clamp(+o.lvBlack || 0, 0, 254), lw = clamp(o.lvWhite ?? 255, lb + 1, 255), g = clamp(o.gamma ?? 1, .05, 10);
    const ob = clamp(+o.outBlack || 0, 0, 255), ow = clamp(o.outWhite ?? 255, 0, 255);
    const out = ['r', 'g', 'b'].map((ch, c) => {
      const T = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        let x = v * wb[c] * ex;
        x = clamp((x - lb) / (lw - lb), 0, 1) ** (1 / g);
        x = (ob + x * (ow - ob)) / 255;
        T[v] = Math.round(sample(ct.rgb, sample(ct[ch], x)) * 255);
      }
      return T;
    });
    if (tableCache.size > 64) tableCache.clear();
    tableCache.set(key, out); return out;
  }

  // ---------- 3D LUTs ----------
  // A .cube file: LUT_3D_SIZE N, then N³ lines of "r g b" with red changing fastest.
  function parseCube(text) {
    let size = 0, min = [0, 0, 0], max = [1, 1, 1]; const vals = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if (!line || line[0] === '#') continue;
      const parts = line.split(/\s+/), head = parts[0].toUpperCase();
      if (head === 'LUT_3D_SIZE') size = parseInt(parts[1], 10);
      else if (head === 'LUT_1D_SIZE') throw new Error('This is a 1D LUT. Riptide reads 3D LUTs (LUT_3D_SIZE).');
      else if (head === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number);
      else if (head === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number);
      else if (/^[-+.\d]/.test(parts[0]) && parts.length >= 3) vals.push(+parts[0], +parts[1], +parts[2]);
    }
    if (!(size >= 2 && size <= 129)) throw new Error('No LUT_3D_SIZE in this file, so it is not a 3D .cube LUT.');
    if (vals.length !== size ** 3 * 3) throw new Error(`The file has ${vals.length / 3} colours where a size ${size} LUT has ${size ** 3}.`);
    // stored as 0..1, whatever its domain; four decimals is far finer than 8-bit colour
    const data = vals.map((v, i) => Math.round(clamp((v - min[i % 3]) / ((max[i % 3] - min[i % 3]) || 1), 0, 1) * 1e4) / 1e4);
    return { size, data };
  }
  const lutArrays = new WeakMap();
  const lutArray = lut => { let a = lutArrays.get(lut); if (!a) { a = Float32Array.from(lut.data); lutArrays.set(lut, a); } return a; };

  // ---------- keying ----------
  // Pixels near the key colour, judged by colour alone (their brightness ignored, so a shadow on the screen keys
  // out too), go clear: fully within Tolerance, fading out over Softness. Spill takes the key's colour out of the
  // edges and reflections it left on the subject.
  function key(d, o) {
    const [kr, kg, kb] = hexRGB(o.keyColor);
    const kcb = -.168736 * kr - .331264 * kg + .5 * kb, kcr = .5 * kr - .418688 * kg - .081312 * kb;
    const thr = clamp(+o.keyTol || 0, 0, 100) * 1.4, soft = Math.max(1, clamp(+o.keySoft || 0, 0, 100) * 1.4);
    const dom = kr >= kg && kr >= kb ? 0 : kg >= kb ? 1 : 2, o1 = (dom + 1) % 3, o2 = (dom + 2) % 3;
    const spill = clamp(+o.spill || 0, 0, 100) / 100;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const cb = -.168736 * r - .331264 * g + .5 * b, cr = .5 * r - .418688 * g - .081312 * b;
      const a = clamp((Math.hypot(cb - kcb, cr - kcr) - thr) / soft, 0, 1);
      if (a < 1) d[i + 3] = d[i + 3] * a;
      if (spill) { const lim = Math.max(d[i + o1], d[i + o2]), v = d[i + dom]; if (v > lim) d[i + dom] = v - (v - lim) * spill; }
    }
  }

  // Everything, in order, over one layer's pixels: key, grade, LUT.
  function apply(d, o, curves, lut) {
    if (o.chroma) key(d, o);
    if (graded(o, curves)) {
      const [R, G, B] = tables(o, curves);
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; d[i] = R[d[i]]; d[i + 1] = G[d[i + 1]]; d[i + 2] = B[d[i + 2]]; }
    }
    const mix = clamp((o.lutMix ?? 100) / 100, 0, 1);
    if (lut && mix > 0) {
      const N = lut.size, L = lutArray(lut), s = (N - 1) / 255, N2 = N * N;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const fr = d[i] * s, fg = d[i + 1] * s, fb = d[i + 2] * s;
        const r0 = Math.min(N - 2, fr | 0), g0 = Math.min(N - 2, fg | 0), b0 = Math.min(N - 2, fb | 0);
        const dr = fr - r0, dg = fg - g0, db = fb - b0;
        // the eight corners of the cell the colour falls in
        const p000 = (r0 + g0 * N + b0 * N2) * 3, p100 = p000 + 3, p010 = p000 + N * 3, p110 = p010 + 3;
        const p001 = p000 + N2 * 3, p101 = p001 + 3, p011 = p001 + N * 3, p111 = p011 + 3;
        for (let c = 0; c < 3; c++) {
          const c00 = L[p000 + c] + (L[p100 + c] - L[p000 + c]) * dr, c10 = L[p010 + c] + (L[p110 + c] - L[p010 + c]) * dr;
          const c01 = L[p001 + c] + (L[p101 + c] - L[p001 + c]) * dr, c11 = L[p011 + c] + (L[p111 + c] - L[p011 + c]) * dr;
          const lo = c00 + (c10 - c00) * dg, hi = c01 + (c11 - c01) * dg, v = (lo + (hi - lo) * db) * 255;
          d[i + c] = d[i + c] + (v - d[i + c]) * mix;
        }
      }
    }
  }

  return { GRADE, NEUTRAL, IDENTITY, graded, curvesOn, isIdentity, curveTable, sample, parseCube, apply, key, tables };
})();
