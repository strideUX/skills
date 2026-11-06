#!/usr/bin/env node
// Turns a take into the finished video.
//
//   node assemble.mjs <videoDir> [out.mp4]
//
// 1. Main part: the recording, with each voice clip laid where its beat
//    started, zooms applied, scaled to the output size.
// 2. Finish: intro and outro cards joined with transitions, music ducked under
//    the voice, loudness normalised, captions written (and burned in if asked).
// Writes the video, a poster frame and .srt/.vtt captions beside it.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { loadProject, loadScript, duration, videoSize, ffmpeg } from "./lib/util.mjs";
import { renderCard } from "./lib/cards.mjs";

const dir = path.resolve(process.argv[2] || ".");
const { root, config } = loadProject(dir);
const script = loadScript(dir);
const cfg = { ...config, intro: { ...config.intro, ...(script.intro || {}) }, outro: { ...config.outro, ...(script.outro || {}) }, music: { ...config.music, ...(script.music || {}) } };
const title = script.title || path.basename(dir);
const out = path.resolve(process.argv[3] || path.join(root, "finals", `${path.basename(dir).split("-")[0]} - ${title}.mp4`));
const build = path.join(dir, "build");
mkdirSync(build, { recursive: true });
mkdirSync(path.dirname(out), { recursive: true });

const vo = JSON.parse(readFileSync(path.join(dir, "vo", "manifest.json"), "utf8"));
const marks = JSON.parse(readFileSync(path.join(dir, "marks.json"), "utf8"));
const takeInfo = existsSync(path.join(dir, "take.json")) ? JSON.parse(readFileSync(path.join(dir, "take.json"), "utf8")) : { zooms: [], viewport: config.viewport, frameHeightCss: config.viewport.height };
if (!marks.length) throw new Error("marks.json is empty: the take didn't get through its first beat.");
const lead = config.voice.lead;
const { width: OW, height: OH, fps } = config.output;
const raw = path.join(dir, "raw.mp4");
const R = videoSize(raw);
const clipFile = (m) => path.resolve(dir, vo[m.beat - 1].file);
const last = marks[marks.length - 1];
const mainEnd = last.at + lead + vo[last.beat - 1].dur + 1.95;

// ---------------------------------------------------------------- 1. main part
const num = (n) => Number(n).toFixed(3);
function zoomFilter() {
  const zooms = (takeInfo.zooms || []).filter((z) => z.end > z.start);
  // Fit the recording to the output width, keeping its aspect; pad later if needed.
  const zw = OW, zh = Math.round((OW * R.height) / R.width / 2) * 2;
  if (!zooms.length) return { chain: `scale=${zw}:${zh}:flags=lanczos`, zw, zh };
  const k = R.width / takeInfo.viewport.width; // CSS px -> recorded px
  const E = config.zoom.ease;
  const sm = (p) => `(${p})*(${p})*(3-2*(${p}))`;
  const terms = zooms.map((z) => {
    const pin = `clip((it-${num(z.start)})/${E},0,1)`;
    const pout = `clip((it-${num(z.end)})/${E},0,1)`;
    const w = `(${sm(pin)})*(1-${sm(pout)})`;
    return { w, s: z.scale, cx: (z.box.x + z.box.width / 2) * k, cy: (z.box.y + z.box.height / 2) * k };
  });
  const W = terms.map((t) => t.w).join("+");
  const Z = `1+${terms.map((t) => `(${t.w})*${t.s - 1}`).join("+")}`;
  const CX = `(1-(${W}))*iw/2+${terms.map((t) => `(${t.w})*${num(t.cx)}`).join("+")}`;
  const CY = `(1-(${W}))*ih/2+${terms.map((t) => `(${t.w})*${num(t.cy)}`).join("+")}`;
  const X = `clip(${CX}-iw/zoom/2,0,iw-iw/zoom)`;
  const Y = `clip(${CY}-ih/zoom/2,0,ih-ih/zoom)`;
  return { chain: `zoompan=z='${Z}':x='${X}':y='${Y}':d=1:s=${zw}x${zh}:fps=${fps}`, zw, zh };
}

const mainMov = path.join(build, "main.mov");
{
  const args = ["-i", raw];
  const chains = [], labels = [];
  marks.forEach((m, i) => {
    args.push("-i", clipFile(m));
    const ms = Math.round((m.at + lead) * 1000);
    chains.push(`[${i + 1}:a]adelay=${ms}|${ms}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  const z = zoomFilter();
  const pad = z.zh !== OH || z.zw !== OW ? `,pad=${OW}:${OH}:(ow-iw)/2:(oh-ih)/2:color=${config.brand.background}` : "";
  const video = `[0:v]fps=${fps},${z.chain}${pad},tpad=stop_mode=clone:stop_duration=6,setsar=1,format=yuv420p[v]`;
  const audio = `${chains.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0,apad[voice]`;
  ffmpeg([...args, "-filter_complex", `${audio};${video}`, "-map", "[v]", "-map", "[voice]", "-t", num(mainEnd),
    "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-c:a", "pcm_s16le", mainMov]);
}

// ---------------------------------------------------------------- 2. finish
const parts = [];
const n = script.number || path.basename(dir).match(/^\d+/)?.[0];
if (cfg.intro.enabled) {
  const eyebrow = script.eyebrow ?? (cfg.intro.series ? `${cfg.intro.series}${Number(n) > 0 ? ` · ${Number(n)}` : ""}` : config.brand.name);
  parts.push({ file: await renderCard(root, config, "intro", { title, eyebrow }, cfg.intro.seconds, path.join(root, ".cache", "cards")), kind: "card" });
}
parts.push({ file: mainMov, kind: "main" });
if (cfg.outro.enabled) {
  const eyebrow = script.next ? `Next: ${script.next}` : "";
  parts.push({ file: await renderCard(root, config, "outro", { title, eyebrow, cta: script.cta ?? cfg.outro.cta }, cfg.outro.seconds, path.join(root, ".cache", "cards")), kind: "card" });
}
const T = parts.length > 1 ? config.transition.seconds : 0;
parts.forEach((p) => (p.dur = duration(p.file)));
const total = parts.reduce((a, p) => a + p.dur, 0) - T * (parts.length - 1);
let mainStart = 0;
{
  let acc = 0;
  for (const p of parts) { if (p.kind === "main") { mainStart = acc; break; } acc += p.dur - T; }
}

const args = [];
parts.forEach((p) => args.push("-i", p.file));
const musicFile = cfg.music.file ? path.resolve(root, cfg.music.file) : "";
const withMusic = musicFile && existsSync(musicFile);
if (cfg.music.file && !withMusic) console.warn(`music file not found: ${musicFile}`);

const f = [];
let v = "[0:v]", acc = parts[0].dur;
for (let i = 1; i < parts.length; i++) {
  f.push(`${v}[${i}:v]xfade=transition=${config.transition.style}:duration=${T}:offset=${num(acc - T)}[x${i}]`);
  v = `[x${i}]`;
  acc += parts[i].dur - T;
}
const fadeColor = cfg.outro.enabled ? config.brand.background : "black";
f.push(`${v}fade=t=in:st=0:d=${cfg.intro.enabled ? 0.01 : 0.4},fade=t=out:st=${num(total - 0.6)}:d=0.6:color=${fadeColor}[vf]`);

// ---- sound: voice and music mixed first, then one fixed gain for the whole
// track. (A dynamic normaliser would pump the music up wherever nobody speaks.)
const mix = path.join(build, "mix.wav");
{
  const ms = Math.round(mainStart * 1000);
  const a = ["-i", parts.find((p) => p.kind === "main").file];
  const g = [`[0:a]adelay=${ms}|${ms},apad,atrim=0:${num(total)}[voice]`];
  if (withMusic) {
    a.push("-stream_loop", "-1", "-i", musicFile);
    g.push(`[1:a]atrim=0:${num(total)},asetpts=PTS-STARTPTS,volume=${cfg.music.volume},afade=t=in:d=1.2,afade=t=out:st=${num(total - 2.5)}:d=2.5[mus]`);
    if (cfg.music.duck) g.push(`[voice]asplit[v1][v2]`, `[mus][v2]sidechaincompress=threshold=0.015:ratio=6:attack=60:release=800[duck]`, `[v1][duck]amix=inputs=2:normalize=0[mix]`);
    else g.push(`[voice][mus]amix=inputs=2:normalize=0[mix]`);
  } else g.push(`[voice]anull[mix]`);
  ffmpeg([...a, "-filter_complex", g.join(";"), "-map", "[mix]", "-t", num(total), "-ar", "48000", "-c:a", "pcm_s24le", mix]);
}
const measured = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", mix, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const lufs = parseFloat(measured.match(/Summary:[\s\S]*?I:\s+(-?[\d.]+) LUFS/)?.[1] ?? "-16");
const gain = Math.max(-20, Math.min(20, -16 - lufs));
args.push("-i", mix);
f.push(`[${parts.length}:a]volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false,aresample=48000[af]`);

// ---- captions
const cues = [];
marks.forEach((m) => {
  const clip = vo[m.beat - 1];
  const words = clip.words?.length ? clip.words : [{ w: clip.text, start: 0, end: clip.dur }];
  const base = mainStart + m.at + lead;
  let cur = null;
  for (const w of words) {
    if (!cur) cur = { start: base + w.start, end: base + w.end, text: w.w };
    else { cur.text += ` ${w.w}`; cur.end = base + w.end; }
    if (cur.text.length > 38 || /[.!?]$/.test(w.w)) { cues.push(cur); cur = null; }
  }
  if (cur) cues.push(cur);
});
cues.forEach((c, i) => { c.end = Math.min(c.end + 0.25, cues[i + 1]?.start ?? c.end + 0.25); });
const stamp = (t, sep) => { const h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), msx = Math.round((t % 1) * 1000); return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(msx).padStart(3, "0")}`; };
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`).join("\n");
const vtt = `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n")}`;
const base = out.replace(/\.mp4$/, "");
writeFileSync(`${base}.srt`, srt);
writeFileSync(`${base}.vtt`, vtt);

let vOut = "[vf]";
if (config.captions.burn) {
  const filters = execFileSync("ffmpeg", ["-hide_banner", "-filters"]).toString();
  if (/\bsubtitles\b/.test(filters)) {
    const style = `FontName=Helvetica,FontSize=${Math.round(OH / 60)},PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=${Math.round(OH / 22)}`;
    f.push(`[vf]subtitles='${base.replace(/'/g, "\\'")}.srt':force_style='${style}'[vs]`);
    vOut = "[vs]";
  } else console.warn("This ffmpeg has no subtitles filter (libass). Captions were written as files but not burned in.");
}

ffmpeg([...args, "-filter_complex", f.join(";"), "-map", vOut, "-map", "[af]", "-t", num(total),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);

// Poster: the intro card once it has settled, or a moment into the recording.
const posterAt = cfg.intro.enabled ? Math.min(2.4, parts[0].dur - T - 0.1) : Math.min(2, total / 2);
ffmpeg(["-ss", num(posterAt), "-i", out, "-frames:v", "1", "-q:v", "2", `${base}.jpg`]);

writeFileSync(path.join(build, "timeline.json"), JSON.stringify({ out, total, mainStart, beats: marks.map((m) => ({ beat: m.beat, start: mainStart + m.at + lead, end: mainStart + m.at + lead + vo[m.beat - 1].dur, text: vo[m.beat - 1].text })) }, null, 1));
console.log(`wrote ${out} (${duration(out).toFixed(1)}s)${withMusic ? ", with music" : ""}`);
console.log(`captions: ${base}.srt, ${base}.vtt   poster: ${base}.jpg`);
console.log(`next: node "${path.join(path.dirname(new URL(import.meta.url).pathname), "check.mjs")}" "${dir}" "${out}"`);
