// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import SavedStatus from "./SavedStatus";

describe("SavedStatus", () => {
  it("keeps an empty live region mounted before anything is saved", () => {
    renderWithProviders(<SavedStatus saved={false} subject="Default set to collector-2" />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
  });

  it("says what was saved and offers Undo", async () => {
    const onUndo = vi.fn();
    const { user } = renderWithProviders(
      <SavedStatus saved subject="Default set to collector-2" onUndo={onUndo} />,
    );
    expect(screen.getByRole("status").textContent).toContain("Default set to collector-2 · Saved");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("can carry a detail after Saved, with no Undo", () => {
    renderWithProviders(<SavedStatus saved detail="14:02" />);
    expect(screen.getByTestId("saved-status").textContent).toBe("Saved · 14:02");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
