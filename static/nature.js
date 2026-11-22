// ---------- Nature: trees, rocks, a river, a cave, snow, a sea of cloud, a sky of fire, drowned ruins ----------
// The things a photograph of the outdoors is made of, each built so light does to it what it does in a photograph:
// leaves the low sun shines through, rock that is dark and glossy where the water wets it, snow that is blue in the
// shade and glitters where the sun catches a crystal, white water drawn as a long exposure draws it (the foam
// stretched into silk along the current), a cave whose mouth throws shafts of light through the dust, a sea of cloud
// lit from the side, the streaked clouds of the last minutes of a sunset. And six scenes made of them.
const Nature = (() => {
  const T = window.RiptideThree, M = World.M, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), deg = v => v * Math.PI / 180;
  const rng = seed => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const cache = new Map(), once = (k, make) => cache.get(k) || (cache.set(k, make()), cache.get(k));
  const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);
  const lin = h => World.lin(h);

  // ----- noise, in JavaScript and as a picture the shaders read -----
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
  }
  const fbm3 = (x, y, z, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= .5; } return s; };
  const noiseTex = () => once('noiseTex', () => {
    const S = 256, data = new Uint8Array(S * S * 4), base = [4, 8, 16, 32];
    for (let c = 0; c < 4; c++) {
      const acc = new Float32Array(S * S); let norm = 0, amp = .5;
      for (let o = 0; o < 5; o++) {
        const per = base[c] << o; if (per > S) break; const lat = new Float32Array(per * per).map((_, i) => hash3(i, c * 7.1 + o, 3.3));
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const fx = x / S * per, fy = y / S * per, xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
          const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), x1 = (xi + 1) % per, y1 = (yi + 1) % per;
          const g00 = lat[yi * per + xi], g10 = lat[yi * per + x1], g01 = lat[y1 * per + xi], g11 = lat[y1 * per + x1];
          acc[y * S + x] += amp * ((g00 * (1 - u) + g10 * u) * (1 - v) + (g01 * (1 - u) + g11 * u) * v);
        }
        norm += amp; amp *= .5;
      }
      let lo = 1e9, hi = -1e9; for (const v of acc) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (let i = 0; i < S * S; i++) data[i * 4 + c] = (acc[i] - lo) / (hi - lo + 1e-9) * 255;
    }
    const t = new T.DataTexture(data, S, S, T.RGBAFormat); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  });

  // ----- the sun, for what lights itself (water, cloud): kept up to date by the stage -----
  const sun = { dir: new T.Vector3(0, 1, 0), col: new T.Color(1, .95, .85), zen: new T.Color(.2, .4, .8), hor: new T.Color(.8, .8, .8), time: 0, viewDir: new T.Vector3() };
  World.stageHooks.push(({ o, t, cam }) => {
    if (World.sunDir) sun.dir.copy(World.sunDir(o));
    const lk = World.look ? World.look(o) : null;
    if (lk) { sun.col.copy(lk.sunTint || lk.sun || sun.col).multiplyScalar((lk.light || 1) * (o.sunPower ?? 100) / 100); if (lk.zen) sun.zen.copy(lk.zen); if (lk.hor) sun.hor.copy(lk.hor); }
    sun.time = t;
    if (cam) { cam.updateMatrixWorld(); sun.viewDir.copy(sun.dir).transformDirection(cam.matrixWorldInverse); }
  });

  // ----- leaves the light shines through -----
  // A standard leaf material, with what the sun gives the side of a leaf facing away from it added on: the warm
  // glow of a canopy seen against the light.
  function leafMaterial(map, key) {
    return once('leafmat|' + key, () => {
      const m = new T.MeshStandardMaterial({ map, alphaTest: .5, side: T.DoubleSide, roughness: .75, vertexColors: true, envMapIntensity: .4 });
      m.onBeforeCompile = sh => {
        sh.uniforms.uSunView = { value: sun.viewDir }; sh.uniforms.uSunCol = { value: sun.col };
        sh.vertexShader = 'attribute float snow; varying float vSnow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnow = snow;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          if (vSnow > 0.) { float lump = fract(sin(dot(floor(vMapUv * 24.), vec2(12.9898, 78.233))) * 43758.5453);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86, .89, .93), smoothstep(.35, .75, vSnow * (.3 + .9 * lump)) * .9); }`);
        sh.fragmentShader = 'uniform vec3 uSunView; uniform vec3 uSunCol; varying float vSnow;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
          `float back = pow(max(dot(-normalize(vViewPosition), normalize(uSunView)), 0.), 4.);
           gl_FragColor.rgb += diffuseColor.rgb * uSunCol * back * .55;
           #include <dithering_fragment>`);
      };
      return m;
    });
  }
  // the pictures: a spray of broad leaves, and a fir's branch tip, drawn on canvases
  const leafTex = kind => once('leaftex|' + kind, () => {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), r = rng(kind === 'fir' ? 7 : 3);
    if (kind === 'fir') {
      // a spruce's branch from above: a stem, side shoots off it, each thick with short dark needles all round
      const shoot = (x0, y0, a, len, w, depth) => {
        const steps = Math.round(len / 2.2);
        for (let k = 0; k < steps; k++) {
          const t = k / steps, x = x0 + Math.cos(a) * t * len, y = y0 + Math.sin(a) * t * len, ww = w * (1 - t * .6);
          for (let n = 0; n < 4; n++) { const a2 = a + (r() - .5) * 2.6, l2 = ww * (.5 + r() * .6), gr = 28 + r() * 34;
            g.strokeStyle = `rgba(${gr * .55 | 0},${gr * 1.15 | 0},${gr * .75 | 0},${.85 + r() * .15})`; g.lineWidth = 1.4 + r();
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a2) * l2, y + Math.sin(a2) * l2); g.stroke(); }
        }
        if (depth < 2) for (let k = 1; k < 7; k++) { const t = k / 7.5; for (const sd of [-1, 1]) if (r() < .85)
          shoot(x0 + Math.cos(a) * t * len, y0 + Math.sin(a) * t * len, a + sd * (.55 + r() * .3), len * (.42 - t * .25) * (depth ? .6 : 1), w * .8, depth + 1); }
        g.strokeStyle = '#3a2a1c'; g.lineWidth = depth ? 1.5 : 3.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); g.stroke();
      };
      shoot(S * .03, S * .5, 0, S * .94, S * .07, 0);
    } else {
      for (let i = 0; i < 26; i++) {
        const cx = S * (.15 + .7 * r()), cy = S * (.15 + .7 * r()), a = r() * 6.28;
        g.strokeStyle = '#4d3a26'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * S * .2, cy + Math.sin(a) * S * .2); g.stroke();
        for (let k = 0; k < 7; k++) { const t = k / 7, bx = cx + Math.cos(a) * t * S * .2, by = cy + Math.sin(a) * t * S * .2;
          for (const s of [-1, 1]) { const a2 = a + s * (.8 + r() * .4), L = S * (.045 + r() * .03), gr = 70 + r() * 70;
            g.save(); g.translate(bx + Math.cos(a2) * L * .6, by + Math.sin(a2) * L * .6); g.rotate(a2);
            g.fillStyle = `rgb(${gr * .55 + r() * 30 | 0},${gr | 0},${gr * .3 | 0})`; g.beginPath(); g.ellipse(0, 0, L * .6, L * .28, 0, 0, 6.28); g.fill();
            g.strokeStyle = 'rgba(255,255,220,.15)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-L * .5, 0); g.lineTo(L * .5, 0); g.stroke(); g.restore(); } }
      }
    }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
  });

  // ----- trees -----
  // Built once for each kind as one geometry with leaf cards (each card's normal the crown's own, so the canopy is lit
  // as one soft shape) and a trunk; a forest is one draw of each, many times over.
  function card(pos, nrm, uvs, col, quad, n, uv4, c) {
    const base = pos.length / 3; for (let i = 0; i < 4; i++) { pos.push(...quad[i]); nrm.push(...n[i]); uvs.push(...uv4[i]); col.push(...c[i]); }
    return [base, base + 1, base + 2, base, base + 2, base + 3];
  }
  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  function treeGeometry(kind, snow) {
    return once(`treegeo|${kind}|${snow}`, () => {
      const r = rng(kind === 'fir' ? 11 : 5), pos = [], nrm = [], uvs = [], col = [], idx = [];
      const leaf = () => [0.85 + r() * .25, 0.9 + r() * .15, 0.85];
      const snowy = [];
      if (kind === 'fir') {
        const H = 16;
        for (let y = 1.6; y < H - .3; y += .42 * (1 - (y - 1.6) / H * .45)) {
          const t = (y - 1.6) / (H - 1.6), L = 3.3 * Math.pow(1 - t, .95) + .35, n = 7 + (r() * 2 | 0), a0 = r() * 6.28;
          for (let k = 0; k < n; k++) {
            const a = a0 + k / n * 6.28 + r() * .3, d = [Math.cos(a), 0, Math.sin(a)], side = [-d[2], 0, d[0]], droop = -.25 - .3 * r() - .2 * (1 - t);
            const root = [0, y + .05, 0], tip = [d[0] * L, y + droop * L, d[2] * L], w = L * .62 + .35;
            const q = [[root[0] - side[0] * w * .25, root[1], root[2] - side[2] * w * .25], [root[0] + side[0] * w * .25, root[1], root[2] + side[2] * w * .25],
              [tip[0] + side[0] * w * .5, tip[1] + w * .07, tip[2] + side[2] * w * .5], [tip[0] - side[0] * w * .5, tip[1] + w * .07, tip[2] - side[2] * w * .5]];
            const nn = q.map(p => norm([p[0], L * .55, p[2]])), c = leaf(), ao = .35 + .65 * Math.min(1, .25 + t * .8);
            const cover = snow ? clamp(.15 + r() * .55 - t * .1, 0, 1) * (r() < .75 ? 1 : 0) : 0; snowy.push(cover, cover, cover, cover);
            idx.push(...card(pos, nrm, uvs, col, q, nn, [[0, .25], [0, .75], [1, .75], [1, .25]], q.map((_, i) => c.map(v => v * (i > 1 ? Math.min(1, ao + .3) : ao)))));
          }
        }
      } else {
        const C = [0, 8.2, 0], R = [4.8, 4, 4.8];
        for (let k = 0; k < 260; k++) {
          let v = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; v = norm(v); const rr = .55 + .45 * Math.sqrt(r());
          const p = [C[0] + v[0] * R[0] * rr, Math.max(C[1] - R[1] * .75, C[1] + v[1] * R[1] * rr), C[2] + v[2] * R[2] * rr];
          const n = norm([p[0] - C[0], (p[1] - C[1]) * 1.4, p[2] - C[2]]);
          let t1 = norm([n[1] * r() - n[2] * .3, n[2] * r() - n[0] * .7, n[0] * .5 - n[1] * r()]); const t2 = norm([n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]]);
          const s = 1.6 * (.8 + .4 * r()), q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [p[0] + (t1[0] * a + t2[0] * b) * s / 2, p[1] + (t1[1] * a + t2[1] * b) * s / 2, p[2] + (t1[2] * a + t2[2] * b) * s / 2]);
          const ao = .3 + .7 * (rr - .55) / .45 * (.55 + .45 * (p[1] - C[1] + R[1]) / (2 * R[1])), c = leaf().map(x => x * clamp(ao, .25, 1));
          const cover = snow ? clamp(n[1] * 1.5 - .2, 0, 1) : 0; snowy.push(cover, cover, cover, cover);
          idx.push(...card(pos, nrm, uvs, col, q, [n, n, n, n], [[0, 0], [1, 0], [1, 1], [0, 1]], [c, c, c, c]));
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      g.setAttribute('snow', new T.Float32BufferAttribute(snowy, 1));
      return g;
    });
  }
  const trunkGeometry = kind => once('trunk|' + kind, () => {
    const g = kind === 'fir' ? new T.CylinderGeometry(.03, .28, 16.5, 8) : new T.CylinderGeometry(.18, .32, 6, 8);
    g.translate(0, kind === 'fir' ? 8 : 2.6, 0); return g;
  });
  const barkMat = () => once('bark', () => new T.MeshStandardMaterial({ color: '#3a2c22', roughness: .95 }));

  // a stand of trees: COUNT of them over an area W by D, firs and broadleaves mixed by MIX (0 all broadleaf, 1 all fir)
  World.custom.forest = P => {
    const w = num(P.size?.[0], 60), d = num(P.size?.[2], 60), count = clamp(num(P.count, 40), 1, 4000), mix = clamp(num(P.mix, .7), 0, 1);
    const r = rng(num(P.seed, 1)), g = new T.Group(), snow = !!P.snow, tall = num(P.tall, 1);
    const spots = { fir: [], broad: [] };
    for (let i = 0; i < count; i++) {
      const kind = r() < mix ? 'fir' : 'broad', s = (kind === 'fir' ? .6 + r() * .7 : .6 + r() * .6) * tall;
      spots[kind].push([(r() - .5) * w, 0, (r() - .5) * d, s, r() * 6.28, r()]);
    }
    const m4 = new T.Matrix4(), q = new T.Quaternion(), c = new T.Color();
    for (const kind of ['fir', 'broad']) {
      const list = spots[kind]; if (!list.length) continue;
      const tint = kind === 'fir' ? (P.color || '#ffffff') : (P.leafColor || '#ffffff');
      const leaves = new T.InstancedMesh(treeGeometry(kind, snow), leafMaterial(leafTex(kind), kind), list.length);
      const trunks = new T.InstancedMesh(trunkGeometry(kind), barkMat(), list.length);
      list.forEach(([x, y, z, s, a, v], i) => {
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), a);
        m4.compose(new T.Vector3(x * M, y * M, z * M), q, new T.Vector3(s * M, s * M, s * M));
        leaves.setMatrixAt(i, m4); trunks.setMatrixAt(i, m4);
        c.copy(lin(tint)).multiplyScalar(.8 + v * .35); if (kind === 'broad') c.offsetHSL((v - .5) * .04, 0, 0); leaves.setColorAt(i, c);
      });
      for (const m of [leaves, trunks]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; }
      g.add(leaves, trunks);
    }
    return g;
  };
  World.custom.tree = P => World.custom.forest({ ...P, count: 1, size: [0, 0, 0], mix: P.kind === 'broadleaf' ? 0 : 1 });

  // ----- rock -----
  const rockTex = (wet) => once('rocktex|' + wet, () => {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), r = rng(23);
    g.fillStyle = wet ? '#3d3b37' : '#7b766c'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) { const v = r() * 255 | 0, a = r() * .18; g.fillStyle = `rgba(${v},${v * .97 | 0},${v * .92 | 0},${a})`; g.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 3); }
    for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, rad = 10 + r() * 50, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, wet ? 'rgba(120,110,60,.25)' : 'rgba(150,150,90,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(20,18,15,${.2 + r() * .3})`; g.lineWidth = .5 + r() * 1.5; g.beginPath(); let x = r() * S, y = r() * S; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - .5) * 60; y += (r() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
  });
  const rockMat = (wet, color) => once(`rockmat|${wet}|${color}`, () => new T.MeshStandardMaterial({ map: rockTex(wet), bumpMap: rockTex(wet), bumpScale: 2.5,
    color: color || '#ffffff', roughness: wet ? .28 : .88, metalness: 0, envMapIntensity: wet ? 1.2 : .5 }));
  function rockGeometry(seed, detail = 4, flat = .7) {
    return once(`rockgeo|${seed}|${detail}|${flat}`, () => {
      const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position, s = seed * 1.7;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + .32 * fbm3(x * 1.3 + s, y * 1.3, z * 1.3, 4) + .08 * fbm3(x * 6 + s, y * 6, z * 6, 2);
        // flattened faces where it split: rock is facetted, not round
        x *= k; y *= k * flat; z *= k; if (y < -.15) y = -.15 - (y + .15) * .2;
        p.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) * .5 + p.getZ(i) * .3, p.getY(i) * .5);
      return g;
    });
  }
  World.custom.rock = P => {
    const s = P.size || [1.2, 1, 1.2], m = new T.Mesh(rockGeometry(num(P.seed, 1) % 12, 4, num(P.flat, .7)), rockMat(!!P.wet, P.color));
    m.scale.set(s[0] * M / 2, s[1] * M / 1.4, s[2] * M / 2); m.castShadow = m.receiveShadow = true; const g = new T.Group(); g.add(m); return g;
  };
  // a scatter of rocks over an area, sizes mostly small and now and then big
  World.custom.boulders = P => {
    const w = num(P.size?.[0], 20), d = num(P.size?.[2], 20), n = clamp(num(P.count, 30), 1, 600), r = rng(num(P.seed, 3)), big = num(P.big, 1.6);
    const g = new T.Group(), groups = new Map();
    for (let i = 0; i < n; i++) { const key = (r() * 12) | 0; if (!groups.has(key)) groups.set(key, []); const sz = (.25 + Math.pow(r(), 3) * big) ;
      groups.get(key).push([(r() - .5) * w, (r() - .5) * d, sz, r() * 6.28, r()]); }
    const m4 = new T.Matrix4(), q = new T.Quaternion();
    for (const [key, list] of groups) {
      const mesh = new T.InstancedMesh(rockGeometry(key, 3, .65), rockMat(!!P.wet, P.color), list.length);
      list.forEach(([x, z, s, a, h], i) => { q.setFromEuler(new T.Euler((h - .5) * .3, a, (h - .5) * .3));
        m4.compose(new T.Vector3(x * M, (P.sink ?? -.2) * s * M, z * M), q, new T.Vector3(s * M, s * M * (.7 + h * .5), s * M * (.8 + h * .4))); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; g.add(mesh);
    }
    return g;
  };

  // ----- a river, as a long exposure sees it -----
  // A ribbon down a winding course, its water a shader of its own: clear and green over the bed in the slow parts,
  // white where it runs fast, the foam drawn out along the current into silky streaks (what a half-second exposure
  // does to white water), the sky and the sun mirrored on it. The bed and the stones are props of their own.
  const riverMat = (P) => {
    const m = new T.ShaderMaterial({ transparent: false, depthWrite: true, fog: false, side: T.DoubleSide,
      uniforms: { uNoise: { value: noiseTex() }, uTime: { value: 0 }, uFlow: { value: num(P.flow, 1) }, uRapids: { value: clamp(num(P.rapids, 60) / 100, 0, 1) },
        uSilk: { value: clamp(num(P.silk, 70) / 100, 0, 1) }, uSunDir: { value: sun.dir }, uSunCol: { value: sun.col }, uZen: { value: sun.zen }, uHor: { value: sun.hor },
        uWater: { value: lin(P.color || '#2f4a3c') } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uNoise; uniform float uTime, uFlow, uRapids, uSilk; uniform vec3 uSunDir, uSunCol, uZen, uHor, uWater;
        varying vec2 vUv; varying vec3 vW; varying vec3 vN;
        float n(vec2 p) { return texture2D(uNoise, p).r; }
        void main() {
          // across the river 0..1, along it in metres; the current runs along
          float across = vUv.x, along = vUv.y;
          float t = uTime * uFlow;
          // white water: where the bed's noise says it is rough, more toward the middle and over the steps
          float rough = smoothstep(.55, .95, texture2D(uNoise, vec2(across * .7, along * .018)).g * .75 + uRapids * .35 + .12 * sin(along * .21));
          // streaks: noise stretched far along the current and slid down it; blurred over time by mixing several
          float silk = 0.;
          for (int i = 0; i < 4; i++) { float k = float(i) * .25; vec2 q = vec2(across * 3.1 + k * .37, (along - t * (2.5 + k)) * mix(.12, .035, uSilk));
            silk += smoothstep(.45, .9, n(q) + n(q * vec2(2.3, 1.7)) * .4); }
          silk /= 4.;
          float foam = clamp(silk * rough * 1.5 + rough * rough * .2, 0., 1.);
          vec3 V = normalize(cameraPosition - vW);
          // the water's surface: tipped by the flow's ripples, flatter where it is calm
          vec2 g = vec2(n(vec2(across * 4., (along - t * 3.) * .2)) - .5, n(vec2(across * 4. + .3, (along - t * 3.) * .2 + .2)) - .5);
          vec3 N = normalize(vN + vec3(g.x, 0., g.y) * (.25 + rough * .6));
          float F = (.03 + .97 * pow(1. - max(dot(N, V), 0.), 5.)) * (.45 - .25 * rough);
          vec3 R = reflect(-V, N); vec3 sky = mix(uHor, uZen, clamp(R.y, 0., 1.)) * .9;
          vec3 body = uWater * (.5 + .6 * (1. - rough)) * (.7 + .3 * max(uSunDir.y, 0.)) + uSunCol * uWater * .35 + uWater * mix(uHor, uZen, .5) * .4;
          vec3 col = mix(body, sky, F);
          col += uSunCol * pow(max(dot(R, uSunDir), 0.), 200.) * 2. * (1. - foam);
          vec3 white = (uSunCol * max(dot(N, uSunDir), 0.) * .35 + mix(uHor, uZen, .5) * .55) * (.8 + .2 * silk);
          col = mix(col, white, foam);
          float edge = smoothstep(0., .06, across) * smoothstep(1., .94, across);
          gl_FragColor = vec4(col, mix(.55, .95, foam) * edge + (1. - edge) * .3 * foam);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    return m;
  };
  World.custom.river = (P, t = 0) => {
    const L = num(P.length, 120), w = num(P.width, 9), bend = num(P.bend, 1), drop = num(P.drop, 6), seed = num(P.seed, 2), segs = 260, across = 12;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const s = i / segs, z = -s * L, x = Math.sin(s * 5.1 + seed) * 6 * bend + Math.sin(s * 13 + seed * 2) * 1.5 * bend;
      const dx = Math.cos(s * 5.1 + seed) * 6 * bend * 5.1 / L + Math.cos(s * 13 + seed * 2) * 1.5 * bend * 13 / L;
      const l = Math.hypot(1, dx), nx = 1 / l, nz = dx / l;
      const y = s * drop + Math.sin(s * 40 + seed) * .05;
      const wi = w * (.75 + .5 * (fbm3(s * 6, seed, 1, 2) * .5 + .5));
      for (let j = 0; j <= across; j++) { const a = j / across - .5; pos.push((x + nx * a * wi) * M, (y + (Math.abs(a) > .45 ? .1 : 0)) * M, (z + nz * a * wi) * M); uv.push(j / across, s * L); }
    }
    for (let i = 0; i < segs; i++) for (let j = 0; j < across; j++) { const a = i * (across + 1) + j; idx.push(a, a + across + 1, a + 1, a + 1, a + across + 1, a + across + 2); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, riverMat(P)); m.receiveShadow = true; m.renderOrder = 2;
    m.onBeforeRender = () => { m.material.uniforms.uTime.value = sun.time; };
    const grp = new T.Group(); grp.add(m);
    // the bed: wet stones under and along it
    const bed = World.custom.boulders({ size: [w * 1.6, 1, L], count: Math.round(L * 1.4), seed: seed + 5, wet: true, big: 1.8, sink: -.35 });
    bed.children.forEach(c => { const mat = c.instanceMatrix; const m4 = new T.Matrix4(), v = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3();
      for (let i = 0; i < c.count; i++) { c.getMatrixAt(i, m4); m4.decompose(v, q, sc); const s = -v.z / M / L + .5;
        const zz = -s * L, xx = Math.sin(s * 5.1 + seed) * 6 * bend + Math.sin(s * 13 + seed * 2) * 1.5 * bend + v.x / M;
        v.set(xx * M, (s * drop - .25) * M + v.y, zz * M); m4.compose(v, q, sc); c.setMatrixAt(i, m4); } mat.needsUpdate = true; });
    grp.add(bed);
    return grp;
  };

  // ----- a cave, looked out of -----
  // The inside of a great hollow in the rock, open to the sky at the top: lumpy, overhanging walls, dark and wet,
  // stone hanging from the roof round the opening, plants growing in the light at its rim. The sun pours in through
  // the opening; light shafts and dust in the air do the rest.
  World.custom.cave = P => {
    // a chimney in the rock: a floor, walls rising and closing in overhead to a ragged opening onto the sky
    const R = num(P.size?.[0], 26), H = num(P.size?.[1], 46), open = clamp(num(P.open, 34), 5, 80) / 100, seed = num(P.seed, 4);
    const rings = 140, segs = 180, pos = [], uv = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const v = i / rings, y = v * H;
      for (let j = 0; j <= segs; j++) {
        const a = j / segs * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
        // wide at the bottom, swelling out, then leaning in hard toward the top; lumps and ledges all over
        let r = R * (1 + .25 * Math.sin(v * Math.PI) - (1 - open) * Math.pow(v, 2.2));
        r *= 1 + .28 * fbm3(cx * 1.4 + seed, v * 3.2, sz * 1.4, 5) + .07 * fbm3(cx * 7, v * 16 + seed, sz * 7, 3);
        // the rim at the top is broken, higher here and lower there
        const top = v > .96 ? (fbm3(cx * 2 + seed, 9, sz * 2, 2) * .5 + .5) * 6 : 0;
        pos.push(cx * r * M, (y + top) * M, sz * r * M); uv.push(j / segs * 9, v * H / 6);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const k = i * (segs + 1) + j; idx.push(k, k + 1, k + segs + 1, k + 1, k + segs + 2, k + segs + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const rock = new T.MeshStandardMaterial({ map: rockTex(true), bumpMap: rockTex(false), bumpScale: 8, color: P.color || '#9c8f80', roughness: .6,
      side: T.DoubleSide, envMapIntensity: .2 });
    const shell = new T.Mesh(g, rock); shell.castShadow = shell.receiveShadow = true;
    const floor = new T.Mesh(new T.CircleGeometry(R * 1.5 * M, 64).rotateX(-Math.PI / 2), rockMat(false, '#6d6256')); floor.receiveShadow = true;
    const grp = new T.Group(); grp.add(shell, floor);
    // stone hanging down inside the opening
    const r = rng(seed), topR = R * open * 1.05;
    for (let i = 0; i < 22; i++) {
      const a = r() * 6.28, d = topR * (.75 + r() * .4), len = 3 + Math.pow(r(), 2) * 14, wid = .8 + r() * 2.6;
      const m = new T.Mesh(rockGeometry(i % 12, 3, 1), rockMat(true, P.color || '#9c8f80'));
      m.position.set(Math.cos(a) * d * M, (H - len * .45) * M, Math.sin(a) * d * M); m.scale.set(wid * M * .5, len * M * .55, wid * M * .45);
      m.castShadow = m.receiveShadow = true; grp.add(m);
    }
    // trees and green round the rim, catching the sun
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.28 + r(), d = topR * (1.35 + r() * .5);
      const clump = World.custom.forest({ size: [8, 0, 8], count: 4, mix: .1, seed: seed + 9 + k, tall: .6 + r() * .5 });
      clump.position.set(Math.cos(a) * d * M, (H + 1 + r() * 3) * M, Math.sin(a) * d * M); grp.add(clump);
    }
    // a few dust boulders on the floor
    const fl = World.custom.boulders({ size: [R * 1.6, 1, R * 1.6], count: 40, seed: seed + 2, big: 3 }); grp.add(fl);
    return grp;
  };

  // ----- snow -----
  // Snow lying deep: mounds over buried stones, a trodden path with footprints in it, its surface the white of a
  // rough, bright material, blue where the sky alone lights it, and glittering where a crystal catches the sun.
  World.custom.snowfield = P => {
    const w = num(P.size?.[0], 80), d = num(P.size?.[2], 120), seed = num(P.seed, 5), n = 200;
    const g = new T.PlaneGeometry(w * M, d * M, n, n); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, r = rng(seed), bumps = Array.from({ length: 60 }, () => [(r() - .5) * w, (r() - .5) * d, .6 + r() * 2.5, .3 + r() * .8]);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / M, z = p.getZ(i) / M;
      let y = fbm3(x * .04 + seed, 0, z * .04, 4) * 2.2 + fbm3(x * .4, 1, z * .4, 2) * .12;
      for (const [bx, bz, br, bh] of bumps) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (br * br); if (q < 1) y += bh * Math.cos(q * Math.PI / 2) ** 2; }
      // the path: a trench wandering up the middle, with prints in its floor
      const px = Math.sin(z * .05 + seed) * 4, dpx = Math.abs(x - px);
      y -= .35 * Math.exp(-(dpx * dpx) / .6);
      const step = ((z % 1.4) + 1.4) % 1.4, foot = (Math.floor(z / .7) % 2 ? .18 : -.18);
      y -= .12 * Math.exp(-(((x - px - foot) ** 2) / .012 + ((step % .7 - .35) ** 2) / .02));
      p.setY(i, y * M);
    }
    g.computeVertexNormals();
    const m = new T.MeshStandardMaterial({ color: '#f4f7fb', roughness: .62, envMapIntensity: .9 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uSunView = { value: sun.viewDir };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = 'uniform vec3 uSunView; varying vec3 vWp;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `
        // glitter: a crystal here and there turned just right to throw the sun back at the eye
        vec3 cell = floor(vWp / 1.6); float hsh = fract(sin(dot(cell, vec3(12.99, 78.23, 37.71))) * 43758.55);
        vec3 Vv = normalize(vViewPosition); vec3 Rv = reflect(-Vv, normalize(vNormal));
        float glint = step(.9985, hsh) * pow(max(dot(Rv, normalize(uSunView)), 0.), 30.) * 30. * (1. - smoothstep(800., 4000., length(vViewPosition)));
        gl_FragColor.rgb += vec3(glint) * vec3(1., .98, .94);
        #include <dithering_fragment>`);
    };
    const mesh = new T.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
    const grp = new T.Group(); grp.add(mesh); return grp;
  };

  // ----- a sea of cloud, seen from above -----
  World.custom.clouddeck = P => {
    const size = num(P.size?.[0], 30000), m = new T.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
      uniforms: { uNoise: { value: noiseTex() }, uSunDir: { value: sun.dir }, uSunCol: { value: sun.col }, uZen: { value: sun.zen }, uHor: { value: sun.hor }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uNoise; uniform vec3 uSunDir, uSunCol, uZen, uHor; uniform float uTime; varying vec3 vW;
        float den(vec2 p) { vec2 q = p / 100.; return texture2D(uNoise, q / 2600. + uTime * .0004).r * .6 + texture2D(uNoise, q / 700. - uTime * .0007).g * .3 + texture2D(uNoise, q / 160.).b * .1; }
        void main() {
          float d = den(vW.xz); float e = 40.;
          vec3 N = normalize(vec3(-(den(vW.xz + vec2(e, 0.)) - d) * 90., 1., -(den(vW.xz + vec2(0., e)) - d) * 90.));
          vec3 L = normalize(uSunDir);
          float lit = clamp(dot(N, L) * .7 + .3, 0., 1.);
          vec3 V = normalize(cameraPosition - vW);
          // the tops lit warm by a low sun, the hollows filled with the sky's blue, a silver edge toward the sun
          vec3 col = uSunCol * lit * .55 + mix(uZen, uHor, .6) * .55 + uSunCol * pow(max(dot(-V, L), 0.), 12.) * .6;
          float dist = length(cameraPosition - vW);
          col = mix(col, uHor * 1.1, smoothstep(2000000., 9000000., dist));
          float a = smoothstep(.32, .55, d);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const g = new T.PlaneGeometry(size * M, size * M, 1, 1); g.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(g, m); mesh.renderOrder = 3; mesh.onBeforeRender = () => { m.uniforms.uTime.value = sun.time; };
    const grp = new T.Group(); grp.add(mesh); return grp;
  };

  // ----- a sky on fire: long, streaked clouds lit from below by a sun just gone -----
  World.custom.firesky = P => {
    const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.BackSide, fog: false,
      uniforms: { uNoise: { value: noiseTex() }, uSunDir: { value: sun.dir }, uTime: { value: 0 }, uHot: { value: lin(P.color || '#ff3a1c') }, uPink: { value: lin(P.color2 || '#ff5fa0') },
        uAmount: { value: clamp(num(P.amount, 80) / 100, 0, 1) } },
      vertexShader: `varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform sampler2D uNoise; uniform vec3 uSunDir, uHot, uPink; uniform float uTime, uAmount; varying vec3 vD;
        void main() {
          vec3 d = normalize(vD); if (d.y < -.02) discard;
          float az = atan(d.x, d.z), el = asin(d.y);
          vec3 s = normalize(uSunDir); float saz = atan(s.x, s.z); float da = az - saz; da = atan(sin(da), cos(da));
          // lenticular bands: noise stretched thin across the sky and warped into sweeping curves
          // round the sky without a seam: the noise read on a circle of azimuth
          vec2 ring = vec2(cos(az), sin(az));
          float warp = (texture2D(uNoise, ring * .35 + vec2(el * 1.2, 0.) + uTime * .0006).r - .5) * 2.4;
          vec2 q = ring * .9 + vec2(0., el * 7. + warp);
          float band = texture2D(uNoise, vec2(q.x * .25 + q.y * .02, q.y * .45 + ring.y * .2)).g;
          band = smoothstep(.5, .68, band) * (.5 + .5 * texture2D(uNoise, q * vec2(.9, 2.1)).r);
          float layer = smoothstep(.0, .06, el) * smoothstep(.8, .25, el);
          // lit from below by the sun under the horizon: hot red-orange near it, pink further round, dark violet away
          float near = exp(-da * da * 1.6);
          vec3 col = mix(uPink * .7, uHot * 1.6, near) * max(.15, 1.15 - el * 1.6);
          col = mix(col, vec3(.25, .1, .35), smoothstep(.3, 1.2, abs(da)) * .6 + smoothstep(.25, .6, el) * .4);
          float a = band * layer * uAmount;
          gl_FragColor = vec4(col * 2.2, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const mesh = new T.Mesh(new T.SphereGeometry(18000 * M, 64, 32), m); mesh.renderOrder = -1; mesh.frustumCulled = false;
    mesh.onBeforeRender = (r, sc, cam) => { mesh.position.copy(cam.position); m.uniforms.uTime.value = sun.time; };
    const grp = new T.Group(); grp.add(mesh); return grp;
  };

  // ----- drowned ruins: what is left of towers and machines, half sunk, black against the fog -----
  World.custom.ruin = P => {
    const r = rng(num(P.seed, 7)), h = num(P.size?.[1], 30), w = num(P.size?.[0], 14), grp = new T.Group();
    const mat = once('ruinmat|' + (P.color || ''), () => new T.MeshStandardMaterial({ color: P.color || '#2b2a27', roughness: .85, metalness: .2 }));
    const add = (x, y, z, sx, sy, sz, rx = 0, rz = 0) => { const m = new T.Mesh(new T.BoxGeometry(sx * M, sy * M, sz * M), mat);
      m.position.set(x * M, y * M, z * M); m.rotation.set(rx, r() * .2, rz); m.castShadow = m.receiveShadow = true; grp.add(m); };
    // a broken frame of floors and columns, missing pieces, a tilt
    const floors = Math.max(2, Math.round(h / 4.5)), tilt = (r() - .5) * .15;
    for (let f = 0; f < floors; f++) {
      const y = f * h / floors, keep = 1 - f / floors * .6;
      // walls with holes in them, slabs, the odd beam hanging off
      for (let c = 0; c < 4; c++) if (r() < keep) add((c - 1.5) * w / 4, y + h / floors / 2, (r() - .5) * w * .3, w / 4.6, h / floors * (.6 + r() * .4), w * (.25 + r() * .3), tilt, tilt * .5);
      if (r() < keep) add((r() - .5) * 2, y + h / floors, 0, w * (.6 + r() * .5), .8, w * .6, tilt, tilt);
      if (r() < .4) add((r() - .5) * w, y + h / floors, (r() - .5) * w * .3, w * .5, .3, .4, tilt + (r() - .5) * .6, (r() - .5) * .8);
    }
    // masts and cranes sticking up
    for (let i = 0; i < 3; i++) if (r() < .7) add((r() - .5) * w, h + 4, (r() - .5) * w * .4, .18, 10 + r() * 10, .18, (r() - .5) * .9, (r() - .5) * .9);
    return grp;
  };

  // ----- ground: the floor of a wood, a meadow, or dark land against a bright sky -----
  const floorTex = color => once('floortex|' + color, () => {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), r = rng(31);
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 14000; i++) { const v = r(), a = r() * .25; g.fillStyle = v < .5 ? `rgba(20,16,10,${a})` : v < .8 ? `rgba(90,110,40,${a})` : `rgba(150,120,70,${a})`;
      g.fillRect(r() * S, r() * S, 1 + r() * 5, 1 + r() * 3); }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(80, 80); t.anisotropy = 8; return t;
  });
  World.custom.land = P => {
    const w = num(P.size?.[0], 2000), d = num(P.size?.[2], 2000), seed = num(P.seed, 2), n = 160;
    const g = new T.PlaneGeometry(w * M, d * M, n, n); g.rotateX(-Math.PI / 2); const p = g.attributes.position, rise = num(P.rise, 30);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / M, z = p.getZ(i) / M, edge = Math.min(1, Math.hypot(x / (w / 2), z / (d / 2)));
      p.setY(i, (fbm3(x * .004 + seed, 0, z * .004, 4) * .5 + .5) * rise * edge * edge * M); }
    g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: floorTex(P.color || '#3b3424'), roughness: .95, color: P.tint || '#ffffff' }));
    m.receiveShadow = true; const grp = new T.Group(); grp.add(m); return grp;
  };

  World.PARTS.push('land', 'forest', 'tree', 'rock', 'boulders', 'river', 'cave', 'snowfield', 'clouddeck', 'firesky', 'ruin');
  SceneEd.add('land', { type: 'land', size: [2000, 1, 2000], rise: 30, color: '#3b3424' }, 'Ground');
  SceneEd.add('forest', { type: 'forest', size: [60, 0, 60], count: 40, mix: .7, seed: 1 }, 'Forest');
  SceneEd.add('tree', { type: 'tree', kind: 'fir', seed: 1 }, 'Tree');
  SceneEd.add('rock', { type: 'rock', size: [1.2, 1, 1.2], seed: 1 }, 'Rock');
  SceneEd.add('boulders', { type: 'boulders', size: [20, 1, 20], count: 30, seed: 3 }, 'Boulders');
  SceneEd.add('river', { type: 'river', length: 120, width: 9, flow: 1, rapids: 60, silk: 70, color: '#2f4a3c' }, 'River');
  SceneEd.add('cave', { type: 'cave', size: [26, 40, 26], open: 30, seed: 4 }, 'Cave');
  SceneEd.add('snowfield', { type: 'snowfield', size: [80, 1, 120], seed: 5 }, 'Snowfield');
  SceneEd.add('clouddeck', { type: 'clouddeck', size: [30000, 1, 30000] }, 'Sea of cloud');
  SceneEd.add('firesky', { type: 'firesky', amount: 80, color: '#ff3a1c', color2: '#ff5fa0' }, 'Sky on fire');
  SceneEd.add('ruin', { type: 'ruin', size: [14, 30, 14], seed: 7 }, 'Ruin');

  // ----- scenes -----
  const P = World.PRESETS;
  P.mist = { label: 'Mountain stream', hint: 'White water as a long exposure sees it, mist in the gorge, the first sun on it',
    p: { sky: 'sunset', sunEl: 9, sunAz: 180, sunPower: 110, clouds: 45, wind: 2, ground: 'none', fog: .2, haze: 70, hazeFall: 60, hazeGlow: 140,
      dust: 10, eye: 1.6, heading: 0, pitch: -6, lens: 18, focus: 0, dof: 0, exposure: .2, bloom: 35, grain: 8, fringe: 6, ao: 40, godrays: 50, star: 0, letterbox: 'none' },
    objects: () => [
      { id: 'floor', type: 'land', at: [0, -.4, 0], size: [700, 1, 700], rise: 60, color: '#3a3322' },
      { id: 'river', type: 'river', at: [0, .35, -2], length: 160, width: 11, drop: 9, bend: .6, rapids: 70, silk: 85, color: '#3a5246' },
      { id: 'banksL', type: 'boulders', at: [-10, 0, -40], size: [8, 1, 90], count: 70, big: 2.6, seed: 8 },
      { id: 'banksR', type: 'boulders', at: [10, 0, -40], size: [8, 1, 90], count: 70, big: 2.6, seed: 9 },
      { id: 'big', type: 'rock', at: [2.5, 0, -7], size: [2.2, 1.3, 1.8], seed: 4, wet: true },
      { id: 'woodsL', type: 'forest', at: [-26, -.5, -60], size: [30, 0, 120], count: 140, mix: .8, seed: 2, tall: 1.4 },
      { id: 'woodsR', type: 'forest', at: [26, -.5, -60], size: [30, 0, 120], count: 140, mix: .6, seed: 3, tall: 1.3, leafColor: '#e8c47a' },
      { id: 'slopeL', type: 'forest', at: [-60, 25, -220], size: [80, 0, 200], count: 220, mix: .9, seed: 4, tall: 1.3 },
      { id: 'slopeR', type: 'forest', at: [60, 25, -220], size: [80, 0, 200], count: 220, mix: .9, seed: 5, tall: 1.3 },
    ] };
  P.cavern = { label: 'Cave of light', hint: 'Looking up out of a cave: shafts of sun through dust, green at the opening',
    p: { sky: 'day', sunEl: 62, sunAz: 15, sunPower: 150, clouds: 10, wind: 1, ground: 'none', fog: 0, haze: 45, hazeFall: 400, hazeGlow: 60,
      dust: 12, eye: 2, heading: 0, pitch: 55, lens: 15, focus: 0, dof: 0, exposure: .4, bloom: 45, grain: 10, fringe: 6, ao: 60, godrays: 120, star: 0, letterbox: 'none' },
    objects: () => [{ id: 'cave', type: 'cave', at: [0, -2, -4], size: [26, 46, 26], open: 34, seed: 4, color: '#b39a80' }] };
  P.wintersun = { label: 'Winter sun', hint: 'Deep snow, a trodden path, the sun a star through snowy firs, peaks beyond',
    p: { sky: 'day', sunEl: 12, sunAz: -9, sunPower: 120, clouds: 0, wind: 1, ground: 'none', fog: .1, haze: 4, hazeFall: 300, hazeGlow: 40,
      dust: 0, eye: 1.5, heading: 0, pitch: 7, lens: 16, focus: 0, dof: 0, exposure: .1, bloom: 25, grain: 6, fringe: 8, ao: 30, godrays: 25, star: 120, letterbox: 'none' },
    objects: () => [
      { id: 'snow', type: 'snowfield', at: [0, -1.5, -40], size: [90, 1, 140], seed: 5 },
      { id: 'firs', type: 'forest', at: [-13, -1, -45], size: [12, 0, 60], count: 50, mix: 1, seed: 6, snow: true, tall: 1.3 },
      { id: 'far', type: 'forest', at: [10, -1, -130], size: [120, 0, 40], count: 160, mix: 1, seed: 7, snow: true },
    ] };
  P.firesky = { label: 'Sky on fire', hint: 'Just after sunset: long streaked clouds lit red and pink from below, the land black',
    p: { sky: 'dusk', sunEl: -2.5, sunAz: 5, sunPower: 100, clouds: 0, wind: 0, ground: 'none', fog: 0, haze: 0, eye: 1.6, heading: 0, pitch: 12,
      lens: 24, focus: 0, dof: 0, exposure: .3, bloom: 30, grain: 10, fringe: 4, ao: 0, godrays: 0, star: 0, letterbox: 'none' },
    objects: () => [
      { id: 'sky', type: 'firesky', amount: 90, color: '#ff3a14', color2: '#ff4f9c' },
      { id: 'land', type: 'land', at: [0, -2, 0], size: [4000, 1, 4000], rise: 40, color: '#0b0a09', tint: '#222222' },
      { id: 'hills', type: 'forest', at: [0, -6, -260], size: [600, 0, 60], count: 260, mix: .4, seed: 8, tall: 1.2 },
    ] };
  P.drowned = { label: 'Drowned city', hint: 'Ruins standing in a still, fog-bound sea under a heavy yellow sky, rain on the water',
    p: { sky: 'sulfur', sunEl: 18, sunAz: 0, sunPower: 70, clouds: 90, wind: 1, ground: 'ocean', water: '#1c2018', waves: .08, chop: 30, swell: 0,
      fog: 1.2, haze: 85, hazeFall: 120, hazeGlow: 80, dust: 0, eye: 1.1, heading: 0, pitch: 4, lens: 28, focus: 0, dof: 0, exposure: -.1, bloom: 20, grain: 18, fringe: 8, ao: 0,
      rain: 25, rainPools: true, godrays: 0, star: 0, letterbox: 'none' },
    objects: () => [
      { id: 'near', type: 'ruin', at: [12, -2, -70], size: [16, 14, 14], seed: 3 },
      { id: 'tower', type: 'ruin', at: [20, -2, -160], size: [24, 46, 20], seed: 9 },
      { id: 'a', type: 'ruin', at: [-40, -2, -190], size: [18, 30, 16], seed: 4 },
      { id: 'b', type: 'ruin', at: [-12, -2, -230], size: [16, 26, 14], seed: 5 },
      { id: 'c', type: 'ruin', at: [-80, -2, -260], size: [20, 34, 16], seed: 6 },
    ] };
  P.aboveclouds = { label: 'Above the clouds', hint: 'From a summit at sunset: a sea of cloud to the horizon, peaks standing out of it',
    p: { sky: 'sunset', sunEl: 3, sunAz: 0, sunPower: 120, clouds: 15, wind: 2, ground: 'none', fog: .05, haze: 0, eye: 1.7, heading: -12, pitch: -7,
      lens: 24, focus: 0, dof: 0, exposure: .15, bloom: 40, grain: 8, fringe: 6, ao: 0, godrays: 0, star: 40, letterbox: 'none' },
    objects: () => [
      { id: 'deck', type: 'clouddeck', at: [0, -240, 0], size: [40000, 1, 40000] },
      { id: 'summit', type: 'rock', at: [0, -6, -4], size: [30, 9, 22], seed: 5 },
      { id: 'peak1', type: 'rock', at: [-900, -380, -2600], size: [900, 520, 700], seed: 2, flat: 1.1 },
      { id: 'peak2', type: 'rock', at: [1400, -380, -4200], size: [1300, 640, 900], seed: 8, flat: 1.2 },
      { id: 'peak3', type: 'rock', at: [-2600, -380, -5200], size: [1500, 520, 1100], seed: 3, flat: 1.1 },
    ] };
})();
