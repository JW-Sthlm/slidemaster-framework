import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSchema, validateDeck, validateFile } from "../scripts/validate.mjs";
import { BuildError, assembleShells, buildShells, inlineTheme, serializeSpec } from "../scripts/build.mjs";
import { DOCS_DIR, DOCS_HEADERS, buildDocsOutputs, listFiles } from "../scripts/build-docs.mjs";
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
