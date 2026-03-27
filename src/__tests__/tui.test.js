import { describe, it, expect } from "vitest";
import { ANSI, stripAnsi, parseRgb, toAnsiTop } from "../tui.js";

describe("ANSI constants", () => {
  it("has required escape sequences", () => {
    expect(ANSI.reset).toBe("\x1b[0m");
    expect(ANSI.bold).toBe("\x1b[1m");
    expect(ANSI.dim).toBe("\x1b[2m");
    expect(ANSI.inverse).toBe("\x1b[7m");
    expect(ANSI.clearScreen).toBe("\x1b[2J");
    expect(ANSI.hideCursor).toBe("\x1b[?25l");
    expect(ANSI.showCursor).toBe("\x1b[?25h");
  });

  it("generates rgb escape codes", () => {
    expect(ANSI.rgb(255, 0, 128)).toBe("\x1b[38;2;255;0;128m");
    expect(ANSI.rgb(0, 0, 0)).toBe("\x1b[38;2;0;0;0m");
  });

  it("generates cursorTo escape codes", () => {
    expect(ANSI.cursorTo(1, 1)).toBe("\x1b[1;1H");
    expect(ANSI.cursorTo(10, 20)).toBe("\x1b[10;20H");
  });
});

describe("stripAnsi", () => {
  it("removes ANSI escape codes from string", () => {
    expect(stripAnsi("\x1b[1mBold\x1b[0m")).toBe("Bold");
    expect(stripAnsi("\x1b[38;2;255;0;0mRed\x1b[0m")).toBe("Red");
  });

  it("returns plain string unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("strips multiple ANSI codes", () => {
    const s = `${ANSI.bold}hello ${ANSI.dim}world${ANSI.reset}`;
    expect(stripAnsi(s)).toBe("hello world");
  });
});

describe("parseRgb", () => {
  it("parses rgb string with spaces", () => {
    expect(parseRgb("255, 128, 0")).toEqual([255, 128, 0]);
  });

  it("parses rgb string without spaces", () => {
    expect(parseRgb("0,0,0")).toEqual([0, 0, 0]);
  });

  it("returns null for null/undefined input", () => {
    expect(parseRgb(null)).toBeNull();
    expect(parseRgb(undefined)).toBeNull();
  });

  it("returns null for invalid string", () => {
    expect(parseRgb("not-a-color")).toBeNull();
    expect(parseRgb("")).toBeNull();
  });
});

describe("toAnsiTop", () => {
  it("converts rgb string to ANSI escape code", () => {
    expect(toAnsiTop("0, 255, 128")).toBe("\x1b[38;2;0;255;128m");
  });

  it("returns empty string for null/invalid input", () => {
    expect(toAnsiTop(null)).toBe("");
    expect(toAnsiTop("invalid")).toBe("");
  });
});
