import { beforeEach, expect, it, vi } from "vitest";
const http = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http }));
import { profilesApi as api } from "./profiles";
beforeEach(() => http.mockReset());
it("sends profile and token management requests through the shared transport", async () => {
  await api.list();
  expect(http).toHaveBeenLastCalledWith("/api/profiles");
  await api.tokens();
  expect(http).toHaveBeenLastCalledWith("/api/profiles/tokens");
  for (const [call, path, method, body] of [
    [() => api.select("u"), "/api/profiles/select", "POST", { user_id: "u" }],
    [() => api.create("DJ", null), "/api/profiles", "POST", { name: "DJ", tailscale_login: null }],
    [
      () => api.rename("u", "DJ2", "login"),
      "/api/profiles",
      "PATCH",
      { id: "u", name: "DJ2", tailscale_login: "login" },
    ],
    [
      () => api.createToken("CLI", "u", "read"),
      "/api/profiles/tokens",
      "POST",
      { name: "CLI", user_id: "u", scope: "read" },
    ],
    [() => api.revoke("t"), "/api/profiles/tokens", "DELETE", { id: "t" }],
  ] as const) {
    await call();
    expect(http).toHaveBeenLastCalledWith(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
});
