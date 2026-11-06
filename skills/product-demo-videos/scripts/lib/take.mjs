// The take runner. A take file imports this, then describes its beats:
//
//   import { take } from "<skill>/scripts/lib/take.mjs";
//   await take(import.meta.url, async ({ page, beat, click, hover, type, zoom }) => {
//     await beat(async (b) => { await hover(page.getByRole("button", { name: "New task" })); });
//     await beat(async (b) => { await b.at("Create task"); await click(page.getByText("Create task")); });
//   });
//
// Two recording modes, set by "mode" in video.config.json:
//   browser  Headless Chromium. Frames come straight from the browser, and the
//            pointer is drawn into the page. Works on macOS, Linux and Windows,
//            and never touches the real mouse. The default.
//   screen   A visible browser window, the real pointer (cliclick) and a screen
//            recording (ffmpeg avfoundation). macOS only. For things outside
//            the page: native menus, extensions, a terminal beside the browser.
//
// Flags: --dry runs every action fast, without recording or waiting for the
// voice, to check the locators. --keep leaves the browser open on failure.

import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cursorScript } from "./cursor.mjs";
import { loadProject, loadScript, loadPlaywright, sleep, resolveUrl } from "./util.mjs";

const DRY = process.argv.includes("--dry");
const KEEP = process.argv.includes("--keep");
const CHROME_GUESS = 87; // browser chrome height in points; measured and corrected after launch

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Fit the page viewport to exactly width x height by resizing the window. */
async function fitWindow(page, width, height) {
  for (let i = 0; i < 3; i++) {
    const [iw, ih] = await page.evaluate(() => [innerWidth, innerHeight]);
    if (iw === width && ih === height) return;
    const cdp = await page.context().newCDPSession(page);
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: bounds.width + (width - iw), height: bounds.height + (height - ih) } });
    await cdp.detach().catch(() => {});
    await sleep(250);
  }
  const [iw, ih] = await page.evaluate(() => [innerWidth, innerHeight]);
  if (iw !== width || ih !== height) console.warn(`viewport is ${iw}x${ih}, wanted ${width}x${height}. Is the screen big enough?`);
}

// ---------------------------------------------------------------- recorders

/** Browser mode: CDP screencast frames, resampled to a constant frame rate. */
function browserRecorder(page, file, fps) {
  let cdp, ff, last = null, firstTs = null, written = 0, t0 = 0;
  const writeUntil = (t) => {
    while (last && written / fps <= t) { ff.stdin.write(last); written++; }
  };
  return {
    async start() {
      ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", file], { stdio: ["pipe", "ignore", "inherit"] });
      ff.stdin.on("error", () => {});
      cdp = await page.context().newCDPSession(page);
      let resolveFirst;
      const first = new Promise((r) => (resolveFirst = r));
      cdp.on("Page.screencastFrame", (e) => {
        cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {});
        const ts = e.metadata.timestamp;
        const buf = Buffer.from(e.data, "base64");
        if (firstTs === null) { firstTs = ts; t0 = Date.now(); last = buf; resolveFirst(); return; }
        writeUntil(ts - firstTs);
        last = buf;
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 8192, maxHeight: 8192, everyNthFrame: 1 });
      // Nudge a repaint so the first frame arrives even on a still page.
      await page.evaluate(() => { document.documentElement.style.outline = "0 solid transparent"; requestAnimationFrame(() => (document.documentElement.style.outline = "")); });
      await Promise.race([first, sleep(5000)]);
      if (firstTs === null) throw new Error("The browser sent no frames. Try again, or run doctor.mjs.");
      return t0;
    },
    async stop() {
      writeUntil((Date.now() - t0) / 1000);
      await cdp.send("Page.stopScreencast").catch(() => {});
      ff.stdin.end();
      await new Promise((r) => ff.on("close", r));
    },
  };
}

/** Screen mode: avfoundation capture of the main display, cropped to the window. */
function screenRecorder(crop, display, file, fps) {
  let ff, t0 = 0;
  return {
    async start() {
      ff = spawn("ffmpeg", ["-hide_banner", "-y", "-f", "avfoundation", "-capture_cursor", "1", "-framerate", String(fps), "-i", `${display}:none`,
        "-vf", `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, "-c:v", "h264_videotoolbox", "-b:v", "24M", file], { stdio: ["pipe", "ignore", "pipe"] });
      let err = "";
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`ffmpeg never started recording "${display}". Run doctor.mjs; ${err.slice(-300)}`)), 15000);
        ff.stderr.on("data", (d) => { err += d; if (!t0 && /frame=|Press \[q\]/.test(String(d))) { t0 = Date.now(); clearTimeout(timer); resolve(); } });
        ff.on("close", () => { clearTimeout(timer); if (!t0) reject(new Error(`ffmpeg exited before recording: ${err.slice(-400)}`)); });
      });
      return t0;
    },
    async stop() {
      ff.stdin.write("q");
      await new Promise((r) => ff.on("close", r));
    },
  };
}

// ---------------------------------------------------------------- pointers

function browserPointer(page) {
  let pos = { x: 0, y: 0 }, bend = 1;
  return {
    async init(x, y) { pos = { x, y }; await page.mouse.move(x, y); },
    async move(x, y) {
      const dx = x - pos.x, dy = y - pos.y, dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      const ms = DRY ? 0 : Math.min(950, Math.max(320, 260 + dist * 0.42));
      const steps = Math.max(1, Math.round(ms / 16));
      // A slight arc, alternating sides, reads as a hand rather than a robot.
      bend = -bend;
      const cx = pos.x + dx / 2 - dy * 0.08 * bend, cy = pos.y + dy / 2 + dx * 0.08 * bend;
      const from = pos;
      for (let i = 1; i <= steps; i++) {
        const p = ease(i / steps), q = 1 - p;
        await page.mouse.move(q * q * from.x + 2 * q * p * cx + p * p * x, q * q * from.y + 2 * q * p * cy + p * p * y);
        if (!DRY) await sleep(16);
      }
      pos = { x, y };
    },
    async click(x, y) { await this.move(x, y); await sleep(DRY ? 0 : 160); await page.mouse.down(); await sleep(DRY ? 0 : 90); await page.mouse.up(); await sleep(DRY ? 0 : 220); },
  };
}

function screenPointer(origin) {
  const run = (...a) => execFileSync("cliclick", a);
  const scr = (x, y) => [Math.round(origin.x + x), Math.round(origin.y + y)];
  return {
    async init(x, y) { const [sx, sy] = scr(x, y); run(`m:${sx},${sy}`); },
    async move(x, y) {
      const [sx, sy] = scr(x, y);
      run("-e", "400", `m:${sx},${sy}`);
      run(`m:${sx},${sy}`); // the eased move can stop short of the target
      await sleep(150);
    },
    async click(x, y) { await this.move(x, y); await sleep(200); const [sx, sy] = scr(x, y); run(`c:${sx},${sy}`); await sleep(250); },
  };
}

// ---------------------------------------------------------------- the take

export async function take(takeFileUrl, body, opts = {}) {
  const videoDir = opts.videoDir || path.dirname(fileURLToPath(takeFileUrl));
  const { root, config } = loadProject(videoDir);
  const script = loadScript(videoDir);
  const mode = opts.mode || script.mode || config.mode;
  const vp = { ...config.viewport, ...(script.viewport || {}) };
  const fps = config.output.fps;
  const lead = config.voice.lead;
  const manifestFile = path.join(videoDir, "vo", "manifest.json");
  if (!existsSync(manifestFile) && !DRY) throw new Error(`No voice yet. Run: node "${path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "voice.mjs")}" "${videoDir}"`);
  const vo = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : script.beats.map((b) => ({ dur: 0.1, text: b.say, words: [] }));
  if (vo.length !== script.beats.length) console.warn(`script.json has ${script.beats.length} beats but the voice has ${vo.length}. Run voice.mjs again.`);

  const { chromium } = await loadPlaywright(root);
  const authFile = config.app.auth ? path.resolve(root, config.app.auth) : null;
  const storageState = authFile && existsSync(authFile) ? authFile : undefined;
  const startUrl = resolveUrl(root, script.url || config.app.url);
  const initScript = cursorScript({ arrow: mode === "browser", redact: config.redact });

  let ctx, browser, page, recorder, pointer, origin = { x: 0, y: 0 }, crop = null;
  if (mode === "screen") {
    if (process.platform !== "darwin") throw new Error("Screen mode needs macOS. Use mode \"browser\".");
    ctx = await chromium.launchPersistentContext(path.join(root, ".profile"), {
      headless: false, viewport: null,
      args: [`--window-size=${vp.width},${vp.height + CHROME_GUESS}`, "--window-position=0,0", "--hide-crash-restore-bubble", "--disable-infobars"],
    });
    if (storageState) await ctx.addCookies(JSON.parse(readFileSync(storageState, "utf8")).cookies || []);
    page = ctx.pages()[0] || (await ctx.newPage());
  } else {
    browser = await chromium.launch({
      channel: "chromium", headless: true,
      args: [`--force-device-scale-factor=${vp.scale}`, `--window-size=${vp.width},${vp.height + CHROME_GUESS}`, "--hide-scrollbars"],
    });
    ctx = await browser.newContext({ viewport: null, storageState });
    page = await ctx.newPage();
  }
  await ctx.addInitScript(initScript);
  await page.goto(startUrl, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await fitWindow(page, vp.width, vp.height);

  const m = await page.evaluate(() => ({ sx: screenX, sy: screenY, ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio }));
  const chromeTop = m.oh - m.ih;
  if (mode === "screen") {
    origin = { x: m.sx, y: m.sy + chromeTop };
    const whole = config.screen.frame === "window";
    const top = whole ? m.sy : origin.y;
    crop = { x: Math.round(m.sx * m.dpr), y: Math.round(top * m.dpr), w: Math.round(m.iw * m.dpr), h: Math.round((whole ? m.oh : m.ih) * m.dpr) };
    try { execFileSync("osascript", ["-e", 'tell application "System Events" to set frontmost of (first process whose name contains "Chrom" and name does not contain "Google Chrome Helper" and background only is false) to true']); } catch {}
    pointer = screenPointer(origin);
  } else {
    pointer = browserPointer(page);
  }
  // Where the page's (0,0) sits in the recorded frame, in CSS pixels. Used for zooms.
  const frameOffset = mode === "screen" && config.screen.frame === "window" ? chromeTop : 0;

  const start = script.pointer || { x: Math.round(vp.width * 0.55), y: Math.round(vp.height * 0.5) };
  await pointer.init(start.x, start.y);
  if (mode === "screen") await page.mouse.click(start.x, start.y).catch(() => {}); // focus the page, not the address bar
  await sleep(DRY ? 0 : 600);

  // ---- helpers handed to the take
  const box = async (target) => {
    if (target && typeof target.x === "number" && typeof target.width !== "number") return { x: target.x, y: target.y, width: 0, height: 0 };
    if (target && typeof target.width === "number") return target;
    await target.waitFor({ state: "visible", timeout: 10000 });
    await target.scrollIntoViewIfNeeded().catch(() => {});
    const b = await target.boundingBox();
    if (!b) throw new Error(`Couldn't find a box for ${target}`);
    return b;
  };
  const centre = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  const move = async (target) => pointer.move(...centre(await box(target)));
  const hover = move;
  const click = async (target) => pointer.click(...centre(await box(target)));
  const type = async (target, text, { delay = [35, 95] } = {}) => {
    if (target) await click(target);
    for (const ch of text) {
      await page.keyboard.type(ch);
      if (!DRY) await sleep(delay[0] + Math.random() * (delay[1] - delay[0]));
    }
  };
  const press = (key) => page.keyboard.press(key);
  const pause = (ms) => sleep(DRY ? 0 : ms);

  const marks = [], zooms = [];
  let t0 = 0, idx = 0;
  const now = () => (DRY ? 0 : (Date.now() - t0) / 1000);
  const zoom = async (target, { scale = config.zoom.scale } = {}) => {
    const b = await box(target);
    const open = zooms.find((z) => z.end == null);
    if (open) open.end = now();
    zooms.push({ start: now(), end: null, scale, box: { x: b.x, y: b.y + frameOffset, width: b.width, height: b.height } });
  };
  const zoomOut = async () => { const open = zooms.find((z) => z.end == null); if (open) open.end = now(); };

  const beat = async (actions, { tail = 400 } = {}) => {
    const i = idx++;
    const clip = vo[i];
    if (!clip) throw new Error(`Beat ${i + 1} has no voice line. script.json has ${vo.length} beats.`);
    const startedAt = Date.now();
    marks.push({ beat: i + 1, at: now() });
    const words = (clip.words || []).map((w) => ({ ...w, n: norm(w.w).join(" ") }));
    let cursor = 0;
    const b = {
      index: i, line: clip.text,
      /** Waits until `phrase` is spoken in this beat's line. */
      at: async (phrase, { offset = 0 } = {}) => {
        if (DRY) return;
        const want = norm(phrase);
        for (let k = cursor; k < words.length; k++) {
          const span = words.slice(k, k + want.length).map((w) => w.n).join(" ");
          if (span === want.join(" ")) {
            cursor = k + 1;
            return sleep(startedAt + (lead + words[k].start + offset) * 1000 - Date.now());
          }
        }
        console.warn(`beat ${i + 1}: "${phrase}" isn't in the line: ${clip.text}`);
      },
    };
    await Promise.all([actions(b), sleep(DRY ? 0 : (clip.dur + lead) * 1000)]);
    const over = (Date.now() - startedAt) / 1000 - (clip.dur + lead);
    if (!DRY && over > 0.3) console.warn(`beat ${i + 1}: the actions ran ${over.toFixed(1)}s past the line. Expect a pause in the voice there.`);
    await sleep(DRY ? 0 : tail);
  };

  const raw = path.join(videoDir, "raw.mp4");
  let ok = false;
  try {
    if (!DRY) {
      recorder = mode === "screen" ? screenRecorder(crop, config.screen.display, raw, fps) : browserRecorder(page, raw, fps);
      t0 = await recorder.start();
      await sleep(1000);
    }
    await body({ page, context: ctx, beat, move, hover, click, type, press, pause, zoom, zoomOut, sleep: pause });
    ok = true;
    if (idx < vo.length) console.warn(`The take used ${idx} of ${vo.length} beats.`);
    await sleep(DRY ? 0 : 1500);
  } catch (err) {
    console.error(`take failed in beat ${idx}: ${String(err.message || err).split("\n")[0]}`);
    mkdirSync(videoDir, { recursive: true });
    await page.screenshot({ path: path.join(videoDir, "failed.png") }).catch(() => {});
    console.error(`screenshot of the moment it failed: ${path.join(videoDir, "failed.png")}`);
  } finally {
    if (recorder) await recorder.stop().catch((e) => console.error("recorder:", e.message));
    if (!DRY) {
      const end = now();
      for (const z of zooms) if (z.end == null) z.end = end;
      writeFileSync(path.join(videoDir, "marks.json"), JSON.stringify(marks, null, 1));
      writeFileSync(path.join(videoDir, "take.json"), JSON.stringify({ mode, viewport: { width: vp.width, height: vp.height }, frameOffset, frameHeightCss: vp.height + frameOffset, zooms, ok, recordedAt: new Date().toISOString() }, null, 1));
      console.log(`marks: ${marks.map((mk) => `${mk.beat}@${mk.at.toFixed(1)}s`).join("  ")}`);
    } else {
      console.log(ok ? `dry run passed: ${idx} beats, every locator found` : "dry run failed");
    }
    if (!(KEEP && !ok)) await (browser || ctx).close().catch(() => {});
  }
  if (!ok) process.exitCode = 1;
  return ok;
}
