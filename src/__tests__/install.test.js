import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import { install, reset, create } from "../install.js";
import { loadSettings, CLAUDE_HOME, CUSTOM_PACKS_DIR, loadGlobalConfig } from "../packs.js";

const WELCOME_SCRIPT = join(CLAUDE_HOME, ".oh-my-claude-welcome.sh");
const SETTINGS_PATH = join(CLAUDE_HOME, "settings.json");

// Save/restore settings around tests
let originalSettings = null;

beforeEach(() => {
  if (existsSync(SETTINGS_PATH)) {
    originalSettings = readFileSync(SETTINGS_PATH, "utf-8");
  }
});

afterEach(() => {
  if (originalSettings) {
    writeFileSync(SETTINGS_PATH, originalSettings);
  }
});

describe("install", () => {
  it("installs a built-in pack successfully", () => {
    install("oh-my-claude");
    const settings = loadSettings();
    expect(settings["oh-my-claude"]?.activePackId).toBe("oh-my-claude");
  });

  it("creates welcome script", () => {
    install("oh-my-claude");
    expect(existsSync(WELCOME_SCRIPT)).toBe(true);
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    expect(script).toContain("#!/bin/bash");
    expect(script).toContain("oh-my-claude-welcome");
    expect(script).toContain("JOKES=(");
  });

  it("generates wide box (70 chars) in welcome script", () => {
    install("oh-my-claude");
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    // Box border should be 70 dashes
    expect(script).toContain("─".repeat(70));
  });

  it("sets up SessionStart hook", () => {
    install("oh-my-claude");
    const settings = loadSettings();
    const hooks = settings.hooks?.SessionStart;
    expect(hooks).toBeDefined();
    const hasWelcome = hooks.some((e) =>
      e.hooks?.some((h) => h.command?.includes("oh-my-claude-welcome"))
    );
    expect(hasWelcome).toBe(true);
  });

  it("installs spinner verbs", () => {
    install("oh-my-claude");
    const settings = loadSettings();
    expect(settings.spinnerVerbs).toBeDefined();
    expect(settings.spinnerVerbs.verbs.length).toBeGreaterThan(0);
  });

  it("installs spinner tips", () => {
    install("oh-my-claude");
    const settings = loadSettings();
    expect(settings.spinnerTipsOverride).toBeDefined();
    expect(settings.spinnerTipsOverride.tips.length).toBeGreaterThan(5);
  });
});

describe("install with jokeServer", () => {
  const configDir = join(CLAUDE_HOME, "oh-my-claude");
  const configPath = join(configDir, "config.json");
  let hadConfig = false;
  let originalConfig = null;

  beforeEach(() => {
    if (existsSync(configPath)) {
      hadConfig = true;
      originalConfig = readFileSync(configPath, "utf-8");
    }
  });

  afterEach(() => {
    if (hadConfig) {
      writeFileSync(configPath, originalConfig);
    } else if (existsSync(configPath)) {
      rmSync(configPath);
    }
  });

  it("includes curl fetch when jokeServer configured", () => {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      jokeServer: { url: "https://jokes.test.com", timeout: 2 },
    }));
    install("oh-my-claude");
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    expect(script).toContain("curl -sf --max-time 2");
    expect(script).toContain("https://jokes.test.com/oh-my-claude");
    expect(script).toContain("REMOTE_JOKE");
    expect(script).toContain('if [ -n "$REMOTE_JOKE" ]');
  });

  it("uses default timeout of 3 when not specified", () => {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      jokeServer: { url: "https://jokes.test.com" },
    }));
    install("oh-my-claude");
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    expect(script).toContain("curl -sf --max-time 3");
  });

  it("omits curl when no jokeServer configured", () => {
    if (existsSync(configPath)) rmSync(configPath);
    install("oh-my-claude");
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    expect(script).not.toContain("curl");
    expect(script).not.toContain("REMOTE_JOKE");
  });

  it("includes local fallback alongside remote fetch", () => {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      jokeServer: { url: "https://jokes.test.com" },
    }));
    install("oh-my-claude");
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    // Must have both remote fetch AND local jokes array
    expect(script).toContain("REMOTE_JOKE");
    expect(script).toContain("JOKES=(");
    expect(script).toContain("else");
  });

  it("appends packId to joke server URL", () => {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      jokeServer: { url: "https://api.example.com/jokes" },
    }));
    install("oh-my-claude");
    const script = readFileSync(WELCOME_SCRIPT, "utf-8");
    expect(script).toContain("https://api.example.com/jokes/oh-my-claude");
  });
});

describe("reset", () => {
  it("removes oh-my-claude settings", () => {
    install("oh-my-claude");
    reset();
    const settings = loadSettings();
    expect(settings["oh-my-claude"]).toBeUndefined();
    expect(settings.spinnerVerbs).toBeUndefined();
    expect(settings.spinnerTipsOverride).toBeUndefined();
  });

  it("removes welcome script", () => {
    install("oh-my-claude");
    expect(existsSync(WELCOME_SCRIPT)).toBe(true);
    reset();
    expect(existsSync(WELCOME_SCRIPT)).toBe(false);
  });

  it("removes welcome hook from SessionStart", () => {
    install("oh-my-claude");
    reset();
    const settings = loadSettings();
    const hooks = settings.hooks?.SessionStart || [];
    const hasWelcome = hooks.some((e) =>
      e.hooks?.some((h) => h.command?.includes("oh-my-claude-welcome"))
    );
    expect(hasWelcome).toBe(false);
  });
});

describe("create", () => {
  const testPackId = "vitest-temp-pack";
  const testPackDir = join(CUSTOM_PACKS_DIR, testPackId);

  afterEach(() => {
    if (existsSync(testPackDir)) {
      rmSync(testPackDir, { recursive: true });
    }
  });

  it("creates a custom pack with valid JSON", () => {
    create(testPackId);
    const packPath = join(testPackDir, "pack.json");
    expect(existsSync(packPath)).toBe(true);
    const pack = JSON.parse(readFileSync(packPath, "utf-8"));
    expect(pack.id).toBe(testPackId);
    expect(pack.version).toBe("0.1.0");
    expect(pack.layers).toBeDefined();
    expect(pack.layers.theme).toBeDefined();
    expect(pack.layers.spinners).toBeDefined();
    expect(pack.layers.tips).toBeDefined();
  });

  it("rejects invalid pack id", () => {
    expect(() => create("INVALID_ID")).toThrow();
  });
});
