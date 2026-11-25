import { describe, expect, it } from "vitest";
import { serializeForInlineScript } from "./serializeForInlineScript";

describe("serializeForInlineScript", () => {
  it("never emits a sequence that can end or open a script element", () => {
    const out = serializeForInlineScript({ a: "</script><script>alert(1)</script><!--" });
    expect(out).not.toMatch(/[<>/]/);
    expect(out).toContain("\\u003c");
  });

  it("escapes the JS line separators", () => {
    const out = serializeForInlineScript("a\u2028b\u2029c");
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
    expect(out).toBe('"a\\u2028b\\u2029c"');
  });

  it("round-trips through JSON.parse and eval", () => {
    const value = {
      s: "</script> \u2028 \u2029 / > < \" \\ ' \n",
      re: String.raw`^(?::root\[data-palette="custom"\]\{(?:--gn-[a-z0-9-]+:#[0-9a-fA-F]{6};)+\})+$`,
      list: ["a/b", 1, true, null],
      nested: { "</k>": [] },
    };
    const out = serializeForInlineScript(value);
    expect(JSON.parse(out)).toEqual(value);
    expect(new Function(`return (${out});`)()).toEqual(value);
  });

  it("leaves plain JSON untouched", () => {
    expect(serializeForInlineScript({ a: [1, "x"] })).toBe('{"a":[1,"x"]}');
  });
});
