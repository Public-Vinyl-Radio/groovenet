import { describe, it, expect } from "vitest";
import { TrackAudioMetadataService } from "../trackAudioMetadataService";

const svc = new TrackAudioMetadataService();

// ─── normalizeAudioFilename ───────────────────────────────────────────────────

describe("normalizeAudioFilename", () => {
  it("trims whitespace", () => {
    expect(svc.normalizeAudioFilename("  track.mp3  ")).toBe("track.mp3");
  });

  it("decodes URL-encoded characters", () => {
    expect(svc.normalizeAudioFilename("my%20track.mp3")).toBe("my track.mp3");
    expect(svc.normalizeAudioFilename("artist%2Ftrack.mp3")).toBe("artist/track.mp3");
  });

  it("extracts basename from a plain http URL", () => {
    expect(svc.normalizeAudioFilename("http://localhost/audio/track.mp3")).toBe("track.mp3");
  });

  it("extracts basename from a plain https URL", () => {
    expect(svc.normalizeAudioFilename("https://example.com/files/song.flac")).toBe("song.flac");
  });

  it("uses ?filename= query param when present in URL", () => {
    expect(svc.normalizeAudioFilename("https://example.com/proxy?filename=my%20song.mp3")).toBe(
      "my song.mp3",
    );
  });

  it("strips leading slashes", () => {
    expect(svc.normalizeAudioFilename("///track.mp3")).toBe("track.mp3");
  });

  it("strips app/audio/ prefix", () => {
    expect(svc.normalizeAudioFilename("app/audio/track.mp3")).toBe("track.mp3");
  });

  it("strips audio/ prefix", () => {
    expect(svc.normalizeAudioFilename("audio/track.mp3")).toBe("track.mp3");
  });

  it("keeps malformed URL encoding and uses raw value", () => {
    // decodeURIComponent throws on invalid sequences → falls back to raw
    const raw = "track%GGbad.mp3";
    expect(svc.normalizeAudioFilename(raw)).toBe("track%GGbad.mp3");
  });

  it("handles plain filename with no transformations needed", () => {
    expect(svc.normalizeAudioFilename("track.mp3")).toBe("track.mp3");
  });
});

// ─── getAttachedPicStream ─────────────────────────────────────────────────────

describe("getAttachedPicStream", () => {
  it("returns null for null input", () => {
    expect(svc.getAttachedPicStream(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(svc.getAttachedPicStream("not-an-object")).toBeNull();
    expect(svc.getAttachedPicStream(42)).toBeNull();
  });

  it("returns null when probe has no streams", () => {
    expect(svc.getAttachedPicStream({ format: {} })).toBeNull();
    expect(svc.getAttachedPicStream({ streams: [] })).toBeNull();
  });

  it("returns a stream with disposition.attached_pic === 1", () => {
    const stream = { codec_type: "video", disposition: { attached_pic: 1 } };
    const probe = { streams: [stream] };
    expect(svc.getAttachedPicStream(probe)).toBe(stream);
  });

  it("returns a video stream with disposition.default === 0", () => {
    const stream = { codec_type: "video", disposition: { attached_pic: 0, default: 0 } };
    const probe = { streams: [stream] };
    expect(svc.getAttachedPicStream(probe)).toBe(stream);
  });

  it("ignores non-cover audio streams", () => {
    const probe = {
      streams: [{ codec_type: "audio", disposition: { attached_pic: 0, default: 1 } }],
    };
    expect(svc.getAttachedPicStream(probe)).toBeNull();
  });

  it("returns the first matching stream when multiple exist", () => {
    const cover = { codec_type: "video", disposition: { attached_pic: 1 } };
    const other = { codec_type: "video", disposition: { attached_pic: 1 } };
    expect(svc.getAttachedPicStream({ streams: [cover, other] })).toBe(cover);
  });
});

// ─── extractYearFromProbe ─────────────────────────────────────────────────────

describe("extractYearFromProbe", () => {
  it("returns null for null probe", () => {
    expect(svc.extractYearFromProbe(null)).toBeNull();
  });

  it("returns null when probe has no format", () => {
    expect(svc.extractYearFromProbe({ streams: [] })).toBeNull();
  });

  it("returns null when format has no tags", () => {
    expect(svc.extractYearFromProbe({ format: {} })).toBeNull();
  });

  it("extracts year from format.tags.date (plain year)", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { date: "1995" } } })).toBe(1995);
  });

  it("extracts year from format.tags.date (ISO date)", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { date: "1995-06-15" } } })).toBe(1995);
  });

  it("extracts year from format.tags.year", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { year: "2001" } } })).toBe(2001);
  });

  it("extracts year from format.tags.originaldate", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { originaldate: "1988" } } })).toBe(1988);
  });

  it("prefers 'date' over 'year' tag", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { date: "1995", year: "2000" } } })).toBe(
      1995,
    );
  });

  it("falls back to scanning other tag values", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { comment: "Recorded in 2003" } } })).toBe(
      2003,
    );
  });

  it("returns null when no tag contains a valid year", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { title: "No Year Here" } } })).toBeNull();
  });

  it("rejects years outside 1800–2100", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { date: "1799" } } })).toBeNull();
    expect(svc.extractYearFromProbe({ format: { tags: { date: "2101" } } })).toBeNull();
  });

  it("accepts boundary years 1800 and 2100", () => {
    expect(svc.extractYearFromProbe({ format: { tags: { date: "1800" } } })).toBe(1800);
    expect(svc.extractYearFromProbe({ format: { tags: { date: "2100" } } })).toBe(2100);
  });
});

// ─── extractComposerFromProbe ─────────────────────────────────────────────────

describe("extractComposerFromProbe", () => {
  it("returns null for null probe", () => {
    expect(svc.extractComposerFromProbe(null)).toBeNull();
  });

  it("returns null when probe has no format tags", () => {
    expect(svc.extractComposerFromProbe({ format: {} })).toBeNull();
  });

  it("returns composer from 'composer' tag (lowercase)", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { composer: "Bach" } } })).toBe("Bach");
  });

  it("returns composer from 'COMPOSER' tag (uppercase)", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { COMPOSER: "Beethoven" } } })).toBe(
      "Beethoven",
    );
  });

  it("returns composer from TPE2 tag", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { TPE2: "Mozart" } } })).toBe("Mozart");
  });

  it("returns composer from TCOM tag", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { TCOM: "Handel" } } })).toBe("Handel");
  });

  it("trims whitespace from composer value", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { composer: "  Bach  " } } })).toBe(
      "Bach",
    );
  });

  it("returns null for empty composer string", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { composer: "   " } } })).toBeNull();
  });

  it("prefers 'composer' key over TPE2", () => {
    expect(
      svc.extractComposerFromProbe({ format: { tags: { composer: "Bach", TPE2: "Other" } } }),
    ).toBe("Bach");
  });
});
