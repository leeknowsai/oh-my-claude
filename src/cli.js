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
// Write colors as a reference JSON that can be sourced.
function writeColorEnv(colors) {
  const envPath = join(CLAUDE_HOME, ".oh-my-claude-colors.json");
  writeFileSync(envPath, JSON.stringify(colors, null, 2) + "\n");
  return envPath;
}

// ── Default English UI strings (fallback when pack has no i18n) ────
const DEFAULT_I18N = {
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
  // "How to use" guide strings
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

// ── Install ────────────────────────────────────────────────────────
function install(packId, options = {}) {
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
  if (layers.statusLine && !options.skipStatusLine) {
    settings["oh-my-claude"] = settings["oh-my-claude"] || {};
    settings["oh-my-claude"].statusLine = layers.statusLine.template;

    const statusScriptPath = join(CLAUDE_HOME, ".oh-my-claude-statusline.sh");
    const template = layers.statusLine.template;

    // Build jq expression that replaces {model}, {cwd}, {cost}, {tokens}
    // jq reads JSON from stdin provided by Claude Code
    const jqExpr = template
      .replace(/\{model\}/g, '\\(.model.display_name // "?")')
      .replace(/\{cwd\}/g, '\\((.workspace.current_dir // ".") | split("/") | last)')
      .replace(/\{cost\}/g, '\\(if .cost.total_cost_usd then ("$" + (.cost.total_cost_usd * 100 | round / 100 | tostring)) else "$0" end)')
      .replace(/\{tokens\}/g, '\\((.context_window.total_input_tokens // 0) + (.context_window.total_output_tokens // 0))');

    const statusScript = [
      `#!/bin/bash`,
      `# oh-my-claude statusline — generated from template: ${template}`,
      `jq -r '"${jqExpr}"'`,
    ].join("\n") + "\n";

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
  console.log(`    ${wc}▶${r} ${i18n.tryAnother}  ${d}oh-my-claude-cli list${r}`);
  console.log(`    ${d}▶${r} ${i18n.resetDefaults} ${d}oh-my-claude-cli reset${r}`);
  console.log(``);
}

// ── Uninstall / Reset ──────────────────────────────────────────────
function reset() {
  const settings = loadSettings();

  // Remove oh-my-claude keys
  delete settings["oh-my-claude"];
  delete settings.spinnerVerbs;
  delete settings.spinnerTipsOverride;

  // Remove statusLine if it points to our generated script
  if (settings.statusLine?.command?.includes?.("oh-my-claude-statusline")) {
    delete settings.statusLine;
  }

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

  const layers = pack.layers;
  const colors = layers.theme?.colors || {};
  // Parse rgb string to ANSI escape
  const toAnsi = (rgb) => {
    if (!rgb) return "";
    const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return "";
    return `\x1b[38;2;${m[1]};${m[2]};${m[3]}m`;
  };
  const reset = "\x1b[0m";
  const dim = "\x1b[2m";
  const bold = "\x1b[1m";
  const accent = toAnsi(colors.claude) || "\x1b[36m";
  const subtle = toAnsi(colors.subtle) || "\x1b[90m";
  const success = toAnsi(colors.success) || "\x1b[32m";
  const warn = toAnsi(colors.warning) || "\x1b[33m";
  const W = 58; // box inner width

  const line = (ch = "─") => ch.repeat(W);
  const pad = (s, w = W) => {
    const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
    const visible = stripped.length;
    return visible >= w ? s : s + " ".repeat(w - visible);
  };
  const box = (content) => `  │ ${pad(content, W)} │`;

  // Read version from package.json
  const pkgJson = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
  const version = pkgJson.version;
  const previewJoke = INSTALL_JOKES[Math.floor(Math.random() * INSTALL_JOKES.length)];

  console.log("");
  console.log(`  ${accent}${bold}oh-my-claude${reset} ${dim}v${version}${reset}`);
  console.log(`  ${dim}${previewJoke}${reset}`);
  console.log("");

  // ── Top border ──
  console.log(`  ${accent}┌${line()}┐${reset}`);

  // ── Welcome ASCII art ──
  if (layers.welcome?.art) {
    const artLines = layers.welcome.art.split("\n").slice(0, 8);
    artLines.forEach((l) => {
      console.log(`  ${accent}│${reset} ${accent}${l.slice(0, W).padEnd(W)}${reset} ${accent}│${reset}`);
    });
    console.log(`  ${accent}├${line()}┤${reset}`);
  }

  // ── Pack name + description ──
  console.log(`  ${accent}│${reset} ${bold}${accent}${pack.name.padEnd(W)}${reset} ${accent}│${reset}`);
  console.log(`  ${accent}│${reset} ${dim}${pack.description.slice(0, W).padEnd(W)}${reset} ${accent}│${reset}`);
  console.log(`  ${accent}├${line()}┤${reset}`);

  // ── Stats bar ──
  const tipCount = layers.tips?.tips?.length || 0;
  const spinnerCount = layers.spinners?.verbs?.length || 0;
  const statsLine = `${success}${tipCount} jokes${reset}  ${accent}${spinnerCount} spinners${reset}  ${warn}${pack.tags?.length || 0} tags${reset}`;
  console.log(`  ${accent}│${reset} ${pad(statsLine, W)} ${accent}│${reset}`);
  console.log(`  ${accent}├${line()}┤${reset}`);

  // ── Spinner verbs ──
  if (layers.spinners) {
    console.log(`  ${accent}│${reset} ${bold}Spinner Verbs${reset}${" ".repeat(W - 13)} ${accent}│${reset}`);
    // Show 5 random spinners
    const verbs = layers.spinners.verbs;
    const sample = [];
    const used = new Set();
    while (sample.length < Math.min(5, verbs.length)) {
      const idx = Math.floor(Math.random() * verbs.length);
      if (!used.has(idx)) { used.add(idx); sample.push(verbs[idx]); }
    }
    sample.forEach((v) => {
      console.log(`  ${accent}│${reset}   ${accent}✻${reset} ${v.slice(0, W - 4).padEnd(W - 4)} ${accent}│${reset}`);
    });
    console.log(`  ${accent}├${line()}┤${reset}`);
  }

  // ── Sample jokes (each joke gets a different color theme) ──
  if (layers.tips?.tips?.length) {
    console.log(`  ${accent}│${reset} ${bold}Sample Jokes${reset}${" ".repeat(W - 12)} ${accent}│${reset}`);
    const tips = layers.tips.tips;
    const shown = new Set();
    let count = 0;
    // Cycle through different colors for each joke
    const jokeStyles = [
      { icon: "💬", color: toAnsi(colors.claude) || "\x1b[36m" },
      { icon: "🔥", color: toAnsi(colors.error) || "\x1b[31m" },
      { icon: "✦", color: toAnsi(colors.success) || "\x1b[32m" },
      { icon: "⚡", color: toAnsi(colors.warning) || "\x1b[33m" },
      { icon: "◈", color: toAnsi(colors.subtle) || "\x1b[90m" },
    ];
    while (count < 5 && count < tips.length) {
      const idx = Math.floor(Math.random() * tips.length);
      if (shown.has(idx)) continue;
      shown.add(idx);
      const tip = tips[idx];
      const style = jokeStyles[count % jokeStyles.length];
      // Word-wrap long tips
      const maxW = W - 4;
      const words = tip.split(" ");
      let current = "";
      const wrapped = [];
      for (const w of words) {
        if ((current + " " + w).trim().length > maxW) {
          wrapped.push(current.trim());
          current = w;
        } else {
          current = current ? current + " " + w : w;
        }
      }
      if (current.trim()) wrapped.push(current.trim());
      wrapped.forEach((l, i) => {
        const prefix = i === 0 ? `${style.color}${style.icon}${reset} ` : "   ";
        console.log(`  ${accent}│${reset}   ${prefix}${style.color}${l.slice(0, maxW).padEnd(maxW)}${reset} ${accent}│${reset}`);
      });
      count++;
    }
    console.log(`  ${accent}├${line()}┤${reset}`);
  }

  // ── Theme colors ──
  if (colors.claude) {
    console.log(`  ${accent}│${reset} ${bold}Theme Colors${reset}${" ".repeat(W - 12)} ${accent}│${reset}`);
    const colorEntries = [
      ["accent", colors.claude],
      ["text", colors.text],
      ["success", colors.success],
      ["error", colors.error],
      ["warning", colors.warning],
    ];
    const colorLine = colorEntries
      .filter(([, v]) => v)
      .map(([name, v]) => `${toAnsi(v)}██${reset} ${name}`)
      .join("  ");
    console.log(`  ${accent}│${reset}   ${pad(colorLine, W - 2)} ${accent}│${reset}`);
    console.log(`  ${accent}├${line()}┤${reset}`);
  }

  // ── Agent personality ──
  if (layers.agent) {
    console.log(`  ${accent}│${reset} ${bold}Agent:${reset} ${accent}${layers.agent.name.slice(0, W - 7).padEnd(W - 7)}${reset} ${accent}│${reset}`);
    // Show first sentence of personality
    const firstSentence = layers.agent.personality.split(". ")[0] + ".";
    const maxW = W - 2;
    for (let i = 0; i < firstSentence.length && i < maxW * 2; i += maxW) {
      const chunk = firstSentence.slice(i, i + maxW);
      console.log(`  ${accent}│${reset}   ${dim}${chunk.padEnd(maxW)}${reset} ${accent}│${reset}`);
    }
    console.log(`  ${accent}├${line()}┤${reset}`);
  }

  // ── Install command ──
  const installCmd = `npx oh-my-claude-cli install ${packId}`;
  const error = toAnsi(colors.error) || "\x1b[31m";
  console.log(`  ${accent}│${reset}${" ".repeat(W)} ${accent}│${reset}`);
  console.log(`  ${accent}│${reset}   ${success}▶ ${bold}${installCmd}${reset}${" ".repeat(Math.max(0, W - installCmd.length - 4))} ${accent}│${reset}`);
  console.log(`  ${accent}│${reset}${" ".repeat(W)} ${accent}│${reset}`);

  // ── Bottom border ──
  console.log(`  ${accent}└${line()}┘${reset}`);

  // ── Fun footer ──
  const footerJokes = [
    "Your terminal deserves better than default gray.",
    "Life's too short for boring spinners.",
    "One install away from mass-produced serotonin.",
    "Warning: colleagues may ask what you installed.",
    "Clinically proven to reduce deploy anxiety by 3%.",
    "Pairs well with coffee and existential dread.",
  ];
  const footer = footerJokes[Math.floor(Math.random() * footerJokes.length)];
  console.log(`\n  ${dim}${footer}${reset}`);
  console.log("");
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

  // Show usage guide with theming + i18n
  const activePack = localePack || loadPack("oh-my-claude");
  const guideI18n = { ...DEFAULT_I18N, ...(activePack?.i18n || {}) };
  const guideColors = activePack?.layers?.theme?.colors || {};
  const toAnsiGuide = (rgb) => {
    if (!rgb) return "";
    const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return m ? `\x1b[38;2;${m[1]};${m[2]};${m[3]}m` : "";
  };
  const r = "\x1b[0m";
  const b = "\x1b[1m";
  const d = "\x1b[2m";
  const gc = toAnsiGuide(guideColors.claude) || "\x1b[36m";
  const gs = toAnsiGuide(guideColors.success) || "\x1b[32m";
  const gw = toAnsiGuide(guideColors.warning) || "\x1b[33m";

  console.log(`\n  ${gc}────────────────────────────────────────${r}`);
  console.log(`  📖 ${b}${guideI18n.howToUse || "How to use oh-my-claude"}${r}\n`);

  if (localePack) {
    console.log(`  ${gs}✅${r} ${b}${guideI18n.installed || "Installed"}:${r} ${gc}${localePack.name}${r}`);
    console.log(`    ${d}${localePack.description}${r}`);
    console.log(`    ${gc}•${r} ${localePack.layers?.tips?.tips?.length || 0} ${guideI18n.jokesInYourLang || "jokes/tips in your language"}`);
    console.log(`    ${gc}•${r} ${localePack.layers?.spinners?.verbs?.length || 0} ${guideI18n.themedVerbs || "themed spinner verbs"}`);
    if (localePack.layers?.agent) {
      console.log(`    ${gc}•${r} Agent "${gc}${localePack.layers.agent.name}${r}" — ${guideI18n.selectAgent || "select in Claude Code agent picker"}`);
    }
    console.log(``);
  }

  console.log(`  ${gw}${b}${guideI18n.vibePacks || "VIBE PACKS"} ${d}(${guideI18n.switchAnytime || "switch anytime"}):${r}`);
  const builtins = listPacksFromDir(BUILTIN_PACKS_DIR);
  builtins.forEach((p) => {
    console.log(`    ${gc}${p.id.padEnd(14)}${r} ${d}${p.description}${r}`);
  });

  console.log(`\n  ${gw}${b}${guideI18n.commands || "COMMANDS"}:${r}`);
  console.log(`    ${gc}oh-my-claude-cli install <pack>${r}   ${d}${guideI18n.cmdInstall || "Switch to a different pack"}${r}`);
  console.log(`    ${gc}oh-my-claude-cli preview <pack>${r}   ${d}${guideI18n.cmdPreview || "Preview before installing"}${r}`);
  console.log(`    ${gc}oh-my-claude-cli list${r}              ${d}${guideI18n.cmdList || "See all available packs"}${r}`);
  console.log(`    ${gc}oh-my-claude-cli reset${r}             ${d}${guideI18n.cmdReset || "Reset to defaults"}${r}`);
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
    uk-dev           🇬🇧 British tea-driven development
    china-dev        🇨🇳 码农 996/摸鱼 humor
    korea-dev        🇰🇷 야근 Korean dev culture
    viet-dev         🇻🇳 Vietnamese dev jokes
    desi-dev         🇮🇳 Hinglish chai-powered vibes
    de-dev           🇩🇪 German engineering Denglish
    pl-dev           🇵🇱 Polish Januszex survival kit
`);
    break;
}
