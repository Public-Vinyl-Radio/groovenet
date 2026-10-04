import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const config = vi.hoisted(() => ({
  listEmbeddingModelSettings: vi.fn(),
  setServingModel: vi.fn(),
  setTargetModel: vi.fn(),
}));

vi.mock("@/lib/embeddings/config", () => config);

import { GET, PATCH } from "../route";

const ROW = {
  embedding_type: "identity",
  target_model: "text-embedding-3-small",
  target_dims: 1536,
  serving_model: "text-embedding-3-small",
  serving_dims: 1536,
  serving_template_version: 1,
};

function patch(body: unknown) {
  return PATCH(
    new Request("http://app/api/settings/embedding-model", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/settings/embedding-model", () => {
  it("lists every kind's settings", async () => {
    config.listEmbeddingModelSettings.mockResolvedValue([ROW]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([ROW]);
  });

  it("returns 500 when the settings can't be read", async () => {
    config.listEmbeddingModelSettings.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/settings/embedding-model", () => {
  it("moves the target model", async () => {
    config.setTargetModel.mockResolvedValue(ROW);

    const res = await patch({ embedding_type: "identity", field: "target", model: "m", dims: 768 });

    expect(res.status).toBe(200);
    expect(config.setTargetModel).toHaveBeenCalledWith("identity", "m", 768);
    expect(config.setServingModel).not.toHaveBeenCalled();
  });

  it("moves serving, keeping the template version when none is given", async () => {
    config.setServingModel.mockResolvedValue(ROW);

    await patch({ embedding_type: "audio_vibe", field: "serving", model: "m", dims: 1536 });

    expect(config.setServingModel).toHaveBeenCalledWith("audio_vibe", "m", 1536, undefined);
  });

  it("cuts serving over to a new template version (#407)", async () => {
    config.setServingModel.mockResolvedValue({ ...ROW, serving_template_version: 2 });

    const res = await patch({
      embedding_type: "identity",
      field: "serving",
      model: "text-embedding-3-small",
      dims: 1536,
      template_version: 2,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).serving_template_version).toBe(2);
    expect(config.setServingModel).toHaveBeenCalledWith(
      "identity",
      "text-embedding-3-small",
      1536,
      2
    );
  });

  it("rejects a template version on the target field", async () => {
    const res = await patch({
      embedding_type: "identity",
      field: "target",
      model: "m",
      dims: 1536,
      template_version: 2,
    });

    expect(res.status).toBe(400);
    expect(config.setTargetModel).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])("rejects template version %s", async (template_version) => {
    const res = await patch({
      embedding_type: "identity",
      field: "serving",
      model: "m",
      dims: 1536,
      template_version,
    });

    expect(res.status).toBe(400);
  });

  it("returns 500 when the update fails", async () => {
    config.setServingModel.mockRejectedValue(new Error("No embedding_model_settings row"));

    const res = await patch({ embedding_type: "identity", field: "serving", model: "m", dims: 1 });

    expect(res.status).toBe(500);
  });
});
