# Publishing

Keep a `youtube.md` beside the finals with, per video:

- **Title:** the outcome, in the viewer's words. "Create and assign a task", not "Task management overview".
- **Description:** one sentence on what the video shows, then a docs link and a sign-up link.
- **Playlist, category, tags.**
- **Captions:** upload the `.srt` that `assemble.mjs` wrote. It's timed to the voice word by word, so it's better than auto-captions.
- **Thumbnail:** the poster `.jpg` beside each final, or a frame from `check.mjs`.

For a website, embed the mp4 with the poster and the `.vtt` as a captions track. For autoplaying social posts, set `captions.burn: true` and assemble again; muted autoplay needs the words on screen.
