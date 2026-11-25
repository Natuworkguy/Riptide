"""Build Riptide's extra photographed people (static/people/rocketbox/*.glb) from more Microsoft Rocketbox avatars (MIT).

    .venv/bin/python tools/make_people_more.py SRC

SRC holds one folder per avatar, laid out the way Sunreach City's `npm run fetch-humans` leaves them:
<Name>/<Name>.fbx with <code>_{body,head}_{color,normal}.jpg and <code>_opacity_color.png beside it (1024 px).
Each is rebuilt exactly as tools/make_people_rocketbox.js rebuilds man.glb and woman.glb (its `convert` runs in
Riptide's page, with its three.js): turned to face +Z in metres, arms let down, the skeleton renamed the Mixamo way.
These folders carry no specular maps, so each part gets an even roughness instead of one read from its specular
map (skin, cloth and hair a soft satin; no extra shine on lips and eyes).

Riptide must be running (python server.py). Avatars already built into man.glb and woman.glb are skipped.
"""

from __future__ import annotations

import base64
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "people" / "rocketbox"
URL = "http://127.0.0.1:5173/"
SKIP = {"Male_Adult_02", "Female_Adult_02"}  # already man.glb and woman.glb

# an even ORM map (occlusion 1, roughness in green, metalness 0), made in the page
ORM = """async () => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d');
  x.fillStyle = 'rgb(255,158,0)'; x.fillRect(0, 0, 8, 8); return c.toDataURL('image/jpeg', .95); }"""


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1]).expanduser()
    convert = (ROOT / "tools" / "make_people_rocketbox.js").read_text()
    convert = convert[convert.index("async function convert"):]
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", lambda m: print("  page:", m.text) if m.type == "error" else None)
        page.goto(URL + "?window=make-people")
        page.wait_for_function("!!(window.RiptideThree && window.RiptideThree.FBXLoader && window.RiptideThree.GLTFExporter)", timeout=30000)
        orm = page.evaluate(ORM)
        blank = page.evaluate("() => { const c = document.createElement('canvas'); c.width = c.height = 8; return c.toDataURL('image/png'); }")
        for d in sorted(x for x in src.iterdir() if x.is_dir() and re.match(r"(Fe)?[Mm]ale_Adult_\d+$", x.name)):
            if d.name in SKIP:
                continue
            fbx = d / f"{d.name}.fbx"
            code = next((f.name.split("_")[0] for f in d.glob("*_body_color.jpg")), None)
            if not fbx.exists() or not code:
                print("skipped", d.name, "(no .fbx or textures)")
                continue
            b64 = lambda f: base64.b64encode(f.read_bytes()).decode()
            tex = {"body_orm.jpg": orm, "head_orm.jpg": orm}
            for k in ["body_color.jpg", "body_normal.jpg", "head_color.jpg", "head_normal.jpg", "opacity_color.png"]:
                f = d / f"{code}_{k}"
                # the hair cards' texture (some avatars have none): the cards are left out of the model anyway
                tex[k] = (f"data:image/{'png' if k.endswith('png') else 'jpeg'};base64," + b64(f)) if f.exists() else blank
            glb = page.evaluate(f"({convert})", {"fbx": b64(fbx), "tex": tex})
            name = d.name.lower().replace("_", "-")
            (OUT / f"{name}.glb").write_bytes(base64.b64decode(glb))
            print("wrote", name, (OUT / f"{name}.glb").stat().st_size // 1024, "KB")
        browser.close()


if __name__ == "__main__":
    main()
