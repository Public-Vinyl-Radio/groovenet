import { describe, expect, it } from "vitest";
import type { Track } from "@/types/track";
import {
  artworkAlt,
  artworkOf,
  queueSummary,
  trackDurationLabel,
  trackMetaLine,
} from "@/components/player/trackMeta";

const t = (over: Partial<Track>) => ({ title: "T", artist: "A", ...over }) as Track;

describe("trackMeta", () => {
  it("joins position, BPM and Camelot key, skipping what's unknown", () => {
    expect(trackMetaLine(t({ position: "A1", bpm: "133.6", key: "D minor" }))).toBe(
      "A1 · 134 BPM · 7A",
    );
    expect(trackMetaLine(t({ position: "", bpm: null, key: "8A" }))).toBe("8A");
    expect(trackMetaLine(t({ position: "B2", bpm: null, key: null }))).toBe("B2");
    expect(trackMetaLine(t({ position: undefined, bpm: "120", key: null }))).toBe("120 BPM");
    expect(trackMetaLine(null)).toBe("");
  });

  it("formats durations and the queue summary", () => {
    expect(trackDurationLabel(t({ duration_seconds: 242 }))).toBe("4:02");
    expect(trackDurationLabel(t({ duration: "" }))).toBe("");
    expect(queueSummary([t({ duration_seconds: 60 }), t({ duration: "1:30" })])).toBe(
      "2 tracks · 2:30",
    );
    expect(queueSummary([t({})])).toBe("1 track · 0:00");
  });

  it("prefers the audio file's art, and names it artist - title", () => {
    expect(artworkOf(t({ audio_file_album_art_url: "a.jpg", album_thumbnail: "b.jpg" }))).toBe(
      "a.jpg",
    );
    expect(artworkOf(t({ album_thumbnail: "b.jpg" }))).toBe("b.jpg");
    expect(artworkOf(null)).toBeNull();
    expect(artworkOf(undefined)).toBeNull();
    expect(artworkOf(t({ audio_file_album_art_url: "", album_thumbnail: "b.jpg" }))).toBe("b.jpg");
    expect(artworkOf(t({ audio_file_album_art_url: "   ", album_thumbnail: "b.jpg" }))).toBe(
      "b.jpg",
    );
    expect(artworkOf(t({ audio_file_album_art_url: "", album_thumbnail: "" }))).toBeNull();
    expect(artworkAlt(t({}))).toBe("A - T");
    expect(artworkAlt(null)).toBe("Artwork");
  });
});
