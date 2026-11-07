import { beforeEach, expect, it, vi } from "vitest";

const http = vi.hoisted(() => vi.fn());
vi.mock("@/services/http", () => ({ http }));
import { fetchStorageInfo } from "./system";

beforeEach(() => vi.resetAllMocks());

it("fetches storage info", async () => {
  http.mockResolvedValue({ totals: {} });
  expect(await fetchStorageInfo()).toEqual({ totals: {} });
  expect(http).toHaveBeenCalledWith("/api/system/storage");
});
