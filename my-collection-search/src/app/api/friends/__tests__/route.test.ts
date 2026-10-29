import { beforeEach, describe, expect, it, vi } from "vitest";

const listFriends = vi.fn();
const addFriend = vi.fn();
const removeFriend = vi.fn();
vi.mock("@/server/services/friendService", () => ({
  friendService: {
    listFriends: (...a: unknown[]) => listFriends(...a),
    addFriend: (...a: unknown[]) => addFriend(...a),
    removeFriend: (...a: unknown[]) => removeFriend(...a),
  },
}));
const track = vi.fn();
vi.mock("@/lib/analytics/server", () => ({
  analytics: { track: (...a: unknown[]) => track(...a) },
}));

import { DELETE, GET, POST } from "../route";

const post = (body: string) =>
  POST(new Request("http://localhost/api/friends", { method: "POST", body }));
const remove = (query: string) =>
  DELETE(new Request(`http://localhost/api/friends${query}`, { method: "DELETE" }));

describe("/api/friends", () => {
  beforeEach(() => {
    listFriends.mockReset();
    addFriend.mockReset();
    removeFriend.mockReset();
    track.mockReset();
  });

  it("lists friends in the shared response shape", async () => {
    listFriends.mockResolvedValue([{ id: 2, username: "dj" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ id: 2, username: "dj" }] });
  });

  it("returns 500 when listing fails", async () => {
    listFriends.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });

  it("adds a friend and ignores unknown fields", async () => {
    const res = await post(JSON.stringify({ username: "dj", extra: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Friend 'dj' added." });
    expect(addFriend).toHaveBeenCalledWith("dj");
    expect(track).toHaveBeenCalledWith("friend_added", {}, expect.anything());
  });

  it.each([
    ["{}"],
    [JSON.stringify({ username: "" })],
    [JSON.stringify({ username: 7 })],
    ["null"],
  ])("rejects %s with the existing 400 message", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing or invalid username" });
    expect(addFriend).not.toHaveBeenCalled();
  });

  it("returns 500 when the body is not JSON", async () => {
    expect((await post("not json")).status).toBe(500);
  });

  it("streams removal progress", async () => {
    removeFriend.mockImplementation(async (_username: string, send: (line: string) => void) => {
      send("Deleted manifest");
    });
    const res = await remove("?username=dj");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Deleted manifest\nDONE\n");
    expect(removeFriend).toHaveBeenCalledWith("dj", expect.any(Function));
  });

  it.each([[""], ["?username="]])("streams the invalid-username line for %j", async (query) => {
    const res = await remove(query);
    expect(await res.text()).toBe("Missing or invalid username\n");
    expect(removeFriend).not.toHaveBeenCalled();
  });

  it("streams the error when removal fails", async () => {
    removeFriend.mockRejectedValue(new Error("busy"));
    expect(await (await remove("?username=dj")).text()).toBe("Error: busy\n");
  });
});
