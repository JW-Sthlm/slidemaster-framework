import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFile } from "../scripts/validate.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requiredFiles = [
  "README.md",
  "LICENSE",
  "SKILL.md",
  "schema/deck-spec.schema.json",
  "examples/deck-spec.example.json",
  "templates/deck.html",
  "templates/storyboard.html",
  "themes/theme-contract.md",
  "themes/clean.css",
  "scripts/validate.mjs",
  "docs/index.html",
  "docs/storyboard.html"
];

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

for (const file of requiredFiles) {
  await access(join(root, file));
}

const validation = await validateFile(join(root, "examples/deck-spec.example.json"));
if (validation.errors.length) {
  throw new Error(`Example specification failed validation:\n${validation.errors.join("\n")}`);
}

for (const htmlPath of ["templates/deck.html", "templates/storyboard.html", "docs/index.html", "docs/storyboard.html"]) {
  const html = await readFile(join(root, htmlPath), "utf8");
  if (!html.includes('id="deck-spec"')) throw new Error(`${htmlPath} has no embedded deck specification`);
  if (!html.includes("<!doctype html>")) throw new Error(`${htmlPath} is not a complete HTML document`);
}

const localPathMarker = ["c:", "\\", "users", "\\"].join("");
const fileUrlMarker = ["file", ":", "/", "/", "/"].join("");
const files = await collectFiles(root);
for (const file of files) {
  const text = await readFile(file, "utf8");
  const name = relative(root, file);
  if (text.includes("\u2014")) throw new Error(`${name} contains an em dash`);
  if (text.toLowerCase().includes(localPathMarker)) throw new Error(`${name} contains a user-specific path`);
  if (text.toLowerCase().includes(fileUrlMarker)) throw new Error(`${name} contains a local file URL`);
}

console.log(`Smoke checks passed for ${requiredFiles.length} required files.`);
console.log(`Validated ${files.length} repository files with 0 private path or em dash findings.`);

