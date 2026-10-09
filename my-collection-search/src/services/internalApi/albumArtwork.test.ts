import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http: httpMock }));

import {
  applyAlbumArtwork,
  fetchAlbumArtwork,
  fetchAlbumArtworkReview,
  previewAppleMusicArtwork,
  queueAlbumArtworkBackfill,
  uploadAlbumArtwork,
} from "./albumArtwork";

beforeEach(() => httpMock.mockReset().mockResolvedValue({}));

describe("album artwork client", () => {
  it("fetches the state, encoding the release id", async () => {
    await fetchAlbumArtwork("rel/1", 7);
    expect(httpMock).toHaveBeenCalledWith("/api/albums/rel%2F1/artwork?friend_id=7", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("previews the Apple Music art", async () => {
    await previewAppleMusicArtwork("r1", 7);
    expect(httpMock).toHaveBeenCalledWith("/api/albums/r1/artwork/preview?friend_id=7", {
      method: "POST",
    });
  });

  it("applies a source as JSON", async () => {
    await applyAlbumArtwork("r1", 7, "discogs");
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe("/api/albums/r1/artwork?friend_id=7");
    expect(init).toMatchObject({ method: "PUT", body: JSON.stringify({ source: "discogs" }) });
  });

  it("uploads the file as cover_art", async () => {
    const file = new File(["img"], "c.png", { type: "image/png" });
    await uploadAlbumArtwork("r1", 7, file);
    const [url, init] = httpMock.mock.calls[0];
    expect(url).toBe("/api/albums/r1/artwork/upload?friend_id=7");
    expect((init.body as FormData).get("cover_art")).toBeInstanceOf(File);
  });

  it("queues the backfill, with or without a friend", async () => {
    await queueAlbumArtworkBackfill({ friend_id: 7 });
    expect(httpMock.mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ friend_id: 7 }) });
    await queueAlbumArtworkBackfill();
    expect(httpMock.mock.calls[1][1]).toMatchObject({ body: "{}" });
  });

  it("lists the review, optionally for one friend", async () => {
    await fetchAlbumArtworkReview(7);
    expect(httpMock.mock.calls[0][0]).toBe("/api/albums/artwork/review?friend_id=7");
    await fetchAlbumArtworkReview();
    expect(httpMock.mock.calls[1][0]).toBe("/api/albums/artwork/review");
  });
});
