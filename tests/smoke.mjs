import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSchema, validateDeck, validateFile } from "../scripts/validate.mjs";
import { BuildError, assembleShells, buildShells, inlineTheme, serializeSpec } from "../scripts/build.mjs";
import { DOCS_DIR, DOCS_HEADERS, buildDocsOutputs, listFiles } from "../scripts/build-docs.mjs";
import { appendRunToLog, compareRun, findRunTable, formatDelta, renderReport } from "../scripts/rehearsal-report.mjs";
import { cases } from "./validator-cases.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "SKILL.md",
  "stages/idea.md",
  "stages/voice-prompt.md",
  "stages/research.md",
  "stages/context.md",
  "stages/plan.md",
  "stages/rehearsal-log.md",
  "schema/deck-spec.schema.json",
  "examples/deck-spec.example.json",
  "templates/deck.html",
  "templates/storyboard.html",
  "themes/theme-contract.md",
  "themes/clean.css",
  "scripts/validate.mjs",
  "scripts/build.mjs",
  "scripts/build-docs.mjs",
  "scripts/rehearsal-report.mjs",
  "tests/render.mjs",
  "tests/validator-cases.mjs",
  "docs/index.html",
  "docs/storyboard.html",
  "docs/schema/deck-spec.schema.json"
];

const results = { passed: 0, failed: [] };
async function check(name, fn) {
  try {
    await fn();
    results.passed += 1;
  } catch (error) {
    results.failed.push(`${name}\n    ${String(error.message).split("\n").join("\n    ")}`);
  }
}

const toLf = text => text.replace(/\r\n?/g, "\n");
const embeddedSpec = html => {
  const match = /<script type="application\/json" id="deck-spec">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "no embedded deck-spec block");
  return { raw: match[1], spec: JSON.parse(match[1]) };
};
const example = JSON.parse(await readFile(join(root, "examples/deck-spec.example.json"), "utf8"));

// Package structure
for (const file of requiredFiles) {
  await check(`required file ${file}`, () => access(join(root, file)));
}

// Example and embedded specifications
await check("example specification validates", async () => {
  const result = await validateFile(join(root, "examples/deck-spec.example.json"));
  assert.deepEqual(result.errors, []);
});
await check("validateFile reads a BOM and checks the raw text for duplicate keys", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slidemaster-"));
  try {
    const example = await readFile(join(root, "examples/deck-spec.example.json"), "utf8");
    const bomFile = join(dir, "bom.json");
    await writeFile(bomFile, "\uFEFF" + example);
    assert.deepEqual((await validateFile(bomFile)).errors, []);
    const duplicateFile = join(dir, "duplicate.json");
    await writeFile(duplicateFile, example.replace('"title":', '"title": "</script><script>alert(1)</script>", "title":'));
    assert.ok((await validateFile(duplicateFile)).errors.some(message => message.includes("duplicate key")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
for (const htmlPath of ["templates/deck.html", "templates/storyboard.html", "docs/index.html", "docs/storyboard.html"]) {
  await check(`${htmlPath} embeds a valid specification`, async () => {
    const html = await readFile(join(root, htmlPath), "utf8");
    assert.ok(html.startsWith("<!doctype html>"), "not a complete HTML document");
    const { raw, spec } = embeddedSpec(html);
    assert.deepEqual(validateDeck(spec).errors, []);
    if (htmlPath.startsWith("docs/")) assert.ok(!raw.includes("<"), "embedded JSON is not safely serialized");
  });
}

// docs/ must be exactly the build output
await check("docs/ matches npm run build:docs", async () => {
  const expected = await buildDocsOutputs();
  const actual = (await listFiles(DOCS_DIR)).map(file => relative(DOCS_DIR, file).split(sep).join("/")).sort();
  assert.deepEqual(actual, Object.keys(expected).sort(), "docs/ contains missing or extra files; run npm run build:docs");
  for (const [name, content] of Object.entries(expected)) {
    const current = toLf(await readFile(join(DOCS_DIR, name), "utf8"));
    assert.ok(current === content, `docs/${name} differs from the build output; run npm run build:docs`);
  }
});

// Validator probes
for (const probe of cases) {
  await check(`validator: ${probe.name}`, () => {
    let spec = structuredClone(example);
    if (probe.replace) spec = probe.replace();
    else probe.mutate(spec);
    const { errors, warnings } = validateDeck(spec);
    const expectedErrors = probe.errors ?? [];
    if (!expectedErrors.length) assert.deepEqual(errors, [], "expected a valid specification");
    for (const pattern of expectedErrors) {
      assert.ok(errors.some(error => pattern.test(error)), `no error matched ${pattern}; got ${JSON.stringify(errors)}`);
    }
    for (const pattern of probe.warnings ?? []) {
      assert.ok(warnings.some(warning => pattern.test(warning)), `no warning matched ${pattern}; got ${JSON.stringify(warnings)}`);
    }
    if (probe.noWarnings) assert.deepEqual(warnings, []);
  });
}

await check("validator: rejects schema keywords it cannot evaluate", () => {
  assert.throws(() => checkSchema({ maxLength: 3 }, "long"), /not supported/);
});

// Build
await check("build: serialized JSON cannot close the script element", () => {
  const tricky = { text: "</script><script>alert(1)</script> <!-- & \u2028\u2029 > end" };
  const output = serializeSpec(tricky);
  assert.ok(!/[<>&\u2028\u2029]/.test(output), output);
  assert.deepEqual(JSON.parse(output), tricky);
});
await check("build: output is self-contained and round-trips the specification", async () => {
  const { deck, storyboard, warnings } = await buildShells(example);
  assert.deepEqual(warnings, []);
  for (const html of [deck, storyboard]) {
    assert.ok(!html.includes("../themes/"), "theme link was not replaced");
    assert.ok(html.includes('<style data-theme-source="themes/clean.css">'), "theme CSS was not inlined");
    assert.ok(!html.includes("slidemaster:header"), "header slot left in output");
    assert.ok(!html.includes("\r"), "output must use LF line endings");
    assert.deepEqual(embeddedSpec(html).spec, example);
  }
  assert.ok(deck.includes(`<title>${example.meta.title}</title>`));
});
await check("build: header links are escaped and restricted", async () => {
  const { deck } = await buildShells(example, { headers: DOCS_HEADERS });
  assert.ok(deck.includes('<a href="storyboard.html">Storyboard</a>'));
  await assert.rejects(
    buildShells(example, { headers: { deck: { title: "x", links: [{ label: "x", href: "javascript:alert(1)" }] } } }),
    BuildError
  );
});
await check("build: invalid specifications are rejected with details", async () => {
  const spec = structuredClone(example);
  spec.slides[0].content.lead = "</script>";
  await assert.rejects(buildShells(spec), error => error instanceof BuildError && error.details.some(detail => detail.includes("</script")));
});
await check("build: a missing theme file stops the build", async () => {
  const spec = structuredClone(example);
  spec.meta.theme = "dark";
  await assert.rejects(assembleShells(spec), /theme "dark" not found/);
});
await check("build: theme CSS cannot close the style element", () => {
  assert.throws(() => inlineTheme('<link rel="stylesheet" href="../themes/clean.css">', "a{}</style>", "clean"), BuildError);
});

// Rehearsal report
const rehearsalRun = (seconds, extra = {}) => ({
  format: "rehearsal-recording",
  version: 1,
  deck: example.meta.title,
  startedAt: new Date(2026, 10, 3, 9, 30).toISOString(),
  totalSeconds: seconds.reduce((sum, value) => sum + value, 0),
  slides: example.slides.map((slide, index) => ({ number: index + 1, id: slide.id, label: slide.label, seconds: seconds[index], visits: seconds[index] ? 1 : 0 })),
  ...extra
});
await check("rehearsal report: compares a run with slide timings, chapter budgets and the slot", () => {
  const run = rehearsalRun([70, 130, 170, 200, 180]);
  run.slides[1].visits = 2;
  const result = compareRun(run, example);
  assert.equal(result.slot, 720);
  assert.equal(result.delta, 30);
  assert.equal(result.withinSlot, false);
  assert.deepEqual(result.rows.map(row => [row.label, row.plan, row.actual]), [
    ["Opening", 60, 70], ["Cost", 120, 130], ["Model", 180, 170], ["Format", 180, 200], ["Close", 180, 180]
  ]);
  assert.deepEqual(result.chapters.map(chapter => [chapter.label, chapter.budget, chapter.actual, chapter.delta]), [
    ["Frame the problem", 180, 200, 20], ["Show the model", 360, 370, 10], ["Ask for action", 180, 180, 0]
  ]);
  const report = renderReport(result);
  for (const line of [
    "Total 12m30s against a 12m slot: 30s over (+4.2%). Over the slot.",
    "| Frame the problem | 3m | 3m20s | +20s |",
    "| Ask for action | 3m | 3m | 0s |",
    "| 2 | Cost (2 visits) | 2m | 2m10s | +10s |",
    "| 3 | Model | 3m | 2m50s | -10s |"
  ]) assert.ok(report.includes(line), `report is missing "${line}"\n${report}`);
  assert.equal(formatDelta(-0.4), "0s");
});
await check("rehearsal report: matches by ID, then label, then position, and flags the rest", () => {
  const spec = structuredClone(example);
  delete spec.meta.chapters[0].budgetMinutes;
  const run = rehearsalRun([60, 0, 180, 180, 175]);
  run.slides[0].id = "renamed";
  run.slides[0].label = "Opening";
  run.slides[3] = { number: 4, id: "extra", label: "Extra slide", seconds: 180, visits: 1 };
  run.slides.push({ number: 6, id: "appendix", label: "Appendix", seconds: 0, visits: 0 });
  const result = compareRun(run, spec);
  assert.deepEqual(result.rows.map(row => [row.label, row.status]), [
    ["Opening", ""], ["Cost", ""], ["Model", ""], ["Extra slide", "not in spec"], ["Close", ""], ["Appendix", "not in spec"], ["Format", "not in recording"]
  ]);
  assert.equal(result.withinSlot, true);
  assert.deepEqual([result.chapters[0].budget, result.chapters[0].fromSlides], [180, true]);
  assert.match(renderReport(result), /\| Frame the problem \| 3m\* \| 1m \| -2m \|/);
  assert.match(renderReport(result), /\| 2 \| Cost \(skipped\) \| 2m \| 0s \| -2m \|/);
  assert.throws(() => compareRun({ totalSeconds: 5 }, example), /no slides array/);
});
await check("rehearsal report: an unknown slide never takes a slide matched later by ID", () => {
  const spec = { meta: { durationMinutes: 6 }, slides: [
    { id: "opening", label: "Opening", timing: "2m" },
    { id: "model", label: "Model", timing: "2m" },
    { id: "evidence", label: "Evidence", timing: "2m" },
  ] };
  const run = { totalSeconds: 360, slides: [
    { number: 1, id: "opening", label: "Opening", seconds: 100, visits: 1 },
    { number: 2, id: "cost", label: "Cost", seconds: 200, visits: 1 },
    { number: 3, id: "model", label: "Model", seconds: 60, visits: 1 },
  ] };
  assert.deepEqual(compareRun(run, spec).rows.map(row => [row.label, row.actual, row.status]), [
    ["Opening", 100, ""], ["Cost", 200, "not in spec"], ["Model", 60, ""], ["Evidence", null, "not in recording"],
  ]);
});
await check("rehearsal report: appends to the stages log and never changes existing lines", async () => {
  const template = await readFile(join(root, "stages/rehearsal-log.md"), "utf8");
  const eol = template.includes("\r\n") ? "\r\n" : "\n";
  const result = compareRun(rehearsalRun([70, 130, 170, 200, 180]), example);
  const first = appendRunToLog(template, result, { date: "2026-11-03 09:30" });
  const row = "| 1 | 2026-11-03 09:30 | 12m30s | 12m | 30s over (+4.2%) | | |";
  assert.equal(first.run, 1);
  assert.equal(first.text, template.replace(`|---|---|---|---|---|---|---|${eol}`, `|---|---|---|---|---|---|---|${eol}${row}${eol}`));
  const second = appendRunToLog(first.text, compareRun(rehearsalRun([60, 120, 180, 180, 170]), example), { date: "2026-11-03 10:15" });
  assert.equal(second.run, 2);
  assert.ok(second.text.includes(`${row}${eol}| 2 | 2026-11-03 10:15 | 11m50s | 12m | 10s under (-1.4%) | | |${eol}`), second.text);
  assert.equal(findRunTable(second.text).filled, 2);
  const placeholder = template.replace(`|---|---|---|---|---|---|---|${eol}`, `|---|---|---|---|---|---|---|${eol}| 1 | | | | | | |${eol}`);
  assert.equal(appendRunToLog(placeholder, result).run, 1, "an empty template row is not a run");
  const fresh = appendRunToLog("", result, { date: "2026-11-03 09:30" });
  assert.equal(fresh.text, `# Rehearsal log\n\n| Run | Date | Total | Slot | Over or under | Stumbles | Changes decided |\n|---|---|---|---|---|---|---|\n${row}\n`);
});
await check("rehearsal report: the CLI prints the report and appends to the log", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slidemaster-"));
  try {
    const recording = join(dir, "rehearsal.json");
    const logFile = join(dir, "rehearsal-log.md");
    await writeFile(recording, JSON.stringify(rehearsalRun([70, 130, 170, 200, 180])));
    const args = [join(root, "scripts/rehearsal-report.mjs"), recording, "--spec", join(root, "examples/deck-spec.example.json"), "--log", logFile];
    const output = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(output.status, 0, output.stderr);
    assert.match(output.stdout, /## Rehearsal 2026-11-03 09:30[\s\S]*Logged run 1 in/);
    assert.match(await readFile(logFile, "utf8"), /^\| 1 \| 2026-11-03 09:30 \| 12m30s \| 12m \|/m);
    const usage = spawnSync(process.execPath, [join(root, "scripts/rehearsal-report.mjs"), recording], { encoding: "utf8" });
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /Usage:/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Repository hygiene
const localPathMarker = ["c:", "\\", "users", "\\"].join("");
const fileUrlMarker = ["file", ":", "/", "/", "/"].join("");
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}
const files = await collectFiles(root);
await check("no em dashes, user-specific paths, or local file URLs", async () => {
  const findings = [];
  for (const file of files) {
    const text = (await readFile(file, "utf8")).toLowerCase();
    const name = relative(root, file);
    if (text.includes("\u2014")) findings.push(`${name} contains an em dash`);
    if (text.includes(localPathMarker)) findings.push(`${name} contains a user-specific path`);
    if (text.includes(fileUrlMarker)) findings.push(`${name} contains a local file URL`);
  }
  assert.deepEqual(findings, []);
});

const total = results.passed + results.failed.length;
if (results.failed.length) {
  console.error(`${results.failed.length} of ${total} smoke checks failed:\n`);
  results.failed.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Smoke checks passed: ${total} checks (${cases.length} validator probes, ${files.length} repository files scanned).`);
}
