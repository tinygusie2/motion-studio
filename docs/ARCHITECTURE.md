# How Motion Studio works

A tour of the code and the data, for contributors. Start with [CONTRIBUTING.md](../CONTRIBUTING.md) if you
haven't yet.

## The big picture

```
Electron window (main.mjs)
  └─ loads http://127.0.0.1:<port>  ←  src/server.mjs  (in-process HTTP server)
        ├─ /             the editor: ui/index.html + ui/editor.js + ui/widgets.js
        ├─ /preview/<id> the real composition (src/template.mjs) + ui/player.js, in an iframe
        └─ /api/…        project files, uploads, render / voice-over / batch jobs, beats
Render: src/workspace.mjs writes projects/<id>/index.html → `npx hyperframes render` → renders/<file>.mp4
```

A video is a JSON **spec**. The editor edits the spec, the server saves it, and `build()` in
`src/template.mjs` turns it into one HTML page with a paused GSAP timeline. The preview shows that page with a
small seekable player. The render feeds the same page to [HyperFrames](https://hyperframes.heygen.com), so the
preview and the MP4 always match.

`npm run serve` runs the same server without Electron, and you can use the editor in a normal browser at
http://localhost:3400. That's the quickest way to develop the UI.

## Code

- `main.mjs` / `preload.cjs`: the Electron window, the native menu (hidden, kept for its shortcuts), the native
  file pickers and window actions.
- `src/server.mjs`: the HTTP API, the live preview, uploads (ffmpeg), jobs (render, batch, voice-over), beats and
  asset deletion.
- `src/workspace.mjs`: project folders, brands and the user settings (`~/.motion-studio/settings.json`). It also
  writes the render project per format.
- `src/template.mjs`: the composition (HTML, CSS and the GSAP timeline), the layouts, the formats and clip placement.
- `src/audio.mjs`: the music bed mix (fades, ducking under the voice) as a HyperFrames volume lane. It is shared
  with the UI at `/lib/audio.mjs`.
- `src/captions.mjs`: captions (word timing, grouping, splitting, SRT/VTT). It is shared with the UI at
  `/lib/captions.mjs`.
- `ui/editor.js`: the editor (timeline, inspector, library, dialogs, keyboard).
- `ui/widgets.js`: the menu bar, plus the dropdowns (styled popovers over native `<select>`s, which stay the
  source of truth).
- `ui/player.js`: the preview player that is injected into previews.
- `scripts/`: Windows code signing, and `check.mjs` (a syntax check of every script).
- `test/`: unit tests for the pure modules (`npm test`, Node's built-in test runner).

Every change in the editor goes through `commit(fn)`. That function takes an undo snapshot, re-renders and saves.
Position-only edits made directly in the preview (taps, callouts, captions) use `commit(fn, { quiet: true })`,
which saves without rebuilding the preview.

## Projects (workspaces)

Every project is a folder. Motion Studio can switch between them (Bestand → Projecten, Ctrl+O).

| Path | What |
| --- | --- |
| `studio.json` | `{ name, defaultBrand }` |
| `brands/<id>.json` | name, url, lang, `logo` (file in `assets/brand/`), `font` (file in `assets/fonts/`), `theme` colors, `chipColors`, `pills`, `endNameSize`, `renderPrefix`, `css`, `captions` (default caption style) |
| `specs/<id>.json` | one video: `brand`, `layout`, `dur`, `end`, `heads`, `clips`, `clips2`, `chips`, `zooms`, `taps`, `markers`, `vo`, `audio`, `audioVol`, `music`, `subs`, `captions`, `formats`, `tagline` |
| `assets/clips/` | screen recordings (converted to H.264 on upload) and screenshots (png/jpg); deleted files go to `.trash/` |
| `assets/vo/` | audio (voice and music); generated voice-overs land here; deleted files go to `.trash/` |
| `renders/` | finished MP4s (`<renderPrefix>-<id>[-4x5\|-1x1\|-16x9].mp4`), plus a `.srt` when the video has captions |

To build without the app, run `node src/cli.mjs build <workspace> [id,id…]`, then `npx hyperframes render` in
`<workspace>/projects`.

## Adding a layout

A new app with a different UI usually needs a different frame around the recording. In `src/template.mjs`:

1. Add an entry to `layouts`:
   - `label`
   - `enter: 'rise' | 'fade'`
   - `screen: [w, h]`: the CSS size of its `.screen`
   - `box: [x, y, w, h]`: the device area on the stage
   - `dev: [w, h]`: the size of `#phone`
2. Add `.L-<name>` CSS for the position and size, and `.L-<name> .device` / `.screen` for the frame.
3. Optional: add extra frame markup next to `chrome` in `build()`, like the browser's address bar.

The editor picks up new layouts automatically. Add an icon for yours in `LAYOUT_ICONS` in `ui/editor.js`.

## Captions

`subs` holds caption blocks `{ t, out, text }` (`*stars*` = accent color). Blocks come from three places: the
voice-over lines (automatically after the first voice-over, or via "Uit voice-over"), an imported `.srt`/`.vtt`,
or blocks added by hand.

Word times inside a block are estimated from word length, so moving a block's in or out point re-times its words.

The style comes from `captionDefaults` < `brand.captions` < `video.captions`. It covers:
- `style` (`pop`, `karaoke`, `box`, `plain`)
- `y` and `size`
- `words` (per group)
- `upper` and `outline`
- `color` / `hi` / `ink` (null = the brand's text / accent / accent-ink)
- per video, `off`

## Audio

`audio` is the voice track (a generated voice-over or an upload). `audioVol` is its level (0..1, `data-volume`).

`music` is a bed on its own track: `{ src, start, media, dur?, vol, fadeIn, fadeOut, duck, carve }`. Its level
is written as a `data-automation` volume lane. The lane contains the fades, and it lowers the level by `duck`
while the voice speaks. "Speaking" means the VO lines that have a length, merged across short pauses; a voice
track without lines counts as speaking throughout. The preview player evaluates the same lane, so the preview
and the render agree.

`carve` (0..1) adds a voice carve: a HyperFrames `data-fx-chain` of three peaking filters (800 Hz, 1.6 kHz and
3 kHz, `CARVE_BANDS` in `src/audio.mjs`), each with a `fx.carveN.gain` lane. The lanes follow the same speaking
envelope as the duck, down to −12 dB × `carve` at 1.6 kHz. The preview player builds the same filters with Web
Audio from `data-fx-chain` and plays their lanes, so you hear the carve while editing. `window.__player.fx()` in
a preview shows the live values.

## Zoom focus

A zoom can have a focus point `fx`/`fy` in frame pixels; you pick it by clicking the device while the zoom is
selected. The device then shifts so that point moves toward the middle. The shift is clamped, so the zoomed device
still covers its own area. Without a focus point, the zoom uses its `y` shift.

## Clip fit and crop

By default a clip fills its device screen (`object-fit: cover`, top-aligned). `fit: 'contain'` shows the whole
clip, with the background around it.

`crop: { x, y, w, h, sw, sh }` (source pixels, plus the source size) shows only that region, placed the same way.
See `clipPlacement` in `src/template.mjs`.

The editor's fit check and the library cards use `layouts[…].screen` to report how much of a clip is cut off or
enlarged. The ideal source size is twice the screen size.

## Formats

Every video is designed on a 1080×1920 stage (`#stage`: devices, callouts and taps). `formats` lists what Render
produces (default `['9:16']`):
- `4:5` stacks the headline above the device.
- `1:1` and `16:9` put the headline on the left and the device on the right.

`stageFit` in `src/template.mjs` scales and moves the stage so that the layout's `box` fills the format's `area`.
Captions keep their relative height.

Callouts and captions can have a position of their own per format:
- `chip.pos['16:9'] = { x, y }`
- `captions.pos['16:9'] = y`

Dragging them in a 4:5, 1:1 or 16:9 preview writes these; in the 9:16 preview they move for all formats. See
`placeIn` in `src/template.mjs`.

Because the stage keeps its own coordinates, zoom focus points, crops, callout positions and taps need no
conversion. The editor can preview any format (`?f=4:5` on `/preview/<id>/`). A separate `projects/<id><suffix>/`
is written per format.

## Taps

`taps: [{ t, x, y, style? }]` shows the viewer where to look. Each tap is a finger dot (touch devices) or a mouse
pointer (the browser layout, or `style: 'cursor'`) that presses at `t` while a ring spreads out. `x`/`y` are
pixels of the first device (`#phone`), so taps move and zoom with it.

In the editor, tap mode (T) adds a tap at the playhead for every click on the device, also during playback. Taps
placed during playback land 0.15 s earlier, to account for reaction time.

## Batch render

`POST /api/batch/all { ids }` renders the videos one after another, each in its own formats. Poll
`GET /api/batch/all` for progress. The job's progress bar is split over the videos and formats (`job.span`).

## Copy/paste, markers, beats

Timeline items (texts, callouts, zooms, taps, VO lines, captions, clips) can be selected together (Ctrl+click,
Ctrl+A) and copied with Ctrl+C or Ctrl+X. The clipboard is kept in localStorage (`ms-clip`), so Ctrl+V pastes into
any video or project:
- Ctrl+V pastes at the playhead; the times shift together.
- Ctrl+Shift+V pastes at the original times.

`markers` (M, editor only) and the music's beats are snap targets, and [ and ] step through them. Beats come from
`GET /api/beats/<file>`. It runs `hyperframes beats` once per file and caches the result in `vo/beats/`.

## Deleting assets

`GET /api/assets/<clips|vo|brand|fonts>/<name>/usage` lists the videos and brands that use a file. `DELETE` on
the same path (without `/usage`) moves the file to that folder's `.trash/` and unlinks it:
- clips leave the videos
- audio tracks are dropped
- brands lose the logo, or fall back to the default font
