import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, buildShells, readSpec } from "./build.mjs";

export const DOCS_DIR = join(ROOT, "docs");
const REPOSITORY = "https://github.com/JW-Sthlm/slidemaster-framework";
const TITLE = "Slidemaster Framework demo";

export const DOCS_HEADERS = {
  deck: {
    title: TITLE,
    links: [{ label: "Storyboard", href: "storyboard.html" }, { label: "Repository", href: REPOSITORY }]
  },
  storyboard: {
    title: TITLE,
    links: [{ label: "Deck", href: "index.html" }, { label: "Repository", href: REPOSITORY }]
  }
};

// Everything GitHub Pages serves from docs/, keyed by path relative to docs/.
export async function buildDocsOutputs() {
  const spec = await readSpec(join(ROOT, "examples", "deck-spec.example.json"));
  const shells = await buildShells(spec, { headers: DOCS_HEADERS });
  const schema = (await readFile(join(ROOT, "schema", "deck-spec.schema.json"), "utf8")).replace(/\r\n?/g, "\n");
  return {
    "index.html": shells.deck,
    "storyboard.html": shells.storyboard,
    "schema/deck-spec.schema.json": schema
  };
}

export async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function main() {
  const outputs = await buildDocsOutputs();
  for (const [name, content] of Object.entries(outputs)) {
    const target = join(DOCS_DIR, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    console.log(`Wrote docs/${name}`);
  }
  for (const file of await listFiles(DOCS_DIR)) {
    const name = relative(DOCS_DIR, file).split(sep).join("/");
    if (!(name in outputs)) {
      await rm(file);
      console.log(`Removed docs/${name} because it is not build output`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
