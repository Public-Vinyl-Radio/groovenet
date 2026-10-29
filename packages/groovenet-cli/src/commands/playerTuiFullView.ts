/**
 * `↵` in the bottom strip opens the full view. The strip is the layout for a
 * terminal too short for anything else, so there is no layout to force: a
 * 24-row frame drawn into 5 rows would scroll the screen. Instead, inside tmux
 * the pane is zoomed (`resize-pane -Z`); the resize that follows picks the
 * full layout as any resize would, and tmux's own zoom key returns to the
 * strip. Outside tmux it says how big the terminal needs to be.
 */
import { execFile } from "node:child_process";
import { FULL_MIN_COLUMNS, FULL_MIN_ROWS } from "../tui/layout.js";

export type TmuxRunner = (args: string[]) => Promise<string>;

export const runTmux: TmuxRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile("tmux", args, { timeout: 2000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout));
    });
  });

const TOO_SHORT = `The full view needs ${FULL_MIN_COLUMNS}×${FULL_MIN_ROWS}; enlarge the terminal.`;

/** Zooms the tmux pane, or explains what to do. Returns the message to show, or "" when the pane was zoomed. */
export async function openFullView({
  env = process.env,
  run = runTmux,
}: { env?: NodeJS.ProcessEnv; run?: TmuxRunner } = {}): Promise<string> {
  if (!env.TMUX) return TOO_SHORT;
  const pane = env.TMUX_PANE ? ["-t", env.TMUX_PANE] : [];
  const zoomed = async () =>
    (await run(["display-message", "-p", ...pane, "#{window_zoomed_flag}"])).trim() === "1";
  try {
    // Zooming toggles, so a pane that is already zoomed (and still too short) is left alone.
    if (await zoomed()) return `${TOO_SHORT} The tmux pane is already zoomed.`;
    await run(["resize-pane", "-Z", ...pane]);
    // A window's only pane has nothing to zoom into, and tmux does nothing.
    return (await zoomed()) ? "" : `${TOO_SHORT} The tmux window has no room to zoom into.`;
  } catch (error) {
    return `Could not zoom the tmux pane: ${error instanceof Error ? error.message : String(error)}`;
  }
}
