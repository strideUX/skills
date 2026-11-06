#!/usr/bin/env node
// One voice clip per beat, with word timings, so takes can time actions to
// words and assemble.mjs can write captions.
//
//   node voice.mjs <videoDir>            ElevenLabs (needs ELEVENLABS_API_KEY)
//   node voice.mjs <videoDir> --draft    free system voice, to rehearse timing
//
// Clips are cached by a hash of voice, model, settings and text, so only
// changed lines are regenerated. Writes vo/manifest.json: [{ file, dur, text, words }].
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadProject, loadScript, duration, has } from "./lib/util.mjs";

const dir = path.resolve(process.argv[2] || ".");
const draft = process.argv.includes("--draft");
const { config } = loadProject(dir);
const script = loadScript(dir);
const v = { ...config.voice, ...(script.voice || {}) };
const provider = draft ? "draft" : v.provider;
const voDir = path.join(dir, "vo");
mkdirSync(voDir, { recursive: true });

/** Character timings -> word timings. */
function wordsFrom(alignment) {
  if (!alignment) return [];
  const { characters: c, character_start_times_seconds: s, character_end_times_seconds: e } = alignment;
  const words = [];
  let cur = null;
  for (let i = 0; i < c.length; i++) {
    if (/\s/.test(c[i])) { if (cur) words.push(cur); cur = null; continue; }
    if (!cur) cur = { w: "", start: s[i], end: e[i] };
    cur.w += c[i];
    cur.end = e[i];
  }
  if (cur) words.push(cur);
  return words;
}

/** Spread words across the clip by length, for voices without timings. */
function estimateWords(text, dur) {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((a, w) => a + w.length + 1, 0);
  let t = 0.05;
  const span = Math.max(0.1, dur - 0.15);
  return parts.map((w) => { const d = ((w.length + 1) / total) * span; const o = { w, start: t, end: t + d }; t += d; return o; });
}

async function eleven(text, prev, next, file) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY isn't set. Put it in the project's .env, or rehearse with --draft.");
  if (!v.voiceId) throw new Error('No voice chosen. Run voices.mjs and set voice.voiceId in video.config.json.');
  const call = async (withContext) => {
    const body = { text, model_id: v.model, voice_settings: v.settings };
    if (withContext) Object.assign(body, { previous_text: prev || undefined, next_text: next || undefined });
    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${v.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  };
  let res = await call(true);
  if (res.status === 400 || res.status === 422) {
    const msg = await res.text();
    if (/previous_text|next_text|context/i.test(msg)) res = await call(false);
    else throw new Error(`ElevenLabs ${res.status}: ${msg.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  writeFileSync(file, Buffer.from(json.audio_base64, "base64"));
  return wordsFrom(json.alignment || json.normalized_alignment);
}

function systemVoice(text, file) {
  const tmp = file.replace(/\.mp3$/, ".aiff");
  if (process.platform === "darwin") execFileSync("say", ["-r", "185", "-o", tmp, text]);
  else if (has("espeak-ng")) execFileSync("espeak-ng", ["-s", "165", "-w", tmp.replace(/\.aiff$/, ".wav"), text]);
  else throw new Error("No system voice found (macOS say or espeak-ng). Use ElevenLabs instead.");
  const src = existsSync(tmp) ? tmp : tmp.replace(/\.aiff$/, ".wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-ar", "44100", "-b:a", "128k", file]);
  rmSync(src, { force: true });
  return null;
}

const beats = script.beats;
const out = [];
for (const [i, beat] of beats.entries()) {
  const text = beat.say;
  const id = provider === "draft" ? "draft" : `${v.voiceId}|${v.model}|${JSON.stringify(v.settings)}`;
  const h = createHash("sha1").update(`${id}|${text}`).digest("hex").slice(0, 10);
  const base = path.join(voDir, `beat${String(i + 1).padStart(2, "0")}-${provider === "draft" ? "draft-" : ""}${h}`);
  const file = `${base}.mp3`, timing = `${base}.json`;
  if (!existsSync(file)) {
    const words = provider === "draft" ? systemVoice(text, file) : await eleven(text, beats[i - 1]?.say, beats[i + 1]?.say, file);
    if (words) writeFileSync(timing, JSON.stringify(words));
  }
  const dur = duration(file);
  const words = existsSync(timing) ? JSON.parse(readFileSync(timing, "utf8")) : estimateWords(text, dur);
  out.push({ file: path.relative(dir, file), dur, text, words, provider });
  console.log(`beat ${i + 1}: ${dur.toFixed(2)}s  ${text.slice(0, 70)}`);
}
writeFileSync(path.join(voDir, "manifest.json"), JSON.stringify(out, null, 1));
const total = out.reduce((a, b) => a + b.dur, 0);
console.log(`total voice: ${total.toFixed(1)}s${provider === "draft" ? " (draft voice: re-run without --draft for the real one, then record the take again)" : ""}`);
