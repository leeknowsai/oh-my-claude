import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import {
  loadSettings, saveSettings, resolvePackPath, loadPack,
  listPacksFromDir, listPacks, DEFAULT_I18N, loadGlobalConfig,
  BUILTIN_PACKS_DIR, LOCALS_PACKS_DIR, CLAUDE_HOME, CUSTOM_PACKS_DIR,
} from "../packs.js";

describe("constants", () => {
  it("CLAUDE_HOME points to ~/.claude", () => {
    expect(CLAUDE_HOME).toBe(join(homedir(), ".claude"));
  });

  it("CUSTOM_PACKS_DIR is under CLAUDE_HOME", () => {
    expect(CUSTOM_PACKS_DIR).toContain(".claude");
    expect(CUSTOM_PACKS_DIR).toContain("oh-my-claude");
  });

  it("BUILTIN_PACKS_DIR exists on disk", () => {
    expect(existsSync(BUILTIN_PACKS_DIR)).toBe(true);
  });
});

describe("DEFAULT_I18N", () => {
  it("has required keys", () => {
    expect(DEFAULT_I18N.installJokes).toBeInstanceOf(Array);
    expect(DEFAULT_I18N.installJokes.length).toBeGreaterThan(0);
    expect(DEFAULT_I18N.installing).toBe("Installing");
    expect(DEFAULT_I18N.packInstalled).toBe("Pack installed.");
    expect(DEFAULT_I18N.howToUse).toBeDefined();
  });
});

describe("loadSettings / saveSettings", () => {
  it("loadSettings returns object (current settings or empty)", () => {
    const settings = loadSettings();
    expect(typeof settings).toBe("object");
    expect(settings).not.toBeNull();
  });
});

describe("resolvePackPath", () => {
  it("resolves built-in pack path", () => {
    const path = resolvePackPath("oh-my-claude");
    expect(path).not.toBeNull();
    expect(path).toContain("oh-my-claude");
    expect(path).toContain("pack.json");
  });

  it("returns null for non-existent pack", () => {
    expect(resolvePackPath("nonexistent-pack-xyz")).toBeNull();
  });

  it("resolves community pack path", () => {
    const path = resolvePackPath("viet-dev");
    if (path) {
      expect(path).toContain("local-dev-jokes");
      expect(path).toContain("pack.json");
    }
  });
});

describe("loadPack", () => {
  it("loads built-in pack with required fields", () => {
    const pack = loadPack("oh-my-claude");
    expect(pack).not.toBeNull();
    expect(pack.id).toBe("oh-my-claude");
    expect(pack.name).toBeDefined();
    expect(pack.version).toBeDefined();
    expect(pack.layers).toBeDefined();
    // loadPack does not set _source (that's listPacks' job)
  });

  it("returns null for non-existent pack", () => {
    expect(loadPack("nonexistent-pack-xyz")).toBeNull();
  });

  it("loads pack with expected layers", () => {
    const pack = loadPack("oh-my-claude");
    expect(pack.layers.theme).toBeDefined();
    expect(pack.layers.spinners).toBeDefined();
    expect(pack.layers.tips).toBeDefined();
    expect(pack.layers.tips.tips).toBeInstanceOf(Array);
    expect(pack.layers.tips.tips.length).toBeGreaterThan(5);
  });
});

describe("listPacksFromDir", () => {
  it("lists built-in packs", () => {
    const packs = listPacksFromDir(BUILTIN_PACKS_DIR);
    expect(packs.length).toBeGreaterThan(0);
    expect(packs[0].id).toBeDefined();
  });

  it("returns empty array for non-existent directory", () => {
    expect(listPacksFromDir("/tmp/nonexistent-dir-xyz")).toEqual([]);
  });
});

describe("listPacks", () => {
  it("lists all available packs with source markers", () => {
    const packs = listPacks();
    expect(packs.length).toBeGreaterThan(0);
    // _source is set by listPacks
    const sources = new Set(packs.map((p) => p._source).filter(Boolean));
    expect(sources.size).toBeGreaterThan(0);
  });

  it("deduplicates packs by id", () => {
    const packs = listPacks();
    const ids = packs.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
});

describe("loadGlobalConfig", () => {
  const configDir = join(CLAUDE_HOME, "oh-my-claude");
  const configPath = join(configDir, "config.json");
  let hadConfig = false;
  let originalContent = null;

  beforeEach(() => {
    if (existsSync(configPath)) {
      hadConfig = true;
      originalContent = readFileSync(configPath, "utf-8");
    }
  });

  afterEach(() => {
    if (hadConfig) {
      writeFileSync(configPath, originalContent);
    } else if (existsSync(configPath)) {
      rmSync(configPath);
    }
  });

  it("returns empty object when no config exists", () => {
    // Temporarily remove config if it exists
    if (existsSync(configPath)) {
      rmSync(configPath);
    }
    const config = loadGlobalConfig();
    expect(config).toEqual({});
  });

  it("reads jokeServer config when present", () => {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      jokeServer: { url: "https://test.example.com", timeout: 5 },
    }));
    const config = loadGlobalConfig();
    expect(config.jokeServer.url).toBe("https://test.example.com");
    expect(config.jokeServer.timeout).toBe(5);
  });

  it("handles malformed JSON gracefully", () => {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, "not valid json{{{");
    const config = loadGlobalConfig();
    expect(config).toEqual({});
  });
});
