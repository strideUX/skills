#!/usr/bin/env node
// A 10-second practice take on a test page. Run it before the first real take,
// and again after changing displays.
//
//   node calibrate.mjs [--mode screen|browser]
//
// Clicks five targets and records the screen, then checks that every click
// landed on its target and that the recording shows exactly the page (by
// looking for the colored squares in its corners). In screen mode it moves
// the real mouse: hands off for those seconds.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { loadProject, fileUrl, SKILL_DIR, pixelAt, videoSize } from "./lib/util.mjs";
import { take } from "./lib/take.mjs";

const args = process.argv.slice(2);
const mi = args.indexOf("--mode");
const { root, config } = loadProject();
const mode = mi >= 0 ? args[mi + 1] : config.mode;
const dir = path.join(root, ".cache", "calibrate");
rmSync(dir, { recursive: true, force: true });
mkdirSync(path.join(dir, "vo"), { recursive: true });
writeFileSync(path.join(dir, "script.json"), JSON.stringify({ title: "Calibrate", url: fileUrl(path.join(SKILL_DIR, "sample-app", "calibrate.html")), beats: ["one", "two", "three", "four", "five"] }));
writeFileSync(path.join(dir, "vo", "manifest.json"), JSON.stringify(Array.from({ length: 5 }, () => ({ dur: 1.8, text: "", words: [] }))));

if (mode === "screen") console.log("Screen mode: the mouse will move by itself for about 10 seconds. Hands off.");
let clicks = [], targets = [];
const ok = await take(null, async ({ page, beat, click }) => {
  targets = await page.evaluate(() => [...document.querySelectorAll(".t")].map((t) => { const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  for (let i = 0; i < 5; i++) await beat(async () => { await click(page.getByRole("button", { name: `t${i + 1}` })); }, { tail: 100 });
  clicks = await page.evaluate(() => window.__clicks);
}, { videoDir: dir, mode });
if (!ok) process.exit(1);

const problems = [];
const hits = clicks.filter((c) => c.target?.startsWith("t")).length;
if (clicks.length === 0) problems.push(mode === "screen"
  ? "No clicks reached the page. Give your terminal app Accessibility permission (System Settings > Privacy & Security > Accessibility), quit it fully and reopen it."
  : "No clicks reached the page.");
else {
  const off = clicks.map((c, i) => targets[i] ? Math.hypot(c.x - targets[i].x, c.y - targets[i].y) : 99);
  const worst = Math.max(...off);
  console.log(`clicks: ${hits}/5 on target, worst offset ${worst.toFixed(1)}px`);
  if (hits < 5 || worst > 6) problems.push(`Clicks are landing off target (worst ${worst.toFixed(0)}px). Is the browser window partly off screen, or on a second display? Keep it on the main display.`);
}

const raw = path.join(dir, "raw.mp4");
const R = videoSize(raw);
const k = R.width / config.viewport.width;
const s = 20 * k, t = 1.2;
const near = (p, q) => p.every((v, i) => Math.abs(v - q[i]) < 70);
const corners = [["top left", s, s, [255, 0, 0]], ["top right", R.width - s, s, [0, 200, 0]], ["bottom left", s, R.height - s, [0, 0, 255]], ["bottom right", R.width - s, R.height - s, [255, 200, 0]]];
const seen = corners.map(([name, x, y, want]) => ({ name, got: pixelAt(raw, t, x, y), want }));
const bad = seen.filter((c) => !near(c.got, c.want));
console.log(`recording: ${R.width}x${R.height}, corners ${bad.length ? "off" : "all in place"}`);
if (seen.every((c) => c.got.every((v) => v < 12))) problems.push("The recording is black. Give your terminal app Screen Recording permission (System Settings > Privacy & Security > Screen & System Audio Recording), quit it fully and reopen it.");
else if (bad.length) problems.push(`The recording's crop is off: ${bad.map((c) => `${c.name} is rgb(${c.got.join(",")})`).join("; ")}. If frame is "window" that's expected; otherwise check the display setting in video.config.json (screen.display) and that the window is on the main display.`);

if (problems.length) { console.log("\nproblems:"); problems.forEach((p) => console.log(`  - ${p}`)); console.log(`\nthe practice recording: ${raw}`); process.exit(1); }
console.log(`\ncalibrated: clicks land on target and the recording shows exactly the page (${mode} mode).`);
