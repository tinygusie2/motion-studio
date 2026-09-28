# Contributing to Motion Studio

First of all: **thank you!** Motion Studio is built by the people who use it. Every contribution helps, big or
small, and nobody expects you to know the whole codebase. This guide gets you from zero to a merged pull request.

## Ways to contribute (no code needed for most)

- **Report a bug**: tell us what you did, what you expected and what happened. A screenshot or the render
  log helps a lot.
- **Suggest a feature**: describe the video you were trying to make and what got in the way.
- **Translate**: the interface is in English and Dutch; every other language is very welcome
  (see [adding a language](#adding-a-language)).
- **Improve the docs**: guides, GIFs, fixes to this file.
- **Design**: device frames, caption styles, callout looks, end cards.
- **Code**: fix bugs, build features, add tests.
- **Test**: try the app on macOS or Linux, on a slow laptop, with long videos, and report what breaks.

Not sure where to start? Look for issues labelled
[`good first issue`](https://github.com/tinygusie2/motion-studio/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
or [`help wanted`](https://github.com/tinygusie2/motion-studio/issues?q=is%3Aopen+label%3A%22help+wanted%22),
or pick something from the [list in the README](README.md#-where-you-can-help). Leave a comment so nobody does
the same work twice. If there's no issue for what you want to do yet, open one first for anything bigger than a
small fix; that way we can agree on the approach before you spend your evening on it.

## Setting up

You need [Node.js](https://nodejs.org) 22+ and [ffmpeg](https://ffmpeg.org) on your `PATH`.

```bash
git clone https://github.com/tinygusie2/motion-studio.git
cd motion-studio
npm install
npm run serve      # editor in your browser at http://localhost:3400, the fastest loop for UI work
npm start          # or the full Electron app
```

The first render downloads HyperFrames through `npx`, which takes a minute. Voice-over is optional (Kokoro and/or
Piper, see the README).

**Where things are:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the code, the project folder and the
video spec. The short version:
- `src/template.mjs` turns a video spec into the animated HTML page that gets rendered.
- `ui/editor.js` is the editor.
- `src/server.mjs` connects the two.

## Making a change

1. **Fork** the repo and create a branch: `git checkout -b fix-caption-overlap`.
2. **Make the change.** Keep it focused: one fix or feature per pull request is much easier to review.
3. **Check it** (see below).
4. **Commit** with a message that says what changed and why, e.g. `Captions: keep groups inside the safe zone`.
5. **Open a pull request** and fill in the template. Draft PRs are welcome if you want early feedback.

### Code style

There's no build step and no framework, and we'd like to keep it that way. When in doubt, match the code around
you:

- Plain modern JavaScript (ES modules), two-space indent, single quotes, semicolons.
- Small helpers over abstractions. The editor builds DOM with the `el()` helper, not templates.
- Comments explain *why*, not *what*. A one-line comment above a non-obvious block is the norm.
- Every change to a video goes through `commit()` in the editor, so undo/redo and saving keep working.
- User-facing text is written in Dutch in the code and translated on screen by `ui/i18n.js`. When you add or
  change a string, add its English line to the `en` table too (`npm test` checks that placeholders match).

### Adding a language

1. In `ui/i18n.js`, copy the `en` table to a new one (say `de`) and translate the values. Keys stay Dutch.
   `{0}`, `{1}` stand for text that is filled in (a name, a number); keep them in your translation, in any order.
2. Add it to `tables` and to `languages` (`de: 'Deutsch'`), and add the code to the list in `src/server.mjs`
   (search for `uiLang`) and an `<option class="no-i18n">` to `#set-lang` in `ui/index.html`.
3. Run the app, pick your language under *File → Settings* and click around. Text that stays Dutch is a missing
   key: copy the exact Dutch text into your table.

User content (video names, captions, file names, the video itself) is never translated.

### Checking your change

`npm test` runs the unit tests (`test/*.test.mjs`, Node's built-in runner, no extra dependencies) and
`npm run check` syntax-checks every script. `npm run test:ui` drives the editor in your installed Chrome or Edge
(`test/ui/`, through playwright-core; without either browser the tests are skipped). All three run automatically on
every pull request. Before opening a PR,
please:

- Run `npm run check` and `npm test`, and add a test when you change `src/` (look at the existing ones, they're short).
  Changed how the timeline or undo behaves? Run `npm run test:ui` too, and add a case there.
- Open the editor (`npm run serve` or `npm start`) and try what you changed, plus undo/redo.
- If you touched `src/template.mjs`, render a short video (the Render button) and look at the MP4, not only the
  preview.
- If you touched layouts or formats, check all formats with the buttons above the preview.
- For UI changes, add a screenshot or GIF to the PR.

## Reviews

A maintainer will look at your pull request, usually within a few days. We may suggest changes. That's normal,
and not a judgement. Once it's merged, you're a contributor and you'll be in the history of the project. 🎉

## Code of conduct

Be kind and assume good intent. This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Report
unacceptable behavior by opening a private
[security advisory](https://github.com/tinygusie2/motion-studio/security/advisories/new) or contacting the
maintainer on GitHub.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE), like the rest
of the project.
