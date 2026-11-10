import { describe, expect, it } from "vitest";
import {
  defaultFontChoiceId,
  faceIds,
  faceVariable,
  fontChoiceFamily,
  fontChoiceIdsFor,
  fontChoiceValue,
  fontRoleIds,
  fontRoles,
  isFontChoiceId,
  monoFallback,
  resolveFontChoice,
} from "./fontChoices";

describe("font registry", () => {
  it("offers display, body and labels", () => {
    expect(fontRoleIds).toEqual(["display", "body", "label"]);
  });

  it.each(fontRoleIds)(
    "offers %s two to six choices, the default first and System last",
    (role) => {
      const { choices } = fontRoles[role];
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.length).toBeLessThanOrEqual(6);
      expect(choices[0].id).toBe(defaultFontChoiceId);
      expect(choices.at(-1)?.id).toBe("system");
      expect(new Set(choices.map((c) => c.id)).size).toBe(choices.length);
    },
  );

  it("makes today's faces the defaults", () => {
    expect(fontRoles.display.choices[0]).toMatchObject({ face: "plex-sans" });
    expect(fontRoles.body.choices[0]).toMatchObject({ face: "plex-sans" });
    expect(fontRoles.label.choices[0]).toMatchObject({ face: "plex-mono" });
  });

  it("gives System a stack and no file", () => {
    for (const role of fontRoleIds) {
      const system = fontRoles[role].choices.at(-1) as { face?: string; stack?: string };
      expect(system.face).toBeUndefined();
      expect(system.stack).toBeTruthy();
    }
    expect(fontRoles.label.choices.at(-1)).toMatchObject({
      stack: expect.stringContaining("ui-monospace"),
    });
  });

  it("lists the faces once each", () => {
    expect(faceIds).toEqual([
      "plex-sans",
      "barlow-condensed",
      "zilla-slab",
      "inter",
      "plex-mono",
      "jetbrains-mono",
    ]);
  });

  it("validates an id against its own role", () => {
    expect(isFontChoiceId("body", "inter")).toBe(true);
    expect(isFontChoiceId("body", "zilla-slab")).toBe(false);
    expect(isFontChoiceId("display", "zilla-slab")).toBe(true);
    expect(isFontChoiceId("label", 3)).toBe(false);
    expect(isFontChoiceId("label", "constructor")).toBe(false);
  });

  it("falls back to the default for an unknown, foreign or missing id", () => {
    expect(resolveFontChoice("body", "inter")).toBe("inter");
    for (const value of ["retired", "zilla-slab", null, undefined, 7]) {
      expect(resolveFontChoice("body", value)).toBe("default");
    }
  });

  it("offers the mono faces for body text, reusing the Labels faces", () => {
    expect(fontChoiceIdsFor("body")).toEqual([
      "default",
      "inter",
      "plex-mono",
      "jetbrains-mono",
      "system-mono",
      "system",
    ]);
    const faces = (role: "body" | "label") =>
      new Set(fontRoles[role].choices.flatMap((c) => ("face" in c ? [c.face] : [])));
    expect(faces("body").has("plex-mono")).toBe(true);
    expect(faces("body").has("jetbrains-mono")).toBe(true);
    expect(fontChoiceValue("body", "plex-mono")).toBe(
      `var(--face-plex-mono, ${fontRoles.body.fallback})`,
    );
    expect(fontChoiceValue("body", "system-mono")).toBe(monoFallback);
    expect(fontChoiceValue("body", "system")).toMatch(/^system-ui/);
    expect(resolveFontChoice("body", "system-mono")).toBe("system-mono");
    expect(resolveFontChoice("display", "system-mono")).toBe("default");
    expect(resolveFontChoice("label", "plex-mono")).toBe("default");
  });

  it("lists a role's ids, default first", () => {
    expect(fontChoiceIdsFor("label")).toEqual(["default", "jetbrains-mono", "system"]);
  });

  it("turns a face into its own variable with the role's stack behind it", () => {
    expect(faceVariable("inter")).toBe("--face-inter");
    expect(fontChoiceValue("body", "inter")).toBe(`var(--face-inter, ${fontRoles.body.fallback})`);
    expect(fontChoiceValue("body", "nonsense")).toBe(fontChoiceValue("body", "default"));
    expect(fontChoiceFamily("label", "system")).toContain("ui-monospace");
    expect(fontChoiceFamily("display", "zilla-slab")).toMatch(/^var\(--face-zilla-slab, .*\), /);
  });
});
