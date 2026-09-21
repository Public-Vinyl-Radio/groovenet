import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * What ffprobe found in an uploaded file (#275).
 *
 * Deliberately narrow: the ingest route needs to know whether this is audio at
 * all, and the properties `fingerprint-service` will want on the queue job.
 */
export type ProbedAudio = {
  durationSeconds: number;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  formatName: string | null;
};

export class InvalidAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAudioError";
  }
}

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string | number;
  channels?: number;
  duration?: string | number;
};

type FfprobeOutput = {
  streams?: FfprobeStream[];
  format?: { duration?: string | number; format_name?: string };
};

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Inspects uploaded audio with ffprobe.
 *
 * A class with one injectable seam rather than a bare function, because every
 * test that is *not* about decoding would otherwise have to shell out to
 * ffprobe to get past validation.
 */
export class AudioProcessor {
  /**
   * Probe a file, or reject it as not-audio.
   *
   * The filename is never consulted. A listener device sending `chunk.wav`
   * with a JPEG inside, or a truncated upload that stops mid-header, has to
   * fail here rather than three services downstream where the only symptom is
   * a decode error against an ingest nobody can explain.
   */
  async probe(filePath: string): Promise<ProbedAudio> {
    let output: FfprobeOutput;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ]);
      output = JSON.parse(stdout) as FfprobeOutput;
    } catch (error) {
      // A non-zero exit means ffprobe could not make sense of the file, which
      // is the answer we wanted, not a server fault.
      throw new InvalidAudioError(
        `ffprobe could not read the file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const audio = (output.streams ?? []).find(
      (stream) => stream.codec_type === "audio"
    );
    if (!audio) {
      throw new InvalidAudioError("the file contains no audio stream");
    }

    // Prefer the container's duration: a stream's own is often absent for the
    // WAV a capture device produces.
    const duration =
      toNumber(output.format?.duration) ?? toNumber(audio.duration);
    if (duration === null || duration <= 0) {
      throw new InvalidAudioError("the audio stream has no usable duration");
    }

    return {
      durationSeconds: duration,
      sampleRate: toNumber(audio.sample_rate),
      channels: audio.channels ?? null,
      codec: audio.codec_name ?? null,
      formatName: output.format?.format_name ?? null,
    };
  }
}

export const audioProcessor = new AudioProcessor();
