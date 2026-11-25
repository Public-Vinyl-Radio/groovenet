import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery: db }));
import { userRepository as repo } from "../userRepository";
beforeEach(() => {
  db.mockReset();
  db.mockResolvedValue({ rows: [] });
});
afterEach(() => vi.unstubAllEnvs());
describe("household repository", () => {
  it.each([undefined, "", "  dj  "])(
    "seeds the unique owner idempotently from %s",
    async (username) => {
      vi.stubEnv("DISCOGS_USERNAME", username);
      await repo.ensureOwner();
      expect(db).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT (is_owner) WHERE is_owner"),
        [username?.trim() || "Owner", username?.trim() || null],
      );
    },
  );
  it("lists profiles with owner first", async () => {
    db.mockResolvedValue({ rows: [{ id: "u" }] });
    expect(await repo.list()).toEqual([{ id: "u" }]);
    expect(db).toHaveBeenCalledWith(expect.stringContaining("ORDER BY is_owner DESC"));
  });
  it("creates and renames with parameters and handles a missing profile", async () => {
    db.mockResolvedValueOnce({ rows: [{ id: "u" }] });
    expect(await repo.create("DJ", null)).toEqual({ id: "u" });
    expect(db.mock.lastCall?.[1]).toEqual(["DJ", null]);
    expect(await repo.rename("u", "DJ2", "login")).toBeNull();
    expect(db.mock.lastCall?.[1]).toEqual(["u", "DJ2", "login"]);
    db.mockResolvedValueOnce({ rows: [{ id: "u" }] });
    expect(await repo.rename("u", "DJ", null)).toEqual({ id: "u" });
  });
  it("resolves only unexpired opaque device hashes", async () => {
    expect(await repo.device("digest")).toBeNull();
    expect(db).toHaveBeenCalledWith(expect.stringContaining("d.expires_at > now()"), ["digest"]);
    db.mockResolvedValueOnce({ rows: [{ id: "u" }] });
    expect(await repo.device("digest")).toEqual({ id: "u" });
  });
  it("rotates device credentials and sweeps expired devices", async () => {
    const expires = new Date();
    await repo.select("new-hash", "u", expires, "old-hash");
    expect(db.mock.calls[0]).toEqual([
      expect.stringContaining("expires_at <= now()"),
      ["old-hash"],
    ]);
    expect(db.mock.calls[1][1]).toEqual(["new-hash", "u", expires]);
  });
  it("finds only unrevoked token hashes and records use", async () => {
    expect(await repo.token("digest")).toBeNull();
    expect(db).toHaveBeenCalledWith(expect.stringContaining("revoked_at IS NULL"), ["digest"]);
    db.mockResolvedValueOnce({ rows: [{ id: "u" }] });
    expect(await repo.token("digest")).toEqual({ id: "u" });
    await repo.touchToken("t");
    expect(db).toHaveBeenLastCalledWith(expect.stringContaining("last_used_at = now()"), ["t"]);
  });
  it("lists metadata without hashes, creates and idempotently revokes tokens", async () => {
    expect(await repo.tokens()).toEqual([]);
    expect(db.mock.lastCall?.[0]).not.toContain("token_hash");
    db.mockResolvedValueOnce({ rows: [{ id: "t" }] });
    expect(await repo.createToken("u", "Pi", "ingest", "digest")).toEqual({ id: "t" });
    expect(db.mock.lastCall?.[1]).toEqual(["u", "Pi", "ingest", "digest"]);
    await repo.revokeToken("t");
    expect(db).toHaveBeenLastCalledWith(expect.stringContaining("COALESCE(revoked_at, now())"), [
      "t",
    ]);
  });
});
