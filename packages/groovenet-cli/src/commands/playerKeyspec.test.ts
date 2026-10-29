import { describe, expect, it } from "vitest";
import { canonicalKey, formatKey, matchKey, parseKey, type KeySpec } from "./playerKeyspec.js";

function spec(text: string): KeySpec {
  const parsed = parseKey(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.spec;
}

describe("parseKey", () => {
  it("keeps plain characters case-sensitive", () => {
    expect(spec("u")).toEqual({ name: "u", ctrl: false, shift: false });
    expect(spec("U")).toEqual({ name: "U", ctrl: false, shift: false });
    expect(canonicalKey(spec("U"))).not.toBe(canonicalKey(spec("u")));
    for (const char of ["?", "/", "[", "]", "!", "~", "+", "-", "=", "<", ">"])
      expect(spec(char).name).toBe(char);
  });

  it("parses every named key and its aliases, in any case", () => {
    for (const name of [
      "enter",
      "esc",
      "tab",
      "space",
      "backspace",
      "delete",
      "up",
      "down",
      "left",
      "right",
      "pageup",
      "pagedown",
      "home",
      "end",
    ]) {
      expect(spec(name).name).toBe(name);
      expect(spec(name.toUpperCase()).name).toBe(name);
    }
    expect(spec("Return").name).toBe("enter");
    expect(spec("escape").name).toBe("esc");
    expect(spec("del").name).toBe("delete");
    expect(spec("PgUp").name).toBe("pageup");
    expect(spec("pgdn").name).toBe("pagedown");
    expect(spec(" ").name).toBe("space");
  });

  it("parses ctrl and shift modifiers", () => {
    expect(spec("ctrl+n")).toEqual({ name: "n", ctrl: true, shift: false });
    expect(spec("Ctrl+N")).toEqual({ name: "n", ctrl: true, shift: false });
    expect(spec("ctrl+right")).toEqual({ name: "right", ctrl: true, shift: false });
    expect(spec("shift+tab")).toEqual({ name: "tab", ctrl: false, shift: true });
    expect(spec("ctrl+shift+left")).toEqual({ name: "left", ctrl: true, shift: true });
    expect(spec("shift+u")).toEqual(spec("U"));
    expect(spec("ctrl+shift+x")).toEqual({ name: "x", ctrl: true, shift: true });
  });

  it("treats + as a key, and does not mistake it for a separator", () => {
    expect(spec("+").name).toBe("+");
    expect(parseKey("ctrl++")).toEqual({ ok: false, error: expect.stringContaining("letters") });
  });

  it("explains what it cannot parse", () => {
    const error = (text: string) => {
      const parsed = parseKey(text);
      return parsed.ok ? null : parsed.error;
    };
    expect(error("")).toContain("empty");
    expect(error("   ")).toContain("empty");
    expect(error("nope")).toContain("not a key");
    expect(error("alt+x")).toContain("only ctrl+ and shift+");
    expect(error("cmd+x")).toContain("cmd+");
    expect(error("ctrl+ctrl+x")).toContain("repeats ctrl+");
    expect(error("shift+shift+x")).toContain("repeats shift+");
    expect(error("ctrl+1")).toContain("letters");
    expect(error("ctrl+c")).toContain("reserved");
    expect(error("shift+1")).toContain("write the character itself");
    expect(error("shift+space")).toContain("space");
    expect(error("ctrl+")).toContain("not a key");
  });
});

describe("matchKey", () => {
  it("matches characters on input and ignores Ink's implicit shift on capitals", () => {
    expect(matchKey(spec("U"), "U", { shift: true })).toBe(true);
    expect(matchKey(spec("U"), "u", {})).toBe(false);
    expect(matchKey(spec("u"), "U", { shift: true })).toBe(false);
    expect(matchKey(spec("n"), "n", {})).toBe(true);
    expect(matchKey(spec("n"), "n", { ctrl: true })).toBe(false);
    expect(matchKey(spec("n"), "n", { meta: true })).toBe(false);
    expect(matchKey(spec("?"), "?", { shift: true })).toBe(true);
  });

  it("matches ctrl+letter", () => {
    expect(matchKey(spec("ctrl+n"), "n", { ctrl: true })).toBe(true);
    expect(matchKey(spec("ctrl+n"), "n", {})).toBe(false);
  });

  it("matches each named key by its Ink flag", () => {
    const flags: Array<[string, keyof import("./playerKeyspec.js").InkKeyEvent]> = [
      ["enter", "return"],
      ["esc", "escape"],
      ["tab", "tab"],
      ["backspace", "backspace"],
      ["delete", "delete"],
      ["up", "upArrow"],
      ["down", "downArrow"],
      ["left", "leftArrow"],
      ["right", "rightArrow"],
      ["pageup", "pageUp"],
      ["pagedown", "pageDown"],
      ["home", "home"],
      ["end", "end"],
    ];
    for (const [name, flag] of flags) {
      expect(matchKey(spec(name), "", { [flag]: true })).toBe(true);
      expect(matchKey(spec(name), "", {})).toBe(false);
    }
  });

  it("matches space on its input, with or without ctrl", () => {
    expect(matchKey(spec("space"), " ", {})).toBe(true);
    expect(matchKey(spec("space"), " ", { ctrl: true })).toBe(false);
    expect(matchKey(spec("ctrl+space"), " ", { ctrl: true })).toBe(true);
    expect(matchKey(spec("space"), "x", {})).toBe(false);
  });

  it("requires the exact modifiers on named keys", () => {
    expect(matchKey(spec("tab"), "", { tab: true })).toBe(true);
    expect(matchKey(spec("tab"), "", { tab: true, shift: true })).toBe(false);
    expect(matchKey(spec("shift+tab"), "", { tab: true, shift: true })).toBe(true);
    expect(matchKey(spec("shift+tab"), "", { tab: true })).toBe(false);
    expect(matchKey(spec("right"), "", { rightArrow: true, ctrl: true })).toBe(false);
    expect(matchKey(spec("ctrl+right"), "", { rightArrow: true, ctrl: true })).toBe(true);
  });
});

describe("formatKey", () => {
  it("formats for display", () => {
    expect(formatKey(spec("right"))).toBe("→");
    expect(formatKey(spec("left"))).toBe("←");
    expect(formatKey(spec("up"))).toBe("↑");
    expect(formatKey(spec("down"))).toBe("↓");
    expect(formatKey(spec("shift+tab"))).toBe("S-Tab");
    expect(formatKey(spec("ctrl+n"))).toBe("^N");
    expect(formatKey(spec("ctrl+right"))).toBe("^→");
    expect(formatKey(spec("space"))).toBe("Space");
    expect(formatKey(spec("enter"))).toBe("Enter");
    expect(formatKey(spec("esc"))).toBe("Esc");
    expect(formatKey(spec("pageup"))).toBe("PgUp");
    expect(formatKey(spec("pagedown"))).toBe("PgDn");
    expect(formatKey(spec("delete"))).toBe("Del");
    expect(formatKey(spec("backspace"))).toBe("Backspace");
    expect(formatKey(spec("U"))).toBe("U");
    expect(formatKey(spec("?"))).toBe("?");
  });

  it("round-trips through the canonical spelling", () => {
    for (const text of ["n", "U", "ctrl+n", "shift+tab", "ctrl+shift+left", "space", "+"]) {
      expect(spec(canonicalKey(spec(text)))).toEqual(spec(text));
    }
  });
});
