import { beforeEach, describe, expect, it, vi } from "vitest";
import { addGenreAlias, createGenre, mergeGenres, updateGenre } from "../genreAdminService";

const { query, transaction } = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/serverDb", () => ({ withDbTransaction: transaction }));
const row = { id: "source", name: "Post-Punk", slug: "post-punk", parent_id: "root", source: "custom" };
let missing: string | undefined;
let cycle: boolean;
let aliasOwner: string | undefined;
let canonical: boolean;
let failure: unknown;

beforeEach(() => {
  vi.resetAllMocks();
  missing = undefined; cycle = false; aliasOwner = undefined; canonical = false; failure = undefined;
  transaction.mockImplementation(async (fn) => fn({ query }));
  query.mockImplementation(async (sql: string, values: unknown[] = []) => {
    if (failure && (sql.startsWith("INSERT") || sql.startsWith("DELETE FROM genres"))) throw failure;
    if (sql.startsWith("SELECT id, name")) return { rows: values[0] === missing ? [] : [{ ...row, id: values[0] }] };
    if (sql.startsWith("SELECT genre_id")) return { rows: aliasOwner ? [{ genre_id: aliasOwner }] : [] };
    if (sql.startsWith("SELECT id FROM")) return { rows: canonical ? [{ id: "other" }] : [] };
    if (sql.includes("WITH RECURSIVE")) return { rows: [{ cycle }] };
    if (sql.startsWith("INSERT INTO genres") || sql.startsWith("UPDATE genres SET name")) return { rows: [row] };
    return { rows: [] };
  });
});

describe("genre administration", () => {
  it("creates a custom genre with normalized name and slug inside one locked transaction", async () => {
    await expect(createGenre("  Póst‑Punk & Dub  ", "root")).resolves.toEqual(row);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("LOCK TABLE"));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("'custom'"), ["Póst‑Punk & Dub", "póst-punk & dub", "post-punk-and-dub", "root"]);
  });
  it("requires an existing parent", async () => {
    missing = "root";
    await expect(createGenre("Dub", "root")).rejects.toMatchObject({ status: 404 });
  });
  it.each(["", "   ", "🎧"])("rejects a name with no slug: %s", async (name) => {
    await expect(createGenre(name, "root")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects names reserved as another genre's alias", async () => {
    aliasOwner = "other";
    await expect(createGenre("Dub", "root")).rejects.toMatchObject({ status: 409 });
  });
  it("maps a unique name or slug constraint violation to a conflict", async () => {
    failure = { code: "23505" };
    await expect(createGenre("Dub", "root")).rejects.toMatchObject({ status: 409 });
  });
  it.each([new Error("offline"), null, "unexpected"])("propagates unexpected failures", async (error) => {
    transaction.mockRejectedValue(error);
    await expect(createGenre("Dub", "root")).rejects.toBe(error);
  });
  it("renames and preserves the old canonical lookup as a manual alias", async () => {
    await updateGenre("source", { name: "  Dub  " });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE genres SET name"), ["Dub", "dub", "dub", "root", "source"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("VALUES ($1,$2,'manual') ON CONFLICT"), ["post-punk", "source"]);
  });
  it.each([{}, { name: "Post‑Punk" }])("avoids a canonical-name alias when the lookup name is unchanged", async (input) => {
    await updateGenre("source", input);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO genre_aliases"))).toBe(false);
  });
  it("promotes a genre's own alias to its canonical name", async () => {
    aliasOwner = "source";
    await updateGenre("source", { name: "Dub" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM genre_aliases"), ["dub", "source"]);
  });
  it("allows a root move", async () => {
    await updateGenre("source", { parent_id: null });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE genres SET name"), ["Post-Punk", "post-punk", "post-punk", null, "source"]);
  });
  it("allows a new existing parent after checking descendants", async () => {
    await updateGenre("source", { parent_id: "target" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WITH RECURSIVE"), ["source", "target"]);
  });
  it("rejects self-parenting", async () => {
    await expect(updateGenre("source", { parent_id: "source" })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a descendant move", async () => {
    cycle = true;
    await expect(updateGenre("source", { parent_id: "child" })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects missing genres and parents", async () => {
    missing = "source";
    await expect(updateGenre("source", { name: "Dub" })).rejects.toMatchObject({ status: 404 });
    missing = "parent";
    await expect(updateGenre("source", { parent_id: "parent" })).rejects.toMatchObject({ status: 404 });
  });
  it("normalizes aliases, including nonbreaking hyphens", async () => {
    await addGenreAlias("source", "  Post‑punk  ");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO genre_aliases"), ["post-punk", "source"]);
  });
  it("rejects canonical names as aliases", async () => {
    canonical = true;
    await expect(addGenreAlias("source", "Dub")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects reassignment of an alias", async () => {
    aliasOwner = "other";
    await expect(addGenreAlias("source", "Dub")).rejects.toMatchObject({ status: 409 });
  });
  it("adding the same alias to its owner is idempotent", async () => {
    aliasOwner = "source";
    await addGenreAlias("source", "Dub");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("rejects aliases on missing genres", async () => {
    missing = "source";
    await expect(addGenreAlias("source", "Dub")).rejects.toMatchObject({ status: 404 });
  });
  it("moves children and aliases and preserves the retired name before deleting the source", async () => {
    await mergeGenres("source", "target");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("UPDATE genres SET parent_id=$1 WHERE parent_id=$2", ["target", "source"]);
    expect(query).toHaveBeenCalledWith("UPDATE genre_aliases SET genre_id=$1 WHERE genre_id=$2", ["target", "source"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("VALUES ($1,$2,'manual')"), ["post-punk", "target"]);
    expect(query).toHaveBeenCalledWith("LOCK TABLE track_genres IN SHARE ROW EXCLUSIVE MODE");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_genres"), ["target", "source"]);
    expect(query).toHaveBeenCalledWith("DELETE FROM track_genres WHERE genre_id=$1", ["source"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE genre_reconciliation_proposals"), ["target", "source"]);
    expect(query).toHaveBeenLastCalledWith("DELETE FROM genres WHERE id=$1", ["source"]);
  });
  it("rejects self-merges", async () => {
    await expect(mergeGenres("source", "source")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects descendant merge targets", async () => {
    cycle = true;
    await expect(mergeGenres("source", "child")).rejects.toMatchObject({ status: 409 });
  });
  it.each(["source", "target"])("rejects missing merge participant %s", async (id) => {
    missing = id;
    await expect(mergeGenres("source", "target")).rejects.toMatchObject({ status: 404 });
  });
  it("propagates merge failure out of the transaction so it rolls back", async () => {
    failure = new Error("delete failed");
    await expect(mergeGenres("source", "target")).rejects.toThrow("delete failed");
  });
});
