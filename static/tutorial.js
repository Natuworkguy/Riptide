// ---------- tutorial ----------
// How to use Riptide, a section at a time: a guide that opens over the editor (Help, F1), with buttons that do
// what a section describes so it can be tried on the spot. The first visit offers it once.
const Tutorial = (() => {
  const k = (...keys) => keys.map(x => `<kbd>${x === 'mod' ? (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') : x}</kbd>`).join('');
  const SECTIONS = [
    { id: 'start', title: 'Getting started', body: `
      <p>Riptide makes motion graphics and edits images in the browser. Everything you make is a stack of <b>layers</b> on
      a canvas, and anything about a layer can change over time with <b>keyframes</b>.</p>
      <ul>
        <li><b>Layers</b> (left): the stack, top layer first. Click to select, drag to reorder, double-click to rename.</li>
        <li><b>Viewer</b> (middle): the canvas. Drag layers to move them, drag a corner or edge to resize.</li>
        <li><b>Inspector</b> (right): <b>Design</b> holds the selected layer's properties; <b>Animate</b> holds ready-made animations.</li>
        <li><b>Timeline</b> (bottom): one row per layer, with its keyframes as diamonds.</li>
      </ul>
      <p>New, Open and Save are in the header. Projects save as <code>.rip</code> files with their images and audio inside.</p>`,
      try: [['Add a rectangle', () => newLayer('rect')]] },
    { id: 'layers', title: 'Layers and shapes', body: `
      <p>The toolbar adds a layer in the middle of the canvas: rectangle ${k('R')}, ellipse ${k('O')}, polygon ${k('P')},
      star ${k('S')}, arc ${k('A')}, wave ${k('W')} and text ${k('T')}. Right-click the canvas to add one where you clicked.</p>
      <ul>
        <li>Select several with Shift- or ${k('mod')}-click, or drag a box on empty canvas. ${k('mod', 'A')} selects them all.</li>
        <li>Duplicate with ${k('mod', 'D')}, delete with ${k('⌫')}, copy and paste with ${k('mod', 'C')} and ${k('mod', 'V')}.</li>
        <li>Drag with the <b>middle mouse button</b> to drag a copy and leave the original where it was.</li>
        <li>The eye hides a layer; the lock stops it being selected on the canvas.</li>
      </ul>`,
      try: [['Add an ellipse', () => newLayer('ellipse')], ['Add a star', () => newLayer('star')]] },
    { id: 'design', title: 'Moving, sizing and style', body: `
      <p>Drag a layer to move it; it snaps to the canvas edges and centre and to other layers, with red guides (hold
      ${k('Alt')} to stop snapping, ${k('Shift')} to keep to one axis). Arrow keys nudge it, by 10 with ${k('Shift')}.</p>
      <ul>
        <li>Every number in Design can be typed, scrubbed by dragging its label, or stepped with the arrow keys.</li>
        <li>The lock beside X, Width and Height locks position, width or height so nothing changes it by accident.</li>
        <li>Fill can be a colour or a linear or radial gradient. Stroke, corners, points and sweep shape the layer.</li>
        <li>Align puts one layer against the canvas or several against each other; ${k('Alt', 'C')} centres it.</li>
        <li>Effects (blur, shadow), Adjust (brightness, contrast, saturation, hue…) and blend modes work on any layer.</li>
      </ul>` },
    { id: 'animate', title: 'Animating with keyframes', body: `
      <p>A keyframe fixes a property's value at a moment; between two, Riptide moves it smoothly from one to the next.</p>
      <ol>
        <li>Move the playhead (the red line) to where the motion starts.</li>
        <li>In Design, click the diamond beside a property to add a keyframe with its current value.</li>
        <li>Move the playhead later and change the value: a second keyframe is added for you, because the property is now animated.</li>
        <li>Press ${k('Space')} to play it.</li>
      </ol>
      <p>Turn on <b>Record</b> (the dot in the timeline bar) and every change you make adds a keyframe, even on properties
      that had none. Click a keyframe in the timeline to choose its easing: 23 curves, from linear to bounce and elastic.</p>` },
    { id: 'timeline', title: 'The timeline', body: `
      <ul>
        <li>Drag the playhead or click the ruler to move through time; ${k('←')} and ${k('→')} step a frame.</li>
        <li>Drag a keyframe to move it in time. Twirl a row open to see each animated property on its own row.</li>
        <li>A layer's bar sets when it is on screen: drag its ends to trim it, the middle to slide it with its keyframes.</li>
        <li>${k('mod', 'K')} splits the layer at the playhead. ${k('M')} adds a marker.</li>
        <li>Zoom with ${k('mod')} and the wheel, the slider, or Fit. Click Duration at the bottom to change the length.</li>
      </ul>` },
    { id: 'presets', title: 'Animation presets', body: `
      <p>The <b>Animate</b> tab has ready-made animations in groups: Entrance, Emphasis, Exit, 3D and loops that run the whole clip.</p>
      <p>Click one to add it to the selected layer at the playhead, or drag it onto a layer on the canvas or onto its row
      in the timeline to drop it at that moment. They are ordinary keyframes, so you can change them afterwards.</p>` },
    { id: 'text', title: 'Text', body: `
      <p>Add text with ${k('T')}, then double-click it on the canvas (or press ${k('Enter')}) to type in place. Font size,
      weight, tracking and fill are in Design.</p>
      <p><b>Reveal</b> shows part of the text: animate it from 0 to 1 for a typewriter, or use the Typewriter preset.</p>`,
      try: [['Add text', () => newLayer('text')]] },
    { id: 'media', title: 'Images, video and audio', body: `
      <ul>
        <li>Drop files anywhere, paste with ${k('mod', 'V')}, or use Import in Media. Dropping on the canvas places them there.</li>
        <li>Images and videos become layers that move, animate and blend like any other. A video's bar trims it; Source in picks where it starts.</li>
        <li>Audio goes on tracks under the layers. Drag clips in time or onto another track, trim their edges, split at the
        playhead, and drag the dots at a clip's top corners to fade it in or out. It is all mixed into MP4 and WebM exports.</li>
      </ul>` },
    { id: '3d', title: '3D', body: `
      <p>Three ways in, all from the <b>cube button</b> in the toolbar or a layer's Design panel:</p>
      <ul>
        <li><b>3D layer</b>: switch <i>3D layer</i> on in Design, then turn the layer with <b>Rotate X</b> and <b>Rotate Y</b>
        and push it back with <b>Depth</b> (positive is further away). A card can flip, text can swing toward you.</li>
        <li><b>3D shapes</b>: cube, sphere, cylinder, cone, torus and 3D text, lit and shaded. Pick a finish under
        Material (matte, glossy, metal), set Thickness, and move the light with Light°.</li>
        <li><b>Models</b>: drop in a <code>.glb</code>, <code>.gltf</code> or <code>.obj</code> file. It fills its box without stretching.</li>
      </ul>
      <p>Everything animates. Try the 3D presets: Flip, Swing in, Turn in, Fly in, Turntable and Tumble.</p>`,
      try: [['Add a cube', () => add3d('cube')], ['Add 3D text', () => add3d('text')]] },
    { id: 'camera', title: 'The camera', body: `
      <p>Add a <b>Camera</b> from the cube button to film the 3D layers. Flat layers stay as they are.</p>
      <ul>
        <li><b>Look at X / Y</b>: the point it looks at. <b>Orbit°</b> and <b>Tilt°</b> swing it round that point.</li>
        <li><b>Dolly</b> moves it closer (or back, below 0); <b>Zoom</b> narrows the lens; <b>Roll°</b> turns the view.</li>
        <li>Animate them for fly-throughs, or use the camera presets: Orbit around, Push in, Pull back, Crane up.</li>
      </ul>
      <p>With several cameras, the top visible one films; trim their bars to cut between them.</p>`,
      try: [['Add a camera', () => addCamera()]] },
    { id: 'image', title: 'Image mode', body: `
      <p>Switch to <b>Image</b> in the header to edit a picture: the timeline goes away, and an image dropped on an empty
      canvas opens at full size. Adjust its colour, apply a look (Vivid, Warm, Noir…), flip it, add shapes and text, and
      export a PNG, JPEG or WebP.</p>` },
    { id: 'export', title: 'Exporting', body: `
      <p>Export (top right, ${k('mod', 'E')}) makes MP4, WebM, a GIF, a PNG sequence or a still image, at 24 to 60 frames a
      second, from 480p to 8K, for the whole timeline or between two markers. Video export needs ffmpeg on the computer
      running Riptide; stills and PNG sequences do not.</p>`,
      try: [['Open Export', () => $('#export').click()]] },
    { id: 'keys', title: 'Shortcuts and commands', body: `
      <p>${k('?')} shows every keyboard shortcut. ${k('mod', 'P')} opens the command palette, which searches every command by name,
      so you never need to remember where something lives. Undo with ${k('mod', 'Z')}, redo with ${k('mod', 'Shift', 'Z')}.</p>`,
      try: [['Show the shortcuts', () => cheatSheet()]] },
    { id: 'agent', title: 'Working with an agent', body: `
      <p>Riptide has an MCP server at <code>/mcp</code>, so an agent such as Flash can build and animate a project with you:
      add and change layers, set keyframes, apply presets, add audio and 3D models, and look at frames to check its work.
      Point the agent at <code>http://127.0.0.1:5173/mcp</code> while the editor is open; its changes show as they happen and can be undone.</p>` },
  ];

  let open = null;
  function show(id = 'start') {
    close();
    const w = document.createElement('div'); w.className = 'modal-wrap tutorial';
    w.innerHTML = `<div class="modal tut" role="dialog" aria-label="Riptide tutorial"><nav class="tutnav"><div class="tuthead">Tutorial</div>
      ${SECTIONS.map((s, i) => `<button data-sec="${s.id}"><em>${i + 1}</em>${s.title}</button>`).join('')}</nav>
      <article class="tutbody"></article><button class="ib tutx" title="Close (Esc)" aria-label="Close">×</button></div>`;
    document.body.appendChild(w); open = w;
    const go = sid => {
      const i = Math.max(0, SECTIONS.findIndex(s => s.id === sid)), s = SECTIONS[i], body = w.querySelector('.tutbody');
      w.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === s.id));
      body.innerHTML = `<h2>${s.title}</h2>${s.body}${s.try ? `<div class="tuttry"><span>Try it:</span>${s.try.map((t, n) => `<button class="tb small" data-try="${n}">${t[0]}</button>`).join('')}</div>` : ''}
        <div class="tutsteps">${i ? `<button class="tb" data-go="${SECTIONS[i - 1].id}">← ${SECTIONS[i - 1].title}</button>` : '<span></span>'}
        ${i < SECTIONS.length - 1 ? `<button class="tb primary" data-go="${SECTIONS[i + 1].id}">${SECTIONS[i + 1].title} →</button>` : '<button class="tb primary" data-done>Start making</button>'}</div>`;
      body.querySelectorAll('[data-try]').forEach(b => b.onclick = () => { close(); s.try[+b.dataset.try][1](); });
      body.scrollTop = 0;
      try { localStorage.setItem('riptide.tutorial', s.id); } catch { /* private window: not remembered */ }
    };
    w.addEventListener('click', e => {
      if (e.target === w || e.target.closest('.tutx') || e.target.closest('[data-done]')) return close();
      const b = e.target.closest('[data-sec],[data-go]'); if (b) go(b.dataset.sec || b.dataset.go);
    });
    go(id);
    const keys = e => { if (!w.isConnected) return removeEventListener('keydown', keys, true);
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    addEventListener('keydown', keys, true);
  }
  function close() { open?.remove(); open = null; }
  // where they left off, when they come back to it
  function resume() { let at = 'start'; try { at = localStorage.getItem('riptide.tutorial') || 'start'; } catch { /* none */ } show(at); }
  // once, on a first visit: a card offering it
  function offer() {
    try { if (localStorage.getItem('riptide.tutorial.offered')) return; localStorage.setItem('riptide.tutorial.offered', '1'); } catch { return; }
    const c = document.createElement('div'); c.className = 'tutoffer';
    c.innerHTML = `<b>New to Riptide?</b><span>A short tutorial covers layers, keyframes, 3D and exporting.</span>
      <div><button class="tb" data-no>Not now</button><button class="tb primary" data-yes>Show me</button></div>`;
    c.querySelector('[data-yes]').onclick = () => { c.remove(); show('start'); };
    c.querySelector('[data-no]').onclick = () => c.remove();
    document.body.appendChild(c);
  }
  return { show, close, resume, offer, SECTIONS };
})();
