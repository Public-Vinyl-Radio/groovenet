import { describe, expect, it } from "vitest";
import { buildKeymap } from "./playerKeymap.js";
import { playerTuiAction } from "./playerTuiKeys.js";

const ctx = (view: "queue" | "search" | "playlists" | "devices" = "queue", extra: { editingSearch?: boolean; remote?: boolean } = {}) => ({ view, editingSearch: false, ...extra });

describe("player TUI key mapping", () => {
  it("maps transport, navigation, and view controls", () => {
    const id = (input: string, key = {}, c = ctx()) => playerTuiAction(input, key, c);
    expect(id(" ")).toEqual({ id: "transport.toggle" });
    expect(id("n")).toEqual({ id: "transport.next" });
    expect(id("p")).toEqual({ id: "transport.prev" });
    expect(id("r")).toEqual({ id: "transport.play" });
    expect(id("/")).toEqual({ id: "view.search" });
    expect(id("l")).toEqual({ id: "view.playlists" });
    expect(id("u")).toEqual({ id: "view.queue" });
    expect(id("d")).toEqual({ id: "view.devices" });
    expect(id("o")).toEqual({ id: "play-on.open" });
    expect(id("j")).toEqual({ id: "list.down" });
    expect(id("k")).toEqual({ id: "list.up" });
    expect(id("", { leftArrow: true })).toEqual({ id: "transport.seek-back" });
    expect(id("", { rightArrow: true })).toEqual({ id: "transport.seek-forward" });
    expect(id("", { rightArrow: true }, ctx("playlists"))).toEqual({ id: "nav.open" });
    expect(id("q")).toEqual({ id: "app.quit" });
    expect(id("", { upArrow: true })).toEqual({ id: "list.up" });
    expect(id("", { downArrow: true })).toEqual({ id: "list.down" });
    expect(id("", { return: true })).toEqual({ id: "list.select" });
    expect(id("", { backspace: true })).toEqual({ id: "queue.remove" });
    expect(id("=")).toEqual({ id: "transport.volume-up" });
    expect(id("-")).toEqual({ id: "transport.volume-down" });
    expect(id("?")).toEqual({ id: "app.help" });
    expect(id("~")).toEqual({ id: "app.debug" });
    expect(id("z")).toBeNull();
  });

  it("only removes queue entries in the queue view", () => {
    expect(playerTuiAction("x", {}, ctx("search"))).toBeNull();
    expect(playerTuiAction("", { backspace: true }, ctx("playlists"))).toBeNull();
    expect(playerTuiAction("a", {}, ctx("search"))).toEqual({ id: "queue.add" });
    expect(playerTuiAction("a", {}, ctx("queue"))).toBeNull();
  });

  it("offers the remote-only keys only when remote", () => {
    expect(playerTuiAction("s", {}, ctx())).toBeNull();
    expect(playerTuiAction("s", {}, ctx("queue", { remote: true }))).toEqual({ id: "transport.stop" });
    expect(playerTuiAction("[", {}, ctx("queue", { remote: true }))).toEqual({ id: "queue.move-up" });
    expect(playerTuiAction("]", {}, ctx("queue", { remote: true }))).toEqual({ id: "queue.move-down" });
    for (const [input, id] of [["U", "devices.play-allow-unknown"], ["T", "devices.play-takeover"], ["t", "devices.transfer"], ["Y", "devices.transfer-allow-unknown"], ["!", "devices.transfer-takeover"]] as const) {
      expect(playerTuiAction(input, { shift: input !== "t" && input !== "!" }, ctx("devices", { remote: true }))).toEqual({ id });
      expect(playerTuiAction(input, {}, ctx("devices"))).toBeNull();
    }
  });

  it("captures typing in the search box, and only the input keys act there", () => {
    const typing = ctx("search", { editingSearch: true });
    expect(playerTuiAction("b", {}, typing)).toEqual({ text: "b" });
    expect(playerTuiAction("q", {}, typing)).toEqual({ text: "q" });
    expect(playerTuiAction("U", { shift: true }, typing)).toEqual({ text: "U" });
    expect(playerTuiAction(" ", {}, typing)).toEqual({ text: " " });
    expect(playerTuiAction("s", {}, { ...typing, remote: true })).toEqual({ text: "s" });
    expect(playerTuiAction("", { backspace: true }, typing)).toEqual({ id: "input.backspace" });
    expect(playerTuiAction("", { return: true }, typing)).toEqual({ id: "input.submit" });
    expect(playerTuiAction("", { escape: true }, typing)).toEqual({ id: "input.cancel" });
    expect(playerTuiAction("", {}, typing)).toBeNull();
    expect(playerTuiAction("", { upArrow: true }, typing)).toEqual({ id: "list.up" });
    expect(playerTuiAction("x", { ctrl: true }, typing)).toBeNull();
    expect(playerTuiAction("x", { meta: true }, typing)).toBeNull();
    expect(playerTuiAction("\u001b[", {}, typing)).toBeNull();
    expect(playerTuiAction("\r", { return: true }, { ...typing, keymap: buildKeymap({ "input.submit": ["ctrl+g"] }) })).toBeNull();
  });

  it("keeps custom search scope/mode bindings as text in the playlist filter", () => {
    const keymap = buildKeymap({ "search.scope": "b", "search.mode": "m" });
    const context = { ...ctx("playlists", { editingSearch: true }), keymap };
    expect(playerTuiAction("b", {}, context)).toEqual({ text: "b" });
    expect(playerTuiAction("m", {}, context)).toEqual({ text: "m" });
    expect(playerTuiAction("b", {}, { ...context, view: "search" })).toEqual({ id: "search.scope" });
    expect(playerTuiAction("m", {}, { ...context, view: "search" })).toEqual({ id: "search.mode" });
    expect(playerTuiAction("", { tab: true }, ctx("playlists", { editingSearch: true }))).toBeNull();
    expect(playerTuiAction("", { leftArrow: true }, context)).toEqual({ id: "input.submit" });
    expect(playerTuiAction("", { rightArrow: true }, context)).toEqual({ id: "input.submit" });
  });

  it("uses the keymap it is given", () => {
    const keymap = buildKeymap({ "transport.next": ["ctrl+n"], "input.submit": ["ctrl+g"] });
    expect(playerTuiAction("n", {}, { ...ctx(), keymap })).toBeNull();
    expect(playerTuiAction("n", { ctrl: true }, { ...ctx(), keymap })).toEqual({ id: "transport.next" });
    const typing = { ...ctx("search", { editingSearch: true }), keymap };
    expect(playerTuiAction("g", { ctrl: true }, typing)).toEqual({ id: "input.submit" });
    expect(playerTuiAction("", { return: true }, typing)).toBeNull();
  });
});
