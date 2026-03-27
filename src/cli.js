#!/usr/bin/env node

import { resolve } from "path";
import { readFileSync } from "fs";
import { ANSI, stripAnsi, parseRgb, toAnsiTop, rawSelect } from "./tui.js";
import {
  __dirname,
  BUILTIN_PACKS_DIR, CLAUDE_HOME, CUSTOM_PACKS_DIR,
  loadSettings, saveSettings,
  loadPack, listPacksFromDir, listPacks,
  DEFAULT_I18N,
} from "./packs.js";
import { install, reset, uninstall, create, writeColorEnv } from "./install.js";

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
  const previewJokes = pack.i18n?.installJokes || DEFAULT_I18N.installJokes;
  const previewJoke = previewJokes[Math.floor(Math.random() * previewJokes.length)];

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

// ── Setup wizard ──────────────────────────────────────────────────
const LOCALE_MAP = [
  { label: "🇺🇸 US Dev — Silicon Valley vibes", pack: "us-dev" },
  { label: "🇬🇧 UK Dev — Dry British wit, innit", pack: "uk-dev" },
  { label: "🇻🇳 Viet Dev — Code mồm thời LLM", pack: "viet-dev" },
  { label: "🇨🇳 China Dev — 996 coding culture", pack: "china-dev" },
  { label: "🇰🇷 Korea Dev — 야근 aesthetics", pack: "korea-dev" },
  { label: "🇮🇳 Desi Dev — Chai-powered jugaad", pack: "desi-dev" },
  { label: "🇩🇪 German Dev — Engineered precision", pack: "de-dev" },
  { label: "🇵🇱 Polish Dev — Januszex survival kit", pack: "pl-dev" },
  { label: "⏩ Skip (English only)", pack: null },
];

const THEME_LIST = [
  { id: "cyberpunk", label: "⚡ Cyberpunk", desc: "Neon hacker aesthetic" },
  { id: "zen", label: "🌿 Zen Garden", desc: "Calm earth tones" },
  { id: "chef", label: "🔥 Hell's Kitchen", desc: "Gordon Ramsay energy" },
  { id: "pirate", label: "🏴‍☠️ Pirate Ship", desc: "Nautical vibes" },
  { id: "retrowave", label: "🌅 Retrowave", desc: "80s synthwave nostalgia" },
  { id: null, label: "🎲 Random (Oh My Claude)", desc: "all themes rotate randomly every session" },
];

// ── Step 1 renderer — language selection ─────────────────────────
function renderLangStep(index) {
  const R = ANSI.reset;
  const B = ANSI.bold;
  const D = ANSI.dim;
  const out = [];
  out.push("");
  out.push(`  ${B}oh-my-claude setup${R}  ${D}(1/2)${R}`);
  out.push("");
  out.push(`  Pick your language:`);
  out.push("");
  for (let i = 0; i < LOCALE_MAP.length; i++) {
    if (i === index) {
      out.push(`  ${ANSI.inverse} > ${LOCALE_MAP[i].label} ${R}`);
    } else {
      out.push(`    ${LOCALE_MAP[i].label}`);
    }
  }
  out.push("");
  out.push(`  ${D}[↑↓] navigate  [enter] select${R}`);
  process.stdout.write(ANSI.cursorTo(1, 1) + ANSI.eraseDown + out.join("\n") + "\n");
}

// ── Step 2 renderer — theme selection with live preview ──────────
function renderThemeStep(index, i18n) {
  const R = ANSI.reset;
  const B = ANSI.bold;
  const D = ANSI.dim;
  const cols = process.stdout.columns || 80;
  const narrow = cols < 96;
  const LEFT_W = 36;

  // Build left panel (theme list)
  const left = [];
  left.push("");
  left.push(`  ${B}${i18n.howToUse ? i18n.howToUse.replace("oh-my-claude", "setup") : "oh-my-claude setup"}${R}  ${D}(2/2)${R}`);
  left.push("");
  left.push(`  ${i18n.vibePacks || "Pick your theme"}:`);
  left.push("");

  for (let i = 0; i < THEME_LIST.length; i++) {
    const t = THEME_LIST[i];
    if (i === index) {
      left.push(`  ${ANSI.inverse} > ${t.label} ${R}`);
    } else {
      left.push(`    ${t.label}`);
    }
    left.push(`      ${D}${t.desc}${R}`);
  }
  left.push("");
  left.push(`  ${D}[↑↓] navigate  [enter] select${R}`);

  // Narrow terminal: list only, no preview
  if (narrow) {
    process.stdout.write(ANSI.cursorTo(1, 1) + ANSI.eraseDown + left.join("\n") + "\n");
    return;
  }

  // Build right panel (live preview)
  const chosen = THEME_LIST[index];
  const right = buildThemePreview(chosen, i18n);

  // Merge left + right panels
  const maxRows = Math.max(left.length, right.length);
  const merged = [];
  for (let r = 0; r < maxRows; r++) {
    const l = r < left.length ? left[r] : "";
    const rv = r < right.length ? right[r] : "";
    const lVisible = stripAnsi(l);
    const padding = Math.max(0, LEFT_W - lVisible.length);
    merged.push(l + " ".repeat(padding) + "  " + rv);
  }

  process.stdout.write(ANSI.cursorTo(1, 1) + ANSI.eraseDown + merged.join("\n") + "\n");
}

function buildThemePreview(themeEntry, i18n) {
  const R = ANSI.reset;
  const B = ANSI.bold;
  const D = ANSI.dim;
  const W = 52;
  const lines = [];

  // Random option — show combined stats
  if (!themeEntry.id) {
    const flagship = loadPack("oh-my-claude");
    const fc = flagship?.layers?.theme?.colors || {};
    const ac = toAnsiTop(fc.claude) || "\x1b[36m";
    const sc = toAnsiTop(fc.success) || "\x1b[32m";
    const wc = toAnsiTop(fc.warning) || "\x1b[33m";
    lines.push(`  ${ac}┌${"─".repeat(W)}┐${R}`);
    lines.push(`  ${ac}│${R} ${B}${ac}🎲 Random (Oh My Claude)${R}${" ".repeat(W - 25)}${ac}│${R}`);
    lines.push(`  ${ac}│${R} ${D}All themes rotate randomly every session${R}${" ".repeat(W - 41)}${ac}│${R}`);
    lines.push(`  ${ac}├${"─".repeat(W)}┤${R}`);

    const verbCount = flagship?.layers?.spinners?.verbs?.length || 110;
    const tipCount = flagship?.layers?.tips?.tips?.length || 340;
    lines.push(`  ${ac}│${R}  ${sc}${verbCount}${R} ${i18n.themedVerbs || "spinner verbs"}${" ".repeat(Math.max(0, W - String(verbCount).length - (i18n.themedVerbs || "spinner verbs").length - 3))}${ac}│${R}`);
    lines.push(`  ${ac}│${R}  ${wc}${tipCount}+${R} ${i18n.jokesInYourLang || "jokes/tips"}${" ".repeat(Math.max(0, W - String(tipCount).length - (i18n.jokesInYourLang || "jokes/tips").length - 4))}${ac}│${R}`);
    lines.push(`  ${ac}│${R}  ${ac}5${R} agents included${" ".repeat(Math.max(0, W - 19))}${ac}│${R}`);
    lines.push(`  ${ac}│${R}  ${ac}5${R} color themes bundled${" ".repeat(Math.max(0, W - 22))}${ac}│${R}`);
    lines.push(`  ${ac}└${"─".repeat(W)}┘${R}`);
    return lines;
  }

  // Load the theme pack for preview
  const pack = loadPack(themeEntry.id);
  if (!pack) {
    lines.push(`  (pack not found)`);
    return lines;
  }

  const colors = pack.layers?.theme?.colors || {};
  const ac = toAnsiTop(colors.claude) || "\x1b[36m";
  const sc = toAnsiTop(colors.success) || "\x1b[32m";
  const wc = toAnsiTop(colors.warning) || "\x1b[33m";
  const ec = toAnsiTop(colors.error) || "\x1b[31m";
  const tc = toAnsiTop(colors.text) || "";

  const padR = (s, w) => {
    const vis = stripAnsi(s).length;
    return vis >= w ? s : s + " ".repeat(w - vis);
  };

  lines.push(`  ${ac}┌${"─".repeat(W)}┐${R}`);

  // ASCII art (first 3 lines)
  if (pack.layers?.welcome?.art) {
    const artLines = pack.layers.welcome.art.split("\n").slice(0, 3);
    for (const al of artLines) {
      const trimmed = al.slice(0, W - 2);
      lines.push(`  ${ac}│${R} ${ac}${trimmed.padEnd(W - 1)}${R}${ac}│${R}`);
    }
    lines.push(`  ${ac}├${"─".repeat(W)}┤${R}`);
  }

  // Theme name + description
  lines.push(`  ${ac}│${R} ${B}${ac}${pack.name.slice(0, W - 2).padEnd(W - 1)}${R}${ac}│${R}`);
  lines.push(`  ${ac}│${R} ${D}${pack.description.slice(0, W - 2).padEnd(W - 1)}${R}${ac}│${R}`);
  lines.push(`  ${ac}├${"─".repeat(W)}┤${R}`);

  // Color swatches
  const colorsLabel = i18n.colors || "Colors:";
  const swatches = `${ac}██${R} ${sc}██${R} ${ec}██${R} ${wc}██${R} ${tc}██${R}`;
  const swatchLine = `${colorsLabel} ${swatches}`;
  lines.push(`  ${ac}│${R} ${padR(swatchLine, W - 1)}${ac}│${R}`);
  lines.push(`  ${ac}├${"─".repeat(W)}┤${R}`);

  // Sample spinner verbs (deterministic: first 4)
  if (pack.layers?.spinners?.verbs?.length) {
    const spinLabel = i18n.preview ? `${i18n.preview.replace(":", "")} Verbs:` : "Spinner Verbs:";
    lines.push(`  ${ac}│${R} ${B}${spinLabel}${R}${" ".repeat(Math.max(0, W - stripAnsi(spinLabel).length - 1))}${ac}│${R}`);
    const verbs = pack.layers.spinners.verbs.slice(0, 4);
    for (const v of verbs) {
      const line = `  ${ac}✻${R} ${v}`;
      lines.push(`  ${ac}│${R} ${padR(line, W - 1)}${ac}│${R}`);
    }
    lines.push(`  ${ac}├${"─".repeat(W)}┤${R}`);
  }

  // Agent name + first sentence
  if (pack.layers?.agent) {
    const agentLabel = "Agent:";
    const agentName = pack.layers.agent.name;
    lines.push(`  ${ac}│${R} ${B}${agentLabel}${R} ${ac}${agentName.slice(0, W - agentLabel.length - 3)}${R}${" ".repeat(Math.max(0, W - agentLabel.length - agentName.length - 2))}${ac}│${R}`);
    const firstSentence = pack.layers.agent.personality.split(". ")[0] + ".";
    const maxW = W - 4;
    const chunk = firstSentence.slice(0, maxW);
    lines.push(`  ${ac}│${R}   ${D}${chunk.padEnd(W - 3)}${R}${ac}│${R}`);
  }

  lines.push(`  ${ac}└${"─".repeat(W)}┘${R}`);
  return lines;
}

// ── applyThemeOverlay — overlay theme colors onto existing install ─
function applyThemeOverlay(themePackId) {
  const themePack = loadPack(themePackId);
  if (!themePack?.layers?.theme?.colors) return;

  const settings = loadSettings();
  settings["oh-my-claude"] = settings["oh-my-claude"] || {};
  settings["oh-my-claude"].theme = themePack.layers.theme.colors;
  writeColorEnv(themePack.layers.theme.colors);
  saveSettings(settings);
}

// ── showUsageGuide — post-install guide with i18n ────────────────
function showUsageGuide(localePack, chosenTheme) {
  const activePack = localePack || loadPack("oh-my-claude");
  const guideI18n = { ...DEFAULT_I18N, ...(activePack?.i18n || {}) };
  const themeColors = chosenTheme ? loadPack(chosenTheme)?.layers?.theme?.colors : null;
  const guideColors = themeColors || activePack?.layers?.theme?.colors || {};
  const R = ANSI.reset;
  const B = ANSI.bold;
  const D = ANSI.dim;
  const gc = toAnsiTop(guideColors.claude) || "\x1b[36m";
  const gs = toAnsiTop(guideColors.success) || "\x1b[32m";
  const gw = toAnsiTop(guideColors.warning) || "\x1b[33m";

  console.log(`\n  ${gc}────────────────────────────────────────${R}`);
  console.log(`  📖 ${B}${guideI18n.howToUse || "How to use oh-my-claude"}${R}\n`);

  if (localePack) {
    console.log(`  ${gs}✅${R} ${B}${guideI18n.installed || "Installed"}:${R} ${gc}${localePack.name}${R}`);
    console.log(`    ${D}${localePack.description}${R}`);
    console.log(`    ${gc}•${R} ${localePack.layers?.tips?.tips?.length || 0} ${guideI18n.jokesInYourLang || "jokes/tips in your language"}`);
    console.log(`    ${gc}•${R} ${localePack.layers?.spinners?.verbs?.length || 0} ${guideI18n.themedVerbs || "themed spinner verbs"}`);
    if (localePack.layers?.agent) {
      console.log(`    ${gc}•${R} Agent "${gc}${localePack.layers.agent.name}${R}" — ${guideI18n.selectAgent || "select in Claude Code agent picker"}`);
    }
    console.log(``);
  }

  console.log(`  ${gw}${B}${guideI18n.vibePacks || "VIBE PACKS"} ${D}(${guideI18n.switchAnytime || "switch anytime"}):${R}`);
  const builtins = listPacksFromDir(BUILTIN_PACKS_DIR);
  builtins.forEach((p) => {
    console.log(`    ${gc}${p.id.padEnd(14)}${R} ${D}${p.description}${R}`);
  });

  console.log(`\n  ${gw}${B}${guideI18n.commands || "COMMANDS"}:${R}`);
  console.log(`    ${gc}oh-my-claude install <pack>${R}   ${D}${guideI18n.cmdInstall || "Switch to a different pack"}${R}`);
  console.log(`    ${gc}oh-my-claude preview <pack>${R}   ${D}${guideI18n.cmdPreview || "Preview before installing"}${R}`);
  console.log(`    ${gc}oh-my-claude list${R}              ${D}${guideI18n.cmdList || "See all available packs"}${R}`);
  console.log(`    ${gc}oh-my-claude reset${R}             ${D}${guideI18n.cmdReset || "Reset to defaults"}${R}`);
  console.log(``);
}

// ── Setup wizard — 2-step interactive selector ───────────────────
async function setup() {
  // TTY check
  if (!process.stdin.isTTY) {
    console.error("\n  ✗ Interactive setup requires a TTY. Use: oh-my-claude install <pack>\n");
    process.exit(1);
  }

  // Cleanup handler — restore cursor + raw mode on unexpected exit
  const cleanupExit = () => {
    process.stdout.write(ANSI.showCursor);
    try { process.stdin.setRawMode(false); } catch {}
  };
  process.on("exit", cleanupExit);
  process.on("SIGINT", () => { cleanupExit(); process.exit(0); });
  process.on("SIGTERM", () => { cleanupExit(); process.exit(0); });

  // Step 1: Language selection
  process.stdout.write(ANSI.clearScreen);
  const langIdx = await rawSelect({
    items: LOCALE_MAP,
    render: renderLangStep,
  });

  const chosenLocale = LOCALE_MAP[langIdx];
  let localePack = null;
  if (chosenLocale.pack) {
    localePack = loadPack(chosenLocale.pack);
  }

  // Determine i18n for step 2 labels
  const stepI18n = { ...DEFAULT_I18N, ...(localePack?.i18n || {}) };

  // Step 2: Theme selection
  process.stdout.write(ANSI.clearScreen);
  const themeIdx = await rawSelect({
    items: THEME_LIST,
    render: (idx) => renderThemeStep(idx, stepI18n),
  });

  const chosenTheme = THEME_LIST[themeIdx];

  // Clear screen for install output
  process.stdout.write(ANSI.clearScreen + ANSI.cursorTo(1, 1));

  // Install
  if (localePack) {
    // Language pack chosen — install it, then overlay theme colors
    install(localePack.id);
    if (chosenTheme.id) {
      applyThemeOverlay(chosenTheme.id);
    }
    // If Random (null id) — keep flagship/lang colors as-is
  } else {
    // Skip language — install theme pack directly (has all layers)
    if (chosenTheme.id) {
      install(chosenTheme.id);
    } else {
      // Random — install flagship pack
      install("oh-my-claude");
    }
  }

  // Show usage guide
  showUsageGuide(localePack, chosenTheme.id);
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
