import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));

import { ArtistPageRepository } from "../artistPageRepository";

const repo = new ArtistPageRepository();
const lastCall = () => dbQuery.mock.calls.at(-1) as [string, unknown[]];

describe("ArtistPageRepository", () => {
  beforeEach(() => dbQuery.mockReset().mockResolvedValue({ rows: [{ marker: 1 }] }));

  it("scopes counts to a friend when given one", async () => {
    await expect(repo.counts(4, 6)).resolves.toEqual({ marker: 1 });
    const [sql, params] = lastCall();
    expect(params).toEqual([4, 6]);
    expect(sql).toContain("t.friend_id = $2");
    expect(sql).toContain("a.friend_id = $2");
  });

  it("reads every collection without a friend", async () => {
    await repo.counts(4, undefined);
    const [sql, params] = lastCall();
    expect(params).toEqual([4]);
    expect(sql).not.toContain("$2");
  });

  it("lists credited albums before the ones the artist only appears on", async () => {
    await expect(repo.albums(4, 6)).resolves.toEqual([{ marker: 1 }]);
    const [sql, params] = lastCall();
    expect(params).toEqual([4, 6]);
    expect(sql).toContain("ORDER BY (aa.artist_id IS NULL)");
    expect(sql).toContain("a.friend_id = $2");
  });

  it("limits top tracks and orders by plays", async () => {
    await repo.topTracks(4, 6, 50);
    const [sql, params] = lastCall();
    expect(params).toEqual([4, 6, 50]);
    expect(sql).toContain("ORDER BY play_count DESC");
    expect(sql).toContain("LIMIT $3");
  });

  it("limits top tracks without a friend", async () => {
    await repo.topTracks(4, undefined, 5);
    const [sql, params] = lastCall();
    expect(params).toEqual([4, 5]);
    expect(sql).toContain("LIMIT $2");
  });

  it("reads albums, genres and collaborators across every collection", async () => {
    await repo.albums(4, undefined);
    expect(lastCall()[1]).toEqual([4]);
    expect(lastCall()[0]).not.toContain("a.friend_id = $2");
    await repo.genres(4, undefined, 3);
    expect(lastCall()[1]).toEqual([4, 3]);
    await repo.collaborators(4, 6, 3);
    expect(lastCall()[0]).toContain("a.friend_id = $2");
  });

  it("reads genres and collaborators, leaving placeholders out", async () => {
    await repo.genres(4, 6, 12);
    expect(lastCall()[1]).toEqual([4, 6, 12]);
    await repo.collaborators(4, undefined, 12);
    const [sql, params] = lastCall();
    expect(params).toEqual([4, 12]);
    expect(sql).toContain("NOT ar.is_placeholder");
  });
});
