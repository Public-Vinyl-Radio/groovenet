import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sharpInstance = vi.hoisted(() => ({
  resize: vi.fn(),
  jpeg: vi.fn(),
  toBuffer: vi.fn(),
}));
sharpInstance.resize.mockReturnValue(sharpInstance);
sharpInstance.jpeg.mockReturnValue(sharpInstance);

const sharpFactory = vi.hoisted(() => vi.fn(() => sharpInstance));
vi.mock("sharp", () => ({ default: sharpFactory }));

import { resizeCoverArt } from "../nowPlayingCover";

const originalFetch = global.fetch;

describe("resizeCoverArt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpInstance.resize.mockReturnValue(sharpInstance);
    sharpInstance.jpeg.mockReturnValue(sharpInstance);
    sharpInstance.toBuffer.mockResolvedValue(Buffer.from("resized-jpeg"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null for a null or missing url", async () => {
    expect(await resizeCoverArt(null)).toBeNull();
    expect(await resizeCoverArt(undefined)).toBeNull();
    expect(sharpFactory).not.toHaveBeenCalled();
  });

  it("returns null for a non-absolute url, which has no origin here", async () => {
    expect(await resizeCoverArt("/images/placeholder-artwork.png")).toBeNull();
    expect(sharpFactory).not.toHaveBeenCalled();
  });

  it("fetches and resizes an absolute url to a small baseline JPEG", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });

    const result = await resizeCoverArt("https://example.com/cover.jpg");

    expect(global.fetch).toHaveBeenCalledWith("https://example.com/cover.jpg");
    expect(sharpInstance.resize).toHaveBeenCalledWith({ width: 240, withoutEnlargement: true });
    expect(sharpInstance.jpeg).toHaveBeenCalledWith({ progressive: false });
    expect(result).toEqual(Buffer.from("resized-jpeg"));
  });

  it("returns null when the fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    expect(await resizeCoverArt("https://example.com/cover.jpg")).toBeNull();
  });

  it("swallows and logs a network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("DNS failure"));

    const result = await resizeCoverArt("https://example.com/cover.jpg");

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cover resize failed"),
      expect.any(Error)
    );
  });

  it("swallows and logs a decode/resize failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    sharpInstance.toBuffer.mockRejectedValue(new Error("unsupported image format"));

    const result = await resizeCoverArt("https://example.com/cover.jpg");

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cover resize failed"),
      expect.any(Error)
    );
  });
});
