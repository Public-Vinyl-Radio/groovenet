// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { TrackPlaylistMembership } from "@/services/internalApi/tracks";
import TrackPlaylistsSection from "./TrackPlaylistsSection";

const query = (q: object) => q as UseQueryResult<TrackPlaylistMembership[], Error>;

describe("TrackPlaylistsSection", () => {
  it.each([
    ["still loading", { data: undefined, isLoading: true, error: null }],
    ["in no playlist", { data: [], isLoading: false, error: null }],
  ])("renders nothing while %s", (_, q) => {
    renderWithProviders(<TrackPlaylistsSection query={query(q)} />);
    expect(screen.queryByText("In Playlists")).toBeNull();
  });

  it("lists the playlists the track is in", () => {
    renderWithProviders(
      <TrackPlaylistsSection
        query={query({
          data: [{ id: 3, name: "Peak", position: 7 }] as TrackPlaylistMembership[],
          error: null,
        })}
      />,
    );
    expect(screen.getByText("In Playlists")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Peak" }).getAttribute("href")).toBe("/playlists/3");
    expect(screen.getByText("Position 7")).toBeTruthy();
  });

  it("still reports a failed lookup", () => {
    renderWithProviders(
      <TrackPlaylistsSection query={query({ data: undefined, error: new Error("boom") })} />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
