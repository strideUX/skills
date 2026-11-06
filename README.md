# strideUX skills

Agent skills we build at [strideUX](https://strideux.io) and use in our own work. Each folder in `skills/` is one skill: a `SKILL.md` with instructions, plus any scripts or references it needs. They follow the open [Agent Skills](https://agentskills.io) format, so they work in Claude Code and in other agents that support it.

| Skill | What it does |
| --- | --- |
| [product-demo-videos](skills/product-demo-videos) | Short, voiced walkthrough videos of a web app: a pointer timed to the narration, zooms, a branded intro and outro, music and captions. Needs Node, ffmpeg and an ElevenLabs key; `scripts/doctor.mjs --smoke` checks a machine end to end. |

Each skill also has a page on our site at `strideux.io/skills/<name>`, with examples and a **Hand to your agent** button that copies install instructions.

## Install

**Claude Code, as a plugin:**

```
/plugin marketplace add strideUX/skills
/plugin install product-demo-videos@strideux
```

**By hand, in any agent:** copy the skill's folder into your agent's skills directory. For Claude Code that's `~/.claude/skills/<name>` for every project, or `.claude/skills/<name>` inside one project.

```bash
git clone --depth 1 https://github.com/strideUX/skills.git /tmp/strideux-skills
cp -R /tmp/strideux-skills/skills/product-demo-videos ~/.claude/skills/
```

**Or ask your agent:** "Install the product-demo-videos skill from github.com/strideUX/skills."

## Adding a skill

1. Add `skills/<name>/SKILL.md`. The `name` in its front matter must match the folder name, and the `description` should say when to use it.
2. Add an entry to `.claude-plugin/marketplace.json` and a row to the table above.
3. Add the skill in the strideUX CMS under **Skills**, using the same name as its slug, so it gets a page on the site.

## License

MIT. See [LICENSE](LICENSE).
