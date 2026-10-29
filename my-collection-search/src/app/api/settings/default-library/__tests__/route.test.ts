import { beforeEach, describe, expect, it, vi } from "vitest";

const getDefaultLibrary = vi.fn();
const updateDefaultLibrary = vi.fn();
vi.mock("@/server/services/settingsService", () => ({
  settingsService: {
    getDefaultLibrary: (...a: unknown[]) => getDefaultLibrary(...a),
    updateDefaultLibrary: (...a: unknown[]) => updateDefaultLibrary(...a),
  },
}));

import { GET, PUT } from "../route";

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/settings/default-library", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );

const pgError = (message: string, code?: string) => Object.assign(new Error(message), { code });

describe("/api/settings/default-library", () => {
  beforeEach(() => {
    getDefaultLibrary.mockReset();
    updateDefaultLibrary.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns an unset default library", async () => {
    getDefaultLibrary.mockResolvedValue({ friend_id: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ friend_id: null });
  });

  it("reports a missing table and other read failures", async () => {
    getDefaultLibrary.mockRejectedValue(pgError("relation missing", "42P01"));
    const missing = await GET();
    expect(missing.status).toBe(500);
    expect((await missing.json()).error).toMatch(/table is missing/);

    getDefaultLibrary.mockRejectedValue(pgError("boom"));
    expect(await (await GET()).json()).toEqual({
      error: "Failed to load default library settings",
    });
  });

  it.each([[{ friend_id: 3 }], [{ friend_id: "3" }]])(
    "updates the default library from %j",
    async (body) => {
      updateDefaultLibrary.mockResolvedValue({ friend_id: 3 });
      const res = await put(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ friend_id: 3 });
      expect(updateDefaultLibrary).toHaveBeenCalledWith(3);
    },
  );

  it.each([[{}], [{ friend_id: 0 }], [{ friend_id: "x" }], [{ friend_id: 2.5 }], [null]])(
    "rejects %j with the existing 400 message",
    async (body) => {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "friend_id is required" });
      expect(updateDefaultLibrary).not.toHaveBeenCalled();
    },
  );

  it("maps an unknown library to 404 and a missing table to 500", async () => {
    updateDefaultLibrary.mockRejectedValue(pgError("Library 9 does not exist"));
    const notFound = await put({ friend_id: 9 });
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({ error: "Library 9 does not exist" });

    updateDefaultLibrary.mockRejectedValue(pgError("relation missing", "42P01"));
    expect((await put({ friend_id: 9 })).status).toBe(500);

    updateDefaultLibrary.mockRejectedValue(pgError("boom"));
    expect(await (await put({ friend_id: 9 })).json()).toEqual({
      error: "Failed to update default library settings",
    });
  });
});
