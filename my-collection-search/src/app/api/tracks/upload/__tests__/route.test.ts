import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  mockMkdir,
  mockWriteFile,
  mockCopyFile,
  mockUnlink,
  mockExecFile,
  mockRunFfprobe,
  mockWriteEssentiaAnalysis,
  mockUpdateTrackAnalysis,
  mockFindTracksByTrackId,
  mockEnqueue,
} = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
  mockCopyFile: vi.fn(),
  mockUnlink: vi.fn(),
  mockExecFile: vi.fn(),
  mockRunFfprobe: vi.fn(),
  mockWriteEssentiaAnalysis: vi.fn(),
  mockUpdateTrackAnalysis: vi.fn(),
  mockFindTracksByTrackId: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock("fs", () => {
  const promises = {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    copyFile: mockCopyFile,
    unlink: mockUnlink,
  };
  return { promises, default: { promises } };
});

// promisify(execFile) drives this via the (file, args, callback) contract. No
// `exec` is exported, so a shell-string call would fail the test outright.
vi.mock("child_process", () => ({ execFile: mockExecFile }));

vi.mock("@/server/services/trackAudioMetadataService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/trackAudioMetadataService")>()),
  trackAudioMetadataService: { runFfprobe: mockRunFfprobe },
}));

vi.mock("@/lib/essentia-storage", () => ({
  writeEssentiaAnalysis: mockWriteEssentiaAnalysis,
}));

vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: {
    updateTrackAnalysisByTrackId: mockUpdateTrackAnalysis,
    findTracksByTrackId: mockFindTracksByTrackId,
  },
}));

vi.mock("@/server/services/embeddingQueueService", () => ({
  embeddingQueueService: { enqueue: mockEnqueue },
}));

import { POST } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest({
  friendId = "1",
  includeFile = true,
  trackId = "t1",
  fileName = "song.mp3",
}: {
  friendId?: string | null;
  includeFile?: boolean;
  trackId?: string;
  fileName?: string;
} = {}) {
  const formData = new FormData();
  if (includeFile) {
    formData.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], fileName, { type: "audio/mpeg" }),
    );
  }
  formData.append("track_id", trackId);
  if (friendId !== null) formData.append("friend_id", friendId);
  return new NextRequest("http://localhost/api/tracks/upload", {
    method: "POST",
    body: formData,
  });
}

function probe(codec: string, formatName: string) {
  return {
    streams: [{ codec_type: "audio", codec_name: codec }],
    format: { format_name: formatName },
  };
}

type ExecFileCallback = (e: unknown, stdout?: string, stderr?: string) => void;
const ffmpegCalls = () => mockExecFile.mock.calls.map((call) => call[1] as string[]);

function essentiaResponse(tonal: unknown) {
  return {
    ok: true,
    json: async () => ({
      rhythm: {
        bpm: 123.6,
        danceability: 0.8,
        bpm_histogram_first_peak_weight: 0.282,
        bpm_histogram_second_peak_weight: 0.024,
      },
      tonal,
      metadata: { audio_properties: { length: 245.2 } },
    }),
  };
}

describe("POST /api/tracks/upload", () => {
  it("reports a stopped Essentia service", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
    );
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Essentia service not running" });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockExecFile.mockImplementation((_file: string, _args: string[], cb: ExecFileCallback) =>
      cb(null, "", ""),
    );
    mockRunFfprobe.mockResolvedValue(probe("aac", "mov,mp4,m4a,3gp,3g2,mj2"));
    mockUpdateTrackAnalysis.mockResolvedValue(undefined);
    mockFindTracksByTrackId.mockResolvedValue([{ track_id: "t1", friend_id: 1 }]);
    mockEnqueue.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        essentiaResponse({
          key_edma: { key: "F", scale: "major", strength: 0.62 },
          key_krumhansl: { key: "C", scale: "major", strength: 0.58 },
          key_temperley: { key: "C", scale: "major", strength: 0.55 },
        }),
      ),
    );
  });

  it("stores the consensus key and confidence, not just edma's (#524)", async () => {
    // krumhansl+temperley outvote edma's minority "F major" here.
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockUpdateTrackAnalysis).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({
        audio_source: "upload",
        local_audio_url: expect.stringMatching(/\.m4a$/),
      }),
    );
    expect(mockUpdateTrackAnalysis).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ key: "C major", key_confidence: 0.565 }),
    );
  });

  it("stores the beat-histogram margin as bpm_confidence (#531)", async () => {
    await POST(makeRequest());

    expect(mockUpdateTrackAnalysis).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ bpm: 124, bpm_confidence: 0.258 }),
    );
  });

  it("stores a null bpm_confidence when Essentia returns no BPM (#531)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rhythm: { bpm_histogram_first_peak_weight: 0.5 },
          tonal: {},
          metadata: { audio_properties: { length: 245.2 } },
        }),
      }),
    );

    await POST(makeRequest());

    expect(mockUpdateTrackAnalysis).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ bpm: null, bpm_confidence: null }),
    );
  });

  it("logs edma as disagreeing when it's outvoted by krumhansl/temperley (#524)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await POST(makeRequest());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("stored key=C major"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("edma=F major"));
    warnSpy.mockRestore();
  });

  it("does not log a disagreement when all three profiles agree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        essentiaResponse({
          key_edma: { key: "D", scale: "minor", strength: 0.9 },
          key_krumhansl: { key: "D", scale: "minor", strength: 0.9 },
          key_temperley: { key: "D", scale: "minor", strength: 0.9 },
        }),
      ),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await POST(makeRequest());

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Key profile disagreement"));
    warnSpy.mockRestore();
  });

  it("skips disagreement logging when friend_id is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await POST(makeRequest({ friendId: null }));

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Key profile disagreement"));
    warnSpy.mockRestore();
  });

  it("writes the raw analysis for the supplied friend", async () => {
    await POST(makeRequest({ friendId: "1" }));

    expect(mockWriteEssentiaAnalysis).toHaveBeenCalledTimes(1);
    expect(mockWriteEssentiaAnalysis).toHaveBeenCalledWith(
      "t1",
      1,
      expect.objectContaining({ rhythm: expect.any(Object) }),
    );
  });

  it("writes the raw analysis once per friend row sharing the track", async () => {
    mockFindTracksByTrackId.mockResolvedValue([
      { track_id: "t1", friend_id: 1 },
      { track_id: "t1", friend_id: 2 },
      { track_id: "t1", friend_id: 2 },
    ]);

    await POST(makeRequest({ friendId: "1" }));

    expect(mockWriteEssentiaAnalysis.mock.calls.map((c) => c[1]).sort()).toEqual([1, 2]);
  });

  it("still writes for existing rows when no friend_id is supplied", async () => {
    mockFindTracksByTrackId.mockResolvedValue([{ track_id: "t1", friend_id: 4 }]);

    const res = await POST(makeRequest({ friendId: null }));

    expect(res.status).toBe(200);
    expect(mockWriteEssentiaAnalysis).toHaveBeenCalledTimes(1);
    expect(mockWriteEssentiaAnalysis).toHaveBeenCalledWith("t1", 4, expect.anything());
  });

  it("writes for the requested friend even when the DB update failed", async () => {
    mockUpdateTrackAnalysis.mockRejectedValue(new Error("db down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(makeRequest({ friendId: "5" }));

    expect(res.status).toBe(200);
    expect(mockWriteEssentiaAnalysis).toHaveBeenCalledWith("t1", 5, expect.anything());
    warnSpy.mockRestore();
  });

  it("does not write when no friend is known", async () => {
    // The track exists when checked, but the re-read after the update is empty.
    mockFindTracksByTrackId
      .mockResolvedValueOnce([{ track_id: "t1", friend_id: 1 }])
      .mockResolvedValue(null);

    const res = await POST(makeRequest({ friendId: null }));

    expect(res.status).toBe(200);
    expect(mockWriteEssentiaAnalysis).not.toHaveBeenCalled();
  });

  it("logs a write failure with track and friend ids and still succeeds", async () => {
    mockWriteEssentiaAnalysis.mockImplementation(() => {
      throw new Error("disk full");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockUpdateTrackAnalysis).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("track_id=t1, friend_id=1"),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("returns 400 when the file is missing", async () => {
    const res = await POST(makeRequest({ includeFile: false }));

    expect(res.status).toBe(400);
    expect(mockUpdateTrackAnalysis).not.toHaveBeenCalled();
  });

  it("returns 404 for a track_id that names no track, before writing anything", async () => {
    mockFindTracksByTrackId.mockResolvedValue([]);

    const res = await POST(makeRequest({ trackId: "../../etc/passwd" }));

    expect(res.status).toBe(404);
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

describe("POST /api/tracks/upload storage (#1155)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockExecFile.mockImplementation((_file: string, _args: string[], cb: ExecFileCallback) =>
      cb(null, "", ""),
    );
    mockUpdateTrackAnalysis.mockResolvedValue(undefined);
    mockFindTracksByTrackId.mockResolvedValue([{ track_id: "t1", friend_id: 1 }]);
    mockEnqueue.mockResolvedValue(undefined);
    mockRunFfprobe.mockResolvedValue(probe("mp3", "mp3"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(essentiaResponse({})));
  });

  it.each([
    ["FLAC", probe("flac", "flac"), "flac", true],
    ["MP3", probe("mp3", "mp3"), "mp3", false],
    ["AAC in MP4", probe("aac", "mov,mp4,m4a,3gp,3g2,mj2"), "m4a", false],
    ["ADTS AAC", probe("aac", "aac"), "aac", false],
    ["Opus in Ogg", probe("opus", "ogg"), "ogg", false],
  ])("keeps a %s upload's bytes, without re-encoding", async (_kind, probed, ext, lossless) => {
    mockRunFfprobe.mockResolvedValue(probed);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ format: ext, lossless });
    expect(body.local_audio_url).toMatch(new RegExp(`^audio_\\d+_[0-9a-f-]{36}\\.${ext}$`));
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.upload$/),
      expect.stringMatching(new RegExp(`${body.local_audio_url}$`)),
    );
    // Only the essentia WAV is made with ffmpeg.
    expect(ffmpegCalls()).toHaveLength(1);
    expect(ffmpegCalls()[0]).toContain("-ac");
  });

  it.each([
    ["WAV", probe("pcm_s16le", "wav")],
    ["24-bit WAV", probe("pcm_s24le", "wav")],
    ["AIFF", probe("pcm_s16be", "aiff")],
    ["ALAC", probe("alac", "mov,mp4,m4a,3gp,3g2,mj2")],
  ])("converts a %s upload to FLAC, keeping tags and cover", async (_kind, probed) => {
    mockRunFfprobe.mockResolvedValue(probed);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ format: "flac", lossless: true });
    expect(mockCopyFile).not.toHaveBeenCalled();
    const flac = ffmpegCalls()[1];
    expect(flac).toEqual(expect.arrayContaining(["-c:a", "flac", "-map_metadata", "0", "0:v?"]));
    expect(flac.at(-1)).toMatch(new RegExp(`${body.local_audio_url}$`));
    expect(mockUpdateTrackAnalysis).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ local_audio_url: body.local_audio_url }),
    );
  });

  it("stores a hostile filename under a generated name, through no shell", async () => {
    const hostile = '../../x"; rm -rf / #$(touch pwned)`id`.mp3';

    const res = await POST(makeRequest({ fileName: hostile }));

    expect(res.status).toBe(200);
    const uploadPath = mockWriteFile.mock.calls[0][0] as string;
    const uploadDir = `${process.cwd()}/tmp/uploads/`;
    expect(uploadPath.startsWith(uploadDir)).toBe(true);
    expect(uploadPath.slice(uploadDir.length)).toMatch(/^audio_\d+_[0-9a-f-]{36}\.upload$/);
    for (const call of mockExecFile.mock.calls) {
      expect(call[0]).toBe("ffmpeg");
      expect(Array.isArray(call[1])).toBe(true);
      expect((call[1] as string[]).join(" ")).not.toContain("rm -rf");
    }
    expect(mockRunFfprobe).toHaveBeenCalledWith(uploadPath);
  });

  it("removes the upload and the WAV once done", async () => {
    await POST(makeRequest());

    const removed = mockUnlink.mock.calls.map((call) => call[0] as string);
    expect(removed).toEqual([expect.stringMatching(/\.upload$/), expect.stringMatching(/\.wav$/)]);
  });

  it("rejects a file ffprobe cannot read with 400, and cleans up", async () => {
    mockRunFfprobe.mockRejectedValue(new Error("Invalid data found"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File is not readable audio" });
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringMatching(/\.upload$/));
  });

  it("rejects lossy audio in a container the app does not serve with 415", async () => {
    mockRunFfprobe.mockResolvedValue(probe("wmav2", "asf"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(415);
    expect(mockUpdateTrackAnalysis).not.toHaveBeenCalled();
  });

  it("returns 500 when the WAV for essentia cannot be made", async () => {
    mockExecFile.mockImplementation((_file: string, _args: string[], cb: ExecFileCallback) =>
      cb(new Error("ffmpeg died")),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("ffmpeg conversion failed");
  });

  it("returns 500 for an Essentia error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: "bad" }) }),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Essentia API error: 422");
  });

  it("returns 500 and removes a partial file when the FLAC conversion fails", async () => {
    mockRunFfprobe.mockResolvedValue(probe("pcm_s16le", "wav"));
    mockExecFile
      .mockImplementationOnce((_file: string, _args: string[], cb: ExecFileCallback) =>
        cb(null, "", ""),
      )
      .mockImplementationOnce((_file: string, _args: string[], cb: ExecFileCallback) =>
        cb(new Error("flac failed")),
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(mockUpdateTrackAnalysis).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringMatching(/\.flac$/));
    errorSpy.mockRestore();
  });

  it("ignores a file that is already gone at cleanup, and warns about other failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockUnlink
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "ENOENT" }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "EBUSY" }));

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("Cleanup warning:", expect.any(Error));
    warnSpy.mockRestore();
  });

  it("returns 500 naming a non-Error Essentia failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("socket hang up"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Essentia API call failed: socket hang up");
  });

  it("still succeeds when the embedding jobs cannot be queued", async () => {
    mockEnqueue.mockRejectedValue(new Error("redis down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to enqueue embedding jobs after upload:",
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
