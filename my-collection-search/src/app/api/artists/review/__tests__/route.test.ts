import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { list, decide, evidence } = vi.hoisted(() => ({
  list: vi.fn(),
  decide: vi.fn(),
  evidence: vi.fn(),
}));
vi.mock("@/server/repositories/artistReviewRepository", async (original) => ({
  ...(await original<typeof import("@/server/repositories/artistReviewRepository")>()),
  artistReviewRepository: { list, decide },
}));
vi.mock("@/server/services/artistReviewEvidence", () => ({ artistReviewEvidence: evidence }));
import { ArtistReviewError } from "@/server/repositories/artistReviewRepository";
import { GET, POST } from "../route";
const decision = { action: "accept", artist_id: 1 };
const item = {
  id: 1,
  name: "A",
  sort_name: "A",
  reviewed: false,
  is_placeholder: false,
  aliases: [],
  albums: [],
  tracks: [],
  merges: [],
};
const get = (query = "") => GET(new NextRequest(`http://localhost/api/artists/review${query}`));
const post = (body: string) =>
  POST(new NextRequest("http://localhost/api/artists/review", { method: "POST", body }));
beforeEach(() => {
  vi.resetAllMocks();
  list.mockResolvedValue({ items: [item] });
  decide.mockResolvedValue({ dry_run: false, decision });
});
it("lists the queue, enriching source evidence only for a specific artist", async () => {
  expect(await (await get()).json()).toEqual({ items: [item] });
  expect(evidence).not.toHaveBeenCalled();
  expect((await get("?artist_id=1")).status).toBe(200);
  expect(evidence).toHaveBeenCalledWith(item);
});
it("validates queries and bodies", async () => {
  for (const q of ["?limit=0", "?offset=-1", "?artist_id=no"])
    expect((await get(q)).status).toBe(400);
  for (const b of ["{", "{}", JSON.stringify({ decision: { action: "accept", artist_id: -1 } })])
    expect((await post(b)).status).toBe(400);
});
it("submits decisions and dry runs", async () => {
  expect((await post(JSON.stringify({ decision }))).status).toBe(200);
  expect(decide).toHaveBeenLastCalledWith(decision, false);
  await post(JSON.stringify({ decision, dry_run: true }));
  expect(decide).toHaveBeenLastCalledWith(decision, true);
});
it.each([404, 409])("returns review error %s", async (status) => {
  decide.mockRejectedValue(new ArtistReviewError("conflict", status));
  expect((await post(JSON.stringify({ decision }))).status).toBe(status);
});
it("returns safe failures for either endpoint", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  list.mockRejectedValue(new Error("database secret"));
  decide.mockRejectedValue(new Error("database secret"));
  expect(await (await get()).json()).toEqual({ error: "Artist review failed" });
  expect((await post(JSON.stringify({ decision }))).status).toBe(500);
  vi.restoreAllMocks();
});
