import { expect, it } from "vitest";
import { coverUrlSql } from "../coverUrlSql";
it("prefers nonblank chosen art over Discogs without changing the stored field", () => {
  expect(coverUrlSql("t")).toBe(
    "COALESCE(NULLIF(btrim(t.audio_file_album_art_url), ''), t.album_thumbnail)",
  );
});
it("falls back to the first nonblank track cover for the same album and owner", () => {
  const sql = coverUrlSql("a", true);
  expect(sql).toContain("COALESCE(NULLIF(btrim(a.audio_file_album_art_url), ''), (SELECT");
  expect(sql).toContain("cover_track.release_id = a.release_id");
  expect(sql).toContain("cover_track.friend_id = a.friend_id");
  expect(sql).toContain("NULLIF(btrim(cover_track.audio_file_album_art_url), '') IS NOT NULL");
  expect(sql).toContain("ORDER BY cover_track.id ASC LIMIT 1), a.album_thumbnail)");
});
