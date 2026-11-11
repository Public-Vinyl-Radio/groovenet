import { describe, expect, it } from "vitest";
import { uploadStorageFor } from "../uploadAudioFormat";

const probe = (codec: string | null, formatName?: string) => ({
  streams: codec ? [{ codec_type: "audio", codec_name: codec }] : [{ codec_type: "video" }],
  format: formatName ? { format_name: formatName } : {},
});

describe("uploadStorageFor (#1155)", () => {
  it("keeps FLAC in a FLAC file", () => {
    expect(uploadStorageFor(probe("flac", "flac"))).toEqual({
      action: "keep",
      extension: "flac",
      lossless: true,
    });
  });

  it.each([
    ["FLAC in Ogg", "flac", "ogg"],
    ["PCM in WAV", "pcm_s24le", "wav"],
    ["PCM in AIFF", "pcm_s16be", "aiff"],
    ["ALAC in MP4", "alac", "mov,mp4,m4a,3gp,3g2,mj2"],
    ["WavPack", "wavpack", "wv"],
  ])("converts %s to FLAC", (_kind, codec, formatName) => {
    expect(uploadStorageFor(probe(codec, formatName))).toEqual({
      action: "flac",
      extension: "flac",
      lossless: true,
    });
  });

  it.each([
    ["mp3", "mp3", "mp3"],
    ["aac", "mov,mp4,m4a,3gp,3g2,mj2", "m4a"],
    ["aac", "aac", "aac"],
    ["vorbis", "ogg", "ogg"],
    ["opus", "matroska,webm", "webm"],
  ])("keeps %s in %s as .%s", (codec, formatName, extension) => {
    expect(uploadStorageFor(probe(codec, formatName))).toEqual({
      action: "keep",
      extension,
      lossless: false,
    });
  });

  it("refuses lossy audio in a container the app does not serve", () => {
    expect(uploadStorageFor(probe("wmav2", "asf"))).toBeNull();
  });

  it("refuses lossy audio with no container", () => {
    expect(uploadStorageFor(probe("mp3"))).toBeNull();
  });

  it("refuses a file with no audio stream", () => {
    expect(uploadStorageFor(probe(null, "image2"))).toBeNull();
    expect(uploadStorageFor(undefined)).toBeNull();
  });
});
