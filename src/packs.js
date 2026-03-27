import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { homedir } from "os";

// ── Paths ──────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_PACKS_DIR = resolve(__dirname, "..", "packs");
const LOCALS_PACKS_DIR = resolve(__dirname, "..", "local-dev-jokes");

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

// ── Global config ──────────────────────────────────────────────────
const GLOBAL_CONFIG_PATH = join(CLAUDE_HOME, "oh-my-claude", "config.json");

function loadGlobalConfig() {
  try {
    return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

// ── Exports ────────────────────────────────────────────────────────
export {
  __dirname,
  BUILTIN_PACKS_DIR,
  LOCALS_PACKS_DIR,
  CLAUDE_HOME,
  CLAUDE_SETTINGS,
  CLAUDE_AGENTS_DIR,
  BACKUP_DIR,
  CUSTOM_PACKS_DIR,
  loadSettings,
  saveSettings,
  backupSettings,
  resolvePackPath,
  loadPack,
  listPacksFromDir,
  listPacks,
  DEFAULT_I18N,
  loadGlobalConfig,
};
