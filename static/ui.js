// Riptide UI kit: custom colour picker, dropdown menu, modal dialogs, toasts and scrub-able number fields.
// Nothing here uses the browser's built-in pickers, selects or prompt/alert dialogs.
const UI = (() => {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  let open = null; // the one popover currently shown
  function close() {
    if (!open) return; const o = open; open = null;
    o.node.classList.add('out'); setTimeout(() => o.node.remove(), 140); o.onClose?.();
  }
  function popover(anchor, node, onClose) {
    close();
    node.classList.add('pop'); document.body.appendChild(node);
    const r = anchor.getBoundingClientRect(), w = node.offsetWidth, h = node.offsetHeight;
    let x = Math.min(innerWidth - w - 8, Math.max(8, r.left)), y = r.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    node.style.left = x + 'px'; node.style.top = y + 'px';
    open = { node, onClose, anchor };
    return node;
  }
  addEventListener('pointerdown', e => { if (open && !open.node.contains(e.target) && !open.anchor.contains(e.target)) close(); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') { close(); closeModal(null); } });

  // ---------- colour ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = a => '#' + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  function rgb2hsv([r, g, b]) { r /= 255; g /= 255; b /= 255; const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
    let h = 0; if (d) h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, M ? d / M : 0, M]; }
  function hsv2rgb(h, s, v) { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255]; }
  const SWATCHES = ['#ffffff', '#f4f1ea', '#111111', '#0b1026', '#7c5cff', '#ff5c8a', '#ff7a45', '#ffcc33', '#20c997', '#3fa9ff', '#2b2d42', '#9aa0b4'];
  let recent = [];
  function color(anchor, value, onInput) {
    let [h, s, v] = rgb2hsv(hex2rgb(/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'));
    const n = el('div', 'cp', `<div class="sv"><div class="svk"></div></div><div class="hue"><div class="hk"></div></div>
      <div class="cprow"><div class="cpprev"></div><input class="cphex" spellcheck="false" maxlength="7"></div>
      <div class="sws"></div>`);
    const sv = n.querySelector('.sv'), hue = n.querySelector('.hue'), hexIn = n.querySelector('.cphex');
    const paint = (emit = true) => {
      const c = rgb2hex(hsv2rgb(h, s, v));
      sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${h},100%,50%))`;
      n.querySelector('.svk').style.cssText = `left:${s * 100}%;top:${(1 - v) * 100}%;background:${c}`;
      n.querySelector('.hk').style.left = h / 360 * 100 + '%';
      n.querySelector('.cpprev').style.background = c;
      if (document.activeElement !== hexIn) hexIn.value = c;
      if (emit) onInput(c);
    };
    const dragOn = (area, fn) => area.addEventListener('pointerdown', e => {
      area.setPointerCapture(e.pointerId); const mv = ev => { const r = area.getBoundingClientRect();
        fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); paint(); };
      mv(e); area.onpointermove = mv; area.onpointerup = () => { area.onpointermove = null; };
    });
    dragOn(sv, (x, y) => { s = x; v = 1 - y; });
    dragOn(hue, x => { h = x * 359.9; });
    hexIn.oninput = () => { if (/^#?[0-9a-f]{6}$/i.test(hexIn.value)) { [h, s, v] = rgb2hsv(hex2rgb('#' + hexIn.value.replace('#', ''))); paint(); } };
    const sws = n.querySelector('.sws');
    [...new Set([...recent, ...SWATCHES])].slice(0, 16).forEach(c => {
      const b = el('button', 'sw'); b.style.background = c; b.title = c;
      b.onclick = () => { [h, s, v] = rgb2hsv(hex2rgb(c)); paint(); }; sws.appendChild(b);
    });
    paint(false);
    popover(anchor, n, () => { const c = rgb2hex(hsv2rgb(h, s, v)); recent = [c, ...recent.filter(x => x !== c)].slice(0, 6); });
  }

  // ---------- dropdown menu ----------
  // items: [{value, label, hint?, group?}]; render(item) may return extra HTML (e.g. a curve preview)
  function menu(anchor, items, current, onPick, render) {
    const n = el('div', 'menu'); let g = null;
    items.forEach((it, i) => {
      if (it.group && it.group !== g) { g = it.group; n.appendChild(el('div', 'mgroup', g)); }
      const b = el('button', 'mitem' + (it.value === current ? ' on' : ''), `${render ? render(it) : ''}<span>${it.label}</span>${it.hint ? `<em>${it.hint}</em>` : ''}`);
      b.style.animationDelay = Math.min(i, 14) * 12 + 'ms';
      b.onclick = () => { onPick(it.value); close(); }; n.appendChild(b);
    });
    popover(anchor, n);
    n.querySelector('.on')?.scrollIntoView({ block: 'center' });
  }

  // ---------- modal dialogs ----------
  let modalDone = null;
  function closeModal(v) {
    const m = document.querySelector('.modal-wrap'); if (!m) return;
    m.classList.add('out'); setTimeout(() => m.remove(), 180); const d = modalDone; modalDone = null; d?.(v);
  }
  function dialog({ title, body = '', input, ok = 'OK', cancel = 'Cancel' }) {
    closeModal(null);
    return new Promise(res => {
      const w = el('div', 'modal-wrap', `<div class="modal"><h3></h3><p></p>${input != null ? '<input class="mfield" spellcheck="false">' : ''}
        <div class="mbtns">${cancel ? `<button class="btn" data-c>${cancel}</button>` : ''}<button class="btn primary" data-ok>${ok}</button></div></div>`);
      w.querySelector('h3').textContent = title; w.querySelector('p').textContent = body;
      const f = w.querySelector('.mfield'); if (f) f.value = input;
      document.body.appendChild(w); modalDone = res;
      const accept = () => closeModal(f ? f.value : true);
      w.querySelector('[data-ok]').onclick = accept;
      w.querySelector('[data-c]')?.addEventListener('click', () => closeModal(null));
      w.addEventListener('pointerdown', e => { if (e.target === w) closeModal(null); });
      f?.addEventListener('keydown', e => { if (e.key === 'Enter') accept(); });
      setTimeout(() => (f || w.querySelector('[data-ok]')).focus(), 30); f?.select();
    });
  }
  const prompt = (title, value, ok = 'OK') => dialog({ title, input: value, ok });
  const alert = (title, body) => dialog({ title, body, cancel: null });

  // ---------- toasts ----------
  function toast(msg) {
    let box = document.querySelector('.toasts'); if (!box) { box = el('div', 'toasts'); document.body.appendChild(box); }
    const t = el('div', 'toast'); t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2200);
  }

  // ---------- scrub numbers: drag a field's label left/right to change it ----------
  function scrub(root, onValue) {
    root.addEventListener('pointerdown', e => {
      const lab = e.target.closest('[data-scrub]'); if (!lab) return;
      const input = lab.parentElement.querySelector('input'); const step = +lab.dataset.scrub || 1;
      const x0 = e.clientX, v0 = parseFloat(input.value) || 0; let moved = false;
      lab.setPointerCapture(e.pointerId); document.body.classList.add('scrubbing');
      lab.onpointermove = ev => { const dx = ev.clientX - x0; if (Math.abs(dx) > 2) moved = true; if (!moved) return;
        const v = +(v0 + Math.round(dx / 2) * step * (ev.shiftKey ? 10 : 1)).toFixed(3); input.value = v; onValue(input, v); };
      lab.onpointerup = () => { lab.onpointermove = null; document.body.classList.remove('scrubbing'); if (!moved) input.focus(); else input.dispatchEvent(new Event('change', { bubbles: true })); };
    });
  }
  return { color, menu, dialog, prompt, alert, toast, scrub, close };
})();
