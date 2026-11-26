/**
 * A stand-in for `@/server/auth/viewer` in route tests that mock the
 * database: every request resolves to `VIEWER` unless a test says otherwise
 * with `resolveViewer.mockResolvedValueOnce(OTHER)`.
 *
 *   vi.mock("@/server/auth/viewer", async () => (await import("@/test/viewerMock")).viewerMock);
 */
import { vi } from "vitest";
import type { User } from "@/types/user";

export const VIEWER: User = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Owner",
  is_owner: true,
  discogs_username: "owner",
  tailscale_login: null,
};

export const OTHER: User = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Sam",
  is_owner: false,
  discogs_username: null,
  tailscale_login: null,
};

export const viewerMock = {
  resolveViewer: vi.fn(async (): Promise<User> => VIEWER),
};
