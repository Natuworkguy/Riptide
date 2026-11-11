"""A Riptide 3D world, built and filmed by Cycles, Blender's path tracer, run as a Python module.

Nothing here draws in a browser. The editor says what the frame is (the world's settings, where the camera is and
what it sees, the sun, and the props and 3D layers as a glTF); this builds the world natively at full quality and
path traces it: real light bouncing, soft sky light, the sun's shadows, glossy reflections, and air that thickens
with distance. It runs on the graphics chip where there is one Cycles can use (Metal on Apple Silicon, CUDA,
OptiX, HIP or oneAPI) and on the processor otherwise. Memory is kept low enough for a 16 GB laptop: a forest is
a few trees placed many times (instances, not copies), materials are worked out in the shader rather than read
from large images, and the land is cached on disk once it has been worn down by water.

Riptide's axes are x right, y up, z towards the camera; Blender's are x right, y away, z up: (x, y, z) here is
(x, -z, y) there.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from pathlib import Path

import numpy as np

from . import flora, terrain

CACHE = Path(os.environ.get("RIPTIDE_NATIVE_CACHE") or Path.home() / ".riptide" / "native-cache")
QUALITY = {  # samples, longest side cap for previews, and light bounces
    "draft": {"samples": 24, "bounces": 4},
    "good": {"samples": 96, "bounces": 6},
    "final": {"samples": 256, "bounces": 8},
}


def to_b(p):
    """Riptide (x, y up, z towards camera) to Blender (x, y away, z up)."""
    return (float(p[0]), -float(p[2]), float(p[1]))


def srgb(hex_or_rgb):
    if isinstance(hex_or_rgb, str):
        h = hex_or_rgb.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        c = list(hex_or_rgb)
    return tuple(((x / 12.92) if x <= .04045 else ((x + .055) / 1.055) ** 2.4) for x in c) + (1.0,)


class Nodes:
    """Builds a node tree tersely: n('ShaderNodeMath', operation='MULTIPLY', inputs={...}) and l(a, b)."""

    def __init__(self, tree):
        self.t = tree
        for x in list(tree.nodes):
            tree.nodes.remove(x)

    def n(self, kind, inputs=None, **props):
        node = self.t.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        for k, v in (inputs or {}).items():
            sock = node.inputs[k]
            if hasattr(v, "is_output"):
                self.t.links.new(v, sock)
            else:
                sock.default_value = v
        return node

    def l(self, a, b):
        self.t.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        node = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if hasattr(v, "is_output"):
                self.l(v, node.inputs[i])
            else:
                node.inputs[i].default_value = v
        return node.outputs[0]

    def ramp(self, x, a, b, smooth=True):
        """0 below A, 1 above B (or the other way when A > B), smoothly."""
        m = self.n("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP" if smooth else "LINEAR", clamp=True)
        self.l(x, m.inputs["Value"]) if hasattr(x, "is_output") else None
        if a > b:
            m.inputs["From Min"].default_value, m.inputs["From Max"].default_value = b, a
            m.inputs["To Min"].default_value, m.inputs["To Max"].default_value = 1, 0
        else:
            m.inputs["From Min"].default_value, m.inputs["From Max"].default_value = a, b
        return m.outputs["Result"]

    def mix(self, fac, a, b):
        m = self.n("ShaderNodeMix", data_type="RGBA", blend_type="MIX", clamp_factor=True)
        for sock, v in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
            if hasattr(v, "is_output"):
                self.l(v, sock)
            else:
                sock.default_value = v
        return m.outputs[2]

    def noise(self, vec, scale, detail=4.0, rough=.55, which="Fac"):
        nn = self.n("ShaderNodeTexNoise", inputs={"Scale": scale, "Detail": detail, "Roughness": rough})
        self.l(vec, nn.inputs["Vector"])
        return nn.outputs[which]


class World:
    """One Blender scene, kept between frames: what is slow to build (the land, the forest) is built again only
    when what it is made from changes."""

    def __init__(self):
        import bpy
        self.bpy = bpy
        self.keys = {}
        self.props = []
        self.grass_at = None
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        self.sc = sc
        sc.render.engine = "CYCLES"
        self.device = self._device()
        sc.cycles.device = "GPU" if self.device != "CPU" else "CPU"
        sc.cycles.use_denoising = True
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
        sc.cycles.use_adaptive_sampling = True
        sc.cycles.adaptive_threshold = .02
        sc.cycles.caustics_reflective = sc.cycles.caustics_refractive = False
        sc.cycles.blur_glossy = 1.0
        sc.cycles.use_light_tree = True
        sc.render.use_persistent_data = True     # keeps the built scene on the chip from one frame to the next
        sc.render.film_transparent = False
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium High Contrast"
        vl = sc.view_layers[0]
        vl.use_pass_z = True
        vl.use_pass_position = True
        self.col = bpy.data.collections.new("riptide")
        sc.collection.children.link(self.col)
        self.lib = bpy.data.collections.new("library")    # what instances are made from, not drawn itself
        sc.collection.children.link(self.lib)
        sc.view_layers[0].layer_collection.children["library"].exclude = True
        cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
        sc.collection.objects.link(cam)
        sc.camera = cam
        self.cam = cam
        w = bpy.data.worlds.new("sky")
        sc.world = w
        self.world = w

    def _device(self):
        bpy = self.bpy
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
                try:
                    prefs.compute_device_type = kind
                except TypeError:
                    continue
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type == kind
                    return kind
        except Exception:  # noqa: BLE001 - no GPU to use: the processor it is
            pass
        return "CPU"

    # ----- what is built once -----
    def changed(self, name, key):
        key = json.dumps(key, sort_keys=True, default=str)
        if self.keys.get(name) == key:
            return False
        self.keys[name] = key
        return True

    def clear(self, prefix):
        bpy = self.bpy
        for ob in [o for o in bpy.data.objects if o.name.startswith(prefix)]:
            bpy.data.objects.remove(ob, do_unlink=True)

    # ----- the land -----
    def land(self, o):
        """Heights for the mountain road world: terrain.js's land, the mountains worn by water. Cached on disk."""
        peaks, road = float(o.get("peaks") or 0), float(o.get("road") or 0)
        # (the code that shapes the land is part of the key: change the mountains and they are worn again)
        src = Path(terrain.__file__).read_bytes()
        key = hashlib.sha1(json.dumps([peaks, road]).encode() + src).hexdigest()[:16]
        path = CACHE / f"land-{key}.npz"
        if path.exists():
            d = np.load(path)
            return d["grid"], d["delta"], d["flow"], tuple(d["box"])
        CACHE.mkdir(parents=True, exist_ok=True)
        N, x0, x1, z0, z1 = 1280, -12000.0, 12000.0, -18000.0, 6000.0
        xs, zs = np.linspace(x0, x1, N), np.linspace(z0, z1, N)
        X, Z = np.meshgrid(xs, zs)
        low, mt, rise = terrain.parts(X, Z, o)
        h = low + mt
        worn, flow = terrain.erode(h, (x1 - x0) / N, drops=900000, steps=30, mask=np.clip(rise * 3, 0, 1))
        worn = terrain.thermal(worn, (x1 - x0) / N, talus=1.1, rounds=16)
        delta = (worn - h) * np.clip(rise * 3, 0, 1)
        flow = np.log1p(flow) / max(np.log1p(flow).max(), 1e-6)
        np.savez_compressed(path, grid=np.float32(h), delta=np.float32(delta), flow=np.float32(flow), box=np.array([x0, x1, z0, z1]))
        return h, delta, flow, (x0, x1, z0, z1)

    @staticmethod
    def sample(grid, box, x, z):
        x0, x1, z0, z1 = box
        n = grid.shape[0]
        fx = np.clip((x - x0) / (x1 - x0) * (n - 1), 0, n - 1.001)
        fz = np.clip((z - z0) / (z1 - z0) * (n - 1), 0, n - 1.001)
        ix, iz = fx.astype(int), fz.astype(int)
        u, v = fx - ix, fz - iz
        inside = (x >= x0) & (x <= x1) & (z >= z0) & (z <= z1)
        val = (grid[iz, ix] * (1 - u) * (1 - v) + grid[iz, ix + 1] * u * (1 - v) + grid[iz + 1, ix] * (1 - u) * v
               + grid[iz + 1, ix + 1] * u * v)
        return np.where(inside, val, 0)

    def height_at(self, x, z, o, with_flow=False):
        """The final land's height (Riptide metres) at x, z: what grass, trees and rocks stand on. The mountains
        are as terrain.js makes them, worn by water (cached), with rock relief finer than the water's grid laid on
        their steep faces: buttresses, ledges and broken ground, tens of metres down to a few."""
        x, z = np.asarray(x, float), np.asarray(z, float)
        _, delta, flow, box = self.land(o)
        low, mt, rise = terrain.parts(x, z, o)
        peaks = max(1.0, float(o.get("peaks") or 0))
        rocky = np.clip(rise * 2, 0, 1) * np.clip(mt / (peaks * .25), 0, 1)
        fine = ((terrain.ridged(x * .009 + 1.7, z * .009 - 4.2, 5) - .42) * 40
                + (terrain.fbm(x * .04, z * .04 + 7, 3) - .5) * 9)
        h = low + mt + self.sample(delta, box, x, z) + rocky * fine
        return (h, self.sample(flow, box, x, z)) if with_flow else h

    def land_mesh(self, o, cam, look, quality):
        """The land, as a mesh laid out round the camera: rings whose spacing grows with distance and spokes
        closest together where the camera looks, so every triangle is about the same few pixels on screen, from the
        grass at its feet to summits twenty kilometres off. Built again when the camera moves."""
        bpy = self.bpy
        step = {"draft": .007, "good": .0042, "final": .0032}.get(quality, .0042)
        key = [round(cam[0], 1), round(cam[1], 1), round(cam[2], 1), round(look, 2), step, o.get("peaks"), o.get("road"),
               o.get("snow"), o.get("groundColor")]
        if not self.changed("land-mesh", key):
            return
        self.clear("land")
        t0 = time.time()
        # rings: from 30 cm to 30 km, each a little further than the last
        radii = .3 * (1 + step * 1.4) ** np.arange(int(math.log(30000 / .3) / math.log(1 + step * 1.4)) + 1)
        # spokes: close together across the view and a margin, four times sparser behind (for shadows and light)
        half = math.radians(85)
        front = np.arange(-half, half, step)
        back = np.arange(half, 2 * math.pi - half, step * 4)
        ang = look + np.concatenate([front, back])
        A, R = np.meshgrid(ang, radii)
        X = cam[0] + R * np.cos(A)
        Z = cam[2] + R * np.sin(A)
        Y, F = self.height_at(X.ravel(), Z.ravel(), o, with_flow=True)
        nr, na = A.shape
        verts = np.stack([X.ravel(), -Z.ravel(), Y], 1)
        idx = np.arange(nr * na).reshape(nr, na)
        nxt = np.roll(idx, -1, axis=1)
        quads = np.stack([idx[:-1].ravel(), nxt[:-1].ravel(), nxt[1:].ravel(), idx[1:].ravel()], 1)
        me = bpy.data.meshes.new("land")
        me.vertices.add(len(verts))
        me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
        me.loops.add(quads.size)
        me.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
        me.polygons.add(len(quads))
        me.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
        me.update(calc_edges=True)
        me.polygons.foreach_set("use_smooth", np.ones(len(quads), bool))
        at = me.attributes.new("flow", "FLOAT", "POINT")
        at.data.foreach_set("value", F.astype(np.float32).ravel())
        ob = bpy.data.objects.new("land", me)
        self.col.objects.link(ob)
        mat = bpy.data.materials.get("land") or self.land_material(o)
        me.materials.append(mat)
        self.log(f"land: {len(verts)} points round the camera in {time.time() - t0:.1f}s")

    def build_mountains(self, o):
        if not self.changed("mountains", [o.get("peaks"), o.get("road"), o.get("snow"), o.get("trees"), o.get("groundColor")]):
            return
        for name in ("land", "road", "forest", "rocks"):
            self.clear(name)
        old = self.bpy.data.materials.get("land")
        if old:
            self.bpy.data.materials.remove(old)
        self.keys.pop("land-mesh", None)
        t0 = time.time()
        self.land(o)
        self.land_material(o)
        self.road(o)
        self.forest(o)
        self.rocks(o)
        self.log(f"mountain world built in {time.time() - t0:.1f}s")

    def land_material(self, o):
        bpy = self.bpy
        m = bpy.data.materials.new("land")
        m.use_nodes = True
        k = Nodes(m.node_tree)
        geo = k.n("ShaderNodeNewGeometry")
        pos = geo.outputs["Position"]
        xyz = k.n("ShaderNodeSeparateXYZ")
        k.l(pos, xyz.inputs[0])
        nz = k.n("ShaderNodeSeparateXYZ")
        k.l(geo.outputs["Normal"], nz.inputs[0])
        up, alt = nz.outputs["Z"], xyz.outputs["Z"]
        flow = k.n("ShaderNodeAttribute", attribute_name="flow").outputs["Fac"]
        top = max(1.0, float(o.get("peaks") or 0))
        snow_at = top * max(0.0, min(100.0, float(o.get("snow") or 0))) / 100
        big, mid, fine = k.noise(pos, .0016, 5), k.noise(pos, .02, 6), k.noise(pos, .9, 8)
        # meadow: greens changing in big patches, drier where it is high and open
        g1, g2, dry = srgb(o.get("groundColor") or "#4d6a2c"), srgb("#55692c"), srgb("#8a8150")
        grass = k.mix(k.ramp(mid, .35, .7), g1, g2)
        grass = k.mix(k.math("MULTIPLY", k.ramp(big, .5, .72), .6), grass, dry)
        grass = k.mix(k.math("MULTIPLY", k.ramp(k.noise(pos, .06, 4), .35, .65), .5), grass, srgb("#2c4019"))
        # the floor of a meadow is in the shade of its own blades: darker than the grass seen from afar
        floor = k.n("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY", inputs={0: 1.0, 7: (.62, .66, .58, 1)})
        k.l(grass, floor.inputs[6])
        grass = floor.outputs[2]
        # and patchy: bare soil, dead thatch and moss in it, half a metre across
        grass = k.mix(k.math("MULTIPLY", k.ramp(k.noise(pos, 1.8, 5), .45, .7), .55), grass, srgb("#3b3226"))
        grass = k.mix(k.math("MULTIPLY", k.ramp(k.noise(pos, 3.1, 4), .55, .75), .5), grass, srgb("#6d6440"))
        dark = k.mix(k.ramp(fine, .3, .75), (0.55, .6, .5, 1), (1.1, 1.1, 1.05, 1))
        grass = k.mix(1.0, grass, grass)
        grass_n = k.n("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY", inputs={0: 1.0})
        k.l(grass, grass_n.inputs[6])
        k.l(dark, grass_n.inputs[7])
        grass = grass_n.outputs[2]
        # rock: limestone greys and warmer browns, changing over kilometres; laid in beds that dip across the
        # range (tilted bands); darker and wetter down the gullies; pale scree fanned out below the cliffs
        tilt = k.n("ShaderNodeMapping", inputs={"Rotation": (.32, .18, .6)})
        k.l(pos, tilt.inputs["Vector"])
        beds = k.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="Z", wave_profile="SAW",
                   inputs={"Scale": .006, "Distortion": 9, "Detail": 6, "Detail Scale": 1.5, "Detail Roughness": .6})
        k.l(tilt.outputs[0], beds.inputs["Vector"])
        macro = k.noise(pos, .0007, 3)
        rock = k.mix(k.ramp(macro, .35, .65), srgb("#6a655d"), srgb("#57504a"))
        rock = k.mix(k.ramp(k.noise(pos, .012, 6), .3, .7), rock, k.mix(.5, rock, srgb("#857c70")))
        patchy = k.ramp(k.noise(pos, .003, 3), .4, .7)
        rock = k.mix(k.math("MULTIPLY", k.math("MULTIPLY", k.ramp(beds.outputs["Fac"], .6, .95), patchy), .35), rock, srgb("#3b3631"))
        rock = k.mix(k.math("MULTIPLY", k.math("MULTIPLY", k.ramp(beds.outputs["Fac"], .1, .25), patchy), .2), rock, srgb("#8d8478"))
        rock = k.mix(k.math("MULTIPLY", k.ramp(k.noise(pos, .004, 4), .6, .75), .35), rock, srgb("#6b5444"))
        rock = k.mix(k.math("MULTIPLY", k.ramp(flow, .25, .7), .6), rock, srgb("#2e2b28"))
        rock = k.mix(k.math("MULTIPLY", k.ramp(flow, .1, .3), k.ramp(up, .68, .82)), rock, srgb("#8f8a82"))
        jitter = k.math("MULTIPLY", k.math("SUBTRACT", big, .5), 160)
        alt_j = k.math("ADD", alt, jitter)
        steep = k.ramp(up, .84, .66)
        high = k.ramp(alt_j, snow_at * .55, snow_at * .8)
        rock_mask = k.math("MAXIMUM", steep, high)
        # above the trees the grass is short, browner and thin, rock showing through it
        alpine = k.ramp(alt_j, snow_at * .4, snow_at * .62)
        grass = k.mix(k.math("MULTIPLY", alpine, .7), grass, k.mix(k.ramp(fine, .4, .6), srgb("#7a7247"), srgb("#5c5a45")))
        rock_mask = k.math("MAXIMUM", rock_mask, k.math("MULTIPLY", alpine, k.ramp(k.noise(pos, .03, 4), .5, .62)))
        col = k.mix(rock_mask, grass, rock)
        # snow: above the snow line where it can lie, thinning into streaks below it
        # (snow does not hold on a cliff: the faces stay dark rock, with snow on the ledges and in the gullies)
        snow_mask = k.math("MULTIPLY", k.ramp(k.math("ADD", alt, k.math("MULTIPLY", k.math("SUBTRACT", mid, .5), 220)), snow_at - 60, snow_at + 40),
                           k.ramp(k.math("ADD", k.math("SUBTRACT", up, k.math("MULTIPLY", flow, .25)),
                                         k.math("MULTIPLY", k.math("SUBTRACT", k.noise(pos, .008, 5), .5), .35)), .74, .86))
        snow_mask = k.math("MAXIMUM", snow_mask, k.math("MULTIPLY", k.ramp(alt_j, snow_at + 300, snow_at + 600), k.ramp(up, .5, .66)))
        col = k.mix(snow_mask, col, srgb("#f3f6fa"))
        rough = k.math("ADD", k.math("MULTIPLY", snow_mask, -.45), .95)
        bsdf = k.n("ShaderNodeBsdfPrincipled", inputs={"Roughness": .9, "Specular IOR Level": .35})
        k.l(col, bsdf.inputs["Base Color"])
        k.l(rough, bsdf.inputs["Roughness"])
        k.l(k.math("MULTIPLY", snow_mask, .12), bsdf.inputs["Subsurface Weight"])
        # small relief: cracks and lumps in the rock, a fine grain in grass and snow
        vor = k.n("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE", inputs={"Scale": .35})
        k.l(pos, vor.inputs["Vector"])
        relief = k.math("ADD", k.math("MULTIPLY", k.noise(pos, .25, 8), rock_mask),
                        k.math("MULTIPLY", k.ramp(vor.outputs["Distance"], 0, .06), k.math("MULTIPLY", rock_mask, .4)))
        relief = k.math("ADD", relief, k.math("MULTIPLY", fine, .15))
        # buttresses and ledges tens of metres across, in the light on the rock faces
        relief = k.math("ADD", relief, k.math("MULTIPLY", k.noise(pos, .018, 8, .6), k.math("MULTIPLY", rock_mask, 14)))
        bump = k.n("ShaderNodeBump", inputs={"Strength": .6, "Distance": 1.2})
        k.l(relief, bump.inputs["Height"])
        k.l(bump.outputs["Normal"], bsdf.inputs["Normal"])
        out = k.n("ShaderNodeOutputMaterial")
        k.l(bsdf.outputs[0], out.inputs["Surface"])
        return m

    def road(self, o):
        """The asphalt: a strip along the road's line, its lines painted in the shader so they stay sharp."""
        bpy = self.bpy
        w = max(1.0, float(o.get("road") or 7))
        s = np.arange(-150, terrain.ROAD_LENGTH, 1.0)
        L, R = [], []
        for si in s:
            p, _ = terrain.road_at(si, -w / 2 - .6)
            q, _ = terrain.road_at(si, w / 2 + .6)
            L.append(to_b((p[0], terrain.road_y(np.clip(p[2], terrain.Z1, terrain.Z0)) + .04, p[2])))
            R.append(to_b((q[0], terrain.road_y(np.clip(q[2], terrain.Z1, terrain.Z0)) + .04, q[2])))
        n = len(s)
        verts = L + R
        faces = [[i, n + i, n + i + 1, i + 1] for i in range(n - 1)]
        uvs = []
        for i in range(n - 1):
            a, b = s[i], s[i + 1]
            uvs += [(0, a), (1, a), (1, b), (0, b)]
        ob = flora.mesh_object(bpy, "road", verts, faces, uvs, self.col, smooth=True)
        m = bpy.data.materials.new("asphalt")
        m.use_nodes = True
        k = Nodes(m.node_tree)
        uv = k.n("ShaderNodeUVMap", uv_map="UVMap").outputs[0]
        sep = k.n("ShaderNodeSeparateXYZ")
        k.l(uv, sep.inputs[0])
        u, v = sep.outputs["X"], sep.outputs["Y"]
        width = w + 1.2
        across = k.math("MULTIPLY", u, width)                       # metres from the left edge of the strip
        band = lambda a, b: k.math("MULTIPLY", k.ramp(across, a - .01, a + .01, False), k.ramp(across, b + .01, b - .01, False))
        edge = k.math("MAXIMUM", band(.6 + .25, .6 + .4), band(width - .6 - .4, width - .6 - .25))
        dash = k.math("LESS_THAN", k.math("FRACT", k.math("DIVIDE", v, 12)), 1 / 3)
        centre = k.math("MULTIPLY", band(width / 2 - .075, width / 2 + .075), dash)
        paint = k.math("MAXIMUM", edge, centre)
        shoulder = k.math("MAXIMUM", k.ramp(across, .75, .55), k.ramp(across, width - .75, width - .55))
        gp = k.n("ShaderNodeNewGeometry").outputs["Position"]
        grit = k.noise(gp, 6, 8, .7)
        tracks = k.math("MULTIPLY", k.math("ADD", band(width * .3 - .25, width * .3 + .25), band(width * .7 - .25, width * .7 + .25)), .5)
        asphalt = k.mix(k.ramp(grit, .3, .7), srgb("#1c1d1f"), srgb("#323336"))
        asphalt = k.mix(k.math("MULTIPLY", tracks, .35), asphalt, srgb("#1d1e20"))
        asphalt = k.mix(k.math("MULTIPLY", k.ramp(k.noise(gp, .08, 4), .55, .75), .5), asphalt, srgb("#3a3a39"))
        col = k.mix(shoulder, asphalt, k.mix(k.ramp(grit, .3, .7), srgb("#5b564e"), srgb("#7a746a")))
        worn_paint = k.math("MULTIPLY", paint, k.ramp(k.noise(gp, 1.5, 5), .25, .45))
        col = k.mix(worn_paint, col, srgb("#e8e6df"))
        # (asphalt's grit shades most of its own sheen: little of the sky is seen in it, even looking along it)
        bsdf = k.n("ShaderNodeBsdfPrincipled", inputs={"Specular IOR Level": .08})
        k.l(col, bsdf.inputs["Base Color"])
        k.l(k.math("ADD", k.math("MULTIPLY", tracks, -.1), k.math("ADD", k.math("MULTIPLY", worn_paint, -.3), .93)), bsdf.inputs["Roughness"])
        bump = k.n("ShaderNodeBump", inputs={"Strength": .35, "Distance": .02})
        k.l(grit, bump.inputs["Height"])
        k.l(bump.outputs["Normal"], bsdf.inputs["Normal"])
        k.l(bsdf.outputs[0], k.n("ShaderNodeOutputMaterial").inputs["Surface"])
        ob.data.materials.append(m)

    # ----- many of a thing, placed as instances -----
    def scatter(self, name, sources, places, rot, scale, which):
        """An object whose points each draw one of SOURCES (objects in the library), turned by ROT (radians, xyz)
        and sized by SCALE: Blender's geometry nodes making instances, so a forest costs one tree's memory."""
        bpy = self.bpy
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(places))
        me.vertices.foreach_set("co", np.asarray(places, np.float32).ravel())
        for attr, kind, data, field in (("rot", "FLOAT_VECTOR", rot, "vector"), ("scale", "FLOAT", scale, "value"), ("which", "INT", which, "value")):
            a = me.attributes.new(attr, kind, "POINT")
            a.data.foreach_set(field, np.asarray(data, np.int32 if kind == "INT" else np.float32).ravel())
        ob = bpy.data.objects.new(name, me)
        self.col.objects.link(ob)
        group = bpy.data.collections.new(name + "-kinds")
        self.lib.children.link(group)
        for src in sources:
            group.objects.link(src)
        ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
        ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
        ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
        k = Nodes(ng)
        gin, gout = k.n("NodeGroupInput"), k.n("NodeGroupOutput")
        info = k.n("GeometryNodeCollectionInfo", transform_space="ORIGINAL", inputs={"Separate Children": True, "Reset Children": True})
        info.inputs["Collection"].default_value = group
        inst = k.n("GeometryNodeInstanceOnPoints", inputs={"Pick Instance": True})
        k.l(gin.outputs[0], inst.inputs["Points"])
        k.l(info.outputs[0], inst.inputs["Instance"])
        for attr, kind, sock in (("rot", "FLOAT_VECTOR", "Rotation"), ("scale", "FLOAT", "Scale"), ("which", "INT", "Instance Index")):
            na = k.n("GeometryNodeInputNamedAttribute", data_type=kind)
            na.inputs["Name"].default_value = attr
            k.l(na.outputs["Attribute"], inst.inputs[sock])
        k.l(inst.outputs[0], gout.inputs[0])
        mod = ob.modifiers.new("scatter", "NODES")
        mod.node_group = ng
        return ob

    def library_object(self, name, mesh, material):
        ob = flora.mesh_object(self.bpy, name, *mesh, collection=self.lib, smooth=True)
        ob.data.materials.append(material)
        return ob

    def needle_material(self):
        """Spruce needles: the drawn branchlet (flora.needle_texture) cut out by its alpha, each tree a little
        different in its green, light passing through the needles where the sun is behind them."""
        bpy = self.bpy
        m = bpy.data.materials.get("needles")
        if m:
            return m
        path = CACHE / "needles-3.png"
        if not path.exists():
            CACHE.mkdir(parents=True, exist_ok=True)
            px = flora.needle_texture()
            im = bpy.data.images.new("needles-src", px.shape[1], px.shape[0], alpha=True)
            im.pixels.foreach_set(px.ravel())   # row 0 is the bottom in Blender: v 0, the trunk end
            im.filepath_raw, im.file_format = str(path), "PNG"
            im.save()
            bpy.data.images.remove(im)
        img = bpy.data.images.load(str(path), check_existing=True)
        m = bpy.data.materials.new("needles")
        m.use_nodes = True
        k = Nodes(m.node_tree)
        rnd = k.n("ShaderNodeObjectInfo").outputs["Random"]
        tex = k.n("ShaderNodeTexImage", interpolation="Cubic")
        tex.image = img
        k.l(k.n("ShaderNodeUVMap", uv_map="UVMap").outputs[0], tex.inputs["Vector"])
        tint = k.mix(rnd, (0.85, .95, .85, 1), (1.15, 1.05, .9, 1))
        col = k.n("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY", inputs={0: 1.0})
        k.l(tex.outputs["Color"], col.inputs[6])
        k.l(tint, col.inputs[7])
        col = col.outputs[2]
        bsdf = k.n("ShaderNodeBsdfPrincipled", inputs={"Roughness": .55, "Specular IOR Level": .45})
        k.l(col, bsdf.inputs["Base Color"])
        tr = k.n("ShaderNodeBsdfTranslucent")
        k.l(col, tr.inputs["Color"])
        leaf = k.n("ShaderNodeMixShader", inputs={"Fac": .25})
        k.l(bsdf.outputs[0], leaf.inputs[1])
        k.l(tr.outputs[0], leaf.inputs[2])
        cut = k.n("ShaderNodeMixShader")
        k.l(tex.outputs["Alpha"], cut.inputs["Fac"])
        k.l(k.n("ShaderNodeBsdfTransparent").outputs[0], cut.inputs[1])
        k.l(leaf.outputs[0], cut.inputs[2])
        k.l(cut.outputs[0], k.n("ShaderNodeOutputMaterial").inputs["Surface"])
        return m

    def bark_material(self):
        bpy = self.bpy
        m = bpy.data.materials.get("bark") or bpy.data.materials.new("bark")
        m.use_nodes = True
        k = Nodes(m.node_tree)
        pos = k.n("ShaderNodeNewGeometry").outputs["Position"]
        n1 = k.noise(pos, 18, 6)
        col = k.mix(k.ramp(n1, .3, .7), srgb("#3b2f27"), srgb("#5a4a3d"))
        bsdf = k.n("ShaderNodeBsdfPrincipled", inputs={"Roughness": .9})
        k.l(col, bsdf.inputs["Base Color"])
        bump = k.n("ShaderNodeBump", inputs={"Strength": .8, "Distance": .02})
        k.l(n1, bump.inputs["Height"])
        k.l(bump.outputs["Normal"], bsdf.inputs["Normal"])
        k.l(bsdf.outputs[0], k.n("ShaderNodeOutputMaterial").inputs["Surface"])
        return m

    def forest(self, o):
        """Spruces on the slopes, thick in stands and thin in clearings, none on the road, the cliffs or above the
        tree line: as terrain.js places its pines, but many more and real trees."""
        share = max(0.0, min(100.0, float(o.get("trees") or 0))) / 100
        if not share:
            return
        rng = np.random.default_rng(41)
        top = max(1.0, float(o.get("peaks") or 0))
        treeline = top * max(0.0, min(100.0, float(o.get("snow") or 0))) / 100 * .62
        half = (float(o.get("road") or 0) / 2) + 4
        n = int(140000 * share)
        # most near the valley, some far
        r = np.concatenate([rng.random(n // 2) ** 1.6 * 2500, rng.random(n - n // 2) ** 1.2 * 9000])
        a = rng.random(n) * 2 * np.pi
        x, z = np.sin(a) * r * 1.0, -900 + np.cos(a) * r * 1.4
        d = terrain.road_dist(x, z)
        y = self.height_at(x, z, o)
        alt = y - terrain.road_y(np.clip(z, terrain.Z1, terrain.Z0))
        e = 2.0
        slope = np.hypot(self.height_at(x + e, z, o) - y, self.height_at(x, z + e, o) - y) / e
        stand = terrain.fbm(x * .006 + 7, z * .006, 3)
        keep = ((d > half + 14 + rng.random(n) * 30) & (alt < treeline + rng.normal(0, 40, n)) & (slope < .9)
                & (rng.random(n) < terrain.smooth(.38, .58, stand) * .95 + .04))
        x, y, z = x[keep], y[keep], z[keep]
        self.log(f"{len(x)} trees")
        bark, needles = self.bark_material(), self.needle_material()
        kinds = []
        for i in range(6):
            tr, nd = flora.spruce_cards(100 + i, 16 + i * 2.5)
            t_ob = self.library_object(f"spruce{i}", tr, bark)
            n_ob = flora.mesh_object(self.bpy, f"spruce{i}-needles", *nd, collection=self.lib, smooth=True)
            n_ob.data.materials.append(needles)
            n_ob.parent = t_ob
            # one object per kind: needles joined to the trunk
            me = self.join(t_ob, n_ob)
            kinds.append(me)
        m = len(x)
        rot = np.stack([rng.normal(0, .03, m), rng.normal(0, .03, m), rng.random(m) * 2 * np.pi], 1)
        size = (.55 + rng.random(m) ** .7 * .75) * np.where(alt[keep] > treeline * .7, .7, 1.0) if m else np.zeros(0)
        places = np.stack([x, -z, y - .2], 1)
        self.scatter("forest", kinds, places, rot, size, rng.integers(0, len(kinds), m))

    def join(self, a, b):
        bpy = self.bpy
        me = bpy.data.meshes.new(a.name + "-whole")
        import bmesh
        bm = bmesh.new()
        for ob in (a, b):
            bm.from_mesh(ob.data)
        bm.to_mesh(me)
        bm.free()
        for mat in (a.data.materials[0], b.data.materials[0]):
            me.materials.append(mat)
        # the needles' faces come after the trunk's: give them the second material
        nt = len(a.data.polygons)
        idx = np.zeros(len(me.polygons), np.int32)
        idx[nt:] = 1
        me.polygons.foreach_set("material_index", idx)
        ob = bpy.data.objects.new(a.name + "-tree", me)
        self.lib.objects.link(ob)
        bpy.data.objects.remove(b, do_unlink=True)
        bpy.data.objects.remove(a, do_unlink=True)
        return ob

    def boulder(self, name, seed):
        """A boulder as rock breaks: a few flat fracture faces meeting at edges chipped round, the surface rough
        at every scale from hand-sized lumps to grit, wider than tall."""
        import bmesh
        from mathutils import Vector, noise
        rng = np.random.default_rng(seed)
        bm = bmesh.new()
        pts = rng.normal(size=(int(13 + rng.integers(0, 6)), 3))
        pts /= np.linalg.norm(pts, axis=1, keepdims=True)
        pts *= (.75 + rng.random((len(pts), 1)) * .35)
        pts *= np.array([1.0 + rng.random() * .35, .8 + rng.random() * .35, .7 + rng.random() * .35])
        for p in pts:
            bm.verts.new(p)
        bmesh.ops.convex_hull(bm, input=bm.verts)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        # round the edges a little, as weather does, keeping the faces flat
        # cut finer for the surface's roughness, the faces kept flat (smooth 0) and their edges only just worn
        bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=1, use_grid_fill=True, smooth=.06)
        for _ in range(3):
            bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=1, use_grid_fill=True, smooth=0)
        off = Vector(rng.random(3) * 100)
        for v in bm.verts:
            q = v.co * 2.2 + off
            d = (noise.fractal(q, .55, 2.1, 6) * .08 + noise.ridged_multi_fractal(q * 3, .6, 2.2, 5, 1, 2) * .035
                 + noise.noise(q * 12) * .012)
            v.co += v.normal * d
        me = self.bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for f in me.polygons:
            f.use_smooth = True
        ob = self.bpy.data.objects.new(name, me)
        self.lib.objects.link(ob)
        return ob

    def rocks(self, o):
        rng = np.random.default_rng(9)
        mat = self.rock_material()
        kinds = []
        for i in range(6):
            ob = self.boulder(f"rock{i}", 30 + i)
            ob.data.materials.append(mat)
            kinds.append(ob)
        n = 7000
        half = float(o.get("road") or 7) / 2 + 2
        s = rng.random(n) * 3200 - 150
        off = (half + 1 + rng.random(n) ** 1.4 * 500) * np.where(rng.random(n) < .5, -1, 1)
        pts = np.array([terrain.road_at(si, oi)[0] for si, oi in zip(s, off)])
        x, z = pts[:, 0], pts[:, 2]
        # in clusters where the ground is broken, few in the open meadow
        keep = rng.random(n) < terrain.smooth(.45, .62, terrain.fbm(x * .01 + 4, z * .01, 3)) * .9 + .1
        x, z, off = x[keep], z[keep], off[keep]
        m = len(x)
        y = self.height_at(x, z, o)
        size = (.15 + rng.random(m) ** 5 * 3.5) * np.where(np.abs(off) < half + 15, .55, 1)
        rot = np.stack([rng.normal(0, .15, m), rng.normal(0, .15, m), rng.random(m) * 6.28], 1)
        # sunk well into the soil, as boulders sit
        self.scatter("rocks", kinds, np.stack([x, -z, y - size * .45], 1), rot, size, rng.integers(0, len(kinds), m))

    def rock_material(self):
        """Weathered granite: speckled grey, darker and earthy at the foot where it meets the soil, lichen in
        pale and yellow-green patches, moss on the tops, rough at every scale."""
        bpy = self.bpy
        m = bpy.data.materials.get("rock") or bpy.data.materials.new("rock")
        m.use_nodes = True
        k = Nodes(m.node_tree)
        pos = k.n("ShaderNodeTexCoord").outputs["Object"]
        rnd = k.n("ShaderNodeObjectInfo").outputs["Random"]
        nz = k.n("ShaderNodeSeparateXYZ")
        k.l(k.n("ShaderNodeNewGeometry").outputs["Normal"], nz.inputs[0])
        sep = k.n("ShaderNodeSeparateXYZ")
        k.l(pos, sep.inputs[0])
        n1, n2 = k.noise(pos, 3, 8, .6), k.noise(pos, 14, 6, .7)
        speck = k.n("ShaderNodeTexVoronoi", inputs={"Scale": 90})
        k.l(pos, speck.inputs["Vector"])
        geo = k.n("ShaderNodeNewGeometry")
        # pointiness: high on the edges and knobs (worn pale by weather), low in hollows (dark, damp)
        edge = k.ramp(geo.outputs["Pointiness"], .5, .56)
        hollow = k.ramp(geo.outputs["Pointiness"], .49, .44)
        col = k.mix(k.ramp(n1, .3, .7), srgb("#45423e"), srgb("#635e57"))
        col = k.mix(k.math("MULTIPLY", rnd, .55), col, srgb("#6a6156"))
        col = k.mix(k.math("MULTIPLY", k.ramp(speck.outputs["Distance"], .05, 0), .45), col, srgb("#2a2826"))
        col = k.mix(k.math("MULTIPLY", k.ramp(n2, .62, .7), .35), col, srgb("#8b867d"))
        col = k.mix(k.math("MULTIPLY", edge, .4), col, srgb("#8f8a82"))
        col = k.mix(k.math("MULTIPLY", hollow, .75), col, srgb("#22201d"))
        # streaks where rain runs down the sides
        streak = k.n("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", inputs={"Scale": 6, "Distortion": 14, "Detail": 4})
        k.l(pos, streak.inputs["Vector"])
        col = k.mix(k.math("MULTIPLY", k.ramp(streak.outputs["Fac"], .8, .95), .12), col, srgb("#3d3a35"))
        # lichen: crusty patches, pale grey-green and a few yellow
        lich = k.noise(pos, 5, 4, .5)
        col = k.mix(k.math("MULTIPLY", k.ramp(lich, .63, .66), .7), col, srgb("#a3a38d"))
        col = k.mix(k.math("MULTIPLY", k.ramp(k.noise(pos, 7, 3), .71, .73), .6), col, srgb("#a89c45"))
        # moss where it faces up and is sheltered
        moss = k.math("MULTIPLY", k.ramp(nz.outputs["Z"], .6, .92), k.ramp(k.noise(pos, 2.2, 5), .5, .62))
        col = k.mix(k.math("MULTIPLY", moss, .85), col, srgb("#3d4a1f"))
        # earthy at the foot
        col = k.mix(k.math("MULTIPLY", k.ramp(sep.outputs["Z"], -.1, -.35), .7), col, srgb("#3a2f25"))
        bsdf = k.n("ShaderNodeBsdfPrincipled", inputs={"Specular IOR Level": .35})
        k.l(col, bsdf.inputs["Base Color"])
        k.l(k.math("ADD", k.math("MULTIPLY", moss, .1), .82), bsdf.inputs["Roughness"])
        # relief at three scales: lumps, the grain of the stone, grit; no regular cracks
        rough = k.n("ShaderNodeTexNoise", inputs={"Scale": 6, "Detail": 15, "Roughness": .72, "Distortion": .8})
        k.l(pos, rough.inputs["Vector"])
        h = k.math("ADD", k.math("MULTIPLY", rough.outputs["Fac"], .9), k.math("MULTIPLY", n2, .4))
        h = k.math("ADD", h, k.math("MULTIPLY", k.noise(pos, 60, 4), .2))
        bump = k.n("ShaderNodeBump", inputs={"Strength": 1.0, "Distance": .09})
        k.l(h, bump.inputs["Height"])
        k.l(bump.outputs["Normal"], bsdf.inputs["Normal"])
        k.l(bsdf.outputs[0], k.n("ShaderNodeOutputMaterial").inputs["Surface"])
        return m

    def grass_material(self):
        bpy = self.bpy
        m = bpy.data.materials.get("grass")
        if m:
            return m
        m = bpy.data.materials.new("grass")
        m.use_nodes = True
        k = Nodes(m.node_tree)
        rnd = k.n("ShaderNodeObjectInfo").outputs["Random"]
        uv = k.n("ShaderNodeUVMap", uv_map="UVMap").outputs[0]
        sep = k.n("ShaderNodeSeparateXYZ")
        k.l(uv, sep.inputs[0])
        # each tuft its own green, from deep to yellowing, and a few dry; darker where the meadow is lush
        gp = k.n("ShaderNodeNewGeometry").outputs["Position"]
        # UV u: the blade's number (whole) and where across it (fraction); 100 and up, seed stems and heads
        u = sep.outputs["X"]
        blade = k.math("DIVIDE", k.math("FLOOR", u), 100)
        across = k.math("FRACT", u)
        up = sep.outputs["Y"]
        mixed = k.math("FRACT", k.math("ADD", blade, k.math("MULTIPLY", rnd, 3.7)))
        base = k.mix(mixed, srgb("#2c4416"), srgb("#55702a"))
        base = k.mix(k.math("MULTIPLY", k.ramp(mixed, .8, .97), .8), base, srgb("#8d8450"))
        base = k.mix(k.ramp(blade, .995, 1.0), base, srgb("#a39466"))   # seed stems and heads
        base = k.mix(k.math("MULTIPLY", k.ramp(k.noise(gp, .06, 3), .4, .65), .45), base, srgb("#26371a"))
        # a blade's lines: a pale midrib down the middle, fine parallel veins either side, edges a shade lighter,
        # and on some the tip drying to straw
        off = k.math("ABSOLUTE", k.math("SUBTRACT", across, .5))
        rib = k.ramp(off, .045, .015)
        cells = k.math("FRACT", k.math("MULTIPLY", across, 11))
        vein = k.ramp(k.math("MINIMUM", cells, k.math("SUBTRACT", 1, cells)), .16, .04)
        edge = k.ramp(off, .43, .5)
        base = k.mix(k.math("MULTIPLY", vein, .32), base, k.mix(.6, base, srgb("#141f08")))
        base = k.mix(k.math("MULTIPLY", rib, .5), base, k.mix(.5, base, srgb("#c4cf8a")))
        base = k.mix(k.math("MULTIPLY", edge, .3), base, srgb("#9aa860"))
        base = k.mix(k.math("MULTIPLY", k.ramp(up, .8, 1), k.ramp(mixed, .45, .7)), base, srgb("#a69a62"))
        col = k.mix(k.ramp(up, .0, .6), k.mix(.5, base, srgb("#22300f")), base)
        bsdf = k.n("ShaderNodeBsdfPrincipled", inputs={"Roughness": .55, "Specular IOR Level": .45})
        k.l(col, bsdf.inputs["Base Color"])
        # the ridges of the veins and the raised midrib, in the light
        ridge = k.n("ShaderNodeBump", inputs={"Strength": .6, "Distance": .00035})
        k.l(k.math("SUBTRACT", k.math("MULTIPLY", rib, .8), k.math("MULTIPLY", vein, .5)), ridge.inputs["Height"])
        k.l(ridge.outputs["Normal"], bsdf.inputs["Normal"])
        tr = k.n("ShaderNodeBsdfTranslucent")
        k.l(col, tr.inputs["Color"])
        mixs = k.n("ShaderNodeMixShader", inputs={"Fac": .18})
        k.l(bsdf.outputs[0], mixs.inputs[1])
        k.l(tr.outputs[0], mixs.inputs[2])
        k.l(mixs.outputs[0], k.n("ShaderNodeOutputMaterial").inputs["Surface"])
        return m

    def grass(self, o, cam_pos, look_dir):
        """Grass tufts round the camera and in front of it, thick near and thinning off; none on the road or
        where the land is too steep. Placed again only when the camera has moved far enough to need it."""
        if self.grass_at is not None and np.linalg.norm(np.array(cam_pos) - self.grass_at) < 25:
            return
        self.grass_at = np.array(cam_pos)
        self.clear("grass")
        bpy = self.bpy
        kinds = [o_ for o_ in bpy.data.objects if o_.name.startswith("tuft")]
        if not kinds:
            mat = self.grass_material()
            kinds = [self.library_object(f"tuft{i}", flora.grass_clump(60 + i), mat) for i in range(8)]
        rng = np.random.default_rng(int(abs(cam_pos[0]) * 7 + abs(cam_pos[1]) * 13) % 2**31)
        # tufts at the density of a real meadow: about 30 a square metre near the camera, thinning with distance
        # (past 60 m the land's own colour carries the grass), across the view and a margin
        fx, fz = look_dir[0], look_dir[2]
        ln = math.hypot(fx, fz) or 1
        fx, fz = fx / ln, fz / ln
        span = 1.9                                    # radians across: the view and a margin either side
        rings = [(0.3, 15, 40), (15, 60, 26), (60, 240, 7)]
        xs, zs = [], []
        for r0, r1, per in rings:
            count = int(per * span / 2 * (r1 * r1 - r0 * r0))
            r = np.sqrt(r0 * r0 + rng.random(count) * (r1 * r1 - r0 * r0))     # even over the area
            ang = (rng.random(count) - .5) * span
            ca, sa = np.cos(ang), np.sin(ang)
            xs.append(cam_pos[0] + (fx * ca - fz * sa) * r)
            zs.append(cam_pos[2] + (fz * ca + fx * sa) * r)
        x, z = np.concatenate(xs), np.concatenate(zs)
        n = len(x)
        half = float(o.get("road") or 0) / 2 + .9
        d = terrain.road_dist(x, z)
        y = self.height_at(x, z, o)
        slope = np.abs(self.height_at(x + 1, z, o) - y) + np.abs(self.height_at(x, z + 1, o) - y)
        patch = terrain.fbm(x * .08 + 3, z * .08 - 5, 3)
        keep = (d > half + rng.random(n) * .6) & (slope < 1.8) & (rng.random(n) < terrain.smooth(.25, .6, patch) * .5 + .5)
        x, y, z = x[keep], y[keep], z[keep]
        m = len(x)
        size = (.6 + rng.random(m) ** 2 * .6) * (.75 + patch[keep] * .5) * np.where(d[keep] < half + 2.5, .65, 1)
        rot = np.stack([rng.normal(0, .08, m), rng.normal(0, .08, m), rng.random(m) * 6.28], 1)
        self.scatter("grass", kinds, np.stack([x, -z, y - .02], 1), rot, size, rng.integers(0, len(kinds), m))

    # ----- sky and sun -----
    def sky(self, o):
        bpy = self.bpy
        el, az = max(-10.0, min(90.0, float(o.get("sunEl") or 0))), float(o.get("sunAz") or 0)
        kind = o.get("sky") or "day"
        power = float(o.get("sunPower") if o.get("sunPower") is not None else 100) / 100
        if not self.changed("sky", [el, az, kind, power, o.get("dust"), o.get("clouds")]):
            return
        k = Nodes(self.world.node_tree)
        out = k.n("ShaderNodeOutputWorld")
        if kind == "studio":
            bg = k.n("ShaderNodeBackground", inputs={"Color": srgb("#3a3c42"), "Strength": 1.0})
            k.l(bg.outputs[0], out.inputs["Surface"])
            return
        haze = {"day": 1.0, "sunset": 1.6, "dusk": 2.0, "haze": 4.0, "overcast": 8.0, "night": 1.0}.get(kind, 1.0)
        sky = k.n("ShaderNodeTexSky", sky_type="MULTIPLE_SCATTERING")
        sky.sun_elevation = math.radians(el)
        # Riptide's sun is at azimuth A from straight ahead (-z), turning right; Blender's sky turns from +y
        sky.sun_rotation = math.radians(-az) % (2 * math.pi)
        sky.sun_disc = kind not in ("overcast",)
        sky.sun_intensity = power
        sky.altitude = 900
        sky.air_density = 1.0
        sky.aerosol_density = haze + float(o.get("dust") or 0) / 40
        sky.ozone_density = 1.0
        strength = {"night": .015, "overcast": .6}.get(kind, 1.0)
        bg = k.n("ShaderNodeBackground", inputs={"Strength": strength * .35})
        cover = max(0.0, min(100.0, float(o.get("clouds") or 0))) / 100
        if kind == "overcast":
            cover = max(cover, .85)
        if cover > 0:
            # a layer of cloud a few kilometres up: noise laid on a plane overhead, seen in perspective, lit on
            # top and grey beneath, thinning to nothing at the horizon
            d = k.n("ShaderNodeTexCoord").outputs["Generated"]
            sep = k.n("ShaderNodeSeparateXYZ")
            k.l(d, sep.inputs[0])
            up = k.math("MAXIMUM", sep.outputs["Z"], .02)
            plane = k.n("ShaderNodeCombineXYZ")
            k.l(k.math("DIVIDE", sep.outputs["X"], up), plane.inputs["X"])
            k.l(k.math("DIVIDE", sep.outputs["Y"], up), plane.inputs["Y"])
            warp = k.n("ShaderNodeTexNoise", inputs={"Scale": 1.1, "Detail": 3, "Distortion": .6})
            k.l(plane.outputs[0], warp.inputs["Vector"])
            moved = k.n("ShaderNodeVectorMath", operation="MULTIPLY_ADD", inputs={1: (.35, .35, .35)})
            k.l(warp.outputs["Color"], moved.inputs[0])
            k.l(plane.outputs[0], moved.inputs[2])
            body = k.n("ShaderNodeTexNoise", inputs={"Scale": 2.2, "Detail": 9, "Roughness": .62})
            k.l(moved.outputs[0], body.inputs["Vector"])
            alpha = k.ramp(body.outputs["Fac"], .72 - cover * .32, .86 - cover * .22)
            alpha = k.math("MULTIPLY", alpha, k.ramp(sep.outputs["Z"], .02, .2))
            lit = srgb("#ffffff") if kind in ("day", "haze") else srgb("#ffd9b0")
            shade = k.mix(k.ramp(body.outputs["Fac"], .7, .95), (.8, .83, .88, 1), lit)
            glow = k.n("ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY", inputs={0: 1.0, 7: (2.2 if kind != "overcast" else 1.0,) * 3 + (1,)})
            k.l(shade, glow.inputs[6])
            cloud_col = glow.outputs[2]
            sky_col = k.mix(alpha, sky.outputs[0], cloud_col)
            k.l(sky_col, bg.inputs["Color"])
        else:
            k.l(sky.outputs[0], bg.inputs["Color"])
        k.l(bg.outputs[0], out.inputs["Surface"])
        self.sun_dir = np.array(to_b((math.sin(math.radians(az)) * math.cos(math.radians(el)), math.sin(math.radians(el)),
                                      -math.cos(math.radians(az)) * math.cos(math.radians(el)))))

    # ----- the camera -----
    def camera(self, c, W, H):
        cam = self.cam
        pos = np.array(to_b(c["pos"]))
        fwd = np.array(to_b(c["dir"]))
        up = np.array(to_b(c.get("up") or [0, 1, 0]))
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, up)
        right /= np.linalg.norm(right) or 1
        up2 = np.cross(right, fwd)
        # Blender's camera looks down its -z, with y up
        R = np.stack([right, up2, -fwd], 1)
        from mathutils import Matrix
        M = Matrix.Identity(4)
        for i in range(3):
            for j in range(3):
                M[i][j] = float(R[i, j])
            M[i][3] = float(pos[i])
        cam.matrix_world = M
        cd = cam.data
        cd.sensor_fit = "VERTICAL"
        cd.angle_y = math.radians(float(c["fov"]))
        cd.clip_start, cd.clip_end = .05, 60000
        dof = float(c.get("dof") or 0)
        cd.dof.use_dof = dof > 0
        if dof > 0:
            cd.dof.focus_distance = float(c.get("focus") or 10)
            cd.dof.aperture_fstop = max(.7, 16 / (1 + dof / 6))
        sc = self.sc
        sc.render.resolution_x, sc.render.resolution_y = W, H
        sc.render.resolution_percentage = 100
        return pos, fwd

    # ----- props and 3D layers, as the editor built them -----
    def import_props(self, glb_path, place):
        bpy = self.bpy
        for ob in self.props:
            try:
                bpy.data.objects.remove(ob, do_unlink=True)
            except ReferenceError:
                pass
        self.props = []
        if not glb_path:
            return
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(glb_path), merge_vertices=True)
        self.props = [ob for ob in bpy.data.objects if ob not in before]
        # the editor's props are in its canvas units, the ground eye-height below the camera: to metres, on the
        # ground
        root = bpy.data.objects.new("props-root", None)
        self.col.objects.link(root)
        s = float(place.get("scale") or .01)
        root.scale = (s, s, s)
        root.location = (0, 0, float(place.get("lift") or 0))
        for ob in self.props:
            if ob.parent is None:
                ob.parent = root
        self.props.append(root)
        for ob in self.props:
            for slot in getattr(ob, "material_slots", []):
                if slot.material and slot.material.node_tree:
                    self.dress(slot.material)

    def dress(self, mat):
        """Props from the editor come with plain physical materials; give car paint a clear coat, and glass
        real transmission."""
        b = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not b:
            return
        name = mat.name.lower()
        if "paint" in name or b.inputs["Coat Weight"].default_value > .5:
            b.inputs["Coat Weight"].default_value = 1
            b.inputs["Coat Roughness"].default_value = .03

    # ----- one frame -----
    def frame(self, job, out_png):
        sc = self.sc
        o = job["world"]
        W, H = int(job["width"]), int(job["height"])
        q = QUALITY.get(job.get("quality") or "good", QUALITY["good"])
        sc.cycles.samples = int(job.get("samples") or q["samples"])
        b = q["bounces"]
        sc.cycles.max_bounces, sc.cycles.diffuse_bounces, sc.cycles.glossy_bounces = b, max(2, b // 2), max(2, b // 2)
        sc.cycles.transmission_bounces, sc.cycles.transparent_max_bounces, sc.cycles.volume_bounces = b, 8, 0
        sc.view_settings.exposure = float(o.get("exposure") or 0) - 1.3
        self.sky(o)
        ground = o.get("ground")
        if ground == "mountains":
            self.build_mountains(o)
        else:
            self.plain_ground(o)
        pos, fwd = self.camera(job["camera"], W, H)
        if ground == "mountains":
            rp = (pos[0], pos[2], -pos[1])
            self.land_mesh(o, (pos[0], pos[2], -pos[1]), math.atan2(-fwd[1], fwd[0]), job.get("quality") or "good")
            self.grass(o, rp, (fwd[0], fwd[2], -fwd[1]))
        self.import_props(job.get("glb"), job.get("props") or {})
        exr = Path(out_png).with_suffix(".exr")
        sc.render.image_settings.media_type = "MULTI_LAYER_IMAGE"
        sc.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
        sc.render.image_settings.color_depth = "32"
        sc.render.filepath = str(exr)
        t0 = time.time()
        self.bpy.ops.render.render(write_still=True)
        self.log(f"traced {W}x{H} at {sc.cycles.samples} samples on {self.device} in {time.time() - t0:.1f}s")
        img = self.air(exr, o, pos)
        self.save(img, out_png)
        exr.unlink(missing_ok=True)
        return {"ms": int((time.time() - t0) * 1000), "device": self.device}

    def plain_ground(self, o):
        """Grounds other than the mountains, for now: a floor of the ground's colour, the sky and the light."""
        bpy = self.bpy
        if not self.changed("plain", [o.get("ground"), o.get("groundColor")]):
            return
        self.clear("floor")
        if o.get("ground") in (None, "none"):
            return
        me = bpy.data.meshes.new("floor")
        s = 20000
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        ob = bpy.data.objects.new("floor", me)
        self.col.objects.link(ob)
        m = bpy.data.materials.new("floor")
        m.use_nodes = True
        b = m.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = srgb(o.get("groundColor") or "#808080")
        b.inputs["Roughness"].default_value = .8
        me.materials.append(m)

    def air(self, exr, o, cam):
        """The air between the camera and everything: thicker low down, thinning with height, tinted the colour
        of the sky at the horizon and lit towards the sun (as the editor's height fog, from the same settings),
        laid over the traced picture before it is graded."""
        import OpenEXR
        ch = {}
        with OpenEXR.File(str(exr), separate_channels=True) as f:
            for part in f.parts:
                for name, c in part.channels.items():
                    ch[name] = np.array(c.pixels)
        names = list(ch)

        def get(*cands):
            for c in cands:
                for n in names:
                    if n.endswith(c):
                        return np.asarray(ch[n], np.float32)
            raise KeyError(cands)
        rgb = np.stack([get("Combined.R"), get("Combined.G"), get("Combined.B")], -1)
        P = np.stack([get("Position.X"), get("Position.Y"), get("Position.Z")], -1)
        Z = get("Depth.Z", ".Z")
        sky = Z > 1e8
        haze = float(o.get("haze") or 0)
        fog = float(o.get("fog") or 0)
        if haze <= 0 and fog <= 0:
            return rgb
        v = P - cam[None, None, :]
        dist = np.linalg.norm(v, axis=-1)
        dirs = v / np.maximum(dist, 1e-6)[..., None]
        # rays to the sky: as far as the air goes, along the way they point
        if sky.any():
            H, W = sky.shape
            cd = self.cam.data
            yy, xx = np.mgrid[0:H, 0:W]
            ty = math.tan(cd.angle_y / 2)
            px = (xx + .5 - W / 2) / (H / 2) * ty
            py = -(yy + .5 - H / 2) / (H / 2) * ty
            M = np.array(self.cam.matrix_world)[:3, :3]
            d = np.stack([px, py, -np.ones_like(px)], -1) @ M.T
            d /= np.linalg.norm(d, axis=-1, keepdims=True)
            dirs = np.where(sky[..., None], d, dirs)
            dist = np.where(sky, 1e5, dist)
        density = min(100.0, haze) * 4e-5 + min(100.0, fog) * 2e-6
        b = 1 / max(1.0, float(o.get("hazeFall") or 250))
        h0 = max(cam[2], 0)
        dh = dirs[..., 2] * dist
        bd = b * dh
        k = np.where(np.abs(bd) > 1e-4, (1 - np.exp(-np.clip(bd, -50, 50))) / np.where(np.abs(bd) > 1e-4, bd, 1), 1)
        amount = 1 - np.exp(-density * math.exp(-b * h0) * dist * k)
        amount = np.where(sky, amount * np.clip(1 - dirs[..., 2] / .3, 0, 1) * .85, amount)
        # the air's own colour: the sky's, just above the horizon, where the picture shows it
        band = sky & (dirs[..., 2] > 0) & (dirs[..., 2] < .12)
        air = rgb[band].mean(0) if band.sum() > 50 else np.array([.55, .65, .8]) * .5
        glow = float(o.get("hazeGlow") if o.get("hazeGlow") is not None else 60) / 100
        to_sun = np.clip(dirs @ self.sun_dir, 0, 1)[..., None] if hasattr(self, "sun_dir") else 0
        sun_col = air * np.array([1.25, 1.05, .8])
        col = air[None, None, :] + sun_col * (to_sun ** 6 * .6 + to_sun ** 40 * 1.4) * glow
        return rgb * (1 - amount[..., None]) + col * amount[..., None]

    def save(self, rgb, out_png):
        bpy = self.bpy
        H, W, _ = rgb.shape
        img = bpy.data.images.get("frame") or bpy.data.images.new("frame", W, H, float_buffer=True)
        if img.size[0] != W or img.size[1] != H:
            img.scale(W, H)
        px = np.ones((H, W, 4), np.float32)
        px[..., :3] = rgb[::-1]
        img.pixels.foreach_set(px.ravel())
        sc = self.sc
        sc.render.image_settings.media_type = "IMAGE"
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_depth = "8"
        sc.render.image_settings.color_mode = "RGB"
        img.save_render(str(out_png), scene=sc)

    @staticmethod
    def log(msg):
        print(f"[native] {msg}", flush=True)
