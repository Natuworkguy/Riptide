"""Flash (.swf) files, played by Ruffle, the free Flash Player emulator (MIT or Apache 2.0, ruffle.rs).

The editor plays a .swf with it and records what it shows (and its sound) into a video layer. Ruffle is about
10 MB to download, so it is not shipped with Riptide: the first time a .swf is opened, its package is fetched from the npm
registry into ~/.riptide/ruffle, checked against the hash pinned here, and unpacked. From then on it works offline.
That set-up runs in the background; until it is done, the status says which step it is on.
"""
from __future__ import annotations

import base64
import hashlib
import io
import os
import tarfile
import threading
import urllib.request
from pathlib import Path

VERSION = "0.7.1"
TARBALL = f"https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-{VERSION}.tgz"
SHA512 = "6ZWxx/cfX3RoNyQ1AVimECSae4gKqMxdPimOD+chiIcOFiJS0ATGKcjkretxNT03lqNUpiSyJjF55AuvvZ+QeA=="
KEEP = (".js", ".wasm")                       # what the editor loads; the rest of the package is left behind

_lock = threading.Lock()
STATE = {"step": "", "error": "", "busy": False}


def folder() -> Path:
    return Path(os.environ.get("RIPTIDE_HOME") or Path.home() / ".riptide") / "ruffle" / VERSION


def installed() -> bool:
    return (folder() / "ruffle.js").exists()


def _setup() -> None:
    try:
        STATE["step"] = "Downloading the Flash player, about 10 MB (once)"
        try:
            with urllib.request.urlopen(TARBALL, timeout=600) as r:  # nosec B310 -- the fixed https URL above
                blob = r.read()
        except OSError as exc:
            raise RuntimeError(f"Could not download the Flash player ({exc}). It needs the internet once.") from exc
        if base64.b64encode(hashlib.sha512(blob).digest()).decode() != SHA512:
            raise RuntimeError("The Flash player that came down was not the one expected, so it was not used.")
        STATE["step"] = "Unpacking the Flash player"
        out = folder()
        part = out.with_name(VERSION + ".part")
        part.mkdir(parents=True, exist_ok=True)
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
            for m in tar.getmembers():
                name = Path(m.name).name
                # only plain files straight inside the package, and only the kinds the editor loads
                if not m.isfile() or Path(m.name).parent.name != "package" or not name.endswith(KEEP) or name.endswith(".map"):
                    continue
                (part / name).write_bytes(tar.extractfile(m).read())
        if out.exists():
            for f in out.iterdir():
                f.unlink()
            out.rmdir()
        part.replace(out)
        STATE["step"] = ""
        STATE["error"] = ""
    except Exception as exc:  # noqa: BLE001 -- said to the editor, which shows it
        STATE["error"] = str(exc)
        STATE["step"] = ""
    finally:
        STATE["busy"] = False


def ready() -> bool:
    """Whether the Flash player is here; if not, fetching it is started (once) in the background."""
    if installed():
        return True
    with _lock:
        if not installed() and not STATE["busy"]:
            STATE["busy"] = True
            STATE["error"] = ""
            threading.Thread(target=_setup, daemon=True).start()
    return False


def status() -> dict:
    return {"ready": installed(), "step": STATE["step"], "error": STATE["error"], "version": VERSION}


def file(name: str) -> Path | None:
    """One of the player's files, by its bare name, or None."""
    if "/" in name or "\\" in name or name.startswith(".") or not name.endswith(KEEP):
        return None
    p = folder() / name
    return p if p.is_file() else None
