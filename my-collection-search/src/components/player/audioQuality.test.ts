import { describe, expect, it } from "vitest";
import { sampleTrack } from "@/stories/fixtures/track";
import { fileInfo, formatFileSize, formatSampleRate } from "./audioQuality";

describe("file info formatting", () => {
  it.each([
    ["alac", true, 24, 96000, null, "ALAC 24/96"],
    ["flac", true, 16, 44100, null, "FLAC 16/44.1"],
    ["aac", false, null, 44100, 256000, "AAC 256"],
    ["opus", false, null, 48000, 160000, "OPUS 160"],
    ["alac", true, null, null, null, "ALAC"],
    [null, null, null, null, null, "Quality unknown"],
  ])("formats %s", (codec, lossless, depth, rate, bitrate, label) => {
    expect(
      fileInfo({
        ...sampleTrack,
        local_audio_url: "/audio/a.flac",
        audio_codec: codec as string | null,
        audio_lossless: lossless as boolean | null,
        audio_bit_depth: depth as number | null,
        audio_sample_rate: rate as number | null,
        audio_bitrate: bitrate as number | null,
      }).label,
    ).toBe(label);
  });
  it.each([
    [null, "Unknown"],
    [0, "Unknown"],
    [-1, "Unknown"],
    ["bad", "Unknown"],
    [12500000, "12.5 MB"],
    ["1250000000", "1.25 GB"],
  ])("formats size %s", (value, label) => {
    expect(formatFileSize(value)).toBe(label);
  });
  it("formats rates in kHz", () => {
    expect(formatSampleRate(44100)).toBe("44.1 kHz");
    expect(formatSampleRate()).toBe("Unknown");
  });
  it("uses stored source and measured values only for local files", () => {
    const info = fileInfo({
      ...sampleTrack,
      local_audio_url: "/audio/a.flac",
      audio_source: "upload",
      audio_codec: "flac",
      audio_channels: 2,
    });
    expect(info.source).toBe("upload");
    expect(info.details).toContainEqual(["Channels", "2"]);
    expect(info.details).toContainEqual(["File name", "a.flac"]);
    expect(fileInfo({ ...sampleTrack, local_audio_url: "a" }).source).toBe("unknown");
  });
  it.each([
    ["https://music.apple.com/a", "", "", "apple_music", "AAC 256 · Stream"],
    ["", "https://youtube.com/a", "", "youtube", "Quality unknown · Stream"],
    ["", "", "https://soundcloud.com/a", "soundcloud", "Quality unknown · Stream"],
    ["", "", "", "unknown", "Quality unknown · Stream"],
  ])("labels streams without stale file metadata", (apple, youtube, soundcloud, source, label) => {
    const info = fileInfo({
      ...sampleTrack,
      local_audio_url: undefined,
      apple_music_url: apple,
      youtube_url: youtube,
      soundcloud_url: soundcloud,
      audio_codec: "flac",
      audio_sample_rate: 96000,
      audio_bit_depth: 24,
      audio_bitrate: 999000,
    });
    expect(info.source).toBe(source);
    expect(info.label).toBe(label);
    expect(info.details).toContainEqual(["Sample rate", "Not measured"]);
  });
});
