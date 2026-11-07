import { beforeEach, describe, expect, it, vi } from "vitest";
import { importArtistCredits } from "@/lib/artists/importCredits";

const { query, transaction } = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/serverDb", () => ({ withDbTransaction: transaction }));
import { artistImportRepository as repo } from "../artistImportRepository";

const credits = () => importArtistCredits([{ id: 123, name: "Strokes, The" }], "unused");

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation((fn) => fn({ query }));
  query.mockResolvedValue({ rows: [] });
});

describe("artist import persistence", () => {
  it("creates an identity, alias and ordered album credit", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // album lock
      .mockResolvedValueOnce({ rows: [] }) // manual
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // delete
      .mockResolvedValueOnce({ rows: [] }) // identity lookup
      .mockResolvedValueOnce({ rows: [] }) // slug is free
      .mockResolvedValueOnce({ rows: [{ id: 9 }] }); // create
    await repo.importAlbumCredits("release", 2, credits());
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), ["release", 2]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO artists"), [
      "The Strokes",
      "Strokes, The",
      "the-strokes",
      expect.stringMatching(/^artist-[a-f0-9]{64}$/),
      "123",
      false,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO artist_aliases"), [
      9,
      "Strokes, The",
      "strokes",
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO album_artists"), [
      5,
      9,
      "primary",
      0,
      "Strokes, The",
      null,
      "discogs",
    ]);
  });

  it("reuses an identity and upgrades an unnumbered alias, without renaming it", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] });
    await repo.importTrackCredits("track", 3, credits());
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE artists SET discogs_artist_id"),
      [9, "123"],
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO artists"),
      expect.anything(),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_artists"), [
      "track",
      3,
      9,
      "primary",
      0,
      "Strokes, The",
      null,
      "discogs",
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("source IN ('discogs', 'legacy')"), [
      "track",
      3,
    ]);
  });

  it.each(["Various", "Unknown Artist", "Earth, Wind & Fire"])(
    "reuses %s without assigning a Discogs id",
    async (name) => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 9 }] });
      await repo.importTrackCredits("track", 3, importArtistCredits(undefined, name));
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE artists"),
        expect.anything(),
      );
      expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_artists"), [
        "track",
        3,
        9,
        "primary",
        0,
        name,
        null,
        "legacy",
      ]);
    },
  );

  it("keeps a manual merge intact without resolving or recreating source identities", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{}] });
    await repo.importAlbumCredits("release", 2, credits());
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("rejects a missing album", async () => {
    await expect(repo.importAlbumCredits("missing", 2, credits())).rejects.toThrow("missing album");
  });

  it("propagates credit write failures through the transaction", async () => {
    query.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(repo.importTrackCredits("track", 2, [])).rejects.toThrow("db unavailable");
  });

  it("can clear automatic credits without touching other sources", async () => {
    await repo.importTrackCredits("track", 3, []);
    expect(query).toHaveBeenCalledTimes(4);
  });
});

it("uses the resolved name as the alias key when the source credit was blank", async () => {
  query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 9 }] });
  await repo.importTrackCredits("track", 3, importArtistCredits([{ name: "" }], "unused"));
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO artist_aliases"), [
    9,
    "",
    "unknown artist",
  ]);
});

it("replays a reviewed split for a newly imported owner", async () => {
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("WITH RECURSIVE matched")) return { rows: [{ id: 9 }] };
    if (sql.startsWith("SELECT credit_override"))
      return {
        rows: [
          {
            credit_override: [
              { artist_id: 10, role: "primary", position: 0, credited_as: "Lead" },
              { artist_id: 11, role: "remixer", position: 2, credited_as: "Remix" },
            ],
          },
        ],
      };
    return { rows: [] };
  });
  await repo.importTrackCredits("new", 3, credits());
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_artists"), [
    "new",
    3,
    10,
    "primary",
    0,
    "Lead",
    null,
    "manual",
  ]);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_artists"), [
    "new",
    3,
    11,
    "remixer",
    2,
    "Remix",
    null,
    "manual",
  ]);
});
