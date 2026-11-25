import { describe, expect, it, vi } from "vitest";
const { openai } = vi.hoisted(() => ({ openai: vi.fn(() => ({ model: "openai" })) }));
vi.mock("../openaiProvider", () => ({ createOpenAiEmbeddingProvider: openai }));
import { createEmbeddingProvider } from "../createProvider";
import { LocalEmbeddingProvider } from "../localProvider";

describe("createEmbeddingProvider", () => {
  it("selects local without an OpenAI key", () => {
    expect(createEmbeddingProvider("bge-small-en-v1.5", 384)).toBeInstanceOf(
      LocalEmbeddingProvider,
    );
  });
  it("rejects incompatible local dimensions", () => {
    expect(() => createEmbeddingProvider("bge-small-en-v1.5", 1536)).toThrow("Invalid dimensions");
  });
  it("preserves the OpenAI provider and dimensions", () => {
    expect(createEmbeddingProvider("text-embedding-3-small", 768)).toEqual({ model: "openai" });
    expect(openai).toHaveBeenCalledWith("text-embedding-3-small", 768);
  });
});
