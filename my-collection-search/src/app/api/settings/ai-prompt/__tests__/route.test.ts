import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const service = vi.hoisted(() => ({
  getAiPrompt: vi.fn(),
  updateAiPrompt: vi.fn(),
}));
vi.mock("@/server/services/settingsService", () => ({ settingsService: service }));

import { GET, PUT } from "../route";

const get = (query = "") => GET(new NextRequest(`http://localhost/api/settings/ai-prompt${query}`));
const put = (body: string) =>
  PUT(new NextRequest("http://localhost/api/settings/ai-prompt", { method: "PUT", body }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/settings/ai-prompt", () => {
  it("returns the prompt with its default", async () => {
    const result = { prompt: "mine", defaultPrompt: "default", isDefault: false };
    service.getAiPrompt.mockResolvedValue(result);

    const res = await get("?friend_id=4");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(service.getAiPrompt).toHaveBeenCalledWith(4);
  });

  it("serves the default prompt without a friend_id", async () => {
    service.getAiPrompt.mockResolvedValue({
      prompt: "default",
      defaultPrompt: "default",
      isDefault: true,
    });
    expect((await get()).status).toBe(200);
    expect(service.getAiPrompt).toHaveBeenCalledWith(undefined);
  });

  it("rejects a non-numeric friend_id", async () => {
    const res = await get("?friend_id=abc");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "friend_id must be a number" });
  });

  it("returns 500 when loading fails", async () => {
    service.getAiPrompt.mockRejectedValue(new Error("db down"));
    const res = await get("?friend_id=4");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to load AI prompt settings" });
  });
});

describe("PUT /api/settings/ai-prompt", () => {
  it("saves the prompt", async () => {
    service.updateAiPrompt.mockResolvedValue({ prompt: "mine", isDefault: false });

    const res = await put(JSON.stringify({ friend_id: 4, prompt: "mine" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prompt: "mine", isDefault: false });
    expect(service.updateAiPrompt).toHaveBeenCalledWith(4, "mine");
  });

  it("coerces a text friend_id and treats a missing prompt as empty", async () => {
    service.updateAiPrompt.mockResolvedValue({ prompt: "default", isDefault: true });

    expect((await put(JSON.stringify({ friend_id: "4" }))).status).toBe(200);
    expect(service.updateAiPrompt).toHaveBeenCalledWith(4, "");
  });

  it.each([{}, { friend_id: 0 }, { friend_id: "abc" }, { friend_id: 2.5 }])(
    "requires an integer friend_id: %j",
    async (body) => {
      const res = await put(JSON.stringify(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "friend_id is required" });
      expect(service.updateAiPrompt).not.toHaveBeenCalled();
    },
  );

  it("returns 500 when saving fails", async () => {
    service.updateAiPrompt.mockRejectedValue(new Error("db down"));
    const res = await put(JSON.stringify({ friend_id: 4, prompt: "x" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update AI prompt settings" });
  });
});
