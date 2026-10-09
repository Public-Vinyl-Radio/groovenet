import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ARTWORK_MATCH_MAX_DISTANCE,
  hammingDistance,
  perceptualHash,
  perceptualHashFromPixels,
} from "../imageHash";

/** A synthetic "cover": a gradient with a few blocks, drawn at any size. */
async function cover(size: number, variant: "a" | "b"): Promise<Buffer> {
  const shapes =
    variant === "a"
      ? `<rect x="10%" y="10%" width="35%" height="35%" fill="#d33"/>
         <circle cx="70%" cy="70%" r="20%" fill="#fff"/>`
      : `<rect x="55%" y="5%" width="40%" height="80%" fill="#111"/>
         <circle cx="25%" cy="75%" r="15%" fill="#ee0"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#235"/><stop offset="1" stop-color="#9bd"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("perceptualHash", () => {
  it("is a 16-hex-digit hash, identical for the same image", async () => {
    const image = await cover(300, "a");
    const hash = await perceptualHash(image);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(await perceptualHash(image)).toBe(hash);
  });

  it("matches a small Discogs-style thumb against a large re-encoded master", async () => {
    const master = await sharp(await cover(1400, "a")).jpeg({ quality: 95 }).toBuffer();
    const thumb = await sharp(await cover(150, "a")).jpeg({ quality: 60 }).toBuffer();
    const distance = hammingDistance(await perceptualHash(master), await perceptualHash(thumb));
    expect(distance).toBeLessThanOrEqual(ARTWORK_MATCH_MAX_DISTANCE);
  });

  it("tells a different cover apart", async () => {
    const distance = hammingDistance(
      await perceptualHash(await cover(600, "a")),
      await perceptualHash(await cover(600, "b"))
    );
    expect(distance).toBeGreaterThan(ARTWORK_MATCH_MAX_DISTANCE);
  });

  it("rejects pixel data of the wrong size", () => {
    expect(() => perceptualHashFromPixels(new Uint8Array(10))).toThrow("Expected 1024 pixels");
  });
});

describe("hammingDistance", () => {
  it("counts differing bits", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "000000000000000f")).toBe(4);
    expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
  });
});
