#!/usr/bin/env node
// Checks a finished video before anyone calls it done.
//
//   node check.mjs <videoDir> [final.mp4]
//
// Pulls one frame from the middle of every beat (and a contact sheet of all of
// them), and flags black stretches and long silences. Look at every frame:
// is the thing being named on screen, is nothing covering it, is no private
// data visible? Then watch the video once with sound.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ffmpeg, duration } from "./lib/util.mjs";

const dir = path.resolve(process.argv[2] || ".");
const tl = JSON.parse(readFileSync(path.join(dir, "build", "timeline.json"), "utf8"));
const file = path.resolve(process.argv[3] || tl.out);
const outDir = path.join(dir, "build", "check");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const problems = [];
const total = duration(file);
console.log(`${path.basename(file)}: ${total.toFixed(1)}s`);

const frames = [];
for (const b of tl.beats) {
  const t = b.start + (b.end - b.start) * 0.6;
  const f = path.join(outDir, `beat-${String(b.beat).padStart(2, "0")}.jpg`);
  ffmpeg(["-ss", t.toFixed(2), "-i", file, "-frames:v", "1", "-q:v", "3", f]);
  frames.push(f);
  console.log(`beat ${b.beat} @ ${t.toFixed(1)}s  ${f}\n    "${b.text}"`);
}
if (frames.length) {
  const cols = Math.min(4, frames.length), rows = Math.ceil(frames.length / cols);
  ffmpeg(["-framerate", "1", "-i", path.join(outDir, "beat-%02d.jpg"), "-vf", `scale=640:-2,tile=${cols}x${rows}:padding=8:margin=8:color=white`, "-frames:v", "1", path.join(outDir, "sheet.jpg")]);
  console.log(`contact sheet: ${path.join(outDir, "sheet.jpg")}`);
}

const run = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args, "-f", "null", "-"], { encoding: "utf8" }).stderr || "";
const black = run(["-i", file, "-vf", "blackdetect=d=0.4:pix_th=0.08", "-an"]);
for (const m of black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
  const [a, b] = [parseFloat(m[1]), parseFloat(m[2])];
  if (a > 0.3 && b < total - 0.7) problems.push(`black screen from ${a.toFixed(1)}s to ${b.toFixed(1)}s`);
}
const silence = run(["-i", file, "-af", "silencedetect=n=-45dB:d=2.5", "-vn"]);
for (const m of silence.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) {
  const [a, b] = [parseFloat(m[1]), parseFloat(m[2])];
  if (a > tl.mainStart + 0.5 && b < tl.beats.at(-1).end) problems.push(`no sound from ${a.toFixed(1)}s to ${b.toFixed(1)}s (a beat whose actions ran long?)`);
}
const loud = run(["-i", file, "-af", "ebur128=peak=true", "-vn"]);
const lufs = loud.match(/Integrated loudness:\s+I:\s+(-?[\d.]+)/);
if (lufs) console.log(`loudness: ${lufs[1]} LUFS (target about -16)`);

if (problems.length) { console.log("\nproblems:"); problems.forEach((p) => console.log(`  - ${p}`)); process.exitCode = 1; }
else console.log("\nno black stretches or long silences found. Now look at every frame above, then watch it once with sound.");
