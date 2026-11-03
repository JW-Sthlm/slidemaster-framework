# Slidemaster Framework

Slidemaster Framework is a portable foundation for creating narrative-first HTML presentations with AI assistants.

You write the talk as a JSON deck specification. A validator checks it against the schema and a set of editorial rules, then the build turns it into two self-contained HTML files: an interactive deck and a storyboard for planning and rehearsal.

The repository remains generic, with no product branding, private content, personal writing profile, or environment-specific paths.

Live demo: https://jw-sthlm.github.io/slidemaster-framework/ (built from `examples/deck-spec.example.json`).

## What is included

- `SKILL.md`: portable workflow instructions for AI assistants that can work with files, a browser, and commands
- `schema/deck-spec.schema.json`: JSON Schema (draft 2020-12) for the deck specification
- `examples/deck-spec.example.json`: a complete generic example
- `templates/deck.html`: the interactive presentation shell
- `templates/storyboard.html`: the planning and rehearsal view
- `themes/clean.css`: a starter theme that implements the theme contract
- `themes/theme-contract.md`: rules for portable themes
- `scripts/validate.mjs`: dependency-free validator
- `scripts/build.mjs`: builds a deck and a storyboard from a specification
- `scripts/build-docs.mjs`: regenerates the GitHub Pages demo in `docs/`
- `tests/`: smoke tests, validator probes, and browser render tests
- `docs/`: build output for GitHub Pages. Do not edit it by hand.

## Requirements

- Node.js 22 or later
- A modern browser
- Playwright, only for `npm run test:render`

## Quick start

```bash
git clone https://github.com/JW-Sthlm/slidemaster-framework.git
cd slidemaster-framework
npm test
npm run validate
npm run build -- examples/deck-spec.example.json --out dist/example
```

Open `dist/example/deck.html` and `dist/example/storyboard.html` in a browser. The build inlines the theme and the specification, so both files work offline and from any folder, without a web server.

## Create your own deck

1. Copy `examples/deck-spec.example.json`.
2. Edit the narrative, slide content, timing, and speaker notes.
3. Validate it: `node scripts/validate.mjs path/to/your-spec.json`
4. Build it: `node scripts/build.mjs path/to/your-spec.json --out dist/your-deck`
5. Open the deck at presentation size and review every slide. Rehearse with the storyboard.

The build stops when the specification has validation errors or when `themes/<meta.theme>.css` does not exist. Warnings are printed but do not stop it. Rebuild after every change to the specification instead of editing the built HTML. Git ignores `dist/`.

## Workflow

A talk moves through eight stages. [SKILL.md](SKILL.md) describes how an AI assistant runs them, and [stages/](stages/) has the details for each artifact.

| Stage | Purpose | Artifact |
|---|---|---|
| 1. Idea | A thought worth testing | [stages/idea.md](stages/idea.md) |
| 2. Voice prompt | Talk it through, unedited | [stages/voice-prompt.md](stages/voice-prompt.md) |
| 3. Research | Facts and counterarguments | [stages/research.md](stages/research.md) |
| 4. Context | Your own decks and notes | [stages/context.md](stages/context.md) |
| 5. Planning | Audience, goal and time | [stages/plan.md](stages/plan.md) and deck spec `meta` |
| 6. Outline | Most iterations | Deck spec `slides` and `notes` |
| 7. Deck | Slide by slide | `scripts/build.mjs` output |
| 8. Rehearsal | Until it sticks | [stages/rehearsal-log.md](stages/rehearsal-log.md) |

## Deck specification

The schema is the reference. In short:

- `meta` holds the title, subtitle, author, date (`YYYY-MM-DD`), language, theme, and `durationMinutes`.
- Optional `meta` fields are `audience`, `centralClaim`, `audienceAction` (what the audience should do after the talk), `version` (for example "outline v0.3"), and `chapters`.
- Each chapter has an `id`, a `label`, an optional `budgetMinutes`, and the IDs of its `slides`. When every chapter has a budget, the budgets must add up to `durationMinutes`.
- Each slide has an `id`, a `type` (`hero`, `standard`, `contrast`, or `close`), a `label`, an `act`, a `timing` such as `2m`, `45s`, or `1m30s`, `content`, and `notes` with `say` and an optional `do`. `energy` and `sources` (each with a `label` and an optional http or https `url`) are optional.
- `content.component` is one of `statement`, `stat-grid`, `card-grid`, `process`, `quote`, or `action-list`, and the schema defines the `data` for each component.

The storyboard shows each slide's timing, the cumulative time, chapter totals against their budgets, and the sources under the notes. Notes and sources never appear in the deck.

## Deck controls

| Key | Action |
|---|---|
| Right arrow, Page Down, Space | Next slide |
| Left arrow, Page Up | Previous slide |
| Home | First slide |
| End | Last slide |

Key presses with Alt, Ctrl, or Cmd are left to the browser. You can also use the on-screen arrows. Every slide has a URL hash, such as `deck.html#decision-loop`, so you can link straight to it. A hidden live region announces each change to screen readers, for example "Slide 2 of 5: Cost".

## Validation and tests

```bash
npm run validate      # validates examples/deck-spec.example.json
npm test              # smoke tests, no browser needed
npm run test:render   # browser tests, needs Playwright
```

`scripts/validate.mjs` checks a specification against the schema with a built-in evaluator, so it needs no packages. Then it applies the rules a schema cannot express.

- Errors: duplicate slide IDs, chapters that list missing slides, a slide in two chapters, chapter budgets that do not add up to `durationMinutes`, and text that contains `</script`, `<!--`, an em dash, a user-specific Windows path, or a local file URL.
- Warnings: slide timings more than 10 percent away from `durationMinutes`, a chapter more than 10 percent over its budget, headings longer than 90 characters or 12 words, more than 45 body words on a slide, an opening that reads like background, and a final slide without an audience action.

`npm test` runs `tests/smoke.mjs`, which checks the package structure and validates the example and the specifications embedded in `templates/` and `docs/`. It also confirms that `docs/` matches a fresh build, runs the validator probes in `tests/validator-cases.mjs` and the build unit tests, and scans every file for em dashes, user-specific paths, and local file URLs. No browser is involved.

`npm run test:render` runs `tests/render.mjs` in headless Chromium at 1920x1080 and 390x844. It builds the example, a deck with every component on every slide type, injection specifications, and broken specifications, and checks the pages in `docs/` as well. Any of these fails the run: console or page errors, requests that leave the page, slide overflow, text below WCAG AA contrast, broken keyboard or hash navigation, or a dialog opened by specification text. Playwright is loaded from `PLAYWRIGHT_MODULE` or the `playwright` package. Without Playwright the test prints a notice and exits, unless `CI=true`, where it fails.

To run the render tests locally:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:render
```

CI runs on Node 24. It runs `npm test` and `npm run validate`, checks that `docs/` matches `npm run build:docs`, and then runs `npm run test:render`.

## Templates and themes

`templates/deck.html` and `templates/storyboard.html` link `../themes/clean.css` and embed a small sample specification, so you can open them in place while you change the shells. The build replaces the link with the theme CSS and the sample with your specification. It escapes `<`, `>`, and `&` in the JSON, so text in a specification cannot end the script block.

If the embedded JSON cannot be read, or the deck cannot be displayed, the page shows an error panel that points to the validator. A slide with an unknown component or missing data shows a visible placeholder, and the other slides still work.

To add a theme, follow `themes/theme-contract.md`.

## Publishing the demo

`docs/` is build output. After you change the example, a template, the theme, or the schema, run:

```bash
npm run build:docs
```

It writes `docs/index.html`, `docs/storyboard.html`, and `docs/schema/deck-spec.schema.json`, which serves the schema at its `$id` URL. CI fails when `docs/` is out of date.

## Use with AI assistants

`SKILL.md` describes the eight-stage workflow, from the first idea to a rehearsed talk. It works with Copilot Cowork, Microsoft Scout, and Copilot CLI when the runtime provides the required file, browser, and command capabilities.

Tool names and execution models vary between runtimes. Use the skill as workflow guidance, then map each step to the tools available in your environment.

## Design principles

- One clear idea per slide
- Speaker notes contain the detail
- The specification is the source of truth
- Themes share the same design tokens
- Validation comes before visual review
- The final slide gives the audience a concrete action

## License

MIT
