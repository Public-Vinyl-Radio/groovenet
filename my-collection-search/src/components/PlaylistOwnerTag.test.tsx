// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const household = vi.hoisted(() => vi.fn());
vi.mock("@/providers/HouseholdProvider", () => ({ useHousehold: household }));
import PlaylistOwnerTag from "./PlaylistOwnerTag";

const users = [
  { id: "me", name: "Adam", is_owner: true },
  { id: "sam", name: "Sam", is_owner: false },
];

beforeEach(() => household.mockReturnValue({ data: { users, current: { id: "me" } } }));

describe("PlaylistOwnerTag", () => {
  it("names the owner of someone else's household playlist", () => {
    renderWithProviders(
      <PlaylistOwnerTag
        playlist={{ owner_id: "sam", owner_name: "Sam", visibility: "household" }}
      />,
    );
    expect(screen.getByTestId("playlist-owner-tag").textContent).toBe("Sam");
    expect(screen.getByTitle("Owned by Sam")).toBeTruthy();
  });

  it("marks a private playlist", () => {
    renderWithProviders(
      <PlaylistOwnerTag playlist={{ owner_id: "me", owner_name: "Adam", visibility: "private" }} />,
    );
    expect(screen.getByTestId("playlist-private-tag").textContent).toBe("Private");
  });

  it("shows nothing on the viewer's own or before the household loads", () => {
    const own = { owner_id: "me", owner_name: "Adam", visibility: "household" as const };
    const { unmount } = renderWithProviders(<PlaylistOwnerTag playlist={own} />);
    expect(screen.queryByTestId("playlist-owner-tag")).toBeNull();
    unmount();
    household.mockReturnValue({ data: undefined });
    renderWithProviders(<PlaylistOwnerTag playlist={{ ...own, owner_id: "sam" }} />);
    expect(screen.queryByTestId("playlist-owner-tag")).toBeNull();
  });
});
