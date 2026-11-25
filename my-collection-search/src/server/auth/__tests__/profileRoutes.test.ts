import { beforeEach, describe, expect, it, vi } from "vitest";
const repo = vi.hoisted(() => ({
  ensureOwner: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  tokens: vi.fn(),
  createToken: vi.fn(),
  revokeToken: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  cookieIdentity: vi.fn(),
  selectProfile: vi.fn(),
  newSecret: vi.fn(() => "only-once"),
  hashSecret: vi.fn(() => "digest"),
}));
vi.mock("@/server/repositories/userRepository", () => ({ userRepository: repo }));
vi.mock("../currentUser", () => auth);
import {
  createProfile,
  renameProfile,
  listProfiles,
  chooseProfile,
  listTokens,
  createToken,
  revokeToken,
} from "../profileRoutes";
const id = "12345678-1234-4234-8234-123456789012";
const owner = { id, name: "Owner", is_owner: true, discogs_username: "dj", tailscale_login: null };
const req = (body?: unknown) =>
  new Request("http://lan/api/profiles", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(owner);
  auth.cookieIdentity.mockResolvedValue(null);
  repo.list.mockResolvedValue([owner]);
  repo.rename.mockResolvedValue(owner);
});
describe("profile and token routes", () => {
  it("lists public profile identities and reports selection without leaking mappings", async () => {
    const res = await listProfiles(req());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      users: [{ id, name: "Owner", is_owner: true }],
      current: owner,
      selected: false,
    });
    auth.cookieIdentity.mockResolvedValue(owner);
    expect((await (await listProfiles(req())).json()).selected).toBe(true);
  });
  it.each([null, { ...owner, is_owner: false }])(
    "denies every administrative operation to %j",
    async (current) => {
      auth.getCurrentUser.mockResolvedValue(current);
      for (const handler of [createProfile, renameProfile, listTokens, createToken, revokeToken])
        expect((await handler(req())).status).toBe(403);
      expect(repo.create).not.toHaveBeenCalled();
    },
  );
  it("creates and renames profiles, including optional tailnet mappings", async () => {
    repo.create.mockResolvedValue(owner);
    expect((await createProfile(req({ name: "  DJ  " }))).status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith("DJ", null);
    expect(
      (await renameProfile(req({ id, name: "New name", tailscale_login: "dj@example.test" })))
        .status,
    ).toBe(200);
    expect(repo.rename).toHaveBeenCalledWith(id, "New name", "dj@example.test");
    repo.rename.mockResolvedValue(null);
    expect((await renameProfile(req({ id, name: "DJ" }))).status).toBe(404);
  });
  it("selects a known profile on a fresh device", async () => {
    auth.selectProfile.mockResolvedValue(new Response("{}"));
    expect((await chooseProfile(req({ user_id: id }))).status).toBe(200);
    expect(auth.selectProfile).toHaveBeenCalledWith(expect.any(Request), id);
    repo.list.mockResolvedValue([]);
    expect((await chooseProfile(req({ user_id: id }))).status).toBe(404);
  });
  it("lists token metadata, generates a token once and stores only its digest", async () => {
    repo.tokens.mockResolvedValue([]);
    expect(await (await listTokens(req())).json()).toEqual({ tokens: [], users: [owner] });
    repo.createToken.mockResolvedValue({ id: "t1", scope: "read" });
    const res = await createToken(req({ name: "CLI", user_id: id, scope: "read" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "t1", scope: "read", token: "only-once" });
    expect(repo.createToken).toHaveBeenCalledWith(id, "CLI", "read", "digest");
    repo.list.mockResolvedValue([]);
    expect((await createToken(req({ name: "CLI", user_id: id, scope: "read" }))).status).toBe(404);
  });
  it("revokes by id without revealing any credential", async () => {
    expect(await (await revokeToken(req({ id }))).json()).toEqual({ revoked: true });
    expect(repo.revokeToken).toHaveBeenCalledWith(id);
  });
  it.each([{}, { name: " " }, { name: "x".repeat(101) }, "{broken"])(
    "validates bodies: %j",
    async (body) => {
      expect((await createProfile(req(body))).status).toBe(400);
    },
  );
  it("validates token scopes and ids", async () => {
    expect((await createToken(req({ name: "x", user_id: id, scope: "admin" }))).status).toBe(400);
    expect((await chooseProfile(req({ user_id: "1" }))).status).toBe(400);
    expect((await revokeToken(req({ id: "1" }))).status).toBe(400);
  });
  it("sanitizes unexpected failures", async () => {
    repo.create.mockRejectedValue(new Error("SQL contains credentials"));
    const res = await createProfile(req({ name: "DJ" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Profile operation failed" });
  });
});
