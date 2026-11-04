import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateDeck } from "./validate.mjs";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SHELLS = ["deck", "storyboard"];
const SPEC_BLOCK = /(<script type="application\/json" id="deck-spec">)[\s\S]*?(<\/script>)/;
const THEME_LINK = /<link rel="stylesheet" href="\.\.\/themes\/[a-z0-9-]+\.css">/;
const HEADER_SLOT = /[ \t]*<!-- slidemaster:header -->\n/;
const TIMED_RUN_LINK = /(<a class="timed-run" href=")deck\.html(\?rehearse">)/;
const LOCAL_HTML_FILE = /^[\w.-]+\.html$/;
const USAGE = "Usage: node scripts/build.mjs <spec.json> --out <dir>";

export class BuildError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "BuildError";
    this.details = details;
  }
}

const toLf = text => text.replace(/\r\n?/g, "\n");
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

// JSON that cannot close the surrounding <script> element or open an HTML comment.
export function serializeSpec(spec) {
  return JSON.stringify(spec, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function embedSpec(html, spec) {
  if (!SPEC_BLOCK.test(html)) throw new BuildError('the template has no <script type="application/json" id="deck-spec"> block');
  return html.replace(SPEC_BLOCK, (match, open, close) => `${open}\n${serializeSpec(spec)}\n  ${close}`);
}

export function inlineTheme(html, css, theme) {
  if (!THEME_LINK.test(html)) throw new BuildError("the template has no ../themes/<name>.css stylesheet link");
  if (/<\/style/i.test(css)) throw new BuildError(`themes/${theme}.css must not contain "</style"`);
  return html.replace(THEME_LINK, () => `<style data-theme-source="themes/${escapeHtml(theme)}.css">\n${css.trim()}\n  </style>`);
}

function headerHtml(header) {
  const links = (header.links ?? []).map(link => {
    if (!/^https:\/\/\S+$/.test(link.href) && !LOCAL_HTML_FILE.test(link.href)) {
      throw new BuildError(`header link "${link.href}" must be an https:// URL or a local .html file`);
    }
    return `      <a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;
  });
  return [
    '  <header class="shell-header">',
    `    <span class="shell-title">${escapeHtml(header.title)}</span>`,
    '    <nav class="shell-links" aria-label="Project links">',
    ...links,
    "    </nav>",
    "  </header>",
    ""
  ].join("\n");
}

function setDocumentMeta(html, spec, shell) {
  const title = shell === "deck" ? spec.meta.title : `Storyboard: ${spec.meta.title}`;
  return html
    .replace(/<html\b[^>]*>/, () => `<html lang="${escapeHtml(spec.meta.language)}" data-theme="${escapeHtml(spec.meta.theme)}">`)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
}

async function readTheme(root, theme) {
  if (typeof theme !== "string" || !/^[a-z0-9-]+$/.test(theme)) {
    throw new BuildError(`meta.theme must name a file in themes/, got ${JSON.stringify(theme)}`);
  }
  try {
    return toLf(await readFile(join(root, "themes", `${theme}.css`), "utf8"));
  } catch {
    throw new BuildError(`theme "${theme}" not found: expected themes/${theme}.css`);
  }
}

// The storyboard's "Start a timed run" link opens the deck in rehearse mode, so it needs the deck's file name.
export function linkTimedRun(html, deckFile) {
  if (!LOCAL_HTML_FILE.test(deckFile)) throw new BuildError(`deck file "${deckFile}" must be a local .html file name`);
  if (!TIMED_RUN_LINK.test(html)) throw new BuildError('the storyboard template has no <a class="timed-run" href="deck.html?rehearse"> link');
  return html.replace(TIMED_RUN_LINK, (match, open, close) => `${open}${escapeHtml(deckFile)}${close}`);
}

// Fills both templates without validating. Use buildShells unless you need to test the shells with invalid input.
export async function assembleShells(spec, { root = ROOT, headers = {}, deckFile = "deck.html" } = {}) {
  const css = await readTheme(root, spec?.meta?.theme);
  const output = {};
  for (const shell of SHELLS) {
    let html = toLf(await readFile(join(root, "templates", `${shell}.html`), "utf8"));
    html = inlineTheme(html, css, spec.meta.theme);
    html = embedSpec(html, spec);
    html = setDocumentMeta(html, spec, shell);
    html = html.replace(HEADER_SLOT, () => (headers[shell] ? headerHtml(headers[shell]) : ""));
    if (shell === "storyboard") html = linkTimedRun(html, deckFile);
    output[shell] = html;
  }
  return output;
}

export async function buildShells(spec, options = {}) {
  const { errors, warnings } = validateDeck(spec);
  if (errors.length) throw new BuildError("the deck specification has validation errors", errors);
  return { ...(await assembleShells(spec, options)), warnings };
}

export async function readSpec(specPath) {
  let raw;
  try {
    raw = await readFile(specPath, "utf8");
  } catch (error) {
    throw new BuildError(`cannot read ${specPath} (${error.code ?? error.message})`);
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new BuildError(`${specPath} is not valid JSON (${error.message})`);
  }
}

// Windows and macOS file systems usually ignore letter case, so the output guard does too.
function samePath(a, b) {
  return process.platform === "win32" || process.platform === "darwin" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export async function buildFiles(specPath, outDir, { fileNames = { deck: "deck.html", storyboard: "storyboard.html" }, ...options } = {}) {
  const target = resolve(outDir);
  const root = resolve(options.root ?? ROOT);
  if ([root, join(root, "templates"), join(root, "themes")].some(dir => samePath(target, dir))) {
    throw new BuildError(`refusing to write build output into ${outDir}`);
  }
  const result = await buildShells(await readSpec(specPath), { ...options, deckFile: fileNames.deck });
  await mkdir(target, { recursive: true });
  const files = [];
  for (const shell of SHELLS) {
    const file = join(target, fileNames[shell]);
    await writeFile(file, result[shell]);
    files.push(file);
  }
  return { files, warnings: result.warnings };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") options.out = args[++index];
    else if (arg.startsWith("--out=")) options.out = arg.slice("--out=".length);
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (!arg.startsWith("-") && !options.spec) options.spec = arg;
    else throw new BuildError(`unexpected argument "${arg}"\n${USAGE}`);
  }
  return options;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      return;
    }
    if (!options.spec || !options.out) throw new BuildError(USAGE);
    const { files, warnings } = await buildFiles(options.spec, options.out);
    warnings.forEach(message => console.warn(`warning: ${message}`));
    files.forEach(file => console.log(`Wrote ${file}`));
  } catch (error) {
    console.error(`error: ${error.message}`);
    (error.details ?? []).forEach(detail => console.error(`  ${detail}`));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
