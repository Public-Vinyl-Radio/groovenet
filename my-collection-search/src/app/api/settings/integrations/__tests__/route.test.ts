import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));
vi.mock("@/server/auth/currentUser", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/embeddings/config", () => ({ listEmbeddingModelSettings: mocks.list }));
vi.mock("@/server/repositories/userRepository", () => ({ userRepository: {} }));

import { GET } from "../route";

const req = () => new Request("http://localhost/api/settings/integrations");

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "sk-super-secret");
  vi.stubEnv("YOUTUBE_API_KEY", "");
  mocks.list.mockResolvedValue([
    {
      embedding_type: "identity",
      target_model: "bge-small-en-v1.5",
      target_dims: 384,
      serving_model: "bge-small-en-v1.5",
      serving_dims: 384,
      serving_template_version: 1,
    },
  ]);
});

describe("GET /api/settings/integrations", () => {
  it("reports presence and models, never a key value, to the owner", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "o", is_owner: true });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const text = await res.text();
    expect(text).not.toContain("sk-super-secret");
    expect(JSON.parse(text)).toEqual({
      keys: { openai: { configured: true }, youtube: { configured: false } },
      embedding_models: [{ target_model: "bge-small-en-v1.5", serving_model: "bge-small-en-v1.5" }],
    });
  });

  it("refuses a non-owner profile and an unidentified caller", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "g", is_owner: false });
    expect((await GET(req())).status).toBe(403);
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("fails closed without leaking details", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "o", is_owner: true });
    mocks.list.mockRejectedValue(new Error("db password=hunter2"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("hunter2");
  });
});
