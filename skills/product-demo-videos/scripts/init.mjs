#!/usr/bin/env node
// Sets up a folder for making videos.
//
//   node init.mjs [folder] [--url https://app.example.com] [--example]
//
// Creates package.json with Playwright, installs Chromium, writes
// video.config.json, .env.example and .gitignore. --example adds a sample app
// and a finished example video folder (00-example) to try the whole pipeline on.
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { SKILL_DIR } from "./lib/util.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dir = path.resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--url") || ".");
const url = flag("--url");
const example = args.includes("--example");
mkdirSync(dir, { recursive: true });
const write = (name, body) => { const f = path.join(dir, name); if (existsSync(f)) { console.log(`kept      ${name}`); return; } writeFileSync(f, body); console.log(`created   ${name}`); };

write("package.json", JSON.stringify({ name: path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, "-"), private: true, type: "module", dependencies: { playwright: "^1.59.0" } }, null, 2) + "\n");
const cfg = JSON.parse(readFileSync(path.join(SKILL_DIR, "templates", "video.config.json"), "utf8"));
if (url) cfg.app.url = url;
if (example && !url) cfg.app.url = "sample-app/index.html";
write("video.config.json", JSON.stringify(cfg, null, 2) + "\n");
write(".env.example", "# Copy to .env and fill in. Never commit .env.\nELEVENLABS_API_KEY=\n");
write(".gitignore", ["node_modules/", ".env", "auth.json", ".profile/", ".cache/", "*/raw.mp4", "*/build/", "*/vo/", "*/failed.png", ""].join("\n"));
mkdirSync(path.join(dir, "finals"), { recursive: true });

if (example) {
  mkdirSync(path.join(dir, "sample-app"), { recursive: true });
  copyFileSync(path.join(SKILL_DIR, "sample-app", "index.html"), path.join(dir, "sample-app", "index.html"));
  const ex = path.join(dir, "00-example");
  mkdirSync(ex, { recursive: true });
  for (const f of ["script.json", "take.mjs"]) {
    const target = path.join(ex, f);
    if (!existsSync(target)) writeFileSync(target, readFileSync(path.join(SKILL_DIR, "templates", f), "utf8").replaceAll("__SKILL__", SKILL_DIR));
  }
  console.log("created   00-example/ (script.json, take.mjs) and sample-app/");
}

console.log("\ninstalling Playwright and Chromium (a minute or two the first time)...");
execSync("npm install --no-audit --no-fund", { cwd: dir, stdio: "inherit" });
execSync("npx playwright install chromium", { cwd: dir, stdio: "inherit" });

console.log(`\nset up in ${dir}

next:
  1. Put your ElevenLabs key in ${path.join(dir, ".env")} (copy .env.example), or rehearse with --draft voices.
  2. node "${path.join(SKILL_DIR, "scripts", "doctor.mjs")}"            checks everything
  3. node "${path.join(SKILL_DIR, "scripts", "voices.mjs")}"            pick a voice
  4. node "${path.join(SKILL_DIR, "scripts", "login.mjs")}"             sign in to the demo account once
  5. node "${path.join(SKILL_DIR, "scripts", "new.mjs")}" 01-get-started "Get started"`);
