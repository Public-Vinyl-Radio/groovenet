import { describe, expect, it } from "vitest";
import { filterPlaylistsByOwner, ownerFilterOptions, playlistOwnerLabel } from "./playlistOwners";

const me = { id: "me", name: "Adam" };
const sam = { id: "sam", name: "Sam" };
const kim = { id: "kim", name: "Kim" };

describe("ownerFilterOptions", () => {
  it("offers nothing to a single-profile household", () => {
    expect(ownerFilterOptions([me], "me")).toEqual([]);
    expect(ownerFilterOptions([], null)).toEqual([]);
  });

  it("offers All, Mine, then each other profile", () => {
    expect(ownerFilterOptions([me, sam, kim], "me")).toEqual([
      { value: "all", label: "All" },
      { value: "mine", label: "Mine" },
      { value: "sam", label: "Sam" },
      { value: "kim", label: "Kim" },
    ]);
  });

  it("has no Mine before a profile is chosen", () => {
    expect(ownerFilterOptions([me, sam], null).map((o) => o.value)).toEqual(["all", "me", "sam"]);
  });
});

describe("filterPlaylistsByOwner", () => {
  const lists = [{ owner_id: "me" }, { owner_id: "sam" }, { owner_id: undefined }];
  it("keeps everything for All", () => {
    expect(filterPlaylistsByOwner(lists, "all", "me")).toEqual(lists);
  });
  it("keeps the viewer's for Mine and a profile's for its id", () => {
    expect(filterPlaylistsByOwner(lists, "mine", "me")).toEqual([{ owner_id: "me" }]);
    expect(filterPlaylistsByOwner(lists, "sam", "me")).toEqual([{ owner_id: "sam" }]);
  });
});

describe("playlistOwnerLabel", () => {
  const theirs = { owner_id: "sam", owner_name: "Sam", visibility: "household" as const };
  it("names the owner of someone else's household playlist", () => {
    expect(playlistOwnerLabel(theirs, "me", 2)).toEqual({ kind: "owner", label: "Sam" });
  });
  it("says Private for a private playlist", () => {
    expect(
      playlistOwnerLabel({ ...theirs, owner_id: "me", visibility: "private" }, "me", 2),
    ).toEqual({ kind: "private", label: "Private" });
  });
  it("says nothing for the viewer's own, a sole profile, or no owner", () => {
    expect(playlistOwnerLabel({ ...theirs, owner_id: "me" }, "me", 2)).toBeNull();
    expect(playlistOwnerLabel(theirs, "me", 1)).toBeNull();
    expect(playlistOwnerLabel({ visibility: "household" }, "me", 2)).toBeNull();
  });
});
