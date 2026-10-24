import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { palettes } from "./palettes";
import { sleeve } from "./palettes/sleeve";

const service = vi.hoisted(() => ({ getAppearance: vi.fn() }));
vi.mock("@/server/services/settingsService", () => ({ settingsService: service }));
vi.mock("./fonts", () => ({ fontClassName: "face-a face-b" }));
vi.mock("./providers", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/EmotionRegistry", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/components/AnalyticsInit", () => ({ default: () => null }));
vi.mock("@/lib/analytics/config", () => ({ getClientAnalyticsConfig: () => ({}) }));
vi.mock("@/lib/developerTools", () => ({ developerToolsEnabled: () => false }));

import RootLayout from "./layout";

const saved = (overrides: Record<string, unknown> = {}) => ({
  palette: "sleeve",
  fonts: { display: "default", body: "default", label: "default" },
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
      saved({ fonts: { display: "barlow-condensed", body: "inter", label: "system" } })
    );
    const html = await render();
    expect(html).toMatch(/^<html [^>]*data-font-display="barlow-condensed"/);
    expect(html).toMatch(/^<html [^>]*data-font-body="inter"/);
    expect(html).toMatch(/^<html [^>]*data-font-label="system"/);
  });

  it("renders any registered palette the setting names", async () => {
    (palettes as Record<string, unknown>).riso = sleeve;
    try {
      service.getAppearance.mockResolvedValue(saved({ palette: "riso" }));
      expect(await render()).toMatch(/^<html [^>]*data-palette="riso"/);
    } finally {
      delete (palettes as Record<string, unknown>).riso;
    }
  });

  it("falls back to the default palette, without throwing, when the setting can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    service.getAppearance.mockRejectedValue(new Error("db down"));

    const html = await render();

    expect(html).toMatch(/^<html [^>]*data-palette="sleeve"/);
    expect(html).toMatch(/^<html [^>]*data-font-display="default"[^>]*data-font-body="default"[^>]*data-font-label="default"/);
    expect(html).toContain("<main>content</main>");
    expect(error).toHaveBeenCalled();
  });

  it("puts only the font variable classes on <html>, leaving light/dark to the colour-mode provider", async () => {
    const html = await render("x");
    expect(html).toMatch(/^<html [^>]*class="face-a face-b"/);
    expect(html).not.toMatch(/class="[^"]*\bdark\b/);
  });
});
