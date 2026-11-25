import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_MODEL_PATH, LOCAL_MODEL_REPO, LOCAL_MODEL_REVISION } from "../localModel";

const { mkdir, writeFile, fetchModel } = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  fetchModel: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ mkdir, writeFile }));
const originalArgv = process.argv;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.argv = ["node", "bake-local-model.mjs", "/tmp/local-model-test"];
  vi.stubGlobal("fetch", fetchModel);
  vi.spyOn(console, "log").mockImplementation(() => {});
  fetchModel.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
});
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const bake = () => import("../../../../scripts/bake-local-model.mjs");

describe("build-time local model assets", () => {
  it("downloads every required file at the pinned revision and writes binary bytes", async () => {
    await bake();
    const files = [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "onnx/model_quantized.onnx",
    ];
    expect(fetchModel.mock.calls.map((c) => c[0])).toEqual(
      files.map(
        (file) =>
          `https://huggingface.co/${LOCAL_MODEL_REPO}/resolve/${LOCAL_MODEL_REVISION}/${file}`,
      ),
    );
    expect(writeFile.mock.calls.map((c) => c[0])).toEqual(
      files.map((file) => `/tmp/local-model-test/${file}`),
    );
    expect(writeFile).toHaveBeenLastCalledWith(
      "/tmp/local-model-test/onnx/model_quantized.onnx",
      new Uint8Array([1, 2, 3]),
    );
    expect(mkdir).toHaveBeenLastCalledWith("/tmp/local-model-test/onnx", { recursive: true });
  });
  it("defaults to the same baked path the runtime reads", async () => {
    process.argv = ["node", "bake-local-model.mjs"];
    await bake();
    expect(writeFile).toHaveBeenCalledWith(
      `${LOCAL_MODEL_PATH}/config.json`,
      expect.any(Uint8Array),
    );
  });
  it("fails the build on an HTTP error instead of shipping missing weights", async () => {
    fetchModel.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    await expect(bake()).rejects.toThrow("config.json: HTTP 404");
    expect(writeFile).not.toHaveBeenCalled();
  });
  it("propagates a failed download", async () => {
    fetchModel.mockRejectedValueOnce(new Error("network down"));
    await expect(bake()).rejects.toThrow("network down");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
