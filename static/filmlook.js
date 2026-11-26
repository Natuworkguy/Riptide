// ---------- film looks: how a world is drawn, for animated films ----------
// A world's "Look" (in its Lens settings):
//   Natural: as it is.
//   Animated feature: the look of a big studio's animated film. A soft fill and more bounce light from the sky, so
//     shadows are never black; a rim of light from behind on everything, to lift the characters off the background;
//     colour a little richer, warm in the light and cool in the shade.
//   Cel shaded: every surface lit in a few flat bands, with ink lines round each shape and along its creases.
//   Painted: flat strokes of colour, as if painted with a brush, a faint line round the shapes, on paper.
// "Ink lines %" sets how heavy the lines are (cel shaded and painted), "Rim light %" how strong the light from
// behind is (animated feature).
const FilmLook = (() => {
  const T = window.RiptideThree, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MODES = { natural: 0, feature: 1, toon: 2, painted: 3 };
  const modeOf = o => MODES[o?.style] || 0;

  // ----- the pass: lines from the shapes' depth and facing, a grade, brush strokes -----
  const SHADER = {
    uniforms: { tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null }, uMode: { value: 0 }, uInk: { value: 1 }, uWidth: { value: 1 },
      uInkCol: { value: new T.Color(.05, .035, .03) }, uPx: { value: new T.Vector2() }, uStep: { value: 1 }, uNear: { value: 5 }, uFar: { value: 4e6 }, uSat: { value: 1 }, uSeed: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse, tNormal, tDepth; uniform float uMode, uInk, uWidth, uNear, uFar, uSat, uSeed, uStep; uniform vec3 uInkCol; uniform vec2 uPx; varying vec2 vUv;
      // how far away (1 / distance, which runs straight across any flat surface, so a flat floor draws no line)
      float inv(vec2 p) { float z = texture2D(tDepth, p).x; return (uFar - z * (uFar - uNear)) / (uNear * uFar); }
      vec3 nrm(vec2 p) { return texture2D(tNormal, p).xyz * 2. - 1.; }
      float lines() {
        float i0 = inv(vUv), e = 0.; vec3 n0 = nrm(vUv);
        for (int k = 0; k < 2; k++) {
          vec2 o = (k == 0 ? vec2(1., 0.) : vec2(0., 1.)) * uPx * uWidth;
          float a = inv(vUv + o), b = inv(vUv - o);
          // a step in distance (an outline) bends 1/distance sharply; a crease turns the facing
          e = max(e, smoothstep(.035, .09, abs(a + b - 2. * i0) / max(i0, 1e-9)));
          e = max(e, smoothstep(.3, .6, 1. - dot(nrm(vUv + o), n0)));
          e = max(e, smoothstep(.3, .6, 1. - dot(nrm(vUv - o), n0)));
        }
        // the sky draws no lines of its own
        return texture2D(tDepth, vUv).x >= 1. ? 0. : e;
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
      // brush strokes: each pixel takes the calmest of the four patches round it
      #define R 4
      vec3 brush() {
        vec3 m[4]; vec3 s[4];
        for (int q = 0; q < 4; q++) { m[q] = vec3(0.); s[q] = vec3(0.); }
        for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
          vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * uPx * uStep).rgb; c = c / (1. + c);
          if (i <= 0 && j <= 0) { m[0] += c; s[0] += c * c; } if (i >= 0 && j <= 0) { m[1] += c; s[1] += c * c; }
          if (i <= 0 && j >= 0) { m[2] += c; s[2] += c * c; } if (i >= 0 && j >= 0) { m[3] += c; s[3] += c * c; } }
        float n = float((R + 1) * (R + 1)), best = 1e9; vec3 col = vec3(0.);
        for (int q = 0; q < 4; q++) { vec3 mu = m[q] / n, v = abs(s[q] / n - mu * mu); float sig = v.r + v.g + v.b; if (sig < best) { best = sig; col = mu; } }
        return col / max(vec3(1e-4), 1. - col);
      }
      void main() {
        vec4 base = texture2D(tDiffuse, vUv); vec3 c = base.rgb;
        if (uMode > 2.5) c = brush();
        float l = dot(c, vec3(.2126, .7152, .0722));
        c = max(vec3(0.), mix(vec3(l), c, uSat));
        if (uMode > .5 && uMode < 1.5) {
          // warm where it is lit, cool in the shade
          float k = smoothstep(.02, .6, l);
          c *= mix(vec3(.94, .98, 1.08), vec3(1.05, 1., .94), k);
        }
        if (uMode > 1.5) { float e = lines() * uInk; c = mix(c, uInkCol * (uMode > 2.5 ? 2. : 1.), clamp(e, 0., 1.)); }
        if (uMode > 2.5) { float g = hash(floor(vUv / uPx / 2.)) - .5; c *= 1. + g * .06; }
        gl_FragColor = vec4(c, base.a); }`,
  };
  function pass(W, H) {
    const p = new T.ShaderPass({ ...SHADER, uniforms: T.UniformsUtils.clone(SHADER.uniforms) });
    p.enabled = false; p.material.depthTest = false; p.material.depthWrite = false; return p;
  }

  // ----- the shapes' facing and depth, drawn on their own for the lines -----
  let target = null; const facing = new T.MeshNormalMaterial();
  function drawFacing(renderer, scene, cam, W, H) {
    if (!target || target.width !== W || target.height !== H) {
      target?.dispose(); target = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType }); target.depthTexture = new T.DepthTexture(W, H, T.FloatType);
    }
    // glows, sprites, dust and see-through things are not surfaces: no lines round them
    const hidden = [];
    scene.traverse(n => { if (!n.visible) return; const m = n.material, ms = Array.isArray(m) ? m : [m];
      if (n.isSprite || n.isPoints || n.isLine || n.userData.guide || ((n.isMesh) && ms.some(x => x && (x.blending === T.AdditiveBlending || (x.transparent && !x.depthWrite) || x.userData?.noInk)))) { n.visible = false; hidden.push(n); } });
    const was = { rt: renderer.getRenderTarget(), over: scene.overrideMaterial, bg: scene.background, col: renderer.getClearColor(new T.Color()), a: renderer.getClearAlpha(), auto: renderer.autoClear };
    try {
      scene.overrideMaterial = facing; scene.background = null; renderer.autoClear = true;
      renderer.setRenderTarget(target); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, cam);
    } finally {
      scene.overrideMaterial = was.over; scene.background = was.bg; renderer.setRenderTarget(was.rt); renderer.setClearColor(was.col, was.a); renderer.autoClear = was.auto;
      for (const n of hidden) n.visible = true;
    }
    return target;
  }
  function shoot({ pass: p, B, cam, o, t, W, H, renderer }) {
    const mode = modeOf(o); p.enabled = mode > 0; if (!p.enabled) return;
    const u = p.uniforms, ink = clamp((o.ink ?? 100) / 100, 0, 3);
    u.uMode.value = mode; u.uPx.value.set(1 / W, 1 / H); u.uSeed.value = 0; u.uStep.value = clamp(Math.min(W, H) / 1080, .5, 2);
    u.uSat.value = mode === 1 ? 1.16 : mode === 2 ? 1.22 : 1.12;
    u.uInk.value = mode === 3 ? ink * .55 : ink; u.uWidth.value = Math.max(1, Math.min(W, H) / 540) * (.6 + .4 * Math.min(ink, 2));
    if (mode >= 2 && ink > 0) { const tg = drawFacing(renderer, B.scene, cam, W, H); u.tNormal.value = tg.texture; u.tDepth.value = tg.depthTexture; u.uNear.value = cam.near; u.uFar.value = cam.far; }
    else u.uInk.value = 0;
  }
  World.filmLook = { pass, shoot };

  // ----- the light: a rim from behind and a soft fill for the animated look; flat bands for cel shading -----
  const bands = (() => { const d = new T.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, T.RedFormat); d.minFilter = d.magFilter = T.NearestFilter; d.needsUpdate = true; return d; })();
  const toonMats = new WeakMap();
  const plain = m => m && m.isMeshStandardMaterial && (m.userData?.toon || m.onBeforeCompile === T.Material.prototype.onBeforeCompile) && !m.userData?.noToon;
  function toonOf(m) {
    let x = toonMats.get(m); if (x) return x;
    x = new T.MeshToonMaterial({ color: m.color.clone(), map: m.map, gradientMap: bands, emissive: m.emissive?.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
      alphaMap: m.alphaMap, transparent: m.transparent, opacity: m.opacity, side: m.side, vertexColors: m.vertexColors, alphaTest: m.alphaTest, depthWrite: m.depthWrite, normalMap: m.normalMap });
    // the glossy bits keep a spark of shine: an eye's glint is drawn on its own
    toonMats.set(m, x); return x;
  }
  World.stageHooks.push(({ B, o, cam }) => {
    const mode = modeOf(o), scene = B.scene;
    // cel shading: every plain surface drawn in bands; put back as it was when the look changes
    scene.traverse(n => {
      if (!n.isMesh) return;
      if (mode === 2) {
        const was = n.userData.preToon || n.material, ms = Array.isArray(was) ? was : [was];
        if (!ms.some(plain)) return;
        n.userData.preToon = was; n.material = Array.isArray(was) ? was.map(m => plain(m) ? toonOf(m) : m) : toonOf(was);
      } else if (n.userData.preToon) { n.material = n.userData.preToon; delete n.userData.preToon; }
    });
    // the animated feature: a soft cool fill from beside the camera, more light bouncing about (the shade never goes
    // black), and the characters' rim of light from behind (toon.js)
    let L = B.filmLights;
    if (mode === 1) {
      if (!L) { const fill = new T.DirectionalLight(0xffffff, 0); fill.castShadow = false; scene.add(fill, fill.target); L = B.filmLights = { fill }; }
      const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      const side = new T.Vector3(-fwd.z, 0, fwd.x);
      L.fill.position.copy(cam.position).addScaledVector(side, 1500).add(new T.Vector3(0, 900, 0)); L.fill.target.position.copy(cam.position).addScaledVector(fwd, 600);
      L.fill.color.copy(B.hemi.color).lerp(new T.Color(.75, .85, 1), .5); L.fill.intensity = .35 + .1 * B.sun.intensity; L.fill.visible = true;
      B.hemi.intensity *= 1.35;
    } else if (L) L.fill.visible = false;
    const R = World.toonRim;
    if (R) {
      R.uRim.value = mode === 1 ? clamp((o.rim ?? 60) / 100, 0, 3) * (.6 + .25 * B.sun.intensity) : 0;
      R.uRimCol.value.copy(B.sun.color).lerp(new T.Color(1, .96, .9), .4);
      // from behind and above what the camera sees, in the camera's own space
      R.uRimDir.value.set(.25, .75, -.6).normalize();
    }
  });

  return { MODES };
})();
