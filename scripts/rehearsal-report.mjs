// Compares a rehearsal recording with the deck specification and can append the run to a
// rehearsal log in the format of stages/rehearsal-log.md.
//
//   node scripts/rehearsal-report.mjs <recording.json> --spec <deck-spec.json> [--log <rehearsal-log.md>]
//
// Record a run by opening the built deck with ?rehearse and pressing Shift+S, or Save run on the
// last slide. The report compares the total with meta.durationMinutes, each chapter with its
// budgetMinutes (or the sum of its slide timings) and each slide with its timing.
// --log inserts one row into the run table and never changes existing rows.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatSeconds, parseTiming } from "./validate.mjs";

export const LOG_COLUMNS = ["Run", "Date", "Total", "Slot", "Over or under", "Stumbles", "Changes decided"];
const USAGE = "Usage: node scripts/rehearsal-report.mjs <recording.json> --spec <deck-spec.json> [--log <rehearsal-log.md>]";
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

export const formatDuration = seconds => formatSeconds(Math.round(Math.abs(seconds)));

export function formatDelta(seconds) {
  const rounded = Math.round(seconds);
  return rounded === 0 ? "0s" : `${rounded > 0 ? "+" : "-"}${formatDuration(rounded)}`;
}

export function overUnder(delta, slot) {
  const rounded = Math.round(delta);
  if (rounded === 0) return "on the slot";
  const percent = Math.abs((delta / slot) * 100).toFixed(1);
  return `${formatDuration(rounded)} ${rounded > 0 ? "over" : "under"} (${rounded > 0 ? "+" : "-"}${percent}%)`;
}

const normalize = value => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// Recorded slides match by ID, then by label or heading, then by position when the counts are equal.
export function matchSlides(recorded, specSlides) {
  const byId = new Map();
  const byLabel = new Map();
  specSlides.forEach((slide, index) => {
    if (!isObject(slide)) return;
    if (typeof slide.id === "string" && !byId.has(slide.id)) byId.set(slide.id, index);
    for (const value of [slide.label, slide.content?.heading]) {
      const key = normalize(value);
      if (key && !byLabel.has(key)) byLabel.set(key, index);
    }
  });
  const used = new Set();
  const result = recorded.map(() => undefined);
  const take = (position, index) => {
    if (index === undefined || used.has(index)) return false;
    result[position] = index;
    used.add(index);
    return true;
  };
  // Three passes over the whole recording, so an unknown slide can never take a slide that a
  // later recorded slide matches exactly.
  recorded.forEach((slide, position) => take(position, byId.get(String(slide?.id ?? ""))));
  recorded.forEach((slide, position) => {
    if (result[position] === undefined) take(position, byLabel.get(normalize(slide?.label)));
  });
  if (recorded.length === specSlides.length) {
    recorded.forEach((slide, position) => {
      if (result[position] === undefined) take(position, position);
    });
  }
  return result;
}

export function compareRun(recording, spec) {
  if (!isObject(recording) || !Array.isArray(recording.slides)) {
    throw new Error("the recording has no slides array; save it from a deck opened with ?rehearse");
  }
  const total = Number(recording.totalSeconds);
  if (!Number.isFinite(total)) throw new Error("the recording has no totalSeconds");
  const meta = isObject(spec?.meta) ? spec.meta : {};
  const specSlides = Array.isArray(spec?.slides) ? spec.slides : [];
  const slot = Number.isFinite(meta.durationMinutes) && meta.durationMinutes > 0 ? meta.durationMinutes * 60 : null;
  const plans = specSlides.map(slide => (isObject(slide) ? parseTiming(slide.timing) : null));

  const matches = matchSlides(recording.slides, specSlides);
  const actualBySpec = new Map();
  const rows = recording.slides.map((slide, position) => {
    const index = matches[position];
    const actual = Number(slide?.seconds) || 0;
    if (index !== undefined) actualBySpec.set(index, actual);
    return {
      number: slide?.number ?? position + 1,
      label: index === undefined ? String(slide?.label ?? `Slide ${position + 1}`) : String(specSlides[index].label ?? specSlides[index].id),
      plan: index === undefined ? null : plans[index],
      actual,
      visits: Number(slide?.visits) || 0,
      status: index === undefined ? "not in spec" : ""
    };
  });
  specSlides.forEach((slide, index) => {
    if (matches.includes(index)) return;
    rows.push({ number: null, label: String(slide?.label ?? slide?.id ?? `Spec slide ${index + 1}`), plan: plans[index], actual: null, visits: 0, status: "not in recording" });
  });

  const indexById = new Map(specSlides.map((slide, index) => [slide?.id, index]));
  const chapters = (Array.isArray(meta.chapters) ? meta.chapters : []).filter(isObject).map((chapter, position) => {
    const members = (Array.isArray(chapter.slides) ? chapter.slides : []).map(id => indexById.get(id)).filter(index => index !== undefined);
    const memberPlans = members.map(index => plans[index]);
    const planned = memberPlans.length && memberPlans.every(plan => plan !== null) ? memberPlans.reduce((a, b) => a + b, 0) : null;
    const explicit = typeof chapter.budgetMinutes === "number" && chapter.budgetMinutes > 0 ? chapter.budgetMinutes * 60 : null;
    const budget = explicit ?? planned;
    const actual = members.reduce((sum, index) => sum + (actualBySpec.get(index) ?? 0), 0);
    return {
      label: String(chapter.label ?? chapter.id ?? `Chapter ${position + 1}`),
      budget,
      fromSlides: explicit === null && planned !== null,
      actual,
      delta: budget === null ? null : actual - budget
    };
  });

  const delta = slot === null ? null : total - slot;
  return {
    deck: String(recording.deck ?? meta.title ?? "Untitled deck"),
    startedAt: recording.startedAt ?? null,
    total,
    slot,
    delta,
    percent: slot === null ? null : (delta / slot) * 100,
    withinSlot: slot === null ? null : Math.round(total) <= slot,
    plannedTotal: plans.some(plan => plan !== null) ? plans.reduce((sum, plan) => sum + (plan ?? 0), 0) : null,
    rows,
    chapters
  };
}

export function formatDate(iso) {
  const parsed = iso ? new Date(iso) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const cell = value => String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
const tableRow = values => `|${values.map(value => (cell(value) ? ` ${cell(value)} ` : " ")).join("|")}|`;
const separator = count => `|${Array(count).fill("---").join("|")}|`;
const durationOrNa = seconds => (seconds === null || seconds === undefined ? "n/a" : formatDuration(seconds));

export function renderReport(result) {
  const lines = [`## Rehearsal ${formatDate(result.startedAt)}`, "", `Deck: ${result.deck}`, ""];
  if (result.slot !== null) {
    lines.push(`Total ${formatDuration(result.total)} against a ${formatDuration(result.slot)} slot: ${overUnder(result.delta, result.slot)}. ${result.withinSlot ? "Within the slot." : "Over the slot."}`);
  } else {
    lines.push(`Total ${formatDuration(result.total)}. The specification has no meta.durationMinutes.`);
  }
  if (result.plannedTotal !== null) lines.push(`Slide timings in the specification add up to ${formatDuration(result.plannedTotal)}.`);

  if (result.chapters.length) {
    lines.push("", tableRow(["Chapter", "Budget", "Actual", "Diff"]), separator(4));
    for (const chapter of result.chapters) {
      const budget = chapter.budget === null ? "n/a" : `${formatDuration(chapter.budget)}${chapter.fromSlides ? "*" : ""}`;
      lines.push(tableRow([chapter.label, budget, formatDuration(chapter.actual), chapter.delta === null ? "n/a" : formatDelta(chapter.delta)]));
    }
    if (result.chapters.some(chapter => chapter.fromSlides)) lines.push("", "\\* No budgetMinutes, so the chapter is compared with the sum of its slide timings.");
  }

  lines.push("", tableRow(["#", "Slide", "Plan", "Actual", "Diff"]), separator(5));
  for (const row of result.rows) {
    const notes = [row.visits > 1 ? `${row.visits} visits` : "", row.status, row.actual === 0 && row.visits === 0 ? "skipped" : ""].filter(Boolean);
    const diff = row.plan === null || row.actual === null ? "n/a" : formatDelta(row.actual - row.plan);
    lines.push(tableRow([row.number ?? "", notes.length ? `${row.label} (${notes.join(", ")})` : row.label, durationOrNa(row.plan), durationOrNa(row.actual), diff]));
  }
  return lines.join("\n");
}

function logValue(column, run, date, result) {
  const key = column.trim().toLowerCase();
  if (key === "run" || key === "#") return String(run);
  if (key === "date") return date;
  if (key === "total") return formatDuration(result.total);
  if (key === "slot") return result.slot === null ? "" : formatDuration(result.slot);
  if (key === "over or under") return result.slot === null ? "" : overUnder(result.delta, result.slot);
  return "";
}

function splitLines(text) {
  const lines = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const next = newline === -1 ? text.length : newline + 1;
    lines.push({ content: text.slice(start, newline === -1 ? text.length : newline).replace(/\r$/, ""), next, terminated: newline !== -1 });
    start = next;
  }
  return lines;
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  let inner = trimmed.slice(1);
  if (inner.endsWith("|") && !inner.endsWith("\\|")) inner = inner.slice(0, -1);
  return inner.split(/(?<!\\)\|/).map(value => value.trim());
}

// The run table is the first Markdown table whose first header cell is "Run".
export function findRunTable(text) {
  const lines = splitLines(text);
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const header = tableCells(lines[index].content);
    const divider = tableCells(lines[index + 1].content);
    if (!header || !["run", "#"].includes(header[0].toLowerCase()) || !divider || !divider.every(value => /^:?-+:?$/.test(value))) continue;
    let last = index + 1;
    let filled = 0;
    for (let row = index + 2; row < lines.length; row += 1) {
      const cells = tableCells(lines[row].content);
      if (!cells) break;
      last = row;
      // A row with nothing beyond the run number is an empty template row, not a run.
      if (cells.slice(1).some(Boolean)) filled += 1;
    }
    return { header, filled, insertAt: lines[last].next, terminated: lines[last].terminated };
  }
  return null;
}

// Returns the log with one new run row. Every existing character stays as it was.
export function appendRunToLog(text, result, { date = formatDate(result.startedAt) } = {}) {
  const source = text ?? "";
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const table = findRunTable(source);
  if (table) {
    const run = table.filled + 1;
    const row = tableRow(table.header.map(column => logValue(column, run, date, result)));
    return { run, text: source.slice(0, table.insertAt) + (table.terminated ? row + eol : eol + row) + source.slice(table.insertAt) };
  }
  const block = [tableRow(LOG_COLUMNS), separator(LOG_COLUMNS.length), tableRow(LOG_COLUMNS.map(column => logValue(column, 1, date, result)))];
  if (!source.trim()) return { run: 1, text: ["# Rehearsal log", "", ...block, ""].join(eol) };
  return { run: 1, text: source + (source.endsWith("\n") ? eol : eol + eol) + block.join(eol) + eol };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new Error(`cannot read ${path} (${error.message})`);
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--spec" || arg === "--log") {
      if (index + 1 >= args.length) throw new Error(`${arg} needs a value\n${USAGE}`);
      options[arg.slice(2)] = args[++index];
    } else if (arg === "--help" || arg === "-h") options.help = true;
    else if (!arg.startsWith("-") && !options.recording) options.recording = arg;
    else throw new Error(`unexpected argument "${arg}"\n${USAGE}`);
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
    if (!options.recording || !options.spec) throw new Error(USAGE);
    const result = compareRun(readJson(options.recording), readJson(options.spec));
    console.log(renderReport(result));
    if (options.log) {
      const before = existsSync(options.log) ? readFileSync(options.log, "utf8") : "";
      const { text, run } = appendRunToLog(before, result);
      writeFileSync(options.log, text);
      console.log(`\nLogged run ${run} in ${options.log}. Add the stumbles and the changes you decided.`);
    }
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
