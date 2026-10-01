import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/serverDb", () => ({ dbQuery }));
import { RecordCopyRepository } from "../recordCopyRepository";

const repo = new RecordCopyRepository();

describe("RecordCopyRepository default copies", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates the release's default copy when it has none", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 1, is_default: true }] });

    await expect(repo.ensureDefaultCopy({ query }, 7, "rel")).resolves.toEqual({
      id: 1,
      is_default: true,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(
      /ON CONFLICT \(friend_id, release_id\) WHERE is_default AND deleted_at IS NULL\s+DO NOTHING/
    );
    expect(params).toEqual([7, "rel"]);
  });

  it("reads back the existing default when the insert does nothing", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 4, is_default: true }] });

    await expect(repo.ensureDefaultCopy({ query }, 7, "rel")).resolves.toEqual({
      id: 4,
      is_default: true,
    });
    expect(query.mock.calls[1][0]).toMatch(/is_default AND deleted_at IS NULL/);
  });

  it("makes a new copy the default only when the release has none", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9, is_default: false }] });

    await repo.createCopy({ query }, { friend_id: 7, release_id: "rel", label: "Copy 2" });

    expect(query.mock.calls[0][0]).toMatch(/VALUES \(\$1, \$2, \$3, \$4, true\)\s+ON CONFLICT/);
    expect(query.mock.calls[1][0]).toMatch(/VALUES \(\$1, \$2, \$3, \$4, false\)/);
    expect(query.mock.calls[1][1]).toEqual([7, "rel", "Copy 2", null]);
  });
});

describe("RecordCopyRepository edits", () => {
  beforeEach(() => vi.resetAllMocks());

  it("locks only live copies unless asked for deleted ones too", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(repo.findCopyForUpdate({ query }, 3, 7)).resolves.toBeNull();
    await repo.findCopyForUpdate({ query }, 3, 7, { includeDeleted: true });

    expect(query.mock.calls[0][0]).toMatch(/deleted_at IS NULL\s+FOR UPDATE/);
    expect(query.mock.calls[1][0]).not.toContain("deleted_at IS NULL");
    expect(query.mock.calls[1][0]).toContain("FOR UPDATE");
  });

  it("updates only the fields it is given", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });

    await repo.updateCopy({ query }, 3, { notes: null });

    expect(query.mock.calls[0][0]).toContain("SET updated_at = NOW(), notes = $2 WHERE id = $1");
    expect(query.mock.calls[0][1]).toEqual([3, null]);
  });

  it("rebuilds care state from live actions only, latest sleeve by time then id", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });

    await repo.refreshCareState({ query }, 3);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/MAX\(ra\.occurred_at\)[\s\S]*action_type = 'cleaned' AND ra\.voided_at IS NULL/);
    expect(sql).toMatch(/action_type = 'sleeved' AND ra\.voided_at IS NULL\s+ORDER BY ra\.occurred_at DESC, ra\.id DESC/);
    expect(params).toEqual([3]);
  });
});

describe("RecordCopyRepository care views", () => {
  beforeEach(() => vi.resetAllMocks());

  const base = { friend_id: 7, overdue_days: 365, needs_sleeve: "poly-rice-paper-poly" as const };

  it("covers albums with no copy rows as their implicit default copy", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });

    await repo.listCare(base);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toMatch(/FROM albums a\s+LEFT JOIN record_copies c/);
    expect(sql).toContain("COALESCE(c.is_default, true) AS is_default");
    expect(sql).toContain("c.deleted_at IS NULL");
    expect(params).toEqual([7, 50, 0]);
  });

  it.each([
    ["never_cleaned", "last_cleaned_at IS NULL", [7]],
    ["overdue", "last_cleaned_at < NOW() - make_interval(days => $2::int)", [7, 365]],
    ["needs_sleeve", "inner_sleeve_type IS DISTINCT FROM $2::varchar", [7, "poly-rice-paper-poly"]],
  ] as const)("filters %s", async (status, clause, filterParams) => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });

    await repo.listCare({ ...base, status, limit: 10, offset: 20 });

    expect(dbQuery.mock.calls[0][0]).toContain(clause);
    expect(dbQuery.mock.calls[0][1]).toEqual([...filterParams, 10, 20]);
    // The count runs the same filter without the paging parameters.
    expect(dbQuery.mock.calls[1][0]).toContain(clause);
    expect(dbQuery.mock.calls[1][1]).toEqual(filterParams);
  });

  it("filters by sleeve, with unknown meaning none logged", async () => {
    dbQuery.mockResolvedValue({ rows: [{ total: 0 }] });

    await repo.listCare({ ...base, sleeve_type: "unknown" });
    await repo.listCare({ ...base, sleeve_type: "paper" });

    expect(dbQuery.mock.calls[0][0]).toContain("inner_sleeve_type IS NULL");
    expect(dbQuery.mock.calls[2][0]).toContain("inner_sleeve_type = $2::varchar");
    expect(dbQuery.mock.calls[2][1]).toEqual([7, "paper", 50, 0]);
  });

  it("returns the page and the unpaged total", async () => {
    dbQuery
      .mockResolvedValueOnce({ rows: [{ release_id: "rel" }] })
      .mockResolvedValueOnce({ rows: [{ total: 12 }] });

    await expect(repo.listCare(base)).resolves.toEqual({
      items: [{ release_id: "rel" }],
      total: 12,
    });
  });

  it("counts care states with the overdue window and target sleeve as parameters", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });

    await repo.careCounts(7, 90, "poly");

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("make_interval(days => $2::int)");
    expect(sql).toContain("IS DISTINCT FROM $3::varchar");
    expect(params).toEqual([7, 90, "poly"]);
  });
});

describe("RecordCopyRepository reads and soft deletes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists live copies, optionally of one release, default first", async () => {
    dbQuery.mockResolvedValue({ rows: [{ id: 1 }] });

    await expect(repo.listCopies(7)).resolves.toEqual([{ id: 1 }]);
    await repo.listCopies(7, "rel");

    expect(dbQuery.mock.calls[0][0]).toContain("deleted_at IS NULL");
    expect(dbQuery.mock.calls[0][0]).not.toContain("release_id = $2");
    expect(dbQuery.mock.calls[0][1]).toEqual([7]);
    expect(dbQuery.mock.calls[1][0]).toContain("AND release_id = $2");
    expect(dbQuery.mock.calls[1][0]).toContain("ORDER BY release_id ASC, is_default DESC, id ASC");
    expect(dbQuery.mock.calls[1][1]).toEqual([7, "rel"]);
  });

  it("finds the friend's copy whether or not it is deleted", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ id: 3 }] }).mockResolvedValueOnce({ rows: [] });

    await expect(repo.findCopy(3, 7)).resolves.toEqual({ id: 3 });
    await expect(repo.findCopy(3, 8)).resolves.toBeNull();
    expect(dbQuery.mock.calls[0][0]).not.toContain("deleted_at");
    expect(dbQuery.mock.calls[0][1]).toEqual([3, 7]);
  });

  it("counts the other live copies of the same release", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [] });
    const copy = { id: 3, friend_id: 7, release_id: "rel" } as never;

    await expect(repo.countSiblings({ query }, copy)).resolves.toBe(2);
    await expect(repo.countSiblings({ query }, copy)).resolves.toBe(0);
    expect(query.mock.calls[0][0]).toContain("id <> $3 AND deleted_at IS NULL");
    expect(query.mock.calls[0][1]).toEqual([7, "rel", 3]);
  });

  it("soft-deletes by stamping deleted_at", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });

    await expect(repo.softDeleteCopy({ query }, 3)).resolves.toEqual({ id: 3 });
    expect(query.mock.calls[0][0]).toContain("SET deleted_at = NOW(), updated_at = NOW()");
    expect(query.mock.calls[0][1]).toEqual([3]);
  });

  it("updates label and notes together", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });

    await repo.updateCopy({ query }, 3, { label: "DJ copy", notes: "Warped" });

    expect(query.mock.calls[0][0]).toContain("label = $2, notes = $3");
    expect(query.mock.calls[0][1]).toEqual([3, "DJ copy", "Warped"]);
  });

  it("groups the care scope by sleeve", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ sleeve_type: null, count: 4 }] });

    await expect(repo.countBySleeveType(7)).resolves.toEqual([{ sleeve_type: null, count: 4 }]);
    expect(dbQuery.mock.calls[0][0]).toContain("GROUP BY inner_sleeve_type");
    expect(dbQuery.mock.calls[0][1]).toEqual([7]);
  });

  it("reports a zero total when the count returns no row", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    await expect(
      repo.listCare({ friend_id: 7, overdue_days: 365, needs_sleeve: "poly" })
    ).resolves.toEqual({ items: [], total: 0 });
  });
});

describe("RecordCopyRepository.createCopy as the first copy", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the claimed default without a second insert", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 5, is_default: true }] });

    await expect(
      repo.createCopy({ query }, { friend_id: 7, release_id: "rel", notes: "VG+" })
    ).resolves.toEqual({ id: 5, is_default: true });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([7, "rel", null, "VG+"]);
  });

  it("updates only the label when only the label is given", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 3 }] });

    await repo.updateCopy({ query }, 3, { label: "DJ copy" });

    expect(query.mock.calls[0][0]).toContain("SET updated_at = NOW(), label = $2 WHERE id = $1");
    expect(query.mock.calls[0][1]).toEqual([3, "DJ copy"]);
  });
});
