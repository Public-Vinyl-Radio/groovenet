import { beforeEach, describe, expect, it, vi } from "vitest";

const playlistRepo = vi.hoisted(() => ({ findPlaylistHeaderById: vi.fn() }));
const setRepo = vi.hoisted(() => ({
  ensureForPlaylist: vi.fn(),
  deleteByPlaylistId: vi.fn(),
  findDetailByPlaylistId: vi.fn(),
  update: vi.fn(),
  replaceRelatedRecords: vi.fn(),
}));
vi.mock("@/server/repositories/playlistRepository", () => ({ playlistRepository: playlistRepo }));
vi.mock("@/server/repositories/liveSetRepository", () => ({ liveSetRepository: setRepo }));
vi.mock("@/lib/serverDb", () => ({
  withDbTransaction: vi.fn((fn: (client: object) => unknown) => fn({})),
}));

import { LiveSetService } from "../liveSetService";

const VIEWER = "00000000-0000-4000-8000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("LiveSetService lifecycle", () => {
  it("creates through the repository's idempotent ensure operation", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue({ id: 9, name: "Mix" });
    setRepo.ensureForPlaylist.mockResolvedValue({ id: 4, playlist_id: 9 });
    await expect(new LiveSetService().createForPlaylist(9, VIEWER)).resolves.toEqual({
      id: 4,
      playlist_id: 9,
    });
    expect(playlistRepo.findPlaylistHeaderById).toHaveBeenCalledWith(9, VIEWER);
    expect(setRepo.ensureForPlaylist).toHaveBeenCalledWith(expect.anything(), 9);
  });

  it("does not create a set for a missing or hidden playlist", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue(null);
    await expect(new LiveSetService().createForPlaylist(99, VIEWER)).resolves.toBeNull();
    expect(setRepo.ensureForPlaylist).not.toHaveBeenCalled();
  });

  it("deletes only by playlist set relation, for a visible playlist", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue({ id: 9 });
    setRepo.deleteByPlaylistId.mockResolvedValue(true);
    await expect(new LiveSetService().deleteForPlaylist(9, VIEWER)).resolves.toBe(true);
    expect(setRepo.deleteByPlaylistId).toHaveBeenCalledWith(9);
  });

  it("never reads or deletes the set of a playlist the viewer can't see (#1284)", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue(null);
    await expect(new LiveSetService().getByPlaylistId(9, VIEWER)).resolves.toBeNull();
    await expect(new LiveSetService().deleteForPlaylist(9, VIEWER)).resolves.toBe(false);
    expect(setRepo.findDetailByPlaylistId).not.toHaveBeenCalled();
    expect(setRepo.deleteByPlaylistId).not.toHaveBeenCalled();
  });

  it("reads details and updates an existing playlist set transactionally", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue({ id: 9 });
    setRepo.findDetailByPlaylistId.mockResolvedValue({ id: 4 });
    await expect(new LiveSetService().getByPlaylistId(9, VIEWER)).resolves.toEqual({ id: 4 });
    setRepo.ensureForPlaylist.mockResolvedValue({ id: 4, playlist_id: 9 });
    await expect(
      new LiveSetService().updateForPlaylist(9, { title: "Late" }, VIEWER),
    ).resolves.toMatchObject({ id: 4 });
    expect(setRepo.update).toHaveBeenCalledWith(expect.anything(), 4, { title: "Late" });
    expect(setRepo.replaceRelatedRecords).toHaveBeenCalled();
  });

  it("does not update a set for a missing playlist", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue(null);
    await expect(
      new LiveSetService().updateForPlaylist(99, { title: "Nope" }, VIEWER),
    ).resolves.toBeNull();
    expect(setRepo.ensureForPlaylist).not.toHaveBeenCalled();
  });
});
