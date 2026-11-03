---
name: slidemaster-framework
description: "Take a talk from a raw idea to a rehearsed presentation in eight stages: idea, voice prompt, research, context, planning, outline, deck and rehearsal. Builds narrative-first HTML decks and storyboards from a portable JSON deck specification."
---

# Slidemaster Framework

Use this skill when someone wants to create, rebuild, audit or rehearse a presentation.

The presenter owns the idea, the claims and the final words. You capture, research, plan, build, check and help rehearse. This works in Copilot CLI, Copilot Cowork, Microsoft Scout or any runtime with file and command access, ideally with a browser too, so map each step to the tools you have.

## The eight stages

| # | Stage | Purpose | Artifact | Exit gate |
|---|---|---|---|---|
| 1 | Idea | A thought worth testing | `idea.md` | The presenter confirms it in their own words |
| 2 | Voice prompt | Talk it through, unedited | `voice-prompt.md` | Verbatim transcript saved, extraction confirmed |
| 3 | Research | Facts and counterarguments | `research.md` | Every core claim sourced or flagged, each with its strongest counterargument |
| 4 | Context | Your own decks and notes | `context.md` | Reuse list agreed |
| 5 | Planning | Audience, goal and time | `plan.md` and the spec's `meta` | Chapter budgets add up to the talk time |
| 6 | Outline ↻ | Most iterations | Spec slides with timing and notes, versioned | The validator passes and the presenter approves a version |
| 7 | Deck ↻ | Slide by slide | `scripts/build.mjs` output | Visual review passes and the presenter approves each chapter |
| 8 | Rehearsal | Until it sticks | `rehearsal-log.md` | Two runs in a row land within the slot |

Templates for every artifact live in `stages/`. Copy them into the talk's own folder.

Stages run in order, and any stage can send work back: research can change the plan, and a rehearsal can change the outline. Outline and Deck are loops, so expect many rounds and never cap the rounds the presenter drives.

Start by finding where the talk stands. If stage files exist, read them and continue from the first open gate.

### 1. Idea

Write down the thought the presenter wants to test, why it matters now, and the event facts already known: event, date, slot, language and audience. Ask questions when the idea is unclear, but do not sharpen, reframe or improve it.

### 2. Voice prompt

Ask the presenter to talk the idea through without editing, by dictation or as a typed stream. Save the transcript verbatim. Below it, list the claims, stories, examples, numbers to check and open questions, each anchored with a short quote. The transcript is the presenter's raw thinking: never correct or summarize it in place.

### 3. Research

For each core claim, record what holds with source and date, the strongest counterargument, the real numbers, and a verdict: holds, narrow it or drop it. End with at most three questions for the presenter. Research claims in parallel when the runtime allows it.

Do not write hooks, angles or new wording for the presenter's claims. Keep restricted sources out of anything that will be shared.

### 4. Context

Search the presenter's own material: earlier decks, talks, notes, demos and stories. List what can be reused, with a link and a decision for each item: reuse, adapt or leave. Reuse beats rebuilding.

### 5. Planning

Agree on:

- the audience: who they are, what they believe and what they doubt
- the goal: one action the audience should take (`meta.audienceAction`)
- the central claim in one sentence (`meta.centralClaim`)
- language and talk time (`meta.durationMinutes`)
- chapters with minute budgets that add up to the talk time (`meta.chapters`)
- demos and audience moments

### 6. Outline ↻

Turn the plan into slides in the deck specification. Start from `examples/deck-spec.example.json` and the schema in `schema/deck-spec.schema.json`. Every slide needs a unique kebab-case ID, an act, one clear heading, one supported component, timing, and speaker notes with `say` and an optional `do`. Add `sources` to slides that make factual claims.

A useful default arc:

1. Open with tension: a problem, a story, a surprising fact or a real question.
2. State the central claim early.
3. Support it with examples or data, and meet the strongest counterargument.
4. Explain what the proof means for the audience.
5. Close with the concrete action.

Validate every version:

```bash
node scripts/validate.mjs path/to/deck-spec.json
```

Fix errors before going further. Treat warnings about density, long headings or timing against the slot as editorial prompts: cut content or move detail into the notes. Review each version with the presenter and record it in `meta.version`, for example `outline v0.3`. Keep earlier versions so any round can be rolled back.

Before the presenter approves a version, check:

- Can the central claim be repeated in one sentence?
- Does every slide support it?
- Do the slide timings add up to the talk time?
- Does the opening create interest without background exposition?
- Does the final slide tell the audience what to do?

### 7. Deck ↻

Build the deck and the storyboard from the approved spec:

```bash
node scripts/build.mjs path/to/deck-spec.json --out path/to/output
```

The build validates the spec, embeds it safely and inlines the theme, so the output works offline from any folder. Never hand-edit the generated HTML; change the spec and rebuild instead.

Review visually after every build. With browser automation, check every slide at presentation size for clipped or overflowing content, readable type, deliberate title wrapping, consistent spacing, contrast, keyboard navigation and correct notes. Without it, open the files and run through the same list. Then polish slide by slide, or chapter by chapter, with the presenter. Keep a copy of each reviewed draft.

### 8. Rehearsal

Rehearse with the storyboard. It shows every slide with its notes, its timing and the running clock. After each run, log the date, total time against the slot, chapter times against their budgets, stumbles and the changes decided in `rehearsal-log.md`. Turn the log into cuts and shorter notes, update the spec, rebuild and run again.

The talk is ready when two runs in a row land within the slot and the presenter says it sticks.

## Deliver

Report:

- files created or changed
- validation and review results
- assumptions and open questions
- the presenter's next action

## Guardrails

- Never invent facts, quotes, people or metrics. A number on a slide is sourced, labelled as an example, or cut.
- Never rewrite the presenter's idea or voice prompt.
- Keep private paths, credentials, internal links and restricted material out of shared files.
- Do not embed third-party branding unless the presenter supplied it and has the right to use it.
- Prefer system fonts and local assets so the output stays portable.
- Keep the JSON specification as the editable source of truth.
