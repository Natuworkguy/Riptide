"""Photoreal 3D, rendered natively: Cycles, Blender's path tracer, run as a Python module beside Riptide's server.

No browser and no WebGL take part. The editor describes each frame (camera, sun, the world's settings, and its
props and 3D layers as a glTF); the server hands it to a renderer process of its own (worker.py), which keeps the
built world between frames, path traces it and answers with a picture. On Apple Silicon it renders on the GPU
with Metal; on other machines with CUDA, OptiX, HIP or oneAPI where there is a card, and otherwise on the
processor. The renderer is the `bpy` package from PyPI (Blender as a module, about 250 MB), installed the first
time it is asked for; it needs the Python version its release is built for (3.13 for bpy 5.3).
"""

from __future__ import annotations

import base64
import importlib.util
import itertools
import json
import os
import shutil
import subprocess  # nosec B404 -- runs the renderer and pip, with fixed arguments
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BPY = "bpy==5.3.0"
# what the renderer imports besides bpy; installed with it, and again into its Python if one is found missing
NEEDS = ("numpy", "OpenEXR")
PY = (3, 13)
SETUP = {"state": "idle", "step": "", "error": ""}
_setup_lock = threading.Lock()


def python() -> str:
    """The Python the renderer runs in: RIPTIDE_NATIVE_PYTHON, this one when it has bpy, or Riptide's own
    renderer environment once set up."""
    if os.environ.get("RIPTIDE_NATIVE_PYTHON"):
        return os.environ["RIPTIDE_NATIVE_PYTHON"]
    if all(importlib.util.find_spec(m) for m in ("bpy", "numpy", "OpenEXR")):
        return sys.executable
    own = _own_env()
    return str(own) if own.exists() else ""


def _env_dir() -> Path:
    return Path(os.environ.get("RIPTIDE_HOME") or Path.home() / ".riptide") / "native-env"


def _own_env() -> Path:
    d = _env_dir()
    return d / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _python_313() -> str:
    if sys.version_info[:2] == PY:
        return sys.executable
    names = ["python3.13", "python3"] if os.name != "nt" else ["py"]
    for n in names:
        exe = shutil.which(n)
        if not exe:
            continue
        args = [exe, "-3.13"] if n == "py" else [exe]
        try:
            v = subprocess.run(args + ["-c", "import sys; print(sys.version_info[:2] == (3, 13))"],  # nosec B603
                               capture_output=True, text=True, timeout=20, check=False).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            continue
        if v == "True":
            return " ".join(args)
    return ""


def available() -> str:
    """Why native rendering cannot run here, or "" when it can."""
    if python():
        return ""
    if SETUP["state"] == "failed":
        return SETUP["error"]
    return "the native renderer is not installed yet"


def setup() -> None:
    """Install the renderer, once, in an environment of its own (so Riptide's own Python can be any version)."""
    if not _setup_lock.acquire(blocking=False):
        return
    try:
        SETUP.update(state="running", error="")
        if python():
            SETUP.update(state="done", step="")
            return
        base = _python_313()
        if not base:
            raise RuntimeError("the native renderer needs Python 3.13 (python.org or your package manager); "
                               "install it and try again")
        env = _env_dir()
        SETUP["step"] = "Making a place for the native renderer"
        done = subprocess.run(base.split() + ["-m", "venv", str(env)], capture_output=True, text=True, check=False)  # nosec B603
        if done.returncode:
            raise RuntimeError("could not make its environment: " + (done.stderr or done.stdout).strip()[-300:])
        SETUP["step"] = "Downloading the native renderer (once, about 250 MB)"
        done = subprocess.run([str(_own_env()), "-m", "pip", "install", "-q", BPY, *NEEDS],  # nosec B603
                              capture_output=True, text=True, check=False)
        if done.returncode:
            raise RuntimeError("could not install it: " + (done.stderr or done.stdout).strip()[-300:])
        SETUP.update(state="done", step="")
    except Exception as error:  # noqa: BLE001 -- told to the editor
        SETUP.update(state="failed", step="", error=str(error))
    finally:
        _setup_lock.release()


def start_setup() -> None:
    if SETUP["state"] in ("idle", "failed") and not python():
        threading.Thread(target=setup, name="riptide-native-setup", daemon=True).start()


class NativeError(RuntimeError):
    pass


class Renderer:
    """The renderer process, started when first needed and kept, so the world it has built is ready for the next
    frame. One frame at a time; a new one waits for the last."""

    MARK = "@@riptide-native "

    def __init__(self):
        self.proc: subprocess.Popen | None = None
        self.lock = threading.Lock()
        self.ids = itertools.count(1)
        self.device = ""
        self.dir = Path(tempfile.mkdtemp(prefix="riptide-native-"))
        self.log: list[str] = []

    def _complete(self, exe: str) -> None:
        """The renderer's Python with all it imports: what is missing (numpy, OpenEXR) installed into it, once."""
        if getattr(self, "_checked", "") == exe:
            return
        probe = "import importlib.util as u; print(' '.join(m for m in %r if not u.find_spec(m)))" % (NEEDS,)
        try:
            missing = subprocess.run([exe, "-c", probe], capture_output=True, text=True, timeout=60,  # nosec B603
                                     check=False).stdout.split()
        except (OSError, subprocess.SubprocessError):
            missing = []
        if missing:
            SETUP.update(state="running", step=f"Installing {', '.join(missing)} for the native renderer (once)")
            done = subprocess.run([exe, "-m", "pip", "install", "-q", *missing],  # nosec B603
                                  capture_output=True, text=True, check=False)
            SETUP.update(state="idle", step="")
            if done.returncode:
                raise NativeError(f"the native renderer needs {', '.join(missing)}, and installing it failed: "
                                  + (done.stderr or done.stdout).strip()[-300:])
        self._checked = exe

    def _start(self):
        exe = python()
        if not exe:
            raise NativeError(available())
        self._complete(exe)
        env = {**os.environ, "PYTHONPATH": str(ROOT) + os.pathsep + os.environ.get("PYTHONPATH", "")}
        self.proc = subprocess.Popen([exe, "-u", "-m", "native.worker"], cwd=str(ROOT), env=env,  # nosec B603
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                     text=True, bufsize=1)
        self._answer(timeout=120)

    def _answer(self, timeout: float):
        end = time.time() + timeout
        assert self.proc and self.proc.stdout
        while time.time() < end:
            line = self.proc.stdout.readline()
            if not line:
                tail = "\n".join(self.log[-6:])
                self.proc = None
                raise NativeError("the native renderer stopped" + (f": {tail}" if tail else ""))
            if line.startswith(self.MARK):
                return json.loads(line[len(self.MARK):])
            line = line.rstrip()
            if (line.startswith("[native]") or "rror" in line) and line not in self.log[-6:]:
                self.log = (self.log + [line])[-40:]
        raise NativeError("the native renderer took too long")

    def frame(self, job: dict, glb: bytes | None = None, timeout: float = 1800) -> dict:
        with self.lock:
            if not self.proc or self.proc.poll() is not None:
                self._start()
            n = next(self.ids)
            out = self.dir / f"frame-{n}.png"
            job = dict(job)
            if glb:
                path = self.dir / f"props-{n}.glb"
                path.write_bytes(glb)
                job["glb"] = str(path)
            assert self.proc and self.proc.stdin
            self.proc.stdin.write(json.dumps({"id": n, "job": job, "out": str(out)}) + "\n")
            self.proc.stdin.flush()
            ans = self._answer(timeout)
            if job.get("glb"):
                Path(job["glb"]).unlink(missing_ok=True)
            if not ans.get("ok"):
                raise NativeError(ans.get("error") or "the frame could not be rendered")
            self.device = ans.get("device", "")
            data = out.read_bytes()
            out.unlink(missing_ok=True)
            return {"image": "data:image/png;base64," + base64.b64encode(data).decode(), "ms": ans.get("ms"),
                    "device": self.device}

    def status(self) -> dict:
        why = available()
        return {"available": not why, "why": why, "setting_up": SETUP["state"] == "running", "step": SETUP["step"],
                "device": self.device, "running": bool(self.proc and self.proc.poll() is None)}

    def stop(self):
        if self.proc and self.proc.poll() is None:
            self.proc.kill()
        self.proc = None
