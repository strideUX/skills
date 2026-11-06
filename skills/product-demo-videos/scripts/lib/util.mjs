// Shared helpers: finding the project, loading config and Playwright, ffmpeg bits.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
export const sh = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString();
export const has = (bin) => { try { execSync(`command -v ${bin}`, { stdio: "ignore" }); return true; } catch { return false; } };

export const DEFAULTS = {
  app: { url: "", auth: "auth.json" },
  mode: "browser",
  viewport: { width: 1440, height: 900, scale: 2 },
  output: { width: 1920, height: 1200, fps: 30 },
  voice: {
    provider: "elevenlabs",
    voiceId: "",
    model: "eleven_v4",
    settings: { stability: 0.15, similarity_boost: 0.5, style: 0, use_speaker_boost: true },
    lead: 0.25,
  },
  brand: { name: "", logo: "", background: "#f6f5f1", foreground: "#17181b", accent: "#2f5bea", font: "", url: "" },
  intro: { enabled: true, seconds: 3.2 },
  outro: { enabled: true, seconds: 4, cta: "" },
  transition: { style: "fade", seconds: 0.5 },
  music: { file: "", volume: 0.22, duck: true },
  captions: { burn: false },
  zoom: { scale: 1.6, ease: 0.7 },
  redact: [],
  screen: { frame: "page", display: "Capture screen 0" },
};

function merge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
}

/** Walks up from `start` to the folder holding video.config.json. */
export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "video.config.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Reads KEY=value lines from the project's .env into process.env (without overriding). */
export function loadEnv(root) {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export function loadProject(start) {
  const root = findRoot(start);
  if (!root) throw new Error(`No video.config.json found from ${start || process.cwd()}. Run scripts/init.mjs first.`);
  loadEnv(root);
  const config = merge(DEFAULTS, JSON.parse(readFileSync(path.join(root, "video.config.json"), "utf8")));
  return { root, config };
}

/** A video folder's script.json, with beats normalised to { say }. */
export function loadScript(videoDir) {
  const s = JSON.parse(readFileSync(path.join(videoDir, "script.json"), "utf8"));
  s.beats = (s.beats || []).map((b) => (typeof b === "string" ? { say: b } : b));
  return s;
}

/** Playwright is installed in the user's project, not in the skill folder. */
export async function loadPlaywright(root) {
  const req = createRequire(path.join(root, "package.json"));
  let entry;
  try { entry = req.resolve("playwright"); } catch {
    throw new Error(`Playwright isn't installed in ${root}. Run: cd "${root}" && npm install playwright && npx playwright install chromium`);
  }
  const mod = await import(pathToFileURL(entry).href);
  return mod.chromium ? mod : mod.default;
}

export function duration(file) {
  return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
}

export function videoSize(file) {
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]).toString().trim().split(",").map(Number);
  return { width: w, height: h };
}

/** RGB of one pixel of a video frame at time t. */
export function pixelAt(file, t, x, y) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `format=rgb24,crop=1:1:${Math.round(x)}:${Math.round(y)}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  return [buf[0], buf[1], buf[2]];
}

export function ffmpeg(args, opts = {}) {
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"], ...opts });
}

export const fileUrl = (p) => pathToFileURL(path.resolve(p)).href;
export const resolveUrl = (root, url) => (/^[a-z]+:\/\//i.test(url) ? url : fileUrl(path.resolve(root, url)));
