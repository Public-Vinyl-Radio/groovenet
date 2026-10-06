import { describe, expect, it, vi } from "vitest";
import { up, down } from "../../../migrations/1791600000000_add-genre-reconciliation.js";

const migration = () => ({
  func: (value: string) => value,
  createTable: vi.fn(), addConstraint: vi.fn(), createIndex: vi.fn(), dropTable: vi.fn(),
});

describe("genre reconciliation migration", () => {
  it("keys proposals by normalised value and allows one running run", () => {
    const pgm = migration();
    up(pgm as never);
    expect(pgm.createTable).toHaveBeenCalledWith("genre_reconciliation_runs", expect.any(Object));
    expect(pgm.createTable).toHaveBeenCalledWith("genre_reconciliation_proposals", expect.objectContaining({
      target_genre_ids: expect.objectContaining({ type: "uuid[]" }),
      proposed_parent_id: expect.objectContaining({ references: "genres(id)", onDelete: "SET NULL" }),
    }));
    expect(pgm.addConstraint).toHaveBeenCalledWith(
      "genre_reconciliation_proposals", "genre_reconciliation_proposals_value_key", { unique: "value_normalized" }
    );
    expect(pgm.createIndex).toHaveBeenCalledWith("genre_reconciliation_runs", "status", expect.objectContaining({
      unique: true, where: "status = 'running'",
    }));
  });

  it("drops proposals before the runs they reference", () => {
    const pgm = migration();
    down(pgm as never);
    expect(pgm.dropTable.mock.calls.map(([name]) => name)).toEqual([
      "genre_reconciliation_proposals", "genre_reconciliation_runs",
    ]);
  });
});
