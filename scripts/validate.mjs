import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const componentRules = {
  statement: data => typeof data.text === "string" && data.text.trim().length > 0,
  "stat-grid": data => validItems(data, ["value", "label"], 1),
  "card-grid": data => validItems(data, ["title", "text"], 1),
  process: data => Array.isArray(data.steps) && data.steps.length >= 2 && data.steps.every(nonEmpty),
  quote: data => nonEmpty(data.text) && (!("attribution" in data) || typeof data.attribution === "string"),
  "action-list": data => Array.isArray(data.items) && data.items.length >= 1 && data.items.every(nonEmpty)
};

const slideTypes = new Set(["hero", "standard", "contrast", "close"]);
const energyLevels = new Set(["calm", "steady", "high"]);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const timingPattern = /^(?:[1-9][0-9]*m)?(?:[1-9][0-9]*s)?$/;

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validItems(data, keys, minimum) {
  return Array.isArray(data.items)
    && data.items.length >= minimum
    && data.items.every(item => item && keys.every(key => nonEmpty(item[key])));
}

function countWords(value) {
  if (!nonEmpty(value)) return 0;
  return value.trim().split(/\s+/u).length;
}

function walkStrings(value, path = "$", output = []) {
  if (typeof value === "string") output.push({ path, value });
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, output));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => walkStrings(item, `${path}.${key}`, output));
  }
  return output;
}

export function validateDeck(spec) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { errors: ["$: expected an object"], warnings };
  }

  const meta = spec.meta;
  if (!meta || typeof meta !== "object") {
    errors.push("$.meta: required object");
  } else {
    for (const field of ["title", "subtitle", "author", "date", "language", "theme"]) {
      if (!nonEmpty(meta[field])) errors.push(`$.meta.${field}: required non-empty string`);
    }
    if (!Number.isInteger(meta.durationMinutes) || meta.durationMinutes < 1) {
      errors.push("$.meta.durationMinutes: required positive integer");
    }
  }

  if (!Array.isArray(spec.slides) || spec.slides.length < 2) {
    errors.push("$.slides: expected at least two slides");
    return { errors, warnings };
  }

  const ids = new Set();
  spec.slides.forEach((slide, index) => {
    const path = `$.slides[${index}]`;
    if (!slide || typeof slide !== "object") {
      errors.push(`${path}: expected an object`);
      return;
    }

    if (!nonEmpty(slide.id) || !idPattern.test(slide.id)) {
      errors.push(`${path}.id: use a unique kebab-case ID`);
    } else if (ids.has(slide.id)) {
      errors.push(`${path}.id: duplicate ID "${slide.id}"`);
    } else {
      ids.add(slide.id);
    }

    if (!slideTypes.has(slide.type)) errors.push(`${path}.type: unsupported slide type`);
    if (!nonEmpty(slide.label)) errors.push(`${path}.label: required non-empty string`);
    if (!nonEmpty(slide.act)) errors.push(`${path}.act: required non-empty string`);
    if (!nonEmpty(slide.timing) || !timingPattern.test(slide.timing)) {
      errors.push(`${path}.timing: use values such as "2m", "45s", or "1m30s"`);
    }
    if (slide.energy && !energyLevels.has(slide.energy)) {
      errors.push(`${path}.energy: expected calm, steady, or high`);
    }

    const content = slide.content;
    if (!content || typeof content !== "object") {
      errors.push(`${path}.content: required object`);
    } else {
      if (!nonEmpty(content.heading)) errors.push(`${path}.content.heading: required non-empty string`);
      if (!componentRules[content.component]) {
        errors.push(`${path}.content.component: unsupported component`);
      } else if (!content.data || !componentRules[content.component](content.data)) {
        errors.push(`${path}.content.data: invalid data for "${content.component}"`);
      }

      const visibleWords = countWords(content.lead) + countWords(content.footer)
        + walkStrings(content.data || {}).reduce((total, item) => total + countWords(item.value), 0);
      if (visibleWords > 45) {
        warnings.push(`${path}: ${visibleWords} body words may be too dense for a slide`);
      }
    }

    if (!slide.notes || !nonEmpty(slide.notes.say)) {
      errors.push(`${path}.notes.say: required speaker notes`);
    }
  });

  for (const item of walkStrings(spec)) {
    if (item.value.includes("\u2014")) errors.push(`${item.path}: contains an em dash`);
    if (/file:[/\\]{2,}/iu.test(item.value)) errors.push(`${item.path}: contains a local file URL`);
    if (/[a-z]:\\users\\/iu.test(item.value)) errors.push(`${item.path}: contains a user-specific absolute path`);
  }

  const firstHeading = spec.slides[0]?.content?.heading?.toLowerCase() || "";
  if (firstHeading.startsWith("about ") || firstHeading.startsWith("introduction to ")) {
    warnings.push("$.slides[0]: opening reads like background rather than a hook");
  }

  const last = spec.slides.at(-1);
  if (last?.type !== "close" && last?.content?.component !== "action-list") {
    warnings.push(`$.slides[${spec.slides.length - 1}]: final slide should state a concrete audience action`);
  }

  return { errors, warnings };
}

export async function validateFile(filePath) {
  const absolutePath = resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  const spec = JSON.parse(raw);
  return { absolutePath, ...validateDeck(spec) };
}

async function main() {
  const filePath = process.argv[2] || "examples/deck-spec.example.json";
  try {
    const result = await validateFile(filePath);
    result.warnings.forEach(message => console.warn(`warning: ${message}`));
    if (result.errors.length) {
      result.errors.forEach(message => console.error(`error: ${message}`));
      process.exitCode = 1;
      return;
    }
    console.log(`Valid deck specification: ${result.absolutePath}`);
    console.log(`${result.warnings.length} warning(s)`);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

