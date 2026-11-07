import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());

vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import chalk from "chalk";
import { Command } from "commander";
import type { ArtistListResponse, ArtistPageResponse } from "@groovenet/client";
import { addArtistsCommands } from "./artists.js";
import {
  formatArtistAlbums,
  formatArtistList,
  formatArtistShow,
  runArtistList,
  runArtistShow,
} from "./artistsBrowse.js";

chalk.level = 0;

const list = (overrides: Partial<ArtistListResponse> = {}): ArtistListResponse => ({
  items: [
    {
      id: 4,
      name: "Los Mirlos",
      sort_name: "Mirlos, Los",
      slug: "los-mirlos",
      discogs_artist_id: null,
      is_placeholder: false,
      album_count: 2,
      track_count: 5,
    },
    {
      id: 9,
      name: "Various",
      sort_name: "Various",
      slug: "various",
      discogs_artist_id: null,
      is_placeholder: true,
      album_count: 1,
      track_count: 0,
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
  query: "",
  ...overrides,
});

const album = (release_id: string, extra: Record<string, unknown> = {}) => ({
  release_id,
  friend_id: 6,
  title: `Album ${release_id}`,
  artist: "Los Mirlos",
  year: "1972",
  play_count: 3,
  appears_on_tracks: 0,
  appears_on_positions: [],
  ...extra,
});

function page(overrides: Partial<ArtistPageResponse> = {}): ArtistPageResponse {
  return {
    artist: {
      id: 4,
      name: "Los Mirlos",
      sort_name: "Mirlos, Los",
      slug: "los-mirlos",
      discogs_artist_id: "321",
      is_placeholder: false,
    },
    aliases: ["Mirlos"],
    counts: { albums: 1, appears_on: 1, tracks: 2, spins: 1, year_min: 1972, year_max: 2001 },
    albums: [
      album("r1"),
      album("r2", { year: null, appears_on_tracks: 1, appears_on_positions: ["B3"] }),
    ],
    top_tracks: [
      {
        track_id: "t1",
        friend_id: 6,
        title: "Sonido Amazonico",
        artist: "Los Mirlos",
        album: "Album r1",
        position: "A1",
        play_count: 1,
      },
    ],
    top_tracks_by: "spins",
    genres: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Chicha",
        slug: "chicha",
        track_count: 2,
      },
    ],
    collaborators: [{ id: 5, name: "Juaneco Y Su Combo", slug: "juaneco", shared_credits: 2 }],
    ...overrides,
  } as ArtistPageResponse;
}

const strip = (lines: string[]) => lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");

describe("formatters", () => {
  it("lists artists with counts, flags placeholders and says the range", () => {
    const text = strip(formatArtistList(list()));
    expect(text).toMatch(/los-mirlos\W+Los Mirlos\W+2\W+5/);
    expect(text).toContain("Various (placeholder)");
    expect(text).toContain("1–2 of 2 artists");
    expect(strip(formatArtistList(list({ items: [list().items[0]], total: 1 })))).toContain(
      "of 1 artist",
    );
    expect(formatArtistList(list({ items: [], total: 0 }))).toEqual(["No artists found."]);
  });

  it("shows the header, genres, collaborators, albums and top tracks", () => {
    const text = strip(formatArtistShow(page()));
    expect(text).toContain("Los Mirlos  los-mirlos");
    expect(text).toContain("1 album, appears on 1, 2 tracks, 1 spin · 1972–2001");
    expect(text).toContain("Discogs artist 321");
    expect(text).toContain("Also credited as: Mirlos");
    expect(text).toContain("Genres: Chicha (2)");
    expect(text).toContain("With: Juaneco Y Su Combo (2)");
    expect(text).toMatch(/r2\W+Album r2\W+-\W+appears on B3/);
    expect(text).toContain("Top tracks — most played");
    expect(text).toMatch(/t1\W+Sonido Amazonico/);
  });

  it("keeps a sparse page short", () => {
    const text = strip(
      formatArtistShow(
        page({
          artist: { ...page().artist, discogs_artist_id: null },
          aliases: [],
          counts: { albums: 0, appears_on: 0, tracks: 0, spins: 0, year_min: 1990, year_max: 1990 },
          albums: [],
          top_tracks: [],
          top_tracks_by: "albums",
          genres: [],
          collaborators: [],
        }),
      ),
    );
    expect(text).toContain("0 albums, appears on 0, 0 tracks, 0 spins · 1990");
    expect(text).not.toMatch(/Genres|With:|Discogs|Also credited|Top tracks/);
    expect(text).toContain("No albums in this collection.");
  });

  it("orders top tracks by albums when nothing was played, and tolerates gaps", () => {
    const text = strip(
      formatArtistShow(
        page({
          counts: { ...page().counts, year_min: null, year_max: null },
          top_tracks_by: "albums",
          top_tracks: [
            { track_id: "t2", friend_id: 6, title: "X", artist: "Y", album: null, play_count: 0 },
          ],
        }),
      ),
    );
    expect(text).toContain("in album order");
    expect(text).not.toContain("·");
  });

  it("says appearances by count when positions are unknown", () => {
    const text = strip(
      formatArtistAlbums(
        page({ albums: [album("r3", { appears_on_tracks: 2, appears_on_positions: ["", ""] })] }),
      ),
    );
    expect(text).toContain("appears on 2 tracks");
  });

  it("says a placeholder has no page", () => {
    const text = strip(
      formatArtistShow(page({ artist: { ...page().artist, is_placeholder: true } })),
    );
    expect(text).toContain("placeholder credit");
    expect(text).not.toContain("Albums");
  });
});

describe("run functions", () => {
  const io = { log: vi.fn(), write: vi.fn() };
  beforeEach(() => {
    io.log.mockReset();
    io.write.mockReset();
    loadConfig.mockReturnValue({ default_friend_id: 6 });
  });

  it("lists with the default friend and only the flags given", async () => {
    const client = { searchArtists: vi.fn().mockResolvedValue(list()) };
    expect(await runArtistList(client, "", {}, io)).toBe(0);
    expect(client.searchArtists).toHaveBeenCalledWith({ friend_id: 6 });
    expect(io.log).toHaveBeenCalled();
    await runArtistList(
      client,
      "mirlos",
      { allFriends: true, placeholders: true, limit: 5, offset: 10, json: true },
      io,
    );
    expect(client.searchArtists).toHaveBeenLastCalledWith({
      q: "mirlos",
      include_placeholders: true,
      limit: 5,
      offset: 10,
    });
    expect(io.write).toHaveBeenCalledWith(JSON.stringify(list(), null, 2) + "\n");
  });

  it("shows an artist, its albums, and JSON for each", async () => {
    const client = { getArtist: vi.fn().mockResolvedValue(page()) };
    await runArtistShow(client, "los-mirlos", { friendId: 3 }, "show", io);
    expect(client.getArtist).toHaveBeenCalledWith("los-mirlos", 3);
    expect(strip(io.log.mock.calls.map((c) => c[0]))).toContain("Top tracks");

    io.log.mockReset();
    await runArtistShow(client, "los-mirlos", {}, "albums", io);
    const albums = strip(io.log.mock.calls.map((c) => c[0]));
    expect(albums).toContain("Album r1");
    expect(albums).not.toContain("Top tracks");

    await runArtistShow(client, "los-mirlos", { json: true }, "albums", io);
    expect(io.write).toHaveBeenLastCalledWith(JSON.stringify(page().albums, null, 2) + "\n");
    await runArtistShow(client, "los-mirlos", { json: true }, "show", io);
    expect(io.write).toHaveBeenLastCalledWith(JSON.stringify(page(), null, 2) + "\n");
  });

  it("prints only the header for a placeholder's albums", async () => {
    const placeholder = page({ artist: { ...page().artist, is_placeholder: true } });
    const client = { getArtist: vi.fn().mockResolvedValue(placeholder) };
    await runArtistShow(client, "various", {}, "albums", io);
    const text = strip(io.log.mock.calls.map((c) => c[0]));
    expect(text).toContain("placeholder credit");
    expect(text).not.toContain("Album r1");
  });
});

describe("artists list | show | albums commands", () => {
  const methods = { searchArtists: vi.fn(), getArtist: vi.fn() };

  beforeEach(() => {
    methods.searchArtists.mockReset().mockResolvedValue(list());
    methods.getArtist.mockReset().mockResolvedValue(page());
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockImplementation(function () {
      return methods;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function parse(...args: string[]) {
    const program = new Command();
    program.exitOverride();
    addArtistsCommands(program);
    return program.parseAsync(["node", "groovenet", "artists", ...args]);
  }

  it("list forwards the query and flags", async () => {
    await parse("list", "mir", "--friend-id", "3", "--limit", "5", "--placeholders");
    expect(methods.searchArtists).toHaveBeenCalledWith({
      q: "mir",
      friend_id: 3,
      include_placeholders: true,
      limit: 5,
      offset: 0,
    });
    expect(process.exitCode).toBe(0);
  });

  it("list rejects a zero limit", async () => {
    await expect(parse("list", "--limit", "0")).rejects.toThrow();
    expect(methods.searchArtists).not.toHaveBeenCalled();
  });

  it("show and albums read the artist", async () => {
    await parse("show", "los-mirlos", "--all-friends");
    expect(methods.getArtist).toHaveBeenCalledWith("los-mirlos", undefined);
    await parse("albums", "los-mirlos", "--friend-id", "2", "--json");
    expect(methods.getArtist).toHaveBeenLastCalledWith("los-mirlos", 2);
  });

  it("reports API errors and exits 1", async () => {
    methods.getArtist.mockRejectedValue(new Error("API Error: Unknown artist: nope"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await parse("show", "nope");
    expect(exit).toHaveBeenCalledWith(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("Unknown artist"));
    methods.searchArtists.mockRejectedValue("boom");
    await parse("list");
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
