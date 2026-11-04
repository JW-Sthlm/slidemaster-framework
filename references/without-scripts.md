# Working without scripts

Use this guide when you cannot run Node.js 22 or later, for example in a Copilot Cowork conversation without it. It gives the same checks, the same build and the same rehearsal comparison as the scripts in `scripts/`.

If you can run code in another language, such as Python, use it for the steps below instead of retyping files by hand. Never ask the presenter to install anything or to do these steps for you.

## Check a specification

Check the deck specification against `schema/deck-spec.schema.json`, then against the rules below. Fix every error before you build. Treat warnings as editorial prompts and raise them with the presenter.

Errors:

- Anything the schema rejects: a missing required field, a wrong type, an unknown property or an unsupported component.
- A `timing` that is not written like `2m`, `45s` or `1m30s`, or a `date` that is not `YYYY-MM-DD`.
- Two slides with the same ID, two chapters with the same ID, or the same key twice in one object.
- A chapter that lists a slide that does not exist, or a slide listed in two chapters.
- Chapter budgets that do not add up to `meta.durationMinutes`, when every chapter has a `budgetMinutes`.
- Any text that contains `</script`, `<!--`, an em dash (U+2014), a local file URL or a user-specific Windows path.
- A source URL that does not start with `http://` or `https://`.

Warnings:

- Slide timings that add up to more than 10 percent above or below `meta.durationMinutes`.
- A chapter whose slides take more than 10 percent longer than its budget.
- A heading longer than 90 characters or 12 words.
- More than 45 body words on a slide, counting the lead, the footer and every text in `data`.
- A first heading that starts with "About" or "Introduction to".
- A final slide that is neither a `close` slide nor an `action-list`.

## Build the deck and the storyboard

Make two files in the talk's folder: `deck.html` from `templates/deck.html` and `storyboard.html` from `templates/storyboard.html`. Start from the exact template text and make only these changes:

1. Replace the line `<link rel="stylesheet" href="../themes/clean.css">` with `<style data-theme-source="themes/THEME.css">`, the full text of `themes/THEME.css`, and `</style>`, where THEME is `meta.theme`.
2. Replace everything between `<script type="application/json" id="deck-spec">` and the next `</script>` with the specification as JSON. Write every `<` as `\u003c`, every `>` as `\u003e`, every `&` as `\u0026`, and the characters U+2028 and U+2029 as `\u2028` and `\u2029`, so no text can end the script element.
3. Replace the `<html ...>` start tag with `<html lang="LANGUAGE" data-theme="THEME">`, using `meta.language` and `meta.theme`. Escape both values for HTML: write `&` as `&amp;`, `<` as `&lt;`, `>` as `&gt;`, `"` as `&quot;` and `'` as `&#39;`. The schema allows almost any text in `meta.language`, so never skip this step.
4. Replace the text inside `<title>` with `meta.title` in the deck and `Storyboard: ` followed by `meta.title` in the storyboard, escaped the same way.
5. Delete the line `<!-- slidemaster:header -->`.

Keep the names `deck.html` and `storyboard.html`, and keep both files in the same folder: the storyboard's **Start a timed run** link opens `deck.html` in rehearse mode.

Before you hand the files over, confirm that each starts with `<!doctype html>`, contains no `../themes/` link and no `slidemaster:header` line, and that the JSON between the script tags reads back as the specification. Never edit the built files afterwards. Change the specification and build again.

## Compare a rehearsal with the plan

A saved run is a JSON file named `rehearsal-YYYYMMDD-HHMM.json`. It holds the deck title, `startedAt`, `totalSeconds` and a `slides` list in which each entry has `number`, `id`, `label`, `seconds` and `visits`.

1. Match each recorded slide to a slide in the specification by `id`, then by `label`, then by position. Mark slides that appear only in the run as "not in spec" and planned slides that never appear in the run as "not in recording".
2. Compare `totalSeconds` with `meta.durationMinutes` times 60. Compare each chapter's recorded seconds with its `budgetMinutes`, or with the sum of its slide timings when it has no budget. Compare each slide with its `timing`.
3. Add one row to the run table in `rehearsal-log.md`: the run number, the start date and time as `YYYY-MM-DD HH:MM`, the total, the slot, and how far over or under the slot it was, with the percentage. Leave the stumbles and changes for the presenter, and never change existing rows.
4. Tell the presenter in plain words: the total against the slot, the chapters over budget and the slides that ran longest against their timing.
