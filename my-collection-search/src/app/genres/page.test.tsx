// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  friend: { id: 6 } as { id: number } | null,
  taxonomy: { data: undefined, error: null } as { data: unknown; error: Error | null },
  facets: { counts: undefined, error: null, isPlaceholderData: false } as {
    counts: Map<string, number> | undefined;
    error: Error | null;
    isPlaceholderData: boolean;
  },
  arrivals: { albums: [], isPending: false, error: null } as {
    albums: { release_id: string; friend_id: number; genres?: string[]; styles?: string[] }[];
    isPending: boolean;
    error: Error | null;
  },
  useTrackGenreFacets: vi.fn(),
  useRecentAlbumsQuery: vi.fn(),
}));
vi.mock("@/providers/UsernameProvider", () => ({ useUsername: () => ({ friend: mocks.friend }) }));
vi.mock("@/hooks/useGenreTaxonomyQuery", () => ({ useGenreTaxonomyQuery: () => mocks.taxonomy }));
vi.mock("@/hooks/useTrackGenreFacets", () => ({
  useTrackGenreFacets: (params: unknown) => {
    mocks.useTrackGenreFacets(params);
    return mocks.facets;
  },
}));
vi.mock("@/hooks/useRecentAlbumsQuery", () => ({
  useRecentAlbumsQuery: (id: unknown) => {
    mocks.useRecentAlbumsQuery(id);
    return mocks.arrivals;
  },
}));
vi.mock("@/components/AlbumResult", () => ({
  default: ({ albumRef, layout }: { albumRef: { release_id: string }; layout: string }) => (
    <div data-testid="arrival" data-layout={layout}>
      {albumRef.release_id}
    </div>
  ),
}));
import GenresPage from "./page";

const node = (id: string, name: string, children: unknown[] = []) => ({
  id,
  name,
  slug: id,
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children,
});
const tree = [
  node("rock", "Rock"),
  node("latin", "Latin", [node("cumbia", "Cumbia"), node("bolero", "Bolero")]),
];

describe("genres discovery page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.friend = { id: 6 };
    mocks.taxonomy = { data: tree, error: null };
    mocks.facets = {
      counts: new Map([
        ["latin", 30],
        ["cumbia", 30],
        ["rock", 10],
      ]),
      error: null,
      isPlaceholderData: false,
    };
    mocks.arrivals = { albums: [], isPending: false, error: null };
  });

  it("scopes counts and arrivals to the current collection and waits for a selection", () => {
    const { rerender } = renderWithProviders(<GenresPage />);
    expect(mocks.useTrackGenreFacets).toHaveBeenLastCalledWith({
      q: "",
      filter: "friend_id = 6",
      enabled: true,
    });
    expect(mocks.useRecentAlbumsQuery).toHaveBeenLastCalledWith(6);
    mocks.friend = null;
    mocks.facets.counts = undefined;
    rerender(<GenresPage />);
    expect(mocks.useTrackGenreFacets).toHaveBeenLastCalledWith({
      q: "",
      filter: undefined,
      enabled: false,
    });
    expect(mocks.useRecentAlbumsQuery).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByTestId("genres-loading")).toBeTruthy();
  });

  it("uses proportional parent counts and links the legend to genre pages", () => {
    renderWithProviders(<GenresPage />);
    const legend = within(screen.getByRole("list", { name: "Genre mix" }));
    expect(legend.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Latin30",
      "Rock10",
    ]);
    expect(legend.getByRole("link", { name: "Latin 30" }).getAttribute("href")).toBe(
      "/genres/latin",
    );
    expect(
      screen.getAllByTestId("genre-mix-segment").map((bar) => getComputedStyle(bar).width),
    ).toEqual(["75%", "25%"]);
    expect(screen.queryByRole("list", { name: "Genre taxonomy" })).toBeNull();
    expect(screen.queryByText("Show genres with no tracks")).toBeNull();
    const crate = within(screen.getByRole("article", { name: "Latin crate" }));
    expect(crate.getByRole("link", { name: "Cumbia 30" }).getAttribute("href")).toBe(
      "/genres/cumbia",
    );
    expect(crate.queryByText("Bolero")).toBeNull();
  });

  it("includes every populated top-level genre in the mix and crates", () => {
    mocks.taxonomy.data = Array.from({ length: 7 }, (_, i) => node(`root${i}`, `Root ${i}`));
    mocks.facets.counts = new Map(Array.from({ length: 7 }, (_, i) => [`root${i}`, i + 1]));
    renderWithProviders(<GenresPage />);
    expect(
      within(screen.getByRole("list", { name: "Genre mix" })).getAllByRole("link"),
    ).toHaveLength(7);
    expect(screen.getAllByRole("article")).toHaveLength(7);
  });

  it("opens a full crate and keeps empty genres behind its checkbox", async () => {
    const { user } = renderWithProviders(<GenresPage />);
    await user.click(screen.getByRole("button", { name: "All latin subgenres →" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Latin subgenres" }));
    expect(dialog.getByRole("link", { name: "Cumbia 30" })).toBeTruthy();
    expect(dialog.queryByText("Bolero")).toBeNull();
    await user.click(dialog.getByText("Show genres with no tracks"));
    expect(dialog.getByRole("link", { name: "Bolero 0" })).toBeTruthy();
    await user.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "All rock subgenres →" }));
    expect(await screen.findByText("No subgenres to show.")).toBeTruthy();
  });

  it("searches across the taxonomy including empty genres, and clears back to discovery", async () => {
    const { user } = renderWithProviders(<GenresPage />);
    const search = screen.getByRole("searchbox", { name: "Find a genre" });
    await user.type(search, "boler");
    const results = within(screen.getByRole("list", { name: "Matching genres" }));
    expect(results.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Latin30",
      "Bolero0",
    ]);
    expect(screen.queryByRole("article")).toBeNull();
    await user.type(search, "xyz");
    expect(screen.getByText("No genres match.")).toBeTruthy();
    await user.clear(search);
    expect(screen.getByRole("article", { name: "Latin crate" })).toBeTruthy();
  });

  it("shows the five largest descendants, with deeper genres in the full list", async () => {
    mocks.taxonomy.data = [
      node(
        "rock",
        "Rock",
        Array.from({ length: 6 }, (_, i) =>
          node(`child${i}`, `Child ${i}`, i === 0 ? [node("deep", "Deep")] : []),
        ),
      ),
    ];
    mocks.facets.counts = new Map([
      ["rock", 70],
      ["deep", 8],
      ...Array.from({ length: 6 }, (_, i): [string, number] => [`child${i}`, 10 - i]),
    ]);
    const { user } = renderWithProviders(<GenresPage />);
    const crate = within(screen.getByRole("article", { name: "Rock crate" }));
    expect(crate.getAllByRole("listitem")).toHaveLength(5);
    expect(crate.queryByText("Child 5")).toBeNull();
    await user.click(crate.getByRole("button"));
    expect(within(await screen.findByRole("dialog")).getByText("Child 5")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("Deep")).toBeTruthy();
  });

  it("does not keep previous collection counts in an open crate", async () => {
    const { user, rerender } = renderWithProviders(<GenresPage />);
    await user.click(screen.getByRole("button", { name: "All latin subgenres →" }));
    await screen.findByRole("dialog", { name: "Latin subgenres" });
    mocks.facets.isPlaceholderData = true;
    rerender(<GenresPage />);
    expect(screen.getByTestId("genres-loading")).toBeTruthy();
    const dialog = within(screen.getByRole("dialog", { name: "Genre subgenres" }));
    expect(dialog.queryByText("Cumbia")).toBeNull();
  });

  it("shows arrivals with a summary counted once per album and parent", () => {
    mocks.arrivals.albums = [
      { release_id: "one", friend_id: 6, genres: ["Latin"], styles: ["Cumbia"] },
      { release_id: "two", friend_id: 6, genres: ["Latin", "Rock"] },
    ];
    renderWithProviders(<GenresPage />);
    expect(screen.getByText("Latin +2 · Rock +1")).toBeTruthy();
    expect(screen.getByText("Last 2 albums brought in")).toBeTruthy();
    expect(screen.getAllByTestId("arrival").map((el) => el.textContent)).toEqual(["one", "two"]);
    expect(screen.getAllByTestId("arrival")[0].getAttribute("data-layout")).toBe("discovery");
  });

  it("handles an empty collection and albums without known genre tags", () => {
    mocks.facets.counts = new Map();
    const { rerender } = renderWithProviders(<GenresPage />);
    expect(screen.getByText("No genres in this collection yet.")).toBeTruthy();
    expect(screen.getByText("No albums in this collection yet.")).toBeTruthy();
    mocks.arrivals.albums = [{ release_id: "unknown", friend_id: 6 }];
    rerender(<GenresPage />);
    expect(screen.getByTestId("arrival").textContent).toBe("unknown");
  });

  it("shows loading and fetch errors without leaving a permanent skeleton", () => {
    mocks.taxonomy = { data: undefined, error: null };
    const { rerender } = renderWithProviders(<GenresPage />);
    expect(screen.getByTestId("genres-loading")).toBeTruthy();
    mocks.taxonomy.error = new Error("taxonomy offline");
    rerender(<GenresPage />);
    expect(screen.getByRole("alert").textContent).toContain("taxonomy offline");
    mocks.taxonomy = { data: tree, error: null };
    mocks.facets.error = new Error("counts offline");
    rerender(<GenresPage />);
    expect(screen.getByRole("alert").textContent).toContain("counts offline");
    mocks.facets.error = null;
    mocks.facets.isPlaceholderData = true;
    rerender(<GenresPage />);
    expect(screen.getByTestId("genres-loading")).toBeTruthy();
    mocks.facets.isPlaceholderData = false;
    mocks.arrivals.isPending = true;
    rerender(<GenresPage />);
    expect(screen.queryByTestId("arrival")).toBeNull();
    mocks.arrivals.isPending = false;
    mocks.arrivals.error = new Error("albums offline");
    rerender(<GenresPage />);
    expect(screen.getByRole("alert").textContent).toContain("albums offline");
  });
});
