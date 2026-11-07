// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { BpmCell, RatingCell } from "./RelatedTrackRows";
import type { Track } from "@/types/track";

const saveTrack = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useTracksQuery", () => ({ useTracksQuery: () => ({ saveTrack }) }));
const track = { track_id: "track", friend_id: 4, title: "Track", bpm: "145" } as Track;

describe("shared track cells", () => {
  it("labels a slower BPM against the seed", () => {
    renderWithProviders(<BpmCell track={track} delta={-5} />);
    expect(screen.getByLabelText("5 BPM slower")).toBeTruthy();
  });
  it("persists a rating and follows a refreshed track rating", async () => {
    const { user, rerender } = renderWithProviders(<RatingCell track={track} />);
    const stars = screen.getByLabelText("Not rated").querySelectorAll("[data-part=item]");
    await user.click(stars[3]);
    expect(saveTrack).toHaveBeenCalledWith({ track_id: "track", friend_id: 4, star_rating: 4 });
    rerender(<RatingCell track={{ ...track, star_rating: 2 }} />);
    expect(screen.getByLabelText("Rated 2 of 5")).toBeTruthy();
  });
});
