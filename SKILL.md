---
name: slidemaster-framework
description: "Helps a presenter take a talk from a raw idea to a rehearsed presentation in six stages: the idea as a voice prompt, research, planning, outline, deck and rehearsal. Use when someone wants to prepare, write, build, review or rehearse a talk, keynote, workshop or presentation, or says 'help me prepare my next talk'. Builds a narrative-first deck and a storyboard with the full script and timing, and compares timed rehearsal runs with the plan."
---

# Slidemaster Framework

Use this skill when someone wants to prepare, create, rebuild, audit or rehearse a presentation.

The presenter owns the idea, the claims and the final words. You capture, research, plan, build, check and help rehearse.

## Work in the conversation

The presenter talks to you. You do all the technical work.

- Create, read and update every file yourself: the stage files, the deck specification and the built deck.
- Never ask the presenter to run a command, install anything, or edit JSON, HTML or Markdown by hand. When something needs to change, they tell you and you change it.
- Talk about the talk, not the tooling. Say "the outline" or "the deck" rather than naming file formats, scripts or paths, unless the presenter asks.
- Show drafts as readable text: headings, timing and what the presenter will say. Never paste the raw specification into the conversation.
- Keep each talk in its own folder, named after the talk, with the stage files, the specification and the built files together.
- When a deck is ready, hand over the deck and the storyboard together, in the same folder, and tell the presenter to open the deck in their browser.

## Where this runs

The stages are the same everywhere. Only the tools differ.

| Assistant | Where the talk lives | Checks, build and rehearsal report |
|---|---|---|
| GitHub Copilot CLI, GitHub Copilot in VS Code, the GitHub Copilot app | A folder in the presenter's workspace | Run the scripts in `scripts/` with Node.js 22 or later |
| Copilot Cowork | The conversation's output folder in OneDrive | Run the scripts when Node.js is available, otherwise follow `references/without-scripts.md` |
| Any other assistant that supports Agent Skills | Its working folder | The same: the scripts, or `references/without-scripts.md` |

Paths in this skill are relative to the folder that holds this `SKILL.md`. If you cannot run Node.js, use `references/without-scripts.md` for the same checks, the build and the rehearsal comparison. Never send the presenter off to install Node.js or anything else.

In Copilot Cowork, offer both built files for download. If the preview does not show the slides, the presenter downloads both files to one folder and opens the deck in a browser.

## The six stages

| # | Stage | Purpose | Artifact | Exit gate |
|---|---|---|---|---|
| 1 | Idea | Talked in, unedited, with the audience and the event | `idea.md` | Verbatim voice prompt saved, and the presenter confirms the extraction keeps their meaning |
| 2 | Research | Facts, counterarguments and your own material | `research.md` | Every core claim sourced or flagged, each with its strongest counterargument, and the reuse list agreed |
| 3 | Planning | Goal, structure and time | `plan.md` and the spec's `meta` | Chapter budgets add up to the talk time |
| 4 | Outline ↻ | Most iterations | Spec slides with timing and notes, versioned | The checks pass and the presenter approves a version |
| 5 | Deck ↻ | Slide by slide | The deck and the storyboard | Visual review passes and the presenter approves each chapter |
| 6 | Rehearsal | Until it sticks | `rehearsal-log.md` | Two runs in a row land within the slot |

Templates for every artifact live in `stages/`. Copy them into the talk's own folder and fill them in from the conversation.

Stages run in order, and any stage can send work back: research can change the plan, and a rehearsal can change the outline. Outline and Deck are loops, so expect many rounds and never cap the rounds the presenter drives.

Start by finding where the talk stands. If stage files exist, read them and continue from the first open gate. If nothing exists yet, start with the idea. A talk started with the earlier eight-stage version may also have `voice-prompt.md` and `context.md`: read them as part of the idea and the research, and leave them in place.

### 1. Idea

The idea arrives as a voice prompt. Ask the presenter to talk about it as it comes, out loud and unedited, by dictation or as a typed stream of thought. It is the idea, not a run-through of the talk, so never ask for chapters, slides or a walk-through at this stage. Ask them to say in the same take who the audience is, what kind of event it is, how long the slot is and which language the talk is in. When the idea already came up in the conversation, as dictated messages or a request and the replies to your questions, that is the voice prompt: use it as it is.

Save the transcript verbatim in `idea.md` under a dated heading. Never correct its grammar, spelling, order or wording, and give later rounds their own dated sections. Below it, extract the thought to test, the audience and event facts, the claims, stories, examples, numbers to check and open questions, each anchored with a short quote. When the audience, the event or the slot is missing, ask, one question at a time and at most three.

Never sharpen, reframe or improve the idea. Questions are allowed. Rewrites are not.

### 2. Research

For each core claim, record what holds with source and date, the strongest counterargument, the real numbers, and a verdict: holds, narrow it or drop it. Research claims in parallel when the runtime allows it.

Then search the presenter's own material: earlier decks, talks, notes, demos and stories. List what can be reused in `research.md`, with a link and a decision for each item: reuse, adapt or leave. Reuse beats rebuilding.

End with at most three questions for the presenter. Do not write hooks, angles or new wording for the presenter's claims. Keep restricted sources out of anything that will be shared.

### 3. Planning

Start from the audience and the event in the idea. Confirm them with the presenter and fill the gaps, then agree on:

- the audience: who they are, what they believe and what they doubt
- the goal: one action the audience should take (`meta.audienceAction`)
- the central claim in one sentence (`meta.centralClaim`)
- language and talk time (`meta.durationMinutes`)
- the structure: chapters with minute budgets that add up to the talk time (`meta.chapters`)
- demos and audience moments

### 4. Outline ↻

Turn the plan into slides in the deck specification. Start from `examples/deck-spec.example.json` and the schema in `schema/deck-spec.schema.json`. Every slide needs a unique kebab-case ID, an act, one clear heading, one supported component, timing, and speaker notes with `say` and an optional `do`. Add `sources` to slides that make factual claims.

A useful default arc:

1. Open with tension: a problem, a story, a surprising fact or a real question.
2. State the central claim early.
3. Support it with examples or data, and meet the strongest counterargument.
4. Explain what the proof means for the audience.
5. Close with the concrete action.

Check every version yourself, before the presenter sees it:

```bash
node scripts/validate.mjs path/to/deck-spec.json
```

Without Node.js, apply the checks in `references/without-scripts.md`. Fix errors before going further. Treat warnings about density, long headings or timing against the slot as editorial prompts: raise them with the presenter, then cut content or move detail into the notes. Review each version with the presenter and record it in `meta.version`, for example `outline v0.3`. Keep earlier versions so any round can be rolled back.

Before the presenter approves a version, check:

- Can the central claim be repeated in one sentence?
- Does every slide support it?
- Do the slide timings add up to the talk time?
- Does the opening create interest without background exposition?
- Does the final slide tell the audience what to do?

### 5. Deck ↻

Build the deck and the storyboard from the approved spec:

```bash
node scripts/build.mjs path/to/deck-spec.json --out path/to/talk-folder
```

Without Node.js, build both files as described in `references/without-scripts.md`. The build checks the spec, embeds it safely and inlines the theme, so the output works offline from any folder. Never hand-edit the built HTML; change the spec and build again.

Review visually after every build. With browser automation, check every slide at presentation size for clipped or overflowing content, readable type, deliberate title wrapping, consistent spacing, contrast, keyboard navigation and correct notes. Without it, walk through the same list with the presenter. Then polish slide by slide, or chapter by chapter, with the presenter. Keep a copy of each reviewed draft.

### 6. Rehearsal

Rehearse with the storyboard. It shows every slide with its notes, its timing and the running clock.

To time a run, the presenter opens the storyboard and selects **Start a timed run**. The deck opens with a small timer that only the presenter sees. They present out loud, then select **Save run** on the last slide (Shift+S also works). The browser saves a file named `rehearsal-YYYYMMDD-HHMM.json`, usually in Downloads. Ask the presenter to give you that file, then compare it with the plan:

```bash
node scripts/rehearsal-report.mjs path/to/rehearsal.json --spec path/to/deck-spec.json --log path/to/rehearsal-log.md
```

Without Node.js, compare the run as described in `references/without-scripts.md`. Tell the presenter the result in plain words: the total against the slot, the chapters that ran over and the slides that took longest against their timing. Log the stumbles and the changes they decide in `rehearsal-log.md`, update the spec, rebuild and run again.

The talk is ready when two runs in a row land within the slot and the presenter says it sticks.

## Deliver

Report in plain language:

- what changed in the talk, and where the presenter can open it
- what the checks and the review found
- assumptions and open questions
- the presenter's next action

## Guardrails

- Never invent facts, quotes, people or metrics. A number on a slide is sourced, labelled as an example, or cut.
- Never rewrite the presenter's idea or voice prompt.
- Never ask the presenter to run commands, install software or edit files by hand.
- Keep private paths, credentials, internal links and restricted material out of shared files.
- Do not embed third-party branding unless the presenter supplied it and has the right to use it.
- Prefer system fonts and local assets so the output stays portable.
- Keep the JSON specification as the editable source of truth.
