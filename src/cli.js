#!/usr/bin/env node

// src/cli.js — CLI entry point

import { CUSTOM_PACKS_DIR, listPacks, loadSettings } from "./packs.js";
import { install, reset, uninstall, create } from "./install.js";
import { preview } from "./preview.js";
import { setup } from "./setup.js";
import { ANSI } from "./tui.js";

const B = ANSI.bold;
const D = ANSI.dim;
const R = ANSI.reset;
const A = ANSI.rgb(120, 200, 255); // accent color

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

  case undefined:
    setup();
    break;

  case "help":
  case "--help":
  case "-h":
  default:
    console.log(`
  ${B}${A}oh-my-claude${R} ${D}— Theme packs for Claude Code${R}

  ${B}USAGE${R}
    ${A}oh-my-claude${R} <command> [args]

  ${B}COMMANDS${R}
    ${A}setup${R}            Interactive setup — pick your locale & vibe
    ${A}install${R} <pack>   Install a theme pack
    ${A}uninstall${R}        Remove the active pack
    ${A}list${R}             List available packs
    ${A}preview${R} <pack>   Preview a pack without installing
    ${A}create${R} <id>      Create a new custom pack template
    ${A}current${R}          Show currently active pack
    ${A}reset${R}            Remove all oh-my-claude customizations
    ${A}help${R}             Show this help

  ${B}EXAMPLES${R}
    ${D}oh-my-claude setup${R}
    ${D}oh-my-claude install cyberpunk${R}
    ${D}oh-my-claude list${R}
    ${D}oh-my-claude preview zen${R}
    ${D}oh-my-claude create my-theme${R}
    ${D}oh-my-claude uninstall${R}
    ${D}oh-my-claude reset${R}

  ${B}CUSTOM PACKS${R}
    Create your own:  ${A}oh-my-claude create my-theme${R}
    Packs dir:        ${D}${CUSTOM_PACKS_DIR}${R}

  ${B}BUILT-IN PACKS${R}
    ${A}cyberpunk${R}        Neon-soaked hacker aesthetic
    ${A}zen${R}              Calm earth tones for focused coding
    ${A}chef${R}             Gordon Ramsay energy in your terminal
    ${A}pirate${R}           Nautical vibes, treasure hunting
    ${A}retrowave${R}        80s synthwave nostalgia

  ${B}COMMUNITY PACKS${R} ${D}(local-dev-jokes/)${R}
    ${A}uk-dev${R}           🇬🇧 British tea-driven development
    ${A}china-dev${R}        🇨🇳 码农 996/摸鱼 humor
    ${A}korea-dev${R}        🇰🇷 야근 Korean dev culture
    ${A}viet-dev${R}         🇻🇳 Vietnamese dev jokes
    ${A}desi-dev${R}         🇮🇳 Hinglish chai-powered vibes
    ${A}de-dev${R}           🇩🇪 German engineering Denglish
    ${A}pl-dev${R}           🇵🇱 Polish Januszex survival kit
`);
    break;
}
