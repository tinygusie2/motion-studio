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

GSAP comes from the `gsap` npm package, not a CDN: the preview gets it at `/preview/<id>/gsap.min.js` and every
render project gets a copy next to its `index.html`, so neither needs the network (the editor's icon font still
comes from Google Fonts).

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
- `src/keyframes.mjs`: clip keyframes (easings, interpolation, the GSAP plan). It is shared with the UI at `/lib/keyframes.mjs`.
- `src/edit.mjs`, `src/silence.mjs`: cutting time out of a video, and finding silences. Shared with the UI at `/lib/edit.mjs` and `/lib/silence.mjs`.
- `src/demo-session.mjs`, `src/demo-web.mjs`, `src/demo-android.mjs`, `src/cdp.mjs`, `src/gestures.mjs`, `src/demo.mjs`: recording a demo of an app (see below); `ui/demo.js` is its window. `gestures` and `demo` are shared with the UI.
- `src/whisper.mjs`: finding, installing and running whisper.cpp for speech recognition.
- `src/captions.mjs`: captions (word timing, grouping, splitting, SRT/VTT). It is shared with the UI at
  `/lib/captions.mjs`.
- `ui/editor.js`: the editor (timeline, inspector, library, dialogs, keyboard).
- `ui/widgets.js`: the menu bar, plus the dropdowns (styled popovers over native `<select>`s, which stay the
  source of truth).
- `ui/player.js`: the preview player that is injected into previews.
- `scripts/`: Windows code signing, and `check.mjs` (a syntax check of every script).
- `test/`: unit tests for the pure modules (`npm test`, Node's built-in test runner).

Every change in the editor goes through `commit(fn)`. That function takes an undo snapshot (the spec, the
selection and the playhead), re-renders and saves 350 ms later. Position-only edits made directly in the preview
(taps, callouts, captions) use `commit(fn, { quiet: true })`, which saves without rebuilding the preview. Text
fields pass `live` to `field()`: the text is patched into the preview that is on screen (`liveEdit`), and the
preview is rebuilt once typing stops. Undo history is kept per video while the editor is open.

A pending save is not lost when the page goes away: a reload or a closed browser tab sends it with
`navigator.sendBeacon` (a POST to the same route), and the Electron window calls `window.__flushSave()` before it
closes (`main.mjs`).

While dragging on the timeline only the blocks move (`layoutTimeline`); the timeline is rebuilt when the drag ends,
or when the rows change shape.

## Projects (workspaces)

Every project is a folder. Motion Studio can switch between them (Bestand → Projecten, Ctrl+O). In that dialog a
project can be taken off the list (`POST /api/workspace/remove`, the folder stays) or, in the app, moved to the
recycle bin (`trash: true`, through the `trash` function `main.mjs` passes to `startServer`; only folders with a
`studio.json`, and the server refuses when it has no such function). The open project gives way to the next one on the list.

| Path | What |
| --- | --- |
| `studio.json` | `{ name, defaultBrand }` |
| `brands/<id>.json` | name, url, lang, `logo` (file in `assets/brand/`), `font` (file in `assets/fonts/`), `theme` colors, `chipColors`, `pills`, `endNameSize`, `renderPrefix`, `css`, `captions` (default caption style) |
| `specs/<id>.json` | one video: `brand`, `layout`, `dur`, `end`, `heads`, `clips` (each with `tr`/`trDur` for its transition, `kf` for its keyframes and `sound`/`vol` for its own sound), `clips2`, `chips`, `zooms`, `taps`, `markers`, `vo`, `audio`, `audioVol`, `music`, `subs`, `captions`, `formats`, `tagline` |
| `assets/clips/` | screen recordings (converted to H.264 on upload) and screenshots (png/jpg); deleted files go to `.trash/` |
| `assets/vo/` | audio (voice and music); generated voice-overs land here; deleted files go to `.trash/` |
| `renders/` | finished MP4s (`<renderPrefix>-<id>[-4x5\|-1x1\|-16x9].mp4`), plus a `.srt` when the video has captions |
| `.cache/thumbs/` | timeline filmstrips: one JPEG row of frames per clip version (`/api/thumbs/<clip>`), safe to delete |

To build without the app, run `node src/cli.mjs build <workspace> [id,id…]`, then `npx hyperframes render` in
`<workspace>/projects`.

## Starters

`src/starters.mjs` holds the ready-made videos offered under *New video*. Each starter has a label, a hint, an
icon, a layout and a `make(text, ctx)` that returns the spec's items; `ctx` has the project's clips (and their
lengths when known) and the device size per layout, so taps and zoom focus points land on the screen.
`starterSpec()` adds the brand, the texts in the brand's language (English when there is no table for it) and empty
lists for everything else. `test/starters.test.mjs` checks that every starter builds and ends before the end card.
To add one: add an entry to `starters`, its texts to `text.en` and `text.nl`, and its label and hint to `ui/i18n.js`.

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

The `text` layout has no visible device: the device element stays in the page (so clips and their sound keep working) but is `display: none`, and `#root.is-text` centers the headlines, sized to the format (`TS` in `build`). It covers the frame like `full` in `stageFit`, is left out of the Demo Studio's device list, and works in every format.

## Captions

`subs` holds caption blocks `{ t, out, text }` (`*stars*` = accent color). Blocks come from three places: the
voice-over lines (automatically after the first voice-over, or via "Uit voice-over"), an imported `.srt`/`.vtt`,
or blocks added by hand.

Word times inside a block are estimated from word length, so moving a block's in or out point re-times its words.
A block made by speech recognition also has `wo`: each word's start in seconds after the block's start. Those exact
times are used while the text still has as many words (fixing a typo keeps them, rewriting the sentence falls back
to the estimate), they move with the block, and splitting a block splits them too (`timeWords`, `splitSub`).

### Speech recognition

*Captions → Uit audio* (or the Edit menu) runs [whisper.cpp](https://github.com/ggml-org/whisper.cpp) on the
video's voice/audio track (`POST /api/transcribe/<id>`, a job like render and voice-over). `src/whisper.mjs` finds
`whisper-cli` and a model (Settings `whisperCli` / `whisperModelFile` / `whisperModel`, then
`~/.motion-studio/whisper/`, then PATH). When they are missing the editor asks first and then runs
`POST /api/whisper/install`: a pinned whisper.cpp release (Windows x64 only; elsewhere install it yourself) and a
ggml model from Hugging Face, checked against the sha256 Hugging Face publishes. Nothing is downloaded before the
user agrees, and the audio never leaves the computer.

The server converts the audio to 16 kHz mono with ffmpeg, runs `whisper-cli … -ml 1 -sow -oj` (one word per entry)
with automatic language detection, and caches the JSON per file version, model and language in `vo/whisper/`.
`wordsFromWhisper()` and `subsFromWords()` in `src/captions.mjs` turn that into caption blocks (new block after a
pause, after a sentence end, or when it gets long). The job returns the blocks; the editor puts them in the spec
with `commit`, so undo works.

The style comes from `captionDefaults` < `brand.captions` < `video.captions`. It covers:
- `style` (`pop`, `karaoke`, `box`, `plain`)
- `y` and `size`
- `words` (per group)
- `upper` and `outline`
- `color` / `hi` / `ink` (null = the brand's text / accent / accent-ink)
- per video, `off`

## Audio

`audio` is the voice track (a generated voice-over or an upload). `audioVol` is its level (0..1, `data-volume`).

A generated voice-over is one file (`vo.file`) with every line mixed in at its time; each line keeps that spot as
`at`. The template then plays the voice per line (`voiceSegments` in `src/audio.mjs`): the piece of the file from `at`,
at the line's current `t`. Moving a line on the timeline therefore moves its audio, without making the voice-over
again. Changing a line's text drops its `at` (the audio no longer fits) until the voice-over is made again. Captions
that start within a line's time move along with it in the editor.

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

## Clip transitions

By default one clip cuts hard to the next. A clip's `tr` (`fade`, `slide`, `slideup`, `whip`, `zoom`, `blur`, `flash` or `spin`, see `transitions` in
`src/template.mjs`) and optional `trDur` (seconds) set how it comes in. The cut stays at the incoming clip's `start`:
the clip that was showing there (or ended at most 0.1 s before) is held on screen `trDur` seconds longer, by
extending its `data-duration`, and both animate on the GSAP timeline while they overlap. Clips then stack by their
start, so the incoming one is on top. Without a clip before it, the clip only animates in over the screen
background. `clipTransitions()` plans this per device.

## Clip sound and cutting

Uploaded videos keep their sound (AAC). A clip plays it when it has `sound: true` (`vol`, 0..1, is its level): the
`<video>` then gets `data-has-audio` and no `muted`, and HyperFrames mixes it into the render. Without `sound` a clip
is silent, as before. `GET /api/state` has `clipAudio` (which clips have a sound track, by ffprobe), and the media
pool marks them with a speaker.

`src/edit.mjs` cuts time out of the whole video (`cutRanges(v, [[t0, t1], …])`): clips are cut and closed up (a later
piece of a clip gets its own `media` offset and loses its transition and keyframes), every timed item moves (a moment
inside a cut lands on its start), caption blocks with exact word times lose exactly the words inside a cut, and `end`
and `dur` get shorter. The voice/audio track is a file and is not cut. Two things use it:
- **Cut silence** (clip inspector): `GET /api/silences/<clip>?level=` runs ffmpeg `silencedetect` (cached in
  `vo/silence/`), `silenceCuts()` in `src/silence.mjs` turns the silences into ranges (only silences over 0.4 s,
  with 0.12 s of air kept around the words) and the editor cuts them after a confirmation.
- **Cut words** (caption inspector, for blocks with `wo`): `wordRanges()` gives a word's time range, from its start to
  the start of the next word.

Both go through `commit`, so Ctrl+Z brings the video back.

Captions can also come from the sound of the clips: without a voice/audio track, `POST /api/transcribe/<id>` mixes
the sound of the clips that have `sound: true` into one wav in video time. Before recognition, long silences
(0.6 s and more, `speechSegments()`) are taken out of the audio, because Whisper stretches the first word after a
silence over it; the word times are mapped back afterwards (`mapFromSegments()`).

## Demo recording (Demo studio)

*Demo* in the media pool (or File → Demo opnemen…) opens `ui/demo.js`: you operate your app on a device in the editor,
and everything you do is recorded with its time. The app itself runs elsewhere; the editor shows its picture on a
canvas and forwards pointer, wheel and keyboard events. `src/demo-session.mjs` holds the one open session and the
HTTP routes (`/api/demo/…`: `open`, `frames` (server-sent events with the live picture), `input`, `fill`, `navigate`,
`record`, `data`, `devices`, `status`, and `DELETE /api/demo/session`).

Two sources implement the same small interface (`input(ev)`, `fill(dataset, mode)`, `startRecording()`,
`stopRecording()`, `close()`, and `css` / `dsf` for the picture):
- **Web** (`src/demo-web.mjs`, `src/cdp.mjs`): a Chrome (installed Chrome or Edge, else the headless Chrome HyperFrames
  downloads) started with a throwaway profile and driven over the DevTools protocol with Node's own WebSocket. The page
  gets the CSS size, pixel density and touch input of the layout (`deviceFor`: a phone is 390×844 at 2×, which has the
  shape of the 616×1334 layout screen). The picture is the screencast; touch events are dispatched as touch (mouse for
  the browser layout). A recording keeps every screencast frame with its timestamp and `encodeFrames` makes a
  constant-frame-rate mp4 from them with ffmpeg's concat demuxer.
- **Android** (`src/demo-android.mjs`): adb. The live picture is an H.264 stream from `screenrecord` (`exec-out`), decoded
  by ffmpeg into pictures, like Android Studio's mirroring: about 60 fps where screenshots gave 5. A raw H.264 stream only
  releases a picture when the next one begins, so once the stream has been quiet for 350 ms one `screencap` screenshot is
  taken to show the newest state (the picture is then a PNG, the stream's are JPEGs; the editor sniffs which). Without a
  working stream (three starts that give nothing) it falls back to screenshots all the time. A finger on the canvas becomes
  `input tap` / `input swipe` when it is lifted, and the log gets the gesture at the time the phone did it. The recording
  is a separate `screenrecord` on the device (its timestamps are exact; the stream is timestamped by when it arrives, which
  shows changes late), pulled and made constant-frame-rate; if a phone cannot run two encoders the stream pauses during the
  recording. Text goes through `input text`, fields are found with `uiautomator dump`. It never picks a device: the user
  chooses one, and the test only runs against a serial named in `MS_TEST_ANDROID`.

The log (`down/move/up/wheel/text` events, seconds since the start) becomes gestures in `src/gestures.mjs`
(`analyzeGestures`: tap, long press, swipe, scroll (wheel) as a swipe, typing), and `tapsFromGestures` turns those into the
video's `taps`. A tap with `x2`/`y2`/`dur` is a swipe (the finger drags with a trail) and one with `hold` is a long press
(`src/template.mjs`). `insetFor(layout, css)` maps the device's CSS pixels into the device element taps are placed in
(`inset` of the layouts), so a tap lands on the same spot of the screen whatever the layout. The recording is added to the
video as a clip at the playhead.

Fingers on the phone itself are recorded too (`src/touch.mjs`): while recording, `getevent -lt` (all devices, one process; it takes only a single device path) is read, the touch screens found with `getevent -lp` are parsed, and the first finger becomes down/move/up events in the same css pixels as canvas input. A driver only reports axes that changed, so the parser keeps the last position (seeded from `-lp`). Taps sent by the app use `input` and never pass the touch driver, so nothing is counted twice.

A tap is logged when it is sent, but the screen reacts a moment later (the browser draws a frame; on Android adb starts a
shell, the phone handles the touch, draws and encodes), and how long differs per phone and connection. So every
recording is measured (`src/latency.mjs`): ffmpeg's scene score gives the moments the picture changed, and for every tap,
hold or swipe the time until the first change (within 1.5 s and before the next gesture) is a sample; the median is the
shift the taps get (`sync`, `syncMeasured` = the number of samples), shown in the review and editable. Only a recording in
which no tap changed the picture falls back to the source's guess (0 for web, 0.3 s for Android).

**Demo data** (`src/demo.mjs`, kept per project in `demo.json`): datasets of made-up values (`fields`) and app
storage (`storage`: localStorage, sessionStorage, cookies, set before the app runs). `fieldKind` recognises an input from
its type, name, id, placeholder, label and autocomplete (Dutch and English, whole words only); `pickValue` gives the
dataset's value for it. "Vul alle velden in" taps every empty field and types its value, with a human typing rhythm
(`typingPlan`); the taps and typing land in the recording like anything else. A chip types exactly its value in the
focused field.

## Clip keyframes

`kf: [{ t, x, y, s, r, o, ease }]` on a clip moves it inside its screen: `x`/`y` shift in screen pixels, `s` scales,
`r` rotates (degrees) and `o` is the opacity. `t` counts seconds from the clip's start, or from the end of its
transition when it has one, so a keyframe never fights the transition over the same property. `ease` is how the clip
gets *to* that keyframe (`kfEases` in `src/keyframes.mjs`; the names are GSAP's). Before the first keyframe the first
one holds, after the last one the last one holds. Splitting a clip (S) gives both halves a keyframe at the cut.

`kfPlan()` turns the list into a `set` plus one tween per pair; `build()` writes those as `clipKfs` and the script
plays them after the transitions. `kfAt()` gives the values at a time, which the editor uses for "Keyframe op de
playhead". Both live in `src/keyframes.mjs`, which is shared with the UI at `/lib/keyframes.mjs`. In the editor
they show as diamonds on the clip in the timeline and as rows in the clip's inspector.

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

## Interface language

The editor is written with Dutch strings. `ui/i18n.js` translates what reaches the screen: a MutationObserver
rewrites text nodes and `title`/`placeholder`/`aria-label` attributes, and `confirm()`/`prompt()` are wrapped.
Keys are the Dutch text; `{0}` placeholders become regex groups whose contents are translated recursively, and text
joined with ` · `, `, ` or newlines is translated piece by piece. Elements matching `SKIP` (user content such as
timeline labels, file names and the video list) are left alone; add the `no-i18n` class to anything else that
must stay as is. The server picks the language (the `uiLang` setting, else the browser's `Accept-Language`) and
puts it in `<html data-ui-lang>`, so the first paint is already translated. The preview is never translated.

## Deleting assets

`GET /api/assets/<clips|vo|brand|fonts>/<name>/usage` lists the videos and brands that use a file. `DELETE` on
the same path (without `/usage`) moves the file to that folder's `.trash/` and unlinks it:
- clips leave the videos
- audio tracks are dropped
- brands lose the logo, or fall back to the default font
