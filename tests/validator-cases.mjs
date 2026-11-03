// Validator probes. Each case mutates a copy of the example; an empty `errors` list means the result must be valid.
const emDash = String.fromCharCode(0x2014);
const windowsPath = ["C:", "Users", "someone", "talk.json"].join("\\");
const fileLink = ["file", "://", "/home/someone/talk.json"].join("");

const dropNewFields = spec => {
  delete spec.meta.version;
  delete spec.meta.audienceAction;
  delete spec.meta.chapters;
  spec.slides.forEach(slide => delete slide.sources);
};

export const cases = [
  { name: "example is valid without warnings", mutate: () => {}, noWarnings: true },
  { name: "1.0.0 shape without the new optional fields stays valid", mutate: dropNewFields, noWarnings: true },
  { name: "$schema reference is allowed", mutate: s => { s.$schema = "../schema/deck-spec.schema.json"; } },

  { name: "unknown root property", mutate: s => { s.extra = 1; }, errors: [/^\$\.extra: unknown property/] },
  { name: "unknown meta property", mutate: s => { s.meta.themeVariant = "x"; }, errors: [/^\$\.meta\.themeVariant: unknown property/] },
  { name: "unknown slide property", mutate: s => { s.slides[0].transition = "fade"; }, errors: [/^\$\.slides\[0\]\.transition: unknown property/] },
  {
    name: "typo in content property",
    mutate: s => { s.slides[1].content.lede = s.slides[1].content.lead; delete s.slides[1].content.lead; },
    errors: [/content\.lede: unknown property/]
  },
  { name: "unknown notes property", mutate: s => { s.slides[0].notes.cue = "x"; }, errors: [/notes\.cue: unknown property/] },
  { name: "unknown component data property", mutate: s => { s.slides[0].content.data.extra = "x"; }, errors: [/data\.extra: unknown property/] },
  { name: "inherited property name such as constructor", mutate: s => { s.meta.constructor = "x"; }, errors: [/meta\.constructor: unknown property/] },

  { name: "timing empty", mutate: s => { s.slides[0].timing = ""; }, errors: [/slides\[0\]\.timing: use values such as/] },
  { name: "timing 0m", mutate: s => { s.slides[0].timing = "0m"; }, errors: [/slides\[0\]\.timing: use values such as/] },
  { name: "timing 45s", mutate: s => { s.slides[0].timing = "45s"; }, noWarnings: true },
  { name: "timing 1m90s is accepted", mutate: s => { s.slides[0].timing = "1m90s"; }, warnings: [/slide timings add up to 13m30s, 13% over/] },

  { name: "date is not a date", mutate: s => { s.meta.date = "next Tuesday"; }, errors: [/meta\.date: use the YYYY-MM-DD format/] },
  { name: "date out of range", mutate: s => { s.meta.date = "2026-13-45"; }, errors: [/meta\.date: use a real calendar date/] },
  { name: "date 29 February in a common year", mutate: s => { s.meta.date = "2026-02-29"; }, errors: [/meta\.date: use a real calendar date/] },
  { name: "date 29 February in a leap year", mutate: s => { s.meta.date = "2028-02-29"; } },

  { name: "notes.do missing", mutate: s => { delete s.slides[0].notes.do; } },
  { name: "notes.do wrong type", mutate: s => { s.slides[0].notes.do = 5; }, errors: [/notes\.do: expected string, got integer/] },
  { name: "notes missing", mutate: s => { delete s.slides[0].notes; }, errors: [/slides\[0\]\.notes: required/] },

  {
    name: "duration far from slide timings",
    mutate: s => { delete s.meta.chapters; s.meta.durationMinutes = 1; },
    warnings: [/slide timings add up to 12m, 1100% over the planned 1 minutes/]
  },
  { name: "duration within 10 percent", mutate: s => { delete s.meta.chapters; s.meta.durationMinutes = 13; }, noWarnings: true },
  { name: "duration zero", mutate: s => { s.meta.durationMinutes = 0; }, errors: [/durationMinutes: must be at least 1/] },
  { name: "duration not an integer", mutate: s => { s.meta.durationMinutes = 1.5; }, errors: [/durationMinutes: expected integer, got number/] },

  { name: "duplicate slide ids", mutate: s => { s.slides[1].id = s.slides[0].id; }, errors: [/slides\[1\]\.id: duplicate ID "opening"/] },
  { name: "slide id not kebab-case", mutate: s => { s.slides[0].id = "Opening Slide"; }, errors: [/slides\[0\]\.id: use a kebab-case ID/] },
  {
    name: "slide id that matches a control id",
    mutate: s => { s.slides[4].id = "next"; s.meta.chapters[2].slides = ["next"]; }
  },

  { name: "subtitle empty", mutate: s => { s.meta.subtitle = ""; }, errors: [/meta\.subtitle: must contain text/] },
  { name: "subtitle whitespace", mutate: s => { s.meta.subtitle = "   "; }, errors: [/meta\.subtitle: must contain text/] },
  { name: "language too short", mutate: s => { s.meta.language = "e"; }, errors: [/meta\.language: must be at least 2 characters/] },
  { name: "theme with spaces", mutate: s => { s.meta.theme = "Clean Theme"; }, errors: [/meta\.theme: use lowercase letters/] },
  { name: "theme without a file is valid here and fails in the build", mutate: s => { s.meta.theme = "dark"; } },
  { name: "energy empty", mutate: s => { s.slides[0].energy = ""; }, errors: [/slides\[0\]\.energy: "" is not one of/] },

  { name: "stat-grid with empty data", mutate: s => { s.slides[1].content.data = {}; }, errors: [/slides\[1\]\.content\.data\.items: required/] },
  { name: "stat-grid item without label", mutate: s => { delete s.slides[1].content.data.items[0].label; }, errors: [/items\[0\]\.label: required/] },
  { name: "process with one step", mutate: s => { s.slides[2].content.data.steps = ["Only"]; }, errors: [/data\.steps: needs at least 2 items/] },
  { name: "card-grid without items", mutate: s => { s.slides[3].content.data.items = []; }, errors: [/data\.items: needs at least 1 item$/] },
  { name: "action-list with blank item", mutate: s => { s.slides[4].content.data.items[0] = " "; }, errors: [/data\.items\[0\]: must contain text/] },
  {
    name: "quote without attribution",
    mutate: s => { s.slides[3].content.component = "quote"; s.slides[3].content.data = { text: "Decide in the room." }; }
  },
  {
    name: "quote attribution wrong type",
    mutate: s => { s.slides[3].content.component = "quote"; s.slides[3].content.data = { text: "Decide.", attribution: 7 }; },
    errors: [/data\.attribution: expected string, got integer/]
  },
  { name: "unknown component", mutate: s => { s.slides[1].content.component = "timeline"; }, errors: [/content\.component: "timeline" is not one of/] },

  { name: "heading whitespace", mutate: s => { s.slides[1].content.heading = "   "; }, errors: [/slides\[1\]\.content\.heading: must contain text/] },
  { name: "lead wrong type", mutate: s => { s.slides[1].content.lead = 42; }, errors: [/slides\[1\]\.content\.lead: expected string, got integer/] },
  { name: "first heading wrong type does not crash", mutate: s => { s.slides[0].content.heading = 42; }, errors: [/slides\[0\]\.content\.heading: expected string, got integer/] },

  { name: "closing script tag in text", mutate: s => { s.slides[0].content.lead = "</script><script>alert(1)</script>"; }, errors: [/content\.lead: contains "<\/script"/] },
  { name: "closing script tag in upper case", mutate: s => { s.slides[0].notes.say = "Say </SCRIPT> aloud."; }, errors: [/notes\.say: contains "<\/SCRIPT"/] },
  { name: "HTML comment opener in text", mutate: s => { s.slides[0].content.footer = "<!-- hidden"; }, errors: [/content\.footer: contains "<!--"/] },
  { name: "em dash in text", mutate: s => { s.slides[0].content.lead = `Pause${emDash}then continue.`; }, errors: [/content\.lead: contains an em dash/] },
  { name: "user-specific path in text", mutate: s => { s.slides[0].notes.say = `See ${windowsPath}`; }, errors: [/notes\.say: contains a user-specific absolute path/] },
  { name: "local file URL in text", mutate: s => { s.slides[0].notes.say = `See ${fileLink}`; }, errors: [/notes\.say: contains a local file URL/] },

  {
    name: "heading longer than 90 characters",
    mutate: s => { s.slides[1].content.heading = "A heading that keeps explaining the background of the problem instead of making one clear claim"; },
    warnings: [/slides\[1\]\.content\.heading: 9\d characters/]
  },
  {
    name: "heading longer than 12 words",
    mutate: s => { s.slides[1].content.heading = "One two three four five six seven eight nine ten eleven twelve thirteen"; },
    warnings: [/13 words may not fit/]
  },
  {
    name: "dense slide body",
    mutate: s => { s.slides[1].content.lead = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" "); },
    warnings: [/slides\[1\]: \d+ body words may be too dense/]
  },

  { name: "chapter lists an unknown slide", mutate: s => { s.meta.chapters[0].slides.push("missing"); }, errors: [/chapters\[0\]\.slides\[2\]: no slide has the ID "missing"/] },
  { name: "slide in two chapters", mutate: s => { s.meta.chapters[1].slides.push("opening"); }, errors: [/chapters\[1\]\.slides\[2\]: slide "opening" already belongs to chapter "frame"/] },
  { name: "duplicate chapter ids", mutate: s => { s.meta.chapters[1].id = "frame"; }, errors: [/chapters\[1\]\.id: duplicate chapter ID "frame"/] },
  { name: "chapter budgets do not add up", mutate: s => { s.meta.chapters[2].budgetMinutes = 4; }, errors: [/chapters: budgets add up to 13 minutes, but meta\.durationMinutes is 12/] },
  { name: "partial chapter budgets skip the total check", mutate: s => { delete s.meta.chapters[2].budgetMinutes; } },
  {
    name: "chapter over budget",
    mutate: s => { s.meta.chapters[0].budgetMinutes = 2; s.meta.chapters[1].budgetMinutes = 7; },
    warnings: [/chapters\[0\]: slides take 3m, 50% over the 2 minute budget/]
  },
  { name: "chapter budget zero", mutate: s => { s.meta.chapters[0].budgetMinutes = 0; }, errors: [/budgetMinutes: must be greater than 0/] },
  { name: "chapter without slides", mutate: s => { s.meta.chapters[0].slides = []; }, errors: [/chapters\[0\]\.slides: needs at least 1 item/] },
  { name: "chapter id not kebab-case", mutate: s => { s.meta.chapters[0].id = "Frame"; }, errors: [/chapters\[0\]\.id: use a kebab-case ID/] },

  { name: "source without label", mutate: s => { s.slides[1].sources = [{ url: "https://example.com" }]; }, errors: [/sources\[0\]\.label: required/] },
  { name: "source with script URL", mutate: s => { s.slides[1].sources = [{ label: "x", url: "javascript:alert(1)" }]; }, errors: [/sources\[0\]\.url: use an http/] },
  { name: "source with http URL", mutate: s => { s.slides[1].sources = [{ label: "Report", url: "http://example.com/report" }]; } },
  { name: "version wrong type", mutate: s => { s.meta.version = 2; }, errors: [/meta\.version: expected string, got integer/] },
  { name: "audienceAction empty", mutate: s => { s.meta.audienceAction = ""; }, errors: [/meta\.audienceAction: must contain text/] },

  { name: "fewer than two slides", mutate: s => { s.slides = s.slides.slice(0, 1); s.meta.chapters = [s.meta.chapters[0]]; s.meta.chapters[0].slides = ["opening"]; }, errors: [/^\$\.slides: needs at least 2 items/] },
  { name: "wrong types inside meta and slides", replace: () => ({ meta: [], slides: [null, 5, "x"] }), errors: [/^\$\.meta: expected object, got array/, /^\$\.slides\[0\]: expected object, got null/] },
  { name: "null specification", replace: () => null, errors: [/^\$: expected object, got null/] },
  { name: "array specification", replace: () => [], errors: [/^\$: expected object, got array/] },
  { name: "string specification", replace: () => "deck", errors: [/^\$: expected object, got string/] }
];
