import { expect, it, vi } from "vitest";
const { proposal } = vi.hoisted(() => ({ proposal: vi.fn() }));
vi.mock("@/server/repositories/artistReviewRepository", async (original) => ({
  ...(await original<typeof import("@/server/repositories/artistReviewRepository")>()),
  artistReviewRepository: { splitProposal: proposal },
}));
import { ArtistReviewError } from "@/server/repositories/artistReviewRepository";
import { GET } from "./route";
const get = (id: string) =>
  GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
it("validates IDs and returns proposals", async () => {
  expect((await get("bad")).status).toBe(400);
  proposal.mockResolvedValueOnce({ credits: [] });
  expect(await (await get("1")).json()).toEqual({ credits: [] });
  expect(proposal).toHaveBeenCalledWith(1);
});
it("handles repository and unexpected errors", async () => {
  proposal.mockRejectedValueOnce(new ArtistReviewError("missing", 404));
  expect((await get("1")).status).toBe(404);
  vi.spyOn(console, "error").mockImplementation(() => {});
  proposal.mockRejectedValueOnce(new Error("secret"));
  expect(await (await get("1")).json()).toEqual({ error: "Artist split proposal failed" });
  vi.restoreAllMocks();
});
