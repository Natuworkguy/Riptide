// ---------- Flash files (.swf) ----------
// A .swf is played by Ruffle, the free Flash Player emulator (ruffle.py fetches it the first time), at the size the
// file was made for, and what it shows is recorded, its sound too, into a video. That video is then an ordinary
// video in the project: trimmed, keyed, graded and exported like any other. A file whose timeline is one frame
// (an ActionScript animation or a game) has no length of its own; it is recorded for a while, and Stop ends it early.
const Swf = (() => {
  const isSwf = f => /\.swf$/i.test(f?.name || '') || f?.type === 'application/x-shockwave-flash';
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const ONE_FRAME = 15, LONGEST = 600;          // seconds recorded when a file has no timeline length, and at most

  // the player: fetched by the server the first time, then loaded into the page once
  let loading = null;
  function player(say) {
    return loading ||= (async () => {
      let said = '';
      for (;;) {
        const s = await fetch('/api/ruffle/status').then(r => r.json()).catch(() => ({ error: 'Riptide\'s server is not answering' }));
        if (s.error) throw new Error(s.error);
        if (s.ready) break;
        if (s.step && s.step !== said) { said = s.step; say(`${s.step}…`); }
        await pause(1500);
      }
      window.RufflePlayer = window.RufflePlayer || {};
      window.RufflePlayer.config = { publicPath: '/ruffle/', polyfills: false, autoplay: 'on', splashScreen: false, unmuteOverlay: 'hidden',
        letterbox: 'off', contextMenu: 'off', warnOnUnsupportedContent: false, showSwfDownload: false, openUrlMode: 'deny', allowNetworking: 'none',
        logLevel: 'error', preferredRenderer: 'webgl', quality: 'best' };
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/ruffle/ruffle.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the Flash player')); document.head.appendChild(s); });
      return window.RufflePlayer.newest();
    })().catch(e => { loading = null; throw e; });
  }

  // its sound: while recording, whatever Ruffle sends to the speakers goes to the recording instead
  const taps = new Map(); let tapping = false;
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (tapping && dest instanceof AudioDestinationNode) {
      let t = taps.get(this.context); if (!t) { t = this.context.createMediaStreamDestination(); taps.set(this.context, t); }
      return connect.call(this, t, ...rest);
    }
    return connect.call(this, dest, ...rest);
  };

  const pick = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4']
    .find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';

  // F (a .swf File) played and recorded: { file (the video), w, h, dur }. SAY(text) reports progress.
  async function toVideo(F, say = () => {}) {
    if (!window.MediaRecorder) throw new Error('This browser cannot record video, so it cannot bring in a Flash file');
    if (F.size > 100e6) throw new Error(`${F.name} is over 100 MB`);
    const Ruffle = await player(say), data = new Uint8Array(await F.arrayBuffer());
    // where it plays while it is recorded: a panel over the editor, the player at the file's own size, shown smaller
    const wrap = document.createElement('div'); wrap.className = 'swfrec';
    wrap.innerHTML = '<div class="swfbox"><div class="swfstage"></div><div class="swfbar"><i></i></div><div class="swfrow"><span class="swfsay">Opening…</span><button class="tb">Stop</button></div></div>';
    document.body.appendChild(wrap);
    const stage = wrap.querySelector('.swfstage'), bar = wrap.querySelector('.swfbar i'), sayEl = wrap.querySelector('.swfsay');
    let stopped = false; wrap.querySelector('button').onclick = () => { stopped = true; };
    tapping = true;
    const el = Ruffle.createPlayer(); el.style.width = '550px'; el.style.height = '400px'; stage.appendChild(el);
    const api = typeof el.ruffle === 'function' ? el.ruffle() : el;
    try {
      const meta = await new Promise((ok, no) => {
        el.addEventListener('loadedmetadata', () => ok(api.metadata || el.metadata), { once: true });
        el.addEventListener('loadeddata', () => setTimeout(() => ok(api.metadata || el.metadata), 50), { once: true });
        Promise.resolve(api.load({ data, swfFileName: F.name })).catch(no);
        setTimeout(() => no(new Error(`Could not read ${F.name} as a Flash file`)), 30000);
      });
      const w = Math.max(16, Math.round(meta?.width || 550)), h = Math.max(16, Math.round(meta?.height || 400)), fps = Math.min(120, Math.max(1, meta?.frameRate || 24));
      const frames = meta?.numFrames || 1, dur = Math.min(LONGEST, frames > 1 ? frames / fps : ONE_FRAME);
      el.style.width = w + 'px'; el.style.height = h + 'px';
      const fit = Math.min(1, (innerWidth * .7) / w, (innerHeight * .6) / h); stage.style.width = w * fit + 'px'; stage.style.height = h * fit + 'px'; el.style.transform = `scale(${fit})`;
      await pause(120);
      const canvas = el.shadowRoot?.querySelector('canvas');
      if (!canvas) throw new Error('The Flash player did not draw anything');
      // record: the picture at its own frame rate, the sound alongside
      api.play?.();
      await pause(30);
      const stream = canvas.captureStream(fps);
      for (const t of taps.values()) for (const a of t.stream.getAudioTracks()) stream.addTrack(a);
      const type = pick(), rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12e6 } : {}), parts = [];
      rec.ondataavailable = e => e.data.size && parts.push(e.data);
      const done = new Promise(r => { rec.onstop = r; });
      rec.start(250);
      const t0 = performance.now();
      while (!stopped) {
        const s = (performance.now() - t0) / 1000; if (s >= dur) break;
        bar.style.width = `${Math.min(100, s / dur * 100)}%`; sayEl.textContent = `Recording ${F.name}: ${s.toFixed(1)} of ${dur.toFixed(1)} s`;
        await pause(100);
      }
      const length = Math.max(.1, (performance.now() - t0) / 1000);
      rec.stop(); await done;
      const mime = (rec.mimeType || type || 'video/webm').split(';')[0], ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const file = new File(parts, F.name.replace(/\.swf$/i, '') + '.' + ext, { type: mime });
      return { file, w, h, dur: length, fps };
    } finally {
      tapping = false;
      try { api.pause?.(); el.remove?.(); } catch { /* it is going anyway */ }
      taps.clear(); wrap.remove();
    }
  }
  return { isSwf, toVideo };
})();
