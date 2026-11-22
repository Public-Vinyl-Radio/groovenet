// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { fontRoleIds, fontRoles } from "@/app/fontChoices";
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
const group = (role: string) => within(screen.getByRole("radiogroup", { name: `${role} font` }));
const checked = (role: string, name: string) =>
  group(role)
    .getByRole("radio", { name: new RegExp(name, "i") })
    .getAttribute("aria-checked");
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
  it("shows a group per role with every registered choice, the saved one selected", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "sleeve",
      fonts: { display: "barlow-condensed", body: "default", label: "system" },
    });
    renderWithProviders(<Section />);

    await waitFor(() => expect(checked("Display", "barlow condensed")).toBe("true"));
    for (const role of fontRoleIds) {
      const { label, choices } = fontRoles[role];
      expect(group(label).getAllByRole("radio")).toHaveLength(choices.length);
    }
    expect(checked("Body", "ibm plex sans")).toBe("true");
    expect(checked("Labels", "system mono")).toBe("true");
  });

  it("renders each option in its own face", async () => {
    renderWithProviders(<Section />);
    const card = await group("Body").findByRole("radio", { name: /inter/i });
    expect(card.style.fontFamily).toContain("--face-inter");
    expect(group("Body").getByRole("radio", { name: "System" }).style.fontFamily).toMatch(
      /^system-ui/,
    );
  });

  it("applies a chosen font to this device, only for that role", async () => {
    const { user } = renderWithProviders(<Section />);
    await waitFor(() => expect(checked("Body", "ibm plex sans")).toBe("true"));

    await user.click(group("Body").getByRole("radio", { name: "JetBrains Mono" }));

    expect(document.documentElement.dataset.fontBody).toBe("jetbrains-mono");
    expect(document.documentElement.dataset.fontLabel).toBe("default");
    expect(stored().fonts).toEqual({ body: "jetbrains-mono" });
    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("resets one role without touching the others", async () => {
    localStorage.setItem(
      appearanceOverrideKey,
      JSON.stringify({ v: 1, fonts: { body: "inter", label: "system" } }),
    );
    reloadAppearanceOverride();
    const { user } = renderWithProviders(<Section />);
    await waitFor(() => expect(checked("Body", "inter")).toBe("true"));

    await user.click(screen.getByRole("button", { name: "Reset body font to the default" }));

    await waitFor(() => expect(checked("Body", "ibm plex sans")).toBe("true"));
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
    await waitFor(() => expect(checked("Display", "barlow condensed")).toBe("true"));
    expect(checked("Body", "ibm plex sans")).toBe("true");
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
    await screen.findByRole("radiogroup", { name: "Body font" });
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
    await user.click(group("Body").getByRole("radio", { name: "IBM Plex Sans" }));
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
