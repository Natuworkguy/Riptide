"""Build Riptide's built-in 3D people from MakeHuman's free (CC0) body.

    python tools/make_people.py PATH/TO/mpfb2/src/mpfb/data PATH/TO/brown_eye.png

MakeHuman's assets (its base mesh, the shape targets that make a man or a woman of
a given build, its skeletons and skin weights) are released under CC0, and MPFB2,
its Blender add-on, carries them. This shapes the base mesh into a young man and a
young woman, places a Mixamo-named skeleton in it (so Riptide's posing tools know
every joint), weights the skin to it, paints a skin texture (lips, nails and eyelids
coloured through MakeHuman's own masks), and gives each a hair cap, eyes, a top,
trousers and shoes cut from MakeHuman's helper meshes. Each is written as one
rigged .glb in static/people/.
"""
from __future__ import annotations

import gzip
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "static" / "people"
SCALE = 0.1  # MakeHuman's units are decimetres


def read_obj(path: Path):
    verts, uvs, faces = [], [], []
    group = ""
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            uvs.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            group = line[2:].strip()
        elif line.startswith("f "):
            corners = []
            for c in line.split()[1:]:
                p = c.split("/")
                corners.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))
            faces.append((group, corners))
    return np.array(verts, float), np.array(uvs, float), faces


def target(path: Path, n: int) -> np.ndarray:
    d = np.zeros((n, 3))
    for line in gzip.open(path, "rt"):
        p = line.split()
        if len(p) == 4 and not line.startswith("#"):
            d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
    return d


def shaped(data: Path, base: np.ndarray, gender: str) -> np.ndarray:
    m = data / "targets" / "macrodetails"
    v = base + target(m / f"universal-{gender}-young-averagemuscle-averageweight.target.gz", len(base))
    for race in ("african", "asian", "caucasian"):
        v += target(m / f"{race}-{gender}-young.target.gz", len(base)) / 3
    return v


def joints(data: Path, v: np.ndarray, faces):
    cubes: dict[str, set] = {}
    for g, corners in faces:
        if g.startswith("joint-"):
            cubes.setdefault(g, set()).update(i for i, _ in corners)
    rig = json.loads((data / "rigs" / "standard" / "rig.mixamo.json").read_text())["bones"]

    def where(spec):
        if spec["strategy"] == "CUBE":
            return v[sorted(cubes[spec["cube_name"]])].mean(0)
        if spec["strategy"] == "MEAN":
            return v[spec["vertex_indices"]].mean(0)
        return v[spec["vertex_index"]]

    bones = {}
    for name, b in rig.items():
        bones[name] = {"head": where(b["head"]), "tail": where(b["tail"]), "parent": b.get("parent") or None}
    return bones


def normals(v, tris):
    n = np.zeros_like(v)
    a, b, c = v[tris[:, 0]], v[tris[:, 1]], v[tris[:, 2]]
    f = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], f)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def smooth_edges(v: np.ndarray, faces: list, rounds: int = 8, keep: float = 0.5) -> None:
    """Round off the ragged edge of a cut-out part (a collar, a hairline, a cuff): each vertex on its open edge moved
    towards the middle of its two neighbours along that edge, ROUNDS times, so the edge follows a smooth curve."""
    from collections import Counter, defaultdict
    edges = Counter()
    for corners in faces:
        ids = [i for i, _ in corners]
        for a, b in zip(ids, ids[1:] + ids[:1]):
            edges[(min(a, b), max(a, b))] += 1
    nb = defaultdict(set)
    for (a, b), n in edges.items():
        if n == 1:
            nb[a].add(b)
            nb[b].add(a)
    ring = [k for k, ns in nb.items() if len(ns) == 2]
    for _ in range(rounds):
        moved = {k: keep * v[k] + (1 - keep) * v[list(nb[k])].mean(0) for k in ring}
        for k, p in moved.items():
            v[k] = p


def skin_texture(data: Path, tone, brows=(), brow_color=(0.1, 0.07, 0.05), size=1024) -> bytes:
    tex = data / "textures"
    mask = lambda name: np.asarray(Image.open(tex / name).convert("L").resize((size, size), Image.BILINEAR), float)[..., None] / 255
    rng = np.random.default_rng(3)
    base = np.ones((size, size, 3)) * np.array(tone, float)
    # a little unevenness, as skin has
    noise = np.asarray(Image.fromarray((rng.random((size // 8, size // 8)) * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC), float)[..., None] / 255
    base *= 0.96 + 0.08 * noise
    # living skin: the face a little warmer and flushed than the body, lips a natural rose, lids a touch darker
    face = mask("mpfb_face.jpg")
    base = base * (1 - face * 0.35) + np.array(tone) * np.array([1.04, 0.93, 0.88]) * face * 0.35
    lips = np.array(tone) * np.array([0.86, 0.6, 0.58])
    base = base * (1 - mask("mpfb_lips.jpg") * 0.6) + lips * mask("mpfb_lips.jpg") * 0.6
    base = base * (1 - mask("mpfb_eyelids.jpg") * 0.3) + np.array(tone) * np.array([0.78, 0.64, 0.6]) * mask("mpfb_eyelids.jpg") * 0.3
    for nails in ("mpfb_fingernails.jpg", "mpfb_toenails.jpg"):
        base = base * (1 - mask(nails) * 0.6) + np.array([0.93, 0.8, 0.78]) * mask(nails) * 0.6
    base = base * (1 - mask("mpfb_ears.jpg") * 0.15) + np.array(tone) * np.array([0.95, 0.75, 0.72]) * mask("mpfb_ears.jpg") * 0.15
    # eyebrows: the skin over each eye, painted in the hair's colour, soft at the edges
    if brows:
        from PIL import ImageDraw
        m = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(m)
        for poly in brows:
            d.polygon([(u * size, (1 - w) * size) for u, w in poly], fill=255)
        bm = np.asarray(m.filter(ImageFilter.GaussianBlur(size / 320)), float)[..., None] / 255 * 0.72
        hairs = 0.85 + 0.3 * np.asarray(Image.fromarray((rng.random((size, size)) * 255).astype(np.uint8)), float)[..., None] / 255
        base = base * (1 - bm) + np.array(brow_color) * hairs * bm
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


# ---------- a .glb ----------
class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {"asset": {"version": "2.0", "generator": "Riptide make_people.py (MakeHuman CC0 assets)"},
                  "buffers": [], "bufferViews": [], "accessors": [], "meshes": [], "nodes": [], "materials": [],
                  "images": [], "textures": [], "samplers": [{"magFilter": 9729, "minFilter": 9987}], "skins": [], "scenes": [{"nodes": []}], "scene": 0}

    def view(self, data: bytes, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def acc(self, arr: np.ndarray, kind: str, comp: int, target=None, minmax=False):
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[comp]
        a = np.ascontiguousarray(arr.astype(dt))
        v = self.view(a.tobytes(), target)
        acc = {"bufferView": v, "componentType": comp, "count": int(a.shape[0]), "type": kind}
        if minmax:
            acc["min"] = a.min(0).tolist()
            acc["max"] = a.max(0).tolist()
        self.j["accessors"].append(acc)
        return len(self.j["accessors"]) - 1

    def image(self, data: bytes, mime: str) -> int:
        v = self.view(data)
        self.j["images"].append({"bufferView": v, "mimeType": mime})
        self.j["textures"].append({"source": len(self.j["images"]) - 1, "sampler": 0})
        return len(self.j["textures"]) - 1

    def material(self, name, color, rough=0.6, tex=None):
        lin = [c ** 2.2 for c in color]  # colours are given as seen (sRGB); glTF keeps them linear
        pbr = {"baseColorFactor": [*lin, 1.0], "metallicFactor": 0.0, "roughnessFactor": rough}
        if tex is not None:
            pbr["baseColorTexture"] = {"index": tex}
        self.j["materials"].append({"name": name, "pbrMetallicRoughness": pbr})
        return len(self.j["materials"]) - 1

    def write(self, path: Path):
        self.j["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(self.j, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        while len(self.bin) % 4:
            self.bin.append(0)
        out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin))
        out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin)
        path.write_bytes(out)


LOOKS = {
    "man": {"gender": "male", "skin": (0.78, 0.56, 0.43), "hair": (0.09, 0.07, 0.06), "top": (0.16, 0.18, 0.22), "pants": (0.20, 0.24, 0.33)},
    "woman": {"gender": "female", "skin": (0.84, 0.62, 0.5), "hair": (0.17, 0.11, 0.07), "top": (0.55, 0.20, 0.22), "pants": (0.12, 0.13, 0.16)},
}


def build(data: Path, eye_png: Path, name: str, look: dict):
    base, uvs, faces = read_obj(data / "3dobjs" / "base.obj")
    v = shaped(data, base, look["gender"])
    bones = joints(data, v, faces)
    v = v * SCALE
    for b in bones.values():
        b["head"] = b["head"] * SCALE
    floor = v[[i for g, c in faces if g == "body" for i, _ in c]][:, 1].min()
    v[:, 1] -= floor
    for b in bones.values():
        b["head"] = b["head"] - [0, floor, 0]

    # which part each face belongs to
    hips_y = bones["mixamorig:Hips"]["head"][1]
    ankle_y = (bones["mixamorig:LeftFoot"]["head"][1] + bones["mixamorig:RightFoot"]["head"][1]) / 2
    neck_y = bones["mixamorig:Neck"]["head"][1]
    head = bones["mixamorig:Head"]["head"]
    hands = [bones[f"mixamorig:{s}Hand"]["head"] for s in ("Left", "Right")]
    # the scalp: the body's skin on the head above the ears, but not the face or the ears (MakeHuman's masks)
    tex = data / "textures"
    face_m = np.asarray(Image.open(tex / "mpfb_face.jpg").convert("L").resize((512, 512)), float) / 255
    ear_m = np.asarray(Image.open(tex / "mpfb_ears.jpg").convert("L").resize((512, 512)), float) / 255
    def masked(m, ti):
        u, w = uvs[ti]
        return m[min(511, int((1 - w) * 512)), min(511, int(u * 512))]
    parts: dict[str, list] = {k: [] for k in ("skin", "sclera", "limbus", "iris", "pupil", "top", "pants", "shoes", "hair")}
    # where the eyes are: their centres, and the level and depth of them
    eye_c = {g: v[sorted({i for gg, c in faces if gg == g for i, _ in c})].mean(0) for g in ("helper-l-eye", "helper-r-eye")}
    eyes_y = np.mean([c[1] for c in eye_c.values()])
    eye_z = np.mean([c[2] for c in eye_c.values()])
    scalp, feet, brows = [], [], []
    for g, corners in faces:
        pts = v[[i for i, _ in corners]]
        ys = pts[:, 1]
        c = pts.mean(0)
        if g == "body":
            parts["skin"].append(corners)
            if ys.max() < ankle_y + 0.05:
                feet.append(corners)
            not_ear = max(masked(ear_m, t) for _, t in corners) < 0.2
            not_face = max(masked(face_m, t) for _, t in corners) < 0.35
            if c[1] > neck_y + 0.03 and not_ear and (
                    c[1] > eyes_y + look.get("hairline", 0.05)
                    or (not_face and c[1] > eyes_y - 0.035 and c[2] < eye_z - 0.07)
                    or (not_face and c[1] > neck_y + 0.045 and c[2] < head[2] - 0.035)):
                scalp.append(corners)
            for ec in eye_c.values():
                if eyes_y + 0.016 < c[1] < eyes_y + 0.027 and abs(c[0] - ec[0]) < 0.024 - abs(c[1] - eyes_y - .021) * .5 and c[2] > eye_z - 0.006:
                    brows.append([uvs[t] for _, t in corners])
        elif g == "helper-tights":
            # a crew neck, cuffs short of the wrists, and the feet left to the shoes
            if ys.max() > neck_y - 0.01 or ys.min() < ankle_y + 0.03:
                continue
            if abs(c[0]) > 0.25 and min(np.linalg.norm(c - h) for h in hands) < 0.07:
                continue
            parts["top" if ys.mean() > hips_y + 0.02 else "pants"].append(corners)
        elif g in eye_c:
            # the eyeball: white, a brown iris and a black pupil, by how far from straight ahead each part is
            d = (c - eye_c[g]) / max(np.linalg.norm(c - eye_c[g]), 1e-9)
            parts["pupil" if d[2] > 0.982 else "iris" if d[2] > 0.86 else "limbus" if d[2] > 0.83 else "sclera"].append(corners)

    # clothes cut along smooth lines, not the mesh's staircase
    smooth_edges(v, parts["top"] + parts["pants"], rounds=10)

    # short hair: the scalp grown out a few millimetres, its own copy of those vertices
    body_tris = np.array([[c[0][0], c[k][0], c[k + 1][0]] for g, c in faces if g == "body" for k in range(1, len(c) - 1)])
    vn = normals(v, body_tris)
    scalp_v = sorted({i for c in scalp for i, _ in c})
    shell = {vi: len(v) + k for k, vi in enumerate(scalp_v)}
    v = np.vstack([v, v[scalp_v] + vn[scalp_v] * look.get("hair_mm", 6) / 1000])
    parts["hair"] = [[(shell[vi], ti) for vi, ti in c] for c in scalp]
    smooth_edges(v, parts["hair"], rounds=12)
    hair_of = {shell[vi]: vi for vi in scalp_v}
    # shoes: the feet grown out and smoothed, so toes do not show through
    foot_v = sorted({i for c in feet for i, _ in c})
    fshell = {vi: len(v) + k for k, vi in enumerate(foot_v)}
    fp = v[foot_v] + vn[foot_v] * 0.007
    nb = {k: set() for k in range(len(foot_v))}
    pos_of = {vi: k for k, vi in enumerate(foot_v)}
    for c in feet:
        ids = [pos_of[i] for i, _ in c]
        for a in ids:
            nb[a].update(b for b in ids if b != a)
    for _ in range(6):
        fp = np.array([0.5 * fp[k] + 0.5 * fp[list(nb[k])].mean(0) if nb[k] else fp[k] for k in range(len(fp))])
    v = np.vstack([v, fp])
    parts["shoes"] = [[(fshell[vi], ti) for vi, ti in c] for c in feet]
    hair_of.update({fshell[vi]: vi for vi in foot_v})

    # vertices: one for each (position, texture point) a face uses
    index: dict[tuple, int] = {}
    src, tex = [], []
    prims = {}
    for part, fs in parts.items():
        tris = []
        for corners in fs:
            ids = []
            for vi, ti in corners:
                key = (vi, ti)
                if key not in index:
                    index[key] = len(src)
                    src.append(vi)
                    tex.append(uvs[ti] if ti >= 0 else (0, 0))
                ids.append(index[key])
            for k in range(1, len(ids) - 1):
                tris.append((ids[0], ids[k], ids[k + 1]))
        prims[part] = np.array(tris, np.uint32)
    src = np.array(src)
    pos = v[src]
    alltri = np.concatenate([np.array([[src[a], src[b], src[c]] for a, b, c in t]) for t in prims.values() if len(t)])
    nrm = normals(v, alltri)[src]
    uv = np.array(tex, float)
    uv[:, 1] = 1 - uv[:, 1]

    # an eye bone in the middle of each eyeball, under the head, that the eyeball (and only it) turns with: so the
    # eyes can be posed like any joint, or aimed (Riptide's Look)
    eye_verts = {}
    for side, g in (("Left", "helper-l-eye"), ("Right", "helper-r-eye")):
        bones[f"mixamorig:{side}Eye"] = {"head": eye_c[g], "tail": eye_c[g] + [0, 0, 0.02], "parent": "mixamorig:Head"}
        for gg, c in faces:
            if gg == g:
                eye_verts.update({i: f"mixamorig:{side}Eye" for i, _ in c})

    # skin weights: the four strongest bones of each vertex
    names = list(bones)
    w = json.loads((data / "rigs" / "standard" / "weights.mixamo.json").read_text())["weights"]
    per = [[] for _ in range(len(v))]
    for bname, pairs in w.items():
        if bname in bones:
            bi = names.index(bname)
            for vi, wt in pairs:
                per[vi].append((wt, bi))
    J = np.zeros((len(src), 4), np.uint16)
    W = np.zeros((len(src), 4), np.float32)
    head_i = names.index("mixamorig:Head")
    for k, vi in enumerate(src):
        top = [(1.0, names.index(eye_verts[vi]))] if vi in eye_verts else sorted(per[hair_of.get(vi, vi)], reverse=True)[:4] or [(1.0, head_i)]
        tot = sum(x for x, _ in top)
        for s, (wt, bi) in enumerate(top):
            J[k, s] = bi
            W[k, s] = wt / tot

    g = GLB()
    a_pos = g.acc(pos, "VEC3", 5126, 34962, minmax=True)
    a_nrm = g.acc(nrm, "VEC3", 5126, 34962)
    a_uv = g.acc(uv, "VEC2", 5126, 34962)
    a_j = g.acc(J, "VEC4", 5123, 34962)
    a_w = g.acc(W, "VEC4", 5126, 34962)
    skin_tex = g.image(skin_texture(data, look["skin"], brows, look["hair"]), "image/jpeg")
    mats = {
        "skin": g.material("skin", (1, 1, 1), 0.55, skin_tex),
        "shoes": g.material("shoes", (0.06, 0.06, 0.07), 0.7),
        "top": g.material("top", look["top"], 0.85),
        "pants": g.material("pants", look["pants"], 0.9),
        "hair": g.material("hair", look["hair"], 0.75),
        "sclera": g.material("sclera", (0.86, 0.82, 0.78), 0.1),
        "limbus": g.material("limbus", (0.16, 0.1, 0.06), 0.1),
        "iris": g.material("iris", look.get("iris", (0.36, 0.22, 0.12)), 0.1),
        "pupil": g.material("pupil", (0.02, 0.02, 0.02), 0.05),
    }
    prim_list = []
    for part, tris in prims.items():
        if not len(tris):
            continue
        prim_list.append({"attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv, "JOINTS_0": a_j, "WEIGHTS_0": a_w},
                          "indices": g.acc(tris.reshape(-1), "SCALAR", 5125, 34963), "material": mats[part]})
    g.j["meshes"].append({"name": name, "primitives": prim_list})

    # the skeleton: each bone at its head, turned as its rest pose (none), its children placed from it
    node_of = {}
    for bname in names:
        node_of[bname] = len(g.j["nodes"])
        g.j["nodes"].append({"name": bname})
    for bname, b in bones.items():
        parent = b["parent"]
        at = b["head"] - (bones[parent]["head"] if parent else 0)
        g.j["nodes"][node_of[bname]]["translation"] = [float(x) for x in at]
        if parent:
            g.j["nodes"][node_of[parent]].setdefault("children", []).append(node_of[bname])
    ibm = np.zeros((len(names), 16), np.float32)
    for k, bname in enumerate(names):
        m = np.eye(4)
        m[:3, 3] = -bones[bname]["head"]
        ibm[k] = m.T.reshape(-1)
    g.j["skins"].append({"joints": [node_of[n] for n in names], "inverseBindMatrices": g.acc(ibm, "MAT4", 5126),
                         "skeleton": node_of["mixamorig:Hips"]})
    mesh_node = len(g.j["nodes"])
    g.j["nodes"].append({"name": name, "mesh": 0, "skin": 0})
    roots = [node_of[n] for n, b in bones.items() if not b["parent"]]
    holder = len(g.j["nodes"])
    g.j["nodes"].append({"name": f"{name}-rig", "children": [mesh_node, *roots]})
    g.j["scenes"][0]["nodes"] = [holder]
    g.j["extras"] = {"license": "CC0 1.0: MakeHuman's assets, via MPFB2", "height_m": float(pos[:, 1].max())}
    OUT.mkdir(parents=True, exist_ok=True)
    g.write(OUT / f"{name}.glb")
    print(name, f"{(OUT / f'{name}.glb').stat().st_size / 1e6:.1f} MB", f"{pos[:, 1].max():.2f} m tall", len(src), "vertices")


if __name__ == "__main__":
    data, eye = Path(sys.argv[1]), Path(sys.argv[2])
    for name, look in LOOKS.items():
        build(data, eye, name, look)
