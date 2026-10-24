// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { fontRoleIds, fontRoles } from "@/app/fontChoices";
import { paletteIds } from "@/app/palettes";

const api = vi.hoisted(() => ({
  fetchAppearanceSettings: vi.fn(),
  updateAppearanceSettings: vi.fn(),
}));
const toast = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/services/internalApi/settings", () => api);
vi.mock("@/components/ui/toaster", () => ({ toaster: toast }));

import AppearanceSettingsSection from "./AppearanceSettingsSection";

const defaults = { display: "default", body: "default", label: "default" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  const { dataset } = document.documentElement;
  dataset.palette = "sleeve";
  dataset.fontDisplay = "default";
  dataset.fontBody = "default";
  dataset.fontLabel = "default";
  document.documentElement.className = "";
  api.fetchAppearanceSettings.mockResolvedValue({ palette: "sleeve", fonts: defaults });
  // Like the server: apply what was sent over what was saved.
  let saved = { palette: "sleeve", fonts: { ...defaults } };
  api.updateAppearanceSettings.mockImplementation(async (patch) => {
    saved = {
      palette: patch.palette ?? saved.palette,
      fonts: { ...saved.fonts, ...patch.fonts },
    };
    return saved;
  });
});

describe("AppearanceSettingsSection palette", () => {
  it("shows a card per registered palette, with the saved one selected", async () => {
    renderWithProviders(<AppearanceSettingsSection />);

    const sleeveCard = await screen.findByRole("radio", { name: /sleeve/i });
    await waitFor(() => expect(sleeveCard.getAttribute("aria-checked")).toBe("true"));
    for (const id of paletteIds) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${id}$`, "i") })).toBeTruthy();
    }
  });

  it("paints each card's swatches from the palette in the current mode", async () => {
    renderWithProviders(<AppearanceSettingsSection />);

    const card = await screen.findByRole("radio", { name: /riso/i });
    const ground = card.querySelector<HTMLElement>("[title=Ground]");
    expect(ground?.style.backgroundColor).toBe("rgb(251, 241, 222)");
    expect(card.querySelectorAll("[title]")).toHaveLength(4);
  });

  it("lists every palette in the registry and applies the chosen one at once", async () => {
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /sleeve/i }).getAttribute("aria-checked")).toBe("true")
    );

    await user.click(screen.getByRole("radio", { name: /riso/i }));

    expect(document.documentElement.dataset.palette).toBe("riso");
    await waitFor(() => expect(api.updateAppearanceSettings).toHaveBeenCalledWith({ palette: "riso" }));
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /riso/i }).getAttribute("aria-checked")).toBe("true")
    );
    expect(screen.getByRole("radio", { name: /sleeve/i }).getAttribute("aria-checked")).toBe("false");
  });

  it("selects the card as soon as it is clicked, before the save returns", async () => {
    let finish: (value: unknown) => void = () => {};
    api.updateAppearanceSettings.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /sleeve/i }).getAttribute("aria-checked")).toBe("true")
    );

    await user.click(screen.getByRole("radio", { name: /riso/i }));

    expect(screen.getByRole("radio", { name: /riso/i }).getAttribute("aria-checked")).toBe("true");
    finish({ palette: "riso", fonts: defaults });
    await waitFor(() => expect(api.updateAppearanceSettings).toHaveBeenCalled());
  });

  it("doesn't save when the selected palette is clicked again", async () => {
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /sleeve/i }).getAttribute("aria-checked")).toBe("true")
    );

    await user.click(screen.getByRole("radio", { name: /sleeve/i }));

    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("puts the page back and says so when saving fails", async () => {
    api.updateAppearanceSettings.mockRejectedValue(new Error("db down"));
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /sleeve/i }).getAttribute("aria-checked")).toBe("true")
    );

    await user.click(screen.getByRole("radio", { name: /riso/i }));

    await waitFor(() => expect(toast.create).toHaveBeenCalledWith(expect.objectContaining({ type: "error", description: "db down" })));
    expect(document.documentElement.dataset.palette).toBe("sleeve");
  });

  it("reports a non-Error failure by its text", async () => {
    api.updateAppearanceSettings.mockRejectedValue("nope");
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await user.click(await screen.findByRole("radio", { name: /riso/i }));
    await waitFor(() => expect(toast.create).toHaveBeenCalledWith(expect.objectContaining({ description: "nope" })));
  });

  it("falls back to the default selection when the saved id is unknown", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({ palette: "retired", fonts: defaults });
    renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /sleeve/i }).getAttribute("aria-checked")).toBe("true")
    );
  });

  it("says when the saved palette can't be loaded", async () => {
    api.fetchAppearanceSettings.mockRejectedValue(new Error("down"));
    renderWithProviders(<AppearanceSettingsSection />);
    expect(await screen.findByText(/failed to load the saved appearance/i)).toBeTruthy();
  });
});

describe("AppearanceSettingsSection mode", () => {
  it("offers light, dark and system, and remembers the choice on this device", async () => {
    const { user } = renderWithProviders(<AppearanceSettingsSection />);

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
    renderWithProviders(<AppearanceSettingsSection />);

    const card = await screen.findByRole("radio", { name: /riso/i });
    await waitFor(() =>
      expect(card.querySelector<HTMLElement>("[title=Ground]")?.style.backgroundColor).toBe("rgb(26, 20, 36)")
    );
  });
});

describe("AppearanceSettingsSection typography", () => {
  const group = (role: string) => within(screen.getByRole("radiogroup", { name: `${role} font` }));
  const checked = (role: string, name: string) =>
    group(role).getByRole("radio", { name: new RegExp(name, "i") }).getAttribute("aria-checked");

  it("shows a group per role with every registered choice, the saved one selected", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "sleeve",
      fonts: { display: "barlow-condensed", body: "default", label: "system" },
    });
    renderWithProviders(<AppearanceSettingsSection />);

    await waitFor(() => expect(checked("Display", "barlow condensed")).toBe("true"));
    for (const role of fontRoleIds) {
      const { label, choices } = fontRoles[role];
      expect(group(label).getAllByRole("radio")).toHaveLength(choices.length);
    }
    expect(checked("Display", "ibm plex sans")).toBe("false");
    expect(checked("Body", "ibm plex sans")).toBe("true");
    expect(checked("Labels", "system mono")).toBe("true");
  });

  it("renders each option in its own face", async () => {
    renderWithProviders(<AppearanceSettingsSection />);
    const card = await group("Body").findByRole("radio", { name: /inter/i });

    expect(card.style.fontFamily).toContain("--face-inter");
    expect(group("Body").getByRole("radio", { name: /system/i }).style.fontFamily).toMatch(/^system-ui/);
    expect(group("Labels").getByRole("radio", { name: /jetbrains/i }).style.fontFamily).toContain("--face-jetbrains-mono");
  });

  it("previews a line of DJ text in the chosen face, for every role", async () => {
    const { container } = renderWithProviders(<AppearanceSettingsSection />);
    await screen.findByRole("radiogroup", { name: "Body font" });

    for (const role of fontRoleIds) {
      const preview = container.querySelector<HTMLElement>(`[data-preview=${role}]`);
      expect(preview?.textContent).toBe("Water No Get Enemy · 104 BPM · A minor (8A)");
      expect(preview?.style.fontFamily).toContain("--face-plex-");
    }
  });

  it("applies a chosen font at once, saves only that role, and moves the preview", async () => {
    const { user, container } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() => expect(checked("Body", "ibm plex sans")).toBe("true"));

    await user.click(group("Body").getByRole("radio", { name: /inter/i }));

    expect(document.documentElement.dataset.fontBody).toBe("inter");
    expect(document.documentElement.dataset.fontDisplay).toBe("default");
    expect(document.documentElement.dataset.palette).toBe("sleeve");
    expect(checked("Body", "inter")).toBe("true");
    expect(container.querySelector<HTMLElement>("[data-preview=body]")?.style.fontFamily).toContain("--face-inter");
    await waitFor(() =>
      expect(api.updateAppearanceSettings).toHaveBeenCalledWith({ fonts: { body: "inter" } })
    );
  });

  it("keeps two quick changes to different roles", async () => {
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() => expect(checked("Body", "ibm plex sans")).toBe("true"));

    await user.click(group("Body").getByRole("radio", { name: /inter/i }));
    await user.click(group("Display").getByRole("radio", { name: /zilla/i }));

    await waitFor(() => expect(api.updateAppearanceSettings).toHaveBeenCalledTimes(2));
    expect(document.documentElement.dataset.fontBody).toBe("inter");
    expect(document.documentElement.dataset.fontDisplay).toBe("zilla-slab");
    await waitFor(() => expect(checked("Display", "zilla")).toBe("true"));
  });

  it("doesn't save when the selected font is clicked again", async () => {
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() => expect(checked("Labels", "ibm plex mono")).toBe("true"));

    await user.click(group("Labels").getByRole("radio", { name: /ibm plex mono/i }));

    expect(api.updateAppearanceSettings).not.toHaveBeenCalled();
  });

  it("puts the face back and says so when saving fails", async () => {
    api.updateAppearanceSettings.mockRejectedValue(new Error("db down"));
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() => expect(checked("Display", "ibm plex sans")).toBe("true"));

    await user.click(group("Display").getByRole("radio", { name: /barlow/i }));

    await waitFor(() =>
      expect(toast.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", title: "Failed to save display font", description: "db down" })
      )
    );
    expect(document.documentElement.dataset.fontDisplay).toBe("default");
    await waitFor(() => expect(checked("Display", "ibm plex sans")).toBe("true"));
    expect(checked("Display", "barlow")).toBe("false");
  });

  it("rolls back only the role that failed", async () => {
    api.updateAppearanceSettings.mockRejectedValueOnce(new Error("nope"));
    const { user } = renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() => expect(checked("Body", "ibm plex sans")).toBe("true"));
    document.documentElement.dataset.palette = "riso";

    await user.click(group("Body").getByRole("radio", { name: /inter/i }));

    await waitFor(() => expect(toast.create).toHaveBeenCalled());
    expect(document.documentElement.dataset.fontBody).toBe("default");
    expect(document.documentElement.dataset.palette).toBe("riso");
  });

  it("still applies and saves a change made before the saved setting has loaded", async () => {
    api.fetchAppearanceSettings.mockReturnValue(new Promise(() => {}));
    const { user } = renderWithProviders(<AppearanceSettingsSection />);

    await user.click(group("Body").getByRole("radio", { name: /inter/i }));

    expect(document.documentElement.dataset.fontBody).toBe("inter");
    await waitFor(() =>
      expect(api.updateAppearanceSettings).toHaveBeenCalledWith({ fonts: { body: "inter" } })
    );
  });

  it("falls back to the default selection for an unknown saved font", async () => {
    api.fetchAppearanceSettings.mockResolvedValue({
      palette: "sleeve",
      fonts: { display: "retired", body: "zilla-slab", label: "default" },
    });
    renderWithProviders(<AppearanceSettingsSection />);
    await waitFor(() => expect(checked("Display", "ibm plex sans")).toBe("true"));
    expect(checked("Body", "ibm plex sans")).toBe("true");
  });
});
