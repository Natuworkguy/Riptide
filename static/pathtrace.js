// ---------- path tracing ----------
// A world's Render setting: Preview draws it fast, lit as a game would be; Path traced follows light as it really
// goes, bounce by bounce (light from the sky and from everything lit, soft shadows, glass bending what is behind it,
// real reflections and depth of field), refined over many samples. In the scene editor's Path traced view it clears
// up while you watch; in an export, each frame is given every sample before it is kept. What a path tracer cannot
// draw is left out of its frames: the ocean's waves (still water stands in), the breaking wave, wheat and dust.
const PathTrace = (() => {
  const T = window.RiptideThree, M = World.M;
  let pt = null, sceneKey = '', camKey = '', skyKey = '', sky = null, water = null;

  function tracer() {
    if (pt) return pt;
    pt = new T.WebGLPathTracer(World.renderer);
    Object.assign(pt, { renderDelay: 0, fadeDuration: 0, minSamples: 1, dynamicLowRes: false, renderToCanvas: true, rasterizeScene: false, filterGlossyFactor: .5 });
    pt.bounces = 6; pt.transmissiveBounces = 8; pt.tiles.set(2, 2);
    return pt;
  }

  // The procedural sky as a picture all round (equirectangular, in floats), for the tracer to light the world with.
  const SKY_W = 1024, SKY_H = 512;
  function skyPicture(B, o) {
    const key = [o.sky, o.sunEl, o.sunAz, o.sunPower, o.clouds, Math.round((o.wind || 0) * 10)].join('|');
    if (sky && skyKey === key) return sky;
    const R = World.renderer, target = new T.WebGLRenderTarget(SKY_W, SKY_H, { type: T.FloatType });
    const mat = B.sky.material.clone(); mat.uniforms = B.sky.material.uniforms; mat.side = T.DoubleSide;
    // each pixel of the picture looks out in its own direction
    mat.vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
    mat.fragmentShader = mat.fragmentShader.replace('varying vec3 vP; void main() { vec3 d = normalize(vP - cameraPosition);',
      'varying vec2 vUv; void main() { float th = (vUv.x - .5) * 6.2831853, ph = (vUv.y - .5) * 3.1415927; vec3 d = vec3(sin(th) * cos(ph), sin(ph), -cos(th) * cos(ph));');
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat), s = new T.Scene(); s.add(quad);
    const was = R.getRenderTarget(), tm = R.toneMapping; R.toneMapping = T.NoToneMapping;
    R.setRenderTarget(target); R.render(s, new T.Camera()); R.setRenderTarget(was); R.toneMapping = tm;
    const px = new Float32Array(SKY_W * SKY_H * 4); R.readRenderTargetPixels(target, 0, 0, SKY_W, SKY_H, px);
    target.dispose(); quad.geometry.dispose(); mat.dispose();
    sky?.dispose(); sky = new T.DataTexture(px, SKY_W, SKY_H, T.RGBAFormat, T.FloatType);
    sky.mapping = T.EquirectangularReflectionMapping; sky.flipY = false; sky.needsUpdate = true; skyKey = key;
    return sky;
  }

  // what it draws: the world less what it cannot, with still water for a sea; put back by the function it returns
  function prepare(B, o, ground) {
    const hidden = [], was = { env: B.scene.environment, bg: B.scene.background, fog: B.scene.fog, envI: B.scene.environmentIntensity, bgI: B.scene.backgroundIntensity };
    B.scene.traverse(n => { if (!n.visible) return;
      if (n === B.sky || n.isPoints || n.isLine || n.isSprite || n.isInstancedMesh || (n.isMesh && n.material?.isShaderMaterial)) { n.visible = false; hidden.push(n); } });
    if (o.ground === 'ocean') {
      water ||= new T.Mesh(new T.PlaneGeometry(2e6, 2e6).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({ roughness: .04, metalness: 0, ior: 1.33 }));
      water.material.color.copy(World.lin(o.water)).multiplyScalar(.6); water.position.y = ground; B.scene.add(water);
    }
    const photo = B.scene.background?.isTexture && o.hdri;
    if (!photo) { const pic = skyPicture(B, o); B.scene.environment = pic; B.scene.background = pic; B.scene.environmentIntensity = 1; B.scene.backgroundIntensity = 1;
      B.scene.environmentRotation.set(0, 0, 0); B.scene.backgroundRotation.set(0, 0, 0); }
    B.scene.fog = null;
    return () => { for (const n of hidden) n.visible = true; if (water?.parent) water.parent.remove(water);
      B.scene.environment = was.env; B.scene.background = was.bg; B.scene.fog = was.fog; B.scene.environmentIntensity = was.envI; B.scene.backgroundIntensity = was.bgI; };
  }

  // the film camera as a real one: its lens's f-stop and where it is focused, for depth of field
  function lensOf(cam, o) {
    const c = new T.PhysicalCamera(cam.fov, cam.aspect, cam.near, cam.far);
    c.position.copy(cam.position); c.quaternion.copy(cam.quaternion); c.updateMatrixWorld(); c.updateProjectionMatrix();
    const dof = cam.userData.dof ?? o.dof;
    c.focusDistance = cam.userData.focus ?? (o.focus > 0 ? o.focus * M : (cam.userData.d || 1000));
    c.fStop = dof > 0 ? Math.max(1, 22 / (1 + (dof / 100) * 14)) : 64; c.apertureBlades = 7;
    return c;
  }

  // Up to SAMPLES samples of the world at T into the renderer's canvas; true once they are all in.
  function trace(L, o, t, B, cam, W, H, samples, budgetMs) {
    const R = World.renderer, p = tracer();
    if (R.domElement.width !== W || R.domElement.height !== H) R.setSize(W, H, false);
    const ground = -(+o.eye || 1.7) * M, restore = prepare(B, o, ground), c = lensOf(cam, o);
    try {
      const sk = JSON.stringify(o) + '|' + World.version + '|' + B.propsKey + '|' + (B.members || []).map(m => m.matrixWorld.elements.join()).join() + '|' + t;
      const ck = [c.position.toArray(), c.quaternion.toArray(), c.fov, W, H].join();
      if (sk !== sceneKey) { p.setScene(B.scene, c); sceneKey = sk; camKey = ck; }
      else if (ck !== camKey) { p.setCamera(c); camKey = ck; }
      const until = performance.now() + budgetMs;
      do { p.renderSample(); } while (p.samples < samples && performance.now() < until);
      return p.samples >= samples;
    } finally { restore(); }
  }
  const on = o => o.render === 'path' && !!World.renderer;

  // a whole frame, every sample, for an export (World.prepareFrame calls this)
  World.traceFrame = async (L, o, t, B, cam, W, H, samples) => {
    sceneKey = '';     // a frame of its own, from its first sample
    while (!trace(L, o, t, B, cam, W, H, samples, 40)) await new Promise(r => setTimeout(r, 0));
  };

  // the scene editor: a Path traced view that clears up while you watch
  let viewing = false, lastDone = false;
  SceneEd.extras.push({
    mount(where) {
      if (where.querySelector('[data-pt]')) return;
      const seg = document.createElement('div'); seg.className = 'seg'; seg.dataset.pt = '1';
      seg.innerHTML = '<button data-ptv="0" class="on" title="Draw it fast">Preview</button><button data-ptv="1" title="Follow the light bounce by bounce: real shadows, reflections, glass and focus, clearing up over its samples">Path traced</button>';
      seg.onclick = e => { const b = e.target.closest('[data-ptv]'); if (!b) return; viewing = b.dataset.ptv === '1'; lastDone = false; sceneKey = '';
        for (const x of seg.children) x.classList.toggle('on', x === b); SceneEd.redraw(); };
      where.appendChild(seg);
    },
    busy: () => viewing && !lastDone,
    tracing: () => viewing,
    render(L, o, t, B, cam, W, H) {
      if (!viewing || !World.renderer) return false;
      lastDone = trace(L, o, t, B, cam, W, H, Math.max(1, Math.round(+o.samples || 128)), 30);
      return true;
    },
    helpers: () => !viewing,
  });
  return { trace, get samples() { return pt?.samples || 0; } };
})();
