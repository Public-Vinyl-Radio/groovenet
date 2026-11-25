// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, chooseMenuItem } from "@/test/renderWithProviders";
const household = vi.hoisted(() => vi.fn());
vi.mock("@/providers/HouseholdProvider", () => ({ useHousehold: household }));
import ProfileMenu from "./ProfileMenu";
const profiles = [
  { id: "one", name: "Adam", is_owner: true },
  { id: "two", name: "Sam", is_owner: false },
];
beforeEach(() => household.mockReset());
describe("user menu", () => {
  it.each([undefined, { users: profiles.slice(0, 1) }])(
    "hides for a sole profile and while loading",
    (data) => {
      household.mockReturnValue({ data });
      renderWithProviders(<ProfileMenu />);
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
  it.each([profiles[0], null])("opens the profile switcher for %j", async (current) => {
    const switchProfile = vi.fn();
    household.mockReturnValue({ data: { users: profiles, current }, switchProfile });
    const { user } = renderWithProviders(<ProfileMenu />);
    expect(screen.getByText(current?.name ?? "Profile")).toBeTruthy();
    await chooseMenuItem(user, screen.getByRole("button", { name: "User menu" }), /Switch profile/);
    expect(switchProfile).toHaveBeenCalled();
  });
});

it("keeps a collapsed sidebar compact", () => {
  household.mockReturnValue({ data: { users: profiles, current: profiles[0] } });
  renderWithProviders(<ProfileMenu compact />);
  expect(screen.queryByText("Adam")).toBeNull();
  expect(screen.getByRole("button", { name: "User menu" }).getAttribute("title")).toBe("Adam");
});
