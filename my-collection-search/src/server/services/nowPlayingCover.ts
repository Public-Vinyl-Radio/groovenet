import sharp from "sharp";

/**
 * About 240px, like shairport-sync's `publish_cover` — small enough for an
 * ESP32 to decode in memory. A grayscale/dithered version for e-ink is #465's
 * explicit out-of-scope follow-up.
 */
const COVER_WIDTH = 240;

/**
 * Fetch and downsize a cover to a small baseline JPEG for the `cover` topic.
 *
 * Best-effort: a slow or unreachable image host, a non-image response, or a
 * relative path we have no origin to resolve costs a missing cover, never a
 * failed publish. Only absolute http(s) URLs are attempted — a path like
 * `/images/placeholder-artwork.png` has no meaning outside a browser here.
 */
export async function resizeCoverArt(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return await sharp(bytes)
      .resize({ width: COVER_WIDTH, withoutEnlargement: true })
      .jpeg({ progressive: false })
      .toBuffer();
  } catch (error) {
    console.error(`[now-playing] cover resize failed for ${url}:`, error);
    return null;
  }
}
