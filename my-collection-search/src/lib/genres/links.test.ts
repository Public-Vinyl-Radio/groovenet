import { describe, expect, it } from "vitest";
import type { GenreTreeNode } from "@/api-contract/schemas";
import {
  buildGenreLookup,
  discogsGenreBadges,
  genreSearchHref,
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
