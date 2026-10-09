import sharp from "sharp";

/**
 * Perceptual image hashing for album artwork matching (#494).
 *
 * A 64-bit pHash: shrink to 32×32 greyscale, take the 2-D DCT, keep the 8×8
 * lowest-frequency coefficients (minus the DC term) and set a bit for each one
 * above their median. Two scans of the same cover — a 150px Discogs thumb and
 * a 1400px Apple Music master, differently compressed — land a few bits apart;
 * a different pressing's sleeve lands far apart.
 */

const SAMPLE_SIZE = 32;
const HASH_SIZE = 8;

/**
 * Hamming distance at or below which two covers count as the same artwork.
 * 10 of 64 bits is the usual pHash cut-off: resizing and re-encoding stay well
 * under it, while a reissue with a different sleeve is typically 20+ bits off.
 */
export const ARTWORK_MATCH_MAX_DISTANCE = 10;

let cosineTable: number[][] | null = null;

function getCosineTable(): number[][] {
  if (cosineTable) return cosineTable;
  cosineTable = [];
  for (let u = 0; u < HASH_SIZE; u += 1) {
    const row: number[] = [];
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      row.push(Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SAMPLE_SIZE)));
    }
    cosineTable.push(row);
  }
  return cosineTable;
}

/** pHash of raw greyscale pixels, SAMPLE_SIZE × SAMPLE_SIZE, as 16 hex chars. */
export function perceptualHashFromPixels(pixels: ArrayLike<number>): string {
  if (pixels.length !== SAMPLE_SIZE * SAMPLE_SIZE) {
    throw new Error(`Expected ${SAMPLE_SIZE * SAMPLE_SIZE} pixels, got ${pixels.length}`);
  }
  const cos = getCosineTable();

  const coefficients: number[] = [];
  for (let u = 0; u < HASH_SIZE; u += 1) {
    for (let v = 0; v < HASH_SIZE; v += 1) {
      let sum = 0;
      for (let y = 0; y < SAMPLE_SIZE; y += 1) {
        for (let x = 0; x < SAMPLE_SIZE; x += 1) {
          sum += pixels[y * SAMPLE_SIZE + x] * cos[u][y] * cos[v][x];
        }
      }
      coefficients.push(sum);
    }
  }

  // The DC term is overall brightness, not structure; leave it out of the
  // median. That leaves 63 values, so the median is the middle one.
  const sorted = coefficients.slice(1).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  let hash = 0n;
  for (const value of coefficients) {
    hash = (hash << 1n) | (value > median ? 1n : 0n);
  }
  return hash.toString(16).padStart(16, "0");
}

export async function perceptualHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "fill" })
    .raw()
    .toBuffer();
  return perceptualHashFromPixels(pixels);
}

export function hammingDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
