import { describe, expect, it } from "vitest";
import { buildKeymap, defaultKeymap, displayKeys, hintItems, hintLine, resolveAction } from "./playerKeymap.js";
import { ACTIONS, KEYMAP_VIEWS, type ActionDef } from "./playerKeymapRegistry.js";
import { parseKey } from "./playerKeyspec.js";

const bindings = (keymap: ReturnType<typeof buildKeymap>, id: string) => keymap.actions.find((action) => action.def.id === id)!.bindings;

describe("keymap registry", () => {
  it("has unique ids, descriptions, views and parseable, conflict-free defaults", () => {
    expect(new Set(ACTIONS.map((action) => action.id)).size).toBe(ACTIONS.length);
    for (const action of ACTIONS) {
      expect(action.description).not.toBe("");
      expect(action.views.length).toBeGreaterThan(0);
      for (const view of action.views) expect(KEYMAP_VIEWS).toContain(view);
    }
    expect(defaultKeymap.problems).toEqual([]);
    for (const action of ACTIONS) for (const text of [...action.keys, ...Object.values((action as ActionDef).viewKeys ?? {}).flat()]) expect(parseKey(text).ok, `${action.id}: ${text}`).toBe(true);
    // Throws if any default is unparseable; any default conflict would be an override-free "problem" and is not reported, so check directly.
    for (const view of KEYMAP_VIEWS) {
      const seen = new Map<string, string>();
      for (const action of defaultKeymap.actions) {
        for (const spec of action.specs[view] ?? []) {
          const key = `${spec.ctrl}${spec.shift}${spec.name}`;
          expect(seen.get(key), `${key} in ${view}`).toBeUndefined();
          seen.set(key, action.def.id);
        }
      }
    }
  });

  it("registers the makeover actions", () => {
    const ids = ACTIONS.map((action) => action.id);
    for (const id of ["play-on.open", "queue.move-up", "queue.move-down", "search.scope", "search.mode", "nav.open", "app.debug", "view.search", "transport.toggle", "transport.next"]) expect(ids).toContain(id);
    expect(displayKeys(defaultKeymap, "play-on.open", "queue")).toBe("o");
    expect(displayKeys(defaultKeymap, "search.mode", "search")).toBe("S-Tab");
    expect(displayKeys(defaultKeymap, "search.scope", "input")).toBe("Tab");
    expect(displayKeys(defaultKeymap, "app.debug", "queue")).toBe("~");
  });

  it("resolves → per view: open in lists of albums and playlists, seek elsewhere", () => {
    const right = { rightArrow: true };
    const at = (view: "queue" | "search" | "playlists" | "devices") => resolveAction(defaultKeymap, { view, remote: false }, "", right);
    expect(at("queue")).toBe("transport.seek-forward");
    expect(at("devices")).toBe("transport.seek-forward");
    expect(at("search")).toBe("nav.open");
    expect(at("playlists")).toBe("nav.open");
    expect(resolveAction(defaultKeymap, { view: "search", remote: false }, ">", {})).toBe("transport.seek-forward");
    expect(resolveAction(defaultKeymap, { view: "playlists", remote: false }, "<", {})).toBe("transport.seek-back");
    expect(resolveAction(defaultKeymap, { view: "queue", remote: false }, "", { leftArrow: true })).toBe("transport.seek-back");
  });
});

describe("resolveAction", () => {
  const at = (view: "queue" | "devices" | "input", input: string, key = {}, remote = false) => resolveAction(defaultKeymap, { view, remote }, input, key);

  it("resolves today's defaults", () => {
    expect(at("queue", " ")).toBe("transport.toggle");
    expect(at("queue", "n")).toBe("transport.next");
    expect(at("queue", "q")).toBe("app.quit");
    expect(at("queue", "?")).toBe("app.help");
    expect(at("queue", "=")).toBe("transport.volume-up");
    expect(at("queue", "", { upArrow: true })).toBe("list.up");
    expect(at("queue", "j")).toBe("list.down");
    expect(at("queue", "", { backspace: true })).toBe("queue.remove");
    expect(at("queue", "z")).toBeNull();
  });

  it("treats U and u as different keys", () => {
    expect(at("devices", "U", { shift: true }, true)).toBe("devices.play-allow-unknown");
    expect(at("devices", "u", {}, true)).toBe("view.queue");
  });

  it("only offers remote-only actions when remote", () => {
    expect(at("devices", "t", {}, true)).toBe("devices.transfer");
    expect(at("devices", "t", {}, false)).toBeNull();
    expect(at("queue", "s", {}, true)).toBe("transport.stop");
    expect(at("queue", "s", {}, false)).toBeNull();
    expect(at("queue", "[", {}, true)).toBe("queue.move-up");
    expect(at("devices", "[", {}, true)).toBeNull();
  });

  it("applies only input actions while typing", () => {
    expect(at("input", "q")).toBeNull();
    expect(at("input", "", { return: true })).toBe("input.submit");
    expect(at("input", "", { escape: true })).toBe("input.cancel");
    expect(at("input", "", { backspace: true })).toBe("input.backspace");
    expect(at("input", "", { tab: true })).toBe("search.scope");
    expect(at("input", "", { tab: true, shift: true })).toBe("search.mode");
  });
});

describe("overrides", () => {
  it("rebinds an action everywhere it applies", () => {
    const keymap = buildKeymap({ "transport.next": ["N", "ctrl+right"] });
    expect(keymap.problems).toEqual([]);
    expect(resolveAction(keymap, { view: "queue", remote: false }, "n", {})).toBeNull();
    expect(resolveAction(keymap, { view: "queue", remote: false }, "N", { shift: true })).toBe("transport.next");
    expect(resolveAction(keymap, { view: "search", remote: false }, "", { rightArrow: true, ctrl: true })).toBe("transport.next");
    expect(keymap.actions.find((action) => action.def.id === "transport.next")!.overridden).toBe(true);
    expect(keymap.actions.find((action) => action.def.id === "transport.prev")!.overridden).toBe(false);
  });

  it("accepts a single string, de-duplicates, and lets an empty list unbind", () => {
    const keymap = buildKeymap({ "transport.next": "m", "app.quit": ["x", "x"], "app.debug": [], "queue.remove": [] });
    expect(keymap.problems).toEqual([]);
    expect(bindings(keymap, "transport.next")[0]!.keys).toEqual(["m"]);
    expect(bindings(keymap, "app.quit")[0]!.keys).toEqual(["x"]);
    expect(displayKeys(keymap, "app.debug", "queue")).toBe("");
    // `x` is free once queue.remove is unbound, so quit can use it.
    expect(resolveAction(keymap, { view: "queue", remote: false }, "x", {})).toBe("app.quit");
  });

  it("allows swapping two keys", () => {
    const keymap = buildKeymap({ "transport.next": ["p"], "transport.prev": ["n"] });
    expect(keymap.problems).toEqual([]);
    expect(resolveAction(keymap, { view: "queue", remote: false }, "p", {})).toBe("transport.next");
  });

  it("reports unknown actions and keeps everything else", () => {
    const keymap = buildKeymap({ "transport.nxt": ["n"], "transport.prev": ["b"] });
    expect(keymap.problems).toEqual([{ kind: "unknown-action", actions: ["transport.nxt"], message: expect.stringContaining('Unknown action "transport.nxt"') }]);
    expect(bindings(keymap, "transport.prev")[0]!.keys).toEqual(["b"]);
  });

  it("falls back to defaults for an action with an unparseable key, and names each bad key", () => {
    const keymap = buildKeymap({ "transport.next": ["m", "bogus", "alt+x"], "transport.prev": ["b"] });
    expect(keymap.problems.map((problem) => problem.kind)).toEqual(["bad-key", "bad-key"]);
    expect(keymap.problems[0]!.message).toContain("transport.next");
    expect(keymap.problems[0]!.message).toContain("bogus");
    expect(keymap.problems[0]!.message).toContain("using the default keys");
    expect(bindings(keymap, "transport.next")[0]!.keys).toEqual(["n"]);
    expect(bindings(keymap, "transport.prev")[0]!.keys).toEqual(["b"]);
  });

  it("rejects values that are not keys", () => {
    const keymap = buildKeymap({ "transport.next": 5, "transport.prev": ["b", 7], "app.quit": { a: 1 }, "list.up": null });
    expect(keymap.problems.map((problem) => problem.kind)).toEqual(["bad-value", "bad-value", "bad-value", "bad-value"]);
    expect(keymap.problems[0]!.message).toContain("5");
    expect(bindings(keymap, "transport.next")[0]!.keys).toEqual(["n"]);
  });

  it("ignores a keymap that is not an object", () => {
    for (const raw of ["n", ["n"], 3]) {
      const keymap = buildKeymap(raw);
      expect(keymap.problems).toHaveLength(1);
      expect(keymap.problems[0]!.kind).toBe("bad-config");
      expect(keymap.actions.every((action) => !action.overridden)).toBe(true);
    }
    expect(buildKeymap(null).problems).toEqual([]);
    expect(buildKeymap(undefined).problems).toEqual([]);
  });

  it("reverts an override that collides with a default in the same view", () => {
    const keymap = buildKeymap({ "transport.next": ["p"] });
    expect(keymap.problems).toHaveLength(1);
    expect(keymap.problems[0]).toMatchObject({ kind: "conflict", actions: ["transport.next"] });
    expect(keymap.problems[0]!.message).toContain('"p" is bound to transport.next and transport.prev');
    expect(keymap.problems[0]!.message).toContain("queue, search, playlists, devices");
    expect(bindings(keymap, "transport.next")[0]!.keys).toEqual(["n"]);
    expect(resolveAction(keymap, { view: "queue", remote: false }, "p", {})).toBe("transport.prev");
  });

  it("reverts both sides of a conflict between two overrides", () => {
    const keymap = buildKeymap({ "transport.next": ["m"], "transport.prev": ["m"] });
    expect(keymap.problems).toHaveLength(1);
    expect(keymap.problems[0]!.actions).toEqual(["transport.next", "transport.prev"]);
    expect(bindings(keymap, "transport.next")[0]!.keys).toEqual(["n"]);
    expect(bindings(keymap, "transport.prev")[0]!.keys).toEqual(["p"]);
  });

  it("does not call keys conflicts when the actions never share a view", () => {
    // queue.remove is queue-only and queue.add is search/playlists-only.
    const keymap = buildKeymap({ "queue.remove": ["a"] });
    expect(keymap.problems).toEqual([]);
    expect(resolveAction(keymap, { view: "queue", remote: false }, "a", {})).toBe("queue.remove");
    expect(resolveAction(keymap, { view: "search", remote: false }, "a", {})).toBe("queue.add");
  });

  it("conflicts with remote-only actions even when run locally, so one config works in both modes", () => {
    const keymap = buildKeymap({ "app.quit": ["s"] });
    expect(keymap.problems[0]).toMatchObject({ kind: "conflict", actions: ["app.quit"] });
  });

  it("repeats until reverting one override does not expose another conflict", () => {
    // next->p collides with prev's default; reverting next to n then collides with prev->n.
    const keymap = buildKeymap({ "transport.next": ["p"], "transport.prev": ["n"], "app.help": ["p"] });
    expect(keymap.problems.length).toBeGreaterThan(0);
    for (const view of KEYMAP_VIEWS) {
      const seen = new Set<string>();
      for (const action of keymap.actions) for (const spec of action.specs[view] ?? []) {
        const key = `${spec.ctrl}${spec.shift}${spec.name}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("describes a key that differs by view as separate bindings", () => {
    const [main, ...rest] = bindings(defaultKeymap, "transport.seek-forward");
    expect(main!.keys).toEqual(["right", ">"]);
    expect(main!.views).toEqual(["queue", "devices"]);
    expect(rest).toEqual([{ views: ["search", "playlists"], keys: [">"] }]);
  });
});

describe("hints", () => {
  const items = (keymap = defaultKeymap, view: "queue" | "input" | "devices" = "queue", remote = false) => hintItems(keymap, view, { remote });

  it("builds the hint line from the keymap, merging paired actions", () => {
    expect(hintLine(items())).toBe("↑/↓ select · Enter add/play · r play · x remove · Space pause · n/p skip · ←/→ seek · +/- volume · / search · l playlists · u queue · d devices · o play on · ? help · q quit");
  });

  it("only hints what applies in the view", () => {
    expect(hintLine(items(defaultKeymap, "input"))).toBe("Enter search · Esc cancel");
    expect(hintLine(items(defaultKeymap, "devices"))).not.toContain("remove");
  });

  it("shows a rebound key's new binding and drops unbound actions", () => {
    const keymap = buildKeymap({ "transport.next": ["ctrl+n"], "transport.toggle": ["enter"], "list.select": ["ctrl+j"], "app.quit": [] });
    const line = hintLine(items(keymap));
    expect(line).toContain("^N/p skip");
    expect(line).toContain("Enter pause");
    expect(line).toContain("^J add/play");
    expect(line).not.toContain("quit");
    expect(displayKeys(keymap, "app.quit", "queue")).toBe("");
    expect(displayKeys(keymap, "app.quit", "input")).toBe("");
  });

  it("lists server-player keys separately and only in remote mode", () => {
    expect(hintItems(defaultKeymap, null, { remote: false, remoteOnly: true })).toEqual([]);
    expect(hintLine(hintItems(defaultKeymap, null, { remote: true, remoteOnly: true }))).toBe(
      "U play desired output allowing unknown · T play desired output taking over occupied · t transfer+play · Y transfer allowing unknown · ! transfer taking over occupied · s stop · [/] reorder queue",
    );
    expect(hintLine(items(defaultKeymap, "queue", true))).not.toContain("stop");
  });

  it("skips an action with no keys in the chosen view of a remote-only list", () => {
    const keymap = buildKeymap({ "transport.stop": [] });
    expect(hintLine(hintItems(keymap, null, { remote: true, remoteOnly: true }))).not.toContain("stop");
  });
});
