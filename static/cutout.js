// ---------- cut out ----------
// A person cut out of a picture or a video frame, with no green screen. The server (cutout.py) works out, for each
// frame, how sure it is that each pixel is part of a person; Edge soft and Grow then shape that into the cut. Every
// frame's answer is kept, so scrubbing back is instant, and an export waits for each frame's before it films it.
const Cutout = (() => {
  const KEEP = 240;                  // frames kept, oldest dropped first
  const masks = new Map();           // frame key -> the server's mask (an image)
  const cuts = new Map();            // frame key + edge + grow -> the cut-out (a canvas)
  const asked = new Map();           // frame key -> its request, while it is out
  const last = new Map();            // layer id -> its latest cut-out, shown while a new one comes
  let onReady = () => {}, onStatus = () => {}, failed = '', waitingSaid = '';
  const keep = (m, k, v) => { m.set(k, v); if (m.size > KEEP) m.delete(m.keys().next().value); };
  const sizeOf = img => [img.videoWidth || img.naturalWidth || img.width, img.videoHeight || img.naturalHeight || img.height];
  const frameKey = (L, img) => `${L.p.asset}:${Math.round((img.currentTime ?? 0) * 60)}`;
  const pause = ms => new Promise(r => setTimeout(r, ms));

  // the server's mask for IMG as it is now: asked once, waited for while the server first sets itself up
  function ask(key, img) {
    if (asked.has(key)) return asked.get(key);
    const [w, h] = sizeOf(img), k = Math.min(1, 1280 / Math.max(w, h)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const p = (async () => {
      const body = await new Promise(r => cv.toBlob(r, 'image/jpeg', .92));
      for (;;) {
        const res = await fetch('/api/cutout/mask', { method: 'POST', body });
        if (res.status === 202) {
          const s = await res.json().catch(() => ({}));
          if (s.error) throw new Error(s.error);
          if (s.step && s.step !== waitingSaid) { waitingSaid = s.step; onStatus(`${s.step}…`); }
          await pause(1500); continue;
        }
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `the server said ${res.status}`);
        const bmp = await createImageBitmap(await res.blob());
        if (waitingSaid) { waitingSaid = ''; onStatus('Cut out: ready'); }
        failed = ''; keep(masks, key, bmp); return bmp;
      }
    })().catch(e => { failed = String(e?.message || e); onStatus(`Could not cut out: ${failed}`); return null; })
      .finally(() => { asked.delete(key); onReady(); });
    asked.set(key, p);
    return p;
  }
  // the cut-out at the source's size: the mask, made firmer or softer (Edge soft) and pushed out or in (Grow)
  function cut(img, mask, o) {
    const [w, h] = sizeOf(img), m = document.createElement('canvas');
    m.width = mask.width; m.height = mask.height;
    const mc = m.getContext('2d'); mc.drawImage(mask, 0, 0);
    const d = mc.getImageData(0, 0, m.width, m.height), px = d.data;
    const mid = .5 - (+o.cutGrow || 0) / 25, steep = 8 / Math.max(.5, +o.cutEdge || 0);
    for (let i = 0; i < px.length; i += 4) {
      const a = Math.max(0, Math.min(1, (px[i] / 255 - mid) * steep + .5));
      px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = a * 255;
    }
    mc.putImageData(d, 0, 0);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const c = out.getContext('2d');
    c.drawImage(img, 0, 0, w, h);
    c.globalCompositeOperation = 'destination-in'; c.imageSmoothingQuality = 'high';
    c.drawImage(m, 0, 0, w, h);
    return out;
  }
  // the cut-out of IMG (a picture, or a video at its frame now) for layer L; while it is coming, the last one
  function frame(L, img, o) {
    const key = frameKey(L, img), full = `${key}:${o.cutEdge}:${o.cutGrow}`;
    let got = cuts.get(full);
    if (!got) {
      const mask = masks.get(key);
      if (mask) { got = cut(img, mask, o); keep(cuts, full, got); }
      else ask(key, img);
    }
    if (got) last.set(L.id, got);
    return got || last.get(L.id) || null;
  }
  return {
    frame,
    // before a frame is filmed: the masks of the layers cut out in it, each [layer, its picture or video]
    ready: async list => { await Promise.all(list.filter(([, img]) => img && sizeOf(img)[0]).map(([L, img]) => masks.get(frameKey(L, img)) || ask(frameKey(L, img), img))); },
    get failed() { return failed; },
    set onReady(f) { onReady = f; },
    set onStatus(f) { onStatus = f; },
  };
})();
