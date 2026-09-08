# Slidemaster Framework

Slidemaster Framework is a portable foundation for creating narrative-first HTML presentations with AI assistants.

It combines a structured deck specification with two browser-based presentation shells, a theme contract, and local validation. The repository remains generic, with no product branding, private content, personal writing profile, or environment-specific paths.

## What is included

- `SKILL.md`: portable instructions for presentation-capable AI runtimes
- `schema/deck-spec.schema.json`: JSON Schema for the deck specification
- `examples/deck-spec.example.json`: a complete generic example
- `templates/deck.html`: an interactive 16:9 presentation shell
- `templates/storyboard.html`: a planning and rehearsal view
- `themes/clean.css`: a starter theme that implements the theme contract
- `themes/theme-contract.md`: rules for portable themes
- `scripts/validate.mjs`: dependency-free deck specification validator
- `tests/smoke.mjs`: repository and runtime smoke checks
- `docs/`: a working GitHub Pages demo

## Quick start

Requirements:

- Node.js 20 or later
- A modern browser

```bash
git clone https://github.com/JW-Sthlm/slidemaster-framework.git
cd slidemaster-framework
npm test
npm run validate
```

Open `templates/deck.html` or `templates/storyboard.html` directly in a browser. Both files contain an embedded example specification, so you do not need a web server or build step.

To create your own deck:

1. Copy `examples/deck-spec.example.json`.
2. Edit the narrative, slide content, timing, and speaker notes.
3. Run `node scripts/validate.mjs path/to/your-spec.json`.
4. Copy the JSON into the `deck-spec` script block in either HTML shell.
5. Open the HTML file and review every slide at presentation size.

## Deck controls

| Key | Action |
|---|---|
| Right arrow, Page Down, Space | Next slide |
| Left arrow, Page Up | Previous slide |
| Home | First slide |
| End | Last slide |

You can also navigate with the on-screen controls or URL hashes.

## Use with AI assistants

`SKILL.md` describes the full presentation workflow, covering the brief, outline, review, specification, build, and validation. It works with Copilot Cowork, Microsoft Scout, and Copilot CLI when the runtime provides the required file, browser, and command capabilities.

Tool names and execution models vary between runtimes. Use the skill as workflow guidance, then map each step to the tools available in your environment.

## Design principles

- One clear idea per slide
- Speaker notes contain the detail
- The specification is the source of truth
- Themes share the same design tokens
- Validation comes before visual review
- The final slide gives the audience a concrete action

## Validation

```bash
npm run validate
npm test
```

The validator checks required fields, unique slide IDs, component data, timing formats, notes coverage, local file references, and body text density. The smoke test checks the public package structure and runs both HTML shells.

## License

MIT