import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";

const CLI = resolve(import.meta.dirname, "..", "cli.js");
const run = (args = []) =>
  execFileSync("node", [CLI, ...args], { encoding: "utf-8", timeout: 10000 });

describe("CLI commands", () => {
  it("list — shows available packs", () => {
    const out = run(["list"]);
    expect(out).toContain("Available packs:");
    expect(out).toContain("oh-my-claude");
  });

  it("preview — shows pack preview", () => {
    const out = run(["preview", "oh-my-claude"]);
    expect(out).toContain("oh-my-claude");
    expect(out).toContain("Sample Jokes");
    expect(out).toContain("Spinner Verbs");
  });

  it("preview — fails for unknown pack", () => {
    try {
      run(["preview", "nonexistent-xyz"]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e.stderr || e.message).toContain("not found");
    }
  });

  it("current — shows active or no pack", () => {
    const out = run(["current"]);
    expect(out).toMatch(/Active pack:|No pack installed/);
  });

  it("help — shows usage info", () => {
    const out = run(["help"]);
    expect(out).toContain("oh-my-claude");
    expect(out).toContain("COMMANDS");
    expect(out).toContain("install");
    expect(out).toContain("preview");
    expect(out).toContain("reset");
  });

  it("--help alias works", () => {
    const out = run(["--help"]);
    expect(out).toContain("COMMANDS");
  });

  it("unknown command shows help", () => {
    const out = run(["unknown-command"]);
    expect(out).toContain("COMMANDS");
  });

  it("list — shows source badges", () => {
    const out = run(["list"]);
    // Should have at least the legend
    expect(out).toContain("★ = custom pack");
    expect(out).toContain("◆ = community pack");
  });

  it("preview — shows install command hint", () => {
    const out = run(["preview", "oh-my-claude"]);
    expect(out).toContain("npx oh-my-claude-cli install");
  });
});

describe("CLI exit codes", () => {
  it("preview without arg exits with code 1", () => {
    try {
      run(["preview"]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e.status).toBe(1);
    }
  });

  it("create without arg exits with code 1", () => {
    try {
      run(["create"]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e.status).toBe(1);
    }
  });
});
