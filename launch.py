"""Open Riptide as a desktop app, starting its server first if it is not running.

This is what the installed `riptide` command, the Riptide shortcut and riptide://open links run. The editor opens in
a window of its own, with no address bar or tabs: Chrome, Edge, Brave or Chromium in app mode, with a profile of its
own so it is its own app in the dock or taskbar and remembers its size; else a native window, when pywebview is
installed; else a tab in the browser. Nothing to set up. The server keeps running in the background after the window
is closed, so it opens again at once; it writes to a log beside the install.

    riptide                  open the editor in its own window
    riptide --tab            open it in a browser tab instead (RIPTIDE_OPEN=tab does the same, always)
    riptide --serve          start the server only, opening no window
    riptide riptide://open   the same as riptide, as a link hands it over
    riptide --stop           stop the server started in the background
"""

import os
import signal
import socket
import subprocess  # nosec B404 -- this same Python, running server.py
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

HOST, PORT = "127.0.0.1", 5173
URL = f"http://{HOST}:{PORT}/"
APP = Path(__file__).resolve().parent
WAIT_SECONDS = 30


def state_dir() -> Path:
    """Where the log and the server's process id are kept."""

    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "Riptide"
    else:
        base = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state") / "riptide"
    base.mkdir(parents=True, exist_ok=True)
    return base


def answering() -> str:
    """'riptide' when Riptide answers on its port, 'other' when something else does, '' when nothing does."""

    try:
        with socket.create_connection((HOST, PORT), timeout=0.5):
            pass
    except OSError:
        return ""
    try:
        with urllib.request.urlopen(URL, timeout=2) as r:  # nosec B310 -- a fixed http://127.0.0.1 address
            return "riptide" if b"<title>Riptide" in r.read(4096) else "other"
    except (urllib.error.URLError, OSError):
        return "other"


def start() -> subprocess.Popen:
    """Start server.py on its own, so it outlives whatever started it."""

    log = open(state_dir() / "server.log", "ab")  # noqa: SIM115 -- handed to the server, which keeps it open
    kwargs: dict = {"cwd": APP, "stdout": log, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if os.name == "nt":
        kwargs["creationflags"] = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
                                   | subprocess.CREATE_NO_WINDOW)
    else:
        kwargs["start_new_session"] = True
    proc = subprocess.Popen([sys.executable, str(APP / "server.py")], **kwargs)  # nosec B603
    (state_dir() / "server.pid").write_text(str(proc.pid))
    return proc


def stop() -> int:
    pid_file = state_dir() / "server.pid"
    try:
        pid = int(pid_file.read_text().strip())
    except (OSError, ValueError):
        print("No Riptide server was started in the background.")
        return 1
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        print("The Riptide server had already stopped.")
    else:
        print("Stopped the Riptide server.")
    pid_file.unlink(missing_ok=True)
    return 0


# ----- the window -----
def chromium_family() -> list[str]:
    """Chrome, Edge, Brave and Chromium on this computer, by path, then Playwright's own Chromium if it has one."""

    sys.path.insert(0, str(APP))
    from render_host import browsers  # the same search the server's 3D drawing uses

    found = browsers()
    if not found:
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as pw:
                own = pw.chromium.executable_path
            if own and Path(own).exists():
                found.append(own)
        except Exception:  # noqa: BLE001 -- no Playwright, or no browser for it: a tab instead
            pass
    return found


def mac_app() -> str:
    """The Riptide app on this Mac (built by install.sh with a window of its own), or "" where there is none."""
    app = Path.home() / "Applications" / "Riptide.app"
    return str(app) if sys.platform == "darwin" and (app / "Contents" / "Resources" / "native").exists() else ""


def open_link(url: str) -> None:
    """URL in Riptide: in the Riptide app on a Mac that has it, else in the browser."""
    app = mac_app()
    if app:
        subprocess.Popen(["open", "-a", app, url], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,  # nosec B603 B607
                         stderr=subprocess.DEVNULL)
        return
    webbrowser.open(url)


def app_window(url: str) -> bool:
    """URL in a window of its own. Whether one opened."""

    # the Riptide app, on a Mac that has it: no browser at all
    if mac_app():
        open_link(url)
        return True

    # a Linux with no screen (a server, a container): no window can open
    if sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        return False
    for exe in chromium_family():
        args = [exe, f"--app={url}", f"--user-data-dir={state_dir() / 'window'}", "--window-size=1440,900",
                "--no-first-run", "--no-default-browser-check", "--class=Riptide", "--name=Riptide"]
        kwargs: dict = {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        try:
            subprocess.Popen(args, **kwargs)  # nosec B603 -- a browser found by path, opening Riptide's own address
            return True
        except OSError:
            continue
    # a native window, for a computer with no Chromium-family browser
    try:
        import webview  # type: ignore[import-not-found]
    except ImportError:
        return False
    webview.create_window("Riptide", url, width=1440, height=900)
    webview.start()
    return True


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    if os.name == "nt" and sys.executable.lower().endswith("pythonw.exe"):
        import ctypes  # no console to print to: say it in a box

        ctypes.windll.user32.MessageBoxW(None, message, "Riptide", 0x10)
    return 1


def main(argv: list[str]) -> int:
    args = [a for a in argv if a]
    if args[:1] == ["--stop"]:
        return stop()
    tab = "--tab" in args or os.environ.get("RIPTIDE_OPEN", "").lower() == "tab"
    # the server alone, no window: for an editor shown somewhere else (Flash docks it beside a chat)
    serve_only = "--serve" in args
    args = [a for a in args if a not in ("--tab", "--serve")]
    if args:
        link = args[0].lower().rstrip("/")
        if link.startswith("riptide:"):
            action = link.split(":", 1)[1].lstrip("/")
            if action != "open":
                return fail(f"Riptide does not know the link {args[0]}. Use riptide://open.")
        elif link not in ("open",):
            print(__doc__)
            return 2

    found = answering()
    if found == "other":
        return fail(f"Something else is using port {PORT}, so Riptide cannot start there. Close it and try again.")
    if not found:
        proc = start()
        deadline = time.monotonic() + WAIT_SECONDS
        while answering() != "riptide":
            if proc.poll() is not None:
                return fail(f"Riptide's server stopped as it started. See {state_dir() / 'server.log'}.")
            if time.monotonic() > deadline:
                return fail(f"Riptide's server did not start in {WAIT_SECONDS} seconds. See {state_dir() / 'server.log'}.")
            time.sleep(0.2)
    if serve_only:
        print(f"Riptide is running at {URL}")
        return 0
    if not tab and app_window(URL):
        print(f"Riptide is open in its own window ({URL})")
        return 0
    webbrowser.open(URL)
    print(f"Riptide is open at {URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
