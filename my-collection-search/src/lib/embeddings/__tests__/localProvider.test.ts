import { beforeEach, describe, expect, it, vi } from "vitest";

const { pipeline, pipe, env } = vi.hoisted(() => ({
  pipeline: vi.fn(),
  pipe: vi.fn(),
  env: { allowRemoteModels: true, useFSCache: true },
}));
vi.mock("@huggingface/transformers", () => ({ pipeline, env }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  pipeline.mockResolvedValue(pipe);
  pipe.mockImplementation(async (texts: string[]) => ({
    tolist: () => texts.map((_, i) => [i, 1]),
  }));
});

async function provider() {
  const { LocalEmbeddingProvider } = await import("../localProvider");
  return new LocalEmbeddingProvider();
}

describe("LocalEmbeddingProvider", () => {
  it("loads only baked CPU q8 weights, normalizes CLS vectors, and shares one session", async () => {
    const a = await provider();
    const b = await provider();
    expect(a.model).toBe("bge-small-en-v1.5");
    expect(a.dims).toBe(384);
    await expect(a.embed(["first", "second"])).resolves.toEqual([
      [0, 1],
      [1, 1],
    ]);
    await b.embed(["third"]);
    expect(pipeline).toHaveBeenCalledExactlyOnceWith(
      "feature-extraction",
      "/opt/groovenet/models/bge-small-en-v1.5",
      {
        local_files_only: true,
        dtype: "q8",
        device: "cpu",
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
      },
    );
    expect(env).toEqual({ allowRemoteModels: false, useFSCache: false });
    expect(pipe).toHaveBeenCalledWith(["first", "second"], { pooling: "cls", normalize: true });
  });

  it("does not load anything for an empty batch", async () => {
    await expect((await provider()).embed([])).resolves.toEqual([]);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("bounds batches, preserves order, and serializes concurrent callers", async () => {
    const a = await provider();
    const texts = Array.from({ length: 17 }, (_, i) => String(i));
    pipe.mockImplementation(async (batch: string[]) => ({
      tolist: () => batch.map((t) => [Number(t)]),
    }));
    const [first, second] = await Promise.all([a.embed(texts), a.embed(["99"])]);
    expect(first).toEqual(texts.map((t) => [Number(t)]));
    expect(second).toEqual([[99]]);
    expect(pipe.mock.calls.map((c) => c[0].length)).toEqual([8, 8, 1, 1]);
    expect(pipe.mock.calls[3][0]).toEqual(["99"]);
  });

  it("retries failed session creation and does not strand the next caller", async () => {
    pipeline.mockRejectedValueOnce(new Error("missing baked model"));
    const a = await provider();
    await expect(a.embed(["a"])).rejects.toThrow("missing baked model");
    await expect(a.embed(["b"])).resolves.toEqual([[0, 1]]);
    expect(pipeline).toHaveBeenCalledTimes(2);
  });

  it("recovers after inference fails without reloading the session", async () => {
    pipe.mockRejectedValueOnce(new Error("inference failed"));
    const a = await provider();
    await expect(a.embed(["a"])).rejects.toThrow("inference failed");
    await expect(a.embed(["b"])).resolves.toEqual([[0, 1]]);
    expect(pipeline).toHaveBeenCalledTimes(1);
  });
});
