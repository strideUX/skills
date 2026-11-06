# Writing the narration

A video is a list of beats. Each beat is one spoken line and the actions that go with it.

## Structure

- **First beat:** what the viewer will be able to do by the end. "In this video, we'll create a task and hand it to a teammate."
- **Middle beats:** one action each, in the order they happen.
- **Last beat:** where the viewer has ended up, and what the next video covers. Set `next` in `script.json` so the outro card says it too.
- Aim for 6 to 14 beats and 30 to 90 seconds. Split anything longer into two videos.

## Lines

- Use the words on the screen. "Click Send invite", not "submit the form". Scout first so you know the exact labels.
- Put the label you'll click on near the end of the line, or at least after a few words, so the pointer has time to get there. `b.at("Send invite")` clicks right as it's said.
- Short spoken sentences. Contractions. No parenthetical asides; they sound odd read aloud.
- Say why, once in a while. "Priya runs design, so she's a good fit" is what makes a walkthrough feel like a person showing you around.
- Check every claim against the real product before recording: prices, limits, roles, how long a link stays valid.
- Read every line aloud before generating it.

## Lines that need care with text to speech

- Spell out symbols: "about two minutes", not "~2 min".
- Product names that could be mispronounced: try one clip first and listen. Rephrase, or use the ElevenLabs pronunciation dictionary.
- Typed text inside a line ("like Update the pricing page") reads fine; keep it short.

## Voice settings

The defaults (`eleven_v4`, stability 0.15, similarity 0.5, style 0, speaker boost on) give a natural, slightly varied read. Raise stability (0.3 to 0.5) if the read sounds too uneven across lines. Each clip is generated with its neighbors passed as context, so intonation flows from one line into the next.
