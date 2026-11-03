import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assembleShells, buildShells } from "../scripts/build.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const inCi = process.env.CI === "true";
const installHint = "npm install --no-save playwright && npx playwright install --with-deps chromium";

function skipOrFail(reason) {
  if (inCi) {
    console.error(`Render tests cannot run: ${reason}. Install with: ${installHint}`);
    process.exit(1);
  }
  console.log(`Skipping render tests: ${reason}. Install with "${installHint}" or set PLAYWRIGHT_MODULE to an installed copy.`);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"));
} catch (error) {
  skipOrFail(`Playwright could not be loaded (${error.code ?? error.message})`);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  skipOrFail(`Chromium could not be launched (${String(error.message).split("\n")[0]})`);
}

const viewports = [{ width: 1920, height: 1080 }, { width: 390, height: 844 }];
const outRoot = process.env.RENDER_OUT_DIR ? resolve(process.env.RENDER_OUT_DIR) : await mkdtemp(join(tmpdir(), "slidemaster-render-"));
const example = JSON.parse(await readFile(join(root, "examples/deck-spec.example.json"), "utf8"));
const results = { passed: 0, failed: [] };

async function check(name, fn) {
  try {
    await fn();
    results.passed += 1;
  } catch (error) {
    results.failed.push(`${name}\n    ${String(error.message).split("\n").join("\n    ")}`);
  }
}

async function writeShells(name, shells) {
  const dir = join(outRoot, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "deck.html"), shells.deck);
  await writeFile(join(dir, "storyboard.html"), shells.storyboard);
  return { deck: pathToFileURL(join(dir, "deck.html")).href, storyboard: pathToFileURL(join(dir, "storyboard.html")).href };
}

async function open(url, { viewport = viewports[0], reducedMotion = "reduce" } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  const log = { consoleErrors: [], pageErrors: [], external: [], requests: [], dialogs: [] };
  page.on("console", message => { if (message.type() === "error") log.consoleErrors.push(message.text()); });
  page.on("pageerror", error => log.pageErrors.push(error.message));
  page.on("request", request => {
    log.requests.push(request.url());
    if (!/^(?:file|data|about|blob):/.test(request.url())) log.external.push(request.url());
  });
  page.on("dialog", dialog => {
    log.dialogs.push(dialog.message());
    dialog.dismiss().catch(() => {});
  });
  await page.goto(url);
  await settle(page);
  return { context, page, log };
}

// Some local Playwright and Node combinations never resolve close(). Stop waiting after the first timeout.
let closeWorks = true;
async function dispose(context) {
  if (!closeWorks) return;
  const closed = await Promise.race([context.close().then(() => true, () => true), new Promise(done => setTimeout(() => done(false), 1500))]);
  if (!closed) closeWorks = false;
}

// Wait for the active slide's entrance animation to finish. Chromium can resolve an animation's start time a few frames late.
const settle = page => page.evaluate(async () => {
  await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  const slide = document.querySelector(".slide.is-active");
  const animations = slide ? slide.getAnimations({ subtree: true }) : [];
  await Promise.race([
    Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
    new Promise(done => setTimeout(done, 2000))
  ]);
});

function assertClean(log, label) {
  assert.deepEqual(log.pageErrors, [], `${label}: page errors`);
  assert.deepEqual(log.consoleErrors, [], `${label}: console errors`);
  assert.deepEqual(log.external, [], `${label}: external requests`);
  assert.deepEqual(log.dialogs, [], `${label}: dialogs`);
}

// Runs in the page: overflow of the active slide or of a container element.
function overflowProblems(selector) {
  const container = document.querySelector(selector);
  if (!container) return [`no element matches ${selector}`];
  const box = container.getBoundingClientRect();
  const problems = [];
  if (container.scrollWidth > container.clientWidth + 1) problems.push(`horizontal overflow ${container.scrollWidth} > ${container.clientWidth}`);
  if (container.scrollHeight > container.clientHeight + 1) problems.push(`vertical overflow ${container.scrollHeight} > ${container.clientHeight}`);
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) problems.push("the page scrolls horizontally");
  for (const element of container.querySelectorAll("*")) {
    if (element.children.length) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) {
      problems.push(`${element.tagName.toLowerCase()} outside its container: "${element.textContent.trim().slice(0, 40)}"`);
    }
  }
  return problems;
}

// Runs in the page: WCAG AA contrast for visible text, against composited ancestor backgrounds.
function contrastProblems(selector) {
  const parse = value => {
    let match = /rgba?\(([^)]+)\)/.exec(value);
    if (match) {
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    }
    match = /color\(srgb ([^)]+)\)/.exec(value);
    if (match) {
      const parts = match[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts.length > 3 ? parts[3] : 1];
    }
    return [0, 0, 0, 1];
  };
  const over = (top, bottom) => [0, 1, 2].map(i => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const luminance = color => color.slice(0, 3).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const problems = [];
  for (const element of document.querySelectorAll(`${selector}, ${selector} *`)) {
    if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || !rect.width || !rect.height) continue;
    const chain = [];
    for (let node = element; node; node = node.parentElement) chain.push(node);
    let background = [255, 255, 255, 1];
    for (const node of chain.slice().reverse()) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color[3] > 0) background = over(color, background);
    }
    const opacity = chain.reduce((product, node) => product * Number(getComputedStyle(node).opacity), 1);
    const foreground = parse(style.color);
    const text = over([foreground[0], foreground[1], foreground[2], foreground[3] * opacity], background);
    const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
    const ratio = (light + 0.05) / (dark + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) {
      problems.push(`"${element.textContent.trim().slice(0, 40)}" has contrast ${ratio.toFixed(2)}:1 (${element.className || element.tagName.toLowerCase()})`);
    }
  }
  return problems;
}

const deckState = page => page.evaluate(() => ({
  slide: document.querySelector(".slide.is-active")?.id,
  hash: location.hash,
  counter: document.getElementById("counter").textContent,
  announcer: document.getElementById("announcer").textContent
}));

async function checkEverySlide(url, label) {
  for (const viewport of viewports) {
    const { context, page, log } = await open(url, { viewport });
    const count = await page.locator(".slide").count();
    assert.ok(count > 0, `${label}: no slides rendered`);
    const problems = [];
    for (let index = 0; index < count; index += 1) {
      if (index > 0) {
        await page.keyboard.press("ArrowRight");
        await settle(page);
      }
      const id = await page.evaluate(() => document.querySelector(".slide.is-active")?.id);
      const found = [
        ...(await page.evaluate(overflowProblems, ".slide.is-active")),
        ...(await page.evaluate(contrastProblems, ".slide.is-active"))
      ];
      found.forEach(problem => problems.push(`${viewport.width}px ${id}: ${problem}`));
    }
    assertClean(log, `${label} at ${viewport.width}px`);
    await dispose(context);
    assert.deepEqual(problems, [], `${label}: layout or contrast problems`);
  }
}

async function checkStoryboard(url, label, expectedRows) {
  for (const viewport of viewports) {
    const { context, page, log } = await open(url, { viewport });
    assert.equal(await page.locator(".slide-row").count(), expectedRows, `${label}: row count`);
    const problems = [
      ...(await page.evaluate(overflowProblems, "main")).filter(problem => !problem.startsWith("vertical")),
      ...(await page.evaluate(contrastProblems, "body"))
    ];
    assertClean(log, `${label} at ${viewport.width}px`);
    await dispose(context);
    assert.deepEqual(problems, [], `${label} at ${viewport.width}px`);
  }
}

try {
  const exampleUrls = await writeShells("example", await buildShells(example));

  await check("example deck: no errors, overflow or contrast failures at 1920x1080 and 390x844", () => checkEverySlide(exampleUrls.deck, "example deck"));
  await check("example storyboard: no errors, overflow or contrast failures", () => checkStoryboard(exampleUrls.storyboard, "example storyboard", example.slides.length));

  await check("example storyboard shows timing, chapters and sources", async () => {
    const { context, page } = await open(exampleUrls.storyboard);
    const text = await page.locator("main").textContent();
    await dispose(context);
    for (const expected of ["Cumulative 3m", "Cumulative 12m", "Frame the problem", "3m of 3m budget", "On budget", "Illustrative figures created for this example deck", "Audience action"]) {
      assert.ok(text.includes(expected), `storyboard text is missing "${expected}"`);
    }
  });

  await check("example deck never shows notes or sources", async () => {
    const { context, page } = await open(exampleUrls.deck);
    const deckText = await page.locator("#deck").evaluate(element => element.textContent);
    await dispose(context);
    const hidden = example.slides.flatMap(slide => [slide.notes.say, ...(slide.sources ?? []).map(source => source.label)]);
    hidden.forEach(text => assert.ok(!deckText.includes(text), `deck shows "${text.slice(0, 40)}"`));
  });

  await check("keyboard, controls, hash links and live region work", async () => {
    const { context, page, log } = await open(exampleUrls.deck);
    const ids = example.slides.map(slide => slide.id);
    const labels = example.slides.map(slide => slide.label);
    const expectAt = async (index, step) => {
      const state = await deckState(page);
      assert.equal(state.slide, `slide-${ids[index]}`, `${step}: active slide`);
      assert.equal(state.hash, `#${ids[index]}`, `${step}: hash`);
      assert.equal(state.announcer, `Slide ${index + 1} of ${ids.length}: ${labels[index]}`, `${step}: live region`);
    };
    await expectAt(0, "initial");
    const steps = [["ArrowRight", 1], ["PageDown", 2], ["Space", 3], ["ArrowLeft", 2], ["PageUp", 1], ["End", 4], ["ArrowRight", 4], ["Home", 0], ["ArrowLeft", 0],
      ["Alt+ArrowRight", 0], ["Control+ArrowRight", 0], ["Meta+ArrowRight", 0], ["Alt+End", 0]];
    for (const [key, index] of steps) {
      await page.keyboard.press(key);
      await expectAt(index, key);
    }
    await page.focus("#next");
    await page.keyboard.press("Space");
    await expectAt(1, "Space on the focused Next button");
    await page.focus("#previous");
    await page.keyboard.press("Space");
    await expectAt(2, "Space on the focused Previous button");
    await page.click("#next");
    await expectAt(3, "click Next");
    await page.click("#previous");
    await expectAt(2, "click Previous");
    await page.focus("#next");
    await page.keyboard.press("Enter");
    await expectAt(3, "Enter on the focused Next button");
    await page.evaluate(() => { location.hash = "#opening"; });
    await page.waitForFunction(() => document.querySelector(".slide.is-active")?.id === "slide-opening");
    await expectAt(0, "hashchange");
    assert.equal(await page.getAttribute("#announcer", "aria-live"), "polite");
    assert.equal(await page.getAttribute("#deck", "aria-live"), null, "the deck itself must not be a live region");
    assertClean(log, "keyboard flow");
    await dispose(context);
  });

  await check("deep links open the requested slide", async () => {
    for (const [hash, index, expectedHash] of [["#review-format", 3, "#review-format"], ["#does-not-exist", 0, "#opening"]]) {
      const { context, page } = await open(`${exampleUrls.deck}${hash}`);
      const state = await deckState(page);
      await dispose(context);
      assert.equal(state.slide, `slide-${example.slides[index].id}`, `${hash}: active slide`);
      assert.equal(state.hash, expectedHash, `${hash}: hash`);
    }
  });

  await check("keyboard focus is visible on the controls", async () => {
    const { context, page } = await open(exampleUrls.deck);
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement;
      return { id: element.id, visible: element.matches(":focus-visible"), outline: getComputedStyle(element).outlineStyle };
    });
    await dispose(context);
    assert.equal(focus.id, "previous");
    assert.ok(focus.visible && focus.outline !== "none", `focus ring missing: ${JSON.stringify(focus)}`);
  });

  await check("reduced motion shortens the slide animation", async () => {
    const durations = {};
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const { context, page } = await open(exampleUrls.deck, { reducedMotion });
      durations[reducedMotion] = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".slide.is-active")).animationDuration));
      await dispose(context);
    }
    assert.ok(durations["no-preference"] >= 0.2 && durations.reduce <= 0.01, JSON.stringify(durations));
  });

  const componentData = {
    statement: { text: "One clear statement." },
    "stat-grid": { items: [{ value: "42%", label: "of reviews end without a decision" }, { value: "3", label: "owners per decision" }] },
    "card-grid": { items: [{ title: "Signal", text: "What changed since last time." }, { title: "Choice", text: "What the room decides." }] },
    process: { steps: ["Signal", "Choice", "Owner", "Date"] },
    quote: { text: "Decide in the room.", attribution: "Review guide" },
    "action-list": { items: ["Name the owner.", "Set the date."] }
  };
  const matrix = {
    meta: { ...example.meta, durationMinutes: 24, chapters: undefined },
    slides: ["hero", "standard", "contrast", "close"].flatMap(type => Object.entries(componentData).map(([component, data]) => ({
      id: `${type}-${component}`,
      type,
      label: `${component} on ${type}`,
      act: type,
      timing: "1m",
      content: { eyebrow: "EVERY COMPONENT", heading: `${component} on a ${type} slide`, lead: "Readable on every slide type.", component, data, footer: "Footer text" },
      notes: { say: "Matrix probe." }
    })))
  };
  delete matrix.meta.chapters;
  const matrixUrls = await writeShells("matrix", await buildShells(matrix));
  await check("every component on every slide type: no overflow and WCAG AA contrast", () => checkEverySlide(matrixUrls.deck, "component matrix"));

  const injection = structuredClone(example);
  injection.meta.title = "<img src=x onerror=alert('title')>";
  injection.slides[0].label = "\" onmouseover=\"alert('label')";
  injection.slides[0].content.eyebrow = "\"><img src=x onerror=alert('eyebrow')>";
  injection.slides[0].content.heading = "<img src=x onerror=alert('heading')>";
  injection.slides[0].content.lead = "<svg onload=alert('lead')></svg>";
  injection.slides[0].content.data.text = "<iframe src=\"javascript:alert('statement')\"></iframe>";
  injection.slides[1].content.data.items[0].value = "<b onclick=alert('stat')>99</b>";
  injection.slides[1].notes.say = "<img src=x onerror=alert('notes')>";
  injection.slides[2].content.data.steps[0] = "<script>alert('step')";
  injection.slides[3].content.data.items[0].title = "<a href=\"javascript:alert('card')\">card</a>";
  injection.slides[3].sources = [{ label: "<img src=x onerror=alert('source')>", url: "https://example.com/?q=<b>" }];
  injection.slides[4].content.data.items[0] = "<img src=x onerror=alert('action')>";
  const breakout = structuredClone(injection);
  breakout.slides[0].content.lead = "</script><script>alert('breakout')</script><!--";
  const injectionUrls = await writeShells("injection", await buildShells(injection));
  const breakoutUrls = await writeShells("breakout", await assembleShells(breakout));

  for (const [label, urls, spec] of [["injection spec", injectionUrls, injection], ["unvalidated script breakout", breakoutUrls, breakout]]) {
    await check(`${label}: text stays text and no script runs`, async () => {
      for (const shell of ["deck", "storyboard"]) {
        const { context, page, log } = await open(urls[shell]);
        if (shell === "deck") {
          for (let index = 0; index < spec.slides.length; index += 1) {
            if (index > 0) await page.keyboard.press("ArrowRight");
            await page.hover(".slide.is-active .slide-inner").catch(() => {});
          }
        }
        const report = await page.evaluate(selector => ({
          injected: document.querySelectorAll(`${selector} img, ${selector} svg, ${selector} iframe, ${selector} script, ${selector} b`).length,
          links: [...document.querySelectorAll(`${selector} a`)].map(link => link.getAttribute("href")),
          heading: document.querySelector(`${selector} h1, ${selector} .slide-row h2`)?.textContent
        }), shell === "deck" ? "#deck" : "#main");
        assertClean(log, `${label} ${shell}`);
        assert.ok(!log.requests.some(url => /\/x$/.test(url)), `${label} ${shell}: an injected image was requested`);
        await dispose(context);
        assert.equal(report.injected, 0, `${label} ${shell}: injected elements`);
        assert.ok(report.links.every(href => /^https:\/\//.test(href)), `${label} ${shell}: unexpected links ${report.links}`);
        assert.equal(report.heading, spec.slides[0].content.heading, `${label} ${shell}: heading text`);
      }
    });
  }

  const brokenUrls = await writeShells("malformed", Object.fromEntries(Object.entries(await buildShells(example)).filter(([key]) => key !== "warnings").map(([key, html]) => [
    key,
    html.replace(/(<script type="application\/json" id="deck-spec">)[\s\S]*?(<\/script>)/, (match, open, close) => `${open}{ "meta": ${close}`)
  ])));
  await check("malformed JSON shows a visible error panel instead of a blank page", async () => {
    for (const shell of ["deck", "storyboard"]) {
      const { context, page, log } = await open(brokenUrls[shell]);
      const panel = page.locator(".error-panel");
      assert.ok(await panel.isVisible(), `${shell}: error panel is not visible`);
      assert.match(await panel.innerText(), /could not be read[\s\S]*validate\.mjs/, `${shell}: error panel text`);
      if (shell === "deck") assert.equal(await page.locator(".controls").isVisible(), false, "controls should be hidden");
      assert.deepEqual(log.pageErrors, [], `${shell}: uncaught errors`);
      await dispose(context);
    }
  });

  const partial = structuredClone(example);
  partial.slides[1].content.component = "timeline-3d";
  partial.slides[2].content.data = {};
  const partialUrls = await writeShells("partial", await assembleShells(partial));
  await check("unknown components and empty data show placeholders and keep the deck usable", async () => {
    const { context, page, log } = await open(partialUrls.deck);
    const placeholders = await page.evaluate(() => [...document.querySelectorAll(".slide")].map(slide => slide.querySelector(".component-error")?.textContent ?? ""));
    assert.equal(placeholders.length, example.slides.length, "every slide renders");
    assert.match(placeholders[1], /Unsupported component "timeline-3d"/);
    assert.match(placeholders[2], /Missing or invalid data for the "process" component/);
    assert.deepEqual([placeholders[0], placeholders[3], placeholders[4]], ["", "", ""]);
    await page.keyboard.press("ArrowRight");
    assert.ok(await page.locator(".slide.is-active .component-error").isVisible(), "placeholder is not visible");
    assert.deepEqual(log.pageErrors, []);
    await dispose(context);
    const story = await open(partialUrls.storyboard);
    assert.equal(await story.page.locator(".slide-row").count(), example.slides.length);
    assert.equal(await story.page.locator(".component-summary.is-warning").count(), 2);
    assert.deepEqual(story.log.pageErrors, []);
    await dispose(story.context);
  });

  const collision = structuredClone(example);
  collision.slides[4].id = "next";
  collision.meta.chapters[2].slides = ["next"];
  const collisionUrls = await writeShells("collision", await buildShells(collision));
  await check('a slide with the ID "next" does not break the Next button', async () => {
    const { context, page } = await open(collisionUrls.deck);
    for (let step = 0; step < 4; step += 1) await page.click("#next");
    assert.equal((await deckState(page)).slide, "slide-next");
    await dispose(context);
  });

  const docs = {
    deck: pathToFileURL(join(root, "docs", "index.html")).href,
    storyboard: pathToFileURL(join(root, "docs", "storyboard.html")).href
  };
  await check("docs deck: header links visible, no overflow at both sizes", async () => {
    await checkEverySlide(docs.deck, "docs deck");
    for (const viewport of viewports) {
      for (const [url, links] of [[docs.deck, ["Storyboard", "Repository"]], [docs.storyboard, ["Deck", "Repository"]]]) {
        const { context, page } = await open(url, { viewport });
        for (const name of links) {
          const link = page.getByRole("link", { name, exact: true });
          assert.ok(await link.isVisible(), `${name} link hidden at ${viewport.width}px`);
          const box = await link.boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width, `${name} link outside the viewport at ${viewport.width}px`);
        }
        await dispose(context);
      }
    }
  });
  await check("docs storyboard renders cleanly", () => checkStoryboard(docs.storyboard, "docs storyboard", example.slides.length));
} finally {
  await Promise.race([browser.close().catch(() => {}), new Promise(done => setTimeout(done, 3000))]);
  if (!process.env.RENDER_OUT_DIR) await rm(outRoot, { recursive: true, force: true });
}

const total = results.passed + results.failed.length;
if (results.failed.length) {
  console.error(`${results.failed.length} of ${total} render checks failed:\n`);
  results.failed.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Render checks passed: ${total} checks at ${viewports.map(v => `${v.width}x${v.height}`).join(" and ")}.`);
process.exit(0);
