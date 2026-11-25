import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const repo = vi.hoisted(() => ({
  ensureOwner: vi.fn(),
  list: vi.fn(),
  token: vi.fn(),
  touchToken: vi.fn(),
  device: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@/server/repositories/userRepository", () => ({ userRepository: repo }));
import {
  getCurrentUser,
  getHouseholdOwner,
  bearerIdentity,
  cookieIdentity,
  deviceSecret,
  hashSecret,
  newSecret,
  verifySecret,
  selectProfile,
  PROFILE_COOKIE,
  DEVICE_MAX_AGE,
} from "../currentUser";
import { enforceApiAuth, scopeAllows } from "../enforce";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
const owner = {
  id: "owner",
  name: "Owner",
  is_owner: true,
  discogs_username: "dj",
  tailscale_login: "dj@example.test",
};
const other = { ...owner, id: "other", is_owner: false, discogs_username: null };
const req = (headers = {}, path = "/api/tracks", method = "GET") =>
  new Request(`http://lan${path}`, { headers, method });
const tokenRow = () => ({
  ...other,
  token_id: "t1",
  token_hash: hashSecret("secret"),
  scope: "read",
});
beforeEach(() => {
  vi.resetAllMocks();
  repo.list.mockResolvedValue([owner]);
  repo.token.mockResolvedValue(null);
  repo.device.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("household identity", () => {
  it("generates independent 32-byte secrets and verifies only the complete SHA-256 digest", () => {
    const a = newSecret();
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(newSecret());
    expect(hashSecret(a)).toHaveLength(64);
    expect(verifySecret(a, hashSecret(a))).toBe(true);
    expect(verifySecret("wrong", hashSecret(a))).toBe(false);
    expect(verifySecret(a, "bad")).toBe(false);
  });
  it("seeds a usable sole owner with or without a request", async () => {
    expect(await getCurrentUser()).toEqual(owner);
    expect(await getCurrentUser(req())).toEqual(owner);
    expect(repo.ensureOwner).toHaveBeenCalledTimes(2);
  });
  it("valid bearer wins over cookie, mapping and sole profile, without exposing hash", async () => {
    repo.token.mockResolvedValue(tokenRow());
    repo.device.mockResolvedValue(owner);
    expect(
      await getCurrentUser(
        req({
          authorization: "Bearer secret",
          cookie: `${PROFILE_COOKIE}=device`,
          "Tailscale-User-Login": owner.tailscale_login,
        }),
      ),
    ).toEqual(other);
    expect(repo.touchToken).toHaveBeenCalledWith("t1");
    expect(repo.device).not.toHaveBeenCalled();
  });
  it("cookie wins over mapping and is looked up by hash", async () => {
    repo.device.mockResolvedValue(other);
    expect(
      await getCurrentUser(
        req({
          cookie: `a=x; ${PROFILE_COOKIE}=device`,
          "Tailscale-User-Login": owner.tailscale_login,
        }),
      ),
    ).toEqual(other);
    expect(repo.device).toHaveBeenCalledWith(hashSecret("device"));
  });
  it("invalid/revoked bearer and expired cookie fall through to explicit Tailscale mapping", async () => {
    repo.list.mockResolvedValue([owner, other]);
    expect(
      await getCurrentUser(
        req({
          authorization: "Bearer revoked",
          cookie: `${PROFILE_COOKIE}=expired`,
          "Tailscale-User-Login": owner.tailscale_login,
        }),
      ),
    ).toEqual(owner);
    expect(await getCurrentUser(req({ "Tailscale-User-Login": "unknown" }))).toBeNull();
    expect(await getCurrentUser(req())).toBeNull();
    expect(await getCurrentUser()).toBeNull();
  });
  it("rejects malformed bearer and a digest mismatch", async () => {
    expect(await bearerIdentity(req({ authorization: "Basic secret" }))).toBeNull();
    repo.token.mockResolvedValue({ ...tokenRow(), token_hash: hashSecret("wrong") });
    expect(await bearerIdentity(req({ authorization: "Bearer secret" }))).toBeNull();
    expect(repo.touchToken).not.toHaveBeenCalled();
  });
  it("handles absent, empty and unrelated cookies without accepting a user id", async () => {
    for (const cookie of ["", "unrelated=x", `${PROFILE_COOKIE}=`]) {
      expect(deviceSecret(req({ cookie }))).toBeNull();
      expect(await cookieIdentity(req({ cookie }))).toBeNull();
    }
    expect(await cookieIdentity(req({ cookie: `${PROFILE_COOKIE}=owner` }))).toBeNull();
  });
  it.each(["http", "https"])(
    "sets a long-lived opaque httpOnly Lax cookie on %s",
    async (protocol) => {
      const response = await selectProfile(
        new Request(`${protocol}://lan/api/profiles/select`, {
          headers: { cookie: `${PROFILE_COOKIE}=old` },
        }),
        owner.id,
      );
      const cookie = response.cookies.get(PROFILE_COOKIE)!;
      expect(cookie.value).not.toBe(owner.id);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("lax");
      expect(!!cookie.secure).toBe(protocol === "https");
      expect(cookie.maxAge).toBe(DEVICE_MAX_AGE);
      expect(repo.select).toHaveBeenCalledWith(
        hashSecret(cookie.value),
        owner.id,
        expect.any(Date),
        hashSecret("old"),
      );
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    },
  );
  it("selects a first device without a previous cookie", async () => {
    await selectProfile(req(), owner.id);
    expect(repo.select.mock.calls[0][3]).toBeNull();
  });
});
describe("central API scope enforcement", () => {
  it("leaves every legacy request alone by default, without a database lookup", async () => {
    for (const method of ["GET", "POST", "DELETE"])
      expect(
        await enforceApiAuth(req({ authorization: "Bearer bad" }, "/api/tracks", method)),
      ).toBeNull();
    expect(repo.token).not.toHaveBeenCalled();
    expect(
      (await proxy(new NextRequest("http://lan/api/tracks"))).headers.get("x-middleware-next"),
    ).toBe("1");
  });
  it("requires an actual device cookie or valid token when enabled, not the sole profile", async () => {
    vi.stubEnv("AUTH_REQUIRE_TOKENS", "true");
    expect((await enforceApiAuth(req()))?.status).toBe(401);
    repo.device.mockResolvedValue(owner);
    expect(await enforceApiAuth(req({ cookie: `${PROFILE_COOKIE}=device` }))).toBeNull();
    expect((await proxy(new NextRequest("http://lan/api/tracks"))).status).toBe(401);
  });
  it("allows discovery/selection bootstrap but no administration", async () => {
    vi.stubEnv("AUTH_REQUIRE_TOKENS", "true");
    expect(await enforceApiAuth(req({}, "/api/profiles/"))).toBeNull();
    expect(await enforceApiAuth(req({}, "/api/profiles/select", "POST"))).toBeNull();
    expect((await enforceApiAuth(req({}, "/api/profiles", "POST")))?.status).toBe(401);
    expect((await enforceApiAuth(req({}, "/api/profiles/tokens")))?.status).toBe(401);
  });
  it("enforces bearer scope even when an owner cookie accompanies it", async () => {
    vi.stubEnv("AUTH_REQUIRE_TOKENS", "true");
    repo.token.mockResolvedValue(tokenRow());
    repo.device.mockResolvedValue(owner);
    expect(await enforceApiAuth(req({ authorization: "Bearer secret" }))).toBeNull();
    expect(
      (
        await enforceApiAuth(
          req(
            { authorization: "Bearer secret", cookie: `${PROFILE_COOKIE}=device` },
            "/api/tracks",
            "PATCH",
          ),
        )
      )?.status,
    ).toBe(403);
  });
  it("enforces read scope on profile selection too", async () => {
    vi.stubEnv("AUTH_REQUIRE_TOKENS", "true");
    repo.token.mockResolvedValue(tokenRow());
    expect(
      (
        await enforceApiAuth(
          req({ authorization: "Bearer secret" }, "/api/profiles/select", "POST"),
        )
      )?.status,
    ).toBe(403);
  });
  it("defines read/write and the ingest allowlist by method and whole path", () => {
    expect(scopeAllows("write", "DELETE", "/api/tracks")).toBe(true);
    for (const method of ["GET", "HEAD", "OPTIONS"])
      expect(scopeAllows("read", method, "/api/tracks")).toBe(true);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"])
      expect(scopeAllows("read", method, "/api/tracks")).toBe(false);
    for (const path of [
      "/api/audio/ingest",
      "/api/audio/ingest/a/result",
      "/api/set-derivations/a/result",
      "/api/fingerprints",
    ])
      expect(scopeAllows("ingest", "POST", path)).toBe(true);
    expect(scopeAllows("ingest", "PATCH", "/api/fingerprints")).toBe(true);
    expect(scopeAllows("ingest", "GET", "/api/fingerprints")).toBe(true);
    expect(scopeAllows("ingest", "POST", "/api/audio/ingest/a/claim")).toBe(true);
    expect(scopeAllows("ingest", "POST", "/api/set-derivations/a/claim")).toBe(true);
    for (const [method, path] of [
      ["POST", "/api/tracks"],
      ["GET", "/api/audio/ingest"],
      ["POST", "/api/audio/ingest/a/result/extra"],
      ["DELETE", "/api/fingerprints"],
      ["POST", "/api/fingerprints/index"],
    ])
      expect(scopeAllows("ingest", method, path)).toBe(false);
  });
});

describe("legacy player-key compatibility", () => {
  it.each(["/api/players", "/api/players/lounge"])(
    "maps the configured player key to owner/write on %s",
    async (path) => {
      const key = "legacy-player-key-".repeat(3);
      vi.stubEnv("PLAYER_API_KEY", key);
      vi.stubEnv("AUTH_REQUIRE_TOKENS", "true");
      repo.list.mockResolvedValue([other, owner]);
      const request = req(
        { authorization: `Bearer ${key}`, cookie: `${PROFILE_COOKIE}=device` },
        path,
        "POST",
      );
      expect(await bearerIdentity(request)).toEqual({ user: owner, scope: "write" });
      expect(await getCurrentUser(request)).toEqual(owner);
      expect(await enforceApiAuth(request)).toBeNull();
      expect(repo.token).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["/api/tracks", "legacy-player-key-".repeat(3), "legacy-player-key-".repeat(3)],
    ["/api/players-extra", "legacy-player-key-".repeat(3), "legacy-player-key-".repeat(3)],
    ["/api/players", "", "key"],
    ["/api/players", "short", "short"],
    ["/api/players", "legacy-player-key-".repeat(3), "incorrect"],
  ])(
    "keeps the legacy key confined and rejects invalid configuration: %s",
    async (path, key, secret) => {
      vi.stubEnv("PLAYER_API_KEY", key);
      expect(await bearerIdentity(req({ authorization: `Bearer ${secret}` }, path))).toBeNull();
    },
  );
  it("does not resolve a missing owner", async () => {
    const key = "legacy-player-key-".repeat(3);
    vi.stubEnv("PLAYER_API_KEY", key);
    repo.list.mockResolvedValue([]);
    expect(
      await bearerIdentity(req({ authorization: `Bearer ${key}` }, "/api/players")),
    ).toBeNull();
  });
  it("enforces read-token scopes on the player API", async () => {
    vi.stubEnv("AUTH_REQUIRE_TOKENS", "true");
    repo.token.mockResolvedValue(tokenRow());
    expect(
      (
        await enforceApiAuth(
          req({ authorization: "Bearer secret" }, "/api/players/lounge/commands", "POST"),
        )
      )?.status,
    ).toBe(403);
    expect(
      await enforceApiAuth(req({ authorization: "Bearer secret" }, "/api/players")),
    ).toBeNull();
  });
});

it("keeps the household owner independent of a selected non-owner profile", async () => {
  repo.list.mockResolvedValue([other, owner]);
  repo.device.mockResolvedValue(other);
  expect(await getCurrentUser(req({ cookie: `${PROFILE_COOKIE}=guest-device` }))).toEqual(other);
  expect(await getHouseholdOwner()).toEqual(owner);
});
