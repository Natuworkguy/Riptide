"""Builds Riptide's cars: static/cars/<kind>.glb, one for each kind of car.

Each body is lofted from cross-sections along its length, the way a car is drawn: a side profile (how high its
underside, shoulder and roof are at each point), a plan (how wide it is), and how the sides tuck in under the
shoulder and lean in to the roof. Every face is then given what it is from where it sits: paint, glass, black trim,
the head and tail lights, the grille, the number plates, and the wheel wells cut round the wheels. One wheel (tyre,
alloy rim, brake disc and caliper) comes with each car, at the origin, for the editor to place four times, spin and
steer.

Made here from numbers alone, so the cars are free to use for anything (CC0).

    python3 tools/make_cars.py            # writes static/cars/*.glb
"""
from __future__ import annotations

import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "static" / "cars"


# ---------- a .glb ----------
class GLB:
    def __init__(self):
        self.bin = bytearray()
        self.j = {"asset": {"version": "2.0", "generator": "Riptide make_cars.py"},
                  "buffers": [], "bufferViews": [], "accessors": [], "meshes": [], "nodes": [], "materials": [],
                  "images": [], "textures": [], "samplers": [{"magFilter": 9729, "minFilter": 9987}], "scenes": [{"nodes": []}], "scene": 0}

    def view(self, data: bytes, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        self.bin += data
        if target:
            v["target"] = target
        self.j["bufferViews"].append(v)
        return len(self.j["bufferViews"]) - 1

    def acc(self, arr, kind, comp, target=None, minmax=False):
        dt = {5126: np.float32, 5125: np.uint32}[comp]
        a = np.ascontiguousarray(np.asarray(arr).astype(dt))
        acc = {"bufferView": self.view(a.tobytes(), target), "componentType": comp, "count": int(a.shape[0]), "type": kind}
        if minmax:
            acc["min"], acc["max"] = a.min(0).tolist(), a.max(0).tolist()
        self.j["accessors"].append(acc)
        return len(self.j["accessors"]) - 1

    def texture(self, img: Image.Image) -> int:
        buf = io.BytesIO()
        img.save(buf, "PNG")
        self.j["images"].append({"bufferView": self.view(buf.getvalue()), "mimeType": "image/png"})
        self.j["textures"].append({"source": len(self.j["images"]) - 1, "sampler": 0})
        return len(self.j["textures"]) - 1

    def material(self, name, color, rough=0.5, metal=0.0, tex=None):
        pbr = {"baseColorFactor": [*[c ** 2.2 for c in color], 1.0], "metallicFactor": metal, "roughnessFactor": rough}
        if tex is not None:
            pbr["baseColorTexture"] = {"index": tex}
        self.j["materials"].append({"name": name, "pbrMetallicRoughness": pbr})
        return len(self.j["materials"]) - 1

    def mesh(self, name, parts, parent=None, at=(0, 0, 0)):
        """PARTS: [(material, vertices, triangles, uvs or None)]. Returns the node's index."""
        prims = []
        for mat, v, tri, uv in parts:
            if not len(tri):
                continue
            used = np.unique(tri)
            remap = np.full(len(v), -1)
            remap[used] = np.arange(len(used))
            vv, tt = v[used], remap[tri]
            attrs = {"POSITION": self.acc(vv, "VEC3", 5126, 34962, True), "NORMAL": self.acc(normals(vv, tt), "VEC3", 5126, 34962)}
            if uv is not None:
                attrs["TEXCOORD_0"] = self.acc(uv[used], "VEC2", 5126, 34962)
            prims.append({"attributes": attrs, "indices": self.acc(tt.reshape(-1), "SCALAR", 5125, 34963), "material": mat})
        self.j["meshes"].append({"name": name, "primitives": prims})
        node = {"name": name, "mesh": len(self.j["meshes"]) - 1, "translation": list(map(float, at))}
        self.j["nodes"].append(node)
        i = len(self.j["nodes"]) - 1
        if parent is None:
            self.j["scenes"][0]["nodes"].append(i)
        else:
            self.j["nodes"][parent].setdefault("children", []).append(i)
        return i

    def group(self, name, at=(0, 0, 0)):
        self.j["nodes"].append({"name": name, "translation": list(map(float, at))})
        i = len(self.j["nodes"]) - 1
        self.j["scenes"][0]["nodes"].append(i)
        return i

    def write(self, path: Path):
        self.j["buffers"] = [{"byteLength": len(self.bin)}]
        js = json.dumps(self.j, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        while len(self.bin) % 4:
            self.bin.append(0)
        out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin))
        out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(self.bin), 0x004E4942) + bytes(self.bin)
        path.write_bytes(out)


def normals(v, tri):
    n = np.zeros_like(v)
    fn = np.cross(v[tri[:, 1]] - v[tri[:, 0]], v[tri[:, 2]] - v[tri[:, 0]])
    for k in range(3):
        np.add.at(n, tri[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


# ---------- curves ----------
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def interp(z, pts):
    """A smooth curve through PTS [(z, value)], read at Z (cubic between the points, flat past the ends)."""
    zs, vs = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
    from scipy.interpolate import PchipInterpolator  # pylint: disable=import-outside-toplevel
    return PchipInterpolator(zs, vs, extrapolate=False)(np.clip(z, zs[0], zs[-1]))


def catmull(points, n):
    """N points along a Catmull-Rom curve through POINTS (an array of 2D points), spread by the points' index."""
    p = np.vstack([points[0] * 2 - points[1], points, points[-1] * 2 - points[-2]])
    out = []
    segs = len(points) - 1
    for s in np.linspace(0, segs, n):
        i = min(int(s), segs - 1)
        t = s - i
        p0, p1, p2, p3 = p[i], p[i + 1], p[i + 2], p[i + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.array(out)


def rounded(points, radii, per_corner=6, per_edge=3):
    """Points along the polyline POINTS with each corner rounded to its radius (a quadratic curve), always the same
    number of them whatever the shape, so neighbouring sections line up point for point."""
    P = np.asarray(points, float)
    out, lab = [P[0]], [0.0]
    for i in range(1, len(P) - 1):
        a, c, b = P[i - 1], P[i], P[i + 1]
        la, lb = np.linalg.norm(c - a), np.linalg.norm(b - c)
        r = radii[i]
        da, db = min(r, 0.45 * la), min(r, 0.45 * lb)
        p0 = c + (a - c) / max(la, 1e-9) * da
        p2 = c + (b - c) / max(lb, 1e-9) * db
        last = out[-1]
        for t in np.linspace(0, 1, per_edge + 2)[1:-1]:
            out.append(last + (p0 - last) * t)
            lab.append(i - 0.5)
        for t in np.linspace(0, 1, per_corner):
            out.append((1 - t) ** 2 * p0 + 2 * (1 - t) * t * c + t * t * p2)
            lab.append(i - 0.25 + 0.5 * t)
    last = out[-1]
    for t in np.linspace(0, 1, per_edge + 2)[1:]:
        out.append(last + (P[-1] - last) * t)
        lab.append(len(P) - 1.5 if t < 1 else len(P) - 1.0)
    return np.array(out), np.array(lab)


# ---------- the kinds of car ----------
# lengths in metres along the car (+z is the front); each profile is (z, height) points from the back to the front
KINDS = {
    "sedan": {
        "length": 4.78, "width": 1.84, "wheelbase": 2.84, "wheel_r": 0.335, "front_axle": 1.42, "ride": 0.15,
        "belt": [(-2.39, 0.84), (-2.3, 0.97), (-1.9, 1.02), (-1.2, 0.99), (0.0, 0.96), (1.0, 0.93), (1.35, 0.9), (2.0, 0.8), (2.3, 0.72), (2.39, 0.62)],
        "bottom": [(-2.39, 0.42), (-2.2, 0.3), (-1.75, 0.2), (1.75, 0.2), (2.15, 0.27), (2.39, 0.36)],
        "roof": [(-2.39, 0.0), (-1.95, 0.9), (-1.62, 1.08), (-1.15, 1.37), (-0.55, 1.445), (0.15, 1.44), (0.55, 1.34), (1.15, 1.0), (1.35, 0.85), (2.39, 0.0)],
        "glass_from": -1.62, "glass_to": 1.2, "roof_span": (-1.12, 0.52), "b_pillar": -0.22, "tumble": 0.73, "plan": (3.4, 5.0),
        "doors": [1.12, -0.22, -1.3], "lights": "slim",
    },
    "hatch": {
        "length": 4.28, "width": 1.79, "wheelbase": 2.64, "wheel_r": 0.32, "front_axle": 1.33, "ride": 0.15,
        "belt": [(-2.14, 0.9), (-2.05, 1.0), (-1.6, 1.0), (0.0, 0.95), (0.95, 0.92), (1.25, 0.88), (1.8, 0.8), (2.07, 0.72), (2.14, 0.62)],
        "bottom": [(-2.14, 0.42), (-1.95, 0.3), (-1.55, 0.2), (1.6, 0.2), (1.95, 0.27), (2.14, 0.36)],
        "roof": [(-2.14, 0.0), (-2.06, 1.0), (-1.95, 1.3), (-1.6, 1.44), (-0.6, 1.47), (0.2, 1.45), (0.55, 1.35), (1.1, 1.02), (1.25, 0.9), (2.14, 0.0)],
        "glass_from": -2.0, "glass_to": 1.12, "roof_span": (-1.9, 0.5), "b_pillar": -0.3, "tumble": 0.74, "plan": (3.4, 4.0),
        "doors": [1.02, -0.3, -1.2], "lights": "slim",
    },
    "suv": {
        "length": 4.72, "width": 1.92, "wheelbase": 2.82, "wheel_r": 0.37, "front_axle": 1.4, "ride": 0.21,
        "belt": [(-2.36, 1.02), (-2.25, 1.14), (-1.8, 1.15), (0.0, 1.11), (1.0, 1.08), (1.35, 1.04), (1.95, 0.98), (2.28, 0.9), (2.36, 0.78)],
        "bottom": [(-2.36, 0.52), (-2.15, 0.38), (-1.7, 0.27), (1.7, 0.27), (2.1, 0.36), (2.36, 0.46)],
        "roof": [(-2.36, 0.0), (-2.28, 1.15), (-2.16, 1.55), (-1.85, 1.7), (-0.6, 1.72), (0.3, 1.71), (0.65, 1.6), (1.3, 1.16), (1.45, 1.06), (2.36, 0.0)],
        "glass_from": -2.18, "glass_to": 1.3, "roof_span": (-2.1, 0.6), "b_pillar": -0.25, "tumble": 0.78, "plan": (3.0, 4.0),
        "doors": [1.14, -0.25, -1.32], "lights": "slim",
    },
}
KINDS["taxi"] = dict(KINDS["sedan"], sign=True)


def body(k):
    """The car's body as a grid of rings: (vertices, triangles, uvs, ring count, points a ring)."""
    L, W = k["length"], k["width"] / 2
    n_ring, n_half = 240, 56
    # stations along the length, closer together at the ends where the shape turns fastest
    s = np.linspace(-1, 1, n_ring)
    zs = list(np.sin(s * np.pi / 2) * L / 2)
    # the wheel arches: closely spaced across them, and a pair of sections either side of each edge for a clean step
    for az in (k["front_axle"], k["front_axle"] - k["wheelbase"]):
        e = k["wheel_r"] + 0.055
        zs = [z for z in zs if abs(z - az) > e + 0.02]
        zs += list(az + np.linspace(-e + 0.001, e - 0.001, 48)) + [az - e - 0.002, az + e + 0.002, az - e - 0.02, az + e + 0.02]
    zs = np.array(sorted(zs))
    n_ring = len(zs)
    pf, pr = k["plan"]
    rings = []
    axles = [k["front_axle"], k["front_axle"] - k["wheelbase"]]
    arch = k["wheel_r"] + 0.055
    for z in zs:
        t = abs(z) / (L / 2)
        p = pf if z > 0 else pr
        w = W * max(0.0, 1 - t ** p) ** (1 / p)
        belt, bot = float(interp(z, k["belt"])), float(interp(z, k["bottom"]))
        roof = max(float(interp(z, k["roof"])), belt + 0.035)
        gh = roof - belt                                  # how tall the glass house is here
        # nose and tail: the shoulder rolls down into the bumper
        wr = w * k["tumble"]
        # the wheel wells: where a wheel is, the side starts at the arch above it, and a liner runs in under it
        a_y, x_in = bot, w * 0.8
        for az in axles:
            dz = z - az
            if abs(dz) < arch:
                a_y, x_in = max(bot, k["wheel_r"] + np.sqrt(arch * arch - dz * dz)), min(w * 0.8, k["width"] / 2 - 0.34)
        side_lo = max(a_y + 0.03, bot + (belt - bot) * 0.45)
        ctrl = [
            [0.0, bot], [x_in, bot], [x_in, a_y], [w * 0.975, a_y], [w * 0.995, a_y + 0.012],
            [w * 1.0, side_lo], [w * 1.0, belt - 0.11], [w * 0.975, belt - 0.025],
            [w * 0.93, belt + 0.004],
            [w * 0.91 - (w * 0.91 - wr) * 0.08, belt + min(gh, 0.4) * 0.08 + 0.01],
            [w * 0.91 - (w * 0.91 - wr) * 0.65, belt + gh * 0.68],
            [wr * 0.97, roof - min(gh, 0.5) * 0.05], [wr * 0.6, roof - 0.004], [0.0, roof + 0.012 * min(1, gh / 0.3)],
        ]
        radii = [0, 0.01, 0.01, 0.01, 0.01, 0.12, 0.1, 0.03, 0.02, 0.05, 0.12, 0.08, 0.15, 0]
        ring, lab = rounded(ctrl, radii)
        rings.append(ring)
    rings = np.array(rings)                               # [ring, point, (x, y)]
    # the whole ring: the right half, then the left half mirrored (bottom and top centres shared)
    right, left = rings, rings[:, ::-1][:, 1:-1] * np.array([-1, 1])
    full = np.concatenate([right, left], axis=1)          # a closed loop
    m = full.shape[1]
    labs = np.concatenate([lab, lab[::-1][1:-1]])    # where on the section each point is: its control point number
    v = np.zeros((n_ring, m, 3))
    v[..., 0], v[..., 1], v[..., 2] = full[..., 0], full[..., 1], zs[:, None]
    verts = v.reshape(-1, 3)
    tris = []
    for i in range(n_ring - 1):
        for j in range(m):
            a, b, c, d = i * m + j, i * m + (j + 1) % m, (i + 1) * m + j, (i + 1) * m + (j + 1) % m
            tris += [(a, b, c), (b, d, c)]
    tris = np.array(tris)
    # the two ends are a single line each; close them with a fan to their middle
    uv = np.stack([(verts[:, 2] + L / 2) / L, 1 - verts[:, 1] / 2.0], axis=1)
    return verts, tris, uv, n_ring, m, np.tile(labs, n_ring)


def detail_texture(k, size=(2048, 1024)):
    """Paint seen from the side: white, with the shut lines of the doors, hood and boot as fine dark lines, and the
    door handles' shadows. Mapped by length (u) and height (v = 1 - y/2)."""
    L = k["length"]
    W, H = size
    img = Image.new("L", size, 255)
    d = ImageDraw.Draw(img)
    px = lambda z: (z + L / 2) / L * W  # noqa: E731
    py = lambda y: (1 - y / 2.0) * H  # noqa: E731
    belt_at = lambda z: float(interp(z, k["belt"]))  # noqa: E731
    bot = 0.25
    for z in k["doors"]:
        top = belt_at(z) + 0.5
        d.line([(px(z), py(top)), (px(z), py(bot))], fill=40, width=5)
    # the front door's front edge leans back with the A pillar; the boot and hood lines run across the top
    d.line([(px(k["glass_to"] + 0.05), py(belt_at(k["glass_to"]) + 0.02)), (px(k["glass_to"] + 0.05), py(belt_at(k["glass_to"]) - 0.05))], fill=40, width=5)
    for z in (k["doors"][0], (k["doors"][1] + k["doors"][2]) / 2 - 0.02):
        pass
    # handles: a recess just under the shoulder on each door
    for z0, z1 in ((k["doors"][0], k["doors"][1]), (k["doors"][1], k["doors"][2])):
        zc = z1 + (z0 - z1) * 0.28
        y = belt_at(zc) - 0.085
        d.rounded_rectangle([px(zc) - 0.11 / L * W, py(y + 0.018), px(zc) + 0.11 / L * W, py(y - 0.018)], radius=12, fill=150)
        d.line([(px(zc) - 0.1 / L * W, py(y - 0.02)), (px(zc) + 0.1 / L * W, py(y - 0.02))], fill=70, width=4)
    return img.filter(ImageFilter.GaussianBlur(1.2)).convert("RGB")


def plate_texture():
    img = Image.new("RGB", (520, 112), (236, 236, 228))
    d = ImageDraw.Draw(img)
    d.rectangle([3, 3, 516, 108], outline=(30, 30, 30), width=5)
    from PIL import ImageFont  # pylint: disable=import-outside-toplevel
    font = ImageFont.load_default(size=84)
    d.text((260, 58), "KR 482 TX", fill=(28, 28, 34), font=font, anchor="mm")
    return img.filter(ImageFilter.GaussianBlur(0.8))


def lathe(profile, n=72, axis_x=True):
    """A surface turned round the x axis from PROFILE [(x, r)]. Returns (vertices, triangles)."""
    profile = np.asarray(profile, float)
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    v = []
    for x, r in profile:
        for t in a:
            v.append((x, r * np.cos(t), r * np.sin(t)))
    v = np.array(v)
    tris = []
    for i in range(len(profile) - 1):
        for j in range(n):
            p, q, r_, s = i * n + j, i * n + (j + 1) % n, (i + 1) * n + j, (i + 1) * n + (j + 1) % n
            tris += [(p, q, r_), (q, s, r_)]
    return v, np.array(tris)


def box(c, size, rot=0.0):
    """A box centred at C, of SIZE (x, y, z), turned ROT radians about x."""
    sx, sy, sz = np.array(size) / 2
    v = np.array([(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)], float)
    cr, sr = np.cos(rot), np.sin(rot)
    v = v @ np.array([[1, 0, 0], [0, cr, sr], [0, -sr, cr]])
    f = [(0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5), (0, 4, 5), (0, 5, 1), (2, 3, 7), (2, 7, 6), (0, 2, 6), (0, 6, 4), (1, 5, 7), (1, 7, 3)]
    return v + c, np.array(f)


def merge(parts):
    vs, ts, off = [], [], 0
    for v, t in parts:
        vs.append(v)
        ts.append(t + off)
        off += len(v)
    return np.vstack(vs), np.vstack(ts)


def wheel(k):
    """One wheel at the origin, its axle along x, the outside facing +x: (tyre, rim, disc, caliper) parts."""
    R, rim_r, wdt = k["wheel_r"], k["wheel_r"] * 0.66, 0.235
    h = wdt / 2
    # the tyre: tread with four grooves, rounded shoulders, sidewalls bulging a little, down to the rim
    prof = [(-h + 0.01, rim_r), (-h - 0.006, rim_r + 0.03), (-h - 0.012, (rim_r + R) / 2), (-h - 0.006, R - 0.03), (-h + 0.012, R - 0.006), (-h + 0.03, R)]
    gx = np.linspace(-h + 0.045, h - 0.045, 4)
    for gxi in gx:
        prof += [(gxi - 0.006, R), (gxi - 0.005, R - 0.008), (gxi + 0.005, R - 0.008), (gxi + 0.006, R)]
    prof += [(h - 0.03, R), (h - 0.012, R - 0.006), (h + 0.006, R - 0.03), (h + 0.012, (rim_r + R) / 2), (h + 0.006, rim_r + 0.03), (h - 0.01, rim_r)]
    tyre = lathe(prof, 96)
    # the rim: a barrel, a lip at the face, a dish in to the hub
    rim_prof = [(-h + 0.01, rim_r - 0.004), (-h + 0.02, rim_r - 0.02), (h - 0.03, rim_r - 0.02), (h - 0.01, rim_r + 0.004), (h + 0.004, rim_r + 0.008), (h + 0.008, rim_r - 0.012), (h - 0.004, rim_r - 0.03)]
    rim = lathe(rim_prof, 96)
    hub = lathe([(h - 0.05, 0.0), (h - 0.05, 0.075), (h - 0.012, 0.072), (h - 0.002, 0.05), (h + 0.002, 0.0)], 48)
    # ten spokes in five pairs, each a tapered bar from the hub to the lip, dished back toward the middle
    spokes = []
    for i in range(10):
        a = (i // 2) * 2 * np.pi / 5 + (0.17 if i % 2 else -0.17)
        sv, st = [], []
        for j, (r, x, wd) in enumerate([(0.065, h - 0.03, 0.03), (rim_r - 0.025, h - 0.006, 0.022)]):
            ca, sa = np.cos(a), np.sin(a)
            cen = np.array([x, r * ca, r * sa])
            side = np.array([0, -sa, ca]) * wd / 2
            for dx in (0.0, -0.035):
                for sgn in (-1, 1):
                    sv.append(cen + side * sgn + np.array([dx, 0, 0]))
        sv = np.array(sv)
        # 8 points: [inner/outer][front/back][left/right]
        f = [(0, 1, 5), (0, 5, 4), (2, 6, 7), (2, 7, 3), (0, 4, 6), (0, 6, 2), (1, 3, 7), (1, 7, 5)]
        spokes.append((sv, np.array(f)))
    rim = merge([rim, hub, *spokes])
    disc = lathe([(-0.03, 0.06), (-0.03, R * 0.6), (0.0, R * 0.6), (0.0, 0.06)], 64)
    cal = box(np.array([-0.02, R * 0.48, -R * 0.08]), (0.07, 0.1, 0.16), 0.0)
    return tyre, rim, disc, cal


def plate_heights(k):
    """The heights of the middles of the front and back number plates."""
    L = k["length"]
    return float(interp(np.array([L / 2 - 0.05]), k["bottom"])[0]) + 0.2, float(interp(np.array([-L / 2 + 0.05]), k["belt"])[0]) - 0.33


def build(kind: str, k: dict) -> Path:
    L, Wh = k["length"], k["width"] / 2
    g = GLB()
    v, tri, uv, n_ring, m, lab = body(k)
    sl = lab[tri].mean(1)                                 # each face's place on the section
    # where the wheels are: their centres (z, y), the axles at the wheels' height
    R = k["wheel_r"]
    axles = [k["front_axle"], k["front_axle"] - k["wheelbase"]]
    wy = R
    arch = R + 0.055
    # what each face is
    c = v[tri].mean(1)
    fn = np.cross(v[tri[:, 1]] - v[tri[:, 0]], v[tri[:, 2]] - v[tri[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    belt = interp(c[:, 2], k["belt"])
    bot = interp(c[:, 2], k["bottom"])
    roof = np.maximum(interp(c[:, 2], k["roof"]), belt + 0.035)
    half = np.maximum(1e-6, np.abs(c[:, 0]) / np.maximum(1e-3, np.max(np.abs(v[:, 0]))))
    kind_of = np.full(len(tri), "paint", dtype=object)
    # Section points: 0 under the middle, 1-4 the sill and the wells, 5-7 the side up to the shoulder, 8 the shoulder,
    # 9-11 the side glass up to the roof's edge, 12-13 across the top.
    r0, r1 = k["roof_span"]
    # each face's place along the car, by the pair of sections it lies between, so cuts across it run clean
    ring_z = v[::m, 2]
    rings_of = tri // m
    zc = (ring_z[rings_of.min(1)] + ring_z[rings_of.max(1)]) / 2
    house = (zc > k["glass_from"]) & (zc < k["glass_to"])
    on_roof = (zc >= r0) & (zc <= r1)
    screen = house & ~on_roof
    side_glass = house & (sl > 8.7) & (sl < 10.75)
    kind_of[side_glass] = "glass"
    kind_of[house & on_roof & (sl >= 10.75) & (sl < 11.2)] = "trim_gloss"           # the frame over the side windows
    kind_of[screen & (sl >= 10.75) & (sl < 11.3)] = "trim_gloss"                      # the A and C pillars
    kind_of[screen & (sl >= 11.3)] = "glass"                                           # windscreen and rear window
    kind_of[side_glass & (np.abs(zc - k["b_pillar"]) < 0.05)] = "trim_gloss"
    kind_of[house & (sl > 8.45) & (sl <= 8.7) & (zc < k["glass_to"] - 0.06)] = "chrome"  # the strip under the windows
    # lights, grille and plates at the two ends
    front, rear = zc > L / 2 - 0.5, zc < -L / 2 + 0.45
    kind_of[front & (sl > 6.15) & (sl < 7.55) & (np.abs(c[:, 0]) > Wh * 0.4)] = "headlight"
    kind_of[front & (sl > 7.45) & (sl < 7.6) & (np.abs(c[:, 0]) > Wh * 0.42)] = "drl"
    kind_of[rear & (sl > 6.3) & (sl < 7.5) & (np.abs(c[:, 0]) > Wh * 0.3)] = "taillight"
    kind_of[rear & (sl > 6.85) & (sl < 7.0)] = "taillight"
    kind_of[front & (fn[:, 2] > 0.35) & (sl > 4.6) & (sl < 6.0) & (np.abs(c[:, 0]) < Wh * 0.66)] = "grille"
    kind_of[(sl < 4.5) & ~(front & (sl > 4.0))] = "trim"
    kind_of[sl < 0.9] = "under"
    kind_of[(sl > 0.9) & (sl < 3.1) & (np.abs(c[:, 0]) < Wh - 0.2)] = "liner"
    kind_of[(sl > 1.5) & (sl < 3.6)] = "liner"
    yf, yr = plate_heights(k)
    plate_f = front & (fn[:, 2] > 0.6) & (np.abs(c[:, 0]) < 0.26) & (np.abs(c[:, 1] - yf) < 0.056)
    plate_r = rear & (fn[:, 2] < -0.6) & (np.abs(c[:, 0]) < 0.26) & (np.abs(c[:, 1] - yr) < 0.056)
    kind_of[plate_f | plate_r] = "plate"
    # materials
    tex = g.texture(detail_texture(k))
    plate_tex = g.texture(plate_texture())
    mats = {
        "paint": g.material("paint", (0.7, 0.1, 0.08), 0.32, 0.0, tex),
        "glass": g.material("glass", (0.05, 0.06, 0.07), 0.04),
        "trim_gloss": g.material("trim_gloss", (0.03, 0.03, 0.035), 0.12),
        "trim": g.material("trim", (0.06, 0.06, 0.065), 0.7),
        "under": g.material("under", (0.03, 0.03, 0.03), 0.9),
        "liner": g.material("liner", (0.02, 0.02, 0.02), 0.95),
        "chrome": g.material("chrome", (0.9, 0.9, 0.92), 0.08, 1.0),
        "headlight": g.material("headlight", (0.85, 0.87, 0.9), 0.05, 0.6),
        "drl": g.material("drl", (1.0, 1.0, 1.0), 0.2),
        "taillight": g.material("taillight", (0.42, 0.015, 0.02), 0.04),
        "grille": g.material("grille", (0.025, 0.025, 0.028), 0.45),
        "plate": g.material("plate", (1, 1, 1), 0.5, 0.0, plate_tex),
        "rubber": g.material("rubber", (0.05, 0.05, 0.05), 0.85),
        "alloy": g.material("alloy", (0.78, 0.79, 0.8), 0.28, 1.0),
        "disc": g.material("disc", (0.42, 0.41, 0.4), 0.45, 1.0),
        "caliper": g.material("caliper", (0.12, 0.12, 0.13), 0.5),
        "mirror": g.material("mirror", (0.85, 0.87, 0.9), 0.02, 1.0),
        "sign": g.material("sign", (1.0, 0.92, 0.6), 0.4),
    }
    # plates: their own picture, laid flat across them
    plate_uv = uv.copy()
    parts = []
    for name in ("paint", "glass", "trim_gloss", "trim", "under", "liner", "chrome", "headlight", "drl", "taillight", "grille", "plate"):
        sel = tri[kind_of == name]
        use_uv = uv
        if name == "plate":
            pv = v.copy()
            use_uv = np.stack([(pv[:, 0] + 0.26) / 0.52, np.zeros(len(pv))], 1)
            for front_side, yc in ((True, None), (False, None)):
                pass
            # each vertex's v from its height within whichever plate it is on
            yf, yr = plate_heights(k)
            yc = np.where(pv[:, 2] > 0, yf, yr)
            use_uv[:, 1] = 0.5 - (pv[:, 1] - yc) / 0.112
            use_uv[:, 0] = np.where(pv[:, 2] > 0, use_uv[:, 0], 1 - use_uv[:, 0])
        parts.append((mats[name], v, sel, use_uv))
    # wing mirrors: a housing in paint on a black arm, a mirror glass facing back
    mirror_parts, glass_parts = [], []
    zm = k["glass_to"] - 0.12
    ym = float(interp(zm, k["belt"])) + 0.08
    for sgn in (-1, 1):
        xm = sgn * (Wh * 0.93 + 0.11)
        hv, ht = lathe([(-0.09, 0.0), (-0.085, 0.045), (0.0, 0.07), (0.07, 0.062), (0.09, 0.0)], 24)
        hv = hv[:, [2, 1, 0]] * np.array([1.0, 0.62, 1.0])
        hv[:, 2] *= 0.6
        mirror_parts.append((hv + np.array([xm, ym, zm]), ht))
        gv, gt = box(np.array([xm, ym, zm - 0.06]), (0.16, 0.075, 0.01))
        glass_parts.append((gv, gt))
        av, at = box(np.array([sgn * (Wh * 0.93 + 0.03), ym - 0.03, zm + 0.02]), (0.1, 0.03, 0.06))
        mirror_parts.append((av, at))
    parts.append((mats["paint"], *merge(mirror_parts), np.zeros((sum(len(p[0]) for p in mirror_parts), 2)) + 0.5))
    parts.append((mats["mirror"], *merge(glass_parts), None))
    if k.get("sign"):
        sv, st = box(np.array([0, float(interp(-0.3, k["roof"])) + 0.09, -0.3]), (0.62, 0.16, 0.18))
        parts.append((mats["sign"], sv, st, None))
    g.mesh("body", parts)
    # one wheel, at the origin, for the editor to place, spin and steer
    tyre, rim, disc, cal = wheel(k)
    g.mesh("wheel", [(mats["rubber"], *tyre, None), (mats["alloy"], *rim, None), (mats["disc"], *disc, None), (mats["caliper"], *cal, None)])
    g.j["extras"] = {"wheels": [[sx * (Wh - 0.12), R, az] for az in axles for sx in (-1, 1)], "wheel_r": R, "length": L, "width": k["width"]}
    g.j["scenes"][0]["extras"] = g.j["extras"]
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{kind}.glb"
    g.write(path)
    return path


def main():
    kinds = sys.argv[1:] or list(KINDS)
    for kind in kinds:
        p = build(kind, KINDS[kind])
        print(kind, f"{p.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
