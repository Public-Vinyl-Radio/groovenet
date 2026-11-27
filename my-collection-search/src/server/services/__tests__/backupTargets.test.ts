import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFormats } = vi.hoisted(() => ({ mockFormats: vi.fn() }));
vi.mock("@/server/repositories/trackAudioFileRepository", () => ({
  trackAudioFileRepository: { listAudioFormats: mockFormats },
}));

import {
  LOCAL_BACKUP_MARKER,
  checkLocalBackupMount,
  classifyAudio,
  localBackupConfigured,
  localBackupDir,
  localRepositoryPath,
  missingEnv,
  planAudio,
  resticEnv,
  writeExcludeFile,
  type MountFs,
} from "../backupTargets";

type Entry = { dev: number; dir?: boolean; file?: boolean };
// A stub filesystem: path -> stat. Anything absent throws ENOENT like the real call.
function stubFs(entries: Record<string, Entry>): MountFs {
  return {
    statSync: ((p: string) => {
      const e = entries[p];
      if (!e) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return {
        dev: e.dev,
        isDirectory: () => Boolean(e.dir),
        isFile: () => Boolean(e.file),
      };
    }) as unknown as MountFs["statSync"],
  };
}

const DISK = "/disk";
const MARKER = `${DISK}/${LOCAL_BACKUP_MARKER}`;

describe("checkLocalBackupMount()", () => {
  it("accepts a separate device carrying the marker", () => {
    const fsImpl = stubFs({
      [DISK]: { dev: 2, dir: true },
      [MARKER]: { dev: 2, file: true },
      "/": { dev: 1, dir: true },
    });
    expect(checkLocalBackupMount(DISK, fsImpl)).toEqual({ ok: true });
  });

  it("fails when the path does not exist (disk missing)", () => {
    const result = checkLocalBackupMount(DISK, stubFs({}));
    expect(result).toMatchObject({ ok: false, reason: "path-missing" });
  });

  it("fails when the path is a file", () => {
    const result = checkLocalBackupMount(DISK, stubFs({ [DISK]: { dev: 2, file: true } }));
    expect(result).toMatchObject({ ok: false, reason: "not-a-directory" });
  });

  it("fails when the marker is absent (an unmounted, empty mount point)", () => {
    const result = checkLocalBackupMount(
      DISK,
      stubFs({ [DISK]: { dev: 1, dir: true }, "/": { dev: 1, dir: true } }),
    );
    expect(result).toMatchObject({ ok: false, reason: "marker-missing" });
    expect((result as { message: string }).message).toContain(LOCAL_BACKUP_MARKER);
  });

  it("fails when the marker is a directory rather than a file", () => {
    const result = checkLocalBackupMount(
      DISK,
      stubFs({ [DISK]: { dev: 2, dir: true }, [MARKER]: { dev: 2, dir: true } }),
    );
    expect(result).toMatchObject({ ok: false, reason: "marker-missing" });
  });

  it("fails when the directory is on the same device as its parent, marker or not", () => {
    const result = checkLocalBackupMount(
      DISK,
      stubFs({
        [DISK]: { dev: 1, dir: true },
        [MARKER]: { dev: 1, file: true },
        "/": { dev: 1, dir: true },
      }),
    );
    expect(result).toMatchObject({ ok: false, reason: "same-device" });
    expect((result as { message: string }).message).toContain("root disk");
  });

  it("fails when the parent cannot be inspected", () => {
    const result = checkLocalBackupMount(
      DISK,
      stubFs({ [DISK]: { dev: 2, dir: true }, [MARKER]: { dev: 2, file: true } }),
    );
    expect(result).toMatchObject({ ok: false, reason: "path-missing" });
  });

  it("uses the real filesystem by default: a plain temp directory is refused", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mount-check-"));
    try {
      expect(checkLocalBackupMount(dir)).toMatchObject({ ok: false, reason: "marker-missing" });
      fs.writeFileSync(path.join(dir, LOCAL_BACKUP_MARKER), "");
      // Marker present, but the directory shares its parent's device.
      expect(checkLocalBackupMount(dir)).toMatchObject({ ok: false, reason: "same-device" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("has no local target unless LOCAL_BACKUP_DIR is set", () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    expect(localBackupDir()).toBeNull();
    expect(localBackupConfigured()).toBe(false);
    vi.stubEnv("LOCAL_BACKUP_DIR", "/app/local-backup");
    expect(localBackupConfigured()).toBe(true);
  });

  it("gives the local target its own repository and password", () => {
    vi.stubEnv("RESTIC_REPOSITORY", "remote-repo");
    vi.stubEnv("RESTIC_PASSWORD", "remote-pw");
    vi.stubEnv("LOCAL_BACKUP_DIR", "/app/local-backup");
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "local-pw");

    expect(resticEnv("remote").RESTIC_REPOSITORY).toBe("remote-repo");
    const local = resticEnv("local");
    expect(local.RESTIC_REPOSITORY).toBe(localRepositoryPath("/app/local-backup"));
    expect(local.RESTIC_PASSWORD).toBe("local-pw");
  });

  it("never lets the local target fall back to the remote's repository", () => {
    vi.stubEnv("RESTIC_REPOSITORY", "remote-repo");
    vi.stubEnv("RESTIC_PASSWORD", "remote-pw");
    vi.stubEnv("LOCAL_BACKUP_DIR", "");
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "");
    expect(resticEnv("local")).toMatchObject({ RESTIC_REPOSITORY: "", RESTIC_PASSWORD: "" });
  });

  it("gives the local target an empty password when none is set", () => {
    vi.stubEnv("LOCAL_BACKUP_DIR", "/mnt/x");
    delete process.env.LOCAL_BACKUP_RESTIC_PASSWORD;
    expect(resticEnv("local").RESTIC_PASSWORD).toBe("");
  });

  it("names the env vars each target is missing", () => {
    vi.stubEnv("RESTIC_REPOSITORY", "");
    vi.stubEnv("RESTIC_PASSWORD", "x");
    vi.stubEnv("LOCAL_BACKUP_RESTIC_PASSWORD", "");
    expect(missingEnv("remote")).toEqual(["RESTIC_REPOSITORY"]);
    expect(missingEnv("local")).toEqual(["LOCAL_BACKUP_RESTIC_PASSWORD"]);
  });
});

describe("classifyAudio()", () => {
  const tracked = new Map<string, boolean | null>([
    ["alac.m4a", true],
    ["aac.m4a", false],
    ["unprobed.flac", null],
    ["mislabelled.flac", false],
  ]);

  it("trusts tracking over the extension", () => {
    expect(classifyAudio("alac.m4a", tracked)).toBe("lossless");
    expect(classifyAudio("aac.m4a", tracked)).toBe("aac");
    expect(classifyAudio("mislabelled.flac", tracked)).toBe("aac");
  });

  it("falls back to the extension for untracked and unprobed files", () => {
    expect(classifyAudio("unprobed.flac", tracked)).toBe("lossless");
    expect(classifyAudio("new.WAV", tracked)).toBe("lossless");
    expect(classifyAudio("new.aiff", tracked)).toBe("lossless");
    expect(classifyAudio("new.mp3", tracked)).toBe("aac");
    // An untracked .m4a could be either; it is not assumed lossless.
    expect(classifyAudio("new.m4a", tracked)).toBe("aac");
  });
});

describe("planAudio()", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-audio-"));
    fs.mkdirSync(path.join(dir, "sub"));
    for (const name of ["a.m4a", "b.flac", "sub/c.flac", "sub/d.m4a"]) {
      fs.writeFileSync(path.join(dir, name), "x");
    }
    mockFormats.mockReset().mockResolvedValue([
      { filename: "sub/d.m4a", lossless: false },
      { filename: "  ", lossless: true },
    ]);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("takes nothing when neither class is wanted", async () => {
    expect(
      await planAudio(dir, { include_aac_audio: false, include_lossless_audio: false }),
    ).toEqual({
      path: null,
      excluded: [],
    });
  });

  it("takes nothing when the audio directory does not exist", async () => {
    const plan = await planAudio(path.join(dir, "missing"), {
      include_aac_audio: true,
      include_lossless_audio: true,
    });
    expect(plan.path).toBeNull();
  });

  it("takes the whole directory without consulting the database when both are wanted", async () => {
    const plan = await planAudio(dir, { include_aac_audio: true, include_lossless_audio: true });
    expect(plan).toEqual({ path: dir, excluded: [] });
    expect(mockFormats).not.toHaveBeenCalled();
  });

  it("excludes lossless files, including in subdirectories", async () => {
    const plan = await planAudio(dir, { include_aac_audio: true, include_lossless_audio: false });
    expect(plan.excluded.sort()).toEqual([path.join(dir, "b.flac"), path.join(dir, "sub/c.flac")]);
  });

  it("excludes AAC for a lossless-only target", async () => {
    const plan = await planAudio(dir, { include_aac_audio: false, include_lossless_audio: true });
    expect(plan.excluded.sort()).toEqual([path.join(dir, "a.m4a"), path.join(dir, "sub/d.m4a")]);
  });

  it("keeps the first probed answer when a file is listed twice, and skips non-files", async () => {
    mockFormats.mockResolvedValue([
      { filename: "a.m4a", lossless: true },
      { filename: "a.m4a", lossless: false },
    ]);
    fs.symlinkSync(path.join(dir, "nowhere"), path.join(dir, "dangling.flac"));
    const plan = await planAudio(dir, { include_aac_audio: false, include_lossless_audio: true });
    // a.m4a is lossless per tracking, so it stays; the AAC-by-extension files are excluded.
    expect(plan.excluded).not.toContain(path.join(dir, "a.m4a"));
    expect(plan.excluded).not.toContain(path.join(dir, "dangling.flac"));
  });

  it("fails rather than guess when tracking cannot be read", async () => {
    mockFormats.mockRejectedValue(new Error("db down"));
    await expect(
      planAudio(dir, { include_aac_audio: true, include_lossless_audio: false }),
    ).rejects.toThrow("db down");
  });
});

describe("writeExcludeFile()", () => {
  it("writes one escaped pattern per line, readable only by the owner", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "excl-"));
    try {
      const file = writeExcludeFile(dir, ["/a/b*.flac", "/a/[x]?.flac", "/a/back\\slash.flac"]);
      expect(fs.readFileSync(file, "utf8")).toBe(
        "/a/b\\*.flac\n/a/\\[x]\\?.flac\n/a/back\\\\slash.flac\n",
      );
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
