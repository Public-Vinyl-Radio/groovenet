// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { cssOf } from "@/test/cssOf";
import { AlbumRow, ArtistRow, TrackRow } from "@/components/CommandPaletteParts";
import { sampleTrack } from "@/stories/fixtures/track";
import type { Album } from "@/types/track";

const LONG = "Amor Prohibido (Remasterizado 2024/30th Anniversary) ".repeat(3).trim();

describe("palette rows", () => {
  it("gives a long album title one line and a title tooltip", () => {
    renderWithProviders(
      <AlbumRow
        album={{ ...({} as Album), title: LONG, artist: "Selena", year: "2024", track_count: 10 }}
      />,
    );
    const title = screen.getByText(LONG);
    expect(title.getAttribute("title")).toBe(LONG);
    expect(screen.getByText("Selena").getAttribute("title")).toBe("Selena");
    expect(screen.getByText("2024 · 10 tracks").getAttribute("title")).toBe("2024 · 10 tracks");
  });

  it("gives a long track title and its byline a tooltip each", () => {
    renderWithProviders(
      <TrackRow track={{ ...sampleTrack, title: LONG, artist: "A", album: "B", bpm: "120" }} />,
    );
    expect(screen.getByText(LONG).getAttribute("title")).toBe(LONG);
    expect(screen.getByText("A · B").getAttribute("title")).toBe("A · B");
  });

  it("titles an artist row", () => {
    renderWithProviders(
      <ArtistRow artist={{ name: "Selena", album_count: 1, track_count: 2 } as never} />,
    );
    expect(screen.getByText("Selena").getAttribute("title")).toBe("Selena");
  });

  it("keeps the cover from shrinking and the label owning the spare width", () => {
    const { container } = renderWithProviders(
      <AlbumRow album={{ ...({} as Album), title: LONG, artist: "Selena" }} />,
    );
    const cover = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(cover).toBeTruthy();
    expect(cover.className).toMatch(/rowCover/);
    expect(cssOf(cover)).toBeDefined();
  });
});
