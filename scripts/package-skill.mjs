import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./build.mjs";

export const PACKAGE_NAME = "slidemaster-framework.zip";
const USAGE = `Usage: node scripts/package-skill.mjs [--out <file.zip>]`;

// Everything an assistant needs to run the skill. Copilot Cowork accepts SKILL.md at the archive root
// plus at most 20 companion files, so keep this list short and leave tests, docs and dotfiles out.
export const SKILL_FILES = [
  "SKILL.md",
  "LICENSE",
  "references/without-scripts.md",
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
  "themes/clean.css",
  "scripts/validate.mjs",
  "scripts/build.mjs",
  "scripts/rehearsal-report.mjs"
];

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Stored (uncompressed) entries with a fixed 1980-01-01 timestamp, so the archive is byte-identical on every system.
export function zipStore(entries) {
  const DOS_DATE_1980_01_01 = 0x21;
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const fileName = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, fileName, data);
    directory.push(central, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const centralDirectory = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralDirectory, end]);
}

// Reads the archives zipStore writes. Used by the tests to check the published package.
export function readStoredZip(buffer) {
  const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error("no end of central directory record");
  const count = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`bad central directory entry ${index}`);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (method !== 0) throw new Error(`${name} is compressed; expected stored entries`);
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + size);
    if (crc32(data) !== crc) throw new Error(`${name} fails its CRC check`);
    entries.push({ name, data });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function buildSkillPackage({ root = ROOT } = {}) {
  const entries = [];
  for (const name of SKILL_FILES) {
    const text = (await readFile(join(root, name), "utf8")).replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n");
    entries.push({ name, data: Buffer.from(text, "utf8") });
  }
  return zipStore(entries);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  let out = join(ROOT, "dist", PACKAGE_NAME);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out" && args[index + 1]) out = resolve(args[++index]);
    else if (args[index].startsWith("--out=")) out = resolve(args[index].slice("--out=".length));
    else {
      console.error(`error: unexpected argument "${args[index]}"\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await buildSkillPackage());
  console.log(`Wrote ${out} (${SKILL_FILES.length} files)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
