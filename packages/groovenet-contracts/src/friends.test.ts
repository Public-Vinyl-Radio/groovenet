import { describe, expect, it } from "vitest";
import {
  defaultLibrarySettingsSchema,
  defaultLibrarySettingsUpdateResponseSchema,
  defaultLibrarySettingsUpdateSchema,
  friendCreateResponseSchema,
  friendCreateSchema,
  friendJsonSchemas,
  friendListResponseSchema,
} from "./friends.js";

describe("friend and library settings contracts", () => {
  it("validates the friend list", () => {
    expect(
      friendListResponseSchema.parse({ results: [{ id: 1, username: "saegey" }] }).results,
    ).toEqual([{ id: 1, username: "saegey" }]);
    expect(
      friendListResponseSchema.safeParse({ results: [{ id: "1", username: "saegey" }] }).success,
    ).toBe(false);
  });

  it("requires a non-empty username to add a friend and strips unknown fields", () => {
    expect(friendCreateSchema.parse({ username: "dj", extra: true })).toEqual({ username: "dj" });
    expect(friendCreateSchema.safeParse({ username: "" }).success).toBe(false);
    expect(friendCreateSchema.safeParse({ username: 3 }).success).toBe(false);
    expect(friendCreateSchema.safeParse(null).success).toBe(false);
    expect(friendCreateResponseSchema.parse({ message: "Friend 'dj' added." }).message).toBe(
      "Friend 'dj' added.",
    );
  });

  it("allows an unset default library but requires one to update it", () => {
    expect(defaultLibrarySettingsSchema.parse({ friend_id: null }).friend_id).toBeNull();
    expect(defaultLibrarySettingsUpdateSchema.safeParse({ friend_id: 2 }).success).toBe(true);
    expect(defaultLibrarySettingsUpdateSchema.safeParse({ friend_id: null }).success).toBe(false);
    expect(defaultLibrarySettingsUpdateSchema.safeParse({ friend_id: 2.5 }).success).toBe(false);
    expect(defaultLibrarySettingsUpdateResponseSchema.safeParse({ friend_id: null }).success).toBe(
      false,
    );
  });

  it("publishes request bodies without rejecting unknown fields", () => {
    expect(friendJsonSchemas.FriendCreate.required).toEqual(["username"]);
    expect(friendJsonSchemas.FriendCreate.additionalProperties).toBeUndefined();
    expect(friendJsonSchemas.DefaultLibrarySettingsUpdate.additionalProperties).toBeUndefined();
    expect(friendJsonSchemas.Friend.additionalProperties).toBe(false);
    expect(friendJsonSchemas.DefaultLibrarySettings.required).toEqual(["friend_id"]);
  });
});
