import { normaliseArtistName } from "@/lib/artists/normalization";
import { describe, expect, it } from "vitest";
import { importArtistCredits } from "@/lib/artists/importCredits";
import {
  albumArtistBaseline,
  ArtistResolutionTally,
  needsReview,
  ReviewQueue,
} from "@/lib/artists/reconcile";

describe("needsReview", () => {
  it.each([
    "Earth, Wind & Fire",
    "Mexican Institute Of Sound, Meridian brothers",
    "Heptones, The / Jackie Mittoo",
    "Loni Gamble Band, The Featuring Lisa Warrington",
    "Charisma (12) Featuring Brenda Watts",
    "Dego & Kaidi Tatham",
    "Dego And Kaidi Tatham",
    "Artist feat. Guest",
    "Artist Ft. Guest",
    "Fela Kuti with Africa 70",
  ])("queues %s", (value) => expect(needsReview(value)).toBe(true));

  it.each([
    "Strokes, The",
    "The Black Keys",
    "Fruko Y Sus Tesos",
    "Pastor López Y Su Combo",
    "Artist X Artist",
    "Various",
    "Various Artists",
    "Unknown Artist",
    "Andromeda",
    "Featurette",
  ])("does not queue %s", (value) => expect(needsReview(value)).toBe(false));
});

describe("albumArtistBaseline", () => {
  it("counts strings, spelling groups, inversions and placeholders", () => {
    expect(
      albumArtistBaseline([
        "Mac DeMarco",
        "Mac Demarco",
        "Mac DeMarco",
        "Strokes, The",
        "Strokes, The",
        "Heptones, The / Jackie Mittoo",
        "Dego & Kaidi Tatham",
        "Dego And Kaidi Tatham",
        "Various",
        "Various Artists",
        "Unknown Artist",
      ]),
    ).toEqual({
      albums: 11,
      distinct_strings: 9,
      spelling_groups: 2,
      inversions: 1,
      various: 2,
      unknown_artist: 1,
    });
  });

  it("is all zeros for no albums", () => {
    expect(albumArtistBaseline([])).toEqual({
      albums: 0,
      distinct_strings: 0,
      spelling_groups: 0,
      inversions: 0,
      various: 0,
      unknown_artist: 0,
    });
  });
});

describe("ReviewQueue", () => {
  it("groups by exact string, most used first, and ignores single acts", () => {
    const queue = new ReviewQueue();
    queue.add("A & B", "album");
    queue.add("A & B", "track", 3);
    queue.add("C / D", "album", 4);
    queue.add("B, C", "track", 4);
    queue.add("Strokes, The", "album");
    expect(queue.list()).toEqual([
      { credited_as: "A & B", albums: 1, tracks: 3 },
      { credited_as: "B, C", albums: 0, tracks: 4 },
      { credited_as: "C / D", albums: 4, tracks: 0 },
    ]);
  });
});

describe("ArtistResolutionTally", () => {
  const discogs = (id: number, name: string) => importArtistCredits([{ id, name }], name)[0];
  const legacy = (name: string) => importArtistCredits(undefined, name)[0];

  it("matches by Discogs id, then name or alias, else creates once", () => {
    const tally = new ArtistResolutionTally({
      discogsIds: ["1"],
      aliases: [
        { alias_normalized: "known", has_discogs_id: false },
        { alias_normalized: "taken", has_discogs_id: true },
      ],
    });
    tally.add(discogs(1, "Anything")); // id
    tally.add(legacy("Known")); // alias
    tally.add(discogs(2, "Known")); // alias without an id: fills it
    tally.add(discogs(2, "Other")); // now known by id
    tally.add(discogs(3, "Taken")); // same spelling, another identity: new
    tally.add(legacy("Strokes, The")); // new
    tally.add(legacy("The Strokes")); // same normalised name
    tally.add(legacy("Various Artists")); // new placeholder
    tally.add(legacy("Various")); // the same placeholder
    expect(tally.counts).toEqual({ matched_by_discogs_id: 2, matched_by_name: 4, created: 3 });
  });

  it("keys a blank credit by its placeholder name", () => {
    const tally = new ArtistResolutionTally({ discogsIds: [], aliases: [] });
    tally.add(legacy(""));
    tally.add(legacy("Unknown Artist"));
    expect(tally.counts).toEqual({ matched_by_discogs_id: 0, matched_by_name: 1, created: 1 });
  });
});

it("does not requeue a reviewed spelling on future backfills", () => {
  const queue = new ReviewQueue(new Set([normaliseArtistName("A & B")]));
  queue.add("A and B", "album");
  queue.add("C & D", "track");
  expect(queue.list()).toEqual([{ credited_as: "C & D", albums: 0, tracks: 1 }]);
});
