---
name: slidemaster-framework
description: "Plan, build, review, and validate narrative-first HTML presentations from a portable JSON deck specification."
---

# Slidemaster Framework

Use this skill when the user asks to create, rebuild, audit, or improve a presentation.

The workflow works across Copilot Cowork, Microsoft Scout, and Copilot CLI when the runtime has comparable presentation capabilities. Tool names, browser access, file operations, and other runtime details may differ. Adapt the steps below to the capabilities available in the active runtime.

## Expected outputs

Produce:

1. A validated deck specification.
2. An interactive HTML deck.
3. A storyboard with timing and speaker notes.
4. A concise validation report.

## Workflow

### 1. Confirm the brief

Establish:

- audience
- duration
- one central claim
- desired audience action
- delivery format
- required evidence or source material

When the user has provided enough context, make reasonable assumptions and record them before building.

### 2. Build the narrative

Create an outline before writing any slide markup.

A useful default arc is:

1. Open with tension, evidence, or a specific problem.
2. State the central claim early.
3. Support the claim with examples or data.
4. Explain what the proof means for the audience.
5. Close with a concrete action.

Remove agenda slides, filler transitions, and generic closing slides unless the context calls for them.

### 3. Review the outline

Check:

- Can the central claim be repeated in one sentence?
- Does every slide support that claim?
- Is the slide count realistic for the duration?
- Does the opening create interest without relying on background exposition?
- Does the final slide tell the audience what to do?

Revise the outline before rendering anything.

### 4. Create the deck specification

Use `schema/deck-spec.schema.json` and start with `examples/deck-spec.example.json`.

Every slide should include:

- a unique kebab-case ID
- an act or section
- a clear heading
- one supported component
- timing
- speaker notes with `say` and optional `do`

Keep visible body text concise. Move explanations, caveats, and delivery cues into the speaker notes.

### 5. Validate

Run:

```bash
node scripts/validate.mjs path/to/deck-spec.json
```

Resolve validation errors before rendering. Density warnings are editorial prompts rather than formatting problems, so review the content instead of trying to squeeze it onto the slide.

### 6. Render

Copy the validated JSON into the `deck-spec` script block in:

- `templates/deck.html`
- `templates/storyboard.html`

Save project-specific copies of both files before editing the shells.

### 7. Review visually

Use browser or screenshot capabilities when they are available.

Check:

- no clipped or overflowing content
- readable type at the intended display size
- deliberate title wrapping
- consistent spacing and component treatment
- sufficient contrast
- keyboard navigation
- correct slide order and notes

If automated browser tools are unavailable, open both HTML files manually and run through the same checks.

### 8. Deliver

Report:

- files created
- validation results
- assumptions
- known limitations
- the presenter's next action

## Guardrails

- Do not invent facts, quotes, or metrics.
- Do not include private paths, credentials, internal links, or restricted material.
- Do not embed third-party branding unless the user supplied it and has the right to use it.
- Prefer system fonts and local assets to keep the output portable.
- Keep the JSON specification as the editable source of truth.