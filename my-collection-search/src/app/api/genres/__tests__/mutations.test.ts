import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ createGenre: vi.fn(), updateGenre: vi.fn(), addGenreAlias: vi.fn(), mergeGenres: vi.fn() }));
vi.mock("@/server/services/genreAdminService", async (original) => ({
  ...await original<typeof import("@/server/services/genreAdminService")>(), ...mocks,
}));
import { GenreAdminError } from "@/server/services/genreAdminService";
import { POST as create } from "../route";
import { PATCH as update } from "../[id]/route";
import { POST as alias } from "../[id]/aliases/route";
import { POST as merge } from "../[id]/merge/route";

const id = "6df3a956-f05c-4ef2-a218-0813d0ca7c47";
const target = "98c890e0-5b9e-42b1-b1b9-ebd202709a87";
const genre = { id, name: "Dub", slug: "dub", parent_id: target, source: "custom" };
const req = (body: unknown) => new NextRequest("http://localhost/api/genres", { method: "POST", body: JSON.stringify(body) });
const ctx = (value = id) => ({ params: Promise.resolve({ id: value }) });
const operations = [
  { name: "create", call: (r: NextRequest) => create(r), mock: mocks.createGenre, body: { name: "Dub", parent_id: target }, args: ["Dub", target], status: 201, result: genre, serviceResult: genre },
  { name: "update", call: (r: NextRequest, value = id) => update(r, ctx(value)), mock: mocks.updateGenre, body: { name: "Dub", parent_id: null }, args: [id, { name: "Dub", parent_id: null }], status: 200, result: genre, serviceResult: genre },
  { name: "alias", call: (r: NextRequest, value = id) => alias(r, ctx(value)), mock: mocks.addGenreAlias, body: { alias: "Dub music" }, args: [id, "Dub music"], status: 201, result: { success: true }, serviceResult: undefined },
  { name: "merge", call: (r: NextRequest, value = id) => merge(r, ctx(value)), mock: mocks.mergeGenres, body: { target_id: target }, args: [id, target], status: 200, result: { success: true, merged_genre_id: id, survivor_genre_id: target }, serviceResult: undefined },
];
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });

for (const op of operations) {
  describe(op.name, () => {
    it("validates and returns the successful response", async () => {
      op.mock.mockResolvedValue(op.serviceResult);
      const response = await op.call(req(op.body));
      expect(response.status).toBe(op.status);
      expect(await response.json()).toEqual(op.result);
      expect(op.mock).toHaveBeenCalledWith(...op.args);
    });
    it.each([{}, null, [], { name: "", parent_id: "invalid", alias: "", target_id: "invalid" }])("rejects invalid payload %j with flattened details", async (body) => {
      const response = await op.call(req(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ details: { fieldErrors: expect.any(Object), formErrors: expect.any(Array) } });
      expect(op.mock).not.toHaveBeenCalled();
    });
    it("rejects malformed JSON", async () => {
      const response = await op.call(new NextRequest("http://localhost/api/genres", { method: "POST", body: "{" }));
      expect(response.status).toBe(400);
      expect(op.mock).not.toHaveBeenCalled();
    });
    if (op.name !== "create") it("rejects an invalid ID", async () => {
      const response = await op.call(req(op.body), "bad-id");
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ details: { fieldErrors: { id: expect.any(Array) } } });
      expect(op.mock).not.toHaveBeenCalled();
    });
    it.each([404, 409] as const)("maps known service errors to %s", async (status) => {
      op.mock.mockRejectedValue(new GenreAdminError("Known error", status));
      const response = await op.call(req(op.body));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Known error" });
    });
    it("returns a generic 500 for unexpected failure", async () => {
      op.mock.mockRejectedValue(new Error("secret database details"));
      const response = await op.call(req(op.body));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Failed to modify genre taxonomy" });
    });
    if (op.name === "create" || op.name === "update") it("validates the service response", async () => {
      op.mock.mockResolvedValue({ id: "bad" });
      expect((await op.call(req(op.body))).status).toBe(500);
    });
  });
}
