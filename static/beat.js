// Beats: find the beat in the music, then hit it.
// Find the beats listens to an audio clip for its kicks: the low end, a hundredth of a second at a time, and every
// sharp rise in it that stands out from the second around it, at least a fifth of a second after the last, is a beat.
// Each gets a small marker of its own. Then a hit (a zoom punch, a shake, a flash, a glitch...) goes on every beat at
// once: keyframes on the selected layer, timed to the frame, or a white flash over the whole frame.
const BEAT_MIN_GAP = 0.2, BEAT_HOP = 0.01;
ICON.beat = ic('<path d="M2 10.5V6M5 13V3M8 11V5M11 14V2M14 9.5v-3"/>');
$('#beats').insertAdjacentHTML('afterbegin', ICON.beat);

const beatMarks = () => (S.markers || []).filter(m => m.beat);
// the beats to hit: the beat markers, or every marker when there are none
const beatTimes = () => (beatMarks().length ? beatMarks() : S.markers || []).map(m => m.t).sort((a, b) => a - b);

// the clip to listen to: the one selected, else the longest
function beatClip() {
  const all = allClips().filter(([, c]) => SND[c.sound]);
  return (all.find(([, c]) => c.id === selClip) || all.sort((a, b) => b[1].len - a[1].len)[0] || [])[1];
}

async function findBeats() {
  const c = beatClip(); if (!c) return status('Add some music first: drop an audio file on the timeline');
  status('Listening for the beat…');
  const buf = await decodeSound(c.sound), SR = buf.sampleRate, len = Math.min(c.len, buf.duration - c.in);
  // the low end only, where the kick is
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(len * SR)), SR), src = off.createBufferSource(), lp = off.createBiquadFilter();
  src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 160; src.connect(lp).connect(off.destination); src.start(0, c.in, len);
  const low = (await off.startRendering()).getChannelData(0);
  const hop = Math.round(SR * BEAT_HOP), n = Math.floor(low.length / hop), loud = new Float32Array(n), rise = new Float32Array(n);
  for (let i = 0; i < n; i++) { let e = 0; for (let j = i * hop; j < (i + 1) * hop; j++) e += low[j] * low[j]; loud[i] = Math.log(1e-9 + e / hop); }
  for (let i = 1; i < n; i++) rise[i] = Math.max(0, loud[i] - loud[i - 1]);
  const W = 50, found = []; let lastAt = -1;
  for (let i = 3; i < n - 3; i++) {
    let sum = 0, sq = 0, m = 0;
    for (let j = Math.max(0, i - W); j < Math.min(n, i + W); j++) { sum += rise[j]; sq += rise[j] * rise[j]; m++; }
    const mean = sum / m, sd = Math.sqrt(Math.max(0, sq / m - mean * mean));
    if (rise[i] < mean + 1.4 * sd || rise[i] < 0.6) continue;
    if (rise[i] < Math.max(rise[i - 1], rise[i - 2], rise[i + 1], rise[i + 2])) continue;
    const t = i * BEAT_HOP;
    if (lastAt >= 0 && t - lastAt < BEAT_MIN_GAP) continue;
    found.push(t); lastAt = t;
  }
  if (!found.length) return status('No clear beat found in that clip');
  S.markers = (S.markers || []).filter(m => !m.beat);
  for (const t of found) { const at = c.start + t; if (at <= S.dur) S.markers.push({ t: frame(at), label: '', beat: true }); }
  S.markers.sort((a, b) => a.t - b.t);
  const gaps = found.slice(1).map((t, i) => t - found[i]).sort((a, b) => a - b), mid = gaps[Math.floor(gaps.length / 2)];
  refresh();
  status(`Found ${found.length} beats` + (mid ? ` · about ${Math.round(60 / mid)} BPM` : '') + ' · put a hit on them from the same menu');
}

function clearBeats() {
  const n = beatMarks().length; S.markers = (S.markers || []).filter(m => !m.beat); refresh();
  status(n ? `Cleared ${n} beat markers` : 'No beat markers to clear');
}

// Hits: each puts its keys around one beat at B on L, from its values before any hit (O). Keys a frame before the beat
// hold the value, so every hit lands on its beat, not eased into it.
const F1 = 1 / FPS;
const HITS = {
  'Zoom punch': (L, b, o) => { setKey(L, 'scale', b - F1, o.scale, 'linear'); setKey(L, 'scale', b, o.scale * 1.14, 'expoOut'); setKey(L, 'scale', b + .22, o.scale, 'linear'); },
  'Shake': (L, b, o) => { [[0, 0], [24, -14], [-20, 12], [14, -8], [-8, 6], [0, 0]].forEach(([dx, dy], i) => {
    const at = i ? b + (i - 1) * F1 * 1.5 : b - F1; setKey(L, 'x', at, o.x + dx, 'linear'); setKey(L, 'y', at, o.y + dy, 'linear'); }); },
  'Glitch': (L, b, o) => { setKey(L, 'rgb', b - F1, o.rgb, 'step'); setKey(L, 'rgb', b, 22, 'quartOut'); setKey(L, 'rgb', b + .14, o.rgb, 'linear');
    setKey(L, 'x', b - F1, o.x, 'step'); setKey(L, 'x', b, o.x + 16, 'step'); setKey(L, 'x', b + F1 * 2, o.x - 10, 'step'); setKey(L, 'x', b + F1 * 3, o.x, 'linear'); },
  'Blur hit': (L, b, o) => { setKey(L, 'blur', b - F1, o.blur, 'linear'); setKey(L, 'blur', b, o.blur + 16, 'quartOut'); setKey(L, 'blur', b + .25, o.blur, 'linear'); },
  'Strobe': (L, b, o) => { setKey(L, 'invert', b - F1, o.invert, 'step'); setKey(L, 'invert', b, 100 - o.invert, 'step'); setKey(L, 'invert', b + F1 * 2, o.invert, 'linear'); },
  'Slam': (L, b, o) => { setKey(L, 'scale', b - F1, o.scale, 'linear'); setKey(L, 'scale', b, o.scale * 1.45, 'expoOut'); setKey(L, 'scale', b + .16, o.scale, 'linear');
    setKey(L, 'rgb', b - F1, o.rgb, 'linear'); setKey(L, 'rgb', b, 14, 'quartOut'); setKey(L, 'rgb', b + .16, o.rgb, 'linear'); },
  'Spin hit': (L, b, o) => { setKey(L, 'rotation', b - F1, o.rotation, 'linear'); setKey(L, 'rotation', b, o.rotation - 8, 'back'); setKey(L, 'rotation', b + .3, o.rotation, 'linear'); },
};
// a white flash over the whole frame: its own layer on top, made once
function flashLayer() {
  let L = S.layers.find(l => l.flashFor === 'beats');
  if (!L) { L = makeLayer('rect', { x: S.w / 2, y: S.h / 2, w: S.w, h: S.h, fill: '#ffffff', radius: 0, opacity: 0 }, 'Flash'); L.flashFor = 'beats'; }
  return L;
}
function hitBeats(name) {
  const times = beatTimes(); if (!times.length) return status('No beats yet: Find the beats first, or add markers where the hits go');
  let L = cur(), fn = HITS[name];
  if (name === 'Flash') { L = flashLayer(); fn = (L, b) => { setKey(L, 'opacity', b - F1, 0, 'linear'); setKey(L, 'opacity', b, .9, 'quartOut'); setKey(L, 'opacity', b + .18, 0, 'linear'); }; }
  if (!L) return status('Select the layer to hit, then pick the hit again');
  if (!PROPS[L.type].includes('scale') && name !== 'Flash') return status('That layer cannot take that hit');
  const o = { ...state(L, Math.max(lin(L), time)) }; let n = 0;
  for (const b of times) { if (b < lin(L) || b > lout(L) || b > S.dur) continue; fn(L, b, o); n++; }
  sel = L.id; refresh(); status(n ? `${name} on ${n} beat${n > 1 ? 's' : ''} of ${L.name}` : `No beats fall inside ${L.name}`);
}

$('#beats').onclick = e => UI.menu(e.currentTarget, [
  { value: 'find', label: 'Find the beats in the music', hint: hasAudio() ? '' : 'needs audio', group: 'Beats' },
  { value: 'clear', label: 'Clear beat markers', hint: beatMarks().length ? String(beatMarks().length) : '', group: 'Beats' },
  ...Object.keys(HITS).map(n => ({ value: n, label: n, group: 'On every beat, on the selected layer' })),
  { value: 'Flash', label: 'Flash', hint: 'white', group: 'On every beat, over the whole frame' },
], null, v => v === 'find' ? findBeats() : v === 'clear' ? clearBeats() : hitBeats(v));
