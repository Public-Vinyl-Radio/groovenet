// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { customFromPreset, type CustomPalette } from "@/app/palettes/custom";
import { palettes } from "@/app/palettes";
import CustomPaletteEditor from "./CustomPaletteEditor";

const setup = (over: Partial<React.ComponentProps<typeof CustomPaletteEditor>> = {}) => {
  const props = {
    ...{ onSave: vi.fn<(palette: CustomPalette) => void>() },
    saved: null,
    initialBase: "sleeve" as const,
    saving: false,
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  return { props, ...renderWithProviders(<CustomPaletteEditor {...props} />) };
};

const hex = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(hex(name), { target: { value } });

describe("CustomPaletteEditor", () => {
  it("starts as a copy of the chosen preset and shows a pass state", () => {
    setup({ initialBase: "midnight" });
    expect(hex("Ground (light) hex").value).toBe(
      palettes.midnight.light["--gn-ground"].toLowerCase(),
    );
    expect(hex("Accent (light) hex").value).toBe(
      palettes.midnight.light["--gn-accent-solid"].toLowerCase(),
    );
    expect(screen.getByTestId("contrast-summary").textContent).toContain(
      "passes AA in light and dark",
    );
    // Each input carries its ratio as text with a Pass label.
    expect(
      within(screen.getByTestId("custom-palette-editor")).getAllByText(/· Pass/).length,
    ).toBeGreaterThan(3);
  });

  it("edits one mode at a time", async () => {
    const { user } = setup();
    expect(screen.queryByLabelText("Ground (dark) hex")).toBeNull();
    await user.click(screen.getByText("Dark"));
    expect(hex("Ground (dark) hex").value).toBe("#17130f");
    expect(screen.getByTestId("palette-preview").getAttribute("data-preview-mode")).toBe("dark");
  });

  it("lists failing pairs with ratios per mode and a summary", () => {
    setup();
    type("Ink (light) hex", "#f0e8da");
    const summary = screen.getByTestId("contrast-summary").textContent ?? "";
    expect(summary).toMatch(/\d+ pairs? below AA in light/);
    expect(summary).not.toContain("in dark");
    expect(summary).toMatch(/Ink on ground: 1\.\d\d:1, needs 4\.5:1/);
    const field = screen.getByLabelText("Ink (light) hex").closest("[data-colour]") as HTMLElement;
    expect(field.textContent).toContain("Fail");
  });

  it("names failing status pairs on a ground they cannot read on", () => {
    setup();
    type("Ground (light) hex", "#9b1c1c");
    const text = screen.getByTestId("contrast-summary").textContent ?? "";
    expect(text).toContain("Status missing text on ground");
    expect(text).toContain("Status missing border on ground");
  });

  it("says 'pair' for a single failure and lists dark failures under Dark", async () => {
    const { user } = setup();
    type("Accent (light) hex", "#f0e8da");
    expect(screen.getByTestId("contrast-summary").textContent).toMatch(
      /\b1 pair below AA in light/,
    );
    await user.click(screen.getByText("Dark"));
    type("Ink (dark) hex", "#1c1713");
    const text = screen.getByTestId("contrast-summary").textContent ?? "";
    expect(text).toMatch(/pairs below AA in dark/);
    expect(text).toContain("Dark");
  });

  it("rejects a malformed hex as you type, keeping the last valid colour", () => {
    setup();
    type("Ink (light) hex", "red;}body{display:none");
    expect(screen.getByRole("alert").textContent).toContain("six-digit hex");
    expect(hex("Ink (light) hex").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByLabelText("Ink (light) colour picker") as HTMLInputElement).value).toBe(
      "#1f1a17",
    );
  });

  it("saves a passing palette at once", () => {
    const { props } = setup();
    type("Accent (light) hex", "#B02A14");
    fireEvent.click(screen.getByText("Save custom palette"));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onSave).mock.calls[0][0].light.accent).toBe("#b02a14");
  });

  it("asks for confirmation before saving a palette with failures", () => {
    const { props } = setup();
    type("Ink (light) hex", "#f0e8da");

    fireEvent.click(screen.getByText("Save custom palette"));
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("hard to read");

    fireEvent.click(screen.getByText("Save anyway"));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onSave).mock.calls[0][0].light.ink).toBe("#f0e8da");
  });

  it("withdraws the confirmation when a colour changes", () => {
    setup();
    type("Ink (light) hex", "#f0e8da");
    fireEvent.click(screen.getByText("Save custom palette"));
    type("Ink (light) hex", "#1f1a17");
    expect(screen.queryByText("Save anyway")).toBeNull();
  });

  it("resets to the base values, or to the saved palette", () => {
    const saved = customFromPreset("riso");
    const { unmount } = setup();
    type("Ink (light) hex", "#f0e8da");
    fireEvent.click(screen.getByText("Reset"));
    expect(hex("Ink (light) hex").value).toBe("#1f1a17");
    unmount();

    setup({ saved });
    type("Ink (light) hex", "#f0e8da");
    fireEvent.click(screen.getByText("Reset"));
    expect(hex("Ink (light) hex").value).toBe(saved.light.ink);
  });

  it("switches the preset straight away until something is edited, then asks", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Start from"), { target: { value: "riso" } });
    expect(hex("Ground (light) hex").value).toBe(palettes.riso.light["--gn-ground"].toLowerCase());

    type("Ink (light) hex", "#f0e8da");
    fireEvent.change(screen.getByLabelText("Start from"), { target: { value: "mono" } });
    expect(screen.getByRole("alertdialog").textContent).toContain("mono");
    fireEvent.click(screen.getByText("Keep editing"));
    expect(hex("Ink (light) hex").value).toBe("#f0e8da");

    fireEvent.change(screen.getByLabelText("Start from"), { target: { value: "mono" } });
    fireEvent.click(screen.getByText("Replace my edits"));
    expect(hex("Ink (light) hex").value).toBe("#000000");
  });

  it("applies the draft to the preview as inline variables only", () => {
    setup();
    type("Ground (light) hex", "#102030");
    const preview = screen.getByTestId("palette-preview");
    expect(preview.style.getPropertyValue("--gn-ground")).toBe("#102030");
    expect(preview.style.getPropertyValue("--gn-status-missing-fg")).toBe(
      palettes.sleeve.light["--gn-status-missing-fg"],
    );
    // The shadow variables are resolved on the wrapper, so the shadow follows the draft.
    expect(preview.style.getPropertyValue("--chakra-shadows-md")).toBe(
      "6px 6px 0 0 var(--gn-shadow)",
    );
    expect(preview.style.getPropertyValue("--chakra-colors-bg-panel")).toBe("var(--gn-surface)");
    expect(document.documentElement.style.getPropertyValue("--gn-ground")).toBe("");
    for (const status of ["missing", "analysis", "genre", "success"]) {
      expect(within(preview).getByText(status)).toBeTruthy();
    }
  });

  it("offers delete only for a saved palette", () => {
    const { props, unmount } = setup();
    expect(screen.queryByText("Delete custom palette")).toBeNull();
    unmount();
    const saved = setup({ saved: customFromPreset("sleeve") });
    fireEvent.click(screen.getByText("Delete custom palette"));
    expect(saved.props.onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close"));
    expect(saved.props.onClose).toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("syncs the colour picker to the draft", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Ground (light) colour picker"), {
      target: { value: "#aabbcc" },
    });
    expect(hex("Ground (light) hex").value).toBe("#aabbcc");
  });
});
