import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const schema = JSON.parse(readFileSync(new URL("../schema/deck-spec.schema.json", import.meta.url), "utf8"));

const annotations = new Set(["$schema", "$id", "$defs", "$comment", "title", "description", "examples", "default"]);
const keywords = new Set([
  "type", "required", "properties", "additionalProperties", "enum", "const", "pattern", "minLength",
  "minItems", "minimum", "exclusiveMinimum", "items", "$ref", "allOf", "if", "then", "else", "format"
]);
const patternMessages = {
  "\\S": "must contain text, not only whitespace",
  "^\\S+$": "must not contain whitespace",
  "^[a-z0-9]+(?:-[a-z0-9]+)*$": 'use a kebab-case ID such as "cost-of-ambiguity"',
  "^[a-z0-9-]+$": "use lowercase letters, digits and hyphens",
  "^(?:[1-9][0-9]*m(?:[1-9][0-9]*s)?|[1-9][0-9]*s)$": 'use values such as "2m", "45s" or "1m30s"',
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}$": "use the YYYY-MM-DD format",
  "^https?://\\S+$": "use an http:// or https:// URL"
};

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = value => typeof value === "string" && value.trim().length > 0;

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  return type === "number" ? actual === "number" || actual === "integer" : actual === type;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref "${ref}"`);
  return ref.slice(2).split("/").reduce((node, key) => {
    const next = node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (next === undefined) throw new Error(`unresolved $ref "${ref}"`);
    return next;
  }, root);
}

export function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Evaluates the JSON Schema keywords this project uses. Unknown keywords throw, so a schema edit cannot be silently ignored.
export function checkSchema(node, value, path = "$", errors = [], root = schema) {
  for (const key of Object.keys(node)) {
    if (!keywords.has(key) && !annotations.has(key)) throw new Error(`schema keyword "${key}" is not supported by validate.mjs`);
  }
  if (node.$ref) checkSchema(resolveRef(root, node.$ref), value, path, errors, root);
  if (node.type !== undefined && !matchesType(value, node.type)) {
    errors.push(`${path}: expected ${node.type}, got ${typeOf(value)}`);
    return errors;
  }
  if ("const" in node && value !== node.const) errors.push(`${path}: must be ${JSON.stringify(node.const)}`);
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path}: ${JSON.stringify(value) ?? "undefined"} is not one of ${node.enum.join(", ")}`);
  }
  if (typeof value === "string") {
    if (node.minLength !== undefined && [...value].length < node.minLength) {
      errors.push(`${path}: must be at least ${node.minLength} characters`);
    }
    if (node.pattern !== undefined && !new RegExp(node.pattern, "u").test(value)) {
      errors.push(`${path}: ${patternMessages[node.pattern] ?? `must match ${node.pattern}`}`);
    } else if (node.format === "date" && !isCalendarDate(value)) {
      errors.push(`${path}: use a real calendar date in YYYY-MM-DD format`);
    }
  }
  if (typeof value === "number") {
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${path}: must be at least ${node.minimum}`);
    if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
      errors.push(`${path}: must be greater than ${node.exclusiveMinimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      errors.push(`${path}: needs at least ${node.minItems} item${node.minItems === 1 ? "" : "s"}`);
    }
    if (node.items) value.forEach((item, index) => checkSchema(node.items, item, `${path}[${index}]`, errors, root));
  }
  if (isObject(value)) {
    for (const key of node.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
    }
    for (const [key, item] of Object.entries(value)) {
      const child = node.properties && Object.hasOwn(node.properties, key) ? node.properties[key] : undefined;
      if (child) {
        checkSchema(child, item, `${path}.${key}`, errors, root);
      } else if (node.additionalProperties === false) {
        const allowed = node.properties ? ` (allowed: ${Object.keys(node.properties).join(", ")})` : "";
        errors.push(`${path}.${key}: unknown property${allowed}`);
      } else if (isObject(node.additionalProperties)) {
        checkSchema(node.additionalProperties, item, `${path}.${key}`, errors, root);
      }
    }
  }
  for (const subschema of node.allOf ?? []) checkSchema(subschema, value, path, errors, root);
  if (node.if) {
    const probe = checkSchema(node.if, value, path, [], root);
    if (!probe.length && node.then) checkSchema(node.then, value, path, errors, root);
    if (probe.length && node.else) checkSchema(node.else, value, path, errors, root);
  }
  return errors;
}

export function parseTiming(value) {
  const match = typeof value === "string" ? /^(?:([1-9][0-9]*)m)?(?:([1-9][0-9]*)s)?$/.exec(value) : null;
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  if (!minutes) return `${seconds}s`;
  return seconds ? `${minutes}m${seconds}s` : `${minutes}m`;
}

function countWords(value) {
  return isText(value) ? value.trim().split(/\s+/u).length : 0;
}

function walkStrings(value, path = "$", output = []) {
  if (typeof value === "string") output.push({ path, value });
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, output));
  } else if (isObject(value)) {
    Object.entries(value).forEach(([key, item]) => walkStrings(item, `${path}.${key}`, output));
  }
  return output;
}

const percent = (actual, planned) => Math.round((Math.abs(actual - planned) / planned) * 100);

function checkRules(spec, errors, warnings) {
  const meta = isObject(spec.meta) ? spec.meta : {};
  const slides = Array.isArray(spec.slides) ? spec.slides : [];

  const seen = new Set();
  const timings = new Map();
  slides.forEach((slide, index) => {
    if (!isObject(slide)) return;
    const path = `$.slides[${index}]`;
    if (typeof slide.id === "string") {
      if (seen.has(slide.id)) errors.push(`${path}.id: duplicate ID "${slide.id}"`);
      seen.add(slide.id);
      const seconds = parseTiming(slide.timing);
      if (seconds !== null && !timings.has(slide.id)) timings.set(slide.id, seconds);
    }

    const content = isObject(slide.content) ? slide.content : null;
    if (!content) return;
    if (isText(content.heading)) {
      const characters = [...content.heading.trim()].length;
      const words = countWords(content.heading);
      if (characters > 90 || words > 12) {
        warnings.push(`${path}.content.heading: ${characters} characters and ${words} words may not fit; aim for 90 characters or 12 words at most`);
      }
    }
    const bodyWords = countWords(content.lead) + countWords(content.footer)
      + walkStrings(content.data ?? {}).reduce((total, item) => total + countWords(item.value), 0);
    if (bodyWords > 45) warnings.push(`${path}: ${bodyWords} body words may be too dense for a slide`);
  });

  const allTimings = slides.map(slide => (isObject(slide) ? parseTiming(slide.timing) : null));
  if (Number.isInteger(meta.durationMinutes) && meta.durationMinutes > 0 && allTimings.length && allTimings.every(t => t !== null)) {
    const total = allTimings.reduce((sum, seconds) => sum + seconds, 0);
    const planned = meta.durationMinutes * 60;
    if (Math.abs(total - planned) > planned * 0.1) {
      warnings.push(`$.meta.durationMinutes: slide timings add up to ${formatSeconds(total)}, ${percent(total, planned)}% ${total > planned ? "over" : "under"} the planned ${meta.durationMinutes} minutes`);
    }
  }

  const chapters = Array.isArray(meta.chapters) ? meta.chapters : [];
  const chapterIds = new Set();
  const owners = new Map();
  chapters.forEach((chapter, chapterIndex) => {
    if (!isObject(chapter)) return;
    const path = `$.meta.chapters[${chapterIndex}]`;
    const name = typeof chapter.id === "string" ? chapter.id : `#${chapterIndex + 1}`;
    if (typeof chapter.id === "string") {
      if (chapterIds.has(chapter.id)) errors.push(`${path}.id: duplicate chapter ID "${chapter.id}"`);
      chapterIds.add(chapter.id);
    }
    const members = Array.isArray(chapter.slides) ? chapter.slides.filter(id => typeof id === "string") : [];
    (Array.isArray(chapter.slides) ? chapter.slides : []).forEach((slideId, slideIndex) => {
      if (typeof slideId !== "string") return;
      const slidePath = `${path}.slides[${slideIndex}]`;
      if (!seen.has(slideId)) errors.push(`${slidePath}: no slide has the ID "${slideId}"`);
      else if (owners.has(slideId)) errors.push(`${slidePath}: slide "${slideId}" already belongs to chapter "${owners.get(slideId)}"`);
      else owners.set(slideId, name);
    });
    if (typeof chapter.budgetMinutes === "number" && chapter.budgetMinutes > 0) {
      const used = [...new Set(members)].reduce((sum, id) => sum + (timings.get(id) ?? 0), 0);
      const budget = chapter.budgetMinutes * 60;
      if (used > budget * 1.1) {
        warnings.push(`${path}: slides take ${formatSeconds(used)}, ${percent(used, budget)}% over the ${chapter.budgetMinutes} minute budget`);
      }
    }
  });
  if (chapters.length && chapters.every(chapter => isObject(chapter) && typeof chapter.budgetMinutes === "number")) {
    const budgets = chapters.reduce((sum, chapter) => sum + chapter.budgetMinutes, 0);
    if (Number.isInteger(meta.durationMinutes) && Math.abs(budgets - meta.durationMinutes) > 1e-9) {
      errors.push(`$.meta.chapters: budgets add up to ${Number(budgets.toFixed(2))} minutes, but meta.durationMinutes is ${meta.durationMinutes}`);
    }
  }

  for (const item of walkStrings(spec)) {
    const marker = /<\/script|<!--/iu.exec(item.value);
    if (marker) errors.push(`${item.path}: contains "${marker[0]}", which can break the HTML page`);
    if (item.value.includes("\u2014")) errors.push(`${item.path}: contains an em dash`);
    if (/file:[/\\]{2,}/iu.test(item.value)) errors.push(`${item.path}: contains a local file URL`);
    if (/[a-z]:\\users\\/iu.test(item.value)) errors.push(`${item.path}: contains a user-specific absolute path`);
  }

  const first = isObject(slides[0]) && isObject(slides[0].content) ? slides[0].content.heading : "";
  const opening = typeof first === "string" ? first.toLowerCase() : "";
  if (opening.startsWith("about ") || opening.startsWith("introduction to ")) {
    warnings.push("$.slides[0]: opening reads like background rather than a hook");
  }

  const last = slides.at(-1);
  if (isObject(last) && last.type !== "close" && !(isObject(last.content) && last.content.component === "action-list")) {
    warnings.push(`$.slides[${slides.length - 1}]: final slide should state a concrete audience action`);
  }
}

export function validateDeck(spec) {
  const errors = checkSchema(schema, spec);
  const warnings = [];
  if (isObject(spec)) {
    try {
      checkRules(spec, errors, warnings);
    } catch (error) {
      errors.push(`$: the validator could not finish (${error.message})`);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export async function validateFile(filePath) {
  const absolutePath = resolve(filePath);
  const raw = (await readFile(absolutePath, "utf8")).replace(/^\uFEFF/u, "");
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON (${error.message})`);
  }
  const result = validateDeck(spec);
  // JSON.parse keeps only the last duplicate key, so raw text can hide markers the parsed object lacks.
  const marker = /<\/script|<!--/iu.exec(raw);
  if (marker && !result.errors.some(message => message.endsWith("which can break the HTML page"))) {
    result.errors.push(`$: the file text contains "${marker[0]}", for example in a duplicate key, which can break the HTML page`);
  }
  return { absolutePath, ...result };
}

async function main() {
  const filePath = process.argv[2] || "examples/deck-spec.example.json";
  try {
    const result = await validateFile(filePath);
    result.warnings.forEach(message => console.warn(`warning: ${message}`));
    if (result.errors.length) {
      result.errors.forEach(message => console.error(`error: ${message}`));
      console.error(`${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
