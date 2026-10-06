import { describe, expect, it, vi } from "vitest";
import { up, down } from "../../../migrations/1791500000000_add-track-genres.js";

const migration = () => ({
  func: (value: string) => value,
  createTable: vi.fn(), addConstraint: vi.fn(), createIndex: vi.fn(),
  addColumn: vi.fn(), dropColumn: vi.fn(), dropTable: vi.fn(),
});

describe("track genres migration", () => {
  it("links tracks to genres without letting a linked genre be deleted", () => {
    const pgm = migration();
    up(pgm as never);
    expect(pgm.createTable).toHaveBeenCalledWith("track_genres", expect.objectContaining({
      track_id: expect.objectContaining({ type: "varchar(255)" }),
      genre_id: expect.objectContaining({ references: "genres(id)", onDelete: "RESTRICT" }),
    }));
    expect(pgm.addConstraint).toHaveBeenCalledWith("track_genres", "track_genres_pkey", {
      primaryKey: ["track_id", "friend_id", "genre_id"],
    });
    expect(pgm.addConstraint).toHaveBeenCalledWith("track_genres", "track_genres_track_fk", {
      foreignKeys: expect.objectContaining({ references: "tracks(track_id, friend_id)", onDelete: "CASCADE" }),
    });
    expect(pgm.createIndex).toHaveBeenCalledWith("track_genres", "genre_id", expect.anything());
    expect(pgm.addColumn).toHaveBeenCalledWith("tracks", {
      descriptors: expect.objectContaining({ type: "text[]", notNull: true }),
    });
  });

  it("drops the descriptors column and the link table on rollback", () => {
    const pgm = migration();
    down(pgm as never);
    expect(pgm.dropColumn).toHaveBeenCalledWith("tracks", "descriptors");
    expect(pgm.dropTable).toHaveBeenCalledWith("track_genres");
  });
});
