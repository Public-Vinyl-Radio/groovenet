import { beforeEach, expect, it, vi } from "vitest";
import { Command } from "commander";
const { makeClient, printError, createInterface } = vi.hoisted(() => ({
  makeClient: vi.fn(),
  printError: vi.fn(),
  createInterface: vi.fn(),
}));
vi.mock("./fingerprintLibrary.js", () => ({ makeClient }));
vi.mock("../output.js", () => ({ printError }));
vi.mock("node:readline/promises", () => ({ createInterface }));
import {
  addArtistsReviewCommand,
  artistDecision,
  runArtistReview,
  type ArtistReviewOptions,
} from "./artistsReview.js";
const item = {
  id: 1,
  name: "A & B",
  sort_name: "A & B",
  reviewed: false,
  is_placeholder: false,
  aliases: ["A and B"],
  albums: [],
  tracks: [],
  merges: [],
};
const client = { listArtistReview: vi.fn(), reviewArtist: vi.fn() };
const io = { terminal: true, log: vi.fn(), ask: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
  client.listArtistReview.mockResolvedValue({ items: [item] });
  client.reviewArtist.mockImplementation(async (decision, dry_run = false) => ({
    decision,
    dry_run,
  }));
  makeClient.mockReturnValue(client);
  io.terminal = true;
  io.ask.mockResolvedValue("skip");
});
it.each<[ArtistReviewOptions, object]>([
  [
    { artist: 1, accept: true },
    { action: "accept", artist_id: 1 },
  ],
  [
    { artist: 1, merge: 2 },
    { action: "merge", artist_id: 1, target_id: 2 },
  ],
  [{ unmerge: 4 }, { action: "unmerge", merge_id: 4 }],
  [
    { artist: 1, placeholder: false },
    { action: "placeholder", artist_id: 1, is_placeholder: false },
  ],
  [
    { artist: 1, name: "A", sortName: "A" },
    { action: "rename", artist_id: 1, name: "A", sort_name: "A" },
  ],
])("maps flags %j", (opts, decision) => expect(artistDecision(opts)).toEqual(decision));
it("maps split JSON and rejects invalid actions", () => {
  expect(artistDecision({})).toBeNull();
  expect(artistDecision({ artist: 1, split: "[{},{}]" })).toMatchObject({
    action: "split",
    credits: [{}, {}],
  });
  for (const opts of [
    { accept: true, merge: 2 },
    { accept: true },
    { artist: 1, split: "{}" },
    { artist: 1, split: "[]" },
    { artist: 1, split: "{" },
    { artist: 1, name: "A" },
    { artist: 1, sortName: "A" },
  ])
    expect(() => artistDecision(opts)).toThrow();
});
it("prints JSON actions and dry runs without asking", async () => {
  await runArtistReview(client, { artist: 1, accept: true, dryRun: true, json: true }, io);
  expect(JSON.parse(io.log.mock.calls[0][0])).toMatchObject({ dry_run: true });
  expect(io.ask).not.toHaveBeenCalled();
  await runArtistReview(client, { artist: 1, accept: true }, io);
  expect(io.log).toHaveBeenLastCalledWith(expect.stringContaining("Saved:"));
  await runArtistReview(client, { artist: 1, accept: true, dryRun: true }, io);
  expect(io.log).toHaveBeenLastCalledWith(expect.stringContaining("Dry run:"));
});
it("lists pages in JSON or text without a terminal", async () => {
  io.terminal = false;
  await runArtistReview(client, { json: true, limit: 4, offset: 2 }, io);
  expect(JSON.parse(io.log.mock.calls[0][0])).toEqual({ items: [item] });
  await runArtistReview(client, { list: true }, io);
  expect(io.log).toHaveBeenLastCalledWith(expect.stringContaining("A and B"));
  await expect(runArtistReview(client, {}, io)).rejects.toThrow("terminal");
});
it.each(["accept", "placeholder", "merge", "unmerge", "split", "rename"])(
  "previews then saves interactive %s",
  async (action) => {
    io.ask.mockResolvedValueOnce(action);
    if (action === "merge" || action === "unmerge") io.ask.mockResolvedValueOnce("2");
    if (action === "split") io.ask.mockResolvedValueOnce('[{"artist_id":2},{"artist_id":3}]');
    if (action === "rename") io.ask.mockResolvedValueOnce("New").mockResolvedValueOnce("New, The");
    io.ask.mockResolvedValueOnce("y");
    await runArtistReview(client, {}, io);
    expect(client.reviewArtist).toHaveBeenCalledTimes(2);
    expect(client.reviewArtist.mock.calls[0][0].action).toBe(action);
    expect(client.reviewArtist.mock.calls[0][1]).toBe(true);
  },
);
it.each(["quit", "skip", "", "unknown"])("handles %j without writing", async (answer) => {
  io.ask.mockResolvedValue(answer);
  await runArtistReview(client, {}, io);
  expect(client.reviewArtist).not.toHaveBeenCalled();
});
it("can decline saving or run dry with missing detail", async () => {
  client.listArtistReview
    .mockResolvedValueOnce({ items: [item] })
    .mockResolvedValueOnce({ items: [] });
  io.ask.mockResolvedValueOnce("accept").mockResolvedValueOnce("n");
  await runArtistReview(client, {}, io);
  expect(client.reviewArtist).toHaveBeenCalledTimes(1);
  client.reviewArtist.mockClear();
  io.ask.mockResolvedValueOnce("accept");
  await runArtistReview(client, { dryRun: true }, io);
  expect(client.reviewArtist).toHaveBeenCalledTimes(1);
});
const run = (args: string[]) => {
  const program = new Command();
  addArtistsReviewCommand(program.command("artists"));
  return program.parseAsync(["artists", "review", ...args], { from: "user" });
};
it("wires the command and positive / negative placeholder flags without defaults", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await run(["--json"]);
  expect(client.reviewArtist).not.toHaveBeenCalled();
  await run(["--artist", "1", "--placeholder", "--json"]);
  expect(client.reviewArtist).toHaveBeenLastCalledWith(
    { action: "placeholder", artist_id: 1, is_placeholder: true },
    undefined,
  );
  await run(["--artist", "1", "--no-placeholder", "--json"]);
  expect(client.reviewArtist).toHaveBeenLastCalledWith(
    { action: "placeholder", artist_id: 1, is_placeholder: false },
    undefined,
  );
  log.mockRestore();
});
it("prints command failures and sets a failing exit code", async () => {
  client.listArtistReview.mockRejectedValueOnce(new Error("offline"));
  await run(["--json"]);
  expect(printError).toHaveBeenCalledWith("offline");
  expect(process.exitCode).toBe(1);
  process.exitCode = 0;
  client.listArtistReview.mockRejectedValueOnce("bad");
  await run(["--json"]);
  expect(printError).toHaveBeenCalledWith("bad");
  process.exitCode = 0;
});
it("opens and closes readline for terminal review", async () => {
  const input = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const output = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  const close = vi.fn(),
    question = vi.fn().mockResolvedValue("quit");
  createInterface.mockReturnValue({ question, close });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await run([]);
    expect(question).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  } finally {
    if (input) Object.defineProperty(process.stdin, "isTTY", input);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    if (output) Object.defineProperty(process.stdout, "isTTY", output);
    else Reflect.deleteProperty(process.stdout, "isTTY");
    log.mockRestore();
  }
});
