# Slidemaster Framework

Slidemaster helps you take a talk from a raw idea to a rehearsed presentation with an AI assistant. You talk the idea through and make the calls. The assistant does the research and the planning, builds the deck and a storyboard with the full script, and compares your timed rehearsals with the plan.

It is a skill for Copilot Cowork, GitHub Copilot CLI and GitHub Copilot in VS Code, and it works in any assistant that supports Agent Skills. You never need to run a command or edit a file yourself.

Live demo: https://jw-sthlm.github.io/slidemaster-framework/ is a 15-minute introduction to the framework and its eight stages. Open its storyboard for the full script, timing, and sources.

The repository stays generic, with no product branding, private content, personal writing profile, or environment-specific paths.

## Use it with your assistant

Add the skill once. Then start a conversation and say: "Help me prepare my next talk."

### Copilot Cowork

1. Download the skill package: [slidemaster-framework.zip](https://jw-sthlm.github.io/slidemaster-framework/slidemaster-framework.zip).
2. In Cowork, select **+** and **Customize**, then open the **Skills** tab.
3. Select the arrow next to **Add**, select **Upload skill**, and choose the file you downloaded.
4. When the skill shows up under **Your skills**, start a new conversation.

Cowork keeps the skill in your OneDrive. When your deck is ready, download the deck and the storyboard to the same folder and open the deck in your browser.

### GitHub Copilot CLI and GitHub Copilot in VS Code

Ask Copilot to install the skill for you:

```text
Install the Slidemaster skill: copy https://github.com/JW-Sthlm/slidemaster-framework into ~/.copilot/skills/slidemaster-framework
```

Then start a new session. Copilot CLI and GitHub Copilot in VS Code both read personal skills from that folder. In VS Code, use agent mode.

### Other assistants

The GitHub Copilot app and other assistants that support [Agent Skills](https://agentskills.io) use the same files. Unpack the skill package into a folder named `slidemaster-framework` in the assistant's skills folder, or ask the assistant to do it.

### What happens next

The assistant works out where your talk stands and runs the next stage with you, one question at a time. At every gate it stops for your call. It writes the talk into one file, checks it, and builds the deck and the storyboard from it. To change something, just say so. It updates the talk and builds again.

### Rehearse against the clock

Open the storyboard and select **Start a timed run**. The deck opens with a small timer that only you can see. Present out loud, then select **Save run** on the last slide. Give the saved file to your assistant. It compares every chapter and every slide with your plan and adds the run to your rehearsal log.

## The eight stages

| Stage | Purpose | What it leaves behind |
|---|---|---|
| 1. Idea | A thought worth testing | [stages/idea.md](stages/idea.md) |
| 2. Voice prompt | Talk it through, unedited | [stages/voice-prompt.md](stages/voice-prompt.md) |
| 3. Research | Facts and counterarguments | [stages/research.md](stages/research.md) |
| 4. Context | Your own decks and notes | [stages/context.md](stages/context.md) |
| 5. Planning | Audience, goal and time | [stages/plan.md](stages/plan.md) |
| 6. Outline | Most iterations | The full script, slide by slide, versioned |
| 7. Deck | Slide by slide | The deck and the storyboard |
| 8. Rehearsal | Until it sticks | [stages/rehearsal-log.md](stages/rehearsal-log.md) |

[SKILL.md](SKILL.md) describes how the assistant runs each stage and where it stops for your call.

## How it works

The talk lives in one file: a JSON deck specification with every slide, its timing, the speaker notes and the sources. The assistant checks that file against a schema and a set of editorial rules. Then it builds two self-contained HTML files from it, the deck you present and a storyboard with the full script and a running clock. Both work offline and from any folder, so you can mail them or open them on a plane.

Nobody edits the built slides by hand. To change the deck, the assistant changes the specification and builds again, which keeps the slides and the script in step.

In Copilot CLI and VS Code the assistant runs the scripts in `scripts/` with Node.js. When it cannot run Node.js, it follows [references/without-scripts.md](references/without-scripts.md) for the same checks, the same build and the same rehearsal comparison.

## What is included

- `SKILL.md`: the eight-stage workflow for AI assistants
- `references/without-scripts.md`: the checks, the build and the rehearsal comparison for assistants that cannot run Node.js
- `stages/`: templates for the artifact of each stage
- `schema/deck-spec.schema.json`: JSON Schema (draft 2020-12) for the deck specification
- `examples/deck-spec.example.json`: a complete generic example and the best starting point for your own deck
- `examples/framework-introduction.json`: the live demo, a talk about the framework itself
- `templates/deck.html`: the interactive presentation shell
- `templates/storyboard.html`: the planning and rehearsal view
- `themes/clean.css`: a starter theme that implements the theme contract
- `themes/theme-contract.md`: rules for portable themes
- `scripts/validate.mjs`: dependency-free validator
- `scripts/build.mjs`: builds a deck and a storyboard from a specification
- `scripts/rehearsal-report.mjs`: compares a rehearsal recording with the specification and can append the run to a rehearsal log
- `scripts/package-skill.mjs`: builds the skill package for Copilot Cowork
- `scripts/build-docs.mjs`: regenerates the GitHub Pages demo and the skill package in `docs/`
- `tests/`: smoke tests, validator probes, and browser render tests
- `docs/`: build output for GitHub Pages. Do not edit it by hand.

## For developers

The rest of this page is for people who want to run the scripts themselves, change the templates or contribute.

### Requirements

- Node.js 22 or later
- A modern browser
- Playwright, only for `npm run test:render`

### Quick start

```bash
git clone https://github.com/JW-Sthlm/slidemaster-framework.git
cd slidemaster-framework
npm test
npm run validate
npm run build -- examples/deck-spec.example.json --out dist/example
```

Open `dist/example/deck.html` and `dist/example/storyboard.html` in a browser. The build inlines the theme and the specification, so both files work offline and from any folder, without a web server.

### Create a deck by hand

1. Copy `examples/deck-spec.example.json`.
2. Edit the narrative, slide content, timing, and speaker notes.
3. Validate it: `node scripts/validate.mjs path/to/your-spec.json`
4. Build it: `node scripts/build.mjs path/to/your-spec.json --out dist/your-deck`
5. Open the deck at presentation size and review every slide. Rehearse with the storyboard, and time each run in [rehearsal mode](#rehearsal-mode).

The build stops when the specification has validation errors or when `themes/<meta.theme>.css` does not exist. Warnings are printed but do not stop it. Rebuild after every change to the specification instead of editing the built HTML. Git ignores `dist/`.

### Deck specification

The schema is the reference. In short:

- `meta` holds the title, subtitle, author, date (`YYYY-MM-DD`), language, theme, and `durationMinutes`.
- Optional `meta` fields are `audience`, `centralClaim`, `audienceAction` (what the audience should do after the talk), `version` (for example "outline v0.3"), and `chapters`.
- Each chapter has an `id`, a `label`, an optional `budgetMinutes`, and the IDs of its `slides`. When every chapter has a budget, the budgets must add up to `durationMinutes`.
- Each slide has an `id`, a `type` (`hero`, `standard`, `contrast`, or `close`), a `label`, an `act`, a `timing` such as `2m`, `45s`, or `1m30s`, `content`, and `notes` with `say` and an optional `do`. `energy` and `sources` (each with a `label` and an optional http or https `url`) are optional.
- `content.component` is one of `statement`, `stat-grid`, `card-grid`, `process`, `quote`, or `action-list`, and the schema defines the `data` for each component. A `process` keeps its steps in balanced rows: up to four in one row, five to eight in two. On phones it uses two columns.

The storyboard shows each slide's timing, the cumulative time, chapter totals against their budgets, and the sources under the notes. Notes and sources never appear in the deck.

### Deck controls

| Key | Action |
|---|---|
| Right arrow, Page Down, Space | Next slide |
| Left arrow, Page Up | Previous slide |
| Home | First slide |
| End | Last slide |
| Shift+S | Save the run, in rehearsal mode only |

Key presses with Alt, Ctrl, or Cmd are left to the browser. You can also use the on-screen arrows. Every slide has a URL hash, such as `deck.html#decision-loop`, so you can link straight to it. A hidden live region announces each change to screen readers, for example "Slide 2 of 5: Cost".

### Rehearsal mode

The storyboard's **Start a timed run** link opens the deck with `?rehearse`, for example `dist/my-deck/deck.html?rehearse`. You can also add the parameter yourself. A small badge shows the total time and the time on the current slide. Present as usual. When you finish, press Shift+S or select **Save run**, which appears on the last slide. The browser downloads `rehearsal-YYYYMMDD-HHMM.json` with the deck title, the start time, the total and the seconds per slide. Revisits add to a slide's time.

Compare the run with the plan:

```bash
node scripts/rehearsal-report.mjs rehearsal-20260115-0930.json --spec path/to/your-spec.json --log path/to/rehearsal-log.md
```

The report prints the total against `durationMinutes`, each chapter against its `budgetMinutes` and each slide against its `timing`. A chapter without a budget is compared with the sum of its slide timings. `--log` is optional: it adds the run to the run table of a log in the [stages/rehearsal-log.md](stages/rehearsal-log.md) format and leaves existing rows as they are.

Without `?rehearse`, the deck shows no badge and records nothing. Rehearsal mode works offline and sends nothing over the network. The badge does not move keyboard focus, and the recording stays in the page until you save it.

### Validation and tests

```bash
npm run validate      # validates both specifications in examples/
npm test              # smoke tests, no browser needed
npm run test:render   # browser tests, needs Playwright
```

`scripts/validate.mjs` checks a specification against the schema with a built-in evaluator, so it needs no packages. Then it applies the rules a schema cannot express.

- Errors: duplicate slide IDs, chapters that list missing slides, a slide in two chapters, chapter budgets that do not add up to `durationMinutes`, and text that contains `</script`, `<!--`, an em dash, a user-specific Windows path, or a local file URL.
- Warnings: slide timings more than 10 percent away from `durationMinutes`, a chapter more than 10 percent over its budget, headings longer than 90 characters or 12 words, more than 45 body words on a slide, an opening that reads like background, and a final slide without an audience action.

`npm test` runs `tests/smoke.mjs`, which checks the package structure, validates both specifications in `examples/` (the live demo must have no warnings), and validates the specifications embedded in `templates/` and `docs/`. It confirms that `docs/` matches a fresh build, byte for byte for the skill package. It checks that the skill package has `SKILL.md` at its root, stays within the Copilot Cowork limits, matches the repository files and includes every file the skill refers to. It also runs the validator probes in `tests/validator-cases.mjs`, the build unit tests and the rehearsal report tests, and scans every file for em dashes, user-specific paths, and local file URLs. No browser is involved.

`npm run test:render` runs `tests/render.mjs` in headless Chromium at 1920x1080 and 390x844. It builds the example, a deck with every component on every slide type, process lists of different lengths, injection specifications, and broken specifications, and checks the pages in `docs/` as well. Any of these fails the run: console or page errors, requests that leave the page, slide overflow, text below WCAG AA contrast, broken keyboard or hash navigation, or a dialog opened by specification text. It also checks that rehearsal mode records and saves a run, keeps its badge readable and clear of the controls, stays off without `?rehearse`, and starts from the storyboard's **Start a timed run** link. At the end it prints the tightest vertical slack per deck and viewport, so you can see how close a slide comes to overflowing on another system's fonts. Playwright is loaded from `PLAYWRIGHT_MODULE` or the `playwright` package. Without Playwright the test prints a notice and exits, unless `CI=true`, where it fails.

To run the render tests locally:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:render
```

CI runs on Node 24. It runs `npm test` and `npm run validate`, checks that `docs/` matches `npm run build:docs`, and then runs `npm run test:render`.

### Templates and themes

`templates/deck.html` and `templates/storyboard.html` link `../themes/clean.css` and embed a small sample specification, so you can open them in place while you change the shells. The build replaces the link with the theme CSS and the sample with your specification. It escapes `<`, `>`, and `&` in the JSON, so text in a specification cannot end the script block. In the storyboard it points the **Start a timed run** link at the deck file it writes.

If the embedded JSON cannot be read, or the deck cannot be displayed, the page shows an error panel that asks the presenter to have the assistant check the specification and build again. A slide with an unknown component or missing data shows a visible placeholder, and the other slides still work.

To add a theme, follow `themes/theme-contract.md`.

### Publishing the demo and the skill package

`docs/` is build output, made from `examples/framework-introduction.json` and the skill files. After you change that specification, a template, the theme, the schema, or any file in the skill package, run:

```bash
npm run build:docs
```

It writes `docs/index.html`, `docs/storyboard.html`, `docs/schema/deck-spec.schema.json`, which serves the schema at its `$id` URL, and `docs/slidemaster-framework.zip`, the package that Cowork users upload. CI fails when `docs/` is out of date.

The package holds `SKILL.md` at its root and the files listed in `SKILL_FILES` in `scripts/package-skill.mjs`. Cowork accepts at most 20 companion files and no hidden files, so tests, docs and dotfiles stay out. When the skill needs a new file, add it to that list. `npm run package` writes a copy to `dist/slidemaster-framework.zip`. The archive stores files uncompressed, with LF line endings and a fixed date, so every system builds the same bytes.

## Design principles

- One clear idea per slide
- Speaker notes contain the detail
- The specification is the source of truth
- Themes share the same design tokens
- Validation comes before visual review
- The final slide gives the audience a concrete action
- The presenter talks; the assistant does the technical work

## License

MIT
