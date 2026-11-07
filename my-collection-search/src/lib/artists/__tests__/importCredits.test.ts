import { describe, expect, it } from "vitest";
import { artistNames, importArtistCredits } from "../importCredits";

describe("importArtistCredits", () => {
  it("strips suffixes even when adjacent to the next word", () => {
    expect(artistNames("Charisma (12)Featuring Brenda Watts").name).toBe(
      "Charisma Featuring Brenda Watts",
    );
  });
  it.each([
    ["Strokes, The", "The Strokes", "Strokes, The"],
    ["Black Keys, The (2)", "The Black Keys", "Black Keys, The"],
    [
      "Loni Gamble Band, The Featuring Lisa Warrington",
      "The Loni Gamble Band Featuring Lisa Warrington",
      "Loni Gamble Band, The Featuring Lisa Warrington",
    ],
    [
      "Heptones, The / Jackie Mittoo",
      "The Heptones / Jackie Mittoo",
      "Heptones, The / Jackie Mittoo",
    ],
    [
      "Charisma (12) Featuring Brenda Watts (3)",
      "Charisma Featuring Brenda Watts",
      "Charisma Featuring Brenda Watts",
    ],
  ])("rebuilds %s", (raw, name, sort_name) => {
    expect(artistNames(raw)).toEqual({ name, sort_name });
  });

  it("keeps separate ids, joins and original spellings for Ruido Tovar", () => {
    const credits = importArtistCredits(
      [
        { id: 100, name: "Mexican Institute Of Sound", join: "," },
        { id: "200", name: "Meridian brothers" },
      ],
      "unused",
    );
    expect(credits).toEqual([
      expect.objectContaining({
        name: "Mexican Institute Of Sound",
        discogs_artist_id: "100",
        joiner: ",",
        position: 0,
        role: "primary",
        source: "discogs",
      }),
      expect.objectContaining({
        name: "Meridian brothers",
        discogs_artist_id: "200",
        joiner: null,
        position: 1,
        role: "primary",
        source: "discogs",
      }),
    ]);
  });

  it("uses join words for featured credits without reading track titles", () => {
    expect(
      importArtistCredits(
        [
          { id: 1, name: "Charisma (12)", join: "Featuring" },
          { id: 2, name: "Brenda Watts" },
        ],
        "unused",
      ),
    ).toEqual([
      expect.objectContaining({ name: "Charisma", credited_as: "Charisma (12)", role: "primary" }),
      expect.objectContaining({ role: "featured", position: 1 }),
    ]);
  });

  it.each(["Various", "Various Artists", "Unknown Artist"])("marks %s as a placeholder", (name) => {
    expect(importArtistCredits([{ id: 194, name }], "unused")[0]).toMatchObject({
      is_placeholder: true,
      discogs_artist_id: null,
      source: "discogs",
      name: name.startsWith("Various") ? "Various" : "Unknown Artist",
    });
  });

  it.each([
    "Earth, Wind & Fire",
    "Peter, Paul & Mary",
    "Fruko Y Sus Tesos",
    "Mexican Institute Of Sound, Meridian brothers",
  ])("keeps legacy %s intact and reviewable", (name) => {
    expect(importArtistCredits(undefined, name)).toEqual([
      expect.objectContaining({ name, source: "legacy", discogs_artist_id: null, position: 0 }),
    ]);
  });

  it("falls back for an empty artist list or missing name", () => {
    expect(importArtistCredits([], "Strokes, The")[0].name).toBe("The Strokes");
    expect(importArtistCredits([{ name: "" }], "unused")[0]).toMatchObject({
      name: "Unknown Artist",
      is_placeholder: true,
    });
  });
});

it("does not infer a feature when no join word is supplied", () => {
  expect(
    importArtistCredits(
      [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ],
      "unused",
    ).map((c) => c.role),
  ).toEqual(["primary", "primary"]);
});
