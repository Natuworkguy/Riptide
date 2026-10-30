"""Open Riptide in the browser, starting its server first if it is not running.

This is what the installed `riptide` command, the Riptide shortcut and riptide://open links run. The server keeps
running in the background after the window or link that started it is gone; it writes to a log beside the install.

    riptide                  open the editor
    riptide riptide://open   the same, as a link hands it over
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
    webbrowser.open(URL)
    print(f"Riptide is open at {URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
