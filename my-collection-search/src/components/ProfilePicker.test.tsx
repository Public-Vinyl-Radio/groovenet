// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { ProfilePicker, shouldShowPicker } from "./ProfilePicker";
const profiles = [
  { id: "one", name: "Adam", is_owner: true },
  { id: "two", name: "Sam", is_owner: false },
];
describe("profile picker", () => {
  it("hides for a sole profile and a valid selection, shows only for multiple unselected profiles", () => {
    expect(shouldShowPicker([], null)).toBe(false);
    expect(shouldShowPicker(profiles.slice(0, 1), null)).toBe(false);
    expect(shouldShowPicker(profiles, profiles[0])).toBe(false);
    expect(shouldShowPicker(profiles, null)).toBe(true);
  });
  it("offers names and selects by opaque identity", async () => {
    const onSelect = vi.fn();
    const { user } = renderWithProviders(
      <ProfilePicker profiles={profiles} open onSelect={onSelect} onClose={() => {}} />,
    );
    expect(await screen.findByRole("dialog", { name: "Who's listening?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sam" }));
    expect(onSelect).toHaveBeenCalledWith("two");
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it("shows selection errors and disables choices while pending", async () => {
    renderWithProviders(
      <ProfilePicker
        profiles={profiles}
        open
        pending
        error="Try again"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      ((await screen.findByRole("button", { name: "Adam" })) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Try again");
  });
  it("can close the switcher", async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <ProfilePicker profiles={profiles} open dismissible onSelect={() => {}} onClose={onClose} />,
    );
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
