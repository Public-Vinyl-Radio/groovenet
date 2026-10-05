// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  friend: { id: 4, username: "dj" } as { id: number; username: string } | null,
  settings: { isPending: false, error: null as Error | null, data: { friend_id: 4, scope: "library", isDefault: true } as unknown },
  mutate: vi.fn(),
  isPending: false,
  toast: vi.fn(),
}));

vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useSuggestionScope", () => ({
  useRecommendationSettingsQuery: () => mocks.settings,
  useUpdateRecommendationSettings: () => ({ mutate: mocks.mutate, isPending: mocks.isPending }),
}));
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: mocks.toast } }));

import SuggestionScopeSettingsSection from "./SuggestionScopeSettingsSection";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.friend = { id: 4, username: "dj" };
  mocks.settings = { isPending: false, error: null, data: { friend_id: 4, scope: "library", isDefault: true } };
  mocks.isPending = false;
});

describe("SuggestionScopeSettingsSection", () => {
  it("shows the selected library's scope and saves a change for it", async () => {
    const { user } = renderWithProviders(<SuggestionScopeSettingsSection />);

    expect(screen.getByText("Default for every library.")).toBeTruthy();
    await user.click(screen.getByText("All libraries"));

    expect(mocks.mutate).toHaveBeenCalledWith({ friend_id: 4, scope: "all" }, expect.any(Object));
  });

  it("toasts when saving fails", async () => {
    mocks.mutate.mockImplementation((_body, options: { onError: (err: unknown) => void }) => options.onError(new Error("db down")));
    const { user } = renderWithProviders(<SuggestionScopeSettingsSection />);

    await user.click(screen.getByText("All libraries"));

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Failed to save suggestion scope", description: "db down" }));
  });

  it("toasts a failure that isn't an Error", async () => {
    mocks.mutate.mockImplementation((_body, options: { onError: (err: unknown) => void }) => options.onError("timeout"));
    const { user } = renderWithProviders(<SuggestionScopeSettingsSection />);
    await user.click(screen.getByText("All libraries"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "timeout" }));
  });

  it("shows the default while nothing has come back yet", () => {
    mocks.settings = { isPending: false, error: null, data: undefined };
    renderWithProviders(<SuggestionScopeSettingsSection />);
    expect((screen.getByRole("radio", { name: "This library", hidden: true }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Saved for dj.")).toBeTruthy();
  });

  it("shows a spinner while saving", () => {
    mocks.isPending = true;
    const { container } = renderWithProviders(<SuggestionScopeSettingsSection />);
    expect(container.querySelector(".chakra-spinner")).toBeTruthy();
  });

  it("names the library once a choice is saved", () => {
    mocks.settings.data = { friend_id: 4, scope: "all", isDefault: false };
    renderWithProviders(<SuggestionScopeSettingsSection />);
    expect(screen.getByText("Saved for dj.")).toBeTruthy();
  });

  it("asks for a library first", () => {
    mocks.friend = null;
    renderWithProviders(<SuggestionScopeSettingsSection />);
    expect(screen.getByText("Select a library first.")).toBeTruthy();
  });

  it("reports a failed load", () => {
    mocks.settings = { isPending: false, error: new Error("x"), data: undefined };
    renderWithProviders(<SuggestionScopeSettingsSection />);
    expect(screen.getByText("Failed to load the suggestion scope.")).toBeTruthy();
  });

  it("waits while loading", () => {
    mocks.settings = { isPending: true, error: null, data: undefined };
    renderWithProviders(<SuggestionScopeSettingsSection />);
    expect(screen.queryByText("All libraries")).toBeNull();
  });
});
