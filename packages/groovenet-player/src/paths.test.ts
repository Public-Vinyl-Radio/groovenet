import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultPlayerPaths } from "./paths.js";

describe("defaultPlayerPaths", () => {
  it("places the socket and pidfile under ~/.groovenet/player", () => {
    expect(defaultPlayerPaths("/home/dj")).toEqual({
      socketPath: join("/home/dj", ".groovenet", "player", "player.sock"),
      pidPath: join("/home/dj", ".groovenet", "player", "player.pid"),
    });
  });

  it("defaults to the current user's home directory", () => {
    expect(defaultPlayerPaths().socketPath).toBe(
      join(homedir(), ".groovenet", "player", "player.sock"),
    );
  });
});
