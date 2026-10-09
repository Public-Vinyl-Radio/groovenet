import { promisify } from "util";
import { describe, expect, it, vi } from "vitest";

const execFileAsync = vi.hoisted(() => vi.fn());
vi.mock("child_process", async () => {
  const execFile = Object.assign(vi.fn(), { [promisify.custom]: execFileAsync });
  return { execFile, default: { execFile } };
});

import { TrackAudioMetadataService } from "../trackAudioMetadataService";

describe("extractAttachedPic", () => {
  it("decodes the attached picture stream to PNG on stdout", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    execFileAsync.mockResolvedValue({ stdout: png, stderr: Buffer.alloc(0) });

    const result = await new TrackAudioMetadataService().extractAttachedPic("/app/audio/a.m4a", 2);

    expect(result).toBe(png);
    const [command, args, options] = execFileAsync.mock.calls[0];
    expect(command).toBe("ffmpeg");
    expect(args).toEqual(expect.arrayContaining(["-i", "/app/audio/a.m4a", "-map", "0:2", "pipe:1"]));
    expect(options).toMatchObject({ encoding: "buffer" });
  });
});
