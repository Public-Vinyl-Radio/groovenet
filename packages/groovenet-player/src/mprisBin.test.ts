import { afterEach, expect, it, vi } from "vitest";

const originalExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.doUnmock("./mpris.js");
  vi.resetModules();
});

it("prints a disabled message when no platform bridge is available", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.doMock("./mpris.js", () => ({ startMpris: vi.fn().mockResolvedValue(null) }));
  await import("./mprisBin.js");
  expect(error).toHaveBeenCalledWith(expect.stringContaining("disabled"));
});

it("reports startup failure with a nonzero exit status", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.doMock("./mpris.js", () => ({
    startMpris: vi.fn().mockRejectedValue(new Error("missing dependency")),
  }));
  await import("./mprisBin.js");
  expect(error).toHaveBeenCalledWith(expect.stringContaining("Could not start"), expect.any(Error));
  expect(process.exitCode).toBe(1);
});

it("handles signals and runtime errors while releasing signal handlers", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const close = vi.fn().mockResolvedValue(undefined);
  const startMpris = vi.fn().mockResolvedValue(close);
  const on = vi.spyOn(process, "on").mockReturnValue(process);
  const off = vi.spyOn(process, "off").mockReturnValue(process);
  vi.doMock("./mpris.js", () => ({ startMpris }));
  await import("./mprisBin.js");
  const options = startMpris.mock.calls[0]![1];
  options.onError(new Error("disconnected"));
  expect(error).toHaveBeenCalledWith("Groovenet MPRIS:", expect.any(Error));
  expect(process.exitCode).toBe(1);
  const stop = on.mock.calls.find(([event]) => event === "SIGINT")![1];
  stop();
  await vi.waitFor(() => expect(off).toHaveBeenCalledWith("SIGTERM", stop));
  expect(close).toHaveBeenCalledOnce();
});
