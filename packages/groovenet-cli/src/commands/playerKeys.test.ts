import { describe, expect, it } from "vitest";
import { buildKeymap, defaultKeymap } from "./playerKeymap.js";
import { formatKeymap, keymapJson } from "./playerKeys.js";

describe("player keys output", () => {
  it("prints every action with keys, views and description", () => {
    const lines = formatKeymap(defaultKeymap);
    expect(lines[0]).toMatch(/^ ACTION\s+KEYS\s+VIEWS\s+DESCRIPTION$/);
    expect(lines.find((line) => line.includes("transport.next"))).toMatch(
      /^ transport\.next\s+n\s+all lists\s+Skip to the next track$/,
    );
    expect(lines.find((line) => line.includes("devices.transfer "))).toContain("devices (remote)");
    expect(lines.find((line) => line.includes("transport.seek-forward"))).toContain(
      "right >; search/playlists: >",
    );
    expect(lines.find((line) => line.includes("input.submit"))).toContain("enter");
    expect(lines.join("\n")).not.toContain("problem");
    expect(lines.join("\n")).not.toMatch(/^\*\w/m);
  });

  it("marks overrides and lists problems", () => {
    const keymap = buildKeymap({
      "transport.next": ["ctrl+n"],
      "transport.prev": ["bogus"],
      "app.debug": [],
    });
    const lines = formatKeymap(keymap);
    expect(lines.find((line) => line.includes("transport.next"))).toMatch(
      /^\*transport\.next\s+ctrl\+n/,
    );
    expect(lines.find((line) => line.includes("app.debug"))).toContain("(unbound)");
    expect(lines.find((line) => line.includes("transport.prev"))).toMatch(/^ transport\.prev\s+p/);
    expect(lines.join("\n")).toContain("1 problem in player_keymap");
    expect(lines.join("\n")).toContain('"bogus" is not a key');
    expect(formatKeymap(buildKeymap({ a: 1, b: 2 })).join("\n")).toContain(
      "2 problems in player_keymap",
    );
  });

  it("emits JSON with display forms, overrides and problems", () => {
    const json = keymapJson(buildKeymap({ "search.mode": ["ctrl+t"], nope: ["x"] }));
    expect(json.actions).toHaveLength(defaultKeymap.actions.length);
    expect(json.actions.find((action) => action.id === "search.mode")).toMatchObject({
      overridden: true,
      keys: ["ctrl+t"],
      display: ["^T"],
      defaults: ["shift+tab"],
      remote_only: false,
    });
    expect(json.actions.find((action) => action.id === "transport.toggle")).toMatchObject({
      overridden: false,
      keys: ["space"],
      display: ["Space"],
    });
    expect(json.actions.find((action) => action.id === "queue.move-up")).toMatchObject({
      remote_only: false,
      views: ["queue"],
    });
    expect(json.actions.find((action) => action.id === "transport.seek-forward")!.by_view).toEqual([
      { views: ["queue", "devices"], keys: ["right", ">"] },
      { views: ["search", "playlists"], keys: [">"] },
    ]);
    expect(json.problems).toEqual([
      expect.objectContaining({ kind: "unknown-action", actions: ["nope"] }),
    ]);
  });

  it("shows an unbound action with no keys", () => {
    const json = keymapJson(buildKeymap({ "app.debug": [] }));
    expect(json.actions.find((action) => action.id === "app.debug")).toMatchObject({
      keys: [],
      display: [],
    });
  });
});
