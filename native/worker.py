"""The native renderer's own process: one Blender scene, kept between frames, fed jobs one per line.

Run as `python -m native.worker`. Each line in is JSON: {"id": ..., "job": {...}, "out": "frame.png"}; each answer
is one line out starting with the marker below, as Blender writes its own progress to the same stream.
"""

from __future__ import annotations

import json
import sys
import traceback

MARK = "@@riptide-native "


def main() -> None:
    from .world import World

    world = None
    say = sys.__stdout__
    say.write(MARK + json.dumps({"ready": True}) + "\n")
    say.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            continue
        try:
            if world is None:
                world = World()
            out = world.frame(req["job"], req["out"])
            answer = {"id": req.get("id"), "ok": True, **out}
        except Exception as error:  # noqa: BLE001 -- sent back to say what went wrong
            traceback.print_exc(file=sys.stderr)
            answer = {"id": req.get("id"), "ok": False, "error": f"{type(error).__name__}: {error}"}
        say.write(MARK + json.dumps(answer) + "\n")
        say.flush()


if __name__ == "__main__":
    main()
