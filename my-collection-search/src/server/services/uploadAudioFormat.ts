import { audioFieldsFromProbe } from "@/server/services/trackAudioMetadataService";

/**
 * How an uploaded track is stored (#1155), decided from what ffprobe found in
 * the file, never from its name.
 *
 * - `keep`: the uploaded bytes are stored as they are (FLAC, or a lossy file
 *   in a container browsers play), so nothing is re-encoded.
 * - `flac`: lossless audio in another container (WAV, AIFF, ALAC) is
 *   converted to FLAC, which loses nothing.
 */
export type UploadStorage = {
  action: "keep" | "flac";
  /** Extension of the stored file, without the dot. */
  extension: string;
  lossless: boolean;
};

/** Lossy containers kept as uploaded, keyed by `audioFieldsFromProbe`'s container. */
const LOSSY_CONTAINER_EXTENSIONS: Record<string, string> = {
  mp3: "mp3",
  m4a: "m4a",
  aac: "aac",
  ogg: "ogg",
  webm: "webm",
};

/**
 * The storage plan for a probed upload, or `null` when the file holds no audio
 * stream or is lossy audio in a container this app does not serve.
 */
export function uploadStorageFor(probe: unknown): UploadStorage | null {
  const { audio_codec, audio_container, audio_lossless } = audioFieldsFromProbe(probe);
  if (audio_codec === null) return null;

  if (audio_lossless) {
    const isFlacFile = audio_codec === "flac" && audio_container === "flac";
    return { action: isFlacFile ? "keep" : "flac", extension: "flac", lossless: true };
  }

  const extension = audio_container ? LOSSY_CONTAINER_EXTENSIONS[audio_container] : undefined;
  return extension ? { action: "keep", extension, lossless: false } : null;
}
