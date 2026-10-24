import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("next/font/local", () => ({
  default: (options: Record<string, unknown>) => {
    loaded.push(options);
    return { variable: `class-for-${options.variable}` };
  },
}));

import { faceIds, faceVariable } from "./fontChoices";
import { fontClassName } from "./fonts";

const byVariable = () => new Map(loaded.map((o) => [o.variable as string, o]));
const sources = (options: Record<string, unknown>) =>
  options.src as Array<{ path: string; weight: string }>;

describe("fonts", () => {
  it("declares exactly the faces the registry lists, each on its own --face-* variable", () => {
    expect(loaded.map((o) => o.variable).sort()).toEqual(faceIds.map(faceVariable).sort());
    expect(fontClassName).toBe(loaded.map((o) => `class-for-${o.variable}`).join(" "));
  });

  it("never sets a --gn-font-* variable, which would race the attribute rules", () => {
    for (const options of loaded) expect(options.variable).not.toMatch(/^--gn-/);
  });

  it("swaps in with display: swap and a metric-matched fallback", () => {
    for (const options of loaded) {
      expect(options.display).toBe("swap");
      expect(options.fallback).toBeTruthy();
    }
  });

  it("preloads only the default faces, so an unused choice costs nothing on first load", () => {
    const preloaded = loaded.filter((o) => o.preload !== false).map((o) => o.variable);
    expect(preloaded).toEqual(["--face-plex-sans", "--face-plex-mono"]);
  });

  it("commits every font file, latin woff2 in the weights it declares", () => {
    expect(byVariable().size).toBe(loaded.length);
    for (const options of loaded) {
      expect(sources(options).length).toBeGreaterThan(0);
      for (const { path: file } of sources(options)) {
        expect(file).toMatch(/\.woff2$/);
        expect(existsSync(path.join(import.meta.dirname, file)), file).toBe(true);
      }
    }
  });

  it("commits a licence for each family", () => {
    const licences = ["IBMPlex", "BarlowCondensed", "ZillaSlab", "Inter", "JetBrainsMono"];
    for (const family of licences) {
      const file = path.join(import.meta.dirname, `fonts/OFL-${family}.txt`);
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file, "utf8")).toContain("SIL Open Font License");
    }
    // Every font file belongs to a family with a licence.
    for (const options of loaded) {
      for (const { path: file } of sources(options)) {
        const family = path.basename(file).split("-")[0];
        const licence = family.startsWith("IBMPlex") ? "IBMPlex" : family;
        expect(licences, file).toContain(licence);
      }
    }
  });
});
