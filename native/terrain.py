"""The mountain road's land, worked out the same way as static/terrain.js, number for number.

The editor places the road, the car and the camera with terrain.js; the native renderer builds the same land here
so that what stands on the road in the editor stands on it in the final picture. On top of that, the mountains
are worn by water as real ones are (see erode): gullies down every face, ridges sharpened between them, scree
fans at their feet. The valley and road are left exactly as they are.
Units are metres, y up, as in the editor.
"""

from __future__ import annotations

import numpy as np

Z0, Z1, STEP = 150.0, -3200.0, 1.0
SPAN, CZ = 24000.0, -500.0


def road_x(z):
    return 38 * np.sin(z * .0105) + 16 * np.sin(z * .027 + 1.3) + 4 * np.sin(z * .07 + .4)


def road_y(z):
    return np.maximum(0, -z) * .028 + 2.5 * np.sin(z * .012)


def _line():
    z = np.arange(Z0, Z1 - 1e-9, -STEP)
    p = np.stack([road_x(z), road_y(z), z], 1)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    s0 = seg[np.argmax(p[:, 2] <= 0)]
    return p, seg - s0


LINE, LINE_S = _line()
ROAD_LENGTH = float(LINE_S[-1])


def road_at(s: float, lane: float = 0.0):
    """A place S metres along the road, LANE metres right of its middle, and the way it runs (yaw)."""
    n = len(LINE_S)
    if s <= LINE_S[0]:
        lo, hi = 0, 1
    elif s >= LINE_S[-1]:
        lo, hi = n - 2, n - 1
    else:
        hi = int(np.searchsorted(LINE_S, s, side="right"))
        lo = hi - 1
    a, b = LINE[lo], LINE[hi]
    f = (s - LINE_S[lo]) / ((LINE_S[hi] - LINE_S[lo]) or 1)
    p = a + (b - a) * f
    dx, dz = b[0] - a[0], b[2] - a[2]
    ln = np.hypot(dx, dz) or 1
    return np.array([p[0] - dz / ln * lane, p[1], p[2] + dx / ln * lane]), float(np.arctan2(dx, dz))


# ----- noise, as terrain.js has it (Math.imul is multiplication mod 2^32) -----
_M32 = np.uint64(0xFFFFFFFF)


def _hash(x, y):
    x = np.asarray(x, dtype=np.int64).astype(np.uint64) & _M32
    y = np.asarray(y, dtype=np.int64).astype(np.uint64) & _M32
    h = (x * np.uint64(374761393) + y * np.uint64(668265263)) & _M32
    h = ((h ^ (h >> np.uint64(13))) * np.uint64(1274126177)) & _M32
    return (h ^ (h >> np.uint64(16))).astype(np.float64) / 4294967296.0


def noise(x, y):
    xi, yi = np.floor(x), np.floor(y)
    xf, yf = x - xi, y - yi
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a, b = _hash(xi, yi), _hash(xi + 1, yi)
    c, d = _hash(xi, yi + 1), _hash(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def fbm(x, y, oct=5):
    s, a, f, n = 0.0, .5, 1.0, 0.0
    for _ in range(oct):
        s = s + a * noise(x * f, y * f)
        n += a
        a *= .5
        f *= 2.03
    return s / n


def ridged(x, y, oct=6):
    s, a, f, n, w = 0.0, .5, 1.0, 0.0, 1.0
    for _ in range(oct):
        r = 1 - np.abs(noise(x * f, y * f) * 2 - 1)
        r = r * r * w
        w = np.clip(r * 1.6, 0, 1)
        s = s + a * r
        n += a
        a *= .5
        f *= 2.1
    return s / n


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def road_dist(x, z):
    across = np.abs(x - road_x(z))
    turn = np.cos(np.arctan(np.abs(np.cos(z * .0105) * .4 + np.cos(z * .027 + 1.3) * .43)))
    inside = across * (turn + (1 - turn) * smooth(40, 400, across))
    before = np.hypot(x - road_x(Z0), z - Z0)
    after = np.hypot(x - road_x(Z1), z - Z1)
    return np.where(z > Z0, before, np.where(z < Z1, after, inside))


def parts(x, z, o):
    """The land at x, z (arrays, metres) as terrain.js makes it: the height without the mountains, and the
    mountains' own height, kept apart so only the mountains are worn by water."""
    half = (float(o.get("road") or 0) / 2 if float(o.get("road") or 0) > 0 else 0) + 1.5
    d, zz = road_dist(x, z), np.clip(z, Z1, Z0)
    base = road_y(zz) + np.where(z < Z1, (Z1 - z) * .028, 0)
    meadow = (fbm(x * .012, z * .012, 4) - .5) * 9 * smooth(half + 1, half + 30, d)
    hills = (fbm(x * .0035 + 11, z * .0035, 5) * .8 + .2) * 160 * smooth(half + 25, 650, d)
    far = 1 + .6 * smooth(2500, 7000, np.hypot(x, z + 600))
    peaks = max(0.0, float(o.get("peaks") or 0)) * far
    mass = smooth(.28, .74, fbm(x * .00016 + 5.3, z * .00016 - 2.1, 4))
    wx = x * .8 - z * .6 + (fbm(x * .0004, z * .0004, 3) - .5) * 1800
    wz = x * .6 + z * .8 + (fbm(x * .0004 + 9, z * .0004, 3) - .5) * 1800
    detail = ridged(wx * .00042 + 3.1, wz * .00042 - 1.7, 7)
    onset = 380 + 1100 * fbm(z * .0006 + 17, x * .0002 + 3, 3) + 260 * (fbm(x * .002, z * .002 + 40, 2) - .5)
    rise = smooth(onset, onset + 1700, d) ** 1.15
    edge = smooth(SPAN * .97, SPAN * .72, np.maximum(np.abs(x), np.abs(z - CZ)))
    mountains = peaks * rise * edge * (.5 + .7 * mass) * (detail ** 1.3 * 1.5 + .15)
    return base + meadow + hills, mountains, rise


def height(x, z, o):
    low, mountains, _ = parts(np.asarray(x, float), np.asarray(z, float), o)
    return low + mountains


def spread(u, fine=.055, power=2):
    return np.sign(u) * SPAN * (fine * np.abs(u) + (1 - fine) * np.abs(u) ** power)


# ----- water wearing the mountains down -----
def erode(h, cell, drops=300000, steps=48, seed=5, mask=None):
    """Hydraulic erosion on a height grid H (metres, cell metres apart): drops of rain run downhill, picking up
    rock where they speed up and leaving it where they slow, carving gullies and laying fans below. All the drops
    of a batch run at once. Worked on heights scaled to run 0 to 1, as the method is tuned for. MASK
    (0 to 1) says where the land may be worn. Returns the new heights and how much water ran over each cell (for
    darker, wetter gullies and scree in the colours)."""

    rng = np.random.default_rng(seed)
    start = h.astype(np.float64)
    low, span = start.min(), max(float(np.ptp(start)), 1e-6)
    g = (start - low) / span
    H, W = g.shape
    flow = np.zeros_like(g)
    inertia, capacity_k, deposit_k, erode_k, evap, gravity, min_cap = .05, 4.0, .3, .3, .01, 4.0, .01
    del cell  # the heights' scale is what the method needs, not the cells'
    brush = [(oy, ox, w) for oy in (-1, 0, 1) for ox in (-1, 0, 1)
             for w in [(.4 if (oy, ox) == (0, 0) else .1 if 0 in (oy, ox) else .05)]]
    batch = 40000
    for first in range(0, drops, batch):
        n = min(batch, drops - first)
        px, py = rng.uniform(1, W - 2, n), rng.uniform(1, H - 2, n)
        dx, dy = np.zeros(n), np.zeros(n)
        speed, water, sed = np.ones(n), np.ones(n), np.zeros(n)
        alive = np.ones(n, bool)
        for _ in range(steps):
            ix, iy = px.astype(int), py.astype(int)
            fx, fy = px - ix, py - iy
            h00, h10, h01, h11 = g[iy, ix], g[iy, ix + 1], g[iy + 1, ix], g[iy + 1, ix + 1]
            gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy
            gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx
            here = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy
            dx = dx * inertia - gx * (1 - inertia)
            dy = dy * inertia - gy * (1 - inertia)
            ln = np.hypot(dx, dy)
            alive &= ln > 1e-12
            ln = np.where(ln > 1e-12, ln, 1)
            nx, ny = px + dx / ln, py + dy / ln
            alive &= (nx >= 1) & (nx < W - 2) & (ny >= 1) & (ny < H - 2)
            if not alive.any():
                break
            nx, ny = np.where(alive, nx, px), np.where(alive, ny, py)
            jx, jy = nx.astype(int), ny.astype(int)
            gfx, gfy = nx - jx, ny - jy
            there = (g[jy, jx] * (1 - gfx) * (1 - gfy) + g[jy, jx + 1] * gfx * (1 - gfy)
                     + g[jy + 1, jx] * (1 - gfx) * gfy + g[jy + 1, jx + 1] * gfx * gfy)
            dh = there - here
            cap = np.maximum(-dh * speed * water * capacity_k, min_cap)
            uphill = dh > 0
            over = sed > cap
            give = np.where(uphill, np.minimum(dh, sed), np.where(over, (sed - cap) * deposit_k, 0))
            take = np.where(~uphill & ~over, np.minimum((cap - sed) * erode_k, -dh), 0)
            give *= alive
            take *= alive
            if mask is not None:
                take *= mask[iy, ix]
            sed += take - give
            # laid down where the drop is; worn away from round it
            np.add.at(g, (iy, ix), give * (1 - fx) * (1 - fy))
            np.add.at(g, (iy, ix + 1), give * fx * (1 - fy))
            np.add.at(g, (iy + 1, ix), give * (1 - fx) * fy)
            np.add.at(g, (iy + 1, ix + 1), give * fx * fy)
            for oy, ox, w in brush:
                np.add.at(g, (np.clip(iy + oy, 0, H - 1), np.clip(ix + ox, 0, W - 1)), -take * w)
            np.add.at(flow, (iy, ix), water * alive)
            speed = np.sqrt(np.maximum(speed * speed - dh * gravity, 0))
            water *= 1 - evap
            px, py = nx, ny
    return low + g * span, flow


def thermal(h, cell, talus=.9, rounds=30, k=.25):
    """Loose rock sliding off what is steeper than it can lie on, for scree slopes below the cliffs."""
    h = h.copy()
    lim = talus * cell
    for _ in range(rounds):
        for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            nb = np.roll(h, sh, axis=ax)
            d = h - nb - lim
            move = np.where(d > 0, d * k * .25, 0)
            h -= move
            h += np.roll(move, -sh, axis=ax)
    return h
