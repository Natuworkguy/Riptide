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
import sys
import threading
import time

READY_SECONDS = 60
FRAME_SECONDS = 600


class RenderError(Exception):
    pass


def available() -> str:
    """'' when the server can draw, else why not."""

    try:
        import playwright.sync_api  # noqa: F401
    except ImportError:
        return "Playwright is not installed: run  python -m pip install playwright  in Riptide's environment"
    return ""


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
    def _launch(self, pw):
        args = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-zero-copy", "--disable-dev-shm-usage",
                "--autoplay-policy=no-user-gesture-required",
                "--enable-unsafe-swiftshader"]  # a computer with no graphics card still draws, slowly
        if sys.platform == "darwin":
            args.append("--use-angle=metal")
        tried = []
        # RIPTIDE_BROWSER names a Chrome or Chromium to use instead
        for channel in (("path",) if os.environ.get("RIPTIDE_BROWSER") else ()) + ("chrome", "msedge", None):
            try:
                kw = {"headless": True, "args": args}
                if channel == "path":
                    kw["executable_path"] = os.environ["RIPTIDE_BROWSER"]
                elif channel:
                    kw["channel"] = channel
                return pw.chromium.launch(**kw)
            except Exception as error:  # noqa: BLE001 -- try the next browser
                tried.append(f"{channel or 'chromium'}: {str(error).splitlines()[0][:160]}")
        raise RenderError("No browser to draw with. Install Chrome, or run  python -m playwright install chromium. "
                          + " | ".join(tried))

    def _open(self, pw):
        browser = self._launch(pw)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("crash", lambda *_: setattr(self, "ready", False))
        page.goto(self.url + "/?renderhost=1", wait_until="load")
        page.wait_for_function("window.RenderHostReady === true", timeout=READY_SECONDS * 1000)
        self.project_rev = None
        self.sent_assets = set()
        self.ready = True
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
        why = available()
        return {"available": not why, "why": why, "running": bool(self.thread and self.thread.is_alive() and self.ready),
                "error": self.error}


def image_bytes(data_url: str) -> tuple[bytes, str]:
    head, _, body = data_url.partition(",")
    return base64.b64decode(body), head[5:].split(";")[0] or "image/jpeg"
