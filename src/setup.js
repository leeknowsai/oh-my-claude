// src/setup.js — Setup wizard (2-step interactive selector)

import { ANSI, stripAnsi, toAnsiTop, rawSelect } from "./tui.js";
import {
  BUILTIN_PACKS_DIR, loadPack, loadSettings, saveSettings,
  listPacksFromDir, DEFAULT_I18N,
} from "./packs.js";
import { install, writeColorEnv } from "./install.js";

// ── Constants ─────────────────────────────────────────────────────
export const LOCALE_MAP = [
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

export const THEME_LIST = [
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
export async function setup() {
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
