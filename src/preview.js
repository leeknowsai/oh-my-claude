import { resolve } from "path";
import { readFileSync } from "fs";
import { loadPack, DEFAULT_I18N, __dirname } from "./packs.js";

export function preview(packId) {
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
