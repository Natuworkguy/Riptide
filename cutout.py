"""Cut out: the person in a picture or a video frame, cut out of their background
with no green screen.

A model made for this (U2-Net, trained on people) marks how sure it is that each
pixel is part of a person, and the editor keeps those pixels. It runs here, on
the server, with onnxruntime. The first time a layer is cut out, the runtime is
installed into ~/.riptide/cutout/lib and the model (about 170 MB) is fetched and
checked against the hash pinned here; from then on it works offline. That set-up
runs in the background: until it is done, a request is answered "not yet" with
the step it is on.
"""
from __future__ import annotations

import hashlib
import io
import os
import subprocess  # nosec B404 -- pip, with fixed arguments
import sys
import threading
import urllib.request
from pathlib import Path

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx"
MODEL_SHA256 = "01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c"
NEEDS = ("onnxruntime", "numpy", "PIL")
PIP = ("onnxruntime", "numpy", "pillow")
SIZE = 320                   # what the model looks at
LONGEST = 1280               # the longest side a mask is sent back at

_lock = threading.Lock()
_session = None
STATE = {"step": "", "error": "", "busy": False}


class CutoutError(Exception):
    pass


def folder() -> Path:
    return Path(os.environ.get("RIPTIDE_HOME") or Path.home() / ".riptide") / "cutout"


def _lib() -> Path:
    return folder() / "lib"


def _importable() -> bool:
    lib = str(_lib())
    if lib not in sys.path and _lib().exists():
        sys.path.insert(0, lib)
    import importlib.util
    return all(importlib.util.find_spec(m) for m in NEEDS)


def _install() -> None:
    STATE["step"] = "Installing the cut-out runtime (once)"
    _lib().mkdir(parents=True, exist_ok=True)
    done = subprocess.run(  # nosec B603
        [sys.executable, "-m", "pip", "install", "-q", "--disable-pip-version-check", "--target", str(_lib()), *PIP],
        capture_output=True, text=True, check=False)
    if done.returncode or not _importable():
        tail = (done.stderr or done.stdout).strip().splitlines()[-1:] or ["pip failed"]
        raise CutoutError("Could not install what cutting out needs: " + tail[0])


def _model() -> Path:
    target = folder() / "u2net_human_seg.onnx"
    if target.exists():
        return target
    STATE["step"] = "Downloading the cut-out model, about 170 MB (once)"
    try:
        with urllib.request.urlopen(MODEL_URL, timeout=600) as r:  # nosec B310 -- the fixed https URL above
            blob = r.read()
    except OSError as exc:
        raise CutoutError(f"Could not download the cut-out model ({exc}). It needs the internet once.") from exc
    if hashlib.sha256(blob).hexdigest() != MODEL_SHA256:
        raise CutoutError("The cut-out model that came down was not the one expected, so it was not used.")
    folder().mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(".part")
    part.write_bytes(blob)
    part.replace(target)
    return target


def _setup() -> None:
    global _session
    try:
        if not _importable():
            _install()
        model = _model()
        STATE["step"] = "Starting the cut-out model"
        import onnxruntime as ort  # pylint: disable=import-outside-toplevel
        _session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
        STATE["step"] = ""
        STATE["error"] = ""
    except Exception as exc:  # noqa: BLE001 -- said to the editor, which shows it
        STATE["error"] = str(exc)
        STATE["step"] = ""
    finally:
        STATE["busy"] = False


def ready() -> bool:
    """Whether cutting out can run now; if not, its set-up is started (once) in the background."""
    if _session is not None:
        return True
    with _lock:
        if _session is None and not STATE["busy"]:
            STATE["busy"] = True
            STATE["error"] = ""
            threading.Thread(target=_setup, daemon=True).start()
    return False


def mask(picture: bytes) -> bytes:
    """A greyscale PNG of PICTURE (a JPEG or PNG): white where a person is, black where there is none, in between
    where the model is unsure, at the picture's size (its longest side at most LONGEST)."""
    if _session is None:
        raise CutoutError("Cutting out is not set up yet.")
    import numpy as np  # pylint: disable=import-outside-toplevel
    from PIL import Image  # pylint: disable=import-outside-toplevel

    try:
        im = Image.open(io.BytesIO(picture)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise CutoutError("That is not a picture.") from exc
    x = np.asarray(im.resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float32) / 255.0
    x = (x - (0.485, 0.456, 0.406)) / (0.229, 0.224, 0.225)
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    with _lock:
        y = _session.run(None, {_session.get_inputs()[0].name: x})[0][0, 0]
    y = (y - y.min()) / max(1e-6, float(y.max() - y.min()))
    w, h = im.size
    k = min(1.0, LONGEST / max(w, h))
    out = Image.fromarray((y * 255).astype(np.uint8)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.BICUBIC)
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return buf.getvalue()


def status() -> dict:
    return {"ready": _session is not None, "step": STATE["step"], "error": STATE["error"]}
