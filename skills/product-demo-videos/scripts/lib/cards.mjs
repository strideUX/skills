// Renders an HTML card (intro, outro, chapter) to a silent video, frame by
// frame: every CSS animation is paused and seeked to the frame's time before
// each screenshot, so the motion is smooth no matter how slow the machine is.
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { SKILL_DIR, loadPlaywright, fileUrl } from "./util.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** The template: the project's cards/<name>.html if present, else the skill's. */
function template(root, name) {
  const own = path.join(root, "cards", `${name}.html`);
  return readFileSync(existsSync(own) ? own : path.join(SKILL_DIR, "templates", "cards", `${name}.html`), "utf8");
}

export function cardHtml(root, config, name, vars) {
  const b = config.brand;
  const logo = b.logo ? `<img src="${fileUrl(path.resolve(root, b.logo))}" alt="">` : esc(b.name);
  const fontFace = b.fontFile ? `@font-face { font-family: "Brand"; src: url("${fileUrl(path.resolve(root, b.fontFile))}"); }` : "";
  const font = b.fontFile ? `"Brand", ${FONT}` : b.font || FONT;
  const fill = { brand: esc(b.name), url: esc(b.url), ...Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)])), logo, fontFace };
  const html = template(root, name).replace(/\{\{(\w+)\}\}/g, (_, k) => fill[k] ?? "");
  return html.replace("<head>", `<head><style>:root{--bg:${b.background};--fg:${b.foreground};--accent:${b.accent};--font:${font}}</style>`);
}

/** Renders a card to `out` (mp4, no audio). Cached by its HTML, size and length. */
export async function renderCard(root, config, name, vars, seconds, outDir) {
  const { width, height, fps } = config.output;
  const html = cardHtml(root, config, name, vars);
  const h = createHash("sha1").update(`${html}|${width}x${height}@${fps}|${seconds}`).digest("hex").slice(0, 10);
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}-${h}.mp4`);
  if (existsSync(out)) return out;

  const { chromium } = await loadPlaywright(root);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", out], { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.round(seconds * fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), (f * 1000) / fps);
    const jpg = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  return out;
}
