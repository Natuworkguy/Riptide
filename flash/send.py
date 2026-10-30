"""Send a picture or a 3D model from Flash to Riptide, as a layer in the project open there.

Flash runs this three ways (see flash-extension.json at the top of this repository):

- the send_to_riptide tool, with {"path", "name", "x", "y"} as JSON on stdin;
- /riptide [path], with what follows the command as arguments: a file, or nothing for the newest picture or model
  shown in the open chat;
- the Send to Riptide button, with {"button", "text", "chat"} as JSON on stdin: the newest picture or model in that
  chat.

Riptide must be running with its editor open in a browser: the layer is added there, live, and can be undone. When it
is not, this starts it (the installed riptide command, or the address in a browser) and waits for the editor.
Standard library only, since it runs on Flash's own Python.
"""

import base64
import json
import os
import shutil
import subprocess  # nosec B404 -- the riptide launcher, with arguments
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

IMAGES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
          ".gif": "image/gif", ".svg": "image/svg+xml"}
MODELS = {".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".obj": "model/obj"}
MOST_BYTES = {"image": 15_000_000, "model": 50_000_000}
WAIT_SECONDS = 25

DEFAULTS = {"url": "http://127.0.0.1:5173", "open": True}


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


def send(path: Path, name: str = "", x=None, y=None, shown_as: str = "") -> str:
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
    open_riptide()
    args = {"src": src, "file": shown_as, "name": name or Path(shown_as).stem}
    if kind == "image" and x is not None and y is not None:
        args.update(x=x, y=y)
    answer = ask("/api/live/op", {"op": "add_image" if kind == "image" else "add_model", "args": args,
                                  "timeout": 60}, timeout=70)
    if answer.get("ok") is False:
        raise SendError(answer.get("error") or "Riptide would not take it.")
    what = "a 3D model layer" if kind == "model" else "an image layer"
    return f"Added {shown_as} to Riptide as {what} (layer {answer.get('id')}), in the project open there."


def main(argv: list) -> int:
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
            found = newest_in_chat(chat)
            print(json.dumps({"say": send(found, shown_as=name_in_chat(chat, found))}))
            return 0
        if not asked.get("path"):
            raise SendError("Give the path of a picture or a 3D model.")
        print(send(Path(str(asked["path"])), str(asked.get("name") or ""), asked.get("x"), asked.get("y")))
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
