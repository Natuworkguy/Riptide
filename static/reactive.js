// Music-reactive layers: any number a layer has (scale, rotation, blur, brightness...) can follow the music.
//
// A link says what to follow and how much: L.react = [{ prop, band, amount, source, smooth }].
//   band   'level' (how loud), 'bass', 'mids', 'treble', or a part of the song: 'kick', 'snare', 'hats', 'vocals'.
//          The drum parts are hits, sharp at the hit and dying away; the rest rise and fall with the sound.
//   source 'mix' (every track playing), or a track's id: import real stems as tracks of their own (the drums, the
//          bass, the vocals...) and each layer can follow one, exactly. Without stems, kick, snare, hats and vocals are
//          heard in the mix: the kick in the lows, the snare's crack in the low mids and its rattle up high, the hats
//          at the very top, and the vocals in the middle of the stereo picture, where a mix puts them.
//   amount added to the property when the band is at its loudest (0.2 on scale is 20% bigger).
//   smooth how long, in milliseconds, it takes to fall back, so it glides instead of flickering.
// The music is listened to once and remembered, so playing, scrubbing and exporting give the same frames.
const Reactive = (() => {
  const SR = 22050, RATE = 60;           // samples a second listened at, and values a second kept
  const BANDS = [['level', 'Level (loudness)'], ['bass', 'Bass'], ['mids', 'Mids'], ['treble', 'Treble'],
    ['kick', 'Kick'], ['snare', 'Snare'], ['hats', 'Hi-hats'], ['vocals', 'Vocals']];
  const HITS = new Set(['kick', 'snare', 'hats']);
  const cache = new Map();               // signature -> { ready, bands: {name: Float32Array} } or a promise
  let busy = null;

  // ---------- listening ----------
  // a biquad filter (RBJ cookbook), run over the samples in place of a copy
  function biquad(x, type, f, q = 0.707) {
    const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; }                        // band-pass
    a0 = 1 + a; a1 = -2 * c; a2 = 1 - a;
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  const chain = (x, ...steps) => steps.reduce((v, [t, f, q]) => biquad(v, t, f, q), x);
  // loudness, RATE times a second
  function envelope(x) {
    const hop = SR / RATE, n = Math.ceil(x.length / hop), e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, k = 0; for (let j = Math.floor(i * hop); j < Math.min(x.length, Math.floor((i + 1) * hop)); j++, k++) s += x[j] * x[j]; e[i] = Math.sqrt(s / Math.max(1, k)); }
    return e;
  }
  // 0 to 1, the loudest bits (all but the top 2%) at 1, so a quiet song moves as much as a loud one
  function normal(e) {
    const sorted = Float32Array.from(e).sort(), top = sorted[Math.floor(sorted.length * .98)] || 1e-9, floor = sorted[Math.floor(sorted.length * .05)] || 0;
    const out = new Float32Array(e.length);
    for (let i = 0; i < e.length; i++) out[i] = Math.max(0, Math.min(1, (e[i] - floor) / Math.max(1e-9, top - floor)));
    return out;
  }
  // hits: each sharp rise in a band, standing out from the second around it, as a jolt to 1 that dies away
  const rises = e => { const r = new Float32Array(e.length); for (let i = 1; i < e.length; i++) r[i] = Math.max(0, Math.log(1e-6 + e[i]) - Math.log(1e-6 + e[i - 1])); return r; };
  function hits(e, decay = .12, given = null) {
    const n = e.length, rise = given || rises(e), out = new Float32Array(n), W = RATE;
    let level = 0, last = -1e9;
    const k = Math.exp(-1 / (RATE * decay));
    for (let i = 0; i < n; i++) {
      let sum = 0, sq = 0, m = 0;
      for (let j = Math.max(0, i - W); j < Math.min(n, i + W); j += 2) { sum += rise[j]; sq += rise[j] * rise[j]; m++; }
      const mean = sum / m, sd = Math.sqrt(Math.max(0, sq / m - mean * mean));
      const isHit = rise[i] > mean + 1.5 * sd && rise[i] > .35 && rise[i] >= rise[i - 1 || 0] && rise[i] >= (rise[i + 1] ?? 0) && i - last > RATE * .08;
      level *= k;
      if (isHit) { level = 1; last = i; }
      out[i] = level;
    }
    return out;
  }

  // the music, mixed down: every unmuted clip, or one track's, with its fades and volume
  async function mixdown(source) {
    const len = Math.max(1, Math.ceil(S.dur * SR)), ctx = new OfflineAudioContext(2, len, SR); let any = false;
    for (const [T, c] of allClips()) {
      if (!SND[c.sound] || (source === 'mix' ? T.muted : T.id !== source)) continue;
      const a = Math.max(0, c.start), b = Math.min(c.start + c.len, S.dur); if (b - a < 1e-3) continue;
      const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = await decodeSound(c.sound);
      src.connect(g).connect(ctx.destination);
      const vol = Math.max(0, Math.min(1, T.volume ?? 1)), n = Math.max(2, Math.ceil((b - a) * 100) + 1), curve = new Float32Array(n);
      for (let k = 0; k < n; k++) curve[k] = vol * clipGain(c, a - c.start + (b - a) * k / (n - 1));
      g.gain.setValueCurveAtTime(curve, a, b - a);
      src.start(a, c.in + (a - c.start), b - a); any = true;
    }
    if (!any) return null;
    const out = await ctx.startRendering();
    return [out.getChannelData(0), out.numberOfChannels > 1 ? out.getChannelData(1) : out.getChannelData(0)];
  }

  async function analyse(source) {
    const lr = await mixdown(source);
    if (!lr) return null;
    const [L, R] = lr, n = L.length, mid = new Float32Array(n), side = new Float32Array(n);
    for (let i = 0; i < n; i++) { mid[i] = (L[i] + R[i]) / 2; side[i] = (L[i] - R[i]) / 2; }
    const bands = {};
    bands.level = normal(envelope(mid));
    bands.bass = normal(envelope(chain(mid, ['lp', 150], ['lp', 150])));
    bands.mids = normal(envelope(chain(mid, ['hp', 300], ['lp', 2000])));
    bands.treble = normal(envelope(chain(mid, ['hp', 4000], ['hp', 4000])));
    // Drum hits, told apart by the shape of what jumps at the hit, each band against its own usual loudness: a kick
    // is the lows, a snare a crack in the upper mids with a knock under it, a hat the very top and little else.
    const low = envelope(chain(mid, ['lp', 110], ['lp', 110], ['hp', 35])), knock = envelope(chain(mid, ['bp', 200, 1.4]));
    const crack = envelope(chain(mid, ['hp', 1200], ['lp', 5000], ['lp', 5000])), top = envelope(chain(mid, ['hp', 9000], ['hp', 9000]));
    const jump = e => { const sorted = Float32Array.from(e).sort(), ref = sorted[Math.floor(sorted.length * .95)] || 1e-9, d = new Float32Array(e.length);
      for (let i = 2; i < e.length; i++) d[i] = Math.max(0, e[i] - Math.min(e[i - 1], e[i - 2])) / ref; return d; };
    const dl = jump(low), dk = jump(knock), dc = jump(crack), dt = jump(top), frames = dl.length;
    const kick = new Float32Array(frames), snare = new Float32Array(frames), hat = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      kick[i] = dl[i] * (dl[i] > dc[i] ? 1 : .5);
      snare[i] = Math.min(dc[i], dk[i] * 2) * (dc[i] > .3 * dt[i] ? 1 : .2);
      hat[i] = dt[i] * (dc[i] < .5 * dt[i] ? 1 : .25);
    }
    bands.kick = hits(low, .14, kick);
    bands.snare = hits(crack, .12, snare);
    bands.hats = hits(top, .06, hat);
    // vocals sit in the middle of the stereo picture: the voice band of the middle, less what is out to the sides
    const v = envelope(chain(mid, ['hp', 250], ['lp', 3500])), s = envelope(chain(side, ['hp', 250], ['lp', 3500]));
    const voc = new Float32Array(v.length); for (let i = 0; i < v.length; i++) voc[i] = Math.max(0, v[i] - 1.1 * s[i]);
    bands.vocals = normal(voc);
    return bands;
  }

  const sourceSig = source => JSON.stringify([S.dur, source, tracks().map(T => [T.id, T.muted, T.volume,
    T.clips.map(c => [c.sound, c.start, c.in, c.len, c.fadeIn, c.fadeOut])])]);

  // The bands of SOURCE, if they have been worked out; starts working them out otherwise.
  function bandsOf(source) {
    const sig = sourceSig(source), had = cache.get(sig);
    if (had && had.bands !== undefined) return had.bands;
    if (!had) {
      const job = { bands: undefined };
      cache.set(sig, job);
      job.promise = (async () => {
        try { job.bands = await analyse(source); } catch (e) { console.error('reactive', e); job.bands = null; }
        if (typeof refresh === 'function') { try { render(); renderPropsValues(); } catch { /* not drawn yet */ } }
      })();
    }
    return undefined;
  }

  // ---------- applying ----------
  const smoothCache = new Map();
  // a band, eased: rises at once, falls back over SMOOTH ms
  function eased(bands, band, smooth, key) {
    const raw = bands[band]; if (!raw) return null;
    const ms = Math.max(0, +smooth || 0); if (!ms) return raw;
    const k = `${key}|${band}|${ms}`;
    let out = smoothCache.get(k);
    if (out && out.raw === raw) return out.v;
    const v = new Float32Array(raw.length), f = Math.exp(-1000 / (RATE * ms)); let level = 0;
    for (let i = 0; i < raw.length; i++) { level = Math.max(raw[i], level * f); v[i] = level; }
    smoothCache.set(k, { raw, v }); return v;
  }
  const valueAt = (series, t) => {
    const x = Math.max(0, t * RATE), i = Math.floor(x), f = x - i;
    if (i >= series.length - 1) return series[series.length - 1] || 0;
    return series[i] * (1 - f) + series[i + 1] * f;
  };

  function apply(L, t, o) {
    if (!L.react?.length) return o;
    for (const r of L.react) {
      if (!r.prop || !(r.prop in o) || typeof o[r.prop] !== 'number') continue;
      const source = r.source && r.source !== 'mix' && tracks().some(T => T.id === r.source) ? r.source : 'mix';
      const bands = bandsOf(source); if (!bands) continue;
      const series = eased(bands, r.band || 'level', r.smooth ?? (HITS.has(r.band) ? 0 : 80), source); if (!series) continue;
      o[r.prop] += (+r.amount || 0) * valueAt(series, t);
    }
    return o;
  }

  // everything every link needs, listened to: for export, so no frame goes out before the music is heard
  async function ready() {
    const sources = new Set(S.layers.flatMap(L => (L.react || []).map(r => r.source && r.source !== 'mix' ? r.source : 'mix')));
    for (const s of sources) { bandsOf(s); const job = cache.get(sourceSig(s)); if (job?.promise) await job.promise; }
  }

  // ---------- the Design panel ----------
  const numeric = L => (PROPS[L.type] || []).filter(p => ANIM.includes(p) && !COLORS.includes(p));
  const sourceName = id => id && id !== 'mix' ? (tracks().find(T => T.id === id)?.name || 'a track') : 'The mix';
  function panelHTML(L) {
    if (L.type === 'camera') return '';
    const rows = (L.react || []).map((r, i) => `<div class="react-row" data-react="${i}">
        <button class="selectbtn" data-rmenu="prop" title="What moves"><span>${esc(LABEL[r.prop] || r.prop)}</span>${ICON.chev}</button>
        <button class="selectbtn" data-rmenu="band" title="What it follows"><span>${(BANDS.find(b => b[0] === r.band) || BANDS[0])[1]}</span>${ICON.chev}</button>
        <button class="selectbtn" data-rmenu="source" title="Which audio: the whole mix, or one track (a stem)"><span>${esc(sourceName(r.source))}</span>${ICON.chev}</button>
        <label class="rnum"><em>Amount</em><input data-ramount value="${fmt(r.amount)}" inputmode="decimal"></label>
        <label class="rnum"><em>Ease ms</em><input data-rsmooth value="${fmt(r.smooth ?? 0)}" inputmode="decimal"></label>
        <button class="ib" data-rdel title="Stop following the music">${ICON.trash}</button></div>`).join('');
    const none = !hasAudio();
    return `<div class="sec"><div class="sech">Music</div>${rows}
      <div class="btnrow wide"><button class="tb small" data-radd>+ Follow the music</button></div>
      <p class="note">${none ? 'Add some music to the timeline first. ' : ''}Make anything move with the song: scale to the kick, brightness to the hats, a glow to the vocals. Import stems as tracks of their own to follow one exactly.</p></div>`;
  }
  const PICK = { scale: ['kick', .15], y: ['bass', -30], rotation: ['snare', 6], bright: ['hats', 40], shadow: ['vocals', 30], opacity: ['level', -.3], blur: ['bass', 6] };
  function add(L, prop, band, amount, source = 'mix', smooth) {
    const r = { prop, band, amount, source };
    r.smooth = smooth ?? (HITS.has(band) ? 0 : 80);
    (L.react ||= []).push(r);
    return r;
  }

  function wire() {
    const Pn = $('#props');
    Pn.addEventListener('click', e => {
      const b = e.target.closest('button'); const L = cur(); if (!b || !L) return;
      if (b.dataset.radd !== undefined) {
        const have = new Set((L.react || []).map(r => r.prop)), list = numeric(L);
        const prop = ['scale', 'y', 'rotation', 'bright', 'shadow', 'blur', 'opacity'].find(p => list.includes(p) && !have.has(p)) || list[0];
        const [band, amount] = PICK[prop] || ['level', 10];
        add(L, prop, band, amount); refresh(); status(`${L.name}: ${LABEL[prop] || prop} follows the ${band}`);
        return;
      }
      const row = b.closest('[data-react]'); if (!row) return;
      const r = L.react[+row.dataset.react];
      if (b.dataset.rdel !== undefined) { L.react.splice(+row.dataset.react, 1); if (!L.react.length) delete L.react; refresh(); return; }
      if (b.dataset.rmenu === 'prop') UI.menu(b, numeric(L).map(p => ({ value: p, label: LABEL[p] || p })), r.prop, v => { r.prop = v; refresh(); });
      if (b.dataset.rmenu === 'band') UI.menu(b, BANDS.map(([value, label]) => ({ value, label })), r.band, v => { r.band = v; if (HITS.has(v) && !r.smooth) r.smooth = 0; refresh(); });
      if (b.dataset.rmenu === 'source') UI.menu(b, [{ value: 'mix', label: 'The mix' }, ...tracks().map(T => ({ value: T.id, label: `${T.name} (stem)` }))], r.source || 'mix', v => { r.source = v; refresh(); });
    });
    Pn.addEventListener('input', e => {
      const L = cur(), row = e.target.closest?.('[data-react]'); if (!L || !row) return;
      const r = L.react[+row.dataset.react], v = parseFloat(e.target.value); if (isNaN(v)) return;
      if (e.target.dataset.ramount !== undefined) r.amount = v;
      if (e.target.dataset.rsmooth !== undefined) r.smooth = Math.max(0, v);
      render();
    });
  }

  return { BANDS, apply, ready, panelHTML, wire, add, bandsOf, forget() { cache.clear(); smoothCache.clear(); } };
})();
Reactive.wire();
