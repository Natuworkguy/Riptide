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
        "canvas, duration and layers (ids, types, timing, which properties are keyframed). Use see_frames to look at "
        "the animation (a contact sheet over time) and see_frame for one moment. Coordinates are canvas pixels with "
        "x,y at the layer's centre; times are seconds. Colours are hex strings. list_capabilities gives every layer "
        "type's properties, the easing names, presets and blend modes. All edits appear live and can be undone."
    ),
)


class RiptideError(ToolError):
    """Shown to the agent verbatim (other exceptions are masked as 'Error executing tool')."""


def call(op: str, args: dict | None = None, timeout: float = 60) -> Any:
    body = json.dumps({"op": op, "args": {k: v for k, v in (args or {}).items() if v is not None}, "timeout": timeout}).encode()
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
async def add_layer(type: Literal["rect", "ellipse", "polygon", "star", "arc", "text", "wave"], name: str | None = None,
              props: dict | None = None, start: float | None = None, end: float | None = None) -> dict:
    """Add a layer on top. `props` are initial values, e.g. {"x": 540, "y": 300, "w": 400, "h": 120, "fill": "#ff5a36", "radius": 20}
    or for text {"text": "Hello", "size": 96, "weight": 800, "fill": "#111111"}. `start`/`end` limit when it is visible (seconds)."""
    return await acall("add_layer", {"type": type, "name": name, "props": props or {}, "in": start, "out": end})


@mcp.tool()
async def update_layer(layer: str, props: dict | None = None, at_time: float | None = None, keyframe: bool = False,
                 ease: str | None = None, name: str | None = None, start: float | None = None, end: float | None = None,
                 hidden: bool | None = None, locked: bool | None = None, blend: str | None = None,
                 lock_position: bool | None = None, lock_width: bool | None = None,
                 lock_height: bool | None = None) -> dict:
    """Change a layer. Properties that already have keyframes get a keyframe at `at_time` (default playhead);
    others change everywhere unless `keyframe` is true. `ease` sets the easing of new keyframes.
    Also renames, retimes (start/end seconds), hides, locks, or sets a blend mode ("normal", "multiply", "screen", ...).
    lock_position, lock_width and lock_height lock or unlock x/y, w and h: while locked, nothing changes them, and
    trying is an error. Respect the user's locks; unlock only when they ask."""
    return await acall("update_layer", {"id": layer, "props": props or {}, "time": at_time, "keyframe": keyframe, "ease": ease,
                                 "name": name, "in": start, "out": end, "hidden": hidden, "locked": locked, "blend": blend,
                                 "lock_position": lock_position, "lock_width": lock_width,
                                 "lock_height": lock_height})


@mcp.tool()
async def set_keyframes(layer: str, prop: str, keys: list[dict], replace: bool = False) -> dict:
    """Animate one property with keyframes, e.g. prop "y", keys [{"t": 0, "v": 600, "ease": "expoOut"}, {"t": 0.8, "v": 400}].
    The ease on a key shapes the motion towards the next key. `replace` clears that property's existing keys first."""
    return await acall("set_keyframes", {"id": layer, "prop": prop, "keys": keys, "replace": replace})


@mcp.tool()
async def delete_keyframes(layer: str, prop: str | None = None, at_time: float | None = None) -> dict:
    """Delete keyframes: one property or all of them, at one time or every time. The value left behind is the one at that moment."""
    return await acall("delete_keyframes", {"id": layer, "prop": prop, "time": at_time})


@mcp.tool()
async def apply_preset(layer: str, preset: str, at_time: float | None = None) -> dict:
    """Apply a ready-made animation (e.g. "Pop in", "Rise", "Blur in", "Typewriter", "Float", "Fade out") starting at `at_time`."""
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
