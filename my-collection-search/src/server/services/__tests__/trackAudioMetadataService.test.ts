import { describe, it, expect } from "vitest";
import { TrackAudioMetadataService, embeddedTagsFromProbe } from "../trackAudioMetadataService";

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

  it("does not treat TPE2 (album artist) as a composer", () => {
    expect(svc.extractComposerFromProbe({ format: { tags: { TPE2: "Mozart" } } })).toBeNull();
    expect(
      svc.extractComposerFromProbe({ format: { tags: { album_artist: "Mozart" } } }),
    ).toBeNull();
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

  it("ignores TPE2 even when a composer is present", () => {
    expect(
      svc.extractComposerFromProbe({ format: { tags: { composer: "Bach", TPE2: "Other" } } }),
    ).toBe("Bach");
  });
});

// ─── embeddedTagsFromProbe (#673) ─────────────────────────────────────────────
// Key shapes below are what ffprobe -show_format printed for real ffmpeg-made files:
// m4a and ID3 (v2.3 and v2.4) both surface lowercase composer/genre/lyrics; FLAC keeps
// the file's own upper case.

const tagsOf = (tags: Record<string, unknown>) => embeddedTagsFromProbe({ format: { tags } });

describe("embeddedTagsFromProbe", () => {
  it("reads an m4a (gamdl) file", () => {
    expect(
      tagsOf({
        composer: "Camilo Lara Alvarez & Eblis Javier Álvarez Vargas",
        genre: "Música tropical",
        lyrics: "la la",
        album_artist: "Camilo",
      }),
    ).toEqual({
      composer: "Camilo Lara Alvarez, Eblis Javier Álvarez Vargas",
      genres: ["Música tropical"],
      lyrics: "la la",
    });
  });

  it("reads an ID3 file (TCOM/TCON/USLT arrive as lowercase names)", () => {
    expect(tagsOf({ composer: "A;B", genre: "House", lyrics: "x", album_artist: "A" })).toEqual({
      composer: "A, B",
      genres: ["House"],
      lyrics: "x",
    });
  });

  it("matches Vorbis/FLAC upper-case keys and the UNSYNCEDLYRICS alias", () => {
    expect(tagsOf({ COMPOSER: "F", GENRE: "G", UNSYNCEDLYRICS: "u" })).toEqual({
      composer: "F",
      genres: ["G"],
      lyrics: "u",
    });
  });

  it("accepts raw frame ids and MP4 atom names when a muxer leaves them", () => {
    expect(tagsOf({ TCOM: "C", TCON: "Techno", USLT: "words" })).toEqual({
      composer: "C",
      genres: ["Techno"],
      lyrics: "words",
    });
    expect(tagsOf({ "©wrt": "W", "©gen": "Gen", "©lyr": "Lyr" })).toEqual({
      composer: "W",
      genres: ["Gen"],
      lyrics: "Lyr",
    });
  });

  it("falls back to stream tags (Ogg) when the format has none", () => {
    expect(
      embeddedTagsFromProbe({
        format: { tags: {} },
        streams: [{ tags: { composer: "S", genre: "Dub" } }, { tags: "bad" }, {}],
      }),
    ).toMatchObject({ composer: "S", genres: ["Dub"] });
  });

  it("lets format tags win over stream tags", () => {
    expect(
      embeddedTagsFromProbe({
        format: { tags: { composer: "Format" } },
        streams: [{ tags: { composer: "Stream" } }],
      }).composer,
    ).toBe("Format");
  });

  it("splits composers on ; / & , and NUL, dropping duplicates", () => {
    expect(tagsOf({ composer: "A/B; C & a ,D\u0000E" }).composer).toBe("A, B, C, D, E");
  });

  it("keeps a 'Last, First' composer unchanged", () => {
    expect(tagsOf({ composer: "Bach, J.S." }).composer).toBe("Bach, J.S.");
  });

  it("splits genres only on NUL and ';', keeping Apple names whole", () => {
    expect(tagsOf({ genre: "House;Techno\u0000House" }).genres).toEqual(["House", "Techno"]);
    expect(tagsOf({ genre: "Hip-Hop/Rap" }).genres).toEqual(["Hip-Hop/Rap"]);
    expect(tagsOf({ genre: "Drum & Bass" }).genres).toEqual(["Drum & Bass"]);
  });

  it("strips null bytes everywhere", () => {
    expect(tagsOf({ composer: "Ba\u0000ch", lyrics: "li\u0000ne" })).toMatchObject({
      composer: "Ba, ch",
      lyrics: "line",
    });
    expect(tagsOf({ composer: "\u0000", genre: "\u0000", lyrics: "\u0000" })).toEqual({
      composer: null,
      genres: [],
      lyrics: null,
    });
  });

  it("normalises lyric line endings and trims", () => {
    expect(tagsOf({ lyrics: "  one\r\ntwo\rthree\n " }).lyrics).toBe("one\ntwo\nthree");
  });

  it("returns empty tags for missing, blank or non-string values", () => {
    const empty = { composer: null, genres: [], lyrics: null };
    expect(embeddedTagsFromProbe(null)).toEqual(empty);
    expect(embeddedTagsFromProbe({})).toEqual(empty);
    expect(tagsOf({})).toEqual(empty);
    expect(tagsOf({ composer: "  ", genre: "", lyrics: "\n" })).toEqual(empty);
    expect(tagsOf({ composer: 5, genre: ["x"], lyrics: null })).toEqual(empty);
  });

  it("skips a blank earlier alias for a later one", () => {
    expect(tagsOf({ lyrics: " ", unsyncedlyrics: "u" }).lyrics).toBe("u");
  });
});
