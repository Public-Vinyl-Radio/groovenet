// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  setFriend: vi.fn(),
}));

vi.mock("@/hooks/useFriendsQuery", () => ({
  useFriendsQuery: () => ({
    friends: [{ id: 1, username: "dj-a" }, { id: 2, username: "dj-b" }],
    friendsLoading: false,
  }),
}));
vi.mock("@/providers/UsernameProvider", () => ({
  useUsername: () => ({ friend: { id: 1, username: "dj-a" }, setFriend: mocks.setFriend, isSaving: false }),
}));
vi.mock("@/components/UsernameSelect", () => ({
  default: ({ value, onChange }: { value: { username: string } | null; onChange: (id: number) => void }) => (
    <button onClick={() => onChange(2)}>{value?.username ?? "none"}</button>
  ),
}));

import DefaultLibrarySettingsSection from "./DefaultLibrarySettingsSection";

describe("DefaultLibrarySettingsSection", () => {
  it("shows the current default library and switches it", async () => {
    const { user } = renderWithProviders(<DefaultLibrarySettingsSection />);
    expect(screen.getByText("dj-a")).toBeTruthy();

    await user.click(screen.getByText("dj-a"));
    expect(mocks.setFriend).toHaveBeenCalledWith({ id: 2, username: "dj-b" });
  });
});
