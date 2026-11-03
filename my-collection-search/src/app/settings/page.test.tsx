import { beforeEach, describe, expect, it, vi } from "vitest";

// The routes only decide what to render or where to send you; the shell has
// its own tests. `redirect` and `notFound` throw in Next, so the stubs do too.
const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/components/settings/SettingsShell", () => ({ default: () => null }));

import SettingsShell from "@/components/settings/SettingsShell";
import SettingsPage from "./page";
import SettingsSectionPage, { generateMetadata } from "./[section]/page";

const index = (query: Record<string, string | string[]>) =>
  SettingsPage({ searchParams: Promise.resolve(query) });
const section = (id: string) => SettingsSectionPage({ params: Promise.resolve({ section: id }) });

describe("/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the shell with no section open", async () => {
    const page = await index({});
    expect(page.type).toBe(SettingsShell);
    expect(page.props).toEqual({ section: null });
  });

  it.each([
    ["defaults", "/settings/libraries"],
    ["library", "/settings/libraries"],
    ["downloads", "/settings/apple-music"],
    ["ai", "/settings/ai-metadata"],
    ["appearance", "/settings/appearance"],
    ["about", "/settings/about"],
    ["disaster-recovery", "/settings/disaster-recovery"],
  ])("redirects the old ?section=%s link to %s", async (id, target) => {
    await expect(index({ section: id })).rejects.toThrow(`redirect:${target}`);
  });

  it("stays on the list for an unknown or repeated ?section", async () => {
    expect((await index({ section: "not-a-section" })).props).toEqual({ section: null });
    expect((await index({ section: ["ai", "about"] })).props).toEqual({ section: null });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("/settings/[section]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a section by its id", async () => {
    const page = await section("apple-music");
    expect(page?.type).toBe(SettingsShell);
    expect(page?.props).toEqual({ section: "apple-music" });
  });

  it("redirects an old tab id to the section that replaced it", async () => {
    await expect(section("downloads")).rejects.toThrow("redirect:/settings/apple-music");
    await expect(section("defaults")).rejects.toThrow("redirect:/settings/libraries");
  });

  it("is a 404 for an id nothing knows", async () => {
    await expect(section("nope")).rejects.toThrow("not-found");
  });

  it("titles the document with the section", async () => {
    const params = (id: string) => ({ params: Promise.resolve({ section: id }) });
    await expect(generateMetadata(params("ai-metadata"))).resolves.toEqual({
      title: "AI metadata · Settings",
    });
    await expect(generateMetadata(params("nope"))).resolves.toEqual({});
  });
});
