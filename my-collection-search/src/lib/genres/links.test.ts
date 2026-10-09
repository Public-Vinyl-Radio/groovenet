import { describe, expect, it } from "vitest";
import type { GenreTreeNode } from "@/api-contract/schemas";
import type { GenreOption } from "./options";
import {
  buildGenreLookup,
  discogsGenreBadges,
  genreSearchHref,
  matchGenresForPalette,
  primaryGenreBadges,
  trackGenreBadges,
} from "./links";

const node = (overrides: Partial<GenreTreeNode> & { name: string; slug: string }): GenreTreeNode => ({
  id: overrides.slug,
  parent_id: null,
  source: "discogs",
  track_count: 0,
  album_count: 0,
  children: [],
  ...overrides,
});

const tree = [
  node({
    name: "Latin",
    slug: "latin",
    children: [
      node({ name: "Cumbia", slug: "cumbia", parent_id: "latin", aliases: ["cumbia colombiana"] }),
      node({ name: "Bossa Nova", slug: "bossa-nova", parent_id: "latin", aliases: ["bossanova", "post-punk"] }),
    ],
  }),
  node({ name: "Post-Punk", slug: "post-punk" }),
];
const lookup = buildGenreLookup(tree);

describe("buildGenreLookup", () => {
  it("keys every genre, nested ones included, by its normalised name", () => {
    expect(lookup.get("latin")).toBe("latin");
    expect(lookup.get("cumbia")).toBe("cumbia");
  });

  it("resolves aliases to their genre", () => {
    expect(lookup.get("bossanova")).toBe("bossa-nova");
    expect(lookup.get("cumbia colombiana")).toBe("cumbia");
  });

  it("lets a canonical name win over another genre's alias, wherever it sits in the tree", () => {
    expect(lookup.get("post-punk")).toBe("post-punk");
  });

  it("is empty for an empty taxonomy", () => {
    expect(buildGenreLookup([]).size).toBe(0);
  });
});

describe("genreSearchHref", () => {
  it("opens track search at the root and album search under /albums", () => {
    expect(genreSearchHref("cumbia", "tracks")).toBe("/?genre=cumbia");
    expect(genreSearchHref("cumbia", "albums")).toBe("/albums?genre=cumbia");
  });

  it("encodes the slug", () => {
    expect(genreSearchHref("r&b", "tracks")).toBe("/?genre=r%26b");
  });
});

describe("discogsGenreBadges", () => {
  it("links values the taxonomy knows, by name or alias, and leaves the rest plain", () => {
    expect(discogsGenreBadges(["Latin", "Bossanova", "Unknown Style"], lookup)).toEqual([
      { label: "Latin", slug: "latin" },
      { label: "Bossanova", slug: "bossa-nova" },
      { label: "Unknown Style", slug: null },
    ]);
  });

  it("matches through the shared normalisation, so a non-breaking hyphen still links", () => {
    expect(discogsGenreBadges(["Post‑Punk"], lookup)).toEqual([{ label: "Post‑Punk", slug: "post-punk" }]);
  });

  it("de-duplicates and tolerates a missing field", () => {
    expect(discogsGenreBadges(["Latin", "latin"], lookup)).toHaveLength(1);
    expect(discogsGenreBadges(undefined, lookup)).toEqual([]);
  });
});

describe("matchGenresForPalette (#472)", () => {
  const option = (overrides: Partial<GenreOption> & { id: string; name: string; slug: string }): GenreOption => ({
    parent_id: null,
    parent_name: null,
    track_count: 0,
    ...overrides,
  });
  const options = [
    option({ id: "cumbia", name: "Cumbia", slug: "cumbia", parent_name: "Latin", track_count: 20 }),
    option({ id: "bossa-nova", name: "Bossa Nova", slug: "bossa-nova", parent_name: "Latin", track_count: 0 }),
    option({ id: "post-punk", name: "Post-Punk", slug: "post-punk", track_count: 5 }),
  ];

  it("ranks a prefix match above a substring match", () => {
    expect(matchGenresForPalette(lookup, options, "cumbia").map((o) => o.id)).toEqual(["cumbia"]);
  });

  it("finds a genre by its alias", () => {
    expect(matchGenresForPalette(lookup, options, "bossanova").map((o) => o.id)).toEqual(["bossa-nova"]);
  });

  it("treats spaced, hyphenated and condensed spellings as the same query", () => {
    expect(matchGenresForPalette(lookup, options, "post punk").map((o) => o.id)).toEqual(["post-punk"]);
    expect(matchGenresForPalette(lookup, options, "post-punk").map((o) => o.id)).toEqual(["post-punk"]);
    expect(matchGenresForPalette(lookup, options, "postpunk").map((o) => o.id)).toEqual(["post-punk"]);
  });

  it("hides a genre with no tracks once something else matches", () => {
    const rockTree = [
      node({ name: "Afrobeat", slug: "afrobeat", aliases: ["afro"] }),
      node({ name: "Afro-Pop", slug: "afro-pop", aliases: ["afro"] }),
    ];
    const rockLookup = buildGenreLookup(rockTree);
    const rockOptions = [
      option({ id: "afrobeat", name: "Afrobeat", slug: "afrobeat", track_count: 12 }),
      option({ id: "afro-pop", name: "Afro-Pop", slug: "afro-pop", track_count: 0 }),
    ];
    expect(matchGenresForPalette(rockLookup, rockOptions, "afro").map((o) => o.id)).toEqual(["afrobeat"]);
  });

  it("shows a genre with no tracks when it's the only match", () => {
    const onlyEmpty = [option({ id: "bossa-nova", name: "Bossa Nova", slug: "bossa-nova", track_count: 0 })];
    expect(matchGenresForPalette(lookup, onlyEmpty, "bossa").map((o) => o.id)).toEqual(["bossa-nova"]);
  });

  it("is empty for a blank query", () => {
    expect(matchGenresForPalette(lookup, options, "   ")).toEqual([]);
  });

  it("limits the number of results, ranking by use", () => {
    expect(matchGenresForPalette(lookup, options, "o", 1).map((o) => o.id)).toEqual(["cumbia"]);
  });

  it("breaks a tie in rank and track count by name", () => {
    const tied = [
      option({ id: "b", name: "Bolero", slug: "bolero", track_count: 10 }),
      option({ id: "a", name: "Afrobeat", slug: "afrobeat", track_count: 10 }),
    ];
    const tiedTree = [node({ name: "Bolero", slug: "bolero" }), node({ name: "Afrobeat", slug: "afrobeat" })];
    expect(matchGenresForPalette(buildGenreLookup(tiedTree), tied, "o").map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("ignores a lookup match whose genre isn't in the given options", () => {
    expect(matchGenresForPalette(lookup, options.filter((o) => o.id !== "post-punk"), "post punk")).toEqual([]);
  });
});

describe("trackGenreBadges", () => {
  it("links a track's taxonomy genres by their own slugs, ignoring its raw tags", () => {
    expect(
      trackGenreBadges(
        {
          track_genres: [
            { name: "Cumbia", slug: "cumbia" },
            { name: "Cumbia", slug: "cumbia" },
            { name: "Chicha", slug: "chicha" },
          ],
          local_tags: "Psychedelic Cumbia, Uplifting",
        },
        new Map()
      )
    ).toEqual([
      { label: "Cumbia", slug: "cumbia" },
      { label: "Chicha", slug: "chicha" },
    ]);
  });

  it("falls back to the split raw tags, linking only those the taxonomy already knows", () => {
    expect(trackGenreBadges({ track_genres: [], local_tags: "Cumbia · Feminist Anthem" }, lookup)).toEqual([
      { label: "Cumbia", slug: "cumbia" },
      { label: "Feminist Anthem", slug: null },
    ]);
    expect(trackGenreBadges({ local_tags: "{}" }, lookup)).toEqual([]);
  });
});

describe("primaryGenreBadges", () => {
  it("prefers the track's DJ genres, kind 'track'", () => {
    expect(
      primaryGenreBadges(
        { track_genres: [{ name: "Cumbia", slug: "cumbia" }], styles: ["Latin"] },
        lookup
      )
    ).toEqual({ items: [{ label: "Cumbia", slug: "cumbia" }], kind: "track" });
  });

  it("falls back to raw local_tags, still kind 'track', ahead of Discogs styles", () => {
    expect(
      primaryGenreBadges({ track_genres: [], local_tags: "Cumbia", styles: ["Latin"] }, lookup)
    ).toEqual({ items: [{ label: "Cumbia", slug: "cumbia" }], kind: "track" });
  });

  it("falls back to the album's Discogs styles, kind 'discogs-style', when the track has none", () => {
    expect(
      primaryGenreBadges({ track_genres: [], local_tags: "", styles: ["Bossa Nova"] }, lookup)
    ).toEqual({ items: [{ label: "Bossa Nova", slug: "bossa-nova" }], kind: "discogs-style" });
  });

  it("is empty when the track has neither DJ genres nor Discogs styles", () => {
    expect(primaryGenreBadges({ track_genres: [], local_tags: "" }, lookup)).toEqual({
      items: [],
      kind: "discogs-style",
    });
  });
});
