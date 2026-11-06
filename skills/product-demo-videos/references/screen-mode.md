# Screen mode (macOS)

Screen mode records the real screen and moves the real mouse. Use it only when the video must show something outside the web page: native menus, a browser extension, a terminal next to the app. Everything else should use browser mode.

## Before the first take

1. `brew install cliclick ffmpeg`
2. The terminal app that runs the take needs two permissions in System Settings > Privacy & Security:
   - **Accessibility**, to move the pointer.
   - **Screen & System Audio Recording**, to record.
   After turning them on, quit the terminal app completely and reopen it. Permissions don't apply to a running app.
3. `node SKILL/scripts/doctor.mjs --screen` checks both.
4. `node SKILL/scripts/calibrate.mjs --mode screen` runs a 10-second practice take that clicks five targets and checks that the recording shows exactly the page. Run it again after plugging in or changing a display.

## During a take

- The take moves the mouse. Tell the user to turn on Do Not Disturb, close anything that pops up notifications, and step away. Start only after they say they've stepped away. Touching the mouse or keyboard ruins the take.
- The browser window opens at the top left of the main display. The screen must be at least as large as the viewport plus the browser's toolbar (1440 by about 990 points by default). On a smaller laptop screen, lower `viewport` in `video.config.json`.
- Keep the window on the main display. `screen.display` picks which display is recorded ("Capture screen 0" is the main one); it's matched by name, not number, because plugging in a camera renumbers devices.
- `screen.frame: "window"` includes the browser's toolbar and address bar in the recording; `"page"` (default) shows only the page.

## Terminals and other apps on camera

- Use a separate terminal profile with a large font and a plain prompt. Hide the title bar, or keep usernames and paths out of it.
- When an AI coding agent appears on camera, clean its workspace before every take: reset the repo, delete stale branches, clear its memory or session files. Agents pick up leftovers from earlier takes.
- Never edit a shell script while it's running. zsh re-reads it as it goes.

## Sites that block automated browsers

Some sites behind Cloudflare refuse Playwright's Chromium. Record those in a normal Chrome profile started with `--remote-debugging-port=9222`, connected with `chromium.connectOverCDP`. That needs a small change to the take; ask the user first.
