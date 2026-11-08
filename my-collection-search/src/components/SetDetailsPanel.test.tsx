// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { LiveSetState } from "@/hooks/useLiveSet";
import type { LiveSetDetail } from "@/services/internalApi/playlists";
import SetDetailsPanel from "./SetDetailsPanel";

const liveSet = (over: Partial<LiveSetState>): LiveSetState => ({
  set: null,
  setSet: vi.fn(),
  loading: false,
  load: vi.fn(),
  create: vi.fn(),
  ...over,
});

const set = {
  title: "Friday",
  status: "planned",
  performances: [],
  collaborators: [],
  media: [],
  location_name: "Club",
  location_city: null,
} as unknown as LiveSetDetail;

describe("SetDetailsPanel", () => {
  it("shows nothing while loading, and no call to action while it isn't a set", () => {
    const { container, rerender } = renderWithProviders(
      <SetDetailsPanel playlistId={1} liveSet={liveSet({ loading: true })} />,
    );
    expect(container.textContent).toBe("");
    rerender(<SetDetailsPanel playlistId={1} liveSet={liveSet({})} />);
    expect(screen.queryByText("Turn this playlist into a set")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create set" })).toBeNull();
  });

  it("shows the set's details, with a way to edit them, once it is a set", async () => {
    const { user } = renderWithProviders(
      <SetDetailsPanel playlistId={1} liveSet={liveSet({ set })} />,
    );
    expect(screen.getByText("Friday")).toBeTruthy();
    expect(screen.getByText("Club")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit set details" }));
    expect(screen.getByRole("button", { name: "Save set details" })).toBeTruthy();
  });
});
