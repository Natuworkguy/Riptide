"""Riptide MCP server: lets AI agents see and edit the animation open in the Riptide editor, live.

    agent  <--MCP (stdio)-->  mcp_server.py  <--HTTP-->  server.py  <--SSE-->  the editor tab in your browser

Every change goes through the editor itself, so you watch it happen, it lands in undo history,
and nothing is written to disk until you save. Run server.py and open http://127.0.0.1:5173 first.

Two ways to connect:
  * URL (streamable HTTP): http://127.0.0.1:5173/mcp  (served by server.py, nothing else to run)
  * stdio: {"command": "/path/to/riptide/.venv/bin/python", "args": ["/path/to/riptide/mcp_server.py"]}
Set RIPTIDE_URL if the editor runs somewhere other than http://127.0.0.1:5173.
"""
import base64
import sys
import json
import os
import urllib.error
import urllib.request
from typing import Any, Literal

import anyio

from mcp.server.mcpserver import Image, MCPServer
from mcp.server.mcpserver.exceptions import ToolError

RIPTIDE = (os.environ.get("RIPTIDE_URL") or os.environ.get("WOBBLE_URL") or "http://127.0.0.1:5173").rstrip("/")

mcp = MCPServer(
    "riptide",
    instructions=(
        "Riptide is a keyframe motion-graphics editor running in the user's browser. Use get_project first to see the "
        "canvas, duration and layers (ids, types, timing, which properties are keyframed). Riptide can have several windows "
        "open, each a project of its own: list_windows shows them, use_window picks one and open_window opens another; "
        "with only one window open, tools work in it. With more than one open, call list_windows and then use_window with "
        "the one the user means (ask them when it is unclear) before anything else: until a window is picked, the other "
        "tools refuse to act. Use see_frames to look at "
        "the animation (a contact sheet over time) and see_frame for one moment. Coordinates are canvas pixels with "
        "x,y at the layer's centre; times are seconds. Colours are hex strings. list_capabilities gives every layer "
        "type's properties, the easing names, presets and blend modes. All edits appear live and can be undone."
    ),
)


class RiptideError(ToolError):
    """Shown to the agent verbatim (other exceptions are masked as 'Error executing tool')."""


# The Riptide window every tool works in: its id, set by use_window or open_window; None is the one last used.
WINDOW: str | None = None
# Whether a window was picked on purpose (use_window, even with none, or open_window). With more than one window open,
# tools refuse to act until one is, so a change never lands in the wrong project.
PICKED = False


def must_pick() -> None:
    """Raise when several windows are open and none has been picked yet."""
    if PICKED or WINDOW:
        return
    try:
        found = post("/api/live/status", None, timeout=5).get("windows") or []
    except RiptideError:
        return      # call() reports the server being down
    if len(found) > 1:
        raise RiptideError(
            f"Riptide has {len(found)} windows open: " + ", ".join(f'"{w["name"]}" ({w["id"]})' for w in found)
            + ". Pick the one the user means with use_window first (ask them if it is unclear), then try again.")


def post(path: str, body: dict | None, timeout: float = 60) -> Any:
    """What the Riptide server answers to BODY at PATH (a GET with no body)."""
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{RIPTIDE}{path}", data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout + 5) as r:
            found = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            found = json.loads(e.read())
        except Exception:
            raise RiptideError(f"Riptide server error {e.code}") from None
    except urllib.error.URLError:
        raise RiptideError(f"Cannot reach the Riptide server at {RIPTIDE}. Start it with: .venv/bin/python server.py") from None
    if isinstance(found, dict) and found.get("ok") is False:
        raise RiptideError(found.get("error") or "The editor refused that change")
    return found


def call(op: str, args: dict | None = None, timeout: float = 60) -> Any:
    must_pick()
    body = json.dumps({"op": op, "args": {k: v for k, v in (args or {}).items() if v is not None}, "timeout": timeout,
                       "window": WINDOW}).encode()
    req = urllib.request.Request(f"{RIPTIDE}/api/live/op", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout + 5) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            data = json.loads(e.read())
        except Exception:
            raise RiptideError(f"Riptide server error {e.code}") from None
    except urllib.error.URLError:
        raise RiptideError(f"Cannot reach the Riptide server at {RIPTIDE}. Start it with: .venv/bin/python server.py") from None
    if isinstance(data, dict) and data.get("ok") is False:
        raise RiptideError(data.get("error") or "The editor refused that change")
    return data


async def acall(op: str, args: dict | None = None, timeout: float = 60) -> Any:
    """call() on a worker thread, so waiting for the browser never blocks the MCP server's event loop."""
    return await anyio.to_thread.run_sync(lambda: call(op, args, timeout))


def png(data_url: str) -> Image:
    return Image(data=base64.b64decode(data_url.split(",", 1)[1]), format="png")


# ---------- windows ----------
@mcp.tool()
async def list_windows() -> dict:
    """Every Riptide window open in the browser: its id, its project's name, and which was used last. Each window is
    a project of its own. With no use_window, tools work in the one used last."""
    found = await anyio.to_thread.run_sync(lambda: post("/api/live/status", None, 10))
    return {"windows": found.get("windows", []), "working_in": WINDOW or "the window used last",
            **({"pick": "More than one window is open: call use_window with the one the user means before acting."}
               if len(found.get("windows", [])) > 1 and not (PICKED or WINDOW) else {})}


@mcp.tool()
async def use_window(window: str | None = None) -> dict:
    """Work in one Riptide window from now on: its id, or its project's name (or the start of it), from
    list_windows. None goes back to whichever window was used last. With more than one window open, call this before
    any other tool: they refuse to act until a window is picked."""
    global WINDOW, PICKED
    PICKED = True
    if window:
        found = (await anyio.to_thread.run_sync(lambda: post("/api/live/status", None, 10))).get("windows", [])
        wanted = window.strip().lower()
        match = next((w for w in found if w["id"] == window), None) or next((w for w in found if w["name"].lower() == wanted), None) \
            or next((w for w in found if w["name"].lower().startswith(wanted)), None)
        if not match:
            raise RiptideError(f"No window is called {window!r}. Open ones: " + ", ".join(f'"{w["name"]}" ({w["id"]})' for w in found))
        WINDOW = match["id"]
        return {"ok": True, "working_in": match}
    WINDOW = None
    return {"ok": True, "working_in": "the window used last"}


@mcp.tool()
async def open_window(name: str = "Untitled", width: int | None = None, height: int | None = None,
                      duration: float | None = None, background: str | None = None) -> dict:
    """Open another Riptide window in the browser with a new project of its own, and work in it from now on. The
    windows already open keep their projects."""
    global WINDOW, PICKED
    body = {"name": name, "width": width, "height": height, "duration": duration, "background": background}
    found = await anyio.to_thread.run_sync(lambda: post("/api/live/open", {k: v for k, v in body.items() if v is not None}, 25))
    WINDOW = found["window"]["id"]
    PICKED = True
    return {"ok": True, "working_in": found["window"]}


# ---------- seeing ----------
@mcp.tool()
async def get_project() -> dict:
    """Overview of the open project: canvas size and background, duration, fps, playhead, markers, audio,
    and every layer (front first) with its id, type, in/out times, current property values and which properties have keyframes."""
    return await acall("get_project")


@mcp.tool()
async def get_layer(layer: str) -> dict:
    """Everything about one layer: all property values and every keyframe (time, value, easing). `layer` is its id or name."""
    return await acall("get_layer", {"id": layer})


@mcp.tool()
async def list_capabilities() -> dict:
    """Layer types with the properties each accepts, easing names, animation preset names, blend modes and looks."""
    return await acall("list_capabilities")


@mcp.tool()
async def see_frame(time: float | None = None, width: int = 720) -> Image:
    """Render the animation at `time` seconds (default: the playhead) and return it as an image `width` px wide."""
    return png((await acall("render_frame", {"time": time, "width": width}))["png"])


@mcp.tool()
async def see_frames(count: int = 8, times: list[float] | None = None, width: int = 300) -> Image:
    """A contact sheet of the animation: `count` evenly spaced moments (2-16) or the exact `times` you list,
    each labelled with its time. The best way to judge motion and timing."""
    return png((await acall("render_frames", {"count": count, "times": times, "width": width}))["png"])


# ---------- changing ----------
@mcp.tool()
async def add_layer(type: Literal["rect", "ellipse", "polygon", "star", "arc", "text", "wave", "shape3d", "camera", "figure", "adjust"], name: str | None = None,
              props: dict | None = None, start: float | None = None, end: float | None = None) -> dict:
    """Add a layer on top. `props` are initial values, e.g. {"x": 540, "y": 300, "w": 400, "h": 120, "fill": "#ff5a36", "radius": 20}
    or for text {"text": "Hello", "size": 96, "weight": 800, "fill": "#111111"}. `start`/`end` limit when it is visible (seconds).
    Text also takes "font" (a font's name: Inter, Arial, Georgia, or a library font such as Montserrat, Bebas Neue, Playfair
    Display, Pacifico, JetBrains Mono, fetched when used), "italic" (true/false), "align" ("left" | "center" | "right"),
    "tcase" ("none" | "upper" | "lower" | "title") and "lineh" (line height, % of the size, 110 by default).
Text "retype" is a second text to change to: with it set, apply the "Retype" preset to type the text, backspace
to the part both share, then type the rest of the new one (reveal 0-1 types, 1-2 erases, 2-3 types the new text).

    3D: "shape3d" is a lit solid, {"shape": "cube" | "sphere" | "cylinder" | "cone" | "torus" | "text", "w": 300, "h": 300,
    "d": 300 (thickness), "rotX": -20, "rotY": 30, "material": "matte" | "glossy" | "metal", "fill": "#4c8dff",
    "lightAngle": -45 (where the light comes from, degrees round from the top), "text": "Hi" (for shape "text")}.
    Any flat layer becomes 3D with {"three": true}, then turns with rotX and rotY (degrees) and moves back with z
    (pixels; positive is further away). A "camera" films every 3D layer: x and y are the point it looks at,
    orbit and tilt swing it round that point (degrees), dolly moves it closer (pixels), zoom narrows the lens
    (1 is normal) and rotation rolls it. The top visible camera is the one that films; with none, depth 0 is the
    canvas exactly. All of these animate.

    A "figure" is a person, a wooden mannequin: h is its height. Its joints are angles in degrees, all 0 standing
    with arms down: neck, spine, shoulderL, elbowL, shoulderR, elbowR, hipL, kneeL, hipR, kneeR (positive turns
    clockwise; each is relative to the part above). side (0 facing you, 100 side on) turns it. Every joint animates;
    the presets "Walk", "Walk across", "Run", "Jump", "Wave hello", "Dance", "Sit down", "Cheer" and "T-pose" pose it.

    Physics, on any flat layer: phys "falls" (a rigid body that drops, bounces and tumbles; a figure falls as a
    ragdoll) or "fixed" (a solid surface; keyframe it to push things), with bounce and friction (0 to 100), mass,
    vx and vy (a push, pixels a second), spin (degrees a second) and physAt (when it starts falling; before then its
    keyframes move it, and their speed carries on). The scene's gravity (pixels a second squared, default 1800),
    walls ("floor", "box" or "none") and drag (air, default 1) can be set from any layer's props.

    Finishing, on any layer that draws: mask "rect" | "ellipse" | "pen" (mx, my, mw, mh place it in the layer's own
    pixels from its centre; mround rounds a rect's corners; feather softens its edge, pixels; minv true keeps the
    outside; a pen mask's points are mpts, [[x, y], ...] around mx, my). matte "alpha" | "alphainv" | "luma" |
    "lumainv" shapes the layer by the one directly above it, which is then not drawn. A colour grade: temp and tint
    (-100 to 100), expo (stops), levels lvBlack, gamma, lvWhite, outBlack, outWhite (0 to 255), curves
    {"rgb" | "r" | "g" | "b": [[x, y], ...] from 0 to 1}, vig (vignette, 0 to 100) with vigSize (%), and lut (the name
    of a .cube LUT loaded in the editor) with lutMix (%). Images and videos key out a green screen with chroma true,
    keyColor (the screen's colour), keyTol and keySoft (0 to 100) and spill (%). An "adjust" layer draws nothing
    itself: its blur, adjustments, grade, vignette and mask apply to everything under it, within its box (w and h;
    it starts the size of the canvas). All the numbers animate."""
    return await acall("add_layer", {"type": type, "name": name, "props": props or {}, "in": start, "out": end})


@mcp.tool()
async def add_world(scene: Literal["wave", "rig", "studio", "desert", "night", "mountain", ""] = "", name: str | None = None,
                    props: dict | None = None) -> dict:
    """Add a 3D world at the bottom of the layers: a whole place to film, with a sky, a sun that casts shadows,
    the ground, the air, props, and a lens. 3D shapes and models above it stand inside it, lit and shadowed by
    it. `scene` starts from a ready-made one, keyed with a slow camera move: "wave" (a breaking wave at golden
    hour), "rig" (a worn film camera on a jib in a hazy wheat field, shallow focus), "studio" (a soft-lit floor
    for your shapes and models), "desert" (dunes and a monolith at dusk), "night" (moonlit sea), "mountain" (a red car up a winding
    road through pine forest under snowy peaks, filmed by a chase camera); "" is an empty
    world. `props` then changes any of its settings (all the numbers and colours animate, with update_layer or
    set_keyframes like any layer's):

    sky "sunset" | "day" | "dusk" | "haze" | "overcast" | "night" | "studio"; sunEl (degrees up), sunAz (degrees
    round: 0 is straight ahead of the camera, behind what it looks at), sunPower (%), clouds (%), wind (m/s:
    clouds, plants, dust and the sea move with it). ground "ocean" | "field" | "desert" | "mountains" | "floor" |
    "none", groundColor. Mountains: peaks (m), snow (snow line, % of the peaks), trees (pines, %), road (its width,
    m; 0 for none). A prop on the road: road (metres along it; key it to drive, about 22 m/s), lane (m right of the
    middle, 1.8 is the right-hand lane), lift (m above it, for a camera), and face "travel". The ocean: water (colour), waves (metres), chop (%), and a breaking wave: swell (its height, m;
    0 for none), curl (0 standing up to 1 thrown over and landing; key it to make the wave break), waveDist (m
    ahead) and waveAngle (degrees turned). A field: plants (colour), grass (%), grassH (m), sway (how hard
    the wheat sways, as wind m/s; 3 in the rig scene) and swayLoop (true fits the sway to the duration so it loops
    seamlessly). fog and dust (0 to
    100). The camera: eye (its height above the ground, m), heading (degrees looked round), pitch (degrees up),
    travel (m moved forwards), lens (mm). A camera layer also moves it: orbit, tilt, dolly (pixels) and zoom.
    The lens: dof (depth of field, 0 off), focus (m from the camera; 0 is the point it looks at), exposure
    (stops), bloom, grain, fringe (colour fringing at the edges) and ao (contact shadows), 0 to 100. The layer's
    own grade, vignette and LUT then finish it.

    objects is a list of props, in metres, built from parts: {"type": "box" | "cylinder" | "sphere" | "cone" |
    "torus" | "capsule" | "truss" | "label" | "group", "at": [x, y, z] (y up, z towards the camera, from the spot
    on the ground the camera looks at), "turn": [x, y, z] degrees, "size": [w, h, d], "finish": "worn-metal" |
    "leatherette" | "aluminium" | "chrome" | "steel" | "rubber" | "plastic" | "paint" | "glass" | "lens" | "wood" |
    "concrete" | "rust" | "gold" | "glow", "color", "glow" (brightness), "spin": [x, y, z] degrees a second,
    "bob" (m), "children": [...] placed from it}. A cylinder or cone's size is [diameter, height]; a box takes
    "round" (corner radius, m); a truss (a lattice tower or beam) takes "bays", "rod" (m) and "taper" (0 to 1);
    a label is a flat screen with "text" (lines split by \n), "color" and "background". See the result with
    see_frame."""
    return await acall("add_world", {"scene": scene, "name": name, "props": props or {}})


@mcp.tool()
async def update_layer(layer: str, props: dict | None = None, at_time: float | None = None, keyframe: bool = False,
                 ease: str | None = None, name: str | None = None, start: float | None = None, end: float | None = None,
                 hidden: bool | None = None, locked: bool | None = None, blend: str | None = None,
                 lock_position: bool | None = None, lock_width: bool | None = None,
                 lock_height: bool | None = None) -> dict:
    """Change a layer. Properties that already have keyframes get a keyframe at `at_time` (default playhead);
    others change everywhere unless `keyframe` is true. `ease` sets the easing of new keyframes.
    Also renames, retimes (start/end seconds), hides, locks, or sets a blend mode ("normal", "multiply", "screen", ...).
    A fill becomes a gradient with props grad ("linear" or "radial"; "none" for solid), fill2 (the second colour)
    and gradAngle (degrees for linear: 0 runs left to right, 90 top to bottom); fill2 and gradAngle animate.
    lock_position, lock_width and lock_height lock or unlock x/y, w and h: while locked, nothing changes them, and
    trying is an error. Respect the user's locks; unlock only when they ask."""
    return await acall("update_layer", {"id": layer, "props": props or {}, "time": at_time, "keyframe": keyframe, "ease": ease,
                                 "name": name, "in": start, "out": end, "hidden": hidden, "locked": locked, "blend": blend,
                                 "lock_position": lock_position, "lock_width": lock_width,
                                 "lock_height": lock_height})


@mcp.tool()
async def set_keyframes(layer: str, prop: str, keys: list[dict], replace: bool = False) -> dict:
    """Animate one property with keyframes, e.g. prop "y", keys [{"t": 0, "v": 600, "ease": "expoOut"}, {"t": 0.8, "v": 400}].
    The ease on a key shapes the motion towards the next key: a named one, or a custom curve as
    "cubic-bezier(x1, y1, x2, y2)" (as in CSS; y may go past 0 and 1 to overshoot). `replace` clears that property's existing keys first."""
    return await acall("set_keyframes", {"id": layer, "prop": prop, "keys": keys, "replace": replace})


@mcp.tool()
async def follow_music(layer: str, prop: str | None = None,
                       band: Literal["level", "bass", "mids", "treble", "kick", "snare", "hats", "vocals"] = "kick",
                       amount: float = 0.15, source: str = "mix", smooth: float | None = None, clear: bool = False) -> dict:
    """Make a layer's number follow the music: amount is added to prop (e.g. "scale", "y", "rotation", "bright",
    "shadow", "blur", "opacity") when the band is at its loudest, so {"prop": "scale", "band": "kick", "amount": 0.15}
    punches it 15% bigger on every kick. Bands: level (loudness), bass, mids, treble, and parts of the song: kick,
    snare and hats as hits, vocals. source is "mix" (everything playing) or one audio track, by id, name or number:
    import stems (drums, bass, vocals) as their own tracks to follow one exactly. smooth is how many milliseconds it
    takes to fall back (0 for hits, about 80 otherwise). clear removes the link on prop, or all of them."""
    return await acall("follow_music", {"id": layer, "prop": prop, "band": band, "amount": amount, "source": source,
                                        "smooth": smooth, "clear": clear})


@mcp.tool()
async def delete_keyframes(layer: str, prop: str | None = None, at_time: float | None = None) -> dict:
    """Delete keyframes: one property or all of them, at one time or every time. The value left behind is the one at that moment."""
    return await acall("delete_keyframes", {"id": layer, "prop": prop, "time": at_time})


@mcp.tool()
async def apply_preset(layer: str, preset: str, at_time: float | None = None) -> dict:
    """Apply a ready-made animation (e.g. "Pop in", "Rise", "Blur in", "Typewriter", "Retype", "Float", "Fade out") starting at `at_time`."""
    return await acall("apply_preset", {"id": layer, "preset": preset, "time": at_time})


@mcp.tool()
async def delete_layer(layer: str) -> dict:
    """Delete a layer."""
    return await acall("delete_layer", {"id": layer})


@mcp.tool()
async def reorder_layer(layer: str, to: str) -> dict:
    """Change stacking: "front", "back", "up", "down", or an index from the bottom (0 = back)."""
    return await acall("reorder_layer", {"id": layer, "to": to})


@mcp.tool()
async def set_composition(width: int | None = None, height: int | None = None, background: str | None = None,
                    duration: float | None = None, name: str | None = None, scale_content: bool = True) -> dict:
    """Change the canvas size, background colour, duration in seconds, or project name. On a resize the content is
    re-centred and, with scale_content (default), scaled to fit the new frame; keyframed positions move with it.
    Common sizes: 1080x1080 post, 1080x1350 portrait, 1080x1920 story/TikTok, 1920x1080 1080p, 3840x2160 4K."""
    return await acall("set_composition", {"width": width, "height": height, "background": background,
                                           "duration": duration, "name": name, "scale_content": scale_content})


@mcp.tool()
async def new_project(width: int = 1080, height: int = 1080, background: str = "#ffffff", duration: float = 5, name: str = "Untitled") -> dict:
    """Replace the open project with an empty one. Undo brings the old one back, but confirm with the user first."""
    return await acall("new_project", {"width": width, "height": height, "background": background, "duration": duration, "name": name})


@mcp.tool()
async def set_playhead(time: float) -> dict:
    """Move the editor's playhead so the user sees that moment."""
    return await acall("set_playhead", {"time": time})


@mcp.tool()
async def align_layers(how: str = "center", layers: list[str] | None = None, relative_to: str = "selection") -> dict:
    """Align or centre layers (ids or names; default: the current selection). `how`: center (move the group to the canvas
    centre), center_x, center_y, left, right, top, bottom, hcenter, vcenter (one layer aligns to the canvas; several align
    to each other unless relative_to="canvas"), distribute_x, distribute_y (three or more)."""
    return await acall("align_layers", {"how": how, "layers": layers, "relative_to": relative_to})


@mcp.tool()
async def select_layers(layers: list[str]) -> dict:
    """Select several layers at once (ids or names), as Shift-click would in the editor."""
    return await acall("select_layers", {"layers": layers})


@mcp.tool()
async def select_layer(layer: str | None = None) -> dict:
    """Select a layer in the editor (or clear the selection), so the user sees it highlighted."""
    return await acall("select_layer", {"id": layer})


@mcp.tool()
async def add_marker(time: float, label: str = "") -> dict:
    """Add a named timeline marker."""
    return await acall("add_marker", {"time": time, "label": label})


@mcp.tool()
async def find_beats() -> dict:
    """Listen to the music (the selected audio clip, else the longest) for its beat, and put a beat marker on each
    kick. Returns the beat times in seconds. Use before beat_hit."""
    return await acall("find_beats", {})


@mcp.tool()
async def beat_hit(hit: str, layer: str | None = None) -> dict:
    """Put a hit on every beat marker (or every marker, when there are no beat markers): Zoom punch, Shake, Glitch,
    Blur hit, Strobe, Slam or Spin hit on LAYER, or Flash, a white flash over the whole frame (no layer needed)."""
    return await acall("beat_hit", {"hit": hit, "id": layer})


AUDIO_TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac"}


def _audio_src(path: str) -> tuple[str, str]:
    p = os.path.abspath(os.path.expanduser(path))
    ext = os.path.splitext(p)[1].lower()
    if ext not in AUDIO_TYPES:
        raise RiptideError(f"Not an audio file I can use: {ext or 'no extension'}. Use one of {', '.join(AUDIO_TYPES)}")
    if not os.path.isfile(p):
        raise RiptideError(f"No such file: {p}")
    if os.path.getsize(p) > 40e6:
        raise RiptideError("That file is over 40 MB")
    with open(p, "rb") as f:
        return f"data:{AUDIO_TYPES[ext]};base64," + base64.b64encode(f.read()).decode(), os.path.basename(p)


@mcp.tool()
async def add_audio(path: str, start: float = 0, track: str | None = None,
                    fade_in: float | None = None, fade_out: float | None = None) -> dict:
    """Add an audio file from this computer (mp3, wav, m4a, aac, ogg, flac; up to 40 MB) as a clip starting at `start`
    seconds. It goes on a new audio track unless `track` names one (its id, name or 1-based number); clips on different
    tracks play together. Long files are trimmed to the end of the timeline. Returns the new clip and track ids."""
    src, name = _audio_src(path)
    return await acall("add_audio", {"src": src, "name": name, "start": start, "track": track,
                                     "fade_in": fade_in, "fade_out": fade_out}, timeout=120)


IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
               ".gif": "image/gif", ".svg": "image/svg+xml"}


@mcp.tool()
async def add_image(path: str, name: str | None = None, x: float | None = None, y: float | None = None) -> dict:
    """Add a picture from this computer (png, jpg, webp, gif or svg; up to 15 MB) as an image layer, sized to fit the
    canvas, centred unless x and y place its centre. Returns the new layer id."""
    p = os.path.abspath(os.path.expanduser(path))
    ext = os.path.splitext(p)[1].lower()
    if ext not in IMAGE_TYPES:
        raise RiptideError(f"Not an image I can use: {ext or 'no extension'}. Use one of {', '.join(IMAGE_TYPES)}")
    if not os.path.isfile(p):
        raise RiptideError(f"No such file: {p}")
    if os.path.getsize(p) > 15e6:
        raise RiptideError("That file is over 15 MB")
    with open(p, "rb") as f:
        src = f"data:{IMAGE_TYPES[ext]};base64," + base64.b64encode(f.read()).decode()
    return await acall("add_image", {"src": src, "file": os.path.basename(p), "name": name, "x": x, "y": y}, timeout=120)


MODEL_TYPES = {".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".obj": "model/obj"}


@mcp.tool()
async def add_model(path: str, name: str | None = None, props: dict | None = None) -> dict:
    """Add a 3D model from this computer (.glb, .gltf with its data inside it, or .obj; up to 50 MB) as a layer. It
    fills its w × h box without being stretched, and turns and moves like any 3D layer (rotX, rotY, rotation, z),
    lit from lightAngle. Returns the new layer id."""
    p = os.path.abspath(os.path.expanduser(path))
    ext = os.path.splitext(p)[1].lower()
    if ext not in MODEL_TYPES:
        raise RiptideError(f"Not a 3D model I can use: {ext or 'no extension'}. Use one of {', '.join(MODEL_TYPES)}")
    if not os.path.isfile(p):
        raise RiptideError(f"No such file: {p}")
    if os.path.getsize(p) > 50e6:
        raise RiptideError("That file is over 50 MB")
    with open(p, "rb") as f:
        src = f"data:{MODEL_TYPES[ext]};base64," + base64.b64encode(f.read()).decode()
    return await acall("add_model", {"src": src, "file": os.path.basename(p), "name": name, "props": props or {}}, timeout=120)


@mcp.tool()
async def update_audio_clip(clip: str, start: float | None = None, length: float | None = None,
                            source_start: float | None = None, fade_in: float | None = None,
                            fade_out: float | None = None, track: str | None = None) -> dict:
    """Change one audio clip (ids from get_project's audio_tracks): `start` moves it on the timeline, `length` trims its end,
    `source_start` sets where in the file it begins, `fade_in`/`fade_out` are fade lengths in seconds (0 removes a fade),
    `track` moves it to another audio track."""
    return await acall("update_audio_clip", {"clip": clip, "start": start, "length": length, "source_start": source_start,
                                             "fade_in": fade_in, "fade_out": fade_out, "track": track})


@mcp.tool()
async def split_audio(time: float | None = None, clip: str | None = None) -> dict:
    """Split audio at `time` (default: the playhead): just `clip` if given, otherwise every clip under that time.
    The left part keeps the fade-in, the right part the fade-out."""
    return await acall("split_audio", {"time": time, "clip": clip})


@mcp.tool()
async def delete_audio_clip(clip: str) -> dict:
    """Delete one audio clip."""
    return await acall("delete_audio_clip", {"clip": clip})


@mcp.tool()
async def set_audio_track(track: str, name: str | None = None, volume: float | None = None,
                          muted: bool | None = None, delete: bool = False) -> dict:
    """Rename an audio track, set its volume (0-1) or mute it, or delete it with all its clips."""
    return await acall("set_audio_track", {"track": track, "name": name, "volume": volume, "muted": muted, "delete": delete or None})


@mcp.tool()
async def insert_time(at: float, seconds: float) -> dict:
    """Open a gap in the timeline to make room for a new section: every keyframe, layer start/end and marker at or after
    `at` moves `seconds` later, and the duration grows by `seconds`. Layers that span `at` hold their values through the gap."""
    return await acall("insert_time", {"at": at, "seconds": seconds})


@mcp.tool()
async def undo() -> dict:
    """Undo the last change in the editor."""
    return await acall("undo")


@mcp.tool()
async def redo() -> dict:
    """Redo the last undone change."""
    return await acall("redo")


@mcp.tool()
async def get_project_json() -> dict:
    """The full project data (layers, keyframes, markers), without embedded media, for detailed inspection."""
    return await acall("get_project_json")


def http_app():
    """ASGI app for the streamable-HTTP transport; server.py serves it at /mcp."""
    return mcp.streamable_http_app(json_response=True, stateless_http=True)


if __name__ == "__main__":
    mcp.run("stdio")
