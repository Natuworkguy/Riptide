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


def _probe(exe: str) -> dict:
    """What the Python EXE (a path, or "py -3.13") is: its version, the machine it runs as, and which of the
    renderer's modules it has. {} when it does not run."""
    key = exe
    if key in _PROBED:
        return _PROBED[key]
    code = ("import importlib.util as u, json, platform, sys; print(json.dumps({'version': list(sys.version_info[:2]), "
            "'machine': platform.machine().lower(), 'has': [m for m in %r if u.find_spec(m)]}))" % (("bpy",) + NEEDS,))
    try:
        done = subprocess.run(exe.split() + ["-c", code], capture_output=True, text=True, timeout=60, check=False)  # nosec B603
        found = json.loads(done.stdout.strip().splitlines()[-1]) if done.returncode == 0 and done.stdout.strip() else {}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        found = {}
    _PROBED[key] = found
    return found


_PROBED: dict[str, dict] = {}


def _forget(exe: str) -> None:
    _PROBED.pop(exe, None)


def _apple_silicon() -> bool:
    """An Apple Silicon Mac, even when asked from a Python running as Intel under Rosetta."""
    if sys.platform != "darwin":
        return False
    try:
        return subprocess.run(["sysctl", "-n", "hw.optional.arm64"], capture_output=True, text=True,  # nosec B603 B607
                              timeout=10, check=False).stdout.strip() == "1"
    except (OSError, subprocess.SubprocessError):
        return False


def _mac_version() -> tuple[int, ...]:
    import platform

    try:
        return tuple(int(x) for x in platform.mac_ver()[0].split(".")[:2])
    except ValueError:
        return ()


def _wanted_machine() -> str:
    """The machine bpy is built for here: the renderer's Python must run as it ("" for any)."""
    if sys.platform == "darwin":
        return "arm64"
    if sys.platform.startswith("linux"):
        return "x86_64"
    return ""


def _fits(info: dict) -> bool:
    """A Python bpy can be installed into: 3.13, running as the machine bpy is built for."""
    want = _wanted_machine()
    return bool(info) and tuple(info.get("version") or ()) == PY and (not want or info.get("machine") in (want, "aarch64" if want == "arm64" else want))


def _complete_in(info: dict) -> bool:
    return bool(info) and set(("bpy",) + NEEDS) <= set(info.get("has") or ())


def unsupported() -> str:
    """Why this computer cannot run the renderer at all, or ""."""
    if "why" not in _UNSUPPORTED:
        _UNSUPPORTED["why"] = _unsupported()
    return _UNSUPPORTED["why"]


_UNSUPPORTED: dict[str, str] = {}


def _unsupported() -> str:
    if sys.platform == "darwin":
        if not _apple_silicon():
            return "Photoreal needs a Mac with Apple Silicon (M1 or later): Blender's renderer is not built for Intel Macs"
        v = _mac_version()
        if v and v < (13, 0):
            return f"Photoreal needs macOS 13 or newer (this Mac has {'.'.join(map(str, v))})"
    elif sys.platform.startswith("linux"):
        import platform

        if platform.machine().lower() not in ("x86_64", "amd64"):
            return "Photoreal needs a 64-bit Intel or AMD processor on Linux"
    return ""


def python() -> str:
    """The Python the renderer runs in: RIPTIDE_NATIVE_PYTHON, this one when it has bpy, or Riptide's own
    renderer environment once it has everything ("" until then, so a half-made one is never used)."""
    if os.environ.get("RIPTIDE_NATIVE_PYTHON"):
        return os.environ["RIPTIDE_NATIVE_PYTHON"]
    if all(importlib.util.find_spec(m) for m in ("bpy",) + NEEDS):
        return sys.executable
    own = _own_env()
    return str(own) if own.exists() and _complete_in(_probe(str(own))) else ""


def _env_dir() -> Path:
    return Path(os.environ.get("RIPTIDE_HOME") or Path.home() / ".riptide") / "native-env"


def _own_env() -> Path:
    d = _env_dir()
    return d / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _candidates() -> list[str]:
    """Pythons on this computer that might be 3.13, most likely first."""
    found = [sys.executable]
    names = ["python3.13", "python3"] if os.name != "nt" else []
    for n in names:
        exe = shutil.which(n)
        if exe:
            found.append(exe)
    if sys.platform == "darwin":
        found += ["/opt/homebrew/bin/python3.13", "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13",
                  str(Path.home() / ".local/bin/python3.13")]
        found += sorted(str(p) for p in (Path.home() / ".pyenv/versions").glob("3.13*/bin/python3.13"))
    if os.name == "nt" and shutil.which("py"):
        found.append("py -3.13")
    seen, out = set(), []
    for exe in found:
        if exe not in seen and (" " in exe or Path(exe).exists()):
            seen.add(exe)
            out.append(exe)
    return out


def _python_313() -> str:
    """A Python 3.13 that bpy can be installed into: the right version, running natively (an Intel Python on an
    Apple Silicon Mac cannot take bpy)."""
    for exe in _candidates():
        if _fits(_probe(exe)):
            return exe
    return ""


def _uv() -> str:
    """uv, installed for Riptide's use if it is not on this computer: it fetches a Python 3.13 built for this
    machine when there is none."""
    if shutil.which("uv"):
        return shutil.which("uv") or ""
    tools = Path(os.environ.get("RIPTIDE_HOME") or Path.home() / ".riptide") / "tools"
    exe = tools / "bin" / ("uv.exe" if os.name == "nt" else "uv")
    if not exe.exists():
        SETUP["step"] = "Getting a tool to fetch Python 3.13"
        done = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--target", str(tools), "uv"],  # nosec B603
                              capture_output=True, text=True, check=False)
        if done.returncode or not exe.exists():
            return ""
    return str(exe)


def _fetched_python() -> str:
    """A Python 3.13 for this machine, downloaded by uv (for Apple Silicon even when uv runs as Intel)."""
    uv = _uv()
    if not uv:
        return ""
    plat = {"darwin": "macos", "win32": "windows"}.get(sys.platform, "linux")
    arch = "aarch64" if sys.platform == "darwin" else ("x86_64" if plat == "linux" else "")
    libc = "gnu" if plat == "linux" else "none"
    want = f"cpython-3.13-{plat}-{arch}-{libc}" if arch else "3.13"
    SETUP["step"] = "Downloading Python 3.13 for the native renderer (once)"
    done = subprocess.run([uv, "python", "install", want], capture_output=True, text=True, check=False)  # nosec B603
    if done.returncode:
        return ""
    found = subprocess.run([uv, "python", "find", want], capture_output=True, text=True, check=False)  # nosec B603
    exe = found.stdout.strip().splitlines()[-1] if found.returncode == 0 and found.stdout.strip() else ""
    return exe if exe and _fits(_probe(exe)) else ""


def available() -> str:
    """Why native rendering cannot run here, or "" when it can."""
    if python():
        return ""
    if SETUP["state"] == "failed":
        return SETUP["error"]
    return unsupported() or "the native renderer is not installed yet"


def _pip_error(text: str, exe: str) -> str:
    """What went wrong installing, said plainly."""
    tail = (text or "").strip()
    if "No matching distribution" in tail or "from versions: none" in tail:
        info = _probe(exe)
        return (f"Blender's renderer has no build for this Python ({'.'.join(map(str, info.get('version') or [])) or '?'}, "
                f"{info.get('machine') or '?'}): it needs Python 3.13 running as {_wanted_machine() or 'this machine'}")
    if "No space left" in tail:
        return "there is not enough disk space for the native renderer (about 1 GB)"
    return tail[-300:]


def _install(exe: str, missing: list[str]) -> None:
    specs = [BPY if m == "bpy" else m for m in missing]
    if "bpy" in missing:
        SETUP["step"] = "Downloading the native renderer (once, about 250 MB)"
    else:
        SETUP["step"] = f"Installing {', '.join(missing)} for the native renderer (once)"
    done = subprocess.run(exe.split() + ["-m", "pip", "install", "-q", "--disable-pip-version-check", *specs],  # nosec B603
                          capture_output=True, text=True, check=False)
    _forget(exe)
    if done.returncode:
        raise RuntimeError("could not install it: " + _pip_error(done.stderr or done.stdout, exe))


def setup() -> None:
    """Install the renderer, once, in an environment of its own (so Riptide's own Python can be any version). An
    environment left half made (an install cut short, or made from a Python bpy has no build for) is mended, or
    made again."""
    if not _setup_lock.acquire(blocking=False):
        return
    try:
        SETUP.update(state="running", error="")
        if python():
            SETUP.update(state="done", step="")
            return
        why = unsupported()
        if why:
            raise RuntimeError(why)
        env, own = _env_dir(), str(_own_env())
        info = _probe(own) if Path(own).exists() else {}
        if info and not _fits(info):
            SETUP["step"] = "Clearing out a renderer environment made with the wrong Python"
            shutil.rmtree(env, ignore_errors=True)
            _forget(own)
            info = {}
        if not info:
            base = _python_313() or _fetched_python()
            if not base:
                raise RuntimeError("the native renderer needs Python 3.13" + (" for Apple Silicon" if sys.platform == "darwin" else "")
                                   + " (python.org's installer, or brew install python@3.13), and none could be fetched")
            SETUP["step"] = "Making a place for the native renderer"
            shutil.rmtree(env, ignore_errors=True)
            done = subprocess.run(base.split() + ["-m", "venv", str(env)], capture_output=True, text=True, check=False)  # nosec B603
            if done.returncode:
                raise RuntimeError("could not make its environment: " + (done.stderr or done.stdout).strip()[-300:])
            _forget(own)
            info = _probe(own)
        missing = [m for m in ("bpy",) + NEEDS if m not in (info.get("has") or ())]
        if missing:
            _install(own, missing)
        if not _complete_in(_probe(own)):
            raise RuntimeError("the native renderer installed, but Blender's renderer does not load in it")
        SETUP.update(state="done", step="")
    except Exception as error:  # noqa: BLE001 -- told to the editor
        SETUP.update(state="failed", step="", error=str(error))
    finally:
        _setup_lock.release()


def start_setup() -> None:
    if SETUP["state"] in ("idle", "failed", "done") and not python():
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
        self.made: dict[str, dict] = {}     # recent pictures, by what was asked (oldest first)

    def _complete(self, exe: str) -> None:
        """The renderer's Python with all it imports (bpy, numpy, OpenEXR): what is missing installed into it, once."""
        if getattr(self, "_checked", "") == exe:
            return
        info = _probe(exe)
        missing = [m for m in ("bpy",) + NEEDS if m not in (info.get("has") or ())]
        if missing:
            if "bpy" in missing and not _fits(info):
                raise NativeError(f"{exe} cannot run the native renderer: " + _pip_error("No matching distribution", exe))
            SETUP.update(state="running", error="")
            try:
                _install(exe, missing)
            except RuntimeError as error:
                SETUP.update(state="failed", step="", error=str(error))
                raise NativeError(str(error)) from None
            SETUP.update(state="done", step="")
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
        # The renderer's worlds do not change with time by themselves: a frame asked for again (a still camera
        # through an export, scrubbing back) is the same picture, so it is not traced again.
        import hashlib

        same = hashlib.sha1(json.dumps({k: v for k, v in job.items() if k != "t"}, sort_keys=True, default=str).encode()
                            + (glb or b"")).hexdigest()
        if same in self.made:
            self.made[same] = self.made.pop(same)
            return {**self.made[same], "ms": 0, "again": True}
        out = self._frame(job, glb, timeout)
        self.made[same] = out
        while len(self.made) > 24:
            self.made.pop(next(iter(self.made)))
        return out

    def _frame(self, job: dict, glb: bytes | None = None, timeout: float = 1800) -> dict:
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
