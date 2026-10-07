import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateBackup } = vi.hoisted(() => ({ mockCreateBackup: vi.fn() }));

vi.mock("@/server/services/databaseBackupService", () => ({
  createBackup: mockCreateBackup,
}));

import { POST } from "../route";
import { POST as POST_CUSTOM } from "../../backup-custom/route";

beforeEach(() => {
  mockCreateBackup.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/backup", () => {
  it("creates a custom-format backup", async () => {
    mockCreateBackup.mockResolvedValue({ filename: "pg-backup-x.dump", path: "/d/pg-backup-x.dump" });
    const res = await POST();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      message: "Backup created: pg-backup-x.dump",
      filename: "pg-backup-x.dump",
      format: "custom",
    });
  });

  it("returns 500 with the pg_dump error", async () => {
    mockCreateBackup.mockRejectedValue(new Error("pg_dump exited with code 1: no route to host"));
    const res = await POST();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to create backup: pg_dump exited with code 1: no route to host",
    });
  });

  it("stringifies a non-Error failure", async () => {
    mockCreateBackup.mockRejectedValue("disk full");
    const res = await POST();
    await expect(res.json()).resolves.toEqual({ error: "Failed to create backup: disk full" });
  });

  it("is also served at the deprecated /api/backup-custom", () => {
    expect(POST_CUSTOM).toBe(POST);
  });
});
