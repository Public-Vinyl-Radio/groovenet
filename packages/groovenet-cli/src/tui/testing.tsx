/**
 * Test-only (excluded from the build): a deterministic terminal for
 * ink-testing-library. Its fake stdout is always 100 columns with no rows, so
 * this redefines both on the fake's prototype; Ink and `useTerminalSize` then
 * see the forced size, and `resize` emits the event a real terminal would.
 */
import React from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import chalk from "chalk";

const size = { columns: 120, rows: 40 };
let patched = false;

/** Force every ink-testing-library render to `columns` × `rows`, and plain (level 0) or 16-colour output. */
export function forceTerminal(columns: number, rows: number, { colorLevel = 0 }: { colorLevel?: 0 | 1 } = {}): void {
  size.columns = columns;
  size.rows = rows;
  chalk.level = colorLevel;
  if (patched) return;
  const probe = render(<Text />);
  const prototype = Object.getPrototypeOf(probe.stdout) as object;
  probe.unmount();
  Object.defineProperty(prototype, "columns", { configurable: true, get: () => size.columns });
  Object.defineProperty(prototype, "rows", { configurable: true, get: () => size.rows });
  patched = true;
}

/** Resize the forced terminal and tell a rendered app, as a real terminal's SIGWINCH would. */
export function resizeTerminal(stdout: NodeJS.EventEmitter, columns: number, rows: number): void {
  size.columns = columns;
  size.rows = rows;
  stdout.emit("resize");
}
