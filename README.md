# strideUX skills

Agent skills we build at [strideUX](https://strideux.io) and use in our own work. Each folder in `skills/` is one skill: a `SKILL.md` with instructions, plus any scripts or references it needs. They follow the open [Agent Skills](https://agentskills.io) format, so they work in Claude Code and in other agents that support it.

| Skill | What it does |
| --- | --- |
| [narrated-screen-recordings](skills/narrated-screen-recordings) | Short, voiced product walkthrough videos. A script drives a real browser and pointer while the screen records, and ElevenLabs reads each line in time with the action. Still being refined. |

Each skill also has a page on our site at `strideux.io/skills/<name>`, with examples and a **Hand to your agent** button that copies install instructions.

## Install

**Claude Code, as a plugin:**

```
/plugin marketplace add strideUX/skills
/plugin install narrated-screen-recordings@strideux
```

**By hand, in any agent:** copy the skill's folder into your agent's skills directory. For Claude Code that's `~/.claude/skills/<name>` for every project, or `.claude/skills/<name>` inside one project.

```bash
git clone --depth 1 https://github.com/strideUX/skills.git /tmp/strideux-skills
cp -R /tmp/strideux-skills/skills/narrated-screen-recordings ~/.claude/skills/
```

**Or ask your agent:** "Install the narrated-screen-recordings skill from github.com/strideUX/skills."

## Adding a skill

1. Add `skills/<name>/SKILL.md`. The `name` in its front matter must match the folder name, and the `description` should say when to use it.
2. Add an entry to `.claude-plugin/marketplace.json` and a row to the table above.
3. Add the skill in the strideUX CMS under **Skills**, using the same name as its slug, so it gets a page on the site.
