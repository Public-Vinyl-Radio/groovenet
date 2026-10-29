// Read-only terminal diagnostics. Intentionally print no config or credentials.
import { detectArtwork } from "../build/tui/artwork.js";
import { runTmux } from "../build/commands/playerTuiFullView.js";

console.log("stdout is a terminal:", !!process.stdout.isTTY);
console.log("forced Kitty detection:", await detectArtwork({
  env: { ...process.env, GROOVENET_TUI_ART: "kitty" },
}));
for (const name of ["TERM", "TERM_PROGRAM", "COLORTERM", "NO_COLOR", "TMUX_PANE", "STY", "ZELLIJ"]) {
  console.log(`${name}:`, JSON.stringify(process.env[name]) ?? "unset");
}
if (process.env.TMUX) {
  const pane = process.env.TMUX_PANE ? ["-t", process.env.TMUX_PANE] : [];
  try {
    console.log("tmux passthrough:", (await runTmux(["show-options", "-p", "-A", "-v", ...pane, "allow-passthrough"])).trim());
    console.log("tmux client:", (await runTmux(["display-message", "-p", ...pane, "#{client_termname} / #{client_termfeatures}"])).trim());
  } catch (error) {
    console.log("tmux check:", error.message);
  }
}
