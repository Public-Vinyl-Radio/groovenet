import { expect, it, vi } from "vitest";
import { http } from "@/services/http";
import { fetchStorageOrphans, startStorageOrphanScan } from "./system";
vi.mock("@/services/http", () => ({ http: vi.fn() }));
it("reads orphans with a page size", async () => {
  vi.mocked(http).mockResolvedValue({ running: false });
  await fetchStorageOrphans(500);
  expect(http).toHaveBeenCalledWith("/api/system/storage/orphans?limit=500");
  await fetchStorageOrphans();
  expect(http).toHaveBeenLastCalledWith("/api/system/storage/orphans?limit=5");
});
it("starts a scan with POST", async () => {
  vi.mocked(http).mockResolvedValue({ started: true, running: true });
  await startStorageOrphanScan();
  expect(http).toHaveBeenCalledWith("/api/system/storage/orphans/scan", { method: "POST" });
});
