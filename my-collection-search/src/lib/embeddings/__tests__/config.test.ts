import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  findEmbeddingModelSettings,
  listEmbeddingModelSettings: listEmbeddingModelSettingsRepo,
  updateTargetModel,
  updateServingModel,
  createOpenAiEmbeddingProvider,
} = vi.hoisted(() => ({
  findEmbeddingModelSettings: vi.fn(),
  listEmbeddingModelSettings: vi.fn(),
  updateTargetModel: vi.fn(),
  updateServingModel: vi.fn(),
  createOpenAiEmbeddingProvider: vi.fn(),
}));

vi.mock("@/server/repositories/settingsRepository", () => ({
  settingsRepository: {
    findEmbeddingModelSettings,
    listEmbeddingModelSettings: listEmbeddingModelSettingsRepo,
    updateTargetModel,
    updateServingModel,
  },
}));

vi.mock("../openaiProvider", () => ({ createOpenAiEmbeddingProvider }));

import {
  getServingModel,
  getTargetModel,
  getTargetProvider,
  invalidateEmbeddingModelCache,
  listEmbeddingModelSettings,
  setServingModel,
  setTargetModel,
} from "../config";

const IDENTITY_ROW = {
  embedding_type: "identity" as const,
  target_model: "text-embedding-3-small",
  target_dims: 1536,
  serving_model: "text-embedding-3-small",
  serving_dims: 1536,
  serving_template_version: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
  invalidateEmbeddingModelCache();
  findEmbeddingModelSettings.mockResolvedValue(IDENTITY_ROW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getTargetProvider", () => {
  it("builds an OpenAI provider from the kind's target model/dims", async () => {
    const fakeProvider = { model: "text-embedding-3-small", dims: 1536, embed: vi.fn() };
    createOpenAiEmbeddingProvider.mockReturnValue(fakeProvider);

    const provider = await getTargetProvider("identity");

    expect(provider).toBe(fakeProvider);
    expect(createOpenAiEmbeddingProvider).toHaveBeenCalledWith("text-embedding-3-small", 1536);
  });

  it("throws when no settings row exists for the kind", async () => {
    findEmbeddingModelSettings.mockResolvedValue(null);

    await expect(getTargetProvider("identity")).rejects.toThrow(
      'No embedding_model_settings row for "identity"'
    );
  });

  it("caches settings so a second call within the TTL skips the repository", async () => {
    await getTargetProvider("identity");
    await getTargetProvider("identity");

    expect(findEmbeddingModelSettings).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the cache entry expires", async () => {
    vi.useFakeTimers();
    await getTargetProvider("identity");

    vi.advanceTimersByTime(60_001);
    await getTargetProvider("identity");

    expect(findEmbeddingModelSettings).toHaveBeenCalledTimes(2);
  });

  it("caches each kind independently", async () => {
    findEmbeddingModelSettings.mockImplementation(async (kind: string) => ({
      ...IDENTITY_ROW,
      embedding_type: kind,
    }));

    await getServingModel("identity");
    await getServingModel("audio_vibe");

    expect(findEmbeddingModelSettings).toHaveBeenCalledTimes(2);
    expect(findEmbeddingModelSettings).toHaveBeenCalledWith("identity");
    expect(findEmbeddingModelSettings).toHaveBeenCalledWith("audio_vibe");
  });
});

describe("getServingModel", () => {
  it("returns the kind's serving model, dims and template version", async () => {
    await expect(getServingModel("identity")).resolves.toStrictEqual({
      model: "text-embedding-3-small",
      dims: 1536,
      templateVersion: 2,
    });
  });
});

describe("setTargetModel", () => {
  it("updates the target model and invalidates the cache", async () => {
    const updated = { ...IDENTITY_ROW, target_model: "text-embedding-3-small", target_dims: 768 };
    updateTargetModel.mockResolvedValue(updated);

    await expect(setTargetModel("identity", "text-embedding-3-small", 768)).resolves.toEqual(
      updated
    );
    expect(updateTargetModel).toHaveBeenCalledWith("identity", "text-embedding-3-small", 768);

    // The cache was primed by the mocked update's return value being
    // invalidated, not reused — a subsequent read goes back to the repo.
    findEmbeddingModelSettings.mockResolvedValueOnce(updated);
    await getServingModel("identity");
    expect(findEmbeddingModelSettings).toHaveBeenCalledTimes(1);
  });

  it("throws when the kind has no settings row", async () => {
    updateTargetModel.mockResolvedValue(null);

    await expect(setTargetModel("identity", "m", 1)).rejects.toThrow(
      'No embedding_model_settings row for "identity"'
    );
  });
});

describe("getTargetModel", () => {
  it("returns the kind's target model and dims without building a provider", async () => {
    findEmbeddingModelSettings.mockResolvedValue({
      ...IDENTITY_ROW,
      target_model: "text-embedding-3-large",
      target_dims: 1536,
    });

    await expect(getTargetModel("identity")).resolves.toStrictEqual({
      model: "text-embedding-3-large",
      dims: 1536,
    });
    expect(createOpenAiEmbeddingProvider).not.toHaveBeenCalled();
  });
});

describe("setServingModel", () => {
  it("updates the serving model and invalidates the cache", async () => {
    const updated = { ...IDENTITY_ROW, serving_model: "text-embedding-3-small", serving_dims: 768 };
    updateServingModel.mockResolvedValue(updated);

    await expect(setServingModel("identity", "text-embedding-3-small", 768)).resolves.toEqual(
      updated
    );
    expect(updateServingModel).toHaveBeenCalledWith(
      "identity",
      "text-embedding-3-small",
      768,
      undefined
    );
  });

  it("passes a template version through for a template cutover (#407)", async () => {
    updateServingModel.mockResolvedValue({ ...IDENTITY_ROW, serving_template_version: 3 });

    await setServingModel("identity", "text-embedding-3-small", 1536, 3);

    expect(updateServingModel).toHaveBeenCalledWith("identity", "text-embedding-3-small", 1536, 3);
  });

  it("throws when the kind has no settings row", async () => {
    updateServingModel.mockResolvedValue(null);

    await expect(setServingModel("identity", "m", 1)).rejects.toThrow(
      'No embedding_model_settings row for "identity"'
    );
  });
});

describe("listEmbeddingModelSettings", () => {
  it("delegates to the repository", async () => {
    listEmbeddingModelSettingsRepo.mockResolvedValue([IDENTITY_ROW]);

    await expect(listEmbeddingModelSettings()).resolves.toEqual([IDENTITY_ROW]);
  });
});

describe("invalidateEmbeddingModelCache", () => {
  it("clears one kind without touching another", async () => {
    findEmbeddingModelSettings.mockImplementation(async (kind: string) => ({
      ...IDENTITY_ROW,
      embedding_type: kind,
    }));
    await getServingModel("identity");
    await getServingModel("audio_vibe");
    findEmbeddingModelSettings.mockClear();

    invalidateEmbeddingModelCache("identity");
    await getServingModel("identity");
    await getServingModel("audio_vibe");

    expect(findEmbeddingModelSettings).toHaveBeenCalledTimes(1);
    expect(findEmbeddingModelSettings).toHaveBeenCalledWith("identity");
  });

  it("clears every kind when called with no argument", async () => {
    await getServingModel("identity");
    findEmbeddingModelSettings.mockClear();

    invalidateEmbeddingModelCache();
    await getServingModel("identity");

    expect(findEmbeddingModelSettings).toHaveBeenCalledTimes(1);
  });
});
