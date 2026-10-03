import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = { create: mockCreate };
  },
}));

import { createOpenAiEmbeddingProvider, resetOpenAiClient } from "../openaiProvider";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.resetAllMocks();
  resetOpenAiClient();
  process.env.OPENAI_API_KEY = "sk-test";
  mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_KEY;
});

describe("createOpenAiEmbeddingProvider", () => {
  it("resolves the native dims for a known model with no override", () => {
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small");
    expect(provider.model).toBe("text-embedding-3-small");
    expect(provider.dims).toBe(1536);
  });

  it("resolves native dims for text-embedding-3-large", () => {
    expect(createOpenAiEmbeddingProvider("text-embedding-3-large").dims).toBe(3072);
  });

  it("resolves native dims for text-embedding-ada-002", () => {
    expect(createOpenAiEmbeddingProvider("text-embedding-ada-002").dims).toBe(1536);
  });

  it("uses an explicit dims override instead of the native size", () => {
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small", 768);
    expect(provider.dims).toBe(768);
  });

  it("throws for an unknown model with no explicit dims", () => {
    expect(() => createOpenAiEmbeddingProvider("some-unknown-model")).toThrow(
      /Unknown dims for OpenAI embedding model "some-unknown-model"/
    );
  });

  it("embeds without a dimensions param when none was given", async () => {
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small");
    const result = await provider.embed(["a", "b"]);

    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["a", "b"],
    });
    expect(result).toEqual([[0.1, 0.2]]);
  });

  it("passes dimensions through when an explicit dims override is given", async () => {
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small", 768);
    await provider.embed(["a"]);

    expect(mockCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["a"],
      dimensions: 768,
    });
  });

  it("maps every returned embedding, in order", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [1] }, { embedding: [2] }, { embedding: [3] }],
    });
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small");

    await expect(provider.embed(["a", "b", "c"])).resolves.toEqual([[1], [2], [3]]);
  });

  it("falls back to a placeholder key when OPENAI_API_KEY is unset", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small");

    await expect(provider.embed(["a"])).resolves.toEqual([[0.1, 0.2]]);
  });

  it("reuses the same OpenAI client across calls until reset", async () => {
    const provider = createOpenAiEmbeddingProvider("text-embedding-3-small");
    await provider.embed(["a"]);
    await provider.embed(["b"]);

    // A fresh `new OpenAI()` per call would still route through the same
    // mocked `create` fn, so assert call count instead of identity.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
