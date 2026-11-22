// ---------- Cutting: the editor's own chores, done for you ----------
// Remove pauses listens to a clip's own sound and takes out the stretches where nobody says anything, closing the
// gaps, so a talking-head take is tight in one go. Split at scene cuts looks for the places the picture changes all
// at once, where one shot was cut to the next in a clip that came already edited, and splits it there, so each shot
// is a layer of its own to move, trim or drop. Ripple delete (Shift+⌫) takes a layer out and slides everything after
// it back to close the hole. J, K and L shuttle as in every editor: L plays, faster each press; J the same backwards;
// K stops.
const Cutter = (() => {
  // ----- the sound of a clip, as loudness 100 times a second -----
  const LOUD = new Map();
  function loudness(src) {
    if (LOUD.has(src)) return LOUD.get(src);
    const p = (async () => {
      const buf = await (await fetch(src)).arrayBuffer();
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      let au; try { au = await ac.decodeAudioData(buf); } finally { ac.close(); }
      const rate = 100, n = Math.floor(au.duration * rate), hop = au.sampleRate / rate, db = new Float32Array(n);
      const chans = Array.from({ length: au.numberOfChannels }, (_, c) => au.getChannelData(c));
      for (let i = 0; i < n; i++) {
        let s = 0, k = 0; const a = Math.floor(i * hop), b = Math.min(chans[0].length, Math.floor((i + 1) * hop));
        for (let j = a; j < b; j += 2) { let v = 0; for (const ch of chans) v += ch[j]; v /= chans.length; s += v * v; k++; }
        db[i] = 10 * Math.log10(s / Math.max(1, k) + 1e-10);
      }
      return { db, rate, duration: au.duration };
    })();
    LOUD.set(src, p); p.catch(() => LOUD.delete(src)); return p;
  }
  const srcOf = L => VURL[L.p.asset];
  const plain = L => L.type === 'video' && !L.p.reverse && !L.keys.speed?.length && (L.p.speed ?? 100) === 100;

  // the quiet stretches in the source between A and B seconds: below FLOOR dB (or, by default, well under the take's
  // own speaking level), at least LONGEST seconds long; each shortened by PAD at both ends, so words keep their breath
  function quietSpans(loud, a, b, { floor = null, longest = .45, pad = .12 } = {}) {
    const { db, rate } = loud, i0 = Math.max(0, Math.floor(a * rate)), i1 = Math.min(db.length, Math.ceil(b * rate));
    const part = Array.from(db.slice(i0, i1)).sort((x, y) => x - y);
    // the level people talk at: the loud end of the take; quiet is a long way under it, and never above -30 dB
    const talk = part[Math.floor(part.length * .9)] ?? -20, cut = floor ?? Math.min(-30, talk - 24);
    // smoothed over a twentieth of a second, so the gaps between syllables do not count
    const sm = i => { let s = 0, k = 0; for (let j = Math.max(i0, i - 2); j <= Math.min(i1 - 1, i + 2); j++) { s += db[j]; k++; } return s / k; };
    const out = []; let start = -1;
    for (let i = i0; i <= i1; i++) {
      const q = i < i1 && sm(i) < cut;
      if (q && start < 0) start = i;
      if (!q && start >= 0) { const s = start / rate, e = i / rate; if (e - s >= longest) out.push([s + pad, e - pad]); start = -1; }
    }
    return { spans: out, cut };
  }

  // ----- Remove pauses -----
  async function removePauses(L, opts = {}) {
    if (L.type !== 'video') throw new Error('Video clips only');
    if (!plain(L)) throw new Error('Set the clip back to 100% and forwards first: pauses are found in its own time');
    const loud = await loudness(srcOf(L)), v = L.p.vin || 0, t0 = lin(L), t1 = lout(L), a = v, b = v + (t1 - t0);
    const { spans } = quietSpans(loud, a, b, opts);
    if (!spans.length) return { removed: 0, cuts: 0, layers: [L.id] };
    // what is kept, in the source's own time
    const keep = []; let at = a;
    for (const [s, e] of spans) { if (s > at + .05) keep.push([at, s]); at = e; }
    if (b > at + .05) keep.push([at, b]);
    const removed = (b - a) - keep.reduce((n, [s, e]) => n + e - s, 0);
    // the clip laid back to back from where it started; the first piece is the layer itself
    const made = []; let tl = t0; const idx = S.layers.indexOf(L);
    keep.forEach(([s, e], i) => {
      const P = i ? JSON.parse(JSON.stringify(L)) : L;
      if (i) { P.id = uid++; P.name = `${L.name} (${i + 1})`; P.tin = null; }
      if (i < keep.length - 1) P.tout = null;
      P.p.vin = s; P.in = tl; P.out = tl + (e - s); tl = P.out; made.push(P);
    });
    S.layers.splice(idx + 1, 0, ...made.slice(1));
    // what came after the clip moves up to close the gap, the music's clips too, when asked to
    if (opts.ripple !== false) shiftAfter(t1, -removed, new Set(made.map(m => m.id)));
    sel = L.id; refresh();
    return { removed: Math.round(removed * 100) / 100, cuts: spans.length, layers: made.map(m => m.id) };
  }

  // everything that starts at or after T moves by D seconds (and the video gets shorter with it, when it shrinks)
  function shiftAfter(T, D, skip = new Set()) {
    for (const X of S.layers) {
      if (skip.has(X.id) || lin(X) < T - 1e-3) continue;
      const len = lout(X) - lin(X); X.in = lin(X) + D; X.out = X.in + len;
      for (const ks of Object.values(X.keys)) for (const k of ks) k.t += D;
    }
    for (const T2 of (typeof tracks === 'function' ? tracks() : [])) for (const c of T2.clips || []) if (c.start >= T - 1e-3) c.start += D;
  }

  // ----- Split at scene cuts -----
  // the clip is played through at a few frames a second, small; where a frame's colours differ from the one before
  // far more than they usually do from one frame to the next, a shot ended
  async function findCuts(L, { every = 1 / 8, strength = 1 } = {}) {
    if (L.type !== 'video') throw new Error('Video clips only');
    const vid = document.createElement('video'); vid.muted = true; vid.src = srcOf(L); vid.crossOrigin = 'anonymous';
    await new Promise((ok, no) => { vid.onloadeddata = ok; vid.onerror = () => no(new Error('The clip would not load')); });
    const c = document.createElement('canvas'); c.width = 48; c.height = 27; const g = c.getContext('2d', { willReadFrequently: true });
    const v = L.p.vin || 0, len = Math.min(vid.duration - v, played(L, lout(L)));
    const hist = () => { g.drawImage(vid, 0, 0, 48, 27); const d = g.getImageData(0, 0, 48, 27).data, h = new Float32Array(48);
      for (let i = 0; i < d.length; i += 4) { h[d[i] >> 4]++; h[16 + (d[i + 1] >> 4)]++; h[32 + (d[i + 2] >> 4)]++; } return h; };
    const seekTo = s => new Promise(ok => { vid.onseeked = ok; vid.currentTime = s; });
    const diffs = []; let prev = null;
    for (let s = 0; s <= len; s += every) {
      await seekTo(v + s); const h = hist();
      if (prev) { let d = 0; for (let i = 0; i < 48; i++) d += Math.abs(h[i] - prev[i]); diffs.push([s, d / (48 * 27 * 3 * 2)]); }
      prev = h;
    }
    vid.removeAttribute('src'); vid.load();
    const sorted = diffs.map(x => x[1]).sort((a, b) => a - b), usual = sorted[Math.floor(sorted.length / 2)] || 0;
    const line = Math.max(.25, usual * 6) / strength;
    const cuts = [];
    diffs.forEach(([s, d], i) => {
      const peak = d >= (diffs[i - 1]?.[1] ?? 0) && d >= (diffs[i + 1]?.[1] ?? 0);
      if (d > line && peak && (!cuts.length || s - cuts[cuts.length - 1] > .5)) cuts.push(s);
    });
    return cuts;                // in the clip's own seconds from Source in, at the frame after the change
  }
  async function splitAtCuts(L, opts) {
    if (!plain(L)) throw new Error('Set the clip back to 100% and forwards first');
    const cuts = await findCuts(L, opts), t0 = lin(L), was = time; let cur = L; const ids = [L.id];
    for (const s of cuts) {
      const at = t0 + s; if (at <= lin(cur) + .05 || at >= lout(cur) - .05) continue;
      sel = cur.id; time = at; splitLayer(); cur = S.layers.find(x => x.id === sel); ids.push(cur.id);
    }
    if (ids.length > 1) ids.forEach((id, i) => { const X = S.layers.find(x => x.id === id); X.name = `${L.name.replace(/ shot \d+$/, '')} shot ${i + 1}`; });
    time = was; refresh();
    return { cuts: cuts.map(s => Math.round((t0 + s) * 100) / 100), layers: ids };
  }

  // ----- Ripple delete -----
  function rippleDelete() {
    const ls = selLayers(); if (!ls.length) return;
    const a = Math.min(...ls.map(lin)), b = Math.max(...ls.map(lout)), ids = new Set(ls.map(l => l.id));
    // only when nothing else plays over the hole: otherwise it is a plain delete
    const covered = S.layers.some(X => !ids.has(X.id) && lin(X) < b - 1e-3 && lout(X) > a + 1e-3 && X.type !== 'world' && X.type !== 'adjust');
    removeLayer();
    if (covered) return status('Deleted (something else plays there, so nothing moved up)');
    shiftAfter(b, -(b - a)); refresh(); status(`Deleted and closed the ${fmtTime(b - a)} gap`);
  }

  // ----- J K L -----
  let shuttle = 0, sh = null, lastT = 0;
  function run(now) {
    if (!shuttle) { sh = null; return; }
    const dt = (now - lastT) / 1000; lastT = now;
    const t = time + dt * shuttle;
    if (t <= 0 || t >= S.dur) { shuttle = 0; seek(Math.max(0, Math.min(S.dur, t))); sh = null; return status('Stopped'); }
    seek(t); sh = requestAnimationFrame(run);
  }
  function shuttleTo(dir) {
    if (dir === 0) { if (playing) togglePlay(); shuttle = 0; return status('Stopped'); }
    const speeds = [1, 2, 4, 8];
    if (dir > 0 && !shuttle && !playing) { togglePlay(); return; }        // L: plain play first, with its sound
    let now = playing ? 1 : shuttle;
    if (playing) togglePlay();
    if (Math.sign(now) !== dir) now = 0;
    const next = speeds[Math.min(speeds.length - 1, speeds.indexOf(Math.abs(now)) + 1)] * dir;
    shuttle = next; status(`${dir > 0 ? 'Forwards' : 'Backwards'} ×${Math.abs(next)}`);
    if (!sh) { lastT = performance.now(); sh = requestAnimationFrame(run); }
  }
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.modal-wrap, .palette, .pop')) return;
    if (e.key === 'Backspace' && e.shiftKey || e.key === 'Delete' && e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); rippleDelete(); return; }
    if (S.mode === 'image') return;
    const k = e.key.toLowerCase();
    if (k === 'j' || k === 'l' || k === 'k') {
      if (k === 'k' && !shuttle && !playing) return;     // K with nothing playing is keyframing, as before
      e.preventDefault(); e.stopImmediatePropagation(); shuttleTo(k === 'l' ? 1 : k === 'j' ? -1 : 0);
    }
  }, true);

  // ----- for agents -----
  Object.assign(LIVE.ops, {
    remove_pauses: async a => { const L = S.layers.find(l => l.id === +a.id) || S.layers.find(l => l.name === a.id); if (!L) throw new Error(`No layer ${a.id}`);
      const r = await removePauses(L, { floor: a.below_db ?? null, longest: a.longer_than ?? .45, pad: a.keep ?? .12, ripple: a.ripple !== false });
      return { ok: true, message: r.removed ? `took ${r.removed}s of pauses out of ${L.name} in ${r.cuts} cuts` : `${L.name} has no pauses that long`, ...r }; },
    split_at_cuts: async a => { const L = S.layers.find(l => l.id === +a.id) || S.layers.find(l => l.name === a.id); if (!L) throw new Error(`No layer ${a.id}`);
      const r = await splitAtCuts(L, { strength: a.sensitivity ?? 1 });
      return { ok: true, message: r.cuts.length ? `split ${L.name} into ${r.layers.length} shots` : `found no cuts in ${L.name}`, ...r }; },
  });

  function menu(L) {
    return [{ label: 'Remove pauses', act: async () => { status('Listening for pauses…');
        try { const r = await removePauses(L); status(r.removed ? `Took ${fmtTime(r.removed)} of pauses out, in ${r.cuts} cuts` : 'No pauses long enough to take out'); } catch (err) { status(err.message); } } },
      { label: 'Split at scene cuts', act: async () => { status('Looking for cuts…');
        try { const r = await splitAtCuts(L); status(r.cuts.length ? `Split into ${r.layers.length} shots` : 'No cuts found'); } catch (err) { status(err.message); } } }];
  }
  return { loudness, quietSpans, removePauses, findCuts, splitAtCuts, rippleDelete, shiftAfter, menu };
})();
