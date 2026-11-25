/**
 * `GET /api/discogs` as a view over the import job (#1274): it queues or joins
 * the job and streams its log until the job ends. The import itself is tested
 * in `discogsImportRunner.test.ts`, the job in `discogsImportWorker.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ start: vi.fn(), get: vi.fn(), readLog: vi.fn() }));
vi.mock("@/server/services/discogsImportService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/discogsImportService")>()),
  discogsImportService: service,
}));
vi.mock("@/server/services/discogsImportWorker", () => ({ kickDiscogsImportWorker: vi.fn() }));
vi.mock("@/server/repositories/discogsImportRepository", () => ({ discogsImportRepository: {} }));

import { DiscogsCredentialsMissingError } from "@/server/services/discogsImportService";
import { streamLines } from "@/services/http";
import { GET, STREAM_POLL_MS } from "../route";

/** Read a response the way the CLI and older clients do: through `streamLines`. */
async function syncLinesForTest(response: Response): Promise<string[]> {
  const lines: string[] = [];
  vi.stubGlobal("fetch", async () => response);
  await streamLines("/api/discogs", {}, (line) => lines.push(line));
  vi.unstubAllGlobals();
  return lines;
}

const request = (query = "?username=dj") =>
  GET(new Request(`http://localhost/api/discogs${query}`) as never);

/** The log as pages: each call to readLog returns the next. */
function logPages(pages: string[][]) {
  let id = 0;
  for (const page of pages) {
    const lines = page.map((line) => ({ id: ++id, line }));
    service.readLog.mockResolvedValueOnce({ lines, next_after: id });
  }
  service.readLog.mockResolvedValue({ lines: [], next_after: id });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  service.start.mockResolvedValue({ import: { id: 9 }, created: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/discogs", () => {
  it("queues the import and streams its log until it ends", async () => {
    service.get
      .mockResolvedValueOnce({ id: 9, status: "running" })
      .mockResolvedValueOnce({ id: 9, status: "completed" });
    logPages([
      ["Found release ID: 1\n\n"],
      ["Sync complete for dj. New releases downloaded: 1\n\n"],
    ]);

    const res = await request();
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const body = res.text();
    await vi.advanceTimersByTimeAsync(STREAM_POLL_MS);

    expect(await body).toBe(
      "Found release ID: 1\n\nSync complete for dj. New releases downloaded: 1\n\n",
    );
    expect(service.start).toHaveBeenCalledWith("dj");
    expect(service.readLog).toHaveBeenCalledWith(9, 1, 500);
  });

  it("joins the import already running for that username and streams it from the start", async () => {
    service.start.mockResolvedValue({ import: { id: 9 }, created: false });
    service.get.mockResolvedValue({ id: 9, status: "failed" });
    logPages([["Loaded manifest IDs for dj: 0\n\n", "Error: HTTP 401\n\n"]]);

    const body = await (await request("")).text();

    expect(service.start).toHaveBeenCalledWith(null);
    expect(service.readLog).toHaveBeenCalledWith(9, 0, 500);
    expect(body).toContain("Error: HTTP 401");
  });

  it("reads a long log page by page before waiting", async () => {
    service.get.mockResolvedValue({ id: 9, status: "completed" });
    logPages([Array.from({ length: 500 }, (_, i) => `${i}\n`), ["last\n"]]);
    const body = await (await request()).text();
    expect(body.endsWith("499\nlast\n")).toBe(true);
  });

  it("stops at an import that has gone", async () => {
    service.get.mockResolvedValue(null);
    logPages([]);
    expect(await (await request()).text()).toBe("");
  });

  it("ends the stream with an error line when reading the job fails", async () => {
    service.get.mockRejectedValueOnce(new Error("db down"));
    expect(await (await request()).text()).toBe(
      "Error: Could not read the import's progress; it carries on in the background\n\n",
    );
    service.get.mockRejectedValueOnce("db down");
    expect(await (await request()).text()).toBe(
      "Error: Could not read the import's progress; it carries on in the background\n\n",
    );
  });

  it("stops only the stream when the client leaves: the import carries on", async () => {
    service.get.mockResolvedValue({ id: 9, status: "running" });
    logPages([["Found release ID: 1\n\n"]]);
    const res = await request();
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.advanceTimersByTimeAsync(STREAM_POLL_MS * 3);

    expect(console.log).toHaveBeenCalledWith(
      "[Discogs Sync] Client disconnected; import 9 continues",
    );
    // At most the one poll already under way when it left.
    expect(service.get.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("stops writing, and closes, once a write fails", async () => {
    service.get.mockResolvedValue({ id: 9, status: "running" });
    logPages([["a\n", "b\n"]]);
    vi.spyOn(TextEncoder.prototype, "encode").mockImplementationOnce(() => {
      throw new TypeError("stream errored");
    });
    expect(await (await request()).text()).toBe("");
    expect(service.get).toHaveBeenCalledTimes(1);
  });

  it("keeps the credentials 500, before any stream", async () => {
    service.start.mockRejectedValue(new DiscogsCredentialsMissingError());
    const res = await request();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Discogs credentials not set in environment" });
  });

  it("is a 500 when the import can't be queued", async () => {
    service.start.mockRejectedValueOnce(new Error("db down")).mockRejectedValueOnce("db down");
    expect(await (await request()).json()).toEqual({ error: "Could not start the Discogs import" });
    expect(await (await request()).json()).toEqual({ error: "Could not start the Discogs import" });
  });

  it("hands its lines to the client as the sync's progress readers expect", async () => {
    service.get.mockResolvedValue({ id: 9, status: "completed" });
    logPages([["\n--- Starting Auto-Ingest ---\n\n", "  - Release 3: 429\n"]]);
    expect(await syncLinesForTest(await request())).toEqual([
      "--- Starting Auto-Ingest ---",
      "  - Release 3: 429",
    ]);
  });
});
