#!/usr/bin/env bash
# Riptide installer for Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/Natuworkguy/Riptide/main/install.sh | bash
#   ... | bash -s -- --dev         the dev branch, where changes land before a release
#   ... | bash -s -- --uninstall   take it back out
#
# Installs Riptide into ~/.local/share/riptide with a Python environment of its own, puts a `riptide` command in
# ~/.local/bin, adds Riptide to the applications menu, and registers riptide://open links. Running it again updates.

set -euo pipefail

REPO="Natuworkguy/Riptide"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
HOME_DIR="$DATA/riptide"
APP="$HOME_DIR/app"
VENV="$HOME_DIR/venv"
BIN="$HOME/.local/bin"
LAUNCHER="$BIN/riptide"
DESKTOP="$DATA/applications/riptide.desktop"
BRANCH="main"

say() { printf '%s\n' "$*"; }

uninstall() {
    say "Uninstalling Riptide..."
    if [ -x "$VENV/bin/python" ] && [ -f "$APP/launch.py" ]; then
        "$VENV/bin/python" "$APP/launch.py" --stop >/dev/null 2>&1 || true
    fi
    rm -f "$LAUNCHER" "$DESKTOP"
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
    rm -rf "$HOME_DIR"
    say "Riptide is uninstalled. Your projects (.rip files) are where you saved them, untouched."
}

for arg in "$@"; do
    case "$arg" in
        --dev) BRANCH="dev" ;;
        --uninstall) uninstall; exit 0 ;;
        *) say "Unknown option: $arg (use --dev or --uninstall)"; exit 1 ;;
    esac
done

# ---------- Python ----------
PYTHON=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
        PYTHON="$candidate"; break
    fi
done
if [ -z "$PYTHON" ]; then
    say "Riptide needs Python 3.10 or newer. Install it (for example: sudo apt install python3 python3-venv) and run this again."
    exit 1
fi
if ! "$PYTHON" -c 'import venv, ensurepip' >/dev/null 2>&1; then
    say "Python's venv module is missing. Install it (for example: sudo apt install python3-venv) and run this again."
    exit 1
fi

# ---------- the code ----------
if [ "$BRANCH" = "dev" ]; then say "Installing the dev version of Riptide."; else say "Installing Riptide."; fi
mkdir -p "$HOME_DIR"
if command -v git >/dev/null 2>&1; then
    if [ -d "$APP/.git" ]; then
        git -C "$APP" fetch --depth 1 origin "$BRANCH"
        git -C "$APP" checkout -q -B "$BRANCH" FETCH_HEAD
        git -C "$APP" reset -q --hard FETCH_HEAD
    else
        rm -rf "$APP"
        git clone -q --depth 1 --branch "$BRANCH" "https://github.com/$REPO.git" "$APP"
    fi
elif command -v curl >/dev/null 2>&1; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
    curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar -xz -C "$TMP"
    rm -rf "$APP"; mv "$TMP"/*/ "$APP"
else
    say "Riptide needs git or curl to download. Install one and run this again."
    exit 1
fi

# ---------- its Python environment ----------
say "Setting up Riptide's Python environment..."
[ -x "$VENV/bin/python" ] || "$PYTHON" -m venv "$VENV"
"$VENV/bin/python" -m pip install -q --upgrade pip
"$VENV/bin/python" -m pip install -q -r "$APP/requirements.txt"

# ---------- the riptide command ----------
mkdir -p "$BIN"
cat > "$LAUNCHER" <<EOF
#!/bin/sh
# Opens Riptide in the browser, starting its server if it is not running. riptide --stop stops it.
exec "$VENV/bin/python" "$APP/launch.py" "\$@"
EOF
chmod +x "$LAUNCHER"

# ---------- the applications menu and riptide:// links ----------
mkdir -p "$(dirname "$DESKTOP")"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Riptide
Comment=Motion graphics and image editor
Exec=$LAUNCHER %u
Icon=$APP/brand/riptide-icon.svg
Terminal=false
Categories=Graphics;Video;AudioVideo;
MimeType=x-scheme-handler/riptide;
StartupNotify=false
EOF
command -v xdg-mime >/dev/null 2>&1 && xdg-mime default riptide.desktop x-scheme-handler/riptide || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$(dirname "$DESKTOP")" >/dev/null 2>&1 || true

# ---------- what is still missing ----------
say ""
say "Riptide is installed ($BRANCH)."
if ! command -v ffmpeg >/dev/null 2>&1; then
    say "ffmpeg is not installed: MP4, WebM and GIF export need it (stills and PNG sequences do not)."
    say "  Install it with your package manager, for example: sudo apt install ffmpeg"
fi
case ":$PATH:" in
    *":$BIN:"*) ;;
    *) say "$BIN is not on your PATH yet: open a new terminal, or add it, to use the riptide command." ;;
esac
say "Open it from your applications menu, with a riptide://open link, or by running: riptide"
