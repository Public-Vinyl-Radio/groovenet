import { beforeEach, describe, expect, it, vi } from "vitest";

const playlistRepo = vi.hoisted(() => ({ findPlaylistHeaderById: vi.fn() }));
const setRepo = vi.hoisted(() => ({ ensureForPlaylist: vi.fn(), deleteByPlaylistId: vi.fn(), findDetailByPlaylistId: vi.fn(), update: vi.fn(), replaceRelatedRecords: vi.fn() }));
vi.mock("@/server/repositories/playlistRepository", () => ({ playlistRepository: playlistRepo }));
vi.mock("@/server/repositories/liveSetRepository", () => ({ liveSetRepository: setRepo }));
vi.mock("@/lib/serverDb", () => ({ withDbTransaction: vi.fn((fn: (client: object) => unknown) => fn({})) }));

import { LiveSetService } from "../liveSetService";

beforeEach(() => vi.clearAllMocks());

describe("LiveSetService lifecycle", () => {
  it("creates through the repository's idempotent ensure operation", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue({ id: 9, name: "Mix" });
    setRepo.ensureForPlaylist.mockResolvedValue({ id: 4, playlist_id: 9 });
    await expect(new LiveSetService().createForPlaylist(9)).resolves.toEqual({ id: 4, playlist_id: 9 });
    expect(setRepo.ensureForPlaylist).toHaveBeenCalledWith(expect.anything(), 9);
  });

  it("does not create a set for a missing playlist", async () => {
    playlistRepo.findPlaylistHeaderById.mockResolvedValue(null);
    await expect(new LiveSetService().createForPlaylist(99)).resolves.toBeNull();
    expect(setRepo.ensureForPlaylist).not.toHaveBeenCalled();
  });

  it("deletes only by playlist set relation", async () => {
    setRepo.deleteByPlaylistId.mockResolvedValue(true);
    await expect(new LiveSetService().deleteForPlaylist(9)).resolves.toBe(true);
    expect(setRepo.deleteByPlaylistId).toHaveBeenCalledWith(9);
    expect(playlistRepo.findPlaylistHeaderById).not.toHaveBeenCalled();
  });
});
