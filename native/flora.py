"""Trees, grass and rocks for the native renderer, made procedurally (nothing to download).

Each is a plain mesh (vertices, faces, and a per-corner UV where the material needs one), built with numpy and
handed to Blender by mesh_object. They are made once and placed thousands of times as instances, which costs
almost no memory: a whole forest is one spruce of each shape plus a list of places.
Blender's axes: x right, y away from the camera's start, z up; metres.
"""

from __future__ import annotations

import math

import numpy as np


def mesh_object(bpy, name, verts, faces, uvs=None, collection=None, smooth=False):
    """A Blender object from VERTS (n x 3) and FACES (a list of index lists), optionally with UVS per corner."""
    me = bpy.data.meshes.new(name)
    verts = np.asarray(verts, np.float32)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.ravel())
    sizes = np.array([len(f) for f in faces], np.int32)
    me.loops.add(int(sizes.sum()))
    me.loops.foreach_set("vertex_index", np.concatenate(faces).astype(np.int32))
    me.polygons.add(len(faces))
    me.polygons.foreach_set("loop_start", np.r_[0, np.cumsum(sizes)[:-1]].astype(np.int32))
    me.update(calc_edges=True)
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", np.asarray(uvs, np.float32).ravel())
    me.polygons.foreach_set("use_smooth", np.full(len(faces), smooth))
    me.validate()
    ob = bpy.data.objects.new(name, me)
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


class Builder:
    """Collects quads and triangles with their UVs."""

    def __init__(self):
        self.v, self.f, self.uv = [], [], []

    def add(self, pts, faces, uvs):
        base = len(self.v)
        self.v.extend(pts)
        for face, uv in zip(faces, uvs):
            self.f.append([base + i for i in face])
            self.uv.extend(uv)

    def strip(self, left, right, u0=0.0, u1=1.0):
        """A ribbon between two rows of points, v running along it 0 to 1."""
        n = len(left)
        pts = list(left) + list(right)
        faces, uvs = [], []
        for i in range(n - 1):
            a, b = i / (n - 1), (i + 1) / (n - 1)
            faces.append([i, i + 1, n + i + 1, n + i])
            uvs.append([(u0, a), (u0, b), (u1, b), (u1, a)])
        self.add(pts, faces, uvs)


def _unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) or 1)


# ----- a spruce -----
def spruce(seed: int, height: float = 18.0):
    """A Norway spruce: a straight tapering trunk, whorls of branches drooping and turning up at their tips, each
    branch a frond with side shoots, so the outline is ragged and the sky shows through. The fronds' UVs run u
    across (0 to 1) and v along, for the needle material. Returns the trunk's and the needles' meshes apart, as
    (verts, faces, uvs) each."""
    rng = np.random.default_rng(seed)
    H = height * (.85 + rng.random() * .3)
    base_r = H * .011 + .08
    # trunk: 10 sides, tapering to nothing at the top
    trunk = Builder()
    sides, rings = 10, 8
    for k in range(rings):
        z0, z1 = H * k / rings, H * (k + 1) / rings
        r0, r1 = base_r * (1 - k / rings) ** .9, base_r * (1 - (k + 1) / rings) ** .9 + .005
        for s in range(sides):
            a0, a1 = 2 * math.pi * s / sides, 2 * math.pi * (s + 1) / sides
            p = [(r0 * math.cos(a0), r0 * math.sin(a0), z0), (r0 * math.cos(a1), r0 * math.sin(a1), z0),
                 (r1 * math.cos(a1), r1 * math.sin(a1), z1), (r1 * math.cos(a0), r1 * math.sin(a0), z1)]
            trunk.add(p, [[0, 1, 2, 3]], [[(s / sides, k / rings), ((s + 1) / sides, k / rings),
                                           ((s + 1) / sides, (k + 1) / rings), (s / sides, (k + 1) / rings)]])
    needles = Builder()
    crown_base = H * (.12 + rng.random() * .1)
    widest = H * (.2 + rng.random() * .04)
    z = crown_base
    whorl = 0
    while z < H * .985:
        f = (z - crown_base) / (H - crown_base)              # 0 at the bottom of the crown, 1 at the top
        length = widest * (1 - f) ** .95 * (.85 + rng.random() * .3) + .15
        n_br = int(5 + rng.integers(0, 3))
        turn = rng.random() * 2 * math.pi
        for b in range(n_br):
            if rng.random() < .12 * (1 - f):                  # a branch lost, low down, for gaps
                continue
            a = turn + 2 * math.pi * b / n_br + rng.normal(0, .18)
            out = np.array([math.cos(a), math.sin(a), 0.0])
            side = np.array([-math.sin(a), math.cos(a), 0.0])
            L = length * (.8 + rng.random() * .35)
            droop = .25 + .35 * (1 - f) + rng.normal(0, .05)  # lower branches hang more
            pts = []
            segs = 6
            for i in range(segs + 1):
                u = i / segs
                # out from the trunk, sagging, the tip turning up again
                pts.append(out * L * u + np.array([0, 0, z]) + np.array([0, 0, -droop * L * (u * u * .9) + .35 * L * u ** 4 * .4]))
            pts = np.array(pts)
            _frond(needles, pts, side, L, rng, main=True)
            # side shoots from the branch, alternating, swept forward
            k_side = int(3 + L * 2.2)
            for j in range(k_side):
                u = .2 + .75 * (j + rng.random() * .5) / k_side
                if u >= .97:
                    continue
                i = min(int(u * segs), segs - 1)
                frac = u * segs - i
                at = pts[i] + (pts[i + 1] - pts[i]) * frac
                along = _unit(pts[i + 1] - pts[i])
                s = 1 if j % 2 else -1
                d = _unit(along * .9 + side * s * 1.0 + np.array([0, 0, -.25 - rng.random() * .2]))
                sl = L * (1 - u) * (.38 + rng.random() * .2) + .12
                sp = np.array([at + d * sl * t + np.array([0, 0, -.15 * sl * t * t]) for t in np.linspace(0, 1, 4)])
                _frond(needles, sp, _unit(np.cross(d, [0, 0, 1])), sl, rng, main=False)
        whorl += 1
        z += (.28 + rng.random() * .2) * (1 - .45 * f) * H / 18
    # the leader at the top
    top = np.array([[0, 0, H * .96 + .5 * t] for t in np.linspace(0, 1, 3)])
    _frond(needles, top, np.array([1.0, 0, 0]), .6, rng, main=True)
    return (trunk.v, trunk.f, trunk.uv), (needles.v, needles.f, needles.uv)


def _frond(b: Builder, pts, side, L, rng, main):
    """A flat spray of needles along PTS: a ribbon widest a third of the way out, tilted a little, its edge
    broken so it does not read as a plank."""
    n = len(pts)
    w0 = (.3 if main else .2) * min(1.5, .55 + L * .35)
    tilt = np.array([0, 0, .25 + rng.random() * .3])
    s = _unit(side + tilt)
    left, right = [], []
    for i, p in enumerate(pts):
        u = i / (n - 1)
        w = w0 * math.sin(math.pi * min(1, u * 1.25 + .1)) ** .7 * (.75 + rng.random() * .5) + .015
        left.append(p - s * w * .5)
        right.append(p + s * w * .5)
    b.strip(left, right)


# ----- grass -----
def ww_fold(w: float, t: float) -> float:
    """How deep a blade's V fold is, T of the way up: about half its width at the base, nothing at the tip."""
    return w * .55 * (1 - t) ** 1.2


def grass_clump(seed: int, blades: int = 56):
    """A tuft of meadow grass: thin blades a few millimetres wide, from short and curled to knee high, leaning
    out from the middle and bending under their own weight, each folded along its midrib; a few taller stems with
    seed heads. UV u is the blade's number (0 to 99; 100 a stem, 101 a seed head) plus where across it, v runs up
    it."""
    rng = np.random.default_rng(seed)
    b = Builder()
    for _ in range(blades):
        a = rng.random() * 2 * math.pi
        r = rng.random() ** .6 * .07
        base = np.array([math.cos(a) * r, math.sin(a) * r, 0])
        h = .1 + rng.random() ** 1.8 * .55
        lean = abs(rng.normal(.35, .25)) * (1 + (h > .4) * .4)
        dirn = np.array([math.cos(a + rng.normal(0, .4)), math.sin(a + rng.normal(0, .4)), 0])
        face = np.array([-dirn[1], dirn[0], 0])
        twist = rng.normal(0, .5)
        w = .0022 + rng.random() * .0025
        left, mid, right = [], [], []
        segs = 6
        prev = base
        for i in range(segs + 1):
            t = i / segs
            # bending further over towards the tip, as a long blade does
            p = base + dirn * lean * h * t ** 2.2 + np.array([0, 0, h * t * (1 - .45 * lean * t * t)])
            f = _unit(face * math.cos(twist * t) + np.array([0, 0, 1.0]) * math.sin(twist * t) * .3)
            along = _unit(p - prev) if i else np.array([0, 0, 1.0])
            prev = p
            # folded along its midrib into a shallow V, as a grass blade is, the fold flattening towards the tip
            fold = _unit(np.cross(f, along)) * ww_fold(w, t)
            ww = w * (1 - t ** 1.5) + .0003
            left.append(p - f * ww)
            mid.append(p - fold)
            right.append(p + f * ww)
        # UV u: the blade's own number (whole part, for its colour) and where across it (fraction, for its veins)
        k = float(int(rng.random() * 100))
        b.strip(left, mid, k, k + .5)
        b.strip(mid, right, k + .5, k + .999)
    for _ in range(int(rng.integers(0, 4))):
        # a seed stem: a thin stalk and an oat-like head
        a = rng.random() * 2 * math.pi
        top = np.array([math.cos(a) * .12, math.sin(a) * .12, .55 + rng.random() * .35])
        base = np.array([math.cos(a) * .02, math.sin(a) * .02, 0])
        mid = (base + top) / 2 + np.array([0, 0, .03])
        face = _unit(np.array([-math.sin(a), math.cos(a), 0]))
        pts = [base + (mid - base) * t * 2 if t < .5 else mid + (top - mid) * (t - .5) * 2 for t in np.linspace(0, 1, 6)]
        b.strip([p - face * .0012 for p in pts], [p + face * .0012 for p in pts], 100.0, 100.999)
        head = [top + np.array([math.cos(a) * .015, math.sin(a) * .015, -.02]) * t * 4 for t in np.linspace(0, 1, 4)]
        b.strip([p - face * .006 * (1 - abs(i - 1.5) / 2) for i, p in enumerate(head)],
                [p + face * .006 * (1 - abs(i - 1.5) / 2) for i, p in enumerate(head)], 101.0, 101.999)
    return b.v, b.f, b.uv


# ----- rocks -----
def rock(seed: int, detail: int = 3):
    """A boulder: a sphere knocked flat on a few sides, lumpy, wider than tall."""
    rng = np.random.default_rng(seed)
    t = (1 + 5 ** .5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
         (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
         (8, 6, 7), (9, 8, 1)]
    verts = [np.array(p, float) / np.linalg.norm(p) for p in v]
    faces = [list(x) for x in f]
    for _ in range(detail):
        cache, nf = {}, []

        def mid(i, j):
            key = (min(i, j), max(i, j))
            if key not in cache:
                verts.append(_unit(verts[i] + verts[j]))
                cache[key] = len(verts) - 1
            return cache[key]
        for a, b_, c in faces:
            ab, bc, ca = mid(a, b_), mid(b_, c), mid(c, a)
            nf += [[a, ab, ca], [b_, bc, ab], [c, ca, bc], [ab, bc, ca]]
        faces = nf
    V = np.array(verts)
    cuts = [(_unit(rng.normal(size=3)), .55 + rng.random() * .3) for _ in range(6)]
    r = np.ones(len(V))
    for d, k in cuts:
        r = np.minimum(r, k / np.maximum(V @ d, 1e-3))
    lump = 1 + .06 * np.sin(V @ rng.normal(size=3) * 7) + .04 * np.sin(V @ rng.normal(size=3) * 13)
    V = V * np.clip(r, .45, 1)[:, None] * lump[:, None]
    V[:, 2] *= .62
    V[:, 0] *= 1 + rng.random() * .3
    return V.tolist(), faces, None


# ----- a spruce branchlet, drawn needle by needle, for the branch cards -----
def needle_texture(seed: int = 3, w: int = 1024, h: int = 2048):
    """An RGBA picture (h x w x 4, 0 to 1) of a spruce branch seen from above: a twig up the middle from the
    trunk (v 0) to the tip (v 1), side twigs swept towards the tip and shorter towards it, and every twig covered
    in short stiff needles; bare near the trunk, as a spruce's inner branches are. Drawn twice the size and
    halved, for clean edges. Cards along each branch show it, cut out by its alpha."""
    rng = np.random.default_rng(seed)
    W, H = w * 2, h * 2
    col = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    disc = [(dy, dx) for dy in range(-2, 3) for dx in range(-2, 3) if dx * dx + dy * dy <= 4]

    def line(x0, y0, x1, y1, r, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 1.5) + 2
        xs, ys = np.linspace(x0, x1, n), np.linspace(y0, y1, n)
        rad = np.linspace(r, r * .45, n)
        for dy, dx in disc:
            if dx * dx + dy * dy > (r + .5) ** 2:
                continue
            keep = dx * dx + dy * dy <= (rad + .5) ** 2
            px = np.clip((xs[keep] + dx).astype(int), 0, W - 1)
            py = np.clip((ys[keep] + dy).astype(int), 0, H - 1)
            alpha[py, px] = 1
            col[py, px] = c

    def needles(x0, y0, x1, y1, density, length, spread, c0):
        """Needles all along a twig from (x0, y0) to (x1, y1), angled forward, on both sides and on top."""
        L = math.hypot(x1 - x0, y1 - y0)
        ux, uy = (x1 - x0) / (L or 1), (y1 - y0) / (L or 1)
        for t in np.arange(0, 1, density / max(L, 1)):
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for side in (-1, 1, 0):
                if side == 0 and rng.random() < .5:
                    continue
                a = (spread if side else rng.normal(0, .15)) * side + rng.normal(0, .12)
                ca, sa = math.cos(a), math.sin(a)
                dx, dy = ux * ca - uy * sa, ux * sa + uy * ca
                ln = length * (.75 + rng.random() * .5) * (1 - .35 * t)
                shade = c0 * (.75 + rng.random() * .5)
                line(px, py, px + dx * ln, py + dy * ln, 1.6, shade)

    green = np.array([.07, .13, .055])
    young = np.array([.16, .23, .07])
    twig = np.array([.13, .085, .05])
    cx = W / 2
    # the main twig, trunk to tip
    line(cx, 0, cx, H * .99, 6, twig)
    needles(cx, H * .12, cx, H * .99, 4, 58, .95, green)
    # side twigs, alternating, swept towards the tip, shorter further out, each with twigs of its own
    y = H * .1
    k = 0
    while y < H * .95:
        f = y / H
        side = 1 if k % 2 else -1
        reach = W * .47 * (1 - f) ** .55 * (.8 + rng.random() * .3)
        ang = math.radians(50 + rng.normal(0, 7))
        ux, uy = side * math.sin(ang), math.cos(ang)
        x1, y1 = cx + ux * reach, y + uy * reach
        line(cx, y, x1, y1, 3.2, twig)
        c = green if rng.random() < .8 else (green + young) / 2
        needles(cx + ux * 8, y + uy * 8, x1, y1, 4, 46, .9, c)
        # new growth at the tip, lighter
        needles(x1 - ux * 40, y1 - uy * 40, x1 + ux * 30, y1 + uy * 30, 3, 34, .8, young)
        for s2 in np.linspace(.18, .78, 5):
            bx, by = cx + (x1 - cx) * s2, y + (y1 - y) * s2
            turn = math.radians(38 + rng.normal(0, 8)) * (1 if rng.random() < .5 else -1)
            vx, vy = ux * math.cos(turn) - uy * math.sin(turn), ux * math.sin(turn) + uy * math.cos(turn)
            r2 = reach * (.26 + rng.random() * .1) * (1 - s2 * .6)
            ex, ey = bx + vx * r2, by + vy * r2
            line(bx, by, ex, ey, 2, twig)
            needles(bx, by, ex, ey, 4, 40, .85, green if rng.random() < .85 else young)
        y += H * (.022 + rng.random() * .01)
        k += 1
    # halve: average 2 x 2
    a2 = alpha.reshape(h, 2, w, 2).mean((1, 3))
    c2 = (col * alpha[..., None]).reshape(h, 2, w, 2, 3).sum((1, 3)) / np.maximum(alpha.reshape(h, 2, w, 2).sum((1, 3)), 1e-6)[..., None]
    out = np.zeros((h, w, 4), np.float32)
    out[..., :3] = c2
    out[..., 3] = a2
    return out


def spruce_cards(seed: int, height: float = 18.0):
    """A spruce as film and games make them: a tapering trunk, and each branch two crossed cards following it
    as it droops and turns up at the tip, showing the needle texture; the outline ragged, the light through it.
    Returns the trunk's and the cards' meshes, as (verts, faces, uvs) each."""
    rng = np.random.default_rng(seed)
    (tv, tf, tuv), _ = spruce(seed, height)        # the same trunk (and so the same height) as before
    H = max(p[2] for p in tv)
    cards = Builder()
    crown_base = H * (.1 + rng.random() * .08)
    widest = H * (.21 + rng.random() * .04)
    z = crown_base
    while z < H * .97:
        f = (z - crown_base) / (H - crown_base)
        length = widest * (1 - f) ** .92 * (.85 + rng.random() * .3) + .25
        n_br = int(5 + rng.integers(0, 3))
        turn = rng.random() * 2 * math.pi
        for b in range(n_br):
            if rng.random() < .1 * (1 - f):
                continue
            a = turn + 2 * math.pi * b / n_br + rng.normal(0, .2)
            out = np.array([math.cos(a), math.sin(a), 0.0])
            side = np.array([-math.sin(a), math.cos(a), 0.0])
            L = length * (.8 + rng.random() * .35)
            droop = .22 + .32 * (1 - f) + rng.normal(0, .05)
            segs = 5
            pts = np.array([out * L * u + np.array([0, 0, z - droop * L * u * u * .9 + .14 * L * u ** 4])
                            for u in np.linspace(0, 1, segs + 1)])
            width = L * (.62 + rng.random() * .2)
            for tilt in (rng.normal(.12, .08), rng.choice([-1, 1]) * (.7 + rng.random() * .25)):
                # a card's sideways direction: level, then turned about the branch by TILT radians
                along = _unit(pts[-1] - pts[0])
                s = _unit(side * math.cos(tilt) + np.cross(along, side) * math.sin(tilt))
                left = [p - s * width / 2 for p in pts]
                right = [p + s * width / 2 for p in pts]
                cards.strip(left, right)
        z += (.3 + rng.random() * .22) * (1 - .45 * f) * H / 18
    top = np.array([[0, 0, H * .9 + .9 * t] for t in np.linspace(0, 1, 3)])
    for tilt in (0, math.pi / 2):
        s = np.array([math.cos(tilt), math.sin(tilt), 0])
        cards.strip([p - s * .25 for p in top], [p + s * .25 for p in top])
    return (tv, tf, tuv), (cards.v, cards.f, cards.uv)
