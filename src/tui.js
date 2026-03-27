// ── ANSI utilities ───────────────────────────────────────────────
export const ANSI = {
  clearScreen: "\x1b[2J",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  cursorTo: (row, col) => `\x1b[${row};${col}H`,
  eraseDown: "\x1b[J",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  inverse: "\x1b[7m",
  rgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
};

export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function parseRgb(str) {
  if (!str) return null;
  const m = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

export function toAnsiTop(str) {
  const c = parseRgb(str);
  return c ? ANSI.rgb(c[0], c[1], c[2]) : "";
}


// ── rawSelect — generic arrow-key selector ───────────────────────
export function rawSelect({ items, render }) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(0);
      return;
    }
    let index = 0;
    const { stdin } = process;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    process.stdout.write(ANSI.hideCursor);
    render(index);

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onKey);
      process.stdout.write(ANSI.showCursor);
    };

    const onKey = (key) => {
      // Ctrl+C
      if (key === "\x03") {
        cleanup();
        process.stdout.write(ANSI.clearScreen + ANSI.cursorTo(1, 1) + ANSI.showCursor);
        process.exit(0);
      }
      // Enter
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(index);
        return;
      }
      // Arrow up / k
      if (key === "\x1b[A" || key === "k") {
        index = index <= 0 ? items.length - 1 : index - 1;
        render(index);
      }
      // Arrow down / j
      if (key === "\x1b[B" || key === "j") {
        index = index >= items.length - 1 ? 0 : index + 1;
        render(index);
      }
    };
    stdin.on("data", onKey);
  });
}
