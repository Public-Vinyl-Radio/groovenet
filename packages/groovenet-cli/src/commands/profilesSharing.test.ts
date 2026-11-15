import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_RANKING_FILE_BYTES } from "@groovenet/contracts";
const mocks = vi.hoisted(() => ({ exportRankingProfile: vi.fn(), importRankingProfile: vi.fn() }));
vi.mock("@groovenet/client", () => ({
  loadConfig: () => ({ api_base: "test", default_friend_id: 4 }),
  GroovenetClient: class {
    exportRankingProfile = mocks.exportRankingProfile;
    importRankingProfile = mocks.importRankingProfile;
  },
}));
import { addProfilesCommands, runExport, runImport } from "./profiles.js";
const file = {
  format: "groovenet-ranking-profile",
  version: 1,
  name: "Peak",
  description: "",
  surfaces: ["related"],
  weights: {},
  usePrior: false,
  constraints: {},
};
let dir: string;
const io = { log: vi.fn(), warn: vi.fn() };
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ranking-"));
  vi.clearAllMocks();
  mocks.exportRankingProfile.mockResolvedValue(file);
  mocks.importRankingProfile.mockResolvedValue({
    profile: { id: "7" },
    warnings: ["Dropped unknown signal: future"],
  });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  process.exitCode = 0;
  vi.restoreAllMocks();
});
describe("profile files", () => {
  it("exports to stdout and file in identical format", async () => {
    await runExport(mocks, "selector", undefined, io);
    const path = join(dir, "profile.json");
    await runExport(mocks, "selector", path, io);
    expect(await readFile(path, "utf8")).toBe(io.log.mock.calls[0][0] + "\n");
    expect(mocks.exportRankingProfile).toHaveBeenCalledWith("selector");
  });
  it("validates locally and sends the original file; warnings use stderr", async () => {
    const path = join(dir, "profile.json");
    const text = JSON.stringify({ ...file, weights: { future: 1 } });
    await writeFile(path, text);
    await runImport(mocks, path, 4, io);
    expect(mocks.importRankingProfile).toHaveBeenCalledWith(4, text);
    expect(io.warn).toHaveBeenCalledWith("Dropped unknown signal: future");
    expect(JSON.parse(io.log.mock.calls[0][0])).toEqual({ id: "7" });
  });
  it("refuses oversized and malformed files without an HTTP request", async () => {
    const path = join(dir, "bad.json");
    await writeFile(path, " ".repeat(MAX_RANKING_FILE_BYTES + 1));
    await expect(runImport(mocks, path, 4, io)).rejects.toThrow("exceeds");
    await writeFile(path, JSON.stringify({ ...file, library_id: 7 }));
    await expect(runImport(mocks, path, 4, io)).rejects.toThrow("library_id");
    expect(mocks.importRankingProfile).not.toHaveBeenCalled();
  });
  it("wires the ranking-profiles alias, export -o, import scopes, and stderr warnings", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const path = join(dir, "out.json");
    const run = async (...args: string[]) => {
      const p = new Command();
      addProfilesCommands(p);
      await p.parseAsync(args, { from: "user" });
    };
    await run("ranking-profiles", "export", "default", "-o", path);
    await run("profiles", "export", "selector");
    expect(log).toHaveBeenCalled();
    await run("ranking-profiles", "import", path);
    expect(mocks.importRankingProfile).toHaveBeenLastCalledWith(4, await readFile(path, "utf8"));
    await run("ranking-profiles", "import", path, "--friend-id", "8", "--json");
    expect(mocks.importRankingProfile).toHaveBeenLastCalledWith(8, await readFile(path, "utf8"));
    expect(error).toHaveBeenCalledWith("Dropped unknown signal: future");
  });
});
