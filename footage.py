"""Real footage for a film: video clips from Wikimedia Commons and NASA that are free to use in anything, ads
included. Only clips in the public domain, under CC0, or under CC BY (credit the author) are offered: never
share-alike, non-commercial or no-derivatives ones. Each comes with its licence and the credit line to show.
Downloaded clips are kept in ~/.riptide/footage."""

from __future__ import annotations

import hashlib
import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

CACHE = Path.home() / ".riptide" / "footage"
AGENT = "Riptide/1.0 (open source video editor; footage search)"
COMMONS = "https://commons.wikimedia.org/w/api.php"
NASA = "https://images-api.nasa.gov/search"
# where a clip may be downloaded from: the two archives' own file hosts
HOSTS = ("upload.wikimedia.org", "images-assets.nasa.gov")
MAX_BYTES = 400_000_000


def _get(url: str, timeout: float = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # nosec B310 -- fixed https hosts
        return r.read()


def licence_ok(short: str) -> str:
    """The licence, as shown ("Public domain", "CC0", "CC BY 4.0"), when it allows any use with at most a credit;
    "" when it doesn't (share-alike, non-commercial, no derivatives, or unknown)."""

    s = (short or "").strip()
    low = s.lower()
    if not low or any(bad in low for bad in ("-sa", " sa", "by-sa", "nc", "nd", "gfdl", "fair use", "copyright")):
        return ""
    if low.startswith("cc0") or "cc-zero" in low or low == "cc0 1.0":
        return "CC0"
    if low.startswith("public domain") or low.startswith("pd") or low == "pd":
        return "Public domain"
    m = re.fullmatch(r"cc[- ]by[- ]?(\d(?:\.\d)?)?", low)
    if m:
        return f"CC BY {m.group(1)}".strip() if m.group(1) else "CC BY"
    return ""


def _text(value) -> str:
    """Commons metadata is HTML: its words only."""

    return html.unescape(re.sub(r"<[^>]+>", "", str(value or ""))).strip()


def commons(query: str, limit: int = 12) -> list[dict]:
    """Clips on Wikimedia Commons for QUERY that may be used in an ad."""

    params = {
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": "6",
        "gsrsearch": f"{query} filetype:video", "gsrlimit": str(min(50, limit * 3)),
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": "480",
    }
    data = json.loads(_get(COMMONS + "?" + urllib.parse.urlencode(params)))
    found = []
    for page in sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0)):
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        lic = licence_ok(_text((meta.get("LicenseShortName") or {}).get("value")))
        if not lic or not info.get("url"):
            continue
        author = _text((meta.get("Artist") or {}).get("value")) or "Unknown author"
        title = re.sub(r"^File:|\.[a-z0-9]+$", "", page.get("title", ""), flags=re.I)
        found.append({
            "id": "commons:" + page.get("title", ""), "source": "Wikimedia Commons", "title": title,
            "url": info["url"], "thumb": info.get("thumburl", ""), "page": info.get("descriptionurl", ""),
            "width": info.get("width", 0), "height": info.get("height", 0), "seconds": info.get("duration", 0),
            "licence": lic, "credit": f"{title} by {author}, {lic}, via Wikimedia Commons",
        })
        if len(found) >= limit:
            break
    return found


def nasa(query: str, limit: int = 12) -> list[dict]:
    """NASA's video for QUERY: public domain (no endorsement by NASA may be implied)."""

    data = json.loads(_get(NASA + "?" + urllib.parse.urlencode({"q": query, "media_type": "video"})))
    found = []
    for item in (data.get("collection") or {}).get("items", [])[:limit]:
        d = (item.get("data") or [{}])[0]
        thumb = next((l.get("href", "") for l in item.get("links", []) if l.get("render") == "image"), "")
        found.append({
            "id": "nasa:" + d.get("nasa_id", ""), "source": "NASA", "title": d.get("title", ""),
            "url": "", "manifest": item.get("href", ""), "thumb": thumb, "page": "",
            "width": 0, "height": 0, "seconds": 0, "licence": "Public domain",
            "credit": f"{d.get('title', 'Footage')}: NASA",
        })
    return found


def nasa_file(manifest: str) -> str:
    """The best mp4 in a NASA clip's list of files: the original, else the largest other."""

    files = json.loads(_get(manifest))
    mp4 = [u for u in files if isinstance(u, str) and u.lower().endswith(".mp4")]
    for tag in ("~orig.mp4", "~large.mp4", "~medium.mp4", "~mobile.mp4"):
        for u in mp4:
            if u.endswith(tag):
                return u.replace("http://", "https://", 1)
    if mp4:
        return mp4[0].replace("http://", "https://", 1)
    raise ValueError("that NASA clip has no video file")


def search(query: str, source: str = "all", limit: int = 12) -> dict:
    """Clips for QUERY from SOURCE ("commons", "nasa" or "all"), and what went wrong with any source."""

    query = (query or "").strip()[:120]
    if not query:
        raise ValueError("search for what?")
    out, problems = [], []
    for name, fn in (("commons", commons), ("nasa", nasa)):
        if source not in ("all", name):
            continue
        try:
            out += fn(query, limit)
        except (OSError, ValueError) as exc:
            problems.append(f"{name}: {exc}")
    return {"clips": out, "problems": problems}


def fetch(url: str = "", manifest: str = "", cache: Path = CACHE) -> Path:
    """A clip, downloaded once into the cache: from URL, or from a NASA clip's MANIFEST."""

    if manifest:
        if urllib.parse.urlparse(manifest).hostname != "images-assets.nasa.gov":
            raise ValueError("not a NASA clip")
        url = nasa_file(manifest)
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in HOSTS:
        raise ValueError("footage only comes from Wikimedia Commons or NASA")
    ext = (Path(parsed.path).suffix.lower() or ".mp4")[:6]
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / (hashlib.sha256(url.encode()).hexdigest()[:20] + ext)
    if path.exists() and path.stat().st_size:
        return path
    part = path.with_suffix(path.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    got = 0
    with urllib.request.urlopen(req, timeout=60) as r, open(part, "wb") as f:  # nosec B310 -- allowed hosts only
        while chunk := r.read(1 << 20):
            got += len(chunk)
            if got > MAX_BYTES:
                f.close()
                part.unlink(missing_ok=True)
                raise ValueError("that clip is over 400 MB")
            f.write(chunk)
    part.replace(path)
    return path


MIME = {".mp4": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg", ".mov": "video/quicktime"}
