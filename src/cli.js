#!/usr/bin/env node

// src/cli.js — CLI entry point

import { CUSTOM_PACKS_DIR, listPacks, loadSettings } from "./packs.js";
import { install, reset, uninstall, create } from "./install.js";
import { preview } from "./preview.js";
import { setup } from "./setup.js";

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
