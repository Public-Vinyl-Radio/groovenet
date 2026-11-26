// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { fontRoles } from "@/app/fontChoices";
import { paletteIds } from "@/app/palettes";
import { customFromPreset } from "@/app/palettes/custom";

const api = vi.hoisted(() => ({
  fetchAppearanceSettings: vi.fn(),
  updateAppearanceSettings: vi.fn(),
}));
const toast = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/services/internalApi/settings", () => api);
vi.mock("@/components/ui/toaster", () => ({ toaster: toast }));

import AppearanceSettingsSection from "./AppearanceSettingsSection";
import { useSyncAppearance } from "@/hooks/useAppearanceSettings";
import { reloadAppearanceOverride } from "@/lib/appearanceOverrideStore";
import { appearanceOverrideKey } from "@/app/appearanceOverride";

// The app mounts this in the providers; the section only writes the override.
function Section() {
  useSyncAppearance();
  return <AppearanceSettingsSection />;
}

const defaults = { display: "default", body: "default", label: "default" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  reloadAppearanceOverride();
  document.getElementById("gn-custom-palette")?.remove();
  const { dataset } = document.documentElement;
  dataset.palette = "sleeve";
  dataset.corners = "square";
  dataset.fontDisplay = "default";
  dataset.fontBody = "default";
  dataset.fontLabel = "default";
  document.documentElement.className = "";
  api.fetchAppearanceSettings.mockResolvedValue({
    palette: "sleeve",
    fonts: defaults,
    corners: "square",
  });
  // Like the server: apply what was sent over what was saved.
  let saved = { palette: "sleeve", fonts: { ...defaults }, corners: "square" };
  api.updateAppearanceSettings.mockImplementation(async (patch) => {
    saved = {
      palette: patch.palette ?? saved.palette,
      fonts: { ...saved.fonts, ...patch.fonts },
      corners: patch.corners ?? saved.corners,
    };
    return saved;
  });
});

const stored = () => JSON.parse(localStorage.getItem(appearanceOverrideKey) ?? "null");
const trigger = (role: string) => screen.getByRole("combobox", { name: `${role} font` });
/** The text on a role's closed select. */
const shown = (role: string) => trigger(role).textContent;
/** Open a role's select and pick an option by its exact label. */
const pick = async (user: UserEvent, role: string, name: string) => {
  await user.click(trigger(role));
  await user.click(await screen.findByRole("option", { name }));
};
const scope = (container: HTMLElement, title: string) =>
  container.querySelector(`section[aria-label="${title}"] [data-scope]`)?.textContent;

describe("AppearanceSettingsSection palette", () => {
  it("shows a card per registered palette, with the saved one selected", async () => {
    renderWithProviders(<Section />);
    const sleeveCard = await screen.findByRole("radio", { name: /sleeve/i });
    await waitFor(() => expect(sleeveCard.getAttribute("aria-checked")).toBe("true"));
    for (const id of paletteIds) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${id}$`, "i") })).toBeTruthy();
    }
  });

  it("paints each card's swatches from the palette in the current mode", async () => {
    renderWithProviders(<Section />);
    const card = await screen.findByRole("radio", { name: /riso/i });
    expect(card.querySelector<HTMLElement>("[title=Ground]")?.style.backgroundColor).toBe(
      "rgb(251, 241, 222)",
    );
    expect(card.querySelectorAll("[title]")).toHaveLength(4);
  });

  it("applies the chosen palette to this device only, never calling the API", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByRole("radio", { name: /riso/i }));

    expect(document.documentElement.dataset.palette).toBe("riso");
    expect(stored().palette).toBe("riso");
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /riso/i }).getAttribute("aria-checked")).toBe("true");
  });

  it("shows an override as overridden, and resets it to the saved palette", async () => {
    localStorage.setItem(appearanceOverrideKey, JSON.stringify({ v: 1, palette: "midnight" }));
    reloadAppearanceOverride();
    const { container, user } = renderWithProviders(<Section />);
    await waitFor(() => expect(scope(container, "Palette")).toBe("Overridden on this device"));
    await waitFor(() => expect(document.documentElement.dataset.palette).toBe("midnight"));

    await user.click(screen.getByRole("button", { name: "Reset palette to the default" }));

    await waitFor(() => expect(document.documentElement.dataset.palette).toBe("sleeve"));
    expect(scope(container, "Palette")).toBe("Default");
    expect(localStorage.getItem(appearanceOverrideKey)).toBeNull();
  });

  it("falls back to the saved palette when the stored one is unknown", async () => {
    localStorage.setItem(appearanceOverrideKey, JSON.stringify({ v: 1, palette: "gone" }));
    reloadAppearanceOverride();
    renderWithProviders(<Section />);
    const sleeve = await screen.findByRole("radio", { name: /sleeve/i });
    await waitFor(() => expect(sleeve.getAttribute("aria-checked")).toBe("true"));
  });

  it("keeps the device's choice over a different saved default", async () => {
    localStorage.setItem(appearanceOverrideKey, JSON.stringify({ v: 1, palette: "riso" }));
    reloadAppearanceOverride();
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "mono",
      fonts: defaults,
      corners: "square",
    });
    renderWithProviders(<Section />);
    const riso = await screen.findByRole("radio", { name: /riso/i });
    await waitFor(() => expect(riso.getAttribute("aria-checked")).toBe("true"));
    expect(document.documentElement.dataset.palette).toBe("riso");
  });

  it("says when the saved palette can't be loaded", async () => {
    api.fetchAppearanceSettings.mockRejectedValue(new Error("down"));
    renderWithProviders(<Section />);
    expect(await screen.findByText("Failed to load the saved appearance.")).toBeTruthy();
  });
});

describe("AppearanceSettingsSection mode", () => {
  it("offers light, dark and system, and remembers the choice on this device", async () => {
    const { user } = renderWithProviders(<Section />);

    const mode = within(screen.getByLabelText("Colour mode"));
    await user.click(mode.getByText("Dark"));
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(localStorage.getItem("theme")).toBe("dark");

    await user.click(mode.getByText("Light"));
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    expect(localStorage.getItem("theme")).toBe("light");

    await user.click(mode.getByText("System"));
    expect(localStorage.getItem("theme")).toBe("system");
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("shows swatches for the current mode", async () => {
    localStorage.setItem("theme", "dark");
    renderWithProviders(<Section />);

    const card = await screen.findByRole("radio", { name: /riso/i });
    await waitFor(() =>
      expect(card.querySelector<HTMLElement>("[title=Ground]")?.style.backgroundColor).toBe(
        "rgb(26, 20, 36)",
      ),
    );
  });
});

describe("AppearanceSettingsSection typography", () => {
  it("shows the saved choice on each role's closed select, in its own face", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "sleeve",
      fonts: { display: "barlow-condensed", body: "default", label: "system" },
    });
    renderWithProviders(<Section />);

    await waitFor(() => expect(shown("Display")).toBe("Barlow Condensed"));
    expect(shown("Body")).toBe("IBM Plex Sans");
    expect(shown("Labels")).toBe("System mono");
    expect(
      screen.getByText("Barlow Condensed", { selector: "[data-part=value-text]" }).style.fontFamily,
    ).toContain("--face-barlow-condensed");
  });

  it("lists every registered choice in groups, each in its own face", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByRole("combobox", { name: "Body font" }));

    for (const choice of fontRoles.body.choices) {
      expect(await screen.findByRole("option", { name: choice.label })).toBeTruthy();
    }
    const groups = [...document.querySelectorAll('[data-part="item-group-label"]')];
    expect(groups.map((g) => g.textContent)).toEqual([
      "Sans",
      "Mono",
      "Slab",
      "System",
      "This device",
    ]);
    expect(
      screen.getByRole("option", { name: "Inter" }).querySelector("span")?.style.fontFamily,
    ).toContain("--face-inter");
    expect(
      screen.getByRole("option", { name: "System" }).querySelector("span")?.style.fontFamily,
    ).toMatch(/^system-ui/);
    expect(screen.getByRole("option", { name: "Maple Mono" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Font on this device…" })).toBeTruthy();
  });

  it("offers Maple Mono for Body and Labels but not Display", async () => {
    const { user } = renderWithProviders(<Section />);
    for (const role of ["Body", "Labels"]) {
      await user.click(await screen.findByRole("combobox", { name: `${role} font` }));
      expect(await screen.findByRole("option", { name: "Maple Mono" })).toBeTruthy();
      await user.keyboard("{Escape}");
    }
    await user.click(screen.getByRole("combobox", { name: "Display font" }));
    await screen.findByRole("option", { name: "Zilla Slab" });
    expect(screen.queryByRole("option", { name: "Maple Mono" })).toBeNull();
  });

  it("has a live preview for each role in the current face", async () => {
    const { user } = renderWithProviders(<Section />);
    await screen.findByRole("combobox", { name: "Body font" });
    expect(screen.getByTestId("font-preview-display").textContent).toMatch(/^Page titles/);
    expect(screen.getByTestId("font-preview-body").textContent).toMatch(/^Interface text/);
    expect(screen.getByTestId("font-preview-label").textContent).toBe("LP-342 · BUTTON");

    await pick(user, "Body", "Maple Mono");
    expect(screen.getByTestId("font-preview-body").style.fontFamily).toContain("--face-maple-mono");
  });

  it("applies a chosen font to this device, only for that role", async () => {
    const { user } = renderWithProviders(<Section />);
    await waitFor(() => expect(shown("Body")).toBe("IBM Plex Sans"));

    await pick(user, "Body", "Maple Mono");

    expect(document.documentElement.dataset.fontBody).toBe("maple-mono");
    expect(document.documentElement.dataset.fontLabel).toBe("default");
    expect(stored().fonts).toEqual({ body: "maple-mono" });
    expect(shown("Body")).toBe("Maple Mono");
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("selects with the keyboard", async () => {
    const { user } = renderWithProviders(<Section />);
    await screen.findByRole("combobox", { name: "Body font" });
    trigger("Body").focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("option", { name: "Inter" });
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(stored()?.fonts?.body).toBeTruthy());
    expect(stored().fonts.body).not.toBe("default");
  });

  it("resets one role without touching the others", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, fonts: { body: "inter", label: "system" } }),
    );
    reloadAppearanceOverride();
    const { user } = renderWithProviders(<Section />);
    await waitFor(() => expect(shown("Body")).toBe("Inter"));

    await user.click(screen.getByRole("button", { name: "Reset body font to the default" }));

    await waitFor(() => expect(shown("Body")).toBe("IBM Plex Sans"));
    expect(stored().fonts).toEqual({ label: "system" });
    expect(document.documentElement.dataset.fontLabel).toBe("system");
  });

  it("falls back to the saved font for a retired stored id", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, fonts: { body: "papyrus", display: "barlow-condensed" } }),
    );
    reloadAppearanceOverride();
    renderWithProviders(<Section />);
    await waitFor(() => expect(shown("Display")).toBe("Barlow Condensed"));
    expect(shown("Body")).toBe("IBM Plex Sans");
  });
});

describe("AppearanceSettingsSection fonts installed on this device", () => {
  const root = () => document.documentElement;
  const openPanel = async (user: UserEvent, role = "Body") => {
    await pick(user, role, "Font on this device…");
    return screen.findByTestId(`local-font-panel-${role.toLowerCase().replace("labels", "label")}`);
  };
  const installFonts = (families: string[]) => {
    (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts = vi.fn(async () =>
      families.map((family) => ({ family })),
    );
  };
  /** A canvas whose text is wider for a stack that names an installed family. */
  const fakeCanvas = (installed: string[]) =>
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
      const ctx = {
        font: "",
        measureText: () => ({
          width: installed.some((name) => ctx.font.includes(`"${name}"`)) ? 100 : 80,
        }),
      };
      return ctx as unknown as CanvasRenderingContext2D;
    });

  afterEach(() => {
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
    root().style.removeProperty("--gn-font-body");
    root().style.removeProperty("--gn-font-label");
    vi.restoreAllMocks();
  });

  it("types a family name, previews it and applies it to this device only", async () => {
    fakeCanvas(["Berkeley Mono"]);
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user));

    await user.type(panel.getByLabelText("Font family"), "Berkeley Mono");
    expect(panel.getByTestId("local-font-sample-body").style.fontFamily).toContain("Berkeley Mono");
    expect(panel.queryByRole("alert")).toBeNull();
    await user.click(panel.getByRole("button", { name: "Use this font" }));

    expect(stored().localFonts).toEqual({ body: "Berkeley Mono" });
    expect(stored().fonts).toBeUndefined();
    await waitFor(() =>
      expect(root().style.getPropertyValue("--gn-font-body")).toBe(
        '"Berkeley Mono", "Helvetica Neue", Arial, sans-serif',
      ),
    );
    expect(shown("Body")).toBe("Berkeley Mono");
    expect(screen.getByTestId("font-preview-body").style.fontFamily).toContain("Berkeley Mono");
    // Never the shared default.
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Use as the default for everyone" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("warns when the font doesn't look installed, and still lets it be used", async () => {
    fakeCanvas([]);
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user, "Labels"));
    await user.type(panel.getByLabelText("Font family"), "Nope Sans");
    expect((await panel.findByRole("alert")).textContent).toMatch(
      /doesn.t look installed.*monospace/,
    );
    await user.click(panel.getByRole("button", { name: "Use this font" }));
    expect(stored().localFonts).toEqual({ label: "Nope Sans" });
    expect(root().style.getPropertyValue("--gn-font-label")).toMatch(/^"Nope Sans", ui-monospace/);
  });

  it("says nothing about installation when the canvas can't measure", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user));
    await user.type(panel.getByLabelText("Font family"), "Whatever");
    expect(panel.queryByRole("alert")).toBeNull();
  });

  it.each(['Evil"; } body { x', "a;b", "}", "</style><script>", "url(http://x)", "a\\b", "a'b"])(
    "refuses the name %j and never applies it",
    async (name) => {
      const { user } = renderWithProviders(<Section />);
      const panel = within(await openPanel(user));
      await user.click(panel.getByLabelText("Font family"));
      await user.paste(name);
      expect((await panel.findByRole("alert")).textContent).toMatch(/letters, numbers/i);
      expect(
        (panel.getByRole("button", { name: "Use this font" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(panel.queryByTestId("local-font-sample-body")).toBeNull();
      expect(localStorage.getItem(appearanceOverrideKey)).toBeNull();
    },
  );

  it("can be cancelled without changing anything", async () => {
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user));
    await user.click(panel.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("local-font-panel-body")).toBeNull();
    expect(shown("Body")).toBe("IBM Plex Sans");
  });

  it("lists installed families to search where the browser allows it", async () => {
    installFonts(["Menlo", "Berkeley Mono", "Menlo", "Bad;Name", "Avenir Next"]);
    fakeCanvas(["Berkeley Mono"]);
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user));
    expect(panel.queryByRole("listbox")).toBeNull();

    await user.click(panel.getByRole("button", { name: "Choose from installed fonts" }));
    const list = await panel.findByRole("listbox", { name: "Installed fonts" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Avenir Next", "Berkeley Mono", "Menlo"]);

    await user.type(panel.getByLabelText("Font family"), "berk");
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    await user.click(within(list).getByRole("option", { name: "Berkeley Mono" }));
    expect((panel.getByLabelText("Font family") as HTMLInputElement).value).toBe("Berkeley Mono");
    await user.click(panel.getByRole("button", { name: "Use this font" }));
    expect(stored().localFonts).toEqual({ body: "Berkeley Mono" });
  });

  it("falls back to typing when the permission is refused", async () => {
    (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user));
    await user.click(panel.getByRole("button", { name: "Choose from installed fonts" }));
    expect((await panel.findByRole("status")).textContent).toMatch(/type the family name/i);
    expect(panel.getByLabelText("Font family")).toBeTruthy();
  });

  it("has no list button where the API doesn't exist", async () => {
    const { user } = renderWithProviders(<Section />);
    const panel = within(await openPanel(user));
    expect(panel.queryByRole("button", { name: "Choose from installed fonts" })).toBeNull();
  });

  it("restores a stored device font, badges it and resets it", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, localFonts: { body: "Berkeley Mono" } }),
    );
    reloadAppearanceOverride();
    const { container, user } = renderWithProviders(<Section />);
    await waitFor(() => expect(shown("Body")).toBe("Berkeley Mono"));
    expect(scope(container, "Type")).toBe("Overridden on this device");
    await waitFor(() =>
      expect(root().style.getPropertyValue("--gn-font-body")).toContain('"Berkeley Mono"'),
    );
    // The panel stays open for a font in use, with no Cancel.
    expect(
      (
        within(screen.getByTestId("local-font-panel-body")).getByLabelText(
          "Font family",
        ) as HTMLInputElement
      ).value,
    ).toBe("Berkeley Mono");
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reset body font to the default" }));

    await waitFor(() => expect(shown("Body")).toBe("IBM Plex Sans"));
    expect(root().style.getPropertyValue("--gn-font-body")).toBe("");
    expect(localStorage.getItem(appearanceOverrideKey)).toBeNull();
  });

  it("picking a bundled font replaces the device font, even the one already underneath", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, localFonts: { body: "Berkeley Mono" } }),
    );
    reloadAppearanceOverride();
    const { user } = renderWithProviders(<Section />);
    await waitFor(() => expect(shown("Body")).toBe("Berkeley Mono"));

    await pick(user, "Body", "IBM Plex Sans");

    await waitFor(() => expect(shown("Body")).toBe("IBM Plex Sans"));
    expect(stored().localFonts).toBeUndefined();
    expect(root().style.getPropertyValue("--gn-font-body")).toBe("");
  });

  it("still lets a shared default go out, without the device font in it", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, fonts: { label: "system" }, localFonts: { body: "Berkeley Mono" } }),
    );
    reloadAppearanceOverride();
    const { user } = renderWithProviders(<Section />);
    await user.click(
      await screen.findByRole("button", { name: "Use as the default for everyone" }),
    );
    await waitFor(() =>
      expect(api.updateAppearanceSettings).toHaveBeenCalledWith({ fonts: { label: "system" } }),
    );
    await waitFor(() =>
      expect(stored()).toEqual(expect.objectContaining({ localFonts: { body: "Berkeley Mono" } })),
    );
    expect(stored().fonts).toBeUndefined();
  });
});

describe("AppearanceSettingsSection custom palette", () => {
  const custom = customFromPreset("riso");
  const styleEl = () => document.getElementById("gn-custom-palette");

  it("offers to create one when none is saved, and has no Custom card", async () => {
    renderWithProviders(<Section />);
    expect(await screen.findByText("Create custom palette")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /^custom$/i })).toBeNull();
  });

  it("saves a palette on this device, with its style in the page", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByText("Create custom palette"));
    await user.click(screen.getByText("Save custom palette"));

    await waitFor(() => expect(document.documentElement.dataset.palette).toBe("custom"));
    expect(styleEl()?.textContent).toContain(':root[data-palette="custom"]{');
    expect(stored().customPalette).toEqual(expect.objectContaining({ base: "sleeve" }));
    expect(stored().customCss).toContain(':root[data-palette="custom"]');
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("shows the saved palette as a card and selects it like a preset", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "sleeve",
      fonts: defaults,
      corners: "square",
      customPalette: custom,
    });
    const { user } = renderWithProviders(<Section />);
    const card = await screen.findByRole("radio", { name: /^custom$/i });
    await user.click(card);
    expect(document.documentElement.dataset.palette).toBe("custom");
    expect(styleEl()).not.toBeNull();
  });

  it("removes the device's own palette without touching the saved one", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, palette: "custom", customPalette: custom }),
    );
    reloadAppearanceOverride();
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByText("Edit custom palette"));
    await user.click(screen.getByText("Remove from this device"));

    await waitFor(() => expect(document.documentElement.dataset.palette).toBe("sleeve"));
    expect(styleEl()).toBeNull();
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("deletes the saved palette for everyone only from the editor, and says so", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "custom",
      fonts: defaults,
      corners: "square",
      customPalette: custom,
    });
    api.updateAppearanceSettings.mockResolvedValue({
      palette: "sleeve",
      fonts: defaults,
      corners: "square",
      customPalette: null,
    });
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByText("Edit custom palette"));
    await user.click(screen.getByText("Delete for everyone"));

    await waitFor(() =>
      expect(api.updateAppearanceSettings).toHaveBeenCalledWith({ customPalette: null }),
    );
    await waitFor(() =>
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Custom palette deleted for everyone" }),
      ),
    );
  });

  it("reports a failed shared delete", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "custom",
      fonts: defaults,
      corners: "square",
      customPalette: custom,
    });
    api.updateAppearanceSettings.mockRejectedValue(new Error("nope"));
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByText("Edit custom palette"));
    await user.click(screen.getByText("Delete for everyone"));
    await waitFor(() =>
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Failed to delete the custom palette",
          description: "nope",
        }),
      ),
    );
    expect(document.documentElement.dataset.palette).toBe("custom");
  });
});

describe("AppearanceSettingsSection corners and scope", () => {
  it("says where each part applies", async () => {
    const { container } = renderWithProviders(<Section />);
    await screen.findByRole("combobox", { name: "Body font" });
    expect(scope(container, "Palette")).toBe("Default");
    expect(scope(container, "Corners")).toBe("Default");
    expect(scope(container, "Type")).toBe("Default");
    expect(scope(container, "Light or dark")).toBe("This device");
  });

  it("applies the chosen corners to this device and resets them", async () => {
    const { container, user } = renderWithProviders(<Section />);
    await user.click(await screen.findByRole("radio", { name: "Rounded" }));
    expect(document.documentElement.dataset.corners).toBe("rounded");
    expect(stored().corners).toBe("rounded");
    expect(scope(container, "Corners")).toBe("Overridden on this device");

    await user.click(screen.getByRole("button", { name: "Reset corners to the default" }));
    await waitFor(() => expect(document.documentElement.dataset.corners).toBe("square"));
  });

  it("shows a live preview", async () => {
    renderWithProviders(<Section />);
    expect(await screen.findByTestId("corners-preview")).toBeTruthy();
  });
});

describe("AppearanceSettingsSection default for everyone and reset", () => {
  const overrideAll = () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, palette: "riso", corners: "rounded", fonts: { body: "inter" } }),
    );
    reloadAppearanceOverride();
  };

  it("disables both actions while the device overrides nothing", async () => {
    renderWithProviders(<Section />);
    const button = await screen.findByRole("button", { name: "Use as the default for everyone" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Reset this device" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("saves the overridden fields as the default, then follows it again", async () => {
    overrideAll();
    const { container, user } = renderWithProviders(<Section />);
    await user.click(
      await screen.findByRole("button", { name: "Use as the default for everyone" }),
    );

    await waitFor(() =>
      expect(api.updateAppearanceSettings).toHaveBeenCalledWith({
        palette: "riso",
        corners: "rounded",
        fonts: { body: "inter" },
      }),
    );
    await waitFor(() => expect(localStorage.getItem(appearanceOverrideKey)).toBeNull());
    expect(document.documentElement.dataset.palette).toBe("riso");
    expect(scope(container, "Palette")).toBe("Default");
    expect(toast.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved as the default for everyone" }),
    );
  });

  it("keeps the override and says so when saving the default fails", async () => {
    overrideAll();
    api.updateAppearanceSettings.mockRejectedValue(new Error("offline"));
    const { user } = renderWithProviders(<Section />);
    await user.click(
      await screen.findByRole("button", { name: "Use as the default for everyone" }),
    );

    await waitFor(() =>
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to save the default", description: "offline" }),
      ),
    );
    expect(stored().palette).toBe("riso");
    expect(document.documentElement.dataset.palette).toBe("riso");
  });

  it("resets the whole device to the saved setting", async () => {
    overrideAll();
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByRole("button", { name: "Reset this device" }));

    await waitFor(() => expect(document.documentElement.dataset.palette).toBe("sleeve"));
    expect(document.documentElement.dataset.corners).toBe("square");
    expect(document.documentElement.dataset.fontBody).toBe("default");
    expect(localStorage.getItem(appearanceOverrideKey)).toBeNull();
  });

  it("doesn't write when the current value is chosen again", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByRole("radio", { name: /sleeve/i }));
    await pick(user, "Body", "IBM Plex Sans");
    await user.click(screen.getByRole("radio", { name: "Square" }));
    expect(localStorage.getItem(appearanceOverrideKey)).toBeNull();
  });

  it("resets every font role from the Type part", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, fonts: { body: "inter", display: "zilla-slab" } }),
    );
    reloadAppearanceOverride();
    const { container, user } = renderWithProviders(<Section />);
    await waitFor(() => expect(scope(container, "Type")).toBe("Overridden on this device"));
    await user.click(screen.getByRole("button", { name: "Reset type to the default" }));
    await waitFor(() => expect(scope(container, "Type")).toBe("Default"));
    expect(localStorage.getItem(appearanceOverrideKey)).toBeNull();
  });

  it("sends the device's custom palette with the default, and reports a non-Error failure", async () => {
    const custom = customFromPreset("riso");
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, palette: "custom", customPalette: custom }),
    );
    reloadAppearanceOverride();
    api.updateAppearanceSettings.mockRejectedValueOnce("plain text");
    const { user } = renderWithProviders(<Section />);
    await user.click(
      await screen.findByRole("button", { name: "Use as the default for everyone" }),
    );
    await waitFor(() =>
      expect(api.updateAppearanceSettings).toHaveBeenCalledWith({
        palette: "custom",
        customPalette: custom,
      }),
    );
    await waitFor(() =>
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: "plain text" }),
      ),
    );
  });

  it("closes the custom palette editor", async () => {
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByText("Create custom palette"));
    expect(screen.getByTestId("custom-palette-editor")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /close|cancel/i }));
    expect(screen.queryByTestId("custom-palette-editor")).toBeNull();
  });

  it("still works when storage throws: the change lasts for the page", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { user } = renderWithProviders(<Section />);
    await user.click(await screen.findByRole("radio", { name: /midnight/i }));
    expect(document.documentElement.dataset.palette).toBe("midnight");
    setItem.mockRestore();
  });
});

describe("AppearanceSettingsSection tab bar labels", () => {
  it("defaults to Always and saves the choice on this device only", async () => {
    const { user } = renderWithProviders(<Section />);
    const group = await screen.findByRole("radiogroup", { name: "Tab bar labels" });
    expect((within(group).getByLabelText("Always") as HTMLInputElement).checked).toBe(true);

    await user.click(within(group).getByText("Never"));
    expect(localStorage.getItem("tabbar-labels")).toBe("never");
    expect((within(group).getByLabelText("Never") as HTMLInputElement).checked).toBe(true);
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();

    await user.click(within(group).getByText("Selected only"));
    expect(localStorage.getItem("tabbar-labels")).toBe("selected");
    localStorage.clear();
  });
});
