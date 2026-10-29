import { execFile } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { openFullView, runTmux } from "./playerTuiFullView.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

describe("openFullView", () => {
  it("explains the size outside tmux", async () => {
    const run = vi.fn();
    await expect(openFullView({ env: {}, run })).resolves.toBe(
      "The full view needs 80×24; enlarge the terminal.",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("zooms this tmux pane", async () => {
    const flags = ["0\n", "", "1\n"];
    const run = vi.fn(async () => flags.shift()!);
    await expect(openFullView({ env: { TMUX: "/tmp/tmux", TMUX_PANE: "%3" }, run })).resolves.toBe(
      "",
    );
    expect(run).toHaveBeenNthCalledWith(1, [
      "display-message",
      "-p",
      "-t",
      "%3",
      "#{window_zoomed_flag}",
    ]);
    expect(run).toHaveBeenNthCalledWith(2, ["resize-pane", "-Z", "-t", "%3"]);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("says so when the pane is the window's only one and did not zoom", async () => {
    const run = vi.fn(async () => "0");
    await expect(openFullView({ env: { TMUX: "/tmp/tmux" }, run })).resolves.toBe(
      "The full view needs 80×24; enlarge the terminal. The tmux window has no room to zoom into.",
    );
  });

  it("leaves an already zoomed pane alone, and targets the current pane without TMUX_PANE", async () => {
    const run = vi.fn(async () => "1");
    await expect(openFullView({ env: { TMUX: "/tmp/tmux" }, run })).resolves.toContain(
      "already zoomed",
    );
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(["display-message", "-p", "#{window_zoomed_flag}"]);
  });

  it("reports a tmux failure", async () => {
    await expect(
      openFullView({
        env: { TMUX: "x" },
        run: async () => {
          throw new Error("no server running");
        },
      }),
    ).resolves.toBe("Could not zoom the tmux pane: no server running");
    await expect(
      openFullView({
        env: { TMUX: "x" },
        run: async () => {
          throw "gone";
        },
      }),
    ).resolves.toBe("Could not zoom the tmux pane: gone");
  });

  it("runs tmux with a timeout, resolving its output or rejecting its failure", async () => {
    const exec = vi.mocked(execFile) as unknown as ReturnType<typeof vi.fn>;
    exec.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        done: (error: Error | null, stdout: string) => void,
      ) => done(null, "1\n"),
    );
    await expect(runTmux(["display-message"])).resolves.toBe("1\n");
    expect(exec).toHaveBeenCalledWith(
      "tmux",
      ["display-message"],
      { timeout: 2000 },
      expect.any(Function),
    );
    exec.mockImplementationOnce(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        done: (error: Error | null, stdout: string) => void,
      ) => done(new Error("exit 1"), ""),
    );
    await expect(runTmux(["x"])).rejects.toThrow("exit 1");
  });
});
