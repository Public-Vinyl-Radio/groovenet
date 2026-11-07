import { describe, expect, it } from "vitest";
import { classifyAudioSource } from "../audioSourceClassifier";

const probe = (
  tags: Record<string, string> = {},
  opts: { codec?: string; format?: string; streamTags?: Record<string, string> } = {},
) => ({
  streams: [{ codec_type: "audio", codec_name: opts.codec ?? "aac", tags: opts.streamTags }],
  format: { format_name: opts.format ?? "mov,mp4,m4a,3gp,3g2,mj2", tags },
});

describe("classifyAudioSource", () => {
  it.each([
    ["an iTunes ID atom", { apID: "x@y.com" }],
    ["a cnID atom", { cnID: "123" }],
    ["iTunSMPB", { iTunSMPB: " 00000000 00000840" }],
    ["a com.apple.iTunes key", { "com.apple.iTunes:foo": "1" }],
  ])("recognises Apple Music by %s", (_name, tags) => {
    expect(classifyAudioSource(probe(tags), "1-A1.m4a").source).toBe("apple_music");
  });

  it("recognises Apple Music by the Core Media handler on the stream", () => {
    const result = classifyAudioSource(
      probe({}, { streamTags: { handler_name: "Core Media Audio" } }),
      "1-A1.m4a",
    );
    expect(result).toMatchObject({ source: "apple_music", reason: "Core Media handler" });
  });

  it.each([
    ["purl", { purl: "https://www.youtube.com/watch?v=abc" }, "youtube"],
    ["comment", { comment: "https://youtu.be/abc" }, "youtube"],
    ["description", { description: "https://music.youtube.com/watch?v=abc" }, "youtube"],
    ["purl", { purl: "https://soundcloud.com/a/b" }, "soundcloud"],
  ])("recognises a %s url", (_key, tags, source) => {
    expect(classifyAudioSource(probe(tags), "1-A1.m4a").source).toBe(source);
  });

  it("ignores unrelated urls and comments", () => {
    const result = classifyAudioSource(probe({ comment: "(Live at the Fillmore East)" }), "x.m4a");
    expect(result.source).toBe("unknown");
  });

  it("recognises yt-dlp's m4a by the Google handler", () => {
    const result = classifyAudioSource(
      probe({ handler_name: "ISO Media file produced by Google Inc. Created on: 03/10/2021." }),
      "10260919-A2.m4a",
    );
    expect(result).toMatchObject({ source: "youtube", reason: "Google handler" });
  });

  it("recognises yt-dlp's file name pattern", () => {
    expect(classifyAudioSource(probe(), "/audio/Some Title [dQw4w9WgXcQ].m4a").source).toBe(
      "youtube",
    );
  });

  it("recognises the upload route's file names", () => {
    expect(classifyAudioSource(probe(), "audio_1767225600000_123456.m4a").source).toBe("upload");
    expect(classifyAudioSource(probe(), "audio_1767225600000_123456.mp3").source).toBe("upload");
    expect(classifyAudioSource(probe(), "audio_1767225600000_123456.wav").source).toBe("unknown");
  });

  it("puts Apple ahead of YouTube when both signals appear", () => {
    const result = classifyAudioSource(probe({ apID: "a", purl: "https://youtu.be/x" }), "x.m4a");
    expect(result.source).toBe("apple_music");
  });

  it("counts Opus and WebM with no other signal as a weak YouTube hint", () => {
    const opus = classifyAudioSource(probe({}, { codec: "opus", format: "ogg" }), "a.opus");
    expect(opus).toMatchObject({ source: "unknown", weakYoutubeHint: true });
    const webm = classifyAudioSource(probe({}, { codec: "vorbis", format: "matroska,webm" }), "a");
    expect(webm.weakYoutubeHint).toBe(true);
  });

  it("is unknown with no hint for plain files and empty probes", () => {
    expect(classifyAudioSource(probe({}, { codec: "flac", format: "flac" }), "a.flac")).toEqual({
      source: "unknown",
      reason: "no signal",
      weakYoutubeHint: false,
    });
    expect(classifyAudioSource(null, "a.m4a").source).toBe("unknown");
    expect(
      classifyAudioSource({ format: { tags: { n: 1 as unknown as string } } }, "a").source,
    ).toBe("unknown");
  });
});
