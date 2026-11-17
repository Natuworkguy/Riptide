<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/riptide-wordmark-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="brand/riptide-wordmark.svg">
    <img src="brand/riptide-wordmark.svg" alt="Riptide" width="420">
  </picture>
</p>

# Riptide

A browser motion-graphics and image editor with a small Flask backend for video export.

## Video mode
- Layers: rectangle, ellipse, polygon, star, arc, text, image; move, resize, snap to centre, hide/lock, reorder, duplicate, copy/paste
- Groups: select layers and press Cmd+G (or right-click > Group) to group them; move, resize, turn, scale, fade or keyframe the group to do it to all of them; expand/collapse it in the layer list; Shift+Cmd+G ungroups, leaving each layer where it shows. Groups do not nest, and 3D layers do not follow their group yet
- Keyframe any property with 23 easing curves; edit text in place on the canvas
- Fonts: the system's own, a library of 55 web fonts (sans, serif, display, script and monospace, each previewed in itself in the Font menu and fetched only when used), or your own .ttf, .otf, .woff or .woff2 file, saved inside the project. Text also takes italic, alignment (left, centre, right), case (as typed, UPPERCASE, lowercase, Title Case) and leading (line height, keyframeable); exports wait for every font to load
- Timeline: zoom (Ctrl/Cmd + wheel, slider, Fit), expandable per-property keyframe rows, layer in/out trim bars, slide layers in time, split at playhead (Cmd+K), markers (M), snapping to playhead/markers/keys/edits (hold Shift to bypass)
- Blend modes, colour adjustments (brightness, contrast, saturation, hue, grayscale, sepia, invert) and blur/shadow, all keyframeable
- 44 animation presets: click to apply at the playhead or drag onto a layer in the viewer or timeline
- Video clips as layers: import or drop MP4/WebM/MOV, trim with the layer bar, set Source in, animate/adjust/blend like any layer; frame-accurate in exports. A split clip carries on from the frame it was split at
- Clip sound: a video clip keeps its own sound, in the preview and in exports, drawn as a waveform along its bar, with Volume % (keyframe it to ride the level), Mute, and fades in and out. Set an audio track to Duck and it dips under the clips' own sound while it is loud, like someone talking, and comes back up after
- Speed and time: Speed % on any video clip (keyframe it for a smooth ramp, or Ramp up and Ramp down from the right-click Speed menu, with 25% to 400% presets), Reverse to play it backwards, and Hold this frame to freeze the playhead's frame for two seconds and push the rest of the clip later. Sound follows the speed, higher when faster
- Transitions: Crossfade, Dip to black or white, Wipe, Slide, Push, Zoom, Blur, Glitch and Spin, on any layer's way in or out from the right-click menu, with a direction for wipes, slides and pushes. Transition to next clip overlaps a clip with the one after it and blends them. Drag the shaded end of a bar to change how long it takes, or double-click it to remove it
- Masks and green screen: cut any layer to a rectangle, an ellipse or a shape you draw point by point on the canvas, with Feather for a soft edge and Invert to keep the outside; mask position, size and feather can be keyframed. Track matte shows a layer only through the one above it (by its alpha or its brightness, or the inverse), so video can play inside text. Key out turns a green or blue screen clear on any picture or video, with Tolerance, Softness and Spill, and the key colour picked straight off the canvas
- Colour grading: Warmth and Tint, Exposure, levels (in and out black and white, Gamma), curves for RGB and each channel drawn in the panel, a Vignette, and 3D LUTs loaded from .cube files and kept in the project, with LUT mix. An Adjustment layer grades, blurs and masks everything under it at once
- Graph editor (G, or the curve button on the timeline): the selected layer's animated numbers as curves over time. Drag a key to move it in time and value (Shift keeps to one axis), drag its handles to shape the curve into the next key as a custom bezier, and double-click a curve to add a key on it. Pick a property on the left to see its curve alone, with its range
- Import by dropping files anywhere (onto the viewer to place them), pasting with Cmd+V, or dragging an image straight from another web page
- Resizable layers panel: drag its right edge for width and the bar under the layer list for height (double-click to reset)
- Drag with the middle mouse button to drag a copy: a layer on the canvas, a layer's bar in the timeline, or a keyframe. The original stays where it was
- Select several layers: Shift- or ⌘-click on the canvas or in the Layers panel (Shift-click there selects a range), drag a box on empty canvas, or ⌘A. Move, nudge, duplicate or delete them together
- Align and centre: an Align bar in the Design panel (one layer aligns to the canvas, several to each other), Centre on canvas (⌥C), distribute three or more evenly; also in the right-click menu
- Audio tracks: import as many files as you like, each on its own track (clips on different tracks play together). Drag clips in time or onto another track, trim their edges, split at the playhead (⌘K), delete with ⌫, and drag the dots at a clip's top corners to fade it in or out (drag back, or double-click a dot, to remove the fade). Everything is mixed into MP4, WebM and MOV exports
- 3D: turn any layer into a 3D layer (Rotate X and Y, Depth) from its Design panel; add lit 3D shapes (cube, sphere, cylinder, cone, torus, 3D text) with matte, glossy or metal finishes from the cube button in the toolbar; import .glb, .gltf or .obj models by dropping them in; and add a Camera layer to orbit, tilt, dolly, zoom and roll around it all. Right-click a 3D shape or model and choose Export as 3D model to save it as a .glb file (a canvas pixel is a centimetre). Everything animates, and the 3D animation presets (Flip, Swing in, Fly in, Turntable, Orbit around, Push in…) work on any 3D layer or the camera
- 3D worlds: a whole place to film, from the World section of the cube button. A world shows only inside its own box: resize or move it like any layer. A procedural sky with a sun and drifting clouds (golden hour, clear day, dusk, haze, overcast, night or a studio), the ground (an ocean whose breaking wave curls and throws its lip as you key Curl, a wheat field swaying in the wind, desert dunes, a mountain valley with a winding road, pine forest and snowy peaks, or a studio floor), fog and dust in the light, height fog that fills a valley and thins towards the peaks, lit where it faces the sun, and props built from parts (boxes, cylinders, lattice towers and beams, glowing screens) in worn metal, leatherette, brushed aluminium, chrome, coated lens glass and more. The sun casts shadows, and the world is filmed through a lens: focal length, depth of field, bloom, contact shadows, film grain and colour fringing. 3D shapes and models above a world layer stand inside it. Start from a scene (Golden wave, Camera rig in a field, Studio, Desert at dusk, Night sea, Mountain road), each keyed with a slow camera move, or from an empty one; every setting animates
- Scene editor: Edit scene on a world layer opens a workspace with an outliner of its props, a viewport to orbit round them or look through the film camera, move/turn/scale gizmos and an inspector. Its Ghost view (V) flies you through the scene: WASD to move, Q/E down and up, move the mouse to look (the cursor is hidden and held in the middle, so you can turn all the way round; if the browser refuses, drag to look), Shift for speed, scroll to change speed, Esc to leave. Speed lock in the toolbar makes scrolling change the speed in steady, fixed steps, for trackpads and Magic Mice; it is remembered in this browser. It only moves the viewport, never the film camera or the render. The 3D shape and model layers above the world are listed under 3D layers in the outliner, and can be picked and moved there like props (their shape and look stay in their Design panel). With Snap on (the default), whatever you move drops onto the ground or onto the top of what it is over. A wheat field's Sway m/s sets how hard the wheat sways (as in Camera rig in a field), and Loop sway fits it to the video's length so the last frame meets the first. Import your own sky photos (.hdr) to light and back the world, materials made from a scanned surface's images (colour, normal, roughness and ambient occlusion, sorted by their file names) for any prop or the ground, and .glb, .gltf or .obj models as props at their real size, from the Import menu or by dropping them on the viewport. They are kept in the project
- Path tracing: set a world's Render to Path traced and its frames follow light bounce by bounce: light from the sky and from everything lit, soft shadows, real reflections, glass that bends what is behind it, and true depth of field from the lens. Exports (and agents' frames) give each frame all its Samples before keeping it; the scene editor's Path traced view clears up while you watch. The ocean's waves, the breaking wave, wheat and dust are left out of path traced frames (still water stands in for a sea)
- Photoreal, rendered natively: set a world's Render to Photoreal and it is not drawn in the browser at all. Riptide's server path traces it with Cycles, Blender's renderer, run as a Python module (installed the first time, about 250 MB, into `~/.riptide/native-env`; it needs Python 3.13). On a Mac it renders on the Apple Silicon GPU through Metal, on a PC on its graphics card, and otherwise on the processor, and it fits in 16 GB. The editor works out each frame (camera, sun, props and 3D layers, sent as glTF) and shows the pictures that come back: a quick one while you edit, full quality for each exported frame. The mountain road is built natively at full quality: the land worn by water (gullies, ridges, scree fans) and meshed round the camera so every triangle is a few pixels on screen, granite boulders with lichen and moss, spruces made of drawn needle sprays, a meadow at real grass density, asphalt with worn paint, a physical sky with clouds, and air that thickens with distance. The Mountain road scene starts in Photoreal
- Sketch and push/pull: model the way CAD apps on a tablet do. Sketch a Rectangle, Circle or Polygon on the ground or on any face of a prop (snapped to a 5 cm grid, Alt for none, its size shown as you draw), then pull its orange arrow to extrude it into a solid. Pull a sketch into the prop it was drawn on and it cuts a hole or a pocket. Push/pull drags any face of any prop in or out, a box's or a cylinder's included. Revolve turns a sketch round its left edge into a turned part. A sketch stays editable: its width, length, radius, depth and turn are numbers in the inspector until Make editable makes it a mesh.
- Modelling: any prop can be made an editable mesh in the scene editor. Edit mesh (Tab) picks points (1) or faces (3) and moves, turns and scales them with the gizmo; Extrude (E), Inset (I), Bevel (Ctrl B), Loop cut (Ctrl R), Delete (X) and Merge (M) shape it; Subdivide rounds it off (Catmull-Clark), with Smooth shading and Apply subdivision. Join with, Cut with and Keep overlap with combine it with another prop (booleans). Sculpt shapes it with a brush: Draw, Smooth, Grab, Inflate and Flatten, Ctrl for the opposite, [ and ] to size it, Add detail for finer work. Meshes are kept in the project
- Shots: put cameras in a 3D world (+ Add, Camera) and cut between them with Cut to it here, at any moment on the timeline, like an edit; the World inspector lists the cuts. A camera has its own lens, focus (on a prop or at a distance) and depth of field, can look at a prop, and has a Hand-held shake. Key a camera's (or any prop's) place three times or more and it flies a smooth path through the keys; Faces: the way it travels turns it along its path. World speed % slows or speeds everything in the world (key it for speed ramps), Motion blur° gives exported frames a shutter, and Letterbox frames the picture at 2.39, 2 or 1.85 to 1
- Cars: a saloon, a hatchback, an SUV and a taxi (Kind), each with clear-coated paint, deep glass, alloy wheels, head and tail lights that light up and number plates. They are built by tools/make_cars.py from numbers alone, free to use for anything.
- Flash files: Open or import a .swf (or drop one in). Riptide plays it with Ruffle, the free Flash player (fetched once, about 10 MB, the first time), and records it with its sound into a video: opened, it becomes a project the size of its stage; imported, a video layer. A one-frame file (ActionScript or a game) is recorded for 15 seconds, and Stop ends any recording early. Interactive content just plays.
- Shoot through: + Add, Shoot through puts something right in front of the lens, so close it is only colour and light (folds of fabric or plastic, leaves, or a light leak), parting round a clear spot that shows the subject, with glints of light blurred into soft discs. Put it over a photo or video; set what it is, its colours, how much it covers, where the clear spot is, how out of focus, and a slow hand-held drift.
- Block figures: + Add, Block figure: a person made of six boxes on a real skeleton, posed like any rigged model (Sit, Wave, Point and the other presets, any joint by hand, keyed from pose to pose), standing, walking or waving. It wears a skin: a 64 × 64 picture in the usual block-figure skin layout (both layers, so hats and jackets too), imported under Media and picked as its Skin; with none, it paints its own from the colours you give.
- Architecture: + Add, Coffered dome (rows of panels stepped back in rings, built on a real sphere in rough stone, with its own soft light in the shade) and Sunbeam (the sun through one opening: a hard, nearly parallel shaft that throws a crisp disc of light and sharp shadows). Oculus starts from both: looking up into a dome with a disc of sun on it.
- City streets: + Add, Street (tarmac with worn markings and drains, kerbs, pavements of real slabs with grime, gum and stains), Building (storeys of rooms lit in different ways, shopfronts throwing light onto the pavement), Hanging sign (neon tubes or a light box), Lamp post and Overhead wires. Wet ground smears reflections down the tarmac the way rain does. Neon night starts from all of them.
- Cars and people: + Add, Car, Person or Crowd in the scene editor. Key a car's place and it drives its path, wheels turning with the distance and steering into the bends, head and tail lights lit (Beams light the road at night). A person walks, runs, stands, waves, dances or sits, their steps keeping pace with how far their keys take them, with their own height, skin, top, trousers and hair. A crowd fills an area with people coming and going, as real-looking men and women, as mannequins, or as copies of an imported rigged model. Imported rigged models play their own animation clips (Clip, Speed, Start at, round and round or once)
- Night, weather and effects: Rain falls round the camera, Wet ground mirrors every light in its puddles and sheen, Light shafts stream from the sun past what stands in front of it, Lens flare and Light streaks (anamorphic) catch bright lights, and a spot light's Beam shows its light in the air. + Add, Effect places smoke, fire, steam, sparks, dust thrown up from the ground, or an explosion that goes off at a moment you choose (with its flash); + Add, Neon sign glows with your words, steady or flickering, lighting what is near it; + Add, Building stands with storeys of windows, some lit. Start from Neon night: a wet city street in the rain, with traffic, people, neon and street lights, letterboxed and filmed low
- Beats: Find the beats (the bars button in the timeline) listens to the music for its kicks and puts a beat marker on each, with the tempo; then put a hit on every beat at once: Zoom punch, Shake, Glitch, Blur hit, Strobe, Slam, Spin hit, or a white Flash over the whole frame. RGB split is an effect of its own under Effects, and Hard B&W and Night drive are looks under Adjust
- Physics: set any flat layer to Falls and it drops, bounces, tumbles and slides off everything Fixed (a floor, a ramp, a platform you keyframe to push things), with bounce, friction, weight, a push and spin, and the scene's gravity, walls and air drag. Animate a layer, then let it fall at a moment of your choosing and it carries on at the speed it had: throw it. The scene is simulated the same way every time, so scrubbing and exports are exact. Presets: Let it fall, Throw it, Bouncy ball and Heavy and dead run the physics once and write the fall as keyframes, until the layer comes to rest, so it shows on the timeline like any animation; Make it solid sets a layer Fixed. Right-click a falling layer to bake its physics to keyframes too
- Music: make any number follow the song (from a layer's Design panel, or the Music presets): scale punching on the kick, a shake on the snare, brightness on the hats, a glow with the vocals, a bounce with the bass, or just how loud it is, by any amount and eased back over a time you choose. Each link listens to the whole mix, or to one audio track: import stems (drums, bass, vocals) as tracks of their own and each layer follows its own. Without stems, the kick, snare, hats and vocals are picked out of the mix. Exports wait for the music to be heard, so every frame is right
- Figures: a person to pose and animate (the person button in the toolbar). Drag its hands, feet, elbows, knees, head and chest on the canvas and the limbs follow; every joint keyframes, Side view turns it from facing you to side on, and Joint caps fades the lighter caps on its elbows, knees, shoulders and hips, down to none. Presets: Walk, Walk across, Run, Jump, Wave hello, Dance, Sit down, Cheer, T-pose. Set it to Falls and it is a ragdoll, every limb jointed
- Hand-drawn: + Add, Hand-drawn line draws any SVG path (paste one into Path) with round ends, and Reveal draws it on like a pen; SVGs sent in keep their paths as these lines. + Add, Blob is an organic shape whose outline breathes as Morph moves (Wobble and Seed shape it). Boil, under Effects, makes any layer's edges tremble ten times a second like a frame redrawn by hand
- Vaporize: an Exit preset, and the Vaporize % effect, that turns any layer to dust blowing up and away, left side first
- Gradients: linear or radial, through up to five colours (Fill, up to three Via stops, Fill 2), and morphing from one kind to the other with To radial %; colours can be linked to the project's colour constants (Composition, Colours), like CSS's --accent
- Export: MP4 (H.264/AAC), WebM (VP9/Opus), MOV (ProRes 422 HQ), GIF, PNG sequence (zip), or a still frame; 24/25/30/60 fps; sizes up to 8K; whole timeline or between markers. Presets set it all in one pick: YouTube 1080p and 4K, Shorts, Reels and TikTok (9:16), Instagram square and portrait, transparent ProRes 4444 and WebM, a small web version and GIF, plus your own saved settings. Frame exports to 16:9, 9:16, 1:1 or 4:5 whatever the canvas, filled (cropped to the middle) or fitted with bars; Transparent leaves out the background for WebM, MOV, PNG and still PNG or WebP, to lay over other footage

## Image mode
Switch with Video / Image in the header. The timeline is hidden; importing an image into an empty canvas opens it at full resolution.
Adjust colour, apply looks (Vivid, Warm, Cool, Faded, Vintage, Noir, Mono, Punch, Negative), flip, blend layers, add shapes and text, then export PNG, JPEG or WebP.

## Install

Linux and macOS:

    curl -fsSL https://raw.githubusercontent.com/Natuworkguy/Riptide/main/install.sh | bash

Windows (PowerShell):

    irm https://raw.githubusercontent.com/Natuworkguy/Riptide/main/install.ps1 | iex

The installer puts Riptide in its own Python environment, adds a `riptide` command, an applications menu (or Start
menu) entry with Riptide's icon (and a Riptide app in Applications on a Mac), and registers `riptide://open` links.

On a Mac, Riptide is a real app: the installer builds it (macos/Riptide.swift) with Xcode's command line tools
(`xcode-select --install` if you do not have them) into `~/Applications/Riptide.app`, a native window with Apple's own
WebKit, menus, full screen and Cmd+Q, no browser involved. It starts Riptide's server when it opens and stops it when it
quits; exports land in Downloads; windows Flash or an agent opens for a project open in the app too.

Elsewhere Riptide is a desktop app too: each of these opens it in a window of its own, with no address bar or tabs, and
starts its server if it is not running. Nothing to set up: the window is Chrome, Edge, Brave or Chromium in app mode with a profile
of its own, so it sits in the dock or taskbar as Riptide and remembers its size; on a computer with none of those it is
a native window when pywebview is installed, else a browser tab. `riptide --tab` (or `RIPTIDE_OPEN=tab`) opens a tab
instead, and from a tab, the browser's Install app button makes it an app too. `riptide --stop` stops the server. Run the installer again to update. To take
Riptide back out, run `riptide --uninstall` (or the installer with `--uninstall`, `-Uninstall` on Windows): it stops the
server and removes the app, the command, the shortcut, the riptide:// links and its settings. Your .rip projects stay
where you saved them. ffmpeg is still yours to install, for video export.

### The dev version

The dev branch is where changes land first, before a release. To install it (or switch an install over to it):

Linux and macOS:

    curl -fsSL https://raw.githubusercontent.com/Natuworkguy/Riptide/dev/install.sh | bash -s -- --dev

Windows (PowerShell):

    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Natuworkguy/Riptide/dev/install.ps1))) -Dev

Run the same command again to update to the latest dev version. To go back to releases, run the normal install
command above.

## Run

    brew install ffmpeg          # only needed for MP4/WebM/GIF export
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python server.py   # http://127.0.0.1:5173

Projects save as `.rip` files (images and audio embedded; older `.wob` files still open) with the browser's own Save/Open dialogs.

Reload a window and it comes back as it was, unsaved changes included: each window keeps its work in the browser,
under the window's own id, for two weeks. A new window starts fresh. New projects start at 1080×1080 unless you pick a
size and choose **Use this size for new projects** from the canvas size menu.

3D worlds are drawn on your computer's graphics (WebGL) when the browser has it, and by the server when it has not:
`server.py` keeps a windowless browser of its own (Chrome or Edge when you have one, else Playwright's Chromium, which
the installer fetches) and the editor shows the pictures it sends. If that browser falls over the server starts
another. Right-click the canvas, **Draw 3D**, to choose: **Automatic**, **This computer** or **Riptide's server** (a
heavy scene on the server can never take the editor down). Set `RIPTIDE_BROWSER` to use a particular
Chrome or Chromium. An install from before this sets itself up the first time the editor asks: the server installs
Playwright into its own environment and drives Chrome, Edge, Brave or Chromium if one is installed, or downloads
Chromium if none is. So a browser that has WebGL switched off (Brave can, for privacy) still gets 3D.

## Flash extension

This repository is also a Flash extension: it lets Flash send the pictures and 3D models it makes to Riptide, as
layers in the project open there, to animate or put in a video.

    flash install github@Natuworkguy/Riptide

It adds a `send_to_riptide` tool (just ask: *put that chair in Riptide*), a `/riptide [path]` command (the newest
picture or model Flash showed, when no path is given), and a **Send to Riptide** button (the cube icon) in the bar of
any 3D model you open in Flash's web UI. With more than one Riptide window open, the button asks which project to send to, and Flash picks a window (or asks you) before its tools act. Pictures (.png, .jpg, .webp, .gif, .svg) become image layers and models (.glb, .gltf,
.obj) 3D layers. When Riptide is not open, it starts it (with the installed `riptide` command) and waits for the
editor. Its address, and whether to open it, are in the extension's settings. Agents can do the same through MCP with
`add_image` and `add_model`.

Riptide can have any number of windows open, each a project of its own. Flash and agents work in the window used
last, or in one they name by its project or open themselves: `riptide_windows` in Flash and `list_windows`,
`use_window` and `open_window` over MCP. Flash's `send_to_riptide` and `riptide_world` take a `window` (a project's
name, `new`, or `empty` for a window with nothing in it yet, opening one if there is none).

**Riptide in a Flash chat.** Each Flash chat has a Riptide window of its own, `flash-` and the chat's id. The
**Riptide link** item in the + menu by Flash's message box (also in its command palette) starts Riptide's server
if it is not running (`riptide --serve`: no window of its own) and gives you that window's address, to open and watch.
Work Flash does for the chat goes to that window without asking which (opened first if it is not open yet), and its
answers end with the link.

## Tutorial
Help in the header (or **F1**) opens a tutorial in 14 sections, from the first layer to 3D, the camera, exporting and working with an agent, with buttons that try each thing on the spot. It is offered once on a first visit.

## Shortcuts
Press **?** in the editor for the full list (80 commands), or **Cmd+P** for the command palette, which searches every
command, layer, animation preset and canvas size, and jumps to a time if you type one (`2.5s`).
Highlights: R O P S A W T add shapes and text · Tab / Shift+Tab cycle layers · H hide · L lock · 0-9 opacity ·
Alt+A/D/W/S/H/V/C align · Cmd+[ ] arrange · K key all · Shift+K remove keys · J / ; previous / next keyframe ·
E cycle easing · [ ] trim · Alt+[ ] slide layer · Cmd+K split · M marker · Shift+M / Alt+M jump markers ·
I / U layer start / end · Shift+Space play from start · F focus mode · Cmd+Shift+E save frame as PNG.

## Live MCP server (let agents see and edit the animation)

`mcp_server.py` is a stdio MCP server. It talks to `server.py`, which relays each request to the Riptide tab open in your
browser, so agents work on the live project: changes appear instantly, go into undo history, and nothing is saved
until you save. The **Live** badge over the viewer turns green when the tab is linked (amber while an agent is working).

1. `.venv/bin/pip install -r requirements.txt` (adds `mcp`)
2. Run `.venv/bin/python server.py` and open http://127.0.0.1:5173
3. Point your MCP client at the URL **http://127.0.0.1:5173/mcp** (streamable HTTP, served by server.py).
   Or, for clients that only do stdio:

```json
{ "mcpServers": { "riptide": {
    "command": "/path/to/riptide/.venv/bin/python",
    "args": ["/path/to/riptide/mcp_server.py"] } } }
```

Tools: `get_project`, `get_layer`, `list_capabilities`, `see_frame` (image of one moment), `see_frames` (contact sheet over time),
`add_layer`, `update_layer`, `set_keyframes`, `delete_keyframes`, `apply_preset`, `delete_layer`, `reorder_layer`,
`set_composition`, `new_project`, `set_playhead`, `select_layer`, `add_marker`, `undo`, `redo`, `get_project_json`.
Set `RIPTIDE_URL` if the editor is not at http://127.0.0.1:5173. With several tabs open, the newest one is used.

Snapping: dragging an object snaps its edges and centre to the canvas and to other layers, with red guide lines;
hold Alt or Cmd to move freely.

Canvas size: the Composition **Preset** menu has social (Instagram, Story/Reel, TikTok, Shorts, X, LinkedIn, Facebook),
video (720p to 4K, vertical, cinema) and web sizes, plus Custom. **Scale content** fits the existing design into the new
frame; **Keep size** only re-centres it. **Rotate** swaps width and height.

## Contributing

Work happens on the `dev` branch; `main` holds releases. See [CONTRIBUTING.md](CONTRIBUTING.md).

3D is drawn with [three.js](https://threejs.org) (MIT), with three-gpu-pathtracer, three-mesh-bvh and three-bvh-csg (MIT), bundled in `static/vendor/three`, with the Droid Sans Bold typeface (Apache 2.0) for 3D text.

## Edit effects

- **Cut out person** (pictures and videos, under Cut out): the person in the shot cut out of their background with no
  green screen. The server works out each frame with a model made for people (U2-Net), installed and downloaded (about
  170 MB, checked against a pinned hash) the first time, then kept in `~/.riptide/cutout`. **Edge soft** and **Grow**
  shape the edge.
- **Echo** (any layer): copies of the layer from a moment before, fading, for a trail on a move, or, with **Echo
  grow**, rings pulsing off a shape.
- **Zoom blur** (any layer, or an adjustment layer for the whole frame): a rush forward, the middle kept sharp.
- **Pixel smear** (any layer, or an adjustment layer): bright pixels dragged out into streaks, the datamosh look.
- **Speed lines** (a layer of its own): streaks rushing out from the middle.
- In 3D worlds a person is a real-looking man or woman, photographed skin, clothes and hair (two of the Microsoft
  Rocketbox avatars, MIT, rebuilt for Riptide by `tools/make_people_rocketbox.js`), dressed as they come; or the
  classic man or woman (MakeHuman's free CC0 body: see `tools/make_people.py`), whose clothes, skin and hair take any colours. They walk, run, dance, sit, or
  **skate**, **ollie** and **kickflip** on a board, and in the scene editor every joint can be posed by hand, or keyed
  pose to pose. Any person or model can wear an **outfit** finish such as **holo** (rainbow foil shards). Particles have
  a **tendril** kind, a twisting column of sparkles. Imported characters work the same way: a Mixamo `.fbx` with its
  animation, or a `.glb`.

