// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceScript, customCssPattern } from "./appearanceScript";
import { appearanceOverrideKey, serializeOverride } from "./appearanceOverride";
import { customFromPreset, customPaletteCss } from "./palettes/custom";

const run = () => new Function(appearanceScript)();
const html = () => document.documentElement;
const store = (value: unknown) =>
  localStorage.setItem(appearanceOverrideKey, JSON.stringify(value));

beforeEach(() => {
  localStorage.clear();
  document.getElementById("gn-custom-palette")?.remove();
  for (const key of ["palette", "corners", "fontDisplay", "fontBody", "fontLabel"]) {
    delete html().dataset[key];
  }
  html().dataset.palette = "sleeve";
  html().dataset.corners = "square";
  html().dataset.fontBody = "default";
});

describe("the pre-paint script", () => {
  it("does nothing without a stored override", () => {
    run();
    expect(html().dataset.palette).toBe("sleeve");
  });

  it("applies a valid override to <html>", () => {
    store({
      v: 1,
      palette: "riso",
      corners: "rounded",
      fonts: { display: "zilla-slab", body: "inter", label: "system" },
    });
    run();
    expect(html().dataset).toMatchObject({
      palette: "riso",
      corners: "rounded",
      fontDisplay: "zilla-slab",
      fontBody: "inter",
      fontLabel: "system",
    });
  });

  it("applies the same values the app's own serializer writes", () => {
    localStorage.setItem(appearanceOverrideKey, serializeOverride({ palette: "mono" }));
    run();
    expect(html().dataset.palette).toBe("mono");
  });

  it("ignores unknown ids and another role's font, field by field", () => {
    store({ v: 1, palette: "gone", corners: "pill", fonts: { display: "inter", body: "dm-mono" } });
    run();
    expect(html().dataset.palette).toBe("sleeve");
    expect(html().dataset.corners).toBe("square");
    expect(html().dataset.fontDisplay).toBeUndefined();
    expect(html().dataset.fontBody).toBe("dm-mono");
  });

  it.each(["{", "null", '"x"', '{"v":9,"palette":"riso"}'])("ignores corrupt storage %s", (raw) => {
    localStorage.setItem(appearanceOverrideKey, raw);
    run();
    expect(html().dataset.palette).toBe("sleeve");
  });

  it("ignores a non-object font table", () => {
    store({ v: 1, fonts: "inter" });
    expect(() => run()).not.toThrow();
    expect(html().dataset.fontBody).toBe("default");
  });

  it("paints the custom palette's style and selects it", () => {
    const css = customPaletteCss(customFromPreset("midnight"));
    store({ v: 1, palette: "custom", customCss: css });
    run();
    expect(html().dataset.palette).toBe("custom");
    expect(document.getElementById("gn-custom-palette")?.textContent).toBe(css);
  });

  it("replaces the server-rendered custom style in place, without a duplicate", () => {
    const server = document.createElement("style");
    server.id = "gn-custom-palette";
    server.textContent = "old";
    document.head.appendChild(server);
    const css = customPaletteCss(customFromPreset("riso"));
    store({ v: 1, customCss: css });
    run();
    expect(document.querySelectorAll("#gn-custom-palette")).toHaveLength(1);
    expect(server.textContent).toBe(css);
  });

  it("won't select `custom` when there is no style to render it", () => {
    store({ v: 1, palette: "custom" });
    run();
    expect(html().dataset.palette).toBe("sleeve");
  });

  it("selects `custom` when the server already rendered its style", () => {
    const server = document.createElement("style");
    server.id = "gn-custom-palette";
    document.head.appendChild(server);
    store({ v: 1, palette: "custom" });
    run();
    expect(html().dataset.palette).toBe("custom");
  });

  it.each([
    "body{display:none}",
    ':root[data-palette="custom"]{--gn-ground:red;}',
    ':root[data-palette="custom"]{--gn-ground:#fff;}</style><script>x</script>',
    ':root[data-palette="custom"]{background:url(//evil)}',
    ':root[data-palette="custom"]{--gn-ground:#112233;}body{x:y}',
    "",
  ])("never puts unvetted CSS in a <style>: %s", (css) => {
    store({ v: 1, customCss: css });
    run();
    expect(document.getElementById("gn-custom-palette")).toBeNull();
  });

  it("refuses an oversized stylesheet", () => {
    const block = ':root[data-palette="custom"]{--gn-ground:#112233;}';
    store({ v: 1, customCss: block.repeat(1000) });
    run();
    expect(document.getElementById("gn-custom-palette")).toBeNull();
  });

  it("accepts what customPaletteCss emits for every preset", () => {
    for (const base of ["sleeve", "riso", "midnight", "mono"] as const) {
      expect(new RegExp(customCssPattern).test(customPaletteCss(customFromPreset(base)))).toBe(
        true,
      );
    }
  });

  it("does not throw when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => run()).not.toThrow();
    expect(html().dataset.palette).toBe("sleeve");
    get.mockRestore();
  });

  it("passes the script's nonce to the style it creates", () => {
    const script = document.createElement("script");
    script.setAttribute("nonce", "n0nce");
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "currentScript");
    Object.defineProperty(document, "currentScript", { value: script, configurable: true });
    store({ v: 1, customCss: customPaletteCss(customFromPreset("sleeve")) });
    run();
    delete (document as unknown as Record<string, unknown>).currentScript;
    if (original) Object.defineProperty(Document.prototype, "currentScript", original);
    expect(document.getElementById("gn-custom-palette")?.getAttribute("nonce")).toBe("n0nce");
  });
});
