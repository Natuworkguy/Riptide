// Build Riptide's built-in 3D people (static/people/man.glb and woman.glb) from the Microsoft Rocketbox Avatar
// Library (MIT): https://github.com/microsoft/Microsoft-Rocketbox
//
//   node tools/make_people_rocketbox.js SRC
//
// SRC holds, for each avatar, its .fbx (Assets/Avatars/Adults/<Name>/Export/<Name>.fbx) and its textures
// (Assets/Avatars/Adults/<Name>/Textures/<code>_{body,head}_{color,normal}.tga and <code>_opacity_color.tga),
// already turned into <code>_body_color.jpg, <code>_body_normal.jpg, <code>_head_color.jpg, <code>_head_normal.jpg
// and <code>_opacity_color.png. Riptide must be running (python server.py): the conversion runs in its page, with
// its own three.js.
//
// Each avatar is turned to face +Z in metres, its arms let down from the T pose to hang at its sides, and its
// skin baked in that pose. Its skeleton is then rebuilt with every bone unturned at rest (so a joint turned about
// X, Y or Z turns about the world's axes, the way static/actors.js drives a person), named the way Mixamo names
// them (so the posing tools know every joint), with the legs hung from the hips rather than the spine.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = path.join(__dirname, '..', 'static', 'people');
const AVATARS = [
  { out: 'woman.glb', fbx: 'Female_Adult_02.fbx', code: 'f002' },
  { out: 'man.glb', fbx: 'Male_Adult_02.fbx', code: 'm003' },
];
const URL = process.env.RIPTIDE_URL || 'http://127.0.0.1:5173/';

(async () => {
  if (!SRC) { console.error('usage: node tools/make_people_rocketbox.js SRC'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log(m.text()));
  await page.goto(URL + '?window=make-people');
  await page.waitForFunction(() => window.RiptideThree && window.RiptideThree.FBXLoader && window.RiptideThree.GLTFExporter, null, { timeout: 30000 });
  const b64 = f => fs.readFileSync(path.join(SRC, f)).toString('base64');
  for (const a of AVATARS) {
    const tex = {};
    for (const k of ['body_color.jpg', 'body_normal.jpg', 'head_color.jpg', 'head_normal.jpg', 'opacity_color.png'])
      tex[k] = `data:image/${k.endsWith('png') ? 'png' : 'jpeg'};base64,` + b64(`${a.code}_${k}`);
    const glb = await page.evaluate(convert, { fbx: b64(a.fbx), tex });
    fs.writeFileSync(path.join(OUT, a.out), Buffer.from(glb, 'base64'));
    console.log('wrote', a.out, Math.round(fs.statSync(path.join(OUT, a.out)).size / 1024), 'KB');
  }
  await browser.close();
})();

// runs in the page
async function convert({ fbx, tex }) {
  const T = window.RiptideThree;
  const buf = Uint8Array.from(atob(fbx), c => c.charCodeAt(0)).buffer;
  const src = new T.FBXLoader().parse(buf, '');
  let mesh = null; src.traverse(n => { if (n.isSkinnedMesh && !mesh) mesh = n; });
  const byName = n => mesh.skeleton.bones.find(b => b.name === n);
  const wp = o => o.getWorldPosition(new T.Vector3());

  // centimetres to metres, and turned to face +Z (from the head to between the eyes)
  src.scale.setScalar(.01); src.updateMatrixWorld(true);
  const head = wp(byName('Bip01_Head')), eyes = wp(byName('Bip01_LEye')).add(wp(byName('Bip01_REye'))).multiplyScalar(.5);
  src.rotation.y = -Math.atan2(eyes.x - head.x, eyes.z - head.z); src.updateMatrixWorld(true);
  // standing on the ground, centred over its feet
  const box = new T.Box3().setFromObject(src), c = box.getCenter(new T.Vector3());
  src.position.set(-c.x, -box.min.y, -c.z); src.updateMatrixWorld(true);

  // the arms let down from the T pose, a little out from the body, palms in
  for (const side of ['L', 'R']) {
    const up = byName(`Bip01_${side}_UpperArm`), fore = byName(`Bip01_${side}_Forearm`);
    const d = wp(fore).sub(wp(up)).normalize(), s = Math.sign(d.x) || 1, out = 7 * Math.PI / 180;
    const turn = new T.Quaternion().setFromUnitVectors(d, new T.Vector3(s * Math.sin(out), -Math.cos(out), 0));
    const world = up.getWorldQuaternion(new T.Quaternion()), parent = up.parent.getWorldQuaternion(new T.Quaternion());
    up.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
    src.updateMatrixWorld(true);
  }

  // the skin baked in that pose, in metres
  const g0 = mesh.geometry, n = g0.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), v = new T.Vector3(), w = new T.Vector3();
  const skin = (x, y, z) => { v.set(x, y, z); mesh.applyBoneTransform(i, v); return v.applyMatrix4(mesh.matrixWorld); };
  var i;
  for (i = 0; i < n; i++) {
    const P = g0.attributes.position, N = g0.attributes.normal;
    const p = skin(P.getX(i), P.getY(i), P.getZ(i)).clone();
    const q = skin(P.getX(i) + N.getX(i) * .1, P.getY(i) + N.getY(i) * .1, P.getZ(i) + N.getZ(i) * .1);
    w.subVectors(q, p).normalize();
    pos.set([p.x, p.y, p.z], i * 3); nor.set([w.x, w.y, w.z], i * 3);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  g.setAttribute('uv', g0.attributes.uv.clone());
  g.setAttribute('skinIndex', g0.attributes.skinIndex.clone());
  g.setAttribute('skinWeight', g0.attributes.skinWeight.clone());
  if (g0.index) g.setIndex(g0.index.clone());
  for (const gr of g0.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);

  // the skeleton again, every bone unturned at rest, named as Mixamo names them
  const FINGER = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
  const rename = name => {
    const m = name.match(/^Bip01_([LR])_(.+)$/);
    if (m) {
      const S = m[1] === 'L' ? 'Left' : 'Right', part = m[2];
      const simple = { Clavicle: 'Shoulder', UpperArm: 'Arm', Forearm: 'ForeArm', Hand: 'Hand', Thigh: 'UpLeg', Calf: 'Leg', Foot: 'Foot', Toe0: 'ToeBase' }[part];
      if (simple) return 'mixamorig' + S + simple;
      const f = part.match(/^Finger(\d)(\d?)$/);
      if (f) return `mixamorig${S}Hand${FINGER[+f[1]]}${f[2] === '' ? 1 : +f[2] + 1}`;
    }
    return { Bip01: 'Root', Bip01_Pelvis: 'mixamorigHips', Bip01_Spine: 'mixamorigSpine', Bip01_Spine1: 'mixamorigSpine1', Bip01_Spine2: 'mixamorigSpine2',
      Bip01_Neck: 'mixamorigNeck', Bip01_Head: 'mixamorigHead', Bip01_LEye: 'mixamorigLeftEye', Bip01_REye: 'mixamorigRightEye' }[name] || name.replace(/^Bip01_/, 'face_');
  };
  const old = mesh.skeleton.bones, bones = old.map(b => { const nb = new T.Bone(); nb.name = rename(b.name); return nb; });
  const pelvis = old.findIndex(b => b.name === 'Bip01_Pelvis');
  const parentOf = (b, k) => /_(L|R)_Thigh$/.test(b.name) ? pelvis : old.indexOf(b.parent);
  const roots = [];
  old.forEach((b, k) => {
    const p = parentOf(b, k), here = wp(b);
    if (p >= 0) { bones[k].position.copy(here.sub(wp(old[p]))); bones[p].add(bones[k]); }
    else { bones[k].position.copy(here); roots.push(bones[k]); }
  });

  const load = (url, srgb, mime) => new Promise(res => new T.TextureLoader().load(url, t => { if (srgb) t.colorSpace = T.SRGBColorSpace; t.userData.mimeType = mime; res(t); }));
  const mats = {
    body: new T.MeshStandardMaterial({ name: 'body', map: await load(tex['body_color.jpg'], 1, 'image/jpeg'), normalMap: await load(tex['body_normal.jpg'], 0, 'image/jpeg'), roughness: .78, metalness: 0 }),
    head: new T.MeshStandardMaterial({ name: 'head', map: await load(tex['head_color.jpg'], 1, 'image/jpeg'), normalMap: await load(tex['head_normal.jpg'], 0, 'image/jpeg'), roughness: .55, metalness: 0 }),
    hair: new T.MeshStandardMaterial({ name: 'hair', map: await load(tex['opacity_color.png'], 1, 'image/png'), roughness: .7, metalness: 0, alphaTest: .45, side: T.DoubleSide }),
  };
  const slot = m => /opacity/i.test(m.name) ? mats.hair : /head/i.test(m.name) ? mats.head : mats.body;
  const materials = [].concat(mesh.material).map(slot);

  const root = new T.Group(); root.name = 'Person';
  const sm = new T.SkinnedMesh(g, materials); sm.name = 'Body';
  root.add(sm); for (const r of roots) root.add(r);
  root.updateMatrixWorld(true);
  sm.bind(new T.Skeleton(bones));
  const out = await new T.GLTFExporter().parseAsync(root, { binary: true });
  let s = ''; const u = new Uint8Array(out);
  for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
  return btoa(s);
}
