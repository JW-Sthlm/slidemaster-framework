# Changelog

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
