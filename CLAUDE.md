# Oh My Claude — Developer Guide

## What is this?

CLI tool (`npx oh-my-claude`) that installs theme packs for Claude Code. Each pack bundles 7 layers: colors, spinner verbs, agent personality, status line, tips, CLAUDE.md personality, and welcome ASCII art.

## Project Structure

```
src/cli.js              # CLI entry point (ESM, zero deps)
packs/<id>/pack.json    # Built-in packs (5 core themes)
local-dev-jokes/<id>/pack.json # Community packs (samples for contributors)
pack-schema.json        # JSON schema for pack format
```

## Pack Sources (resolution order)

1. `~/.claude/oh-my-claude/packs/` — user's custom packs (★)
2. `packs/` — built-in packs (ship with npm)
3. `local-dev-jokes/` — community packs (◆)

## Code Conventions

- ESM (`"type": "module"` in package.json)
- Zero external dependencies — Node.js built-ins only
- Node.js >= 18.0.0
- All paths resolve from `~/.claude/` for Claude Code integration

## Pack Layers

1. **theme** — Color scheme (16 color tokens)
2. **spinners** — Custom spinner verb phrases (mode: replace/append)
3. **agent** — Agent personality file (name, personality, emoji_style)
4. **statusLine** — Status line template string
5. **tips** — Spinner tips/jokes shown while thinking
6. **claudeMd** — Personality injection into ~/.claude/CLAUDE.md
7. **welcome** — ASCII art banner via SessionStart hook

## Creating a New Pack

### Local custom pack
```bash
node src/cli.js create my-theme   # scaffolds to ~/.claude/oh-my-claude/packs/my-theme/
```

### Contributing a community pack
1. Use `local-dev-jokes/viet-dev/` as reference (full 7-layer sample)
2. Create `local-dev-jokes/<your-id>/pack.json` following `pack-schema.json`
3. Required fields: id, name, version, author, description, layers
4. At minimum include: theme, spinners, agent, tips
5. Test: `node src/cli.js preview <your-id>`
6. Test install: `node src/cli.js install <your-id>` (backs up settings first)
7. Submit a PR

## Testing

```bash
node src/cli.js list              # List all packs
node src/cli.js preview <pack>    # Preview without installing
node src/cli.js install <pack>    # Install (auto-backs up settings)
node src/cli.js current           # Show active pack
node src/cli.js reset             # Remove all customizations
```

## Pack JSON Validation

```bash
node -e "JSON.parse(require('fs').readFileSync('packs/<id>/pack.json','utf8')); console.log('OK')"
```
