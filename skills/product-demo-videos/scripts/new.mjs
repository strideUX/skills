#!/usr/bin/env node
// Starts a new video folder in the project.
//
//   node new.mjs 01-get-started "Get started with Acme"
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findRoot, SKILL_DIR } from "./lib/util.mjs";

const [slug, title] = process.argv.slice(2);
if (!slug || !/^\d+[a-z]?-[\w-]+$/.test(slug)) { console.log('usage: node new.mjs NN-slug "Title"   (e.g. 01-get-started "Get started")'); process.exit(1); }
const root = findRoot();
if (!root) { console.log("Run this inside a project made with init.mjs."); process.exit(1); }
const dir = path.join(root, slug);
if (existsSync(dir)) { console.log(`${slug} already exists.`); process.exit(1); }
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "script.json"), JSON.stringify({
  title: title || slug.replace(/^\d+[a-z]?-/, "").replace(/-/g, " "),
  url: "",
  next: "",
  beats: ["In this video, we'll <what the viewer will be able to do>.", "To start, click <the exact label on screen>.", "<where you've ended up>. Next, we'll <the next video>."],
}, null, 2) + "\n");
writeFileSync(path.join(dir, "take.mjs"), `// The take for "${title || slug}". One beat() per line in script.json.
// Run:  node take.mjs --dry   then   node take.mjs
import { take } from "${SKILL_DIR}/scripts/lib/take.mjs";

await take(import.meta.url, async ({ page, beat, move, hover, click, type, press, pause, zoom, zoomOut }) => {
  // 1.
  await beat(async (b) => {
    await pause(1200);
  });

  // 2.
  await beat(async (b) => {
    await b.at("click");
  });

  // 3. End still, with a longer tail.
  await beat(async () => {}, { tail: 1200 });
});
`);
console.log(`created ${dir}/script.json and take.mjs`);
