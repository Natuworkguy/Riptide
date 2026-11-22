// ---------- first person, and the Earth from high up ----------
// First person (a world's First person, Hands, Head bob and Sleeves): the camera is someone's eyes. Their own arms
// and body are in the shot, a real, rigged person whose arms reach to where the hands are wanted on the screen
// (two-bone IK: shoulder, elbow, hand, the elbow falling down and out as elbows do), drawn over the world with a
// camera of their own, the way games draw a player's arms, so they stay sharp at a few centimetres however far off
// the ground below is. Looking down shows the body and the feet. Head bob sways the eyes as a walk does.
//
// The Earth from high up: as the eye rises above the street (its Eye height, up to the edge of space, 100 km), the
// ground becomes the Earth seen from above: land and sea, forests and fields, the city spreading round where the
// world is, rivers of cloud with their shadows, the air paling the distance, and the whole bending away with the
// planet's real curve, so from tens of kilometres up the horizon is a bow and the sky above it black with stars.
(() => {
  const T = window.RiptideThree, M = World.M, deg = v => v * Math.PI / 180, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const on = o => o.pov === true || o.pov === 'true';
  const R = 6371e3;                       // the Earth's radius, metres
  const smooth = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

  // ----- the planet below -----
  function planetMesh(B) {
    // a disc of rings, closer together near the middle (radius u^2.6), so the ground under the eye has the detail
    const rings = 150, segs = 192, pos = [], idx = [];
    for (let i = 0; i <= rings; i++) { const r = Math.pow(i / rings, 2.6);
      for (let j = 0; j <= segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); } }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const own = { uCenter: { value: new T.Vector2() }, uRadius: { value: 1 }, uR: { value: R * M }, uAlt: { value: 0 }, uHole: { value: 0 },
      uLand: { value: new T.Color() }, uSea: { value: 0 }, uCity: { value: 1 }, uM: { value: M } };
    const mat = new T.ShaderMaterial({ uniforms: Object.assign({}, B.uniforms, own), depthWrite: true, side: T.DoubleSide,
      vertexShader: `uniform vec2 uCenter; uniform float uRadius, uR, uGround; varying vec3 vW;
        void main() { vec2 p = position.xz * uRadius; vec3 w = vec3(p.x + uCenter.x, uGround, p.y + uCenter.y);
          // the planet's curve: the ground drops away with the square of how far off it is
          w.y -= dot(p, p) / (2. * uR); vW = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.); }`,
      fragmentShader: `${World.GLSL.NOISE}${World.GLSL.SKY}
        uniform float uAlt, uHole, uSea, uCity, uM; uniform vec3 uLand; uniform vec2 uCenter; varying vec3 vW;
        void main() {
          vec2 km = vW.xz / (uM * 1000.);                 // where on the ground, in kilometres
          float fromCity = length(vW.xz) / (uM * 1000.);
          if (length(vW.xz) < uHole) discard;
          // land and sea: continents hundreds of kilometres across, coasts wandering at every scale
          float cont = fbm(km * .004 + 3.1) * .75 + fbm(km * .03 + 7.7) * .25;
          float sea = uSea > .5 ? 1. : smoothstep(.47, .44, cont + smoothstep(14., 2., fromCity) * .3);
          // the land's cover: forest, farmland in patches, dry ground, lakes
          float f1 = fbm(km * .08 + 1.3), f2 = vnoise(km * .9 + 5.), fields = step(.55, vnoise(floor(km * 1.6) + 9.));
          vec3 forest = vec3(.045, .075, .035), farm = mix(vec3(.16, .15, .07), vec3(.11, .13, .05), fields), dry = vec3(.2, .16, .1);
          vec3 land = mix(forest, farm, smoothstep(.45, .6, f1)); land = mix(land, dry, smoothstep(.62, .75, f1) * .7);
          land = mix(land, uLand * .55, .25) * (.85 + .3 * f2);
          // the town round the world's place: streets of uneven blocks, each block a crowd of separate roofs of their
          // own height and colour, parks and trees between, every building throwing its shadow away from the sun
          float urban = smoothstep(9., 1.5, fromCity + fbm(km * .4) * 4.) * uCity;
          if (urban > .01) {
            float ang = (vnoise(floor(km * .45)) - .5) * 1.4;                          // each district's grid its own way
            vec2 m = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (km * 1000.) + vec2(fbm(km * .7), fbm(km * .7 + 4.)) * 90.;
            vec2 bs = vec2(95., 130.), bid = floor(m / bs), bf = fract(m / bs) * bs;  // a block, and where in it
            float road = 7. + 6. * step(.8, vnoise(bid.yy * 3.1)), edge = min(min(bf.x, bs.x - bf.x), min(bf.y, bs.y - bf.y));
            float isRoad = 1. - smoothstep(road * .5, road * .5 + 1.5, edge);
            float park = step(.9, vnoise(bid * 1.7 + 3.));
            vec2 cs = vec2(14. + 10. * vnoise(bid + 1.), 18. + 12. * vnoise(bid + 2.)), cid = floor(bf / cs), cf = fract(bf / cs);
            float h = vnoise(bid * 7. + cid * 3.1), tone = vnoise(bid * 5. + cid * 1.7 + 9.);
            vec3 roof = mix(vec3(.05, .05, .055), vec3(.17, .15, .13), tone * tone);
            roof = mix(roof, vec3(.2, .09, .06), step(.86, h) * .7);
            roof = mix(roof, vec3(.22, .22, .2), step(.93, tone) * .6);              // a pale flat roof
            // plant on the roofs: air-conditioning boxes, lift housings
            vec2 kb = fract(bf / 4.1); roof *= 1. - .35 * step(.83, vnoise(floor(bf / 4.1) + bid * 9.)) * step(.2, min(kb.x, kb.y));                  // the odd tiled roof
            roof *= .82 + .3 * smoothstep(0., .08, min(min(cf.x, 1. - cf.x), min(cf.y, 1. - cf.y)));  // parapet edge
            // the shadow of the building next door, on the side away from the sun
            vec2 away = normalize(-uSunDir.xz + 1e-4), into = cf + away * (.12 + .35 * (1. - h)) * (1. - uSunDir.y);
            float shade = .3 + .7 * step(.5, float(any(lessThan(into, vec2(0.))) || any(greaterThan(into, vec2(1.)))));
            roof *= 1. - (shade - .3) / .7 * .65;
            vec3 trees = vec3(.02, .04, .016) * (.6 + .7 * vnoise(m * .3)), lawn = vec3(.05, .07, .03);
            vec3 blockCol = park > .5 ? mix(lawn, trees, smoothstep(.45, .6, vnoise(m * .12))) : roof;
            vec3 asphalt = vec3(.035, .035, .038) * (.9 + .2 * vnoise(m * .5));
            // street trees along the kerbs
            blockCol = mix(blockCol, trees, (1. - park) * step(.62, vnoise(m * .4)) * (1. - smoothstep(road * .5 + 1.5, road * .5 + 5., edge)) * .8);
            land = mix(land, mix(blockCol, asphalt, isRoad), urban);
          }
          vec3 water = mix(vec3(.012, .03, .05), vec3(.02, .05, .07), f2);
          vec3 col = mix(land, water, sea);
          // lit by the sun, and a little by the sky
          float lit = max(uSunDir.y, 0.) * 1.4 + .02;
          col = col * (uSun * lit + uZen * .6);
          // the sun's glint off the sea
          vec3 v = normalize(cameraPosition - vW), h = normalize(v + uSunDir);
          col += uSun * pow(max(h.y, 0.), 400.) * 2.5 * sea;
          // cloud: rivers and fields of it a few kilometres up, its shadow on the ground beside it
          vec2 cq = km * .045 + vec2(uTime * uWind, 0.) * .0004;
          float cl = smoothstep(.52, .7, fbm(cq) * .8 + fbm(cq * 3.1) * .25);
          float shade = smoothstep(.52, .7, fbm(cq + uSunDir.xz * .02) * .8 + fbm((cq + uSunDir.xz * .02) * 3.1) * .25);
          col *= 1. - shade * .45 * (1. - cl);
          col = mix(col, (uSun * (.55 + lit * .4) + uZen * .5) * .7, cl * smoothstep(800., 2500., uAlt));
          // the air between: the further off and the lower the eye, the more of it
          float dist = length(vW - cameraPosition) / (uM * 1000.);
          float thick = .045 * exp(-uAlt / 7000.) + .0012;
          col = mix(col, hazeColor(normalize(vW - cameraPosition)), 1. - exp(-dist * thick));
          gl_FragColor = vec4(col, 1.);
        }` });
    const m = new T.Mesh(g, mat); m.frustumCulled = false; m.userData.own = own; m.renderOrder = -1;
    return m;
  }

  // ----- the eye's own arms and body -----
  const view = { scene: new T.Scene(), camera: new T.PerspectiveCamera(50, 1, .01, 20) };
  const sunV = new T.DirectionalLight(0xffffff, 1), hemiV = new T.HemisphereLight(0xffffff, 0x444444, .5);
  view.scene.add(sunV, sunV.target, hemiV);
  // where each pose wants the hands, in metres from the eye (x right, y up, z back), and how curled the fingers are
  const POSES = {
    relaxed: { at: [.24, -.5, -.26], curl: 28, palm: 0 },
    reach: { at: [.17, -.21, -.43], curl: 16, palm: -20 },
    spread: { at: [.46, -.07, -.36], curl: 6, palm: 10 },
    palms: { at: [.12, -.13, -.33], curl: 6, palm: 80 },
  };
  const tmp = { v: new T.Vector3(), q: new T.Quaternion() };
  function aim(bone, child, to) {
    // turn BONE so the way to CHILD points at TO (world space)
    bone.updateMatrixWorld(true);
    const s = bone.getWorldPosition(new T.Vector3()), c = child.getWorldPosition(new T.Vector3());
    const from = c.sub(s).normalize(), want = to.clone().sub(s).normalize();
    const turn = new T.Quaternion().setFromUnitVectors(from, want);
    const world = bone.getWorldQuaternion(new T.Quaternion()), parent = bone.parent.getWorldQuaternion(new T.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
    bone.updateMatrixWorld(true);
  }
  function reach(g, side, hand, right, down, back) {
    // two bones from the shoulder to HAND, the elbow down and out
    const b = n => g.getObjectByName('mixamorig' + side + n);
    const arm = b('Arm'), fore = b('ForeArm'), wrist = b('Hand'); if (!arm || !fore || !wrist) return;
    const S = arm.getWorldPosition(new T.Vector3()), E0 = fore.getWorldPosition(new T.Vector3()), H0 = wrist.getWorldPosition(new T.Vector3());
    const a = S.distanceTo(E0), bl = E0.distanceTo(H0);
    const to = hand.clone().sub(S), d = clamp(to.length(), .05, (a + bl) * .985), dir = to.normalize();
    const x = (a * a - bl * bl + d * d) / (2 * d), y = Math.sqrt(Math.max(0, a * a - x * x));
    const pole = down.clone().multiplyScalar(1).addScaledVector(right, side === 'Left' ? -.55 : .55).addScaledVector(back, .25);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, y), H = S.clone().addScaledVector(dir, d);
    aim(arm, fore, E); aim(fore, wrist, H);
  }
  function fingers(g, side, curl, spread) {
    const sgn = side === 'Left' ? 1 : -1, r = deg;
    for (const [f, k] of [['Index', -1], ['Middle', 0], ['Ring', 1], ['Pinky', 2]]) for (let i = 1; i <= 3; i++) {
      const bn = g.getObjectByName(`mixamorig${side}Hand${f}${i}`); if (!bn) continue;
      bn.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(0, i === 1 ? r(k * spread) : 0, r(-sgn * curl * (i === 1 ? .8 : 1)))));
    }
    for (let i = 1; i <= 3; i++) { const bn = g.getObjectByName(`mixamorig${side}HandThumb${i}`);
      if (bn) bn.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(0, r(sgn * 8), r(-sgn * curl * .5)))); }
  }
  World.viewModel = (B, cam, o, t) => {
    if (!on(o) || o.hands === 'none' || typeof Actors === 'undefined') return null;
    const pose = POSES[o.hands] || POSES.reach;
    const person = Actors.realPerson({ body: 'man', move: 'idle', height: 1.78, shirt: o.sleeve || '#1f2833', id: 'pov' }, t);
    if (!person) return null;                       // still loading
    // the eye's camera: the same lens and way of looking as the world's, its own near and far
    const vc = view.camera; vc.fov = cam.fov; vc.aspect = cam.aspect; vc.near = .01; vc.far = 20; vc.updateProjectionMatrix();
    vc.position.set(0, 0, 0); vc.quaternion.copy(cam.quaternion); vc.updateMatrixWorld();
    for (const n of [...view.scene.children]) if (n !== sunV && n !== sunV.target && n !== hemiV) view.scene.remove(n);
    // lit as the world is
    view.scene.environment = B.scene.environment; view.scene.environmentIntensity = B.scene.environmentIntensity;
    sunV.color.copy(B.sun.color); sunV.intensity = B.sun.intensity; sunV.position.copy(World.sunDir(o)).multiplyScalar(10);
    hemiV.color.copy(B.hemi.color); hemiV.groundColor.copy(B.hemi.groundColor); hemiV.intensity = B.hemi.intensity;
    // the body stands upright, facing where the eyes look round to; its head (hidden) where the eyes are
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), yaw = Math.atan2(-fwd.x, -fwd.z);
    const body = new T.Group(); body.add(person); body.rotation.y = yaw; view.scene.add(body); body.updateMatrixWorld(true);
    const g = person, head = g.getObjectByName('mixamorigHead');
    if (head) { head.scale.setScalar(.001); }
    body.updateMatrixWorld(true);
    const eye = head ? head.getWorldPosition(new T.Vector3()) : new T.Vector3(0, 1.62, 0);
    const front = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    body.position.sub(eye).addScaledVector(front, -.1).add(new T.Vector3(0, -.06, 0)); body.updateMatrixWorld(true);
    // where the hands go: fixed to the view, with a little life (breath, and the bob's lag)
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const back = new T.Vector3(0, 0, 1).applyQuaternion(cam.quaternion), down = new T.Vector3(0, -1, 0);
    const breath = Math.sin(t * 1.7) * .006, bob = (+o.bob || 0) / 100 * Math.sin(t * Math.PI * 1.9) * .02;
    for (const [side, sx] of [['Left', -1], ['Right', 1]]) {
      const [hx, hy, hz] = pose.at;
      const hand = right.clone().multiplyScalar(sx * hx).addScaledVector(up, hy + breath - bob).addScaledVector(back, hz);
      reach(g, side, hand, right, down, back);
      const wrist = g.getObjectByName(`mixamorig${side}Hand`);
      if (wrist) wrist.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(0, deg(sx * pose.palm), 0)));
      fingers(g, side, pose.curl + Math.sin(t * .9 + sx) * 3, o.hands === 'spread' ? 9 : 4);
    }
    body.updateMatrixWorld(true);
    return view;
  };

  // ----- each frame: the planet when high, the bob of a walk -----
  World.stageHooks.push(({ B, o, t, ground, cam }) => {
    const eye = Math.max(0, +o.eye || 0), high = eye > 250 && o.ground !== 'none' && o.sky !== 'space' && o.sky !== 'studio';
    if (high && !B.planet) { B.planet = planetMesh(B); B.scene.add(B.planet); }
    if (B.planet) {
      B.planet.visible = high;
      if (high) {
        const u = B.planet.userData.own, far = Math.sqrt(2 * R * eye + eye * eye);
        u.uCenter.value.set(cam.position.x, cam.position.z); u.uRadius.value = Math.min(2.6e6, Math.max(30e3, far * 1.25)) * M;
        u.uAlt.value = eye; u.uSea.value = o.ground === 'ocean' ? 1 : 0; u.uLand.value.copy(World.lin(o.groundColor || '#58723a'));
        // the world's own ground (a street's tarmac, a field) is its own only while the eye is near it: from a few
        // hundred metres up the planet's ground, a town round the props, is under them instead
        const nearShown = false; u.uHole.value = 0; u.uCity.value = o.ground === 'floor' ? 1 : .15;
        for (const k of ['land', 'ocean']) if (B[k]) B[k].visible = nearShown;
      } else for (const k of ['land', 'ocean']) if (B[k]) B[k].visible = true;
    }
    // fog lies on the ground: looked down on from high up, the eye sees through most of it
    if (eye > 50 && B.scene.fog?.density) B.scene.fog.density *= Math.exp(-(eye - 50) / 700);
    // high up the clouds are below, on the planet; the sky darkens to space, its stars coming out
    const U = B.uniforms;
    if (eye > 1500 && U.uClouds) U.uClouds.value *= 1 - smooth(1500, 4000, eye);
    if (eye > 12e3 && U.uStars && World.airFor(o)) U.uStars.value = Math.max(U.uStars.value, smooth(15e3, 45e3, eye));
    // the head's sway as the feet fall, side to side once a stride and up and down twice
    if (on(o) && +o.bob > 0) {
      const k = +o.bob / 100, ph = t * Math.PI * 1.9;
      cam.position.y += Math.abs(Math.sin(ph)) * 4 * k - 2 * k; cam.position.x += Math.sin(ph / 2) * 1.6 * k;
      cam.rotateZ(Math.sin(ph / 2) * deg(.5) * k); cam.updateMatrixWorld();
    }
  });
})();
