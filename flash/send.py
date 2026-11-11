"""Send a picture or a 3D model from Flash to Riptide, as a layer in the project open there.

Flash runs this three ways (see flash-extension.json at the top of this repository):

- the send_to_riptide tool, with {"path", "name", "x", "y"} as JSON on stdin;
- /riptide [path], with what follows the command as arguments: a file, or nothing for the newest picture or model
  shown in the open chat;
- the Send to Riptide button in the bar of a 3D model Flash shows, with {"button", "text", "chat", "file"} as JSON on
  stdin: that model (or, from a Flash too old to say which, the newest picture or model in that chat).

Riptide must be running with its editor open in a browser: the layer is added there, live, and can be undone. When it
is not, this starts it (the installed riptide command, or the address in a browser) and waits for the editor.
Standard library only, since it runs on Flash's own Python.
"""

import base64
import json
import math
import os
import re
import shutil
import subprocess  # nosec B404 -- the riptide launcher, with arguments
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import xml.etree.ElementTree as ET  # nosec B405 -- an SVG Flash made, parsed without fetching anything
from pathlib import Path

IMAGES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
          ".gif": "image/gif", ".svg": "image/svg+xml"}
MODELS = {".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".obj": "model/obj"}
MOST_BYTES = {"image": 15_000_000, "model": 50_000_000}
WAIT_SECONDS = 25

DEFAULTS = {"url": "http://127.0.0.1:5173", "open": True, "svg_layers": True}


class SendError(Exception):
    """Why it could not be sent, said to the user as it is."""


def setting(name):
    try:
        given = json.loads(os.environ.get("FLASH_SETTINGS") or "{}")
    except ValueError:
        given = {}
    return (given if isinstance(given, dict) else {}).get(name, DEFAULTS[name])


def riptide_url() -> str:
    return str(setting("url") or DEFAULTS["url"]).rstrip("/")


def flash_home() -> Path:
    return Path(os.environ.get("FLASH_HOME") or Path.home() / ".flash")


def newest_in_chat(chat_id: str) -> Path:
    """The newest picture or 3D model shown in Flash chat CHAT_ID: Flash keeps a copy of each in its store."""

    web = flash_home() / "web"
    try:
        chat = json.loads((web / "chats" / f"{chat_id}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise SendError("Could not read that chat. Send a file with /riptide <path> instead.") from None
    for event in reversed(chat.get("log") or []):
        if event.get("type") != "file" or event.get("kind") not in ("image", "model"):
            continue
        suffix = Path(str(event.get("name") or "")).suffix.lower()
        kept = web / "files" / f"{event.get('id')}{suffix}"
        if kept.is_file():
            return kept
    raise SendError("There is no picture or 3D model in this chat yet to send.")


def newest_anywhere() -> Path:
    """The newest picture or 3D model Flash has shown in any chat."""

    found = [f for f in (flash_home() / "web" / "files").glob("*")
             if f.suffix.lower() in IMAGES or f.suffix.lower() in MODELS]
    if not found:
        raise SendError("Say which file: /riptide <path to a picture or a .glb model>.")
    return max(found, key=lambda f: f.stat().st_mtime)


def name_in_chat(chat_id: str, path: Path) -> str:
    """The name the file had when Flash showed it, rather than the id its copy is kept under."""

    try:
        chat = json.loads((flash_home() / "web" / "chats" / f"{chat_id}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return path.name
    for event in chat.get("log") or []:
        if event.get("type") == "file" and path.stem == event.get("id"):
            return str(event.get("name") or path.name)
    return path.name


def ask(path: str, body: dict = None, timeout: float = 10) -> dict:
    url = riptide_url() + path
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as answer:  # nosec B310 -- the user's Riptide
            return json.loads(answer.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            return json.loads(error.read() or b"{}")
        except ValueError:
            return {"ok": False, "error": f"Riptide answered {error.code}"}


def open_window(window: str) -> None:
    """Open the window WINDOW (the server started first if need be) and wait until it is ready."""
    if not setting("open"):
        raise SendError(f"Riptide's window for this chat is not open. Open {window_link(window)}, then send it again.")
    ensure_server()
    webbrowser.open(window_link(window))
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        if any(w.get("id") == window for w in open_windows()):
            time.sleep(0.5)     # the editor's first draw
            return
        time.sleep(0.5)
    raise SendError(f"Riptide did not open in {WAIT_SECONDS} seconds. Open {window_link(window)} and send it again.")


def editor_open() -> bool:
    """Whether Riptide answers, with its editor open in a browser."""

    try:
        return int(ask("/api/live/status", timeout=2).get("tabs") or 0) > 0
    except (urllib.error.URLError, OSError, ValueError):
        return False


def server_up() -> bool:
    try:
        ask("/api/live/status", timeout=2)
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False


def open_riptide() -> None:
    """Start Riptide and its editor: the installed riptide command does both; a running server needs only a tab."""

    if editor_open():
        return
    if not setting("open"):
        raise SendError(f"Riptide is not open. Open {riptide_url()} in a browser, then send it again.")
    launcher = shutil.which("riptide")
    if server_up():
        webbrowser.open(riptide_url() + "/")
    elif launcher:
        subprocess.Popen([launcher, "riptide://open"], stdin=subprocess.DEVNULL,  # nosec B603
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    else:
        raise SendError("Riptide is not running. Install it (see github.com/Natuworkguy/Riptide) or start it with "
                        "python server.py in its folder, then send it again.")
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        if editor_open():
            time.sleep(0.5)     # the editor's first draw
            return
        time.sleep(0.5)
    raise SendError(f"Riptide did not open in {WAIT_SECONDS} seconds. Open {riptide_url()} and send it again.")


def chat_window() -> str:
    """The window of the Flash chat this runs for (Flash says which in FLASH_CHAT): "flash-" and the chat's id."""
    chat = (os.environ.get("FLASH_CHAT") or "")[:8]
    return f"flash-{chat}" if re.fullmatch(r"[0-9a-f]{8}", chat) else ""


def attached(window: str = "") -> str:
    """WINDOW as given; or, with none named, the chat's own window: work asked for in a chat goes to the window its
    link opens (opened here first if it is not open yet)."""
    if (window or "").strip():
        return window
    return chat_window() or window or ""


def empty_window() -> str:
    """A window with nothing in it yet, the chat's own first; "" when none is."""
    found = [w for w in open_windows() if w.get("empty")]
    own = chat_window()
    found.sort(key=lambda w: w.get("id") != own)
    return found[0]["id"] if found else ""


def ensure_server() -> None:
    """Riptide's server running, with no window of its own: the installed riptide command, else this folder's
    launch.py."""
    if server_up():
        return
    launcher = shutil.which("riptide")
    cmd = [launcher, "--serve"] if launcher else [sys.executable, str(Path(__file__).resolve().parent.parent / "launch.py"), "--serve"]
    subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,  # nosec B603
                     start_new_session=True)
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        if server_up():
            return
        time.sleep(0.4)
    raise SendError(f"Riptide's server did not start. Run riptide --serve, or python server.py in its folder.")


def window_link(window: str) -> str:
    """Riptide's address, opening WINDOW."""
    return f"{riptide_url()}/?{urllib.parse.urlencode({'window': window})}"


def session(chat: str = "") -> dict:
    """Flash's Riptide button: the server started, and a link to this chat's own window, where what Flash makes for
    the chat appears."""
    ensure_server()
    chat = (chat or os.environ.get("FLASH_CHAT") or "")[:8]
    if not re.fullmatch(r"[0-9a-f]{8}", chat):
        return {"say": f"Riptide is at [{riptide_url()}]({riptide_url()})."}
    link = window_link(f"flash-{chat}")
    return {"say": f"**Riptide for this chat:** [{link}]({link})\n\nOpen it to watch: what Flash makes in this chat "
                   "goes to that window, and it keeps its project."}


def watch_line() -> str:
    """Where to watch, for a tool's answer in a chat: its window's link."""
    own = chat_window()
    return f" Watch it at {window_link(own)}" if own else ""


def target(window: str = "") -> str:
    """The window to send to: WINDOW as given (an id or a project's name), a new window when it is "new", one with
    nothing in it when it is "empty" (a new one if none is), or "" for the chat's own window when it is open, else
    the one used last. Opens Riptide first."""

    window = attached((window or "").strip())
    if window.lower() in ("empty", "an empty window", "empty window"):
        window = empty_window() or "new"
    own = chat_window()
    if own and window == own and not any(w.get("id") == own for w in open_windows()):
        open_window(own)
        return own
    if window.lower() in ("new", "a new window", "new window"):
        if not server_up():
            open_riptide()
        opened = ask("/api/live/open", {"name": "Untitled"}, timeout=30)
        if opened.get("ok") is False:
            raise SendError(opened.get("error") or "Riptide would not open another window.")
        return opened["window"]["id"]
    open_riptide()
    return window


def where(answer: dict) -> str:
    """Which window it went to, when there is more than one to say it of."""

    shown = answer.get("window") or {}
    try:
        count = int(ask("/api/live/status", timeout=2).get("tabs") or 0)
    except (urllib.error.URLError, OSError, ValueError):
        count = 0
    return f' in the window with "{shown.get("name") or "Untitled"}"' if shown and count > 1 else ", in the project open there"


# ----- an SVG as Riptide's own layers -----
# A picture Flash drew as an SVG is shapes and words: sent as Riptide's own rectangles, ellipses and text, each stays
# editable there (its colour, its words, its place, keyframed like any layer), not one flat picture. An SVG with
# anything Riptide has no layer for (a path, a gradient, an embedded picture, a transform past a move) goes as one
# image layer instead, so nothing in it is lost.

NAMED = {"black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000", "blue": "#0000ff",
         "gray": "#808080", "grey": "#808080", "yellow": "#ffff00", "orange": "#ffa500", "purple": "#800080",
         "pink": "#ffc0cb", "navy": "#000080", "teal": "#008080", "silver": "#c0c0c0", "maroon": "#800000"}


class NotLayers(Exception):
    """This SVG has something Riptide has no layer for."""


def _colour(value, default="#000000"):
    value = (value or "").strip().lower()
    if not value:
        return default
    if value == "none" or value == "transparent":
        return None
    if value in NAMED:
        return NAMED[value]
    if re.fullmatch(r"#[0-9a-f]{3}", value):
        return "#" + "".join(c * 2 for c in value[1:])
    if re.fullmatch(r"#[0-9a-f]{6}", value):
        return value
    found = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)", value)
    if found:
        return "#" + "".join(f"{min(255, int(v)):02x}" for v in found.groups())
    raise NotLayers(f"a colour Riptide cannot take: {value}")


def _num(value, default=0.0) -> float:
    found = re.match(r"^\s*(-?[\d.]+)", str(value or ""))
    return float(found.group(1)) if found else default


def _style(node, inherited: dict) -> dict:
    """The element's painting, its own attributes and style= over what it inherits from its groups."""

    out = dict(inherited)
    for key in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "font-size", "font-family", "font-weight",
                "font-style", "text-anchor"):
        if node.get(key) is not None:
            out[key] = node.get(key)
    for part in (node.get("style") or "").split(";"):
        key, _, value = part.partition(":")
        if key.strip() and value.strip():
            out[key.strip()] = value.strip()
    return out


def _move(node, at: tuple) -> tuple:
    """Where a group's or an element's transform puts its origin: only a move (translate) is taken."""

    transform = (node.get("transform") or "").strip()
    if not transform:
        return at
    found = re.fullmatch(r"translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)", transform)
    if not found:
        raise NotLayers(f"a transform Riptide cannot take as layers: {transform}")
    return at[0] + float(found.group(1)), at[1] + float(found.group(2) or 0)


def svg_layers(text: str, width: float, height: float) -> list:
    """The SVG TEXT as Riptide layers, fitted into a WIDTH by HEIGHT canvas: [{"type", "name", "props"}, ...] in
    drawing order. Raises NotLayers when some of it would be lost."""

    try:
        root = ET.fromstring(text)  # nosec B314 -- no entities are fetched or expanded by ElementTree
    except ET.ParseError as why:
        raise NotLayers(f"not an SVG Riptide could read: {why}") from None
    if not root.tag.endswith("svg"):
        raise NotLayers("not an SVG")
    view = [float(v) for v in re.split(r"[\s,]+", (root.get("viewBox") or "").strip()) if v] or None
    if not view or len(view) != 4:
        view = [0, 0, _num(root.get("width"), width), _num(root.get("height"), height)]
    vx, vy, vw, vh = view
    k = min(width / vw, height / vh) if vw and vh else 1
    ox, oy = (width - vw * k) / 2, (height - vh * k) / 2
    X = lambda x: round((x - vx) * k + ox, 2)
    Y = lambda y: round((y - vy) * k + oy, 2)
    layers = []

    def paint(style: dict, props: dict, stroke_ok=True) -> dict:
        fill = _colour(style.get("fill"), "#000000")
        stroke = _colour(style.get("stroke"), None) if style.get("stroke") else None
        sw = _num(style.get("stroke-width"), 1) * k if stroke else 0
        if fill is None and not stroke:
            return {}
        if fill is None:
            raise NotLayers("an outline with no fill")
        props["fill"] = fill
        if stroke and stroke_ok and sw > 0:
            props.update(stroke=stroke, strokeWidth=round(sw, 2))
        opacity = _num(style.get("opacity"), 1) * _num(style.get("fill-opacity"), 1)
        if opacity < 1:
            props["opacity"] = round(opacity, 3)
        return props

    def walk(node, at, inherited):
        tag = node.tag.rsplit("}", 1)[-1]
        if tag in ("title", "desc", "metadata", "style"):
            return
        if tag in ("defs", "linearGradient", "radialGradient", "pattern", "clipPath", "mask", "filter", "image",
                   "use", "path", "polyline", "foreignObject", "symbol"):
            raise NotLayers(f"a <{tag}>, which Riptide has no layer for")
        style = _style(node, inherited)
        if "url(" in (style.get("fill") or "") + (style.get("stroke") or ""):
            raise NotLayers("a gradient or pattern fill")
        at = _move(node, at)
        name = node.get("id") or ""
        if tag in ("svg", "g"):
            for child in node:
                walk(child, at, style)
            return
        if tag == "rect":
            x, y = _num(node.get("x")) + at[0], _num(node.get("y")) + at[1]
            w, h = _num(node.get("width")), _num(node.get("height"))
            props = paint(style, {"x": X(x + w / 2), "y": Y(y + h / 2), "w": round(w * k, 2), "h": round(h * k, 2),
                                  "radius": round(_num(node.get("rx") or node.get("ry")) * k, 2)})
            whole = not layers and w >= vw and h >= vh
            if props:
                layers.append({"type": "rect", "name": name or ("Background" if whole else "Rectangle"),
                               "props": props})
        elif tag in ("circle", "ellipse"):
            cx, cy = _num(node.get("cx")) + at[0], _num(node.get("cy")) + at[1]
            rx = _num(node.get("r") if tag == "circle" else node.get("rx"))
            ry = _num(node.get("r") if tag == "circle" else node.get("ry"))
            props = paint(style, {"x": X(cx), "y": Y(cy), "w": round(2 * rx * k, 2), "h": round(2 * ry * k, 2)})
            if props:
                layers.append({"type": "ellipse", "name": name or "Ellipse", "props": props})
        elif tag == "line":
            x1, y1 = _num(node.get("x1")) + at[0], _num(node.get("y1")) + at[1]
            x2, y2 = _num(node.get("x2")) + at[0], _num(node.get("y2")) + at[1]
            stroke = _colour(style.get("stroke"), None)
            if not stroke:
                return
            length = math.hypot(x2 - x1, y2 - y1) * k
            layers.append({"type": "rect", "name": name or "Line", "props": {
                "x": X((x1 + x2) / 2), "y": Y((y1 + y2) / 2), "w": round(length, 2),
                "h": round(max(1, _num(style.get("stroke-width"), 1) * k), 2), "radius": 0, "fill": stroke,
                "rotation": round(math.degrees(math.atan2(y2 - y1, x2 - x1)), 2)}})
        elif tag == "text":
            words = " ".join("".join(node.itertext()).split())
            if not words:
                return
            if any(child.tag.rsplit("}", 1)[-1] == "tspan" and (child.get("x") or child.get("y") or child.get("dy"))
                   for child in node):
                raise NotLayers("text laid out in placed pieces")
            size = _num(style.get("font-size"), 16)
            x, y = _num(node.get("x")) + at[0], _num(node.get("y")) + at[1]
            anchor = style.get("text-anchor") or "start"
            wide = 0.55 * size * len(words)       # about how wide it sets, for where its middle is
            middle = x + {"start": wide / 2, "end": -wide / 2}.get(anchor, 0)
            weight = style.get("font-weight") or "400"
            weight = 700 if weight == "bold" else int(_num(weight, 400))
            family = (style.get("font-family") or "Inter").split(",")[0].strip(" '\"")
            props = paint(style, {"text": words, "x": X(middle), "y": Y(y - size * 0.35), "size": round(size * k, 2),
                                  "weight": weight, "font": family or "Inter",
                                  "italic": (style.get("font-style") or "") == "italic"}, stroke_ok=False)
            if props:
                layers.append({"type": "text", "name": name or words[:24], "props": props})
        else:
            raise NotLayers(f"a <{tag}>, which Riptide has no layer for")

    walk(root, (0.0, 0.0), {})
    if not layers:
        raise NotLayers("nothing in it Riptide draws as a layer")
    return layers


def canvas_size(window: str = "") -> tuple:
    answer = ask("/api/live/op", {"op": "get_project", "args": {}, "timeout": 20, "window": window or None}, timeout=30)
    canvas = (answer.get("result") or answer).get("canvas") or {}
    return float(canvas.get("width") or 1080), float(canvas.get("height") or 1080)


def send_svg_layers(path: Path, shown_as: str, window: str) -> str:
    """PATH, an SVG, as Riptide layers in the project open there: what happened, in a line. Raises NotLayers when it
    has to go as a picture instead."""

    text = path.read_text(encoding="utf-8", errors="replace")
    width, height = canvas_size(window)
    layers = svg_layers(text, width, height)
    for layer in layers:
        answer = ask("/api/live/op", {"op": "add_layer", "args": {"type": layer["type"], "name": layer["name"],
                                                                 "props": layer["props"]},
                                      "timeout": 30, "window": window or None}, timeout=40)
        if answer.get("ok") is False:
            raise SendError(answer.get("error") or "Riptide would not take a layer of it.")
    count = len(layers)
    return (f"Added {shown_as} to Riptide as {count} editable layer{'s' if count != 1 else ''} (shapes and text you "
            f"can change and animate){where(answer)}.")


def send(path: Path, name: str = "", x=None, y=None, shown_as: str = "", window: str = "") -> str:
    """Add PATH to the project open in Riptide. What happened, in a line."""

    path = Path(path).expanduser()
    suffix = path.suffix.lower()
    kind = "image" if suffix in IMAGES else "model" if suffix in MODELS else ""
    if not kind:
        known = ", ".join([*IMAGES, *MODELS])
        if suffix == ".stl":
            raise SendError("Riptide takes .glb, .gltf or .obj models, not .stl. Make it a .glb first.")
        raise SendError(f"Riptide cannot take a {suffix or 'file with no extension'}: use one of {known}.")
    if not path.is_file():
        raise SendError(f"No file at {path}.")
    if path.stat().st_size > MOST_BYTES[kind]:
        raise SendError(f"{path.name} is over {MOST_BYTES[kind] // 1_000_000} MB, more than Riptide takes.")
    shown_as = shown_as or path.name
    mime = (IMAGES if kind == "image" else MODELS)[suffix]
    src = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()
    window = target(window)
    if suffix == ".svg" and x is None and setting("svg_layers"):
        try:
            return send_svg_layers(path, shown_as, window)
        except NotLayers:
            pass        # as one picture, below
    args = {"src": src, "file": shown_as, "name": name or Path(shown_as).stem}
    if kind == "image" and x is not None and y is not None:
        args.update(x=x, y=y)
    answer = ask("/api/live/op", {"op": "add_image" if kind == "image" else "add_model", "args": args,
                                  "timeout": 60, "window": window or None}, timeout=70)
    if answer.get("ok") is False:
        raise SendError(answer.get("error") or "Riptide would not take it.")
    what = "a 3D model layer" if kind == "model" else "an image layer"
    return f"Added {shown_as} to Riptide as {what} (layer {answer.get('id')}){where(answer)}."


SCENES = ("wave", "rig", "studio", "desert", "night", "mountain")


def world(scene: str = "", name: str = "", props=None, window: str = "") -> str:
    """Build a 3D world in the project open in Riptide. What happened, in a line."""

    scene = (scene or "").strip().lower()
    if scene and scene not in SCENES:
        raise SendError(f"No scene called {scene}: there is {', '.join(SCENES)}, or none for an empty world.")
    if props is not None and not isinstance(props, dict):
        raise SendError("props must be an object of the world's settings.")
    window = target(window)
    answer = ask("/api/live/op", {"op": "add_world", "args": {"scene": scene, "name": name or None, "props": props or {}},
                                  "timeout": 60, "window": window or None}, timeout=70)
    if answer.get("ok") is False:
        raise SendError(answer.get("error") or "Riptide would not make it.")
    return (f"Added a 3D world{f' from the {scene} scene' if scene else ''} to Riptide (layer {answer.get('id')}){where(answer)}, "
            "at the bottom: 3D shapes and models above it stand in it.")


def open_windows() -> list:
    """The Riptide windows open now, [] when none are or Riptide is not running."""
    try:
        return ask("/api/live/status", timeout=5).get("windows") or []
    except (urllib.error.URLError, OSError, ValueError):
        return []


def pick_window(windows_open: list) -> dict:
    """Flash's "choose" answer for the Send to Riptide button: which window to send to, the one used last first."""
    ordered = sorted(windows_open, key=lambda w: not w.get("last_used"))
    return {"choose": {
        "title": "Send to Riptide",
        "text": "Riptide has more than one window open. Which project should it go to?",
        "label": "Window",
        "button": "Send",
        "options": [{"value": str(w["id"]), "label": f'{w["name"]}{" (used last)" if w.get("last_used") else ""}'}
                    for w in ordered] + [{"value": "new", "label": "A new window"}],
    }}


def need_window(window: str) -> None:
    """For Flash's tools: with more than one window open, WINDOW must name one, so nothing lands in the wrong project."""
    open_now = [] if (window or "").strip() else open_windows()
    if len(open_now) > 1:
        raise SendError("Riptide has more than one window open: " + ", ".join(
            f'"{w["name"]}" (window {w["id"]})' for w in open_now)
            + ". Ask the user which one they mean if it is unclear, then send again with window set to it.")


def windows() -> str:
    try:
        found = ask("/api/live/status", timeout=5).get("windows") or []
    except (urllib.error.URLError, OSError, ValueError):
        return f"Riptide is not running at {riptide_url()}."
    if not found:
        return "Riptide has no window open."
    return "\n".join(f'"{w["name"]}" (window {w["id"]}){", used last" if w.get("last_used") else ""}' for w in found)


def main(argv: list) -> int:
    if argv[:1] == ["--windows"]:
        print(windows())
        return 0
    if argv[:1] == ["--session"]:
        try:
            asked = json.load(sys.stdin) if not sys.stdin.isatty() else {}
            print(json.dumps(session(str(asked.get("chat") or ""))))
        except (SendError, OSError) as why:
            print(json.dumps({"say": str(why)}))
        return 0
    if argv[:1] == ["--world"]:
        try:
            asked = json.load(sys.stdin) if not sys.stdin.isatty() else {}
            asked["window"] = attached(str(asked.get("window") or ""))
            need_window(str(asked.get("window") or ""))
            print(world(str(asked.get("scene") or ""), str(asked.get("name") or ""), asked.get("props"), str(asked.get("window") or ""))
                  + watch_line())
        except SendError as why:
            print(f"Error: {why}")
        except (urllib.error.URLError, OSError) as why:
            print(f"Error: Could not reach Riptide at {riptide_url()}: {why}")
        return 0
    mode = argv[0] if argv[:1] in (["--command"], ["--button"]) else "--tool"
    try:
        if mode == "--command":
            given = " ".join(argv[1:]).strip()
            if given:
                print(send(Path(given)))
            else:
                # The newest Flash showed: in the chat the command came from, when Flash says which.
                chat = os.environ.get("FLASH_CHAT") or ""
                found = newest_in_chat(chat) if chat else newest_anywhere()
                print(send(found, shown_as=name_in_chat(chat, found) if chat else found.name))
            return 0
        asked = json.load(sys.stdin) if not sys.stdin.isatty() else {}
        if mode == "--button":
            chat = str(asked.get("chat") or "")
            # The model whose bar it was pressed in.
            found = Path(str(asked["file"])) if asked.get("file") else newest_in_chat(chat)
            choice = str(asked.get("choice") or "")
            if not choice:
                open_now = open_windows()
                if len(open_now) > 1:
                    print(json.dumps(pick_window(open_now)))
                    return 0
            print(json.dumps({"say": send(found, shown_as=name_in_chat(chat, found), window=choice)}))
            return 0
        if not asked.get("path"):
            raise SendError("Give the path of a picture or a 3D model.")
        if mode == "--tool":
            asked["window"] = attached(str(asked.get("window") or ""))
            need_window(str(asked.get("window") or ""))
        print(send(Path(str(asked["path"])), str(asked.get("name") or ""), asked.get("x"), asked.get("y"),
                   window=str(asked.get("window") or "")) + (watch_line() if mode == "--tool" else ""))
        return 0
    except SendError as why:
        if mode == "--button":
            print(json.dumps({"say": str(why)}))
            return 0
        print(f"Error: {why}")
        return 0 if mode == "--tool" else 1
    except (urllib.error.URLError, OSError) as why:
        message = f"Could not reach Riptide at {riptide_url()}: {why}"
        print(json.dumps({"say": message}) if mode == "--button" else f"Error: {message}")
        return 0 if mode != "--command" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
