import { afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./runtime.js", () => ({ runPlayerWorker: run }));
afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});
it("starts the standalone worker without tying its lifetime to a client", async () => {
  vi.resetModules();
  await import("./bin.js");
  expect(run).toHaveBeenCalled();
});
it("exits with a redacted startup failure", async () => {
  vi.resetModules();
  run.mockRejectedValueOnce(new Error("secret connection string"));
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./bin.js");
  await Promise.resolve();
  expect(process.exitCode).toBe(1);
  expect(error).toHaveBeenCalledWith(expect.not.stringContaining("secret"));
});
