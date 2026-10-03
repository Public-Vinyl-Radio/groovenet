import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: mockCreate };
  },
}));

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
});
