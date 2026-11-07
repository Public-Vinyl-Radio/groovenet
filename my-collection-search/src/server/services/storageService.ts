import { statfs } from "node:fs/promises";
import type { StorageResponse } from "@groovenet/contracts";

import { trackRepository } from "@/server/repositories/trackRepository";

/** Free space on the audio volume, or null when it cannot be read. */
async function readDisk(audioBytes: number): Promise<StorageResponse["disk"]> {
  try {
    const dir = process.env.AUDIO_DIR || "/app/audio";
    const s = await statfs(/* turbopackIgnore: true */ dir);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    const used = Math.max(0, total - Number(s.bfree) * Number(s.bsize));
    const audio = Math.min(audioBytes, used);
    return {
      total_bytes: total,
      audio_bytes: audio,
      other_bytes: used - audio,
      free_bytes: free,
    };
  } catch {
    return null;
  }
}

export const storageService = {
  async getStorage(): Promise<StorageResponse> {
    const stats = await trackRepository.getStorageStats();
    const sum = (rows: { size_bytes: number }[]) => rows.reduce((n, r) => n + r.size_bytes, 0);
    const lossless = stats.by_codec.filter((r) => r.lossless === true);
    const size = sum(stats.by_codec);
    return {
      totals: {
        tracks: stats.tracks,
        files: stats.by_codec.reduce((n, r) => n + r.files, 0),
        size_bytes: size,
        lossless_files: lossless.reduce((n, r) => n + r.files, 0),
        lossless_size_bytes: sum(lossless),
        unprobed_files: stats.by_codec
          .filter((r) => r.codec === null)
          .reduce((n, r) => n + r.files, 0),
      },
      by_source: stats.by_source,
      by_codec: stats.by_codec,
      disk: await readDisk(size),
    };
  },
};
