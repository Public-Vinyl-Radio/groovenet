import { describe, expect, it } from "vitest";
import { resolveNowPlayingTarget } from "./nowPlayingTarget.js";

describe("resolveNowPlayingTarget", () => {
  it.each([[undefined], ["local"]])("resolves %s config with no flags to local", (stored) => {
    expect(resolveNowPlayingTarget([], { now_playing_target: stored })).toEqual({ mode: "local" });
  });

  it("resolves a stored player ID to remote", () => {
    expect(resolveNowPlayingTarget([], { now_playing_target: "lounge" })).toEqual({
      mode: "remote",
      playerId: "lounge",
    });
  });

  it.each(["../bad", "", "Lounge", 7])("rejects stored value %j", (stored) => {
    expect(() =>
      resolveNowPlayingTarget([], { now_playing_target: stored as unknown as string }),
    ).toThrow(/Invalid now_playing_target/);
  });

  it("lets --remote override a stored target", () => {
    expect(
      resolveNowPlayingTarget(["--remote", "kitchen"], { now_playing_target: "lounge" }),
    ).toEqual({
      mode: "remote",
      playerId: "kitchen",
    });
  });

  it("lets --socket override a stored remote target", () => {
    expect(resolveNowPlayingTarget(["--socket", "/s"], { now_playing_target: "lounge" })).toEqual({
      mode: "local",
      socket: "/s",
    });
  });

  it("ignores an invalid stored value when a flag is given", () => {
    expect(resolveNowPlayingTarget(["--remote", "a"], { now_playing_target: "../bad" })).toEqual({
      mode: "remote",
      playerId: "a",
    });
  });

  it.each([
    [["--remote", "a", "--socket", "/s"]],
    [["--remote"]],
    [["--socket", ""]],
    [["--bogus"]],
    [["extra"]],
  ])("rejects %j", (flags) => {
    expect(() => resolveNowPlayingTarget(flags, {})).toThrow(/Usage:/);
  });
});
