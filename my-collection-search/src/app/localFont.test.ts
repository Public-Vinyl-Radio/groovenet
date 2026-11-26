// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLocalFontInstalled,
  localFontAccess,
  localFontFamilies,
  localFontFamilyPattern,
  localFontMaxLength,
  localFontStack,
  parseLocalFontFamily,
} from "./localFont";

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
});

describe("parseLocalFontFamily", () => {
  it.each(["Berkeley Mono", "SF-Mono_2", "Fira Code", "游ゴシック", "Äkta 2", "a", "7 Mono"])(
    "accepts %s",
    (name) => {
      expect(parseLocalFontFamily(name)).toBe(name);
    },
  );

  it("trims and collapses whitespace", () => {
    expect(parseLocalFontFamily("  Berkeley   Mono ")).toBe("Berkeley Mono");
  });

  it.each([
    'Evil"; } body { color:red',
    'a"b',
    "a'b",
    "a;b",
    "a}b",
    "a{b",
    "</style><script>alert(1)</script>",
    "<b>",
    "url(https://evil.example/x.woff2)",
    "a(b)",
    "a\\b",
    "a/b",
    "a:b",
    "a,b",
    "a.b",
    "-leading",
    "_leading",
    " ",
    "",
    "line\nbreak",
    "tab\there",
    "x".repeat(localFontMaxLength + 1),
    "a b",
  ])("rejects %j", (name) => {
    expect(parseLocalFontFamily(name)).toBeNull();
  });

  it("accepts exactly the maximum length", () => {
    expect(parseLocalFontFamily("x".repeat(localFontMaxLength))).not.toBeNull();
  });

  it.each([undefined, null, 12, {}, ["Inter"]])("rejects the non-string %j", (value) => {
    expect(parseLocalFontFamily(value)).toBeNull();
  });

  it("exposes the same shape as source text for the inline script", () => {
    const re = new RegExp(localFontFamilyPattern, "u");
    expect(re.test("Berkeley Mono")).toBe(true);
    expect(re.test('x"; y')).toBe(false);
  });
});

describe("localFontStack", () => {
  it("quotes the family and ends in the role's generic stack", () => {
    expect(localFontStack("body", "Berkeley Mono")).toBe(
      '"Berkeley Mono", "Helvetica Neue", Arial, sans-serif',
    );
    expect(localFontStack("display", "X")).toMatch(/^"X", .*sans-serif$/);
    expect(localFontStack("label", "Berkeley Mono")).toBe(
      '"Berkeley Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    );
  });

  it("drops an unsafe family altogether, leaving only the fallback", () => {
    const stack = localFontStack("body", 'x"; } body{');
    expect(stack).toBe('"Helvetica Neue", Arial, sans-serif');
    expect(stack).not.toMatch(/[;{}]/);
  });
});

describe("localFontFamilies", () => {
  it("keeps valid names, once each, in order", () => {
    expect(
      localFontFamilies([
        { family: "Menlo" },
        { family: "Avenir Next" },
        { family: "Menlo" },
        { family: "Bad;Name" },
        { family: " Spaced  Out " },
      ]),
    ).toEqual(["Avenir Next", "Menlo", "Spaced Out"]);
  });
});

describe("localFontAccess", () => {
  it("is null without the API", () => {
    expect(localFontAccess()).toBeNull();
  });

  it("wraps queryLocalFonts where it exists", async () => {
    const query = vi.fn(async () => [{ family: "Menlo" }]);
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts = query;
    const access = localFontAccess();
    expect(await access?.()).toEqual([{ family: "Menlo" }]);
    expect(query).toHaveBeenCalledOnce();
  });
});

describe("isLocalFontInstalled", () => {
  /** Text is wider than the bare generic only for the families listed. */
  const canvas = (installed: string[]) =>
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      const ctx = {
        font: "",
        measureText: () => ({
          width: installed.some((name) => ctx.font.includes(`"${name}"`)) ? 140 : 100,
        }),
      };
      return ctx as unknown as CanvasRenderingContext2D;
    });

  it("is true when the family measures differently from the generics", () => {
    canvas(["Berkeley Mono"]);
    expect(isLocalFontInstalled("Berkeley Mono")).toBe(true);
  });

  it("is false when every stack measures like its generic", () => {
    canvas([]);
    expect(isLocalFontInstalled("Not A Font")).toBe(false);
  });

  it("is false for an unsafe name without measuring", () => {
    const spy = canvas([]);
    expect(isLocalFontInstalled('a"; b')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("is null when there is no canvas context, or it throws", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValueOnce(null);
    expect(isLocalFontInstalled("Menlo")).toBeNull();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementationOnce(() => {
      throw new Error("no canvas");
    });
    expect(isLocalFontInstalled("Menlo")).toBeNull();
  });

  it("never asks document.fonts, which says yes for anything", () => {
    const check = vi.fn(() => true);
    Object.defineProperty(document, "fonts", { value: { check }, configurable: true });
    canvas([]);
    expect(isLocalFontInstalled("Not A Font")).toBe(false);
    expect(check).not.toHaveBeenCalled();
    delete (document as unknown as { fonts?: unknown }).fonts;
  });
});
