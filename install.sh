#!/usr/bin/env bash
# Riptide installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/Natuworkguy/Riptide/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Natuworkguy/Riptide/dev/install.sh | bash -s -- --dev
#                                  the dev branch, where changes land before a release
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

# While the setup window is open (installer/window), the steps show there and the terminal stays quiet.
QUIET=""
WINDOW=""
say() { [ -n "$QUIET" ] || printf '%s\n' "$*"; }
# A step in the window: its index, then run, ok or warn, and a note.
mark() { [ -z "$WINDOW" ] || window_set "$@"; }

uninstall() {
    say "Uninstalling Riptide..."
    if [ -x "$VENV/bin/python" ] && [ -f "$APP/launch.py" ]; then
        "$VENV/bin/python" "$APP/launch.py" --stop >/dev/null 2>&1 || true
    fi
    rm -f "$LAUNCHER" "$DESKTOP"
    rm -rf "$HOME/Applications/Riptide.app"
    command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
    rm -rf "$HOME_DIR" "${XDG_STATE_HOME:-$HOME/.local/state}/riptide"
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

# ---------- the setup window, from here on ----------
TITLES=("Getting Riptide" "Riptide's Python packages" "A browser for drawing 3D worlds" "The riptide command, links and menu")
[ "$(uname -s)" = "Darwin" ] && TITLES+=("The Riptide app")
if [ -t 1 ] && [ -f "$APP/installer/window/window.sh" ]; then
    # shellcheck source=/dev/null
    . "$APP/installer/window/window.sh"
    if window_open "Riptide" "#6aa8ff" "$PYTHON" "${TITLES[@]}"; then
        window_set 0 ok "$BRANCH"
        printf '%s\n' "Riptide is setting up in its own window. Leave this terminal open until it's done."
        QUIET=1
        trap 'window_fail "Riptide could not finish setting up."' ERR
    fi
fi

# ---------- its Python environment ----------
mark 1 run
say "Setting up Riptide's Python environment..."
[ -x "$VENV/bin/python" ] || "$PYTHON" -m venv "$VENV"
"$VENV/bin/python" -m pip install -q --upgrade pip
"$VENV/bin/python" -m pip install -q -r "$APP/requirements.txt"
mark 1 ok
mark 2 run
BROWSER_NOTE="Chrome or Edge, already here"
# 3D worlds are drawn by the server's own windowless browser: Chrome or Edge when one is here, else Playwright's Chromium
if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "/Applications/Microsoft Edge.app" ] \
  && ! command -v google-chrome >/dev/null 2>&1 && ! command -v google-chrome-stable >/dev/null 2>&1 && ! command -v microsoft-edge >/dev/null 2>&1; then
  say "Fetching a browser for drawing 3D worlds..."
  if "$VENV/bin/python" -m playwright install chromium >/dev/null 2>&1; then
    BROWSER_NOTE="downloaded"
  else
    BROWSER_NOTE=""
    mark 2 warn "Could not fetch it: 3D worlds are drawn in your browser tab instead."
    say "  Could not fetch it: 3D worlds will be drawn in your browser tab instead."
  fi
fi
[ -n "$BROWSER_NOTE" ] && mark 2 ok "$BROWSER_NOTE"
mark 3 run

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
Comment=Video, motion graphics and 3D editor
Exec=$LAUNCHER %u
Icon=$APP/brand/riptide-icon-512.png
Terminal=false
Categories=Graphics;Video;AudioVideo;3DGraphics;
MimeType=x-scheme-handler/riptide;
StartupNotify=false
StartupWMClass=Riptide
EOF
command -v xdg-mime >/dev/null 2>&1 && xdg-mime default riptide.desktop x-scheme-handler/riptide || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$(dirname "$DESKTOP")" >/dev/null 2>&1 || true

mark 3 ok

# ---------- a Mac app: Riptide in Applications, Launchpad and the Dock ----------
# A real app: a native window with Apple's WebKit (macos/Riptide.swift), built here with Xcode's command line tools,
# which starts Riptide's server and stops it on quit. Without the tools, a small launcher instead.
if [ "$(uname -s)" = "Darwin" ]; then
    mark 4 run
    MACAPP="$HOME/Applications/Riptide.app"
    rm -rf "$MACAPP"
    mkdir -p "$MACAPP/Contents/MacOS" "$MACAPP/Contents/Resources"
    NATIVE=""
    if command -v swiftc >/dev/null 2>&1 || xcrun --find swiftc >/dev/null 2>&1; then
        say "Building the Riptide app..."
        if xcrun swiftc -O -target "$(uname -m)-apple-macos12.0" -o "$MACAPP/Contents/MacOS/Riptide" \
            "$APP/macos/Riptide.swift" -framework Cocoa -framework WebKit >/dev/null 2>&1; then
            NATIVE=1
            touch "$MACAPP/Contents/Resources/native"
        else
            say "  Could not build it: Riptide opens in a browser window instead."
            mark 4 warn "Could not build it: Riptide opens in a browser window instead."
        fi
    else
        say "  Xcode's command line tools are not installed (xcode-select --install): Riptide opens in a browser window."
        say "  Install them and run this again for the Riptide app."
        mark 4 warn "Xcode's command line tools are missing (xcode-select --install), so Riptide opens in a browser window."
    fi
    if [ -z "$NATIVE" ]; then
        printf '#!/bin/sh\nexec "%s" "$@"\n' "$LAUNCHER" > "$MACAPP/Contents/MacOS/Riptide"
        chmod +x "$MACAPP/Contents/MacOS/Riptide"
    fi
    BACKGROUND=$([ -n "$NATIVE" ] && echo false || echo true)
    cat > "$MACAPP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Riptide</string>
<key>CFBundleDisplayName</key><string>Riptide</string>
<key>CFBundleIdentifier</key><string>com.natuworkguy.riptide</string>
<key>CFBundleExecutable</key><string>Riptide</string>
<key>CFBundleIconFile</key><string>Riptide</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>LSApplicationCategoryType</key><string>public.app-category.video</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSSupportsAutomaticGraphicsSwitching</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>NSMicrophoneUsageDescription</key><string>Riptide records voiceovers and listens to music for beat edits.</string>
<key>NSCameraUsageDescription</key><string>Riptide can record from your camera into a project.</string>
<key>RiptideLauncher</key><string>$LAUNCHER</string>
<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Riptide link</string><key>CFBundleURLSchemes</key><array><string>riptide</string></array></dict></array>
<key>LSUIElement</key><$BACKGROUND/>
</dict></plist>
PLIST
    # its icon, from the logo, with the tools every Mac has
    if command -v sips >/dev/null 2>&1; then
        sips -s format icns "$APP/brand/riptide-icon-512.png" --out "$MACAPP/Contents/Resources/Riptide.icns" >/dev/null 2>&1 || true
    fi
    # signed for this Mac only (no account needed), so Apple Silicon runs it
    command -v codesign >/dev/null 2>&1 && codesign --force --deep -s - "$MACAPP" >/dev/null 2>&1 || true
    touch "$MACAPP"
    command -v /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister >/dev/null 2>&1 \
        && /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$MACAPP" >/dev/null 2>&1 || true
    [ -n "$NATIVE" ] && mark 4 ok "in Applications, Launchpad and Spotlight"
fi

# ---------- what is still missing ----------
if [ -n "$QUIET" ]; then
    trap - ERR
    if command -v ffmpeg >/dev/null 2>&1; then
        DONE_NOTE="Open it from your apps, or type riptide in a new terminal."
    else
        DONE_NOTE="Install ffmpeg for MP4, WebM and GIF export (stills work without it). Open Riptide from your apps."
    fi
    window_done "$DONE_NOTE" "$LAUNCHER"
    printf '%s\n' "Riptide is installed ($BRANCH). Open it from your apps, or run: riptide"
    exit 0
fi
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
if [ "$(uname -s)" = "Darwin" ] && [ -f "$HOME/Applications/Riptide.app/Contents/Resources/native" ]; then
    say "On this Mac it is an app: Riptide in Applications, Launchpad and Spotlight, no browser needed."
else
    say "It opens in a window of its own (Chrome, Edge, Brave or Chromium in app mode); riptide --tab opens a browser tab."
fi
