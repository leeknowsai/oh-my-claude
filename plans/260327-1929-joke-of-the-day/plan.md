# Joke of the Day — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize cli.js into 6 focused modules, then add remote "Joke of the Day" fetching to the welcome hook.

**Architecture:** Phase 1 splits the monolithic cli.js (~1240 lines) into ESM modules with clear boundaries. Phase 2 adds remote joke fetching via curl in the generated welcome bash script, with local fallback. Global config at `~/.claude/oh-my-claude/config.json` stores joke server URL.

**Tech Stack:** Node.js 18+ ESM, bash/curl for welcome script, zero external dependencies.

**Spec:** `docs/superpowers/specs/2026-03-27-joke-of-the-day-design.md`

---

## File Structure

### Phase 1 — Modularization (extract from `src/cli.js`)

| File | Responsibility | Source lines |
|------|---------------|-------------|
| `src/tui.js` | ANSI constants, stripAnsi, parseRgb, toAnsiTop, rawSelect | 7-86 |
| `src/packs.js` | Constants, loadSettings, saveSettings, backupSettings, resolvePackPath, loadPack, listPacksFromDir, listPacks, DEFAULT_I18N | 88-228 |
| `src/install.js` | install(), reset(), uninstall(), writeColorEnv(), create() | 176-182, 230-483, 485-560, 757-860 |
| `src/preview.js` | preview() | 562-744 |
| `src/setup.js` | LOCALE_MAP, THEME_LIST, renderLangStep, renderThemeStep, buildThemePreview, applyThemeOverlay, showUsageGuide, setup() | 862-1177 |
| `src/cli.js` | CLI entry — imports + switch/case only | 1179-1268 (rewritten) |

### Phase 2 — Remote Joke of the Day

| File | Change |
|------|--------|
| `src/packs.js` | Add `loadGlobalConfig()` |
| `src/install.js` | Welcome script gen: curl fetch + wider box + read jokeServer config |

---

## Phase 1: Modularization

### Task 1: Extract `src/tui.js`

**Files:**
- Create: `src/tui.js`
- Modify: `src/cli.js`

- [ ] **Step 1: Create `src/tui.js`**

Extract ANSI utilities and rawSelect. These have zero dependencies on other project code.

```js
// src/tui.js — Terminal UI utilities (ANSI, interactive selector)

// ── ANSI utilities ───────────────────────────────────────────────
export const ANSI = {
  clearScreen: "\x1b[2J",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  cursorTo: (row, col) => `\x1b[${row};${col}H`,
  eraseDown: "\x1b[J",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  inverse: "\x1b[7m",
  rgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
};

export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function parseRgb(str) {
  if (!str) return null;
  const m = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

export function toAnsiTop(str) {
  const c = parseRgb(str);
  return c ? ANSI.rgb(c[0], c[1], c[2]) : "";
}

// ── rawSelect — generic arrow-key selector ───────────────────────
export function rawSelect({ items, render }) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(0);
      return;
    }
    let index = 0;
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    process.stdout.write(ANSI.hideCursor);
    render(index);

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onKey);
      process.stdout.write(ANSI.showCursor);
    };

    const onKey = (key) => {
      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        process.stdout.write(ANSI.showCursor);
        process.exit(0);
      }
      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(index);
        return;
      }
      // Arrow up / k
      if (key === "\x1b[A" || key === "k") {
        index = (index - 1 + items.length) % items.length;
      }
      // Arrow down / j
      if (key === "\x1b[B" || key === "j") {
        index = (index + 1) % items.length;
      }
      render(index);
    };

    stdin.on("data", onKey);
  });
}
```

- [ ] **Step 2: Remove lines 7-86 from `src/cli.js`**

Remove the ANSI object, stripAnsi, parseRgb, toAnsiTop, and rawSelect function definitions. Add import at top:

```js
import { ANSI, stripAnsi, parseRgb, toAnsiTop, rawSelect } from "./tui.js";
```

- [ ] **Step 3: Verify no breakage**

Run: `node src/cli.js list`
Expected: Same pack list output as before.

Run: `node src/cli.js preview oh-my-claude`
Expected: Same preview output as before.

- [ ] **Step 4: Commit**

```bash
git add src/tui.js src/cli.js
git commit -m "refactor: extract tui.js from cli.js"
```

---

### Task 2: Extract `src/packs.js`

**Files:**
- Create: `src/packs.js`
- Modify: `src/cli.js`

- [ ] **Step 1: Create `src/packs.js`**

Extract constants, settings helpers, pack loading, and DEFAULT_I18N.

```js
// src/packs.js — Pack loading, settings, constants

import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Paths ──────────────────────────────────────────────────────────
export const BUILTIN_PACKS_DIR = resolve(__dirname, "..", "packs");
export const LOCALS_PACKS_DIR = resolve(__dirname, "..", "local-dev-jokes");
export const CLAUDE_HOME = join(homedir(), ".claude");
export const CLAUDE_SETTINGS = join(CLAUDE_HOME, "settings.json");
export const CLAUDE_AGENTS_DIR = join(CLAUDE_HOME, "agents");
export const BACKUP_DIR = join(CLAUDE_HOME, ".oh-my-claude-backup");
export const CUSTOM_PACKS_DIR = join(CLAUDE_HOME, "oh-my-claude", "packs");

// ── Settings helpers ───────────────────────────────────────────────
export function loadSettings() {
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf-8"));
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  if (!existsSync(CLAUDE_HOME)) mkdirSync(CLAUDE_HOME, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + "\n");
}

export function backupSettings() {
  if (!existsSync(CLAUDE_SETTINGS)) return;
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(BACKUP_DIR, `settings-${ts}.json`);
  const data = readFileSync(CLAUDE_SETTINGS, "utf-8");
  writeFileSync(dest, data);
  return dest;
}

// ── Pack resolution ────────────────────────────────────────────────
export function resolvePackPath(packId) {
  const customPath = join(CUSTOM_PACKS_DIR, packId, "pack.json");
  if (existsSync(customPath)) return customPath;
  const builtinPath = join(BUILTIN_PACKS_DIR, packId, "pack.json");
  if (existsSync(builtinPath)) return builtinPath;
  const localPath = join(LOCALS_PACKS_DIR, packId, "pack.json");
  if (existsSync(localPath)) return localPath;
  return null;
}

export function loadPack(packId) {
  const packPath = resolvePackPath(packId);
  if (!packPath) return null;
  try {
    const raw = readFileSync(packPath, "utf-8");
    const pack = JSON.parse(raw);
    // Attach source info
    if (packPath.includes(CUSTOM_PACKS_DIR)) pack._source = "custom";
    else if (packPath.includes(LOCALS_PACKS_DIR)) pack._source = "community";
    else pack._source = "builtin";
    return pack;
  } catch {
    return null;
  }
}

export function listPacksFromDir(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "pack.json")))
    .map((d) => {
      try { return JSON.parse(readFileSync(join(dir, d, "pack.json"), "utf-8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

export function listPacks() {
  const custom = listPacksFromDir(CUSTOM_PACKS_DIR).map((p) => ({ ...p, _source: "custom" }));
  const builtin = listPacksFromDir(BUILTIN_PACKS_DIR).map((p) => ({ ...p, _source: "builtin" }));
  const community = listPacksFromDir(LOCALS_PACKS_DIR).map((p) => ({ ...p, _source: "community" }));
  // Dedupe: custom > builtin > community
  const seen = new Set();
  const all = [];
  for (const p of [...custom, ...builtin, ...community]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      all.push(p);
    }
  }
  return all;
}

// ── Default English UI strings (fallback when pack has no i18n) ────
export const DEFAULT_I18N = {
  installJokes: [
    "This package has zero dependencies. Unlike your codebase.",
    "Side effects may include uncontrollable smiling during deploys.",
    "No node_modules were harmed in this installation.",
    "Certified 100% AI-artisanal, hand-prompted jokes.",
    "Faster than your CI pipeline. Lower bar, but still.",
    "Now producing serotonin...",
    "Remember: a bug is just a feature nobody asked for.",
    "Fun fact: this took milliseconds. Your last deploy? Yeah...",
    "Warning: may cause uncontrollable chuckling during code reviews.",
    "npm install hope --save-dev",
    "Your terminal called. It wants personality.",
    "Injecting humor directly into your workflow...",
    "Powered by mass-produced caffeine and questionable life choices.",
    "Warranty void if used without coffee.",
    "Finally, a package.json dependency worth having.",
  ],
  installing: "Installing",
  installedLayers: "Installed layers:",
  preview: "Preview:",
  colors: "Colors:",
  packInstalled: "Pack installed.",
  restart: "Restart Claude Code to see changes.",
  whatsNext: "What's next:",
  restartHint: "Restart Claude Code (or open a new session)",
  switchAgent: "Switch agent: look for",
  inAgentSelector: "in agent selector",
  tryAnother: "Try another pack:",
  resetDefaults: "Reset to defaults:",
  howToUse: "How to use oh-my-claude",
  installed: "Installed",
  jokesInYourLang: "jokes/tips in your language",
  themedVerbs: "themed spinner verbs",
  selectAgent: "select in Claude Code agent picker",
  vibePacks: "VIBE PACKS",
  switchAnytime: "switch anytime",
  commands: "COMMANDS",
  cmdInstall: "Switch to a different pack",
  cmdPreview: "Preview before installing",
  cmdList: "See all available packs",
  cmdReset: "Reset to defaults",
};
```

- [ ] **Step 2: Remove corresponding code from `src/cli.js`**

Remove lines 88-228 (constants, helpers, DEFAULT_I18N). Replace the existing `path`, `fs`, `os`, `url` imports at top with:

```js
import {
  BUILTIN_PACKS_DIR, LOCALS_PACKS_DIR, CLAUDE_HOME, CLAUDE_SETTINGS,
  CLAUDE_AGENTS_DIR, BACKUP_DIR, CUSTOM_PACKS_DIR,
  loadSettings, saveSettings, backupSettings,
  resolvePackPath, loadPack, listPacksFromDir, listPacks,
  DEFAULT_I18N,
} from "./packs.js";
```

Keep `import { resolve, join } from "path"` and `import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } from "fs"` since install/reset/preview/create still use them directly. Remove `import { homedir } from "os"` and `import { fileURLToPath } from "url"` and the `__dirname` line — they moved to packs.js.

- [ ] **Step 3: Verify**

Run: `node src/cli.js list`
Expected: Same pack list.

Run: `node src/cli.js preview viet-dev`
Expected: Same preview (or whichever community pack exists).

- [ ] **Step 4: Commit**

```bash
git add src/packs.js src/cli.js
git commit -m "refactor: extract packs.js from cli.js"
```

---

### Task 3: Extract `src/install.js`

**Files:**
- Create: `src/install.js`
- Modify: `src/cli.js`

- [ ] **Step 1: Create `src/install.js`**

Move `writeColorEnv()`, `install()`, `reset()`, `uninstall()`, `create()` into this module. These functions need `fs`, `path`, and imports from `packs.js` and `tui.js`.

```js
// src/install.js — Install, reset, uninstall, create commands

import { resolve, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } from "fs";
import {
  CLAUDE_HOME, CLAUDE_AGENTS_DIR, BACKUP_DIR, CUSTOM_PACKS_DIR,
  loadSettings, saveSettings, backupSettings, loadPack, DEFAULT_I18N,
} from "./packs.js";
import { toAnsiTop } from "./tui.js";

// ── Colors → env vars mapping ──────────────────────────────────────
export function writeColorEnv(colors) {
  const envPath = join(CLAUDE_HOME, ".oh-my-claude-colors.json");
  writeFileSync(envPath, JSON.stringify(colors, null, 2) + "\n");
  return envPath;
}

// Copy the entire install() function from cli.js lines 231-483 as-is
export function install(packId, options = {}) {
  // ... (exact copy of current install function body)
}

// Copy reset() from cli.js lines 486-560 as-is
export function reset() {
  // ... (exact copy of current reset function body)
}

// Copy uninstall() from cli.js lines 844-860 as-is
export function uninstall(packId) {
  // ... (exact copy, calls reset() internally)
}

// Copy create() from cli.js lines 758-841 as-is
export function create(packId) {
  // ... (exact copy)
}
```

Note: The actual implementation is a direct copy from `src/cli.js`. The agent implementing this should read the current file and copy each function verbatim, only adding `export` keyword.

- [ ] **Step 2: Update `src/cli.js` imports**

Remove the function definitions. Add:

```js
import { install, reset, uninstall, create, writeColorEnv } from "./install.js";
```

Remove `fs` and `path` imports from cli.js if no longer used there (check remaining code first — the switch/case block and setup/preview still need them until extracted).

- [ ] **Step 3: Verify**

Run: `node src/cli.js list`
Run: `node src/cli.js preview oh-my-claude`
Run: `node src/cli.js current`
Expected: All work as before.

- [ ] **Step 4: Commit**

```bash
git add src/install.js src/cli.js
git commit -m "refactor: extract install.js from cli.js"
```

---

### Task 4: Extract `src/preview.js`

**Files:**
- Create: `src/preview.js`
- Modify: `src/cli.js`

- [ ] **Step 1: Create `src/preview.js`**

Move the `preview()` function (lines 562-744). It needs `loadPack`, `DEFAULT_I18N` from packs.js, and `resolve` from path for reading package.json version.

```js
// src/preview.js — Pack preview display

import { resolve } from "path";
import { readFileSync } from "fs";
import { loadPack, DEFAULT_I18N } from "./packs.js";

// Copy preview() from cli.js lines 563-744 verbatim, add export
export function preview(packId) {
  // ... (exact copy of current preview function body)
  // Note: uses __dirname for package.json — need to add:
  // import { dirname } from "path";
  // import { fileURLToPath } from "url";
  // const __dirname = dirname(fileURLToPath(import.meta.url));
}
```

Important: `preview()` uses `__dirname` on line 597 to read `package.json` version. Add `__dirname` computation at top of this module.

- [ ] **Step 2: Update `src/cli.js`**

Remove preview function. Add:

```js
import { preview } from "./preview.js";
```

- [ ] **Step 3: Verify**

Run: `node src/cli.js preview oh-my-claude`
Expected: Same rich preview output with ASCII art, colors, jokes.

- [ ] **Step 4: Commit**

```bash
git add src/preview.js src/cli.js
git commit -m "refactor: extract preview.js from cli.js"
```

---

### Task 5: Extract `src/setup.js`

**Files:**
- Create: `src/setup.js`
- Modify: `src/cli.js`

- [ ] **Step 1: Create `src/setup.js`**

Move all setup wizard code: LOCALE_MAP, THEME_LIST, renderLangStep, renderThemeStep, buildThemePreview, applyThemeOverlay, showUsageGuide, setup().

```js
// src/setup.js — Interactive setup wizard (2-step selector)

import { ANSI, stripAnsi, toAnsiTop, rawSelect } from "./tui.js";
import {
  BUILTIN_PACKS_DIR, loadPack, loadSettings, saveSettings,
  listPacksFromDir, DEFAULT_I18N,
} from "./packs.js";
import { install, writeColorEnv } from "./install.js";

// Copy LOCALE_MAP from cli.js lines 863-873
export const LOCALE_MAP = [ /* ... exact copy ... */ ];

// Copy THEME_LIST from cli.js lines 875-882
export const THEME_LIST = [ /* ... exact copy ... */ ];

// Copy all render/build/apply/guide functions verbatim with export:
// renderLangStep (885-905)
// renderThemeStep (908-957)
// buildThemePreview (960-1057)
// applyThemeOverlay (1060-1069)
// showUsageGuide (1072-1110)
// setup (1113-1177)

export function renderLangStep(index) { /* ... */ }
export function renderThemeStep(index, i18n) { /* ... */ }
export function buildThemePreview(themeEntry, i18n) { /* ... */ }
export function applyThemeOverlay(themePackId) { /* ... */ }
export function showUsageGuide(localePack, chosenTheme) { /* ... */ }
export async function setup() { /* ... */ }
```

Note: The agent should copy each function verbatim from cli.js. `buildThemePreview` uses `loadPack` and `stripAnsi`, `toAnsiTop` — all imported above. `setup` calls `install` from install.js.

- [ ] **Step 2: Rewrite `src/cli.js` as thin entry point**

```js
#!/usr/bin/env node

// src/cli.js — CLI entry point

import { CUSTOM_PACKS_DIR, listPacks } from "./packs.js";
import { install, reset, uninstall, create } from "./install.js";
import { preview } from "./preview.js";
import { setup } from "./setup.js";

// ── CLI ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0];
const arg1 = args[1];

switch (command) {
  case "install":
  case "i":
    if (!arg1) {
      setup();
      break;
    }
    install(arg1);
    break;

  case "list":
  case "ls":
    console.log("\n  Available packs:\n");
    listPacks().forEach((p) => {
      const badge = p._source === "custom" ? " ★" : p._source === "community" ? " ◆" : "";
      console.log(`    ${p.id.padEnd(14)} ${p.description}${badge}`);
    });
    console.log(`\n  ★ = custom pack  ◆ = community pack`);
    console.log(`\n  Install: oh-my-claude install <pack-id>`);
    console.log(`  Preview: oh-my-claude preview <pack-id>\n`);
    break;

  case "preview":
  case "p":
    if (!arg1) {
      console.error("\n  Usage: oh-my-claude preview <pack-id>\n");
      process.exit(1);
    }
    preview(arg1);
    break;

  case "current": {
    const settings = loadSettings();
    const activeId = settings["oh-my-claude"]?.activePackId;
    if (activeId) console.log(`\n  Active pack: ${activeId}\n`);
    else console.log(`\n  No pack installed. Run: oh-my-claude install <pack>\n`);
    break;
  }

  case "uninstall":
  case "rm":
    uninstall(arg1);
    break;

  case "create":
    if (!arg1) {
      console.error("\n  Usage: oh-my-claude create <pack-id>\n");
      console.error("  Creates a new custom pack template in:");
      console.error(`    ${CUSTOM_PACKS_DIR}/<pack-id>/pack.json\n`);
      process.exit(1);
    }
    create(arg1);
    break;

  case "setup":
    setup();
    break;

  case "reset":
    reset();
    break;

  case "help":
  case "--help":
  case "-h":
  default:
    console.log(`
  oh-my-claude — Theme packs for Claude Code

  USAGE
    oh-my-claude <command> [args]

  COMMANDS
    setup            Interactive setup — pick your locale & vibe
    install <pack>   Install a theme pack
    uninstall        Remove the active pack
    list             List available packs
    preview <pack>   Preview a pack without installing
    create <id>      Create a new custom pack template
    current          Show active pack
    reset            Remove all customizations
    help             Show this help
`);
    break;
}
```

Note: `current` is inlined (5 lines) — `loadSettings` already imported statically.

- [ ] **Step 3: Full verification**

Run each command and verify output matches pre-refactor behavior:

```bash
node src/cli.js list
node src/cli.js preview oh-my-claude
node src/cli.js current
node src/cli.js help
node src/cli.js create test-delete-me
# then clean up: rm -rf ~/.claude/oh-my-claude/packs/test-delete-me
```

- [ ] **Step 4: Commit**

```bash
git add src/setup.js src/cli.js
git commit -m "refactor: extract setup.js, finalize cli.js as thin entry point"
```

---

## Phase 2: Remote Joke of the Day

### Task 6: Add `loadGlobalConfig()` to packs.js

**Files:**
- Modify: `src/packs.js`

- [ ] **Step 1: Add loadGlobalConfig function**

Add at bottom of `src/packs.js`, before the closing exports:

```js
// ── Global config ──────────────────────────────────────────────────
const GLOBAL_CONFIG_PATH = join(CLAUDE_HOME, "oh-my-claude", "config.json");

export function loadGlobalConfig() {
  try {
    return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}
```

- [ ] **Step 2: Verify**

```bash
node -e "import('./src/packs.js').then(m => console.log(m.loadGlobalConfig()))"
```

Expected: `{}` (config file doesn't exist yet, returns empty object).

- [ ] **Step 3: Commit**

```bash
git add src/packs.js
git commit -m "feat: add loadGlobalConfig for joke server settings"
```

---

### Task 7: Update welcome script generation with remote fetch + wider box

**Files:**
- Modify: `src/install.js`

- [ ] **Step 1: Add loadGlobalConfig import**

At top of `src/install.js`, add to the packs.js import:

```js
import {
  CLAUDE_HOME, CLAUDE_AGENTS_DIR, BACKUP_DIR, CUSTOM_PACKS_DIR,
  loadSettings, saveSettings, backupSettings, loadPack, DEFAULT_I18N,
  loadGlobalConfig,
} from "./packs.js";
```

- [ ] **Step 2: Update welcome script generation in install()**

Find the welcome layer block (starts with `if (layers.welcome && !options.skipWelcome)`). Replace the script generation section. The key changes:

1. Read jokeServer config
2. Generate curl fetch block (only if jokeServer.url configured)
3. Widen box from 40 to 70 chars
4. Fallback to local joke

Replace the `scriptLines` array construction with:

```js
  // Layer 8: Welcome hook — outputs random joke to AI context (system-reminder)
  if (layers.welcome && !options.skipWelcome) {
    const title = layers.welcome.title || pack.name;
    const subtitle = layers.welcome.subtitle || pack.description;
    const jokes = layers.tips?.tips || [];
    const welcomeScriptPath = join(CLAUDE_HOME, ".oh-my-claude-welcome.sh");

    // Read global config for joke server
    const globalConfig = loadGlobalConfig();
    const jokeServer = globalConfig.jokeServer || {};
    const jokeUrl = jokeServer.url;
    const jokeTimeout = jokeServer.timeout || 3;

    const BOX_W = 70; // inner width of welcome box
    const scriptLines = [
      `#!/bin/bash`,
      `# oh-my-claude-welcome — generated by oh-my-claude`,
    ];

    // Remote joke fetch (only if server configured)
    if (jokeUrl) {
      scriptLines.push(
        ``,
        `# Remote joke fetch`,
        `REMOTE_JOKE=$(curl -sf --max-time ${jokeTimeout} ${JSON.stringify(`${jokeUrl}/${packId}`)} \\`,
        `  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).joke)}catch{}})" 2>/dev/null)`,
      );
    }

    // Local fallback jokes array
    scriptLines.push(
      ``,
      `# Local jokes (fallback)`,
      `JOKES=(`,
      ...jokes.map((j) => `  ${JSON.stringify(j)}`),
      `)`,
    );

    // Pick joke: remote if available, else random local
    if (jokeUrl) {
      scriptLines.push(
        ``,
        `if [ -n "$REMOTE_JOKE" ]; then`,
        `  JOKE="$REMOTE_JOKE"`,
        `else`,
        `  IDX=$((RANDOM % \${#JOKES[@]}))`,
        `  JOKE=\${JOKES[$IDX]}`,
        `fi`,
      );
    } else {
      scriptLines.push(
        `IDX=$((RANDOM % \${#JOKES[@]}))`,
        `JOKE=\${JOKES[$IDX]}`,
      );
    }

    // Wide box output
    scriptLines.push(
      ``,
      `echo ""`,
      `echo "╭${"─".repeat(BOX_W)}╮"`,
      `echo "│  ${title.padEnd(BOX_W - 3).slice(0, BOX_W - 3)} │"`,
      `echo "│  ${subtitle.padEnd(BOX_W - 3).slice(0, BOX_W - 3)} │"`,
      `echo "╰${"─".repeat(BOX_W)}╯"`,
      `echo ""`,
      `echo "💬 $JOKE"`,
      `echo ""`,
      `echo "Display the joke above to the user as a fun greeting. Keep it short."`,
    );

    writeFileSync(welcomeScriptPath, scriptLines.join("\n") + "\n", { mode: 0o755 });

    // ... rest of hook registration code stays the same ...
```

- [ ] **Step 3: Verify without joke server (local-only mode)**

```bash
node src/cli.js install oh-my-claude
cat ~/.claude/.oh-my-claude-welcome.sh
```

Expected: Script has local JOKES array, NO curl block, wider box (70 chars).

```bash
bash ~/.claude/.oh-my-claude-welcome.sh
```

Expected: Shows wide box + random local joke.

- [ ] **Step 4: Verify with joke server configured**

Create test config:

```bash
mkdir -p ~/.claude/oh-my-claude
echo '{"jokeServer":{"url":"https://httpbin.org/get","timeout":2}}' > ~/.claude/oh-my-claude/config.json
node src/cli.js install oh-my-claude
cat ~/.claude/.oh-my-claude-welcome.sh
```

Expected: Script has curl fetch block with `https://httpbin.org/get/oh-my-claude` URL + local fallback.

```bash
bash ~/.claude/.oh-my-claude-welcome.sh
```

Expected: httpbin won't return valid `{joke:...}` JSON, so falls back to local joke. Box is wide.

Clean up test config:

```bash
rm ~/.claude/oh-my-claude/config.json
```

- [ ] **Step 5: Commit**

```bash
git add src/install.js
git commit -m "feat: add remote joke-of-the-day fetch to welcome hook"
```

---

### Task 8: Final integration test

**Files:** None (verification only)

- [ ] **Step 1: Full command suite verification**

```bash
node src/cli.js list
node src/cli.js preview oh-my-claude
node src/cli.js current
node src/cli.js help
```

All should work as before.

- [ ] **Step 2: Install with no joke server → local only**

```bash
node src/cli.js install oh-my-claude
bash ~/.claude/.oh-my-claude-welcome.sh
```

Expected: Wide box, random local joke, no curl in script.

- [ ] **Step 3: Install with joke server → remote fetch + fallback**

```bash
mkdir -p ~/.claude/oh-my-claude
echo '{"jokeServer":{"url":"https://example.com/jokes","timeout":3}}' > ~/.claude/oh-my-claude/config.json
node src/cli.js install oh-my-claude
grep "curl" ~/.claude/.oh-my-claude-welcome.sh
```

Expected: `curl` line present with `https://example.com/jokes/oh-my-claude`.

```bash
bash ~/.claude/.oh-my-claude-welcome.sh
```

Expected: curl fails (example.com won't have API), falls back to local joke gracefully.

- [ ] **Step 4: Reset and cleanup**

```bash
node src/cli.js reset
rm -f ~/.claude/oh-my-claude/config.json
```

Expected: Clean reset, no errors.

- [ ] **Step 5: Commit any fixes if needed, else skip**

---
