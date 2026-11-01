import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { contrastRatio } from "./palettes/contrast";
import {
  buildSiteTokens,
  faceFiles,
  fontsDir,
  serializeSiteTokens,
  siteFontFiles,
  siteFontsDir,
  siteTokensPath,
  type SiteTokens,
} from "./siteTokens";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const stale = "is stale: run `just site-tokens` and commit the result";

describe("siteTokens", () => {
  const tokens = buildSiteTokens();

  it("matches the site's committed palettes.json", () => {
    const committed = readFileSync(path.join(repoRoot, siteTokensPath), "utf8");
    expect(committed, `${siteTokensPath} ${stale}`).toBe(serializeSiteTokens(tokens));
  });

  it("matches the site's committed font files, byte for byte", () => {
    const out = path.join(repoRoot, siteFontsDir);
    expect(readdirSync(out).sort(), `${siteFontsDir} ${stale}`).toEqual(
      siteFontFiles(tokens).sort(),
    );
    for (const file of siteFontFiles(tokens)) {
      const copied = readFileSync(path.join(out, file));
      expect(copied.equals(readFileSync(path.join(fontsDir, file))), `${file} ${stale}`).toBe(true);
    }
  });

  it("exports every registered palette, named the way Settings names it", () => {
    expect(tokens.palettes.map((p) => [p.id, p.label])).toEqual([
      ["sleeve", "Sleeve"],
      ["riso", "Riso"],
      ["midnight", "Midnight"],
      ["mono", "Mono"],
    ]);
    expect(tokens.palettes.find((p) => p.id === "mono")?.contrast).toBe("AAA");
    expect(tokens.defaultPalette).toBe("sleeve");
  });

  it("offers only self-hosted faces, each with files and a licence", () => {
    expect(tokens.fonts.display.choices.map((c) => c.label)).toEqual([
      "IBM Plex Sans",
      "Barlow Condensed",
      "Zilla Slab",
    ]);
    expect(tokens.fonts.label.choices.map((c) => c.label)).toEqual([
      "IBM Plex Mono",
      "JetBrains Mono",
    ]);
    expect(tokens.faces["plex-sans"]).toEqual({
      family: "IBM Plex Sans",
      files: [
        { weight: 400, file: "IBMPlexSans-400.woff2" },
        { weight: 500, file: "IBMPlexSans-500.woff2" },
        { weight: 600, file: "IBMPlexSans-600.woff2" },
      ],
      licence: "OFL-IBMPlex.txt",
    });
  });

  // The pairs the site's Appearance demo draws, in every palette and mode it offers.
  it("keeps every text pair the site's demo draws at 4.5:1", () => {
    const pairs = (v: SiteTokens["palettes"][number]["light"]) => ({
      "ink on ground": [v["--gn-ink"], v["--gn-ground"]],
      "ink on surface": [v["--gn-ink"], v["--gn-surface"]],
      "muted on ground": [v["--gn-ink-muted"], v["--gn-ground"]],
      "muted on surface": [v["--gn-ink-muted"], v["--gn-surface"]],
      "contrast on accent": [v["--gn-accent-contrast"], v["--gn-accent-solid"]],
      "ground on ink": [v["--gn-ground"], v["--gn-ink"]],
    });
    for (const palette of tokens.palettes) {
      for (const mode of ["light", "dark"] as const) {
        for (const [name, [fg, bg]] of Object.entries(pairs(palette[mode]))) {
          expect(contrastRatio(fg, bg), `${palette.id} ${mode}: ${name}`).toBeGreaterThanOrEqual(
            4.5,
          );
        }
      }
    }
  });
});

describe("faceFiles", () => {
  it("collects a family's weights in order, with its licence", () => {
    expect(faceFiles("Zilla Slab", ["ZillaSlab-600.woff2", "OFL-ZillaSlab.txt"])).toEqual({
      family: "Zilla Slab",
      files: [{ weight: 600, file: "ZillaSlab-600.woff2" }],
      licence: "OFL-ZillaSlab.txt",
    });
  });

  it("throws when a face has no files", () => {
    expect(() => faceFiles("Inter", ["OFL-Inter.txt"])).toThrow(/No woff2 files for Inter/);
  });

  it("throws when a face has no licence", () => {
    expect(() => faceFiles("Inter", ["Inter-400.woff2"])).toThrow(/No OFL licence for Inter/);
  });

  it("reads the app's fonts directory by default", () => {
    expect(buildSiteTokens(readdirSync(fontsDir))).toEqual(buildSiteTokens());
  });
});
