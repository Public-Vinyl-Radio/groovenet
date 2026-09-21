/**
 * How ffprobe's JSON is read (#275).
 *
 * Separate from the real-binary tests because a valid WAV always carries every
 * field; these are the shapes a device, a container or a partial write can
 * produce that the happy path never reaches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const execFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile }));

import { AudioProcessor, InvalidAudioError } from "../audioProcessor";

const processor = new AudioProcessor();

/** promisify() calls the last argument back node-style. */
type ExecFileCallback = (
  error: unknown,
  result?: { stdout: string; stderr: string }
) => void;

function ffprobeReturns(payload: unknown) {
  execFile.mockImplementation(
    (_cmd: string, _args: string[], cb: ExecFileCallback) =>
      cb(null, { stdout: JSON.stringify(payload), stderr: "" })
  );
}

function ffprobeFails(error: unknown) {
  execFile.mockImplementation(
    (_cmd: string, _args: string[], cb: ExecFileCallback) => cb(error)
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AudioProcessor.probe() — reading ffprobe output", () => {
  it("prefers the container duration over the stream's", async () => {
    // A capture device's WAV often has a duration on the container only.
    ffprobeReturns({
      format: { duration: "15.02", format_name: "wav" },
      streams: [{ codec_type: "audio", duration: "99", channels: 1 }],
    });

    expect((await processor.probe("/tmp/x.wav")).durationSeconds).toBe(15.02);
  });

  it("falls back to the stream duration", async () => {
    ffprobeReturns({
      format: { format_name: "wav" },
      streams: [{ codec_type: "audio", duration: "12.5" }],
    });

    expect((await processor.probe("/tmp/x.wav")).durationSeconds).toBe(12.5);
  });

  it("skips non-audio streams to find the audio one", async () => {
    // Cover art in a FLAC arrives as a video stream.
    ffprobeReturns({
      format: { duration: "10", format_name: "flac" },
      streams: [
        { codec_type: "video", codec_name: "mjpeg" },
        { codec_type: "audio", codec_name: "flac", channels: 2, sample_rate: "48000" },
      ],
    });

    const result = await processor.probe("/tmp/x.flac");

    expect(result.codec).toBe("flac");
    expect(result.channels).toBe(2);
    expect(result.sampleRate).toBe(48000);
  });

  it("rejects output with no audio stream", async () => {
    ffprobeReturns({ format: { duration: "10" }, streams: [{ codec_type: "video" }] });

    await expect(processor.probe("/tmp/x.png")).rejects.toThrow(/no audio stream/);
  });

  it("rejects output with no streams at all", async () => {
    ffprobeReturns({ format: { duration: "10" } });

    await expect(processor.probe("/tmp/x")).rejects.toBeInstanceOf(InvalidAudioError);
  });

  it.each([
    ["absent", {}],
    ["unparseable", { duration: "N/A" }],
    ["zero", { duration: "0" }],
    ["negative", { duration: "-5" }],
  ])("rejects a %s duration", async (_label, format) => {
    // Every one of these would otherwise sail through validation and fail
    // three services downstream as an unexplainable decode error.
    ffprobeReturns({ format, streams: [{ codec_type: "audio" }] });

    await expect(processor.probe("/tmp/x.wav")).rejects.toThrow(/usable duration/);
  });

  it("reports absent optional properties as null rather than guessing", async () => {
    ffprobeReturns({
      format: { duration: "15" },
      streams: [{ codec_type: "audio" }],
    });

    expect(await processor.probe("/tmp/x.wav")).toEqual({
      durationSeconds: 15,
      sampleRate: null,
      channels: null,
      codec: null,
      formatName: null,
    });
  });

  it("treats an unparseable sample rate as unknown", async () => {
    ffprobeReturns({
      format: { duration: "15", format_name: "wav" },
      streams: [{ codec_type: "audio", sample_rate: "N/A" }],
    });

    expect((await processor.probe("/tmp/x.wav")).sampleRate).toBeNull();
  });

  it("accepts a numeric duration as well as a string", async () => {
    ffprobeReturns({ format: { duration: 15.5 }, streams: [{ codec_type: "audio" }] });

    expect((await processor.probe("/tmp/x.wav")).durationSeconds).toBe(15.5);
  });

  it("turns a non-zero exit into a rejection, not a server fault", async () => {
    ffprobeFails(new Error("Invalid data found when processing input"));

    await expect(processor.probe("/tmp/x.wav")).rejects.toThrow(
      /could not read the file: Invalid data/
    );
  });

  it("handles a failure that is not an Error", async () => {
    ffprobeFails("ENOENT");

    await expect(processor.probe("/tmp/x.wav")).rejects.toThrow(/ENOENT/);
  });

  it("treats unparseable JSON as unreadable audio", async () => {
    execFile.mockImplementation(
      (_cmd: string, _args: string[], cb: ExecFileCallback) =>
        cb(null, { stdout: "not json", stderr: "" })
    );

    await expect(processor.probe("/tmp/x.wav")).rejects.toBeInstanceOf(InvalidAudioError);
  });
});
