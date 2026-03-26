#!/usr/bin/env node

import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { createInterface } from "readline";


const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_PACKS_DIR = resolve(__dirname, "..", "packs");
const LOCALS_PACKS_DIR = resolve(__dirname, "..", "local-dev-jokes");

// ── Paths ──────────────────────────────────────────────────────────
const CLAUDE_HOME = join(homedir(), ".claude");
const CLAUDE_SETTINGS = join(CLAUDE_HOME, "settings.json");
const CLAUDE_AGENTS_DIR = join(CLAUDE_HOME, "agents");
const BACKUP_DIR = join(CLAUDE_HOME, ".oh-my-claude-backup");
const CUSTOM_PACKS_DIR = join(CLAUDE_HOME, "oh-my-claude", "packs");

// ── Helpers ────────────────────────────────────────────────────────
function loadSettings() {
  if (!existsSync(CLAUDE_SETTINGS)) return {};
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  if (!existsSync(CLAUDE_HOME)) mkdirSync(CLAUDE_HOME, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + "\n");
}

function backupSettings() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  if (existsSync(CLAUDE_SETTINGS)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    copyFileSync(CLAUDE_SETTINGS, join(BACKUP_DIR, `settings-${timestamp}.json`));
  }
}

// Resolve pack path: custom → built-in → locals (community)
function resolvePackPath(packId) {
  const customPath = join(CUSTOM_PACKS_DIR, packId, "pack.json");
  if (existsSync(customPath)) return customPath;
  const builtinPath = join(BUILTIN_PACKS_DIR, packId, "pack.json");
  if (existsSync(builtinPath)) return builtinPath;
  const localsPath = join(LOCALS_PACKS_DIR, packId, "pack.json");
  if (existsSync(localsPath)) return localsPath;
  return null;
}

function loadPack(packId) {
  const packPath = resolvePackPath(packId);
  if (!packPath) return null;
  try {
    const pack = JSON.parse(readFileSync(packPath, "utf-8"));
    if (!pack.id || !pack.name || !pack.layers) {
      console.error(`  ⚠️  Pack "${packId}" invalid: missing id, name, or layers`);
      return null;
    }
    return pack;
  } catch (e) {
    console.error(`  ⚠️  Pack "${packId}" has invalid JSON: ${e.message}`);
    return null;
  }
}

function listPacksFromDir(dir) {
  if (!existsSync(dir)) return [];
  const source = dir === CUSTOM_PACKS_DIR ? "custom" : dir === LOCALS_PACKS_DIR ? "community" : "built-in";
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ ...loadPack(d.name), _source: source }))
    .filter((p) => p && p.id);
}

function listPacks() {
  const custom = listPacksFromDir(CUSTOM_PACKS_DIR);
  const builtIn = listPacksFromDir(BUILTIN_PACKS_DIR);
  const community = listPacksFromDir(LOCALS_PACKS_DIR);
  // Priority: custom > built-in > community. Same id = higher priority wins.
  const seen = new Set();
  const result = [];
  for (const list of [custom, builtIn, community]) {
    for (const p of list) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        result.push(p);
      }
    }
  }
  return result;
}

// ── Colors → env vars mapping ──────────────────────────────────────
// tweakcc uses its own patching, but for non-tweakcc users
// we write colors as a reference JSON that can be sourced.
function writeColorEnv(colors) {
  const envPath = join(CLAUDE_HOME, ".oh-my-claude-colors.json");
  writeFileSync(envPath, JSON.stringify(colors, null, 2) + "\n");
  return envPath;
}

// ── Install ────────────────────────────────────────────────────────
function install(packId, options = {}) {
  const pack = loadPack(packId);
  if (!pack) {
    console.error(`\n  ✗ Pack "${packId}" not found.\n`);
    console.error(`  Available packs:`);
    listPacks().forEach((p) => console.error(`    - ${p.id}: ${p.description}`));
    process.exit(1);
  }

  console.log(`\n  ⚡ Installing "${pack.name}" pack...\n`);

  // Backup current settings
  backupSettings();
  const settings = loadSettings();

  const layers = pack.layers;
  const installed = [];

  // Layer 1: Theme colors
  if (layers.theme && !options.skipTheme) {
    const envPath = writeColorEnv(layers.theme.colors);
    settings["oh-my-claude"] = settings["oh-my-claude"] || {};
    settings["oh-my-claude"].theme = layers.theme.colors;
    settings["oh-my-claude"].activePackId = pack.id;
    installed.push(`  🎨 Theme colors → ${envPath}`);
  }

  // Layer 2: Spinner verbs
  if (layers.spinners && !options.skipSpinners) {
    settings.spinnerVerbs = {
      mode: layers.spinners.mode,
      verbs: layers.spinners.verbs,
    };
    installed.push(`  💫 Spinner verbs → ${layers.spinners.verbs.length} themed verbs (${layers.spinners.mode})`);
  }

  // Layer 3: Agent personality
  if (layers.agent && !options.skipAgent) {
    if (!existsSync(CLAUDE_AGENTS_DIR)) mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

    const agentMd = `---
name: ${layers.agent.name}
---

${layers.agent.personality}

## Emoji Style
${layers.agent.emoji_style}
`;
    const agentPath = join(CLAUDE_AGENTS_DIR, `oh-my-claude-${pack.id}.md`);
    writeFileSync(agentPath, agentMd);
    installed.push(`  🤖 Agent "${layers.agent.name}" → ${agentPath}`);
  }

  // Layer 4: Status line
  if (layers.statusLine && !options.skipStatusLine) {
    settings["oh-my-claude"] = settings["oh-my-claude"] || {};
    settings["oh-my-claude"].statusLine = layers.statusLine.template;
    installed.push(`  📊 Status line template saved`);
  }

  // Layer 5: Tips (jokes/quotes shown while Claude thinks)
  if (layers.tips && !options.skipTips) {
    settings.spinnerTipsOverride = {
      excludeDefault: layers.tips.excludeDefault ?? true,
      tips: layers.tips.tips,
    };
    installed.push(`  😂 Spinner tips → ${layers.tips.tips.length} themed jokes/tips`);
  }

  // Layer 6: tweakcc — skipped (users can install tweakcc separately if desired)

  // Layer 7: CLAUDE.md personality injection
  if (layers.claudeMd && !options.skipClaudeMd) {
    const claudeMdPath = join(CLAUDE_HOME, "CLAUDE.md");
    const marker = "<!-- oh-my-claude -->";
    const endMarker = "<!-- /oh-my-claude -->";
    const injection = `\n${marker}\n${layers.claudeMd.content}\n${endMarker}\n`;

    let existing = "";
    if (existsSync(claudeMdPath)) {
      existing = readFileSync(claudeMdPath, "utf-8");
      // Remove previous oh-my-claude injection
      const regex = new RegExp(`\\n?${marker}[\\s\\S]*?${endMarker}\\n?`, "g");
      existing = existing.replace(regex, "");
    }

    writeFileSync(claudeMdPath, existing.trimEnd() + injection);
    installed.push(`  📝 CLAUDE.md → personality injected into ${claudeMdPath}`);
  }

  // Layer 8: Welcome hook — outputs random joke to AI context (system-reminder)
  if (layers.welcome && !options.skipWelcome) {
    const title = layers.welcome.title || pack.name;
    const subtitle = layers.welcome.subtitle || pack.description;

    // Collect jokes from tips layer for the welcome script
    const jokes = layers.tips?.tips || [];
    const welcomeScriptPath = join(CLAUDE_HOME, ".oh-my-claude-welcome.sh");

    // Write a self-contained welcome script that picks a random joke
    const scriptLines = [
      `#!/bin/bash`,
      `# oh-my-claude-welcome — generated by oh-my-claude`,
      `JOKES=(`,
      ...jokes.map((j) => `  ${JSON.stringify(j)}`),
      `)`,
      `IDX=$((RANDOM % \${#JOKES[@]}))`,
      `JOKE=\${JOKES[$IDX]}`,
      `echo ""`,
      `echo "╭────────────────────────────────────────╮"`,
      `echo "│  ${title.padEnd(37).slice(0, 37)} │"`,
      `echo "│  ${subtitle.padEnd(37).slice(0, 37)} │"`,
      `echo "╰────────────────────────────────────────╯"`,
      `echo ""`,
      `echo "💬 $JOKE"`,
      `echo ""`,
      `echo "Display the joke above to the user as a fun greeting. Keep it short."`,
    ];
    writeFileSync(welcomeScriptPath, scriptLines.join("\n") + "\n", { mode: 0o755 });

    settings.hooks = settings.hooks || {};
    settings.hooks.SessionStart = settings.hooks.SessionStart || [];

    // Remove any previous oh-my-claude welcome hooks from all SessionStart entries
    for (const entry of settings.hooks.SessionStart) {
      if (entry.hooks) {
        entry.hooks = entry.hooks.filter(
          (h) => !h.command?.includes?.("oh-my-claude-welcome")
        );
      }
    }

    // Find the first SessionStart entry with matcher "" (startup hooks)
    let targetEntry = settings.hooks.SessionStart.find((e) => e.matcher === "");

    if (targetEntry) {
      targetEntry.hooks = targetEntry.hooks || [];
      targetEntry.hooks.unshift({
        type: "command",
        command: `bash ${welcomeScriptPath} # oh-my-claude-welcome`,
      });
    } else {
      settings.hooks.SessionStart.unshift({
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `bash ${welcomeScriptPath} # oh-my-claude-welcome`,
          },
        ],
      });
    }

    installed.push(`  🎉 Welcome hook → random joke on session start`);
  }

  // Save
  saveSettings(settings);

  console.log(`  Installed layers:\n`);
  installed.forEach((line) => console.log(line));
  console.log(`\n  ✓ Pack "${pack.name}" installed.`);
  console.log(`  ℹ Restart Claude Code to see changes.\n`);

  // Next steps
  console.log(`  What's next:`);
  console.log(`    • Restart Claude Code (or open a new session)`);
  if (pack.layers?.agent) {
    console.log(`    • Switch agent: look for "oh-my-claude-${packId}" in the agent selector`);
  }
  console.log(`    • Try another pack:  oh-my-claude-cli list`);
  console.log(`    • Reset to defaults: oh-my-claude-cli reset`);
  console.log(``);
}

// ── Uninstall / Reset ──────────────────────────────────────────────
function reset() {
  const settings = loadSettings();

  // Remove oh-my-claude keys
  delete settings["oh-my-claude"];
  delete settings.spinnerVerbs;
  delete settings.spinnerTipsOverride;

  // Remove welcome hook commands (but keep the entry if it has other hooks)
  if (settings.hooks?.SessionStart) {
    for (const entry of settings.hooks.SessionStart) {
      if (entry.hooks) {
        entry.hooks = entry.hooks.filter(
          (h) => !h.command?.includes?.("oh-my-claude-welcome")
        );
      }
    }
    // Clean up empty entries
    settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
      (e) => e.hooks && e.hooks.length > 0
    );
    if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  // Remove welcome script
  const welcomeScript = join(CLAUDE_HOME, ".oh-my-claude-welcome.sh");
  if (existsSync(welcomeScript)) {
    try { unlinkSync(welcomeScript); } catch {}
  }

  saveSettings(settings);

  // Remove agent files
  if (existsSync(CLAUDE_AGENTS_DIR)) {
    readdirSync(CLAUDE_AGENTS_DIR)
      .filter((f) => f.startsWith("oh-my-claude-"))
      .forEach((f) => {
        const p = join(CLAUDE_AGENTS_DIR, f);
        try { unlinkSync(p); } catch {}
      });
  }

  // Remove color env
  const envPath = join(CLAUDE_HOME, ".oh-my-claude-colors.json");
  if (existsSync(envPath)) {
    try { unlinkSync(envPath); } catch {}
  }

  // Clean CLAUDE.md injection
  const claudeMdPath = join(CLAUDE_HOME, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    let content = readFileSync(claudeMdPath, "utf-8");
    const marker = "<!-- oh-my-claude -->";
    const endMarker = "<!-- /oh-my-claude -->";
    const regex = new RegExp(`\\n?${marker}[\\s\\S]*?${endMarker}\\n?`, "g");
    const cleaned = content.replace(regex, "");
    if (cleaned !== content) {
      writeFileSync(claudeMdPath, cleaned.trimEnd() + "\n");
    }
  }

  console.log(`\n  ✓ Reset to defaults. Restart Claude Code to see changes.\n`);
}

// ── Preview ────────────────────────────────────────────────────────
function preview(packId) {
  const pack = loadPack(packId);
  if (!pack) {
    console.error(`\n  ✗ Pack "${packId}" not found.\n`);
    process.exit(1);
  }

  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  ${pack.name.padEnd(42)} │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │  ${pack.description.padEnd(42).slice(0, 42)} │`);
  console.log(`  ├─────────────────────────────────────────────┤`);

  if (pack.layers.spinners) {
    console.log(`  │  Spinner samples:                           │`);
    pack.layers.spinners.verbs.slice(0, 5).forEach((v) => {
      console.log(`  │    ✻ ${v.padEnd(38).slice(0, 38)} │`);
    });
  }

  if (pack.layers.agent) {
    console.log(`  │  Agent: ${pack.layers.agent.name.padEnd(34).slice(0, 34)} │`);
  }

  if (pack.layers.tips) {
    console.log(`  │  Sample tip:                                │`);
    const tip = pack.layers.tips.tips[0];
    // Wrap long tips
    const maxW = 40;
    for (let i = 0; i < tip.length; i += maxW) {
      const line = tip.slice(i, i + maxW);
      console.log(`  │    ${line.padEnd(40)} │`);
    }
  }

  console.log(`  │  Tags: ${pack.tags.join(", ").padEnd(35).slice(0, 35)} │`);
  console.log(`  └─────────────────────────────────────────────┘\n`);
}

// ── Current ────────────────────────────────────────────────────────
function current() {
  const settings = loadSettings();
  const activeId = settings["oh-my-claude"]?.activePackId;
  if (activeId) {
    console.log(`\n  Active pack: ${activeId}\n`);
  } else {
    console.log(`\n  No pack installed. Run: oh-my-claude install <pack>\n`);
  }
}

// ── Create ──────────────────────────────────────────────────────────
function create(packId) {
  if (!packId || !/^[a-z0-9-]+$/.test(packId)) {
    console.error(`\n  ✗ Pack id must be lowercase alphanumeric with hyphens (e.g. "my-theme").\n`);
    process.exit(1);
  }

  const packDir = join(CUSTOM_PACKS_DIR, packId);
  if (existsSync(packDir)) {
    console.error(`\n  ✗ Pack "${packId}" already exists at ${packDir}\n`);
    process.exit(1);
  }

  mkdirSync(packDir, { recursive: true });

  const template = {
    id: packId,
    name: packId.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
    version: "0.1.0",
    author: "you",
    description: "Your custom theme pack",
    tags: ["custom"],
    layers: {
      theme: {
        colors: {
          claude: "rgb(0,255,255)",
          claudeShimmer: "rgb(255,0,255)",
          promptBorder: "rgb(0,255,255)",
          promptBorderShimmer: "rgb(255,0,255)",
          text: "rgb(224,224,224)",
          inverseText: "rgb(13,13,23)",
          background: "rgb(13,13,23)",
          success: "rgb(0,255,136)",
          error: "rgb(255,55,95)",
          warning: "rgb(255,200,0)",
          permission: "rgb(255,0,255)",
          bashBorder: "rgb(50,50,80)",
          inactive: "rgb(80,80,120)",
          subtle: "rgb(100,100,150)",
          suggestion: "rgb(0,200,200)",
          diffAdded: "rgb(0,255,136)",
          diffRemoved: "rgb(255,55,95)",
        },
      },
      spinners: {
        mode: "replace",
        verbs: [
          "Thinking hard",
          "Crunching numbers",
          "Connecting dots",
          "Building bridges",
          "Crafting solutions",
          "Weaving logic",
          "Assembling pieces",
          "Mapping routes",
          "Tracing paths",
          "Solving puzzles",
        ],
      },
      agent: {
        name: packId.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
        personality: "You are a helpful coding companion. Customize this personality to match your theme.",
        emoji_style: "Moderate. Pick 5-7 emojis that match your theme vibe.",
      },
      tips: {
        excludeDefault: true,
        tips: [
          "Customize these tips with your own jokes, quotes, or fun facts!",
          "Each tip appears while Claude is thinking.",
          "Add at least 10 tips for good variety.",
          "Mix humor with useful reminders.",
          "Your users will see these often — make them count!",
        ],
      },
    },
  };

  writeFileSync(join(packDir, "pack.json"), JSON.stringify(template, null, 2) + "\n");

  console.log(`\n  ✓ Pack "${packId}" created at:\n`);
  console.log(`    ${join(packDir, "pack.json")}\n`);
  console.log(`  Edit the file to customize your theme, then:`);
  console.log(`    oh-my-claude preview ${packId}`);
  console.log(`    oh-my-claude install ${packId}\n`);
}

// ── Uninstall ───────────────────────────────────────────────────────
function uninstall(packId) {
  const settings = loadSettings();
  const activeId = settings["oh-my-claude"]?.activePackId;

  if (!activeId) {
    console.log(`\n  No pack is currently installed.\n`);
    return;
  }

  if (packId && packId !== activeId) {
    console.log(`\n  ✗ Pack "${packId}" is not the active pack (active: "${activeId}").\n`);
    return;
  }

  // Reuse reset logic — it already handles all cleanup
  reset();
}

// ── Setup wizard ──────────────────────────────────────────────────
const LOCALE_MAP = [
  // Asia
  { label: "中文 (Chinese)", pack: "china-dev" },
  { label: "한국어 (Korean)", pack: "korea-dev" },
  { label: "हिंदी / Hinglish", pack: "desi-dev" },
  { label: "Tiếng Việt", pack: "viet-dev" },
  // Europe
  { label: "Deutsch (German)", pack: "de-dev" },
  { label: "British English, innit", pack: "uk-dev" },
  { label: "Polski (Polish)", pack: "pl-dev" },
];

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function setup() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\n  🌍 oh-my-claude setup\n`);
  console.log(`  Do you speak anything other than boring English?\n`);

  LOCALE_MAP.forEach((loc, i) => {
    console.log(`    ${i + 1}. ${loc.label}`);
  });
  console.log("");

  const answer = await prompt(rl, "  Pick a number, or Enter for English only: ");
  rl.close();
  const trimmed = answer.trim();

  // Determine locale pack (if any)
  let localePack = null;
  if (trimmed !== "") {
    const idx = parseInt(trimmed, 10) - 1;
    if (idx < 0 || idx >= LOCALE_MAP.length || isNaN(idx)) {
      console.log(`\n  Invalid choice. Run 'oh-my-claude-cli install' to try again.\n`);
      process.exit(1);
    }
    const chosen = LOCALE_MAP[idx];
    if (chosen.pack) {
      localePack = loadPack(chosen.pack);
      if (!localePack) {
        console.log(`\n  ⚠️  Pack "${chosen.pack}" not found.\n`);
      }
    }
  }

  // Install locale pack if selected
  if (localePack) {
    console.log(`\n  Installing locale pack: ${localePack.name}...\n`);
    install(localePack.id);
  } else {
    // English-only — install flagship pack
    console.log(`\n  English it is. Installing "oh-my-claude" — the everything pack...\n`);
    install("oh-my-claude");
  }

  // Show usage guide
  console.log(`\n  ────────────────────────────────────────`);
  console.log(`  📖 How to use oh-my-claude\n`);

  if (localePack) {
    console.log(`  ✅ Installed: ${localePack.name}`);
    console.log(`    ${localePack.description}`);
    console.log(`    • ${localePack.layers?.tips?.tips?.length || 0} jokes/tips in your language`);
    console.log(`    • ${localePack.layers?.spinners?.verbs?.length || 0} themed spinner verbs`);
    if (localePack.layers?.agent) {
      console.log(`    • Agent "${localePack.layers.agent.name}" — select in Claude Code agent picker`);
    }
    console.log(``);
  }

  console.log(`  VIBE PACKS (switch anytime):`);
  const builtins = listPacksFromDir(BUILTIN_PACKS_DIR);
  builtins.forEach((p) => {
    console.log(`    ${p.id.padEnd(14)} ${p.description}`);
  });

  console.log(`\n  COMMANDS:`);
  console.log(`    oh-my-claude-cli install <pack>   Switch to a different pack`);
  console.log(`    oh-my-claude-cli preview <pack>   Preview before installing`);
  console.log(`    oh-my-claude-cli list              See all available packs`);
  console.log(`    oh-my-claude-cli reset             Reset to defaults`);
  console.log(``);
}

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

  case "current":
    current();
    break;

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
    current          Show currently active pack
    reset            Remove all oh-my-claude customizations
    help             Show this help

  EXAMPLES
    oh-my-claude setup
    oh-my-claude install cyberpunk
    oh-my-claude list
    oh-my-claude preview zen
    oh-my-claude create my-theme
    oh-my-claude uninstall
    oh-my-claude reset

  CUSTOM PACKS
    Create your own:  oh-my-claude create my-theme
    Packs dir:        ${CUSTOM_PACKS_DIR}

  BUILT-IN PACKS
    cyberpunk        Neon-soaked hacker aesthetic
    zen              Calm earth tones for focused coding
    chef             Gordon Ramsay energy in your terminal
    pirate           Nautical vibes, treasure hunting
    retrowave        80s synthwave nostalgia

  COMMUNITY PACKS (local-dev-jokes/)
    viet-dev         🇻🇳 Vietnamese dev jokes
    desi-dev         🇮🇳 Hinglish chai-powered vibes
    china-dev        🇨🇳 码农 996/摸鱼 humor
    korea-dev        🇰🇷 야근 Korean dev culture
    de-dev           🇩🇪 German engineering Denglish
    uk-dev           🇬🇧 British tea-driven development
    pl-dev           🇵🇱 Polish Januszex survival kit
`);
    break;
}
