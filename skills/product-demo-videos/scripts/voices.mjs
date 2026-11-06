#!/usr/bin/env node
// Lists the ElevenLabs voices and speech models this API key can use.
//   node voices.mjs            (run inside the project, reads .env)
import { findRoot, loadEnv } from "./lib/util.mjs";

const root = findRoot();
if (root) loadEnv(root);
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.log("ELEVENLABS_API_KEY isn't set. Put it in the project's .env."); process.exit(1); }
const get = async (p) => { const r = await fetch(`https://api.elevenlabs.io${p}`, { headers: { "xi-api-key": key } }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return r.json(); };

const models = await get("/v1/models");
console.log("speech models:");
for (const m of models.filter((m) => m.can_do_text_to_speech)) console.log(`  ${m.model_id.padEnd(28)} ${m.name}`);

const { voices } = await get("/v1/voices");
console.log("\nvoices (set voice.voiceId in video.config.json):");
for (const v of voices.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) {
  const l = v.labels || {};
  console.log(`  ${v.voice_id}  ${v.name.padEnd(26).slice(0, 26)} ${[v.category, l.gender, l.accent, l.description || l.descriptive, l.use_case].filter(Boolean).join(", ")}`);
  if (v.preview_url) console.log(`      preview: ${v.preview_url}`);
}
