import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: mockCreate };
  },
}));

// identity's target model is read from the DB in real life (#386); stub it
// to the pipeline's historical default and route through the real OpenAI
// provider so the `openai` mock above still captures the request.
vi.mock("@/lib/embeddings/config", async () => {
  const { createOpenAiEmbeddingProvider } = await import("@/lib/embeddings/openaiProvider");
  return {
    getTargetProvider: vi.fn(async () =>
      createOpenAiEmbeddingProvider("text-embedding-3-small", 1536)
    ),
  };
});

import {
  checkEmbeddingProvider,
  resetEmbeddingHealthCache,
} from "../embeddingHealthService";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.resetAllMocks();
  resetEmbeddingHealthCache();
  process.env.OPENAI_API_KEY = "sk-test";
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe("checkEmbeddingProvider", () => {
  it("throws without calling the provider when the key is unset", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(checkEmbeddingProvider()).rejects.toThrow(/OPENAI_API_KEY is not set/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("passes when the provider accepts the key", async () => {
    mockCreate.mockResolvedValueOnce({ data: [{ embedding: [0] }] });
    await expect(checkEmbeddingProvider()).resolves.toBeUndefined();
  });

  it("surfaces the provider's own message, e.g. invalid_organization", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("You do not have access to the organization tied to the API key.")
    );
    await expect(checkEmbeddingProvider()).rejects.toThrow(
      /do not have access to the organization/
    );
  });

  it("caches the result so repeated polls make one request", async () => {
    mockCreate.mockRejectedValueOnce(new Error("invalid_organization"));
    await expect(checkEmbeddingProvider()).rejects.toThrow();
    await expect(checkEmbeddingProvider()).rejects.toThrow(/invalid_organization/);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("stringifies a non-Error rejection", async () => {
    mockCreate.mockRejectedValueOnce("socket hang up");
    await expect(checkEmbeddingProvider()).rejects.toThrow("socket hang up");
  });

  it("caches a success too, so a healthy repeated poll also makes one request", async () => {
    mockCreate.mockResolvedValueOnce({ data: [{ embedding: [0] }] });
    await expect(checkEmbeddingProvider()).resolves.toBeUndefined();
    await expect(checkEmbeddingProvider()).resolves.toBeUndefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
