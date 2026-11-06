---
name: product-demo-videos
description: Make short narrated product walkthrough videos of a web app, with a voice that talks through every click, a pointer timed to the words, zooms, a branded intro and outro, music and captions. Use when asked to make a tutorial, getting-started, onboarding, feature or demo video of a web app.
---

# Product demo videos

You make short (30 seconds to 2 minutes) walkthrough videos of a web app. Every video is a list of **beats**: one spoken line plus the on-screen actions that go with it. A take script drives the browser while it records, each beat lasts as long as its voice clip, and actions can wait for a specific word, so the voice always fits the picture. Nothing is edited by hand. If a line changes, regenerate that clip and record the take again.

All the code is in `scripts/`. Run it; don't rewrite it. `SKILL` below means this skill's folder.

## First run: set up and check

1. Make a project folder for the videos (not inside the app's repo unless the user wants that):
   `node SKILL/scripts/init.mjs <folder> --url <app url>`
   Add `--example` to include a sample app and a finished example video to learn from.
2. `cd <folder>` and run `node SKILL/scripts/doctor.mjs`. Fix everything it marks `FIX`, using the exact commands it prints. Run it again until it says `ready`.
3. `node SKILL/scripts/doctor.mjs --smoke` makes a 35-second test video from the bundled sample app with a free draft voice. If that works, the machine is ready. Show the user the result.

Ask the user for, and never guess:
- **Which flows** to cover, in what order. Videos in a series can build on each other.
- **A demo account.** Never record a real account or real customer data. `node SKILL/scripts/login.mjs` opens a browser; the user signs in and closes the window, and the session is saved for every take.
- **An ElevenLabs API key**, in the project's `.env` (`ELEVENLABS_API_KEY=...`). Never ask for it in chat. A key restricted to Text to Speech, Voices (read) and, for music, Music Generation is enough.
- **The voice.** `node SKILL/scripts/voices.mjs` lists their voices with preview links. Put the id in `voice.voiceId`.
- **Brand:** name, logo (SVG or PNG), background, foreground and accent colors, font, website. These drive the intro and outro cards.

## Making a video

1. `node SKILL/scripts/new.mjs 01-get-started "Get started"` creates `01-get-started/` with `script.json` and `take.mjs`.
2. **Scout** the flow before writing (see below), then write the beats in `script.json`. Read `references/writing.md` first.
3. **Voice:** `node SKILL/scripts/voice.mjs 01-get-started`. Use `--draft` while rehearsing timing; it's free. Only changed lines are regenerated.
4. **Take:** write `take.mjs` (one `beat()` per line), check it with `node 01-get-started/take.mjs --dry`, then record with `node 01-get-started/take.mjs`.
5. **Assemble:** `node SKILL/scripts/assemble.mjs 01-get-started` writes `finals/01 - <title>.mp4`, a poster `.jpg`, and `.srt`/`.vtt` captions.
6. **Check:** `node SKILL/scripts/check.mjs 01-get-started`. Open every frame it lists and the contact sheet, and look (see "Before calling it done").

## Scouting

Before writing a take, open the flow headlessly with the saved session and look: print the visible text of dialogs and menus, list the options, take screenshots. A ten-line Playwright script in the project does this. Use what you find for two things: stable locators (`getByRole`, `getByLabel`, visible text), and the exact labels the narration should use. Fix the script's wording to match the screen, not the other way round.

## Writing a take

`take.mjs` imports `take` from `SKILL/scripts/lib/take.mjs` and gets these helpers:

| Helper | Does |
| --- | --- |
| `beat(async (b) => {...}, { tail })` | One per line, in order. Lasts at least as long as the clip, plus `tail` ms (default 400). |
| `b.at("phrase")` | Waits until that phrase is spoken in this beat's line. Click on the word, not before it. |
| `move(target)`, `hover(target)` | Glides the pointer to a locator (or `{ x, y }`) on a slight arc. |
| `click(target)` | Glides there, then presses. |
| `type(target, text)` | Clicks the field, then types at a human pace. |
| `press(key)`, `pause(ms)` | Keyboard and waits. |
| `zoom(target, { scale })`, `zoomOut()` | Eases the frame in on an element, and back out. |
| `page` | The Playwright page, for waiting and reading state. |

Pacing that reads as a person, not a script:
- Open on a still screen for a second, then drift toward the first control while the first line is still playing.
- Show the choices before choosing: hover the other options, then click the named one as its name is spoken (`b.at`).
- Zoom in when the subject is small (a form, a menu), out when the result matters in context. Don't zoom on every beat.
- Leave the pointer resting on whatever the line is about. End the last beat still, with a longer tail.
- If the take prints "the actions ran past the line", that beat needs fewer actions or a longer line.

`templates/take.mjs` is a complete, well-paced example. Copy its patterns.

## Recording modes

`mode` in `video.config.json`:
- **`browser`** (default): a hidden Chromium at 2x resolution. The pointer is drawn into the page. Runs on macOS, Linux and Windows, never touches the real mouse, and the user can keep working. Use it for anything inside a web page.
- **`screen`**: a visible browser, the real mouse and a screen recording. macOS only. Use it only when the video must show something outside the page: native menus, a browser extension, a terminal beside the app. Read `references/screen-mode.md` first, and run `node SKILL/scripts/calibrate.mjs --mode screen` before the first take.

## Polish

All in `video.config.json`, overridable per video in `script.json`:
- **Intro and outro cards** (`intro`, `outro`, `brand`): rendered from `templates/cards/*.html`. To restyle, copy them into the project's `cards/` folder and edit. `script.json` can set `eyebrow`, `next` (shown on the outro as "Next: ...") and `cta`.
- **Transitions** (`transition.style`): any ffmpeg `xfade` name. `fade` is the safe default; `fadeblack`, `smoothleft`, `circleopen` and `dissolve` also work. Use one style for a whole series.
- **Music** (`music.file`, `music.volume`): a track the user has rights to, or `node SKILL/scripts/music.mjs --seconds 90` to compose one with ElevenLabs (paid plans; check their terms). It ducks under the voice automatically.
- **Captions** are always written as `.srt` and `.vtt`. `captions.burn: true` also draws them on the video, for social posts that autoplay muted.
- **Redaction** (`redact`): CSS selectors that are blurred during browser-mode takes, for emails, names and keys that must stay on screen.

## Resets

Every take must start from the same state. If a take changes data (creates a task, sends an invite), write `reset-NN.mjs` beside it that undoes the change headlessly with the saved session, and run it before every take. If videos build on each other, note in `script.json` which state each one starts from. Anything permanent (a sent email, a merged pull request) can't be reset; plan a fresh target for each retake.

## Before calling it done

Run `check.mjs` and open every frame it lists. For each one: is the thing the line names on screen, is nothing (a toast, a dialog, the pointer) covering it, and is no real person's data visible? It also flags black stretches, long silences and loudness. Then watch the final video once, start to finish, with sound. Don't hand over a video you haven't checked.

## When something goes wrong

`references/troubleshooting.md` covers the common failures. In short: a failed take saves `failed.png` showing the moment it broke; `--dry` finds bad locators in seconds; `doctor.mjs` explains missing tools and permissions.

## Publishing

`references/publishing.md`: titles, descriptions, poster frames and a `youtube.md` to copy from when uploading.
