"""Riptide's 3D, drawn on this computer's server instead of in the editor's tab.

3D worlds are heavy: sky, water, shadows, a path tracer. Drawn in the editor's own tab, a big scene can use up what
the browser allows a tab and take the editor down with it. So the server keeps a browser of its own, with no window,
running Riptide's renderer, and the editor sends it the project and asks for pictures: each frame, the scene editor's
view, an export's finished frames. If that browser falls over, the server starts another, and the editor carries on.

It uses Playwright, with the Chrome or Edge already on this computer when there is one, else Playwright's own
Chromium (`python -m playwright install chromium`).
"""

from __future__ import annotations

import base64
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

READY_SECONDS = 60
FRAME_SECONDS = 600


class RenderError(Exception):
    pass


def available() -> str:
    """'' when the server can draw, else why not."""

    if SETUP["state"] == "running":
        return ""
    try:
        import playwright.sync_api  # noqa: F401
    except ImportError:
        return "Playwright is not installed: run  python -m pip install playwright  in Riptide's environment"
    return ""


# ----- getting ready to draw, by itself -----
# An install from before the server drew 3D has no Playwright, and a computer may have no Chrome or Edge for it to
# drive. Rather than leave the editor drawing in a tab that cannot (a browser with WebGL off), the server sets itself
# up on its own, once, in the background: Playwright into its own environment, then a browser: Chrome, Edge, Brave
# or Chromium if one is installed, else Playwright's own Chromium, downloaded.
SETUP = {"state": "idle", "step": "", "error": ""}
_setup_lock = threading.Lock()


def browsers() -> list[str]:
    """Chromium-family browsers on this computer that Playwright can drive by path, Brave among them."""

    found = []
    env = os.environ.get("RIPTIDE_BROWSER")
    if env:
        found.append(env)
    if sys.platform == "darwin":
        for app in ("Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium", "Vivaldi", "Arc"):
            found.append(f"/Applications/{app}.app/Contents/MacOS/{app}")
            found.append(str(Path.home() / f"Applications/{app}.app/Contents/MacOS/{app}"))
    elif os.name == "nt":
        for base in filter(None, (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA"))):
            for rel in (r"Google\Chrome\Application\chrome.exe", r"BraveSoftware\Brave-Browser\Application\brave.exe",
                        r"Microsoft\Edge\Application\msedge.exe", r"Chromium\Application\chrome.exe"):
                found.append(str(Path(base) / rel))
    else:
        for name in ("google-chrome", "google-chrome-stable", "brave-browser", "brave", "microsoft-edge", "chromium", "chromium-browser"):
            where = shutil.which(name)
            if where:
                found.append(where)
    return [p for p in dict.fromkeys(found) if Path(p).exists()]


def _can_launch() -> str:
    """'' when a browser starts headless, else why none did."""

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        try:
            RenderHost._launch(None, pw).close()
            return ""
        except Exception as error:  # noqa: BLE001
            return str(error).splitlines()[0][:300]


def setup() -> None:
    """Make the server able to draw, if it is not: on a thread of its own, once at a time."""

    if not _setup_lock.acquire(blocking=False):
        return
    try:
        SETUP.update(state="running", error="")
        try:
            import playwright.sync_api  # noqa: F401
        except ImportError:
            SETUP["step"] = "Installing Playwright (once, about a minute)"
            done = subprocess.run([sys.executable, "-m", "pip", "install", "-q", "playwright"],  # nosec B603
                                  capture_output=True, text=True, check=False)
            if done.returncode:
                raise RuntimeError("could not install Playwright: " + (done.stderr or done.stdout).strip()[-300:])
            import importlib
            importlib.invalidate_caches()
        SETUP["step"] = "Finding a browser to draw with"
        why = _can_launch()
        if why:
            SETUP["step"] = "Downloading a browser to draw with (once, a few minutes)"
            done = subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"],  # nosec B603
                                  capture_output=True, text=True, check=False)
            why = _can_launch() if done.returncode == 0 else (done.stderr or done.stdout).strip()[-300:]
            if why:
                raise RuntimeError("no browser could start: " + why)
        SETUP.update(state="done", step="")
    except Exception as error:  # noqa: BLE001 -- told to the editor
        SETUP.update(state="failed", step="", error=str(error))
    finally:
        _setup_lock.release()


def start_setup() -> None:
    if SETUP["state"] in ("idle", "failed"):
        threading.Thread(target=setup, name="riptide-render-setup", daemon=True).start()


class RenderHost:
    """A windowless browser running Riptide's renderer, on a thread of its own (Playwright's sync API stays on the
    thread that started it). Jobs are handled one at a time, newest view first."""

    def __init__(self, url: str):
        self.url = url.rstrip("/")
        self.jobs: queue.Queue = queue.Queue()
        self.thread: threading.Thread | None = None
        self.error = ""
        self.ready = False
        self.lock = threading.Lock()
        self.project_rev = None       # the project the browser has
        self.assets: dict[str, dict] = {}     # every asset the editor has sent, by id
        self.sent_assets: set[str] = set()     # those the browser has

    # ----- the browser -----
    def _launch(self, pw, full=False):  # self unused: also called with None, to try a browser
        # FULL: the whole browser in its new headless mode, with the graphics card, rather than Playwright's
        # stripped-down headless shell, which on a Mac draws WebGL in software (many times slower)
        args = (["--headless=new"] if full else []) + ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-zero-copy", "--disable-dev-shm-usage",
                "--autoplay-policy=no-user-gesture-required",
                "--enable-unsafe-swiftshader"]  # a computer with no graphics card still draws, slowly
        if sys.platform == "darwin":
            args.append("--use-angle=metal")
        tried = []
        # RIPTIDE_BROWSER, then Chrome and Edge by channel, then any Chromium-family browser found by path (Brave,
        # Chromium, Vivaldi...), then Playwright's own
        tries = [("path", p) for p in browsers()[:1] if os.environ.get("RIPTIDE_BROWSER")]
        tries += [("channel", "chrome"), ("channel", "msedge")] + [("path", p) for p in browsers()] + [("own", None)]
        for how, what in tries:
            channel = what or "chromium"
            try:
                kw = {"headless": not full, "args": args}
                if how == "path":
                    kw["executable_path"] = what
                elif how == "channel":
                    kw["channel"] = what
                return pw.chromium.launch(**kw)
            except Exception as error:  # noqa: BLE001 -- try the next browser
                tried.append(f"{channel or 'chromium'}: {str(error).splitlines()[0][:160]}")
        raise RenderError("No browser to draw with. Install Chrome, or run  python -m playwright install chromium. "
                          + " | ".join(tried))

    def _open(self, pw):
        browser, page = self._start_page(pw, full=getattr(self, "full", False))
        self.gl = gl_name(page)
        # drawing in software where there is a graphics card to use: start again, as the full browser
        if software(self.gl) and sys.platform in ("darwin", "win32") and not getattr(self, "full", False):
            try:
                browser2, page2 = self._start_page(pw, full=True)
                gl2 = gl_name(page2)
                if not software(gl2):
                    browser.close()
                    browser, page, self.gl, self.full = browser2, page2, gl2, True
                else:
                    browser2.close()
            except Exception:  # noqa: BLE001 -- keep the one that works
                pass
        self.project_rev = None
        self.sent_assets = set()
        self.ready = True
        return browser, page

    def _start_page(self, pw, full=False):
        browser = self._launch(pw, full)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("crash", lambda *_: setattr(self, "ready", False))
        page.goto(self.url + "/?renderhost=1", wait_until="load")
        page.wait_for_function("window.RenderHostReady === true", timeout=READY_SECONDS * 1000)
        return browser, page

    def _run(self):
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = page = None
            while True:
                job = self.jobs.get()
                if job is None:
                    break
                kind, args, answer = job
                try:
                    if page is None or not self.ready or page.is_closed():
                        if browser:
                            try:
                                browser.close()
                            except Exception:  # noqa: BLE001
                                pass
                        browser, page = self._open(pw)
                        self.error = ""
                    answer.put(("ok", self._do(page, kind, args)))
                except Exception as error:  # noqa: BLE001 -- told to the editor, and the browser is started again
                    self.error = str(error).splitlines()[0][:300]
                    self.ready = False
                    answer.put(("error", self.error))

    def _do(self, page, kind, args):
        if kind != "frame":
            raise RenderError(f"unknown job {kind}")
        project, rev = args.get("project"), args.get("rev")
        if project is not None and rev != self.project_rev:
            missing = [i for i in (project.get("assets") or {}) if i not in self.sent_assets and i in self.assets]
            for i in missing:
                page.evaluate("([id, a]) => window.RenderHost.asset(id, a)", [i, self.assets[i]])
                self.sent_assets.add(i)
            page.evaluate("p => window.RenderHost.project(p)", project)
            self.project_rev = rev
        out = page.evaluate("o => window.RenderHost.frame(o)", args.get("frame") or {})
        if not isinstance(out, dict) or not out.get("image"):
            raise RenderError((out or {}).get("error") or "the renderer drew nothing")
        return out

    # ----- for the server's routes -----
    def start(self):
        with self.lock:
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._run, name="riptide-render", daemon=True)
                self.thread.start()

    def frame(self, args: dict, timeout: float = FRAME_SECONDS) -> dict:
        # still setting up: wait for it, so the editor shows a picture once it is ready rather than none
        waited = time.monotonic()
        while SETUP["state"] == "running" and time.monotonic() - waited < timeout:
            time.sleep(0.5)
        if SETUP["state"] == "failed":
            raise RenderError(f"the server could not set up drawing: {SETUP['error']}")
        why = available()
        if why:
            raise RenderError(why)
        self.start()
        # only the newest request for the same view waits in line: older ones are answered as skipped
        view = (args.get("frame") or {}).get("view_id")
        if view:
            kept = []
            while True:
                try:
                    job = self.jobs.get_nowait()
                except queue.Empty:
                    break
                if job and (job[1].get("frame") or {}).get("view_id") == view:
                    job[2].put(("skipped", None))
                    # its project still matters
                    if job[1].get("project") is not None and args.get("project") is None:
                        args["project"], args["rev"] = job[1]["project"], job[1]["rev"]
                else:
                    kept.append(job)
            for job in kept:
                self.jobs.put(job)
        answer: queue.Queue = queue.Queue()
        self.jobs.put(("frame", args, answer))
        started = time.monotonic()
        while True:
            try:
                status, value = answer.get(timeout=1)
                break
            except queue.Empty:
                if time.monotonic() - started > timeout:
                    raise RenderError("the server's renderer took too long") from None
        if status == "error":
            raise RenderError(value)
        if status == "skipped":
            return {"skipped": True}
        return value

    def add_asset(self, asset_id: str, asset: dict):
        self.assets[asset_id] = asset
        self.sent_assets.discard(asset_id)

    def status(self) -> dict:
        why = available() if SETUP["state"] != "failed" else f"the server could not set up drawing: {SETUP['error']}"
        return {"available": not why, "why": why, "running": bool(self.thread and self.thread.is_alive() and self.ready),
                "gl": getattr(self, "gl", ""), "software": software(getattr(self, "gl", "")) if getattr(self, "gl", "") else False,
                "error": self.error, "setting_up": SETUP["state"] == "running", "step": SETUP["step"]}


def gl_name(page) -> str:
    """What draws WebGL in the server's browser: the graphics card's name, or a software renderer's."""
    try:
        return page.evaluate("""() => { const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
            if (!g) return 'none'; const d = g.getExtension('WEBGL_debug_renderer_info');
            return String(d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)); }""")
    except Exception:  # noqa: BLE001
        return ""


def software(gl: str) -> bool:
    return any(w in (gl or "").lower() for w in ("swiftshader", "llvmpipe", "softpipe", "software", "none"))


def image_bytes(data_url: str) -> tuple[bytes, str]:
    head, _, body = data_url.partition(",")
    return base64.b64decode(body), head[5:].split(";")[0] or "image/jpeg"
