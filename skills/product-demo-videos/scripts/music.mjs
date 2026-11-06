#!/usr/bin/env node
// Makes an instrumental music bed with the ElevenLabs Music API (paid plans
// only; check their terms for how you may use the track). Or skip this and
// point music.file in video.config.json at a track you have the rights to.
//
//   node music.mjs [--seconds 90] [--prompt "..."] [--model music_v1]
//
// Saves to music/<hash>.mp3 and prints the path to put in music.file.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { loadProject } from "./lib/util.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const { root } = loadProject();
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.log("ELEVENLABS_API_KEY isn't set. Put it in the project's .env."); process.exit(1); }
const seconds = Number(flag("--seconds", 90));
const model = flag("--model", "music_v1");
const prompt = flag("--prompt", "Calm, modern instrumental bed for a software product walkthrough. Soft felt piano, light plucked synth and a gentle steady pulse around 90 BPM. Warm and unobtrusive, sits under a voice, no vocals, no big drops, no sudden changes.");

const h = createHash("sha1").update(`${model}|${seconds}|${prompt}`).digest("hex").slice(0, 10);
mkdirSync(path.join(root, "music"), { recursive: true });
const file = path.join(root, "music", `bed-${h}.mp3`);
if (!existsSync(file)) {
  console.log(`composing ${seconds}s of music (this can take a minute)...`);
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: Math.round(seconds * 1000), model_id: model, force_instrumental: true }),
  });
  if (!res.ok) { console.log(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`); process.exit(1); }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
console.log(`music: ${path.relative(root, file)}\nset "music": { "file": "${path.relative(root, file)}" } in video.config.json`);
