---
name: narrated-screen-recordings
description: Make short narrated product walkthrough videos. A script drives a real browser and pointer while ffmpeg records the screen, and ElevenLabs voices one line per step, timed to the action. Use when asked to make a tutorial, getting-started, onboarding or demo video of a web app.
---

# Narrated screen recordings

You make short (about 1 to 2 minute) walkthrough videos of a web app. Each video is a list of **beats**. A beat is one spoken line plus the on-screen actions that go with it. The pipeline is:

1. Write the narration as beats.
2. Generate one voice clip per beat with ElevenLabs, and measure how long each one is.
3. Run a **take**: a script that drives a real browser and the real mouse pointer while ffmpeg records the screen. Each beat's actions run for at least as long as that beat's voice clip, and the script writes down the moment each beat started.
4. **Assemble**: lay each voice clip on the recording at the moment its beat started, then encode the final video.

Because the take waits for each clip's length, the voice always fits the picture. If a line changes, regenerate that clip and do the take again.

## Inputs to ask for before starting

- The app's URL and which flow each video covers, in order. Videos in a series can build on each other.
- A **demo account** to record with, separate from any real account. Never record with someone's real data on screen.
- An ElevenLabs API key in `ELEVENLABS_API_KEY`, a voice id, and voice settings. Defaults that worked well: model `eleven_v4`, stability 0.15, similarity_boost 0.5, style 0, use_speaker_boost true. Let the user pick the voice.
- Output size. Default: a 1440x900 browser window, delivered at 1920x1200 H.264.

## Folder layout

```
pipeline/
  vo.mjs                one voice clip per beat
  assemble.py           recording + voice -> final mp4
  auth.json             saved sign-in session for the demo account
  profile/              persistent browser profile used by takes
  peek-*.mjs            headless scouting scripts (see step 2)
  reset-NN.mjs          puts the demo account back in the state video NN starts from
  take-NN.mjs           the take for video NN
  NN-slug/
    script.json         voice settings and the beats
    vo/                 the clips, plus manifest.json (file, duration, text)
    raw.mp4             the take's recording
    marks.json          [{ beat, at }]: when each beat started, in seconds
```

Finals go to `NN - Title.mp4`.

## Step 1: write the script

`NN-slug/script.json`:

```json
{
  "voice": "<voice id>",
  "model": "eleven_v4",
  "settings": { "stability": 0.15, "similarity_boost": 0.5, "style": 0, "use_speaker_boost": true },
  "beats": [
    "In this video, we'll <outcome>.",
    "To start, click <thing>.",
    "..."
  ]
}
```

Writing rules:
- The first beat says what the video does. The last beat says where you've ended up and what the next video covers.
- One action per beat, in the words the UI uses ("click Send invite", not "submit the form").
- Short, spoken sentences. Read every line aloud before generating it.
- Check every claim (prices, limits, roles, how long a link stays valid) against the real product before recording it.

## Step 2: scout the UI headlessly

Before writing a take, write small `peek-*.mjs` scripts. Each one opens the flow in a headless Playwright browser with the saved session, prints the visible text of dialogs and menus, lists the available options, and takes screenshots. Use these to find stable locators (`getByRole`, names, visible text) and the exact labels the narration should use. Fix the script's wording to match what is actually on screen.

## Step 3: generate the voice

`vo.mjs <videoDir>`: for each beat, POST to `https://api.elevenlabs.io/v1/text-to-speech/<voice>?output_format=mp3_44100_128` with header `xi-api-key` and body `{ text, model_id, voice_settings, previous_text, next_text }`. Pass the neighboring beats as `previous_text` and `next_text`, so the intonation flows from one clip into the next. Name each file by a hash of voice + model + settings + text, so only changed lines get regenerated. Measure each clip's length with `ffprobe` and write `vo/manifest.json` as `[{ file, dur, text }]`. Print the total length.

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
const dir = process.argv[2];
const cfg = JSON.parse(readFileSync(`${dir}/script.json`, "utf8"));
mkdirSync(`${dir}/vo`, { recursive: true });
const out = [];
for (const [i, text] of cfg.beats.entries()) {
  const h = createHash("sha1").update(cfg.voice + cfg.model + JSON.stringify(cfg.settings || {}) + text).digest("hex").slice(0, 10);
  const file = `${dir}/vo/beat${String(i + 1).padStart(2, "0")}-${h}.mp3`;
  if (!existsSync(file)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${cfg.voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: cfg.model, voice_settings: cfg.settings, previous_text: cfg.beats[i - 1], next_text: cfg.beats[i + 1] }),
    });
    if (!res.ok) { console.log(`beat ${i + 1}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`).toString());
  out.push({ file, dur, text });
  console.log(`beat ${i + 1}: ${dur.toFixed(2)}s  ${text.slice(0, 60)}`);
}
writeFileSync(`${dir}/vo/manifest.json`, JSON.stringify(out, null, 1));
console.log("total voice:", out.reduce((a, b) => a + b.dur, 0).toFixed(1) + "s");
```

## Step 4: the take

`take-NN.mjs <pipelineDir> <videoDir>`. It drives a **visible** browser and the **real** pointer, so the recording shows natural mouse movement, hovers and menus.

- **Browser:** `chromium.launchPersistentContext(profileDir, { headless: false, viewport: null, args: ["--window-size=1440,900", "--window-position=0,0", "--hide-crash-restore-bubble"] })`, then load the saved cookies. Bring the window to the front with `osascript`, and click once inside the page so focus isn't in the address bar.
- **Pointer:** use Playwright only to find elements and read their bounding boxes. Move and click with `cliclick`, converting page coordinates to screen points by adding the page's on-screen origin (measure it once: the window's top-left plus the browser's top bar).
- **Recorder:** `ffmpeg -f avfoundation -capture_cursor 1 -framerate 30 -i "Capture screen 0:none" -vf crop=W:H:X:Y -c:v h264_videotoolbox -b:v 24M raw.mp4`. The crop is in physical pixels, so on a Retina screen double the window's size in points and include the menu bar offset. Start the clock (`t0`) when ffmpeg prints its first `frame=` line, then wait about 1 second before the first beat.
- **Beats:** each beat records its start time and runs its actions alongside a sleep of that clip's length, plus a short tail:

```js
const marks = [];
const beat = async (i, actions, tail = 400) => {
  marks.push({ beat: i + 1, at: (Date.now() - t0) / 1000 });
  await Promise.all([actions(), sleep(vo[i].dur * 1000)]);
  await sleep(tail);
};
```

- **Pacing inside a beat:** time the action to the words. If the line says "choose Reviewer", hover the other options first, then click Reviewer around the moment the word is spoken. Leave the pointer resting on what the line is about.
- **Always clean up:** in `finally`, send `q` to ffmpeg's stdin and wait for it to exit, write `marks.json`, and close the browser. A failed take still leaves a usable recording to look at.

Pointer helpers:

```js
const sh = (c) => execSync(c).toString();
const moveTo = async (x, y) => { const [rx, ry] = [Math.round(x), Math.round(y)]; sh(`cliclick -e 400 m:${rx},${ry}`); sh(`cliclick m:${rx},${ry}`); await sleep(150); };
const clickAt = async (x, y) => { await moveTo(x, y); await sleep(200); sh(`cliclick c:${Math.round(x)},${Math.round(y)}`); await sleep(250); };
const center = (b) => [PAGE.x + b.x + b.width / 2, PAGE.y + b.y + b.height / 2];
const clickEl = async (loc) => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); await clickAt(...center(b)); };
const hoverEl = async (loc) => { const b = await loc.boundingBox(); await moveTo(...center(b)); };
```

## Step 5: reset scripts

Every take must start from the same state. `reset-NN.mjs` runs headlessly with the saved session and undoes what the take does: it cancels the pending invite, deletes the type that was created, reverts the repo, and so on. Run the reset before every take. If videos build on each other, write down which state each video starts from, and never run an earlier video's reset by accident.

## Step 6: assemble

`assemble.py <videoDir> <out.mp4>`: one ffmpeg run.
- Input 0 is `raw.mp4`. Add each beat's clip as an input, delayed with `adelay` to that beat's start plus 0.25 seconds, then `amix=inputs=N:normalize=0`.
- Video: `tpad=stop_mode=clone:stop_duration=4` (hold the last frame), `scale=1920:1200:flags=lanczos`, a 0.4 second fade in, a 0.6 second fade out ending at the last beat's start + its length + 2.2 seconds, and `format=yuv420p`.
- Encode `libx264 -preset slow -crf 18`, `aac 192k`, `-movflags +faststart`, cut with `-t` to that end time.
- If anything private shows on screen for part of the video (a terminal title bar with a username, say), overlay a clean image during just those time spans with `overlay=...:enable='between(t,a,b)+...'`.
- If a video is made of several takes, join them with the concat **filter**, padding each part's audio to its video length. The concat demuxer glitches the audio at the seams.

## Step 7: check before calling it done

Extract frames at each beat's start and at the middle of each beat (`ffmpeg -ss <t> -i out.mp4 -frames:v 1 f-<t>.png`) and look at them. Check that the right thing is on screen when it's named, that no dialog or toast covers it, and that no real data or personal details are visible. Watch the final file once with sound before handing it over.

## Rules for a take

- The take moves the real mouse. Before starting, tell the user to turn on Do Not Disturb and step away. Only start after they say they're stepping away. Touching the computer mid-take ruins it.
- The terminal app running the take needs macOS **Screen Recording** and **Accessibility** permissions.
- Use a dedicated browser profile and a dedicated demo account. Hide dev overlays and error badges in any sample app you record.
- For terminal scenes, use a separate terminal profile with a large font, and hide or cover the title bar.

## Gotchas learned the hard way

- `cliclick`'s eased move can stop short of the target. Finish every eased move with an exact move before clicking.
- Pick the ffmpeg input by name (`"Capture screen 0:none"`), not by index. Plugging in a monitor or camera renumbers the devices, and the take hangs waiting for frames.
- Apps that restore unsent drafts will bring back text from a failed take. Clear inputs at the start of a take.
- Never edit a zsh runner script while it's running. zsh re-reads it as it goes and fails or re-runs steps.
- Some sites behind Cloudflare refuse "Chrome for Testing". Record those in a normal Chrome profile with remote debugging on, and connect over CDP.
- Anything that leaves a permanent trace (a GitHub PR, a sent email) can't be undone by a reset. Plan a fresh target (repo, inbox) for each retake.
- When an AI coding agent appears on camera, clean its workspace first (reset the repo, delete stale branches and refs). Agents pick up leftovers from earlier takes.

## Publishing

Keep a `youtube.md` beside the finals with each video's title, description (one-sentence summary, a docs link, a sign-up link), playlist, category and tags, so uploading is copy and paste. Pull a poster frame per video for any site that embeds them.
