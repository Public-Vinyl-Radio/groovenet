import { describe, expect, it, vi } from "vitest";
import { up, down } from "../../../../migrations/1793400000000_add-spin-output-name.js";

describe("digital spin output migration", () => {
  it("adds nullable text snapshots to spins and queued plays, then removes both on rollback", () => {
    const pgm = { addColumn: vi.fn(), dropColumn: vi.fn() };
    up(pgm as never);
    expect(pgm.addColumn.mock.calls).toEqual([
      ["spin_sessions", { output_name: { type: "text" } }],
      ["server_player_plays", { output_name: { type: "text" } }],
    ]);
    down(pgm as never);
    expect(pgm.dropColumn.mock.calls).toEqual([
      ["server_player_plays", "output_name"],
      ["spin_sessions", "output_name"],
    ]);
  });
});
