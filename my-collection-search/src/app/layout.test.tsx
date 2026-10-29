import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { palettes } from "./palettes";
import { sleeve } from "./palettes/sleeve";
import { customFromPreset } from "./palettes/custom";

const service = vi.hoisted(() => ({ getAppearance: vi.fn() }));
vi.mock("@/server/services/settingsService", () => ({ settingsService: service }));
vi.mock("./fonts", () => ({ fontClassName: "face-a face-b" }));
vi.mock("./providers", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/EmotionRegistry", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/components/AnalyticsInit", () => ({ default: () => null }));
vi.mock("@/lib/analytics/config", () => ({ getClientAnalyticsConfig: () => ({}) }));
vi.mock("@/lib/developerTools", () => ({ developerToolsEnabled: () => false }));

import RootLayout, { generateViewport, metadata } from "./layout";

const saved = (overrides: Record<string, unknown> = {}) => ({
  palette: "sleeve",
  fonts: { display: "default", body: "default", label: "default" },
  customPalette: null,
  ...overrides,
});

const render = async (children: React.ReactNode = "content") =>
  renderToStaticMarkup(await RootLayout({ children }));

beforeEach(() => {
  service.getAppearance.mockReset();
  service.getAppearance.mockResolvedValue(saved());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("root layout", () => {
  it("server-renders the saved palette on <html>, so there is no flash", async () => {
    const html = await render();
    expect(html).toMatch(/^<html [^>]*data-palette="sleeve"/);
    expect(html).toContain("<main>content</main>");
  });

  it("server-renders the saved font of each role on <html>", async () => {
    service.getAppearance.mockResolvedValue(
      saved({ fonts: { display: "barlow-condensed", body: "inter", label: "system" } }),
    );
    const html = await render();
    expect(html).toMatch(/^<html [^>]*data-font-display="barlow-condensed"/);
    expect(html).toMatch(/^<html [^>]*data-font-body="inter"/);
    expect(html).toMatch(/^<html [^>]*data-font-label="system"/);
  });

  it("renders any registered palette the setting names", async () => {
    const original = palettes.riso;
    (palettes as Record<string, unknown>).riso = sleeve;
    try {
      service.getAppearance.mockResolvedValue(saved({ palette: "riso" }));
      expect(await render()).toMatch(/^<html [^>]*data-palette="riso"/);
    } finally {
      (palettes as Record<string, unknown>).riso = original;
    }
  });

  it("falls back to the default palette, without throwing, when the setting can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    service.getAppearance.mockRejectedValue(new Error("db down"));

    const html = await render();

    expect(html).toMatch(/^<html [^>]*data-palette="sleeve"/);
    expect(html).toMatch(
      /^<html [^>]*data-font-display="default"[^>]*data-font-body="default"[^>]*data-font-label="default"/,
    );
    expect(html).toContain("<main>content</main>");
    expect(error).toHaveBeenCalled();
  });

  it("puts only the font variable classes on <html>, leaving light/dark to the colour-mode provider", async () => {
    const html = await render("x");
    expect(html).toMatch(/^<html [^>]*class="face-a face-b"/);
    expect(html).not.toMatch(/class="[^"]*\bdark\b/);
  });

  describe("custom palette", () => {
    const custom = customFromPreset("riso");

    it("server-renders its style block in <head> when it is the saved palette", async () => {
      service.getAppearance.mockResolvedValue(saved({ palette: "custom", customPalette: custom }));
      const html = await render();
      expect(html).toMatch(/^<html [^>]*data-palette="custom"/);
      expect(html).toMatch(/<head><style id="gn-custom-palette">:root\[data-palette="custom"\]\{/);
      expect(html).toContain(':root[data-palette="custom"].dark{');
      expect(html).toContain(`--gn-ground:${custom.light.ground};`);
    });

    it("renders no style when a preset is selected, even with a saved custom palette", async () => {
      service.getAppearance.mockResolvedValue(saved({ palette: "riso", customPalette: custom }));
      expect(await render()).not.toContain("<style");
    });

    it("renders no style when custom is named but no palette is stored", async () => {
      service.getAppearance.mockResolvedValue(saved({ palette: "custom", customPalette: null }));
      expect(await render()).not.toContain("<style");
    });

    it("emits nothing but validated hex, whatever the stored data said", async () => {
      // The service has already dropped invalid input; a hostile value that
      // somehow got through still cannot reach the style.
      const hostile = structuredClone(custom);
      hostile.light.ink = "red;}body{display:none";
      service.getAppearance.mockResolvedValue(saved({ palette: "custom", customPalette: hostile }));
      const html = await render();
      expect(html).not.toContain("display:none");
      expect(html).not.toContain("<style");
      expect(html).toMatch(/^<html [^>]*data-palette="sleeve"/);
    });
  });

  describe("viewport", () => {
    it("covers the notch so env(safe-area-inset-*) is non-zero, and tints the status bar per scheme", async () => {
      const viewport = await generateViewport();
      expect(viewport.viewportFit).toBe("cover");
      expect(viewport.themeColor).toEqual([
        { media: "(prefers-color-scheme: light)", color: sleeve.light["--gn-ground"] },
        { media: "(prefers-color-scheme: dark)", color: sleeve.dark["--gn-ground"] },
      ]);
    });

    it("follows the saved palette", async () => {
      service.getAppearance.mockResolvedValue(saved({ palette: "midnight" }));
      const viewport = await generateViewport();
      expect(viewport.themeColor).toEqual([
        { media: "(prefers-color-scheme: light)", color: palettes.midnight.light["--gn-ground"] },
        { media: "(prefers-color-scheme: dark)", color: palettes.midnight.dark["--gn-ground"] },
      ]);
    });

    it("lets the page draw under a translucent status bar", () => {
      expect(metadata.appleWebApp).toMatchObject({
        capable: true,
        statusBarStyle: "black-translucent",
      });
    });
  });
});
