// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { Album } from "@/types/track";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useAlbum", () => ({ useAlbum: () => undefined }));
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAlbumsQuery", () => ({
  useUpdateAlbumMutation: () => ({ mutateAsync: vi.fn(), mutate }),
}));
// The care dialog has its own tests; here it only has to open, for this album.
vi.mock("@/components/records/RecordActionDialog", () => ({
  default: (props: { releaseId: string; friendId: number; onOpenChange: (open: boolean) => void }) => (
    <div role="dialog" aria-label="Log care">
      {props.releaseId}:{props.friendId}
      <button onClick={() => props.onOpenChange(false)}>Close care</button>
    </div>
  ),
}));

import AlbumResult from "./AlbumResult";
import AlbumTable from "./AlbumTable";

const album: Album = {
  release_id: "rel",
  friend_id: 7,
  title: "Blue Lines",
  artist: "Massive Attack",
  track_count: 9,
};

afterEach(() => vi.clearAllMocks());

describe("AlbumResult care action", () => {
  it("opens the care dialog for this album from its menu, and closes it", async () => {
    const { user } = renderWithProviders(<AlbumResult album={album} />);

    expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Album actions" })[0]);
    await user.click(await screen.findByRole("button", { name: /Log care/i }));

    const dialog = await screen.findByRole("dialog", { name: "Log care" });
    expect(dialog.textContent).toContain("rel:7");

    await user.click(screen.getByRole("button", { name: "Close care" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log care" })).toBeNull());
  });
});

it("badges effective album genres/styles, including intentionally empty replacements", async () => {
  const { rerender } = renderWithProviders(<AlbumResult album={{ ...album, genres: ["Source"], styles: ["Source Style"], effective_genres: ["Jazz"], effective_styles: ["Fusion"] }} />);
  expect(screen.getAllByText("Jazz").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Fusion").length).toBeGreaterThan(0);
  expect(screen.queryByText("Source")).toBeNull();
  rerender(<AlbumResult album={{ ...album, genres: ["Source"], styles: ["Source Style"], effective_genres: [], effective_styles: [] }} />);
  expect(screen.queryByText("Source Style")).toBeNull();
  expect(screen.queryByText("Fusion")).toBeNull();
});

const full: Album = {
  ...album,
  label: "Virgin",
  country: "UK",
  year: "1991",
  catalog_number: "WBRLP1",
  library_identifier: "LP-42",
  genres: ["Electronic"],
  styles: ["Trip Hop"],
};

describe("AlbumResult card", () => {
  it("shows label, country and year, the meta line and the genre tags", () => {
    renderWithProviders(<AlbumResult album={full} missingTags={["missing_audio"]} />);
    expect(screen.getByTestId("album-card")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Blue Lines" }).getAttribute("href")).toBe("/albums/rel?friend_id=7");
    expect(screen.getByText(/Virgin/).textContent).toContain("UK");
    expect(screen.getByText(/Virgin/).textContent).toContain("(1991)");
    const meta = screen.getByTestId("album-card-meta").textContent;
    expect(meta).toContain("LP-42");
    expect(meta).toContain("9 tracks");
    expect(meta).toContain("Cat WBRLP1");
    expect(meta).toContain("No audio");
    expect(screen.getByText("Electronic")).toBeTruthy();
    expect(screen.getByText("Trip Hop")).toBeTruthy();
  });

  it("shows at most two genre tags and counts the rest", () => {
    renderWithProviders(
      <AlbumResult album={{ ...full, genres: ["Electronic", "Rock"], styles: ["Trip Hop", "Downtempo"] }} />
    );
    const genres = screen.getByTestId("album-genres");
    expect(genres.textContent).toContain("Electronic");
    expect(genres.textContent).toContain("Rock");
    expect(genres.textContent).not.toContain("Trip Hop");
    const more = screen.getByLabelText("2 more genres");
    expect(more.textContent).toBe("+2");
    expect(more.getAttribute("title")).toBe("Trip Hop, Downtempo");
  });

  it("has no +N at two tags or fewer, and a row keeps them all", () => {
    renderWithProviders(<AlbumResult album={full} />);
    expect(screen.queryByLabelText(/more genres/)).toBeNull();
  });

  it("omits optional parts and the year 0", () => {
    renderWithProviders(<AlbumResult album={{ ...album, track_count: 1, year: "0" }} />);
    const meta = screen.getByTestId("album-card-meta").textContent;
    expect(meta).toContain("1 track");
    expect(meta).not.toContain("tracks");
    expect(meta).not.toContain("Cat");
    expect(screen.queryByText(/\(0\)/)).toBeNull();
    expect(screen.getByTestId("album-genres").getAttribute("aria-label")).toBeNull();
  });

  it("saves a rating", async () => {
    const { user } = renderWithProviders(<AlbumResult album={full} />);
    await user.click(screen.getAllByRole("radio", { hidden: true })[2]);
    expect(mutate).toHaveBeenCalledWith({ release_id: "rel", friend_id: 7, album_rating: 3 });
  });
});

describe("AlbumResult row", () => {
  it("keeps every genre tag", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult album={{ ...full, genres: ["Electronic", "Rock"], styles: ["Trip Hop", "Downtempo"] }} layout="row" />
      </AlbumTable>
    );
    const row = screen.getByTestId("album-row").textContent;
    expect(row).toContain("Downtempo");
    expect(screen.queryByLabelText(/more genres/)).toBeNull();
  });

  it("renders the table cells with tags for each active Missing filter", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult
          album={full}
          layout="row"
          missingTags={["missing_library_identifier", "missing_local_cover_art_url", "missing_audio"]}
        />
      </AlbumTable>
    );
    const row = screen.getByTestId("album-row");
    expect(row.textContent).toContain("Virgin · 1991");
    expect(row.textContent).toContain("LP-42");
    expect(row.textContent).toContain("No identifier");
    expect(row.textContent).toContain("No local cover");
    expect(row.textContent).toContain("No audio");
    expect(row.textContent).toContain("Electronic");
    expect(screen.getByRole("columnheader", { name: "Release" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Genre" })).toBeTruthy();
  });

  it("copes with a bare album", () => {
    renderWithProviders(
      <AlbumTable>
        <AlbumResult album={{ ...album, track_count: 0 }} layout="row" />
      </AlbumTable>
    );
    expect(screen.getByTestId("album-row").textContent).not.toContain("No audio");
  });
});

it("shows a compact discovery card with linked artwork, title and effective genres", () => {
  renderWithProviders(<AlbumResult album={{ ...full, effective_genres: ["Jazz"] }} layout="discovery" />);
  expect(screen.getByTestId("album-discovery-card")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Blue Lines" }).getAttribute("href")).toBe("/albums/rel?friend_id=7");
  expect(screen.getByRole("link", { name: "Blue Lines" }).getAttribute("href")).toBe("/albums/rel?friend_id=7");
  expect(screen.getByText("Massive Attack")).toBeTruthy();
  expect(screen.getByText("Jazz")).toBeTruthy();
  expect(screen.queryByText("Electronic")).toBeNull();
  expect(screen.queryByRole("button", { name: "Album actions" })).toBeNull();
});

it("reuses album links and genre badges in the full cover-grid layout", () => {
  renderWithProviders(<AlbumResult album={{ ...full, title: "A very long album title ".repeat(10) }} layout="cover" />);
  const coverLink = screen.getByRole("link", { name: /^Open A very long album/ });
  expect(coverLink.getAttribute("href")).toBe("/albums/rel?friend_id=7");
  expect(coverLink.querySelector("img")).toBeTruthy();
  expect(screen.getByTitle(/^A very long album title/)).toBeTruthy();
});
