# Changelog

## 1.2.1 - 2026-11-03

### Added

- `examples/framework-introduction.json`: a 15-minute talk about the framework itself, covering why it exists, how it works, the eight stages, and how to start, with speaker notes and sources. The live demo in `docs/` is now built from it. `npm run validate` and the smoke test check it, and the smoke test requires zero warnings.

### Changed

- Process steps fill balanced rows. Up to four steps share one row, five to eight split over two rows, and longer lists use rows of four. On phones the steps use two columns with tighter spacing, and an odd last step spans the row.
- Action lists on left-aligned slides (`standard` and `contrast`) align left instead of sitting centered.

## 1.2.0 - 2026-11-03

### Added

- Rehearsal mode. Open a built deck with `?rehearse` and a small badge shows the total time and the time on the current slide. Shift+S saves `rehearsal-YYYYMMDD-HHMM.json` with the deck title, start time, total and seconds per slide, where revisits add up. The last slide offers a Save run button. Without the parameter nothing changes. The mode works offline, keeps Alt, Ctrl and Meta shortcuts for the browser, and its badge meets WCAG AA contrast without moving keyboard focus.
- `scripts/rehearsal-report.mjs` compares a recording with the specification: the total against `durationMinutes`, chapters against `budgetMinutes` (or the sum of their slide timings) and slides against `timing`. `--log` appends the run to a log in the `stages/rehearsal-log.md` format and never changes existing rows.
- `tests/render.mjs` checks rehearsal mode and prints the tightest vertical slack per deck and viewport. `tests/smoke.mjs` covers the report and the log append.

### Changed

- `stages/rehearsal-log.md` explains how to time a run, and its run table starts empty, so the first appended run becomes row 1.
- `SKILL.md` stage 8 and the README describe rehearsal mode.

### Fixed

- `npm run test:render` failed on Linux CI: the `cost-of-ambiguity` slide overflowed at 390x844 in the example and docs decks, because wider fallback fonts wrapped the heading onto one more line. On narrow screens, headings, leads and stat values now have smaller minimum sizes, slide padding and component spacing are tighter, and stat grids keep short stats side by side instead of stacking 13rem cards. Locally every slide of the example and the docs pages now keeps more than 200 pixels of vertical headroom at 390x844.

## 1.1.0 - 2026-11-03

### Added

- `SKILL.md` runs an eight-stage workflow from first idea to rehearsed talk: idea, voice prompt, research, context, planning, outline, deck and rehearsal. Each stage has an artifact and an exit gate, and `stages/` holds templates for the artifacts.
- `scripts/build.mjs` builds a self-contained deck and storyboard from a specification. It validates first, inlines `themes/<meta.theme>.css`, and embeds the JSON with `<`, `>`, `&`, U+2028, and U+2029 escaped.
- `npm run build:docs` regenerates the GitHub Pages demo from the example and publishes the schema at its `$id` URL.
- Optional specification fields: `meta.audienceAction`, `meta.version`, `meta.chapters` with time budgets, and `slides[].sources`.
- The storyboard shows cumulative time, chapter totals against budget, the central claim and audience action, and sources under the notes.
- The deck announces "Slide N of M: label" through a hidden live region.
- `tests/render.mjs` (`npm run test:render`) checks the built pages in headless Chromium for errors, overflow, contrast, keyboard navigation, and script injection.
- `tests/validator-cases.mjs` holds validator probes for valid and invalid specifications.

### Changed

- `scripts/validate.mjs` enforces the schema itself with a dependency-free evaluator, then applies the rules a schema cannot express. The validator and the schema now give the same answer.
- Component data rules live in the schema (`allOf` with `if` and `then` per component). Unknown properties are rejected at every level.
- Stricter rules: timing cannot be empty, required text such as headings and the subtitle must contain non-whitespace characters, dates must be real calendar dates, and source URLs must use http or https.
- New errors: text that contains `</script` or `<!--`.
- New warnings: slide timings more than 10 percent away from `durationMinutes`, chapters more than 10 percent over budget, and headings longer than 90 characters or 12 words.
- `docs/` is build output generated from `examples/deck-spec.example.json`. Its Storyboard and Repository links stay visible at every width.
- The storyboard uses the theme tokens, and themes may define `--color-danger`.
- Slide elements use `slide-<id>` element IDs. Links such as `deck.html#<id>` still work.
- Node.js 22 or later is required. CI uses Node 24, `actions/checkout@v5`, and `actions/setup-node@v5`.

### Fixed

- Specification text containing `</script>` could end the embedded JSON block and run script in the page.
- Statement text and card headings were invisible on contrast slides.
- Three texts failed WCAG AA contrast: the storyboard subtitle, the storyboard timing tags, and footers on contrast slides.
- Long words and URLs overflowed slides and were clipped in the storyboard.
- Malformed JSON or a single bad slide left a blank page. Both shells now show an error panel, and unknown components show a placeholder.
- A slide with the ID `next` or `previous` broke the on-screen controls.
- Alt, Ctrl, and Meta shortcuts, such as Alt+Left for Back, changed slides instead of reaching the browser.
- Space on a focused control now advances exactly once in every browser.
- The validator crashed on some wrong types instead of reporting them.
- The README said the smoke test ran the HTML shells. It did not.

## 1.0.0 - 2026-09-08

- First public release with the deck specification schema and example, the interactive deck and storyboard shells, the clean theme and theme contract, the dependency-free validator, a smoke test, CI, and the GitHub Pages demo.
