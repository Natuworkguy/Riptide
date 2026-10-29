"""Riptide server: serves the editor and turns rendered frames into video.

Projects are .rip files saved by the browser; the server only handles exports:
MP4 (H.264/AAC), WebM (VP9/Opus) and GIF through ffmpeg, or a zip of PNG frames (no ffmpeg needed).
"""
import json
import queue
import shutil
import subprocess
import tempfile
import threading
import uuid
import zipfile
from io import BytesIO
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_file, send_from_directory

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
EXPORTS = Path(tempfile.gettempdir()) / "riptide-exports"
EXPORTS.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 400 * 1024 * 1024  # an 8K PNG frame can be tens of MB
sessions: dict[str, dict] = {}
# quality -> (x264 crf, x264 preset, vp9 crf); lower crf = better quality, bigger file
QUALITY = {"draft": (28, "veryfast", 42), "standard": (22, "medium", 33), "high": (17, "slow", 26), "max": (12, "slow", 18)}
FORMATS = {
    "mp4": ("video/mp4", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"], ["-c:a", "aac", "-b:a", "192k"]),
    "webm": ("video/webm", ["-c:v", "libvpx-vp9", "-b:v", "0", "-pix_fmt", "yuv420p", "-row-mt", "1"], ["-c:a", "libopus", "-b:a", "160k"]),
    "gif": ("image/gif", [], []),
}


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


# ---------- live bridge: lets the MCP server (mcp_server.py) drive the editor open in a browser ----------
# The newest open tab subscribes to /api/live/events (Server-Sent Events). An agent's request comes in on
# /api/live/op, is pushed to that tab, run against the live project there, and the tab posts the result back.
live_lock = threading.Lock()
live_tabs: list[queue.Queue] = []           # newest last; ops go to the newest tab
live_waiting: dict[str, dict] = {}           # op id -> {"event": Event, "result": ...}


@app.get("/api/live/events")
def live_events():
    q: queue.Queue = queue.Queue()
    with live_lock:
        live_tabs.append(q)

    def stream():
        try:
            yield "retry: 1500\n\n"
            while True:
                try:
                    msg = q.get(timeout=15)
                except queue.Empty:
                    yield ": ping\n\n"           # keeps the connection open and detects closed tabs
                    continue
                yield f"data: {json.dumps(msg)}\n\n"
        finally:
            with live_lock:
                if q in live_tabs:
                    live_tabs.remove(q)

    return Response(stream(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/live/op")
def live_op():
    body = request.get_json(silent=True) or {}
    op, args = body.get("op"), body.get("args") or {}
    if not isinstance(op, str):
        abort(400, "op is required")
    with live_lock:
        tab = live_tabs[-1] if live_tabs else None
    if tab is None:
        return jsonify(ok=False, error="Riptide is not open in a browser. Open http://127.0.0.1:5173 and try again."), 503
    oid = uuid.uuid4().hex
    slot = {"event": threading.Event(), "result": None}
    live_waiting[oid] = slot
    tab.put({"id": oid, "op": op, "args": args})
    try:
        if not slot["event"].wait(timeout=float(body.get("timeout", 60))):
            return jsonify(ok=False, error="The editor did not answer in time (is the tab in the background or busy exporting?)"), 504
        return jsonify(slot["result"])
    finally:
        live_waiting.pop(oid, None)


@app.post("/api/live/result/<oid>")
def live_result(oid):
    slot = live_waiting.get(oid)
    if slot:
        slot["result"] = request.get_json(silent=True)
        slot["event"].set()
    return jsonify(ok=True)


@app.get("/api/live/status")
def live_status():
    with live_lock:
        return jsonify(tabs=len(live_tabs))


# ---------- MCP over HTTP at /mcp ----------
# mcp_server.py's streamable-HTTP app runs on a private port inside this process; /mcp forwards to it, so agents
# connect with the plain URL http://127.0.0.1:5173/mcp. It is stateless with JSON responses, so every call is
# one ordinary POST.
MCP_PORT = 5174
MCP_HEADERS = ("content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id", "authorization")


def start_mcp():
    import uvicorn
    import mcp_server
    config = uvicorn.Config(mcp_server.http_app(), host="127.0.0.1", port=MCP_PORT, log_level="warning", lifespan="on")
    threading.Thread(target=uvicorn.Server(config).run, name="riptide-mcp", daemon=True).start()


@app.route("/mcp", methods=["GET", "POST", "DELETE"])
def mcp_proxy():
    import urllib.error
    import urllib.request
    headers = {k: v for k, v in request.headers.items() if k.lower() in MCP_HEADERS}
    req = urllib.request.Request(f"http://127.0.0.1:{MCP_PORT}/mcp", data=request.get_data() or None,
                                 headers=headers, method=request.method)
    try:
        r = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as e:
        r = e
    except urllib.error.URLError:
        return jsonify(error="The MCP server is not running (did server.py fail to import mcp_server?)"), 503
    keep = {k: v for k, v in r.headers.items() if k.lower() in ("content-type", "mcp-session-id", "mcp-protocol-version", "cache-control")}
    if "text/event-stream" in r.headers.get("content-type", ""):
        return Response(iter(lambda: r.read1(65536) if hasattr(r, "read1") else r.read(65536), b""), status=r.status, headers=keep)
    return Response(r.read(), status=r.status, headers=keep)


@app.get("/<path:p>")
def static_file(p):
    return send_from_directory(STATIC, p)


@app.post("/api/export")
def start_export():
    cfg = request.get_json(silent=True) or {}
    fmt = cfg.get("format", "mp4")
    if fmt not in (*FORMATS, "png"):
        abort(400, f"Unknown format {fmt!r}")
    sid = uuid.uuid4().hex
    folder = EXPORTS / sid
    folder.mkdir()
    quality = cfg.get("quality", "high")
    if quality not in QUALITY:
        abort(400, f"Unknown quality {quality!r}")
    sessions[sid] = {"dir": folder, "fps": max(1, min(int(cfg.get("fps", 30)), 60)), "format": fmt, "quality": quality, "audio": None}
    return jsonify(id=sid)


def session(sid):
    s = sessions.get(sid)
    if not s:
        abort(404, "Unknown export session")
    return s


@app.post("/api/export/<sid>/frame/<int:n>")
def add_frame(sid, n):
    s = session(sid)
    (s["dir"] / f"f{n:05d}.png").write_bytes(request.get_data())
    return jsonify(ok=True)


@app.post("/api/export/<sid>/audio")
def add_audio(sid):
    s = session(sid)
    path = s["dir"] / "audio.bin"
    path.write_bytes(request.get_data())
    s["audio"] = {"path": path, "offset": float(request.args.get("offset", 0)),
                  "volume": max(0.0, min(float(request.args.get("volume", 1)), 4.0)),
                  "fadein": max(0.0, float(request.args.get("fadein", 0))), "fadeout": max(0.0, float(request.args.get("fadeout", 0))),
                  "end": float(request.args.get("end", 0))}
    return jsonify(ok=True)


def fail(s, msg):
    shutil.rmtree(s["dir"], ignore_errors=True)
    abort(500, msg)


@app.post("/api/export/<sid>/finish")
def finish_export(sid):
    s = sessions.pop(sid, None) or abort(404, "Unknown export session")
    folder, fps, fmt = s["dir"], s["fps"], s["format"]
    duration = float(request.args.get("duration", 0))
    frames = sorted(folder.glob("f*.png"))
    if not frames:
        fail(s, "No frames were rendered")

    if fmt == "png":
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
            for i, f in enumerate(frames):
                z.write(f, f"frame_{i:05d}.png")
        shutil.rmtree(folder, ignore_errors=True)
        buf.seek(0)
        return send_file(buf, mimetype="application/zip", download_name="frames.zip")

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        fail(s, "ffmpeg is not installed. Run: brew install ffmpeg (PNG sequence export works without it)")
    mime, vargs, aargs = FORMATS[fmt]
    out = folder / f"out.{fmt}"
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(folder / "f%05d.png")]
    if fmt == "gif":
        cmd += ["-vf", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a", "-loop", "0"]
    else:
        a = s["audio"]
        if a:
            # positive offset delays the audio, negative skips into it
            if a["offset"] >= 0:
                cmd += ["-itsoffset", f"{a['offset']:.3f}", "-i", str(a["path"])]
            else:
                cmd += ["-ss", f"{-a['offset']:.3f}", "-i", str(a["path"])]
            # volume with the fades, evaluated per frame on the output timeline (t = seconds into the exported video):
            # fade in from where the audio starts, fade out into `end` (the audio's end or the export's, whichever is first)
            gain = f"{a['volume']}"
            if a["fadein"] > 0:
                gain += f"*min(1,max(0,(t-({a['offset']:.4f}))/{a['fadein']:.4f}))"
            if a["fadeout"] > 0 and a["end"] > 0:
                gain += f"*min(1,max(0,({a['end']:.4f}-t)/{a['fadeout']:.4f}))"
            cmd += ["-map", "0:v", "-map", "1:a", "-af", f"volume='{gain}':eval=frame,apad"] + aargs
        crf, preset, vp9 = QUALITY[s["quality"]]
        vargs = vargs + (["-crf", str(crf), "-preset", preset] if fmt == "mp4" else ["-crf", str(vp9)])
        cmd += ["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"] + vargs
        if duration > 0:
            cmd += ["-t", f"{duration:.3f}"]
    cmd.append(str(out))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        fail(s, "ffmpeg failed: " + r.stderr[-600:])
    data = out.read_bytes()
    shutil.rmtree(folder, ignore_errors=True)
    return send_file(BytesIO(data), mimetype=mime, download_name=f"riptide.{fmt}")


if __name__ == "__main__":
    start_mcp()
    from version import __version__
    print(f" * Riptide {__version__}")
    print(" * MCP endpoint: http://127.0.0.1:5173/mcp")
    app.run(host="127.0.0.1", port=5173, debug=False, threaded=True)
