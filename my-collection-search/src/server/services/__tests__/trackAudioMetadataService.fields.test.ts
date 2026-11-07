import { afterEach, describe, expect, it, vi } from "vitest";
import { audioFieldsFromProbe, TrackAudioMetadataService } from "../trackAudioMetadataService";
import alac from "./fixtures/audio-metadata/alac-24-96.json";
import aac from "./fixtures/audio-metadata/aac-256.json";
import opus from "./fixtures/audio-metadata/opus.json";
import flac from "./fixtures/audio-metadata/flac.json";
import mp3 from "./fixtures/audio-metadata/mp3.json";
import wav from "./fixtures/audio-metadata/wav.json";

afterEach(() => vi.restoreAllMocks());

describe("audioFieldsFromProbe", () => {
  it.each([
    [alac, "alac", "m4a", true, 24, 96000],
    [aac, "aac", "m4a", false, null, 44100],
    [opus, "opus", "webm", false, null, 48000],
    [flac, "flac", "flac", true, 16, 44100],
    [mp3, "mp3", "mp3", false, null, 44100],
    [wav, "pcm_s24le", "wav", true, 24, 44100],
  ])("reads a real %s probe", (probe, codec, container, lossless, depth, rate) => {
    expect(audioFieldsFromProbe(probe)).toMatchObject({
      audio_codec: codec,
      audio_container: container,
      audio_lossless: lossless,
      audio_bit_depth: depth,
      audio_sample_rate: rate,
      audio_channels: 2,
      audio_size_bytes: Number(probe.format.size),
      audio_bitrate: Number(
        "bit_rate" in probe.streams[0] ? probe.streams[0].bit_rate : probe.format.bit_rate,
      ),
      audio_probed_at: expect.any(String),
    });
  });

  it("handles missing fields and skips cover art", () => {
    expect(audioFieldsFromProbe(null)).toMatchObject({
      audio_codec: null,
      audio_container: null,
      audio_lossless: null,
      audio_bitrate: null,
      audio_size_bytes: null,
      audio_channels: null,
      audio_sample_rate: null,
      audio_bit_depth: null,
    });
    expect(
      audioFieldsFromProbe({
        streams: [
          { codec_type: "video", codec_name: "png" },
          {
            codec_type: "audio",
            codec_name: "flac",
            sample_fmt: "s32",
            bits_per_raw_sample: "N/A",
            bit_rate: "0",
            sample_rate: "invalid",
          },
        ],
        format: { bit_rate: "1000" },
      }),
    ).toMatchObject({
      audio_codec: "flac",
      audio_bit_depth: 32,
      audio_bitrate: 1000,
      audio_sample_rate: null,
    });
    expect(
      audioFieldsFromProbe({ streams: [{ codec_type: "audio", codec_name: "flac" }] })
        .audio_bit_depth,
    ).toBeNull();
  });
});

it("derives PCM depth from the codec before its wider decoding format", () => {
  expect(
    audioFieldsFromProbe({
      streams: [
        {
          codec_type: "audio",
          codec_name: "pcm_s24le",
          sample_fmt: "s32",
          sample_rate: 96000,
          channels: 2,
          bit_rate: 4608000,
        },
      ],
    }),
  ).toMatchObject({ audio_bit_depth: 24, audio_sample_rate: 96000, audio_bitrate: 4608000 });
  expect(
    audioFieldsFromProbe({
      streams: [{ codec_type: "audio", codec_name: "flac", sample_fmt: "unknown" }],
    }).audio_bit_depth,
  ).toBeNull();
});

describe("fieldsForLocalAudio", () => {
  it("probes a new file and defaults its source to unknown", async () => {
    const service = new TrackAudioMetadataService();
    vi.spyOn(service, "resolveAudioFilePath").mockReturnValue("/audio/test.m4a");
    const probe = vi.spyOn(service, "runFfprobe").mockResolvedValue(alac);
    expect(await service.fieldsForLocalAudio("test.m4a")).toMatchObject({
      audio_source: "unknown",
      audio_codec: "alac",
    });
    expect(await service.fieldsForLocalAudio("test.m4a", "upload")).toMatchObject({
      audio_source: "upload",
    });
    expect(probe).toHaveBeenCalledWith("/audio/test.m4a");
  });
  it.each([null, ""])("clears every field when removing %s", async (filename) => {
    const fields = await new TrackAudioMetadataService().fieldsForLocalAudio(filename, "youtube");
    expect(Object.keys(fields)).toHaveLength(10);
    expect(Object.values(fields).every((value) => value === null)).toBe(true);
  });
  it("rejects missing files and propagates probe failures before persistence", async () => {
    const service = new TrackAudioMetadataService();
    const resolve = vi.spyOn(service, "resolveAudioFilePath").mockReturnValue(null);
    await expect(service.fieldsForLocalAudio("missing")).rejects.toThrow(
      "Local audio file not found",
    );
    resolve.mockReturnValue("/audio/broken");
    vi.spyOn(service, "runFfprobe").mockRejectedValue(new Error("probe failed"));
    await expect(service.fieldsForLocalAudio("broken")).rejects.toThrow("probe failed");
  });
});
