# Coding with Claude is stressful. Make yourself smile while Claude is thinking.

Jokes, spinners, personalities, and vibes for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Because staring at "Thinking..." 10,000 times a day is a crime against developers.

Like [oh-my-zsh](https://ohmyz.sh), but for your AI.

## Why?

Instead of "Thinking..." you get _"Deploying prayers to production..."_

Instead of generic tips you get:

> `// TODO: fix this later` — Written 3 years ago.

180+ developer jokes. 110 spinners. 8 languages. Your Claude, your vibe.

## Quick Start

```bash
npx oh-my-claude-cli install oh-my-claude
```

That's it. Restart Claude Code and enjoy.

```bash
# Want jokes in your language?
npx oh-my-claude-cli install desi-dev

# Browse all packs
npx oh-my-claude-cli list

# Preview before installing
npx oh-my-claude-cli preview korea-dev

# Go back to boring defaults
npx oh-my-claude-cli reset
```

## Packs

**`oh-my-claude`** is the flagship pack — 110 spinners, 180+ jokes, all vibes in one install. Recommended for most users.

Want a specific aesthetic? Pick a vibe pack:

| Pack | Vibe |
|------|------|
| `cyberpunk` | Neon-soaked hacker aesthetic — "Jacking in...", "ICE-breaking..." |
| `zen` | Calm earth tones — a quiet garden for focused coding |
| `chef` | Gordon Ramsay energy — "This code is RAW!" |
| `pirate` | Rum-fueled debugging — "Searching for buried treasure..." |
| `retrowave` | 80s synthwave nostalgia — sunset gradients, chrome text |

## Additional Language Packs

All the jokes from `oh-my-claude`, plus developer humor in your native language.

| Pack | Language | Additional jokes |
|------|----------|-----------------|
| `uk-dev` | British | Tea-driven development, apologetic errors, dry wit |
| `china-dev` | Chinese | 996, moyu, neijuan — surviving legacy code |
| `korea-dev` | Korean | Yagun, coffee, deploy prayers |
| `viet-dev` | Tieng Viet | 100+ jokes — tu bug doi toi bug code |
| `desi-dev` | Hinglish | Chai-powered jugaad mentality |
| `de-dev` | Deutsch | TUV-approved deploys, Feierabend culture |
| `pl-dev` | Polski | Kawa i kebab po deploymencie |
| `???` | Yours? | [Open a PR](https://github.com/leeknowsai/oh-my-claude/pulls) — add your language! |

## What You Get

Each pack bundles up to 7 layers — install once, get everything:

| Layer | What it does |
|-------|-------------|
| Theme Colors | Color scheme for your terminal |
| Spinner Verbs | Replace "Thinking..." with themed phrases |
| Spinner Tips | Jokes, quotes, and fun facts while Claude thinks |
| Agent Personality | A themed persona you can switch to |
| Status Line | Themed status bar |
| CLAUDE.md Personality | Tone, metaphors, emoji rules injected into CLAUDE.md |
| Welcome Banner | Themed greeting + random joke on every session start |

## Create Your Own Pack

```bash
# Scaffold a new pack
npx oh-my-claude-cli create my-vibes

# Edit it
# -> ~/.claude/oh-my-claude/packs/my-vibes/pack.json

# Preview and install
npx oh-my-claude-cli preview my-vibes
npx oh-my-claude-cli install my-vibes
```

Want to contribute a language pack? Copy any pack from `local-dev-jokes/` as a template, fill in your jokes, and submit a PR.

Got more jokes or a new vibe? PRs are welcome — the more laughs, the better.

## How It Works

```
~/.claude/
├── settings.json              <- spinnerVerbs + tips + metadata
├── agents/
│   └── oh-my-claude-*.md      <- agent personality
├── CLAUDE.md                  <- personality injection (safe markers)
├── .oh-my-claude-colors.json  <- color reference
└── .oh-my-claude-backup/      <- auto-backup before changes
```

Your settings are always backed up before any changes. `reset` brings everything back.

## Credits

Built on the Claude Code customization ecosystem:

- [claude-code-themes](https://github.com/Piebald-AI/claude-code-themes) — theme format
- [awesome-claude-spinners](https://github.com/AlexPl292/awesome-claude-spinners) — spinner inspiration
- [tweakcc](https://github.com/Piebald-AI/tweakcc) — full visual theming (optional)

## License

MIT — go make Claude weird.
