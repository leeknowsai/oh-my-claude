import { resolve, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import {
  __dirname,
  CLAUDE_HOME, CLAUDE_AGENTS_DIR, BACKUP_DIR, CUSTOM_PACKS_DIR,
  loadSettings, saveSettings, backupSettings, loadPack, listPacks, DEFAULT_I18N,
  loadGlobalConfig,
} from "./packs.js";

// ── Colors → env vars mapping ──────────────────────────────────────
// Write colors as a reference JSON that can be sourced.
export function writeColorEnv(colors) {
  const envPath = join(CLAUDE_HOME, ".oh-my-claude-colors.json");
  writeFileSync(envPath, JSON.stringify(colors, null, 2) + "\n");
  return envPath;
}

// ── Install ────────────────────────────────────────────────────────
export function install(packId, options = {}) {
  const pack = loadPack(packId);
  if (!pack) {
    console.error(`\n  ✗ Pack "${packId}" not found.\n`);
    console.error(`  Available packs:`);
    listPacks().forEach((p) => console.error(`    - ${p.id}: ${p.description}`));
    process.exit(1);
  }

  // Read version from package.json
  const pkgJson = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
  const version = pkgJson.version;

  // Merge pack i18n with defaults
  const i18n = { ...DEFAULT_I18N, ...(pack.i18n || {}) };
  const jokes = i18n.installJokes || DEFAULT_I18N.installJokes;
  const joke = jokes[Math.floor(Math.random() * jokes.length)];

  console.log(`\n  ⚡ ${i18n.installing} ${pack.name} v${version}...`);
  console.log(`  💬 "${joke}"\n`);

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

  // Layer 4: Status line — generate a bash script from the template
  // Merges with user's existing statusLine instead of replacing it
  if (layers.statusLine && !options.skipStatusLine) {
    settings["oh-my-claude"] = settings["oh-my-claude"] || {};
    settings["oh-my-claude"].statusLine = layers.statusLine.template;

    // Save user's original statusLine (skip if already saved or if it's our own)
    if (!settings["oh-my-claude"].originalStatusLine && settings.statusLine && !settings.statusLine?.command?.includes?.("oh-my-claude-statusline")) {
      settings["oh-my-claude"].originalStatusLine = settings.statusLine;
    }

    const statusScriptPath = join(CLAUDE_HOME, ".oh-my-claude-statusline.sh");
    const template = layers.statusLine.template;

    // Build jq expression that replaces {model}, {cwd}, {cost}, {tokens}
    const jqExpr = template
      .replace(/\{model\}/g, '\\(.model.display_name // "?")')
      .replace(/\{cwd\}/g, '\\((.workspace.current_dir // ".") | split("/") | last)')
      .replace(/\{cost\}/g, '\\(if .cost.total_cost_usd then ("$" + (.cost.total_cost_usd * 100 | round / 100 | tostring)) else "$0" end)')
      .replace(/\{tokens\}/g, '\\((.context_window.total_input_tokens // 0) + (.context_window.total_output_tokens // 0))');

    // Merge: prepend omc prefix to user's original statusLine output
    const originalCmd = settings["oh-my-claude"].originalStatusLine;
    let statusScript;
    if (originalCmd?.type === "command" && originalCmd.command) {
      statusScript = [
        `#!/bin/bash`,
        `# oh-my-claude statusline — merged with user's original`,
        `INPUT=$(cat)`,
        `PREFIX=$(printf '%s' "$INPUT" | jq -r '"${jqExpr}"')`,
        `ORIGINAL=$(printf '%s' "$INPUT" | ${originalCmd.command})`,
        `echo "$PREFIX │ $ORIGINAL"`,
      ].join("\n") + "\n";
    } else {
      statusScript = [
        `#!/bin/bash`,
        `# oh-my-claude statusline — generated from template: ${template}`,
        `jq -r '"${jqExpr}"'`,
      ].join("\n") + "\n";
    }

    writeFileSync(statusScriptPath, statusScript, { mode: 0o755 });

    settings.statusLine = {
      type: "command",
      command: `bash ${statusScriptPath}`,
    };

    installed.push(`  📊 Status line → ${statusScriptPath}`);
  }

  // Layer 5: Tips (jokes/quotes shown while Claude thinks)
  if (layers.tips && !options.skipTips) {
    settings.spinnerTipsOverride = {
      excludeDefault: layers.tips.excludeDefault ?? true,
      tips: layers.tips.tips,
    };
    installed.push(`  😂 Spinner tips → ${layers.tips.tips.length} themed jokes/tips`);
  }

  // Layer 6: CLAUDE.md personality injection
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
    const jokes = layers.tips?.tips || [];
    const welcomeScriptPath = join(CLAUDE_HOME, ".oh-my-claude-welcome.sh");

    // Read global config for remote joke server
    const globalConfig = loadGlobalConfig();
    const jokeServer = globalConfig.jokeServer || {};
    const jokeUrl = jokeServer.url;
    const jokeTimeout = jokeServer.timeout || 3;

    const BOX_W = 70;
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

    // Local jokes (fallback)
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
    );

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

  // ── Fun install summary with theming preview ──
  const colors = layers.theme?.colors || {};
  const toAnsi = (rgb) => {
    if (!rgb) return "";
    const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return m ? `\x1b[38;2;${m[1]};${m[2]};${m[3]}m` : "";
  };
  const r = "\x1b[0m";
  const b = "\x1b[1m";
  const d = "\x1b[2m";
  const ac = toAnsi(colors.claude) || "\x1b[36m";
  const sc = toAnsi(colors.success) || "\x1b[32m";
  const wc = toAnsi(colors.warning) || "\x1b[33m";

  console.log(`  ${ac}┌─────────────────────────────────────────────┐${r}`);
  const layersTitle = i18n.installedLayers;
  console.log(`  ${ac}│${r} ${b}${layersTitle}${r}${" ".repeat(Math.max(0, 45 - layersTitle.length))}${ac}│${r}`);
  console.log(`  ${ac}│${r}${" ".repeat(45)}${ac}│${r}`);
  installed.forEach((line) => {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, "").trimStart();
    const padded = stripped.length > 43 ? stripped.slice(0, 43) : stripped.padEnd(43);
    console.log(`  ${ac}│${r} ${padded} ${ac}│${r}`);
  });
  console.log(`  ${ac}│${r}${" ".repeat(45)}${ac}│${r}`);

  // Theming preview — show a sample spinner verb + joke in pack colors
  if (layers.spinners?.verbs?.length) {
    const verb = layers.spinners.verbs[Math.floor(Math.random() * layers.spinners.verbs.length)];
    console.log(`  ${ac}│${r} ${d}${i18n.preview}${r}${" ".repeat(Math.max(0, 45 - i18n.preview.length))}${ac}│${r}`);
    console.log(`  ${ac}│${r}   ${ac}◐ ${verb}...${r}${"".padEnd(Math.max(0, 39 - verb.length))}${ac}│${r}`);
  }
  if (layers.tips?.tips?.length) {
    const tip = layers.tips.tips[Math.floor(Math.random() * layers.tips.tips.length)];
    const maxW = 41;
    const display = tip.length > maxW ? tip.slice(0, maxW - 1) + "…" : tip;
    console.log(`  ${ac}│${r}   ${wc}💬 ${d}${display}${r}${"".padEnd(Math.max(0, maxW - display.length))}${ac}│${r}`);
  }
  // Color swatches
  if (colors.claude) {
    const ec = toAnsi(colors.error) || "\x1b[31m";
    const swatches = `${ac}██${r} ${sc}██${r} ${wc}██${r} ${ec}██${r}`;
    console.log(`  ${ac}│${r}${" ".repeat(45)}${ac}│${r}`);
    console.log(`  ${ac}│${r}   ${d}${i18n.colors}${r} ${swatches}${"".padEnd(Math.max(0, 45 - i18n.colors.length - 13))}${ac}│${r}`);
  }
  console.log(`  ${ac}│${r}${" ".repeat(45)}${ac}│${r}`);
  const doneMsg = `✓ ${i18n.packInstalled}`;
  console.log(`  ${ac}│${r} ${sc}${doneMsg}${r}${" ".repeat(Math.max(0, 45 - doneMsg.length))}${ac}│${r}`);
  const restartMsg = i18n.restart;
  console.log(`  ${ac}│${r} ${d}${restartMsg}${r}${" ".repeat(Math.max(0, 45 - restartMsg.length))}${ac}│${r}`);
  console.log(`  ${ac}└─────────────────────────────────────────────┘${r}`);

  console.log(`\n  ${b}${i18n.whatsNext}${r}`);
  console.log(`    ${sc}▶${r} ${i18n.restartHint}`);
  if (pack.layers?.agent) {
    console.log(`    ${ac}▶${r} ${i18n.switchAgent} "${ac}oh-my-claude-${packId}${r}" ${i18n.inAgentSelector}`);
  }
  console.log(`    ${wc}▶${r} ${i18n.tryAnother}  ${d}oh-my-claude-jokes list${r}`);
  console.log(`    ${d}▶${r} ${i18n.resetDefaults} ${d}oh-my-claude-jokes reset${r}`);
  console.log(``);
}

// ── Random theme rotation ─────────────────────────────────────────
// Creates a SessionStart hook script that picks a random theme each session
export function enableRandomTheme(statusLineTemplate) {
  const themePacks = ["cyberpunk", "zen", "chef", "pirate", "retrowave"];
  const themes = {};
  for (const id of themePacks) {
    const pack = loadPack(id);
    if (pack?.layers?.theme?.colors) themes[id] = pack.layers.theme.colors;
  }

  // Build the jq template — inject {theme} if not present
  let tpl = statusLineTemplate || '{model} │ 📂 {cwd} │ 💰 {cost} │ ↓{tokens}';
  if (!tpl.includes('{theme}')) {
    // Replace "FLAG  {model}" with "{model} │ FLAG  {theme}" to combine flag+theme
    tpl = tpl.replace(/^.+?\{model\}/, '{model} │ 🇻🇳  {theme}');
  }
  // Double-escape: \\\\( in source → \\( in jqBase → \\( in generated CJS → \( at runtime (jq interpolation)
  const jqBase = tpl
    .replace(/\{model\}/g, '\\\\(.model.display_name // "?")')
    .replace(/\{cwd\}/g, '\\\\((.workspace.current_dir // ".") | split("/") | last)')
    .replace(/\{cost\}/g, '\\\\(if .cost.total_cost_usd then ("$" + (.cost.total_cost_usd * 100 | round / 100 | tostring)) else "$0" end)')
    .replace(/\{tokens\}/g, '\\\\((.context_window.total_input_tokens // 0) + (.context_window.total_output_tokens // 0))')
    .replace(/\{theme\}/g, "' + pick + '");

  const rotateScriptPath = join(CLAUDE_HOME, ".oh-my-claude-theme-rotate.cjs");
  const statusScriptPath = join(CLAUDE_HOME, ".oh-my-claude-statusline.sh");
  const colorsPath = join(CLAUDE_HOME, ".oh-my-claude-colors.json");

  const script = `#!/usr/bin/env node
// oh-my-claude theme rotator — picks a random theme each session
const fs = require("fs");
const path = require("path");

const CLAUDE_HOME = path.join(process.env.HOME, ".claude");
const SETTINGS_PATH = path.join(CLAUDE_HOME, "settings.json");
const STATUSLINE_PATH = path.join(CLAUDE_HOME, ".oh-my-claude-statusline.sh");
const COLORS_PATH = path.join(CLAUDE_HOME, ".oh-my-claude-colors.json");

const THEMES = ${JSON.stringify(themes, null, 2)};

const themeIds = Object.keys(THEMES);
const pick = themeIds[Math.floor(Math.random() * themeIds.length)];
const colors = THEMES[pick];

try {
  // Update settings.json
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  if (settings["oh-my-claude"]) {
    settings["oh-my-claude"].theme = colors;
    settings["oh-my-claude"].activeThemeId = pick;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\\n");
  }

  // Update colors env
  fs.writeFileSync(COLORS_PATH, JSON.stringify(colors, null, 2) + "\\n");

  // Rewrite statusline script — merge with user's original if present
  const jq = '"${jqBase}"';
  const origCmd = settings["oh-my-claude"]?.originalStatusLine;
  if (origCmd?.type === "command" && origCmd.command) {
    fs.writeFileSync(STATUSLINE_PATH,
      \`#!/bin/bash\\n# oh-my-claude statusline — theme: \${pick} (merged)\\nINPUT=$(cat)\\nPREFIX=$(printf '%s' "$INPUT" | jq -r '\${jq}')\\nORIGINAL=$(printf '%s' "$INPUT" | \${origCmd.command})\\necho "$PREFIX │ $ORIGINAL"\\n\`);
  } else {
    fs.writeFileSync(STATUSLINE_PATH,
      \`#!/bin/bash\\n# oh-my-claude statusline — theme: \${pick}\\njq -r '\${jq}'\\n\`);
  }

  console.log(\`🎨 Theme: \${pick}\`);
} catch (e) {
  console.error("theme-rotate error:", e.message);
}
`;

  writeFileSync(rotateScriptPath, script, { mode: 0o755 });

  // Register the hook in settings
  const settings = loadSettings();
  settings.hooks = settings.hooks || {};
  settings.hooks.SessionStart = settings.hooks.SessionStart || [];

  // Remove any previous theme-rotate hooks
  for (const entry of settings.hooks.SessionStart) {
    if (entry.hooks) {
      entry.hooks = entry.hooks.filter(
        (h) => !h.command?.includes?.("oh-my-claude-theme-rotate")
      );
    }
  }

  // Add theme-rotate before welcome hook in the first matcher="" entry
  let targetEntry = settings.hooks.SessionStart.find((e) => e.matcher === "");
  const rotateHook = {
    type: "command",
    command: `node ${rotateScriptPath} # oh-my-claude-theme-rotate`,
  };

  if (targetEntry) {
    targetEntry.hooks = targetEntry.hooks || [];
    // Insert at position 0 (before welcome)
    targetEntry.hooks.unshift(rotateHook);
  } else {
    settings.hooks.SessionStart.unshift({
      matcher: "",
      hooks: [rotateHook],
    });
  }

  saveSettings(settings);
  return rotateScriptPath;
}

// ── Uninstall / Reset ──────────────────────────────────────────────
export function reset() {
  const settings = loadSettings();

  // Restore user's original statusLine before clearing oh-my-claude
  const originalStatusLine = settings["oh-my-claude"]?.originalStatusLine;

  // Remove oh-my-claude keys
  delete settings["oh-my-claude"];
  delete settings.spinnerVerbs;
  delete settings.spinnerTipsOverride;

  // Restore original statusLine, or remove omc's if no original saved
  if (originalStatusLine) {
    settings.statusLine = originalStatusLine;
  } else if (settings.statusLine?.command?.includes?.("oh-my-claude-statusline")) {
    delete settings.statusLine;
  }

  // Remove welcome + theme-rotate hook commands (but keep the entry if it has other hooks)
  if (settings.hooks?.SessionStart) {
    for (const entry of settings.hooks.SessionStart) {
      if (entry.hooks) {
        entry.hooks = entry.hooks.filter(
          (h) => !h.command?.includes?.("oh-my-claude-welcome") &&
                 !h.command?.includes?.("oh-my-claude-theme-rotate")
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

  // Remove statusline script
  const statusScript = join(CLAUDE_HOME, ".oh-my-claude-statusline.sh");
  if (existsSync(statusScript)) {
    try { unlinkSync(statusScript); } catch {}
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

  // Remove theme-rotate script
  const rotateScript = join(CLAUDE_HOME, ".oh-my-claude-theme-rotate.cjs");
  if (existsSync(rotateScript)) {
    try { unlinkSync(rotateScript); } catch {}
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

// ── Uninstall ───────────────────────────────────────────────────────
export function uninstall(packId) {
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

// ── Create ──────────────────────────────────────────────────────────
export function create(packId) {
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
