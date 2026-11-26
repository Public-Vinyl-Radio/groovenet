import { expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));
import { householdOwnerId } from "./householdOwnerId";

it("reads the owner's id through household_owner_id()", async () => {
  dbQuery.mockResolvedValue({ rows: [{ id: "owner-uuid" }] });
  await expect(householdOwnerId()).resolves.toBe("owner-uuid");
  expect(dbQuery).toHaveBeenCalledWith("SELECT household_owner_id() AS id");
});
