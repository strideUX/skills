#!/usr/bin/env node
// Checks everything the pipeline needs and says exactly how to fix what's missing.
//
//   node doctor.mjs            run inside a project made with init.mjs
//   node doctor.mjs --screen   also check screen mode (macOS permissions)
//   node doctor.mjs --smoke    also make a short test video from the sample app
//                              (draft voice, no API calls), end to end
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { findRoot, loadProject, loadPlaywright, has, SKILL_DIR, resolveUrl } from "./lib/util.mjs";

const args = process.argv.slice(2);
const results = [];
const ok = (m) => results.push(["ok", m]);
const warn = (m, fix) => results.push(["warn", m, fix]);
const fail = (m, fix) => results.push(["FIX", m, fix]);
const mac = process.platform === "darwin";
const install = (pkg) => (mac ? `brew install ${pkg}` : process.platform === "win32" ? `winget install ${pkg}` : `sudo apt install ${pkg}`);
const terminal = process.env.TERM_PROGRAM ? process.env.TERM_PROGRAM.replace(".app", "").replace("Apple_Terminal", "Terminal").replace("vscode", "VS Code (or Cursor)") : "your terminal app";

// ---- tools
const major = Number(process.versions.node.split(".")[0]);
major >= 18 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} is too old`, "Install Node 20 or newer (https://nodejs.org or nvm).");
if (!has("ffmpeg") || !has("ffprobe")) fail("ffmpeg isn't installed", install("ffmpeg"));
else {
  const enc = execFileSync("ffmpeg", ["-hide_banner", "-encoders"]).toString();
  /libx264/.test(enc) ? ok("ffmpeg with libx264") : fail("ffmpeg is missing libx264", `Reinstall a full build: ${install("ffmpeg")}`);
}

// ---- project
const root = findRoot();
let config;
if (!root) fail("No project here (no video.config.json)", `node "${path.join(SKILL_DIR, "scripts", "init.mjs")}" <folder>`);
else {
  ({ config } = loadProject(root));
  ok(`project: ${root}`);
  if (config.captions.burn) {
    /\bsubtitles\b/.test(execFileSync("ffmpeg", ["-hide_banner", "-filters"]).toString()) ? ok("ffmpeg can burn in captions") : warn("ffmpeg has no subtitles filter, so captions can't be burned in", mac ? "brew install ffmpeg (the Homebrew build includes libass)" : "Install an ffmpeg build with libass");
  }

  // Playwright and Chromium
  try {
    const pw = await loadPlaywright(root);
    try {
      const b = await pw.chromium.launch({ channel: "chromium", headless: true });
      await b.close();
      ok("Playwright Chromium launches");
    } catch (e) {
      fail("Playwright's Chromium isn't installed", `cd "${root}" && npx playwright install chromium`);
    }
  } catch (e) { fail("Playwright isn't installed in the project", `cd "${root}" && npm install && npx playwright install chromium`); }

  // The app
  const url = resolveUrl(root, config.app.url || "");
  if (!config.app.url || /example\.com/.test(config.app.url)) fail("app.url isn't set", "Set app.url in video.config.json to the app's address.");
  else if (url.startsWith("file:")) existsSync(new URL(url)) ? ok(`app: ${config.app.url}`) : fail(`app file not found: ${url}`, "Fix app.url in video.config.json.");
  else {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "manual" }); ok(`app reachable: ${url} (HTTP ${r.status})`); }
    catch (e) { fail(`can't reach ${url}`, "Is the app running, and is the address right?"); }
  }
  const auth = config.app.auth ? path.resolve(root, config.app.auth) : null;
  if (auth && !existsSync(auth) && !String(config.app.url).startsWith("file:") && !/^sample-app/.test(config.app.url)) warn("no saved sign-in yet", `If the app needs a login: node "${path.join(SKILL_DIR, "scripts", "login.mjs")}" (sign in to the DEMO account)`);
  else if (auth && existsSync(auth)) ok("saved sign-in found");

  // Voice
  const v = config.voice;
  if (v.provider === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) fail("ELEVENLABS_API_KEY isn't set", `Copy .env.example to .env in ${root} and paste the key there (elevenlabs.io > Developers > API keys). Or rehearse with: voice.mjs <video> --draft`);
    else {
      const get = (p) => fetch(`https://api.elevenlabs.io${p}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10000) });
      try {
        const r = await get("/v1/models");
        if (r.status === 401) fail("the ElevenLabs key was rejected", "Check the key in .env, and that it has Text to Speech access.");
        else if (r.ok) {
          const models = await r.json();
          const m = models.find((x) => x.model_id === v.model);
          if (m?.can_do_text_to_speech) ok(`ElevenLabs model ${v.model}`);
          else fail(`model "${v.model}" isn't available to this key`, `Pick one from: ${models.filter((x) => x.can_do_text_to_speech).map((x) => x.model_id).join(", ")}`);
          if (!v.voiceId) fail("no voice chosen", `node "${path.join(SKILL_DIR, "scripts", "voices.mjs")}", then set voice.voiceId in video.config.json`);
          else {
            const vr = await get(`/v1/voices/${v.voiceId}`);
            vr.ok ? ok(`voice: ${(await vr.json()).name}`) : fail(`voice ${v.voiceId} not found for this key`, `node "${path.join(SKILL_DIR, "scripts", "voices.mjs")}" lists the ones you can use`);
          }
        } else warn(`ElevenLabs answered HTTP ${r.status}`, "Try again in a minute.");
      } catch { warn("couldn't reach ElevenLabs", "Check the network."); }
    }
  }

  // Assets
  if (config.brand.logo) existsSync(path.resolve(root, config.brand.logo)) ? ok("brand logo found") : fail(`logo not found: ${config.brand.logo}`, "Fix brand.logo in video.config.json (SVG or PNG).");
  if (config.music.file) existsSync(path.resolve(root, config.music.file)) ? ok("music file found") : fail(`music not found: ${config.music.file}`, `Fix music.file, or make one: node "${path.join(SKILL_DIR, "scripts", "music.mjs")}"`);
}

// ---- screen mode
if (args.includes("--screen") || config?.mode === "screen") {
  if (!mac) fail("screen mode needs macOS", 'Use "mode": "browser" in video.config.json.');
  else {
    if (!has("cliclick")) fail("cliclick isn't installed (moves the real pointer)", "brew install cliclick");
    else {
      const pos = () => execFileSync("cliclick", ["p:."]).toString().trim().split(",").map(Number);
      const [x, y] = pos();
      execFileSync("cliclick", [`m:${x + 3},${y + 3}`]);
      const [x2] = pos();
      execFileSync("cliclick", [`m:${x},${y}`]);
      x2 !== x ? ok("Accessibility permission (the pointer can be moved)") : fail(`${terminal} can't move the pointer`, `System Settings > Privacy & Security > Accessibility: turn on ${terminal}. Then quit ${terminal} completely and reopen it.`);
    }
    const list = spawnSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { encoding: "utf8" }).stderr;
    const screens = [...list.matchAll(/\[\d+\] (Capture screen \d+)/g)].map((m) => m[1]);
    const display = config?.screen?.display || "Capture screen 0";
    if (!screens.includes(display)) fail(`"${display}" isn't a capture device`, `Set screen.display to one of: ${screens.join(", ") || "(none found: Screen Recording permission?)"}`);
    else {
      const tmp = path.join(os.tmpdir(), `nsr-doctor-${process.pid}.png`);
      const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "avfoundation", "-framerate", "30", "-i", `${display}:none`, "-frames:v", "1", tmp], { encoding: "utf8", timeout: 15000 });
      if (r.status !== 0 || !existsSync(tmp)) fail(`${terminal} can't record the screen`, `System Settings > Privacy & Security > Screen & System Audio Recording: turn on ${terminal}. Then quit it completely and reopen it.`);
      else {
        const stats = spawnSync("ffmpeg", ["-hide_banner", "-i", tmp, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], { encoding: "utf8" }).stderr;
        const yavg = parseFloat(stats.match(/YAVG=([\d.]+)/)?.[1] ?? "0");
        rmSync(tmp, { force: true });
        yavg > 4 ? ok(`screen recording works (${display}). Run calibrate.mjs --mode screen before the first take.`) : fail("the screen recording came out black", `Give ${terminal} Screen Recording permission, then quit it completely and reopen it.`);
      }
    }
  }
}

// ---- report
console.log("");
for (const [s, m, fix] of results) console.log(`${s.padEnd(4)} ${m}${fix ? `\n     -> ${fix}` : ""}`);
const failed = results.filter((r) => r[0] === "FIX").length;
console.log(failed ? `\n${failed} thing(s) to fix before recording.` : "\nready.");

// ---- smoke test: the whole pipeline on the sample app, with a draft voice
if (args.includes("--smoke")) {
  if (!root) process.exit(1);
  const smoke = path.join(root, ".cache", "smoke");
  rmSync(smoke, { recursive: true, force: true });
  const vid = path.join(smoke, "00-smoke");
  mkdirSync(path.join(smoke, "sample-app"), { recursive: true });
  mkdirSync(vid, { recursive: true });
  copyFileSync(path.join(SKILL_DIR, "sample-app", "index.html"), path.join(smoke, "sample-app", "index.html"));
  const cfg = JSON.parse(readFileSync(path.join(SKILL_DIR, "templates", "video.config.json"), "utf8"));
  Object.assign(cfg, { mode: "browser", app: { url: "sample-app/index.html", auth: "" } });
  cfg.brand = { ...cfg.brand, name: "Acme Projects", url: "acme.example" };
  cfg.voice.provider = "draft";
  writeFileSync(path.join(smoke, "video.config.json"), JSON.stringify(cfg, null, 2));
  writeFileSync(path.join(vid, "script.json"), readFileSync(path.join(SKILL_DIR, "templates", "script.json")));
  writeFileSync(path.join(vid, "take.mjs"), readFileSync(path.join(SKILL_DIR, "templates", "take.mjs"), "utf8").replaceAll("__SKILL__", SKILL_DIR));
  const step = (label, cmd) => {
    console.log(`\nsmoke: ${label}`);
    const r = spawnSync(process.execPath, cmd, { cwd: smoke, stdio: "inherit" });
    if (r.status !== 0) { console.log(`smoke test failed at: ${label}`); process.exit(1); }
  };
  const S = (f) => path.join(SKILL_DIR, "scripts", f);
  step("draft voice", [S("voice.mjs"), vid, "--draft"]);
  step("take (browser mode, nothing touches your mouse)", [path.join(vid, "take.mjs")]);
  step("assemble", [S("assemble.mjs"), vid, path.join(smoke, "smoke-test.mp4")]);
  step("check", [S("check.mjs"), vid, path.join(smoke, "smoke-test.mp4")]);
  console.log(`\nsmoke test passed: ${path.join(smoke, "smoke-test.mp4")}`);
}
if (failed) process.exitCode = 1;
