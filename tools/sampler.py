"""Scores played on real instruments: a piano, string sections, horn, woodwinds, recorded note by note.

Music written as a list of notes (a score) is played here on recordings of real instruments, not synthesized:
the Versilian Community Sample Library (VSCO 2 CE), released into the public domain (CC0), with its upright
piano by Simon Dalzell (Ivy Audio). Only the instruments a score uses are fetched, the first time, into
~/.riptide/samples (a sparse git checkout: 50 to 250 MB an instrument, twice that on disk with
git's copy; needs git and the internet once).

    python sampler.py score.json out.wav
    python sampler.py --instruments              what it can play

A score is JSON:
    {"bpm": 68, "room": 0.35, "notes": [
        {"i": "piano", "t": 0, "n": "C4", "d": 2, "v": 0.6},
        {"i": "strings", "t": 0, "n": ["C3", "G3", "E4"], "d": 8, "v": 0.4}
    ]}
t (start) and d (length) are in beats when bpm is given, else seconds. n is a note name ("F#3", "Bb2") or a
MIDI number, or a list of them (a chord). v is how hard, 0 to 1 (it picks the softer or louder recording, and
the level). Optional per note: "a" attack seconds (a slow swell for strings), "r" release seconds, "pan" -1..1.
"room" (0..1) is how much of a hall it is played in; "gain" in dB for the whole mix.
"""

from __future__ import annotations

import json
import re
import subprocess  # nosec B404 -- git, to fetch the samples
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 44100
REPO = "https://github.com/sgossner/VSCO-2-CE.git"
HOME = Path.home() / ".riptide" / "samples" / "vsco2"

# Each instrument: the folders it is recorded in, how its file names say the note, and how it sounds when let go.
# A section ("strings") is several, each playing the notes in its own range.
INSTRUMENTS = {
    "piano": {"dirs": ["Keys/Upright Piano"], "style": "piano", "release": 0.8},
    "violins": {"dirs": ["Strings/Violin Section/susVib"], "release": 0.6, "range": (55, 103)},
    "violas": {"dirs": ["Strings/Viola Section/susvib"], "release": 0.6, "range": (48, 88)},
    "cellos": {"dirs": ["Strings/Cello Section/susvib"], "release": 0.7, "range": (36, 76)},
    "basses": {"dirs": ["Strings/Solo Contrabass/SusVib"], "release": 0.7, "range": (28, 60)},
    "violin": {"dirs": ["Strings/Solo Violin/Arco Vib"], "release": 0.5, "range": (55, 103)},
    "pizzicato": {"dirs": ["Strings/Violin Section/Pizz", "Strings/Cello Section/pizzT"], "release": 0.3, "short": True},
    "tremolo": {"dirs": ["Strings/Violin Section/Trem", "Strings/Cello Section/trem"], "release": 0.6},
    "horn": {"dirs": ["Brass/F Horn/sus"], "release": 0.6},
    "flute": {"dirs": ["Woodwinds/Flute/susvib"], "release": 0.5},
    "clarinet": {"dirs": ["Woodwinds/Clarinet/susLong"], "release": 0.5},
    "oboe": {"dirs": ["Woodwinds/Oboe/Vib"], "release": 0.5},
    "organ": {"dirs": ["Keys/Organ/Quiet"], "release": 0.4},
    "timpani": {"dirs": ["Percussion/Timpani/Rolls"], "release": 1.5},
}
SECTIONS = {"strings": ["violins", "violas", "cellos", "basses"], "low strings": ["cellos", "basses"],
            "high strings": ["violins", "violas"]}
NOTES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(note) -> int:
    """A note name ("C4", "F#3", "Bb2"; C4 is 60) or a MIDI number, as a MIDI number."""

    if isinstance(note, (int, float)):
        return int(round(note))
    m = re.fullmatch(r"\s*([A-Ga-g])([#b]?)(-?\d)\s*", str(note))
    if not m:
        raise ValueError(f"not a note: {note!r}")
    return 12 * (int(m.group(3)) + 1) + NOTES[m.group(1).upper()] + {"#": 1, "b": -1, "": 0}[m.group(2)]


def fetch(dirs: list[str], home: Path = HOME) -> Path:
    """The library's folders DIRS, here (fetched once, only those folders)."""

    if all((home / d).is_dir() and any((home / d).glob("*.wav")) for d in dirs):
        return home
    home.parent.mkdir(parents=True, exist_ok=True)
    git = ["git", "-C", str(home)]
    if not (home / ".git").is_dir():
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", REPO, str(home)],
                       check=True)  # nosec B603 B607
        subprocess.run([*git, "sparse-checkout", "init", "--no-cone"], check=True)  # nosec B603 B607
    have = subprocess.run([*git, "sparse-checkout", "list"], check=True, capture_output=True,  # nosec B603 B607
                          text=True).stdout.split("\n")
    # in order: the base patterns first ("/*" then "!/*/": the files at the top, no folders), then each folder
    wanted = list(dict.fromkeys([*(h for h in have if h.strip()), *(f"/{d}/" for d in dirs)]))
    subprocess.run([*git, "sparse-checkout", "set", "--no-cone", *wanted], check=True)  # nosec B603 B607
    return home


def read_wav(path: Path) -> np.ndarray:
    """A sample as float stereo at RATE."""

    with wave.open(str(path)) as w:
        n, ch, width, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if width == 2:
        x = np.frombuffer(raw, "<i2").astype(np.float32) / 32768
    elif width == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        x = (np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)).astype(np.float32)
    elif width == 4:
        x = np.frombuffer(raw, "<i4").astype(np.float32) / 2147483648
    else:
        raise ValueError(f"{path.name}: {width * 8}-bit audio")
    x = x.reshape(-1, ch)
    x = np.repeat(x, 2, axis=1) if ch == 1 else x[:, :2]
    if rate != RATE:
        x = resample(x, RATE / rate)
    return x


def resample(x: np.ndarray, factor: float) -> np.ndarray:
    """X stretched to FACTOR times as long (lower in pitch), by linear interpolation."""

    n = max(1, int(len(x) * factor))
    at = np.linspace(0, len(x) - 1, n)
    return np.stack([np.interp(at, np.arange(len(x)), x[:, c]) for c in range(x.shape[1])], axis=1).astype(np.float32)


def samples(name: str, home: Path = HOME) -> list[dict]:
    """Each recording of instrument NAME: its note, its loudness layer (1 softest), its file."""

    spec = INSTRUMENTS[name]
    root = fetch(spec["dirs"], home)
    found = []
    for d in spec["dirs"]:
        for f in sorted((root / d).glob("*.wav")):
            if spec.get("style") == "piano":
                # Player_dyn2_rr1_014.wav: loudness 2, the 14th note of its chart, key 21 + 14 * 2
                m = re.search(r"dyn(\d)_rr\d_(\d+)", f.name)
                if m:
                    found.append({"midi": 21 + 2 * int(m.group(2)), "layer": int(m.group(1)), "file": f})
                continue
            m = re.search(r"(?:^|[_ ])([A-Ga-g][#b]?-?\d)(?:[_ .]|$)", f.stem)
            if not m:
                continue
            layer = re.search(r"_v(\d)", f.stem)
            found.append({"midi": midi(m.group(1)), "layer": int(layer.group(1)) if layer else 1, "file": f})
    if not found:
        raise RuntimeError(f"no recordings of {name} in {root}")
    return found


class Player:
    """Plays notes on the instruments, the recordings each read once."""

    def __init__(self, home: Path = HOME):
        self.home = home
        self.banks: dict[str, list[dict]] = {}
        self.audio: dict[Path, np.ndarray] = {}

    def note(self, name: str, key: int, seconds: float, vel: float, attack: float = 0.0, release=None) -> np.ndarray:
        bank = self.banks.get(name) or self.banks.setdefault(name, samples(name, self.home))
        layers = sorted({s["layer"] for s in bank})
        want = layers[min(len(layers) - 1, int(vel * len(layers)))] if layers else 1
        # the nearest recording, of the wanted loudness if there is one near
        best = min(bank, key=lambda s: (abs(s["midi"] - key) + (0 if s["layer"] == want else 3), s["layer"] != want))
        x = self.audio.get(best["file"])
        if x is None:
            x = self.audio[best["file"]] = read_wav(best["file"])
        shift = key - best["midi"]
        if shift:
            x = resample(x, 2 ** (-shift / 12))
        spec = INSTRUMENTS[name]
        rel = spec["release"] if release is None else release
        # a piano rings on as recorded and is damped when let go; others hold for the note and fade
        keep = len(x) if spec.get("short") else min(len(x), int((seconds + rel) * RATE))
        y = x[:keep].copy()
        hold = int(seconds * RATE)
        env = np.ones(len(y), np.float32)
        if attack > 0:
            a = min(len(y), int(attack * RATE))
            env[:a] = np.linspace(0, 1, a) ** 2
        if hold < len(y) and not spec.get("short"):
            r = len(y) - hold
            env[hold:] *= np.exp(-np.linspace(0, 6, r)).astype(np.float32)
        return y * env[:, None] * (0.25 + 0.75 * vel)


def room(x: np.ndarray, amount: float, seconds: float = 2.6) -> np.ndarray:
    """A hall: a decaying, slightly bright noise tail convolved with the mix, AMOUNT of it mixed in."""

    if amount <= 0:
        return x
    rng = np.random.default_rng(7)
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    tail = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-t * 6.9 / seconds)[:, None]
    tail[: int(0.012 * RATE)] = 0  # the early gap before the walls answer
    # darker as it dies, as a real room is
    spec = np.fft.rfft(tail, axis=0)
    f = np.fft.rfftfreq(n, 1 / RATE)
    spec *= (1 / (1 + (f / 5200) ** 2))[:, None]
    tail = np.fft.irfft(spec, n, axis=0)
    tail /= np.sqrt(np.sum(tail ** 2) / 2) + 1e-9
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(tail, size, axis=0), size, axis=0)[: len(x) + n]
    out = np.zeros_like(wet)
    out[: len(x)] = x
    return (out * (1 - 0.4 * amount) + wet * amount * 0.35).astype(np.float32)


def render(score: dict, home: Path = HOME) -> np.ndarray:
    """The score, played: stereo float at RATE."""

    beat = 60 / float(score["bpm"]) if score.get("bpm") else 1.0
    player = Player(home)
    parts = []
    for item in score.get("notes", []):
        inst = str(item.get("i", "piano")).lower()
        names = SECTIONS.get(inst, [inst])
        for name in names:
            if name not in INSTRUMENTS:
                raise ValueError(f"no instrument called {inst!r}; there are {', '.join([*INSTRUMENTS, *SECTIONS])}")
        keys = item.get("n")
        keys = [midi(k) for k in (keys if isinstance(keys, list) else [keys])]
        t, d = float(item.get("t", 0)) * beat, float(item.get("d", 1)) * beat
        vel = max(0.0, min(1.0, float(item.get("v", 0.6))))
        pan = max(-1.0, min(1.0, float(item.get("pan", 0))))
        for key in keys:
            # a section: each plays only the notes in its range, and a note doubled is no louder for it
            playing = [n for n in names if len(names) == 1 or
                       INSTRUMENTS[n].get("range", (0, 127))[0] <= key <= INSTRUMENTS[n].get("range", (0, 127))[1]]
            for name in playing:
                y = player.note(name, key, d, vel, float(item.get("a", 0.25 if name in SECTIONS["strings"] else 0)),
                                item.get("r")) / np.sqrt(len(playing))
                # a section sits across the stage as an orchestra does: violins left, basses right
                p = pan + {"violins": -0.35, "violas": -0.1, "cellos": 0.2, "basses": 0.35}.get(name, 0)
                y = y * np.array([min(1, 1 - p), min(1, 1 + p)], np.float32)
                parts.append((int(t * RATE), y))
    if not parts:
        return np.zeros((RATE, 2), np.float32)
    end = max(s + len(y) for s, y in parts)
    mix = np.zeros((end, 2), np.float32)
    for s, y in parts:
        mix[s : s + len(y)] += y
    mix = room(mix, float(score.get("room", 0.3)))
    # level: about -16 dB average, peaks kept under -1 dB
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix *= 10 ** ((-16 + float(score.get("gain", 0))) / 20) / rms
    peak = np.max(np.abs(mix))
    if peak > 0.89:
        mix *= 0.89 / peak
    return mix


def write_wav(path: str, x: np.ndarray) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def main(argv: list[str]) -> int:
    if argv[:1] == ["--instruments"]:
        print("Instruments:", ", ".join(INSTRUMENTS))
        print("Sections:", ", ".join(f"{k} ({', '.join(v)})" for k, v in SECTIONS.items()))
        return 0
    if len(argv) != 2:
        print(__doc__)
        return 2
    score = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    mix = render(score)
    write_wav(argv[1], mix)
    print(f"Wrote {argv[1]}: {len(mix) / RATE:.1f} s, played on recorded instruments (VSCO 2 CE, public domain).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
