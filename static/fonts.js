// Fonts for text layers: the system's own, a library of web fonts fetched only when a layer uses one, and font
// files the user adds, which are kept inside the project so it opens the same anywhere.
//
// A web font is loaded the first time something draws with it; until it arrives the text shows in a fallback,
// then redraws. Exports wait for every font a project uses first.
const Fonts = (() => {
  const FALLBACK = { sans: 'sans-serif', serif: 'serif', display: 'sans-serif', script: 'cursive', mono: 'monospace' };
  // [name, kind]: what the computer has (Inter comes with the page)
  const SYSTEM = [['Inter', 'sans'], ['Arial', 'sans'], ['Helvetica', 'sans'], ['Verdana', 'sans'], ['Trebuchet MS', 'sans'],
    ['Georgia', 'serif'], ['Times New Roman', 'serif'], ['Courier New', 'mono'], ['Impact', 'display']];
  const WEB = [
    ['Roboto', 'sans'], ['Open Sans', 'sans'], ['Montserrat', 'sans'], ['Poppins', 'sans'], ['Lato', 'sans'], ['Raleway', 'sans'],
    ['Nunito', 'sans'], ['Work Sans', 'sans'], ['DM Sans', 'sans'], ['Rubik', 'sans'], ['Space Grotesk', 'sans'], ['Manrope', 'sans'],
    ['Outfit', 'sans'], ['Sora', 'sans'], ['Syne', 'sans'], ['Unbounded', 'sans'], ['Archivo', 'sans'], ['Barlow Condensed', 'sans'],
    ['Playfair Display', 'serif'], ['Lora', 'serif'], ['Merriweather', 'serif'], ['Cormorant Garamond', 'serif'], ['Fraunces', 'serif'],
    ['DM Serif Display', 'serif'], ['Libre Baskerville', 'serif'], ['Source Serif 4', 'serif'], ['EB Garamond', 'serif'],
    ['Bebas Neue', 'display'], ['Anton', 'display'], ['Oswald', 'display'], ['Archivo Black', 'display'], ['Abril Fatface', 'display'],
    ['Righteous', 'display'], ['Bangers', 'display'], ['Luckiest Guy', 'display'], ['Monoton', 'display'], ['Black Ops One', 'display'],
    ['Orbitron', 'display'], ['Audiowide', 'display'], ['Bungee', 'display'], ['Shrikhand', 'display'], ['Rubik Mono One', 'display'],
    ['Press Start 2P', 'display'], ['Big Shoulders Display', 'display'], ['Alfa Slab One', 'display'],
    ['Pacifico', 'script'], ['Lobster', 'script'], ['Dancing Script', 'script'], ['Caveat', 'script'], ['Permanent Marker', 'script'],
    ['Satisfy', 'script'], ['Great Vibes', 'script'], ['Kaushan Script', 'script'],
    ['JetBrains Mono', 'mono'], ['Space Mono', 'mono'], ['IBM Plex Mono', 'mono'], ['Fira Code', 'mono'], ['VT323', 'mono']];
  const KIND = Object.fromEntries([...SYSTEM, ...WEB]);
  const IS_WEB = new Set(WEB.map(([n]) => n));
  const GROUPS = { sans: 'Sans serif', serif: 'Serif', display: 'Display', script: 'Script', mono: 'Monospace' };
  const sheets = new Map();          // web font -> a promise of its stylesheet
  const faces = new Map();           // "name|weight|italic" -> settled?
  const custom = new Map();          // a font file the user added: name -> FontFace[]
  let onReady = () => {};

  const quote = n => `"${String(n).replace(/["\\]/g, '')}"`;
  function stack(name) {
    name = name || 'Inter';
    return `${quote(name)}, ${FALLBACK[KIND[name] || 'sans']}`;
  }
  // the font as canvas and CSS want it
  function css(o, size = o.size) {
    return `${o.italic ? 'italic ' : ''}${o.weight} ${size}px ${stack(o.font)}`;
  }

  // A web font's stylesheet: every weight and italic it has, asked for from the widest to the plainest, since the
  // service refuses a request for a style the font lacks.
  function sheet(name) {
    if (!IS_WEB.has(name)) return Promise.resolve();
    if (sheets.has(name)) return sheets.get(name);
    const fam = encodeURIComponent(name).replace(/%20/g, '+');
    const tries = [`${fam}:ital,wght@0,100..900;1,100..900`, `${fam}:wght@100..900`, `${fam}:ital@0;1`, fam];
    const p = (async () => {
      for (const t of tries) {
        // A refusal comes back without the headers a page may read, so it fails like a lost connection: either
        // way, the next, plainer request; with none left (offline), the fallback stays.
        try {
          const r = await fetch(`https://fonts.googleapis.com/css2?family=${t}&display=swap`);
          if (!r.ok) continue;
          const style = document.createElement('style'); style.dataset.font = name; style.textContent = await r.text();
          document.head.appendChild(style); return;
        } catch (_) { continue; }
      }
    })();
    sheets.set(name, p); return p;
  }

  // Ask for a font to be ready; true when it already is. When it arrives, whatever draws is told to redraw.
  function ensure(name, weight = 400, italic = false) {
    name = name || 'Inter';
    const key = `${name}|${weight}|${italic ? 1 : 0}`;
    if (faces.get(key)) return true;
    if (faces.has(key)) return false;
    faces.set(key, false);
    sheet(name).then(() => document.fonts.load(`${italic ? 'italic ' : ''}${weight} 40px ${quote(name)}`))
      .catch(() => {}).then(() => { faces.set(key, true); onReady(); });
    return false;
  }
  // Every font the layers use, loaded: before an export, so no frame goes out in a fallback.
  async function ready(layers) {
    const want = layers.filter(L => L.type === 'text').map(L => [L.p.font || 'Inter', L.p.weight || 400, !!L.p.italic]);
    await Promise.all(want.map(([n, w, i]) => sheet(n).then(() => document.fonts.load(`${i ? 'italic ' : ''}${w} 40px ${quote(n)}`)).catch(() => {})));
  }

  // A font file the user added: registered under its own name, and kept with the project as data.
  async function addFile(file) {
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim() || 'My font';
    await register(name, data);
    return { name, data };
  }
  async function register(name, data) {
    if (custom.has(name)) return;
    const face = new FontFace(name, `url(${data})`);
    await face.load(); document.fonts.add(face); custom.set(name, [face]); KIND[name] = KIND[name] || 'sans';
    onReady();
  }
  // a project's own fonts, as it opens
  function adopt(list) { (list || []).forEach(f => register(f.name, f.data).catch(() => {})); }

  // The menu: the project's fonts, then the system's, then the library by kind.
  function items(own = []) {
    const out = own.map(f => ({ value: f.name, label: f.name, group: 'Your fonts' }));
    SYSTEM.forEach(([n]) => out.push({ value: n, label: n, group: 'On this computer' }));
    for (const kind of Object.keys(GROUPS)) WEB.filter(([, k]) => k === kind).forEach(([n]) => out.push({ value: n, label: n, group: GROUPS[kind] }));
    return out;
  }
  // Each library font's name, drawn in itself in the menu: one small request for all of them, only the letters needed.
  let previewing = null;
  function preview() {
    if (previewing) return previewing;
    const letters = [...new Set(WEB.map(([n]) => n).join('').replace(/\s/g, ''))].join('') + 'Aa';
    const q = WEB.map(([n]) => 'family=' + encodeURIComponent(n).replace(/%20/g, '+')).join('&');
    // Under names of their own ("Pacifico preview"): these hold only the letters of the names, and must never
    // stand in for the real fonts a layer draws with.
    previewing = fetch(`https://fonts.googleapis.com/css2?${q}&text=${encodeURIComponent(letters)}&display=swap`)
      .then(r => r.ok ? r.text() : '').then(t => {
        if (!t) return;
        const s = document.createElement('style');
        s.textContent = t.replace(/font-family:\s*'([^']+)'/g, (m, n) => `font-family: '${n} preview'`);
        document.head.appendChild(s);
      })
      .catch(() => {});
    return previewing;
  }

  // how the menu shows a font's name: the library's in their previews
  const previewStack = n => IS_WEB.has(n) ? `${quote(n + ' preview')}, ${stack(n)}` : stack(n);

  return { SYSTEM, WEB, stack, previewStack, css, ensure, ready, addFile, register, adopt, items, preview, isWeb: n => IS_WEB.has(n),
    onLoad(fn) { onReady = fn; } };
})();
