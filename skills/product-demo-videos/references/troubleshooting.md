# Troubleshooting

| What you see | Why | Fix |
| --- | --- | --- |
| `Executable doesn't exist` | Playwright's browser isn't downloaded | `npx playwright install chromium` in the project |
| `Couldn't find a box for ...` or a timeout in a beat | A locator doesn't match | Open `failed.png` beside the take. Fix the locator, then `node take.mjs --dry` |
| "the actions ran 1.2s past the line" | The beat does more than the line has time for | Fewer actions, shorter typing, or a longer line |
| `"phrase" isn't in the line` | `b.at()` text doesn't match the words of the line | Use words exactly as written in `script.json` |
| Voice: HTTP 401 | Key wrong, or missing Text to Speech permission | Fix `.env`; `doctor.mjs` checks it |
| Voice: model not available | The plan doesn't include that model | `voices.mjs` lists the ones you can use; set `voice.model` |
| Black recording (screen mode) | No Screen Recording permission | Grant it, then quit and reopen the terminal app |
| Mouse doesn't move (screen mode) | No Accessibility permission | Grant it, then quit and reopen the terminal app |
| Clicks land beside buttons (screen mode) | Window moved, or on a second display | `calibrate.mjs --mode screen`; keep the window on the main display |
| Old text appears in a field | The app restores unsent drafts from a failed take | Clear inputs at the start of the take, or in the reset script |
| Signed out partway | The saved session expired | `login.mjs` again |
| Captions not burned in | This ffmpeg has no libass | `brew install ffmpeg`, or use the `.srt` file instead |
| Music too loud or quiet | Tracks differ | Change `music.volume` (0.15 to 0.3) and assemble again; no new take needed |

Re-running is cheap: `assemble.mjs` doesn't need a new take, voice clips are cached, and intro and outro cards are cached until their text or brand changes.
