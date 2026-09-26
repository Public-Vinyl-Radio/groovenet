/**
 * The set derivation HTTP surface (#282): recordings, runs, and the worker's
 * callbacks. The routes are thin, so these are about status codes — the CLI
 * and `fingerprint-set-worker` both branch on them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordingService = vi.hoisted(() => ({ find: vi.fn(), store: vi.fn(), pathOf: vi.fn() }));
const derivationService = vi.hoisted(() => ({
  create: vi.fn(), view: vi.fn(), claim: vi.fn(), report: vi.fn(),
}));
vi.mock("@/server/services/setRecordingService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/setRecordingService")>()),
  setRecordingService: recordingService,
}));
vi.mock("@/server/services/setDerivationService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/setDerivationService")>()),
  setDerivationService: derivationService,
}));

import * as recordingRoute from "../../set-recordings/[sha256]/route";
import * as createRoute from "../route";
import * as viewRoute from "../[id]/route";
import * as claimRoute from "../[id]/claim/route";
import * as resultRoute from "../[id]/result/route";
import { RecordingRejected } from "@/server/services/setRecordingService";
import {
  SetDerivationNotFound,
  SetDerivationQueueError,
} from "@/server/services/setDerivationService";
import { NoFingerprintEngineError } from "@/server/services/fingerprintIndexService";

const SHA = "b".repeat(64);
const shaParams = (sha256 = SHA) => ({ params: Promise.resolve({ sha256 }) });
const idParams = (id = "d1") => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/set-recordings/{sha256}", () => {
  const recording = { sha256: SHA, file_path: `${SHA}.mp3`, size_bytes: 5 };

  it("HEAD answers 200 with the size when held, 404 when not", async () => {
    recordingService.find.mockResolvedValueOnce(recording);
    const held = await recordingRoute.HEAD(new Request("http://app"), shaParams());
    expect(held.status).toBe(200);
    expect(held.headers.get("content-length")).toBe("5");

    recordingService.find.mockResolvedValueOnce(null);
    expect((await recordingRoute.HEAD(new Request("http://app"), shaParams())).status).toBe(404);
  });

  it("GET streams the stored file back", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rec-")), "x.mp3");
    fs.writeFileSync(file, "hello");
    recordingService.find.mockResolvedValue(recording);
    recordingService.pathOf.mockReturnValue(file);

    const response = await recordingRoute.GET(new Request("http://app"), shaParams());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello");
  });

  it("GET is 404 for an unknown recording", async () => {
    recordingService.find.mockResolvedValue(null);
    expect((await recordingRoute.GET(new Request("http://app"), shaParams())).status).toBe(404);
  });

  const put = (sha256 = SHA) =>
    recordingRoute.PUT(
      new Request("http://app", { method: "PUT", body: "bytes", headers: { "x-filename": "set.mp3" } }),
      shaParams(sha256)
    );

  it("PUT answers 201 when stored and 200 when already held", async () => {
    recordingService.store.mockResolvedValueOnce({ recording, created: true });
    const stored = await put();
    expect(stored.status).toBe(201);
    expect(recordingService.store.mock.calls[0][2]).toBe("set.mp3");

    recordingService.store.mockResolvedValueOnce({ recording, created: false });
    expect((await put()).status).toBe(200);
  });

  it("PUT decodes a percent-encoded filename, and keeps one that is not", async () => {
    recordingService.store.mockResolvedValue({ recording, created: true });
    const send = (name: string | null) =>
      recordingRoute.PUT(
        new Request("http://app", {
          method: "PUT",
          body: "bytes",
          headers: name === null ? {} : { "x-filename": name },
        }),
        shaParams()
      );

    await send("Carlos%20D%C3%ADaz.mp3");
    await send("100%.mp3");
    await send(null);

    expect(recordingService.store.mock.calls.map((call) => call[2])).toEqual([
      "Carlos Díaz.mp3",
      "100%.mp3",
      null,
    ]);
  });

  it("PUT refuses a malformed sha256 before reading anything", async () => {
    const response = await put("nope");
    expect(response.status).toBe(400);
    expect(recordingService.store).not.toHaveBeenCalled();
  });

  it.each([
    ["hash_mismatch", 422],
    ["recording_too_large", 413],
    ["invalid_audio", 400],
    ["empty_upload", 400],
  ] as const)("PUT maps %s to %i", async (code, status) => {
    recordingService.store.mockRejectedValue(new RecordingRejected(code, "no"));
    const response = await put();
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: code });
  });

  it("PUT answers 500 on anything else", async () => {
    recordingService.store.mockRejectedValue(new Error("disk full"));
    expect((await put()).status).toBe(500);
  });
});

describe("POST /api/set-derivations", () => {
  const derivation = { id: "d1", status: "queued", windows: null };
  const create = (body: unknown) => createRoute.POST(new Request("http://app", json(body)));

  it("answers 202 for a new run and 200 for a reused one, never echoing windows", async () => {
    derivationService.create.mockResolvedValueOnce({ derivation, reused: false });
    const fresh = await create({ recording_sha256: SHA });
    expect(fresh.status).toBe(202);
    expect(await fresh.json()).toEqual({ id: "d1", status: "queued", reused: false });

    derivationService.create.mockResolvedValueOnce({ derivation, reused: true });
    expect((await create({ recording_sha256: SHA })).status).toBe(200);
  });

  it("validates the body", async () => {
    expect((await create({ recording_sha256: "short" })).status).toBe(400);
    expect((await create({ recording_sha256: SHA, step_seconds: 0 })).status).toBe(400);
  });

  it.each([
    [new SetDerivationNotFound("recording x"), 404],
    [new NoFingerprintEngineError(), 503],
    [new SetDerivationQueueError(new Error("down")), 503],
    [new Error("boom"), 500],
  ])("maps %s to %i", async (error, status) => {
    derivationService.create.mockRejectedValue(error);
    expect((await create({ recording_sha256: SHA })).status).toBe(status);
  });
});

describe("GET /api/set-derivations/{id}", () => {
  it("passes playlist and live set through", async () => {
    derivationService.view.mockResolvedValue({ tracklist: [] });
    const response = await viewRoute.GET(
      new Request("http://app/api/set-derivations/d1?playlist_id=176"),
      idParams()
    );
    expect(response.status).toBe(200);
    expect(derivationService.view).toHaveBeenCalledWith("d1", { playlist_id: 176 });
  });

  it("rejects a non-numeric playlist", async () => {
    const response = await viewRoute.GET(
      new Request("http://app/api/set-derivations/d1?playlist_id=abc"),
      idParams()
    );
    expect(response.status).toBe(400);
  });

  it("maps not-found to 404 and anything else to 500", async () => {
    derivationService.view.mockRejectedValueOnce(new SetDerivationNotFound("derivation d1"));
    expect((await viewRoute.GET(new Request("http://app/x"), idParams())).status).toBe(404);
    derivationService.view.mockRejectedValueOnce(new Error("boom"));
    expect((await viewRoute.GET(new Request("http://app/x"), idParams())).status).toBe(500);
  });
});

describe("worker callbacks", () => {
  it("claim returns the run's status", async () => {
    derivationService.claim.mockResolvedValue({ id: "d1", status: "processing" });
    const response = await claimRoute.POST(new Request("http://app", { method: "POST" }), idParams());
    expect(await response.json()).toEqual({ derivation_id: "d1", status: "processing" });
  });

  it("claim maps not-found to 404 and anything else to 500", async () => {
    derivationService.claim.mockRejectedValueOnce(new SetDerivationNotFound("derivation d1"));
    expect((await claimRoute.POST(new Request("http://app"), idParams())).status).toBe(404);
    derivationService.claim.mockRejectedValueOnce(new Error("boom"));
    expect((await claimRoute.POST(new Request("http://app"), idParams())).status).toBe(500);
  });

  const result = {
    derivation_id: "someone-else",
    status: "processed",
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
    sample_rate: 22050,
    duration_seconds: 30,
    window_seconds: 15,
    step_seconds: 15,
    windows: [{ start_seconds: 0, duration_seconds: 15, candidates: [] }],
  };

  it("result stores the worker's body under the id in the path", async () => {
    derivationService.report.mockResolvedValue({ id: "d1", status: "processed" });
    const response = await resultRoute.POST(new Request("http://app", json(result)), idParams());
    expect(await response.json()).toEqual({ derivation_id: "d1", status: "processed", windows: 1 });
    expect(derivationService.report.mock.calls[0][0].derivation_id).toBe("d1");
  });

  it("result validates the body, and maps not-found and errors", async () => {
    expect((await resultRoute.POST(new Request("http://app", json({ status: "meh" })), idParams())).status).toBe(400);
    derivationService.report.mockRejectedValueOnce(new SetDerivationNotFound("derivation d1"));
    expect((await resultRoute.POST(new Request("http://app", json(result)), idParams())).status).toBe(404);
    derivationService.report.mockRejectedValueOnce(new Error("boom"));
    expect((await resultRoute.POST(new Request("http://app", json(result)), idParams())).status).toBe(500);
  });
});
