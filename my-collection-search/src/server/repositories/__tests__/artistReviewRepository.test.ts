import { beforeEach, expect, it, vi } from "vitest";
const { query, transaction } = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/serverDb", () => ({ dbQuery: query, withDbTransaction: transaction }));
import { artistReviewRepository as repo } from "../artistReviewRepository";
import type { ArtistReviewAction } from "@/api-contract/artistReview";
const split: ArtistReviewAction = {
  action: "split",
  artist_id: 1,
  credits: [
    { artist_id: 2, role: "primary", position: 0, credited_as: "A" },
    { artist_id: 3, role: "featured", position: 1, credited_as: "B" },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation((fn) => fn({ query }));
  query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.startsWith("SELECT id, name FROM artists"))
      return { rows: (args[0] as number[]).map((id) => ({ id, name: `Artist ${id}` })) };
    if (sql.startsWith("INSERT INTO artist_merges")) return { rows: [{ id: 10 }] };
    if (sql.startsWith("INSERT INTO artist_aliases")) return { rows: [{ artist_id: 1 }] };
    return { rows: [] };
  });
});
it("lists only backfill separator strings, paginated after filtering", async () => {
  query.mockResolvedValueOnce({
    rows: [
      { id: 1, spellings: ["Plain Artist"] },
      { id: 2, spellings: ["A & B"] },
      { id: 3, spellings: ["C feat. D"] },
    ],
  });
  expect(await repo.list({ limit: 1, offset: 1 })).toEqual({ items: [] });
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("original_string"), [[3]]);
  await repo.list({ artist_id: 1, limit: 1, offset: 0 });
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("original_string"), [[1]]);
  query.mockResolvedValueOnce({ rows: [] });
  expect(await repo.list({ limit: 20, offset: 0 })).toEqual({ items: [] });
});
it.each<ArtistReviewAction>([
  { action: "accept", artist_id: 1 },
  { action: "placeholder", artist_id: 1, is_placeholder: true },
  { action: "rename", artist_id: 1, name: "A", sort_name: "A, The" },
])("saves $action as a manual review", async (decision) => {
  expect(await repo.decide(decision)).toEqual({ decision, dry_run: false });
  expect(query).toHaveBeenCalledWith(
    "UPDATE album_artists SET source = 'manual' WHERE artist_id = $1",
    [1],
  );
  expect(query).toHaveBeenCalledWith(
    "UPDATE track_artists SET source = 'manual' WHERE artist_id = $1",
    [1],
  );
});
it("splits both kinds of credits with roles, order, and a durable override", async () => {
  await repo.decide(split);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO album_artists"), [
    1,
    3,
    "featured",
    1,
    "B",
  ]);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_artists"), [
    1,
    2,
    "primary",
    0,
    "A",
  ]);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SET credit_override"), [
    1,
    JSON.stringify(split.credits),
  ]);
});
it("records a merge with before/after state and moves aliases", async () => {
  const decision = { action: "merge" as const, artist_id: 1, target_id: 2 };
  expect(await repo.decide(decision)).toEqual({ decision, dry_run: false, merge_id: 10 });
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("UPDATE artist_aliases SET artist_id"),
    [1, 2],
  );
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO track_artists"), [
    1,
    2,
    null,
    null,
    null,
  ]);
});
it("rolls a dry run back by rejecting the transaction callback", async () => {
  let rolledBack = false;
  transaction.mockImplementation(async (fn) => {
    try {
      return await fn({ query });
    } catch (err) {
      rolledBack = true;
      throw err;
    }
  });
  expect((await repo.decide({ action: "accept", artist_id: 1 }, true)).dry_run).toBe(true);
  expect(rolledBack).toBe(true);
});
it("rejects missing identities", async () => {
  query.mockResolvedValue({ rows: [] });
  await expect(repo.decide({ action: "accept", artist_id: 9 })).rejects.toMatchObject({
    status: 404,
  });
});
it("rejects self merges", async () => {
  query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith("SELECT id, name FROM") ? [{ id: 1, name: "Artist 1" }] : [],
  }));
  await expect(repo.decide({ action: "merge", artist_id: 1, target_id: 1 })).rejects.toMatchObject({
    status: 400,
  });
});
it.each([
  [[{ artist_id: 1, role: "primary", position: 0, credited_as: "A" }]],
  [
    [
      { artist_id: 2, role: "primary", position: 0, credited_as: "A" },
      { artist_id: 2, role: "primary", position: 1, credited_as: "A" },
    ],
  ],
])("rejects splits containing the source or duplicate roles", async (credits) => {
  query.mockImplementation(async (sql: string, args: unknown[]) => ({
    rows: sql.startsWith("SELECT id, name FROM")
      ? [...new Set(args[0] as number[])].map((id) => ({ id, name: `Artist ${id}` }))
      : [],
  }));
  await expect(
    repo.decide({ action: "split", artist_id: 1, credits: credits as typeof split.credits }),
  ).rejects.toMatchObject({ status: 400 });
});
it.each(["   ", "A"])("rejects unusable or conflicting rename %s", async (name) => {
  query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith("SELECT id, name FROM") ? [{ id: 1, name: "Artist 1" }] : [],
  }));
  await expect(
    repo.decide({ action: "rename", artist_id: 1, name, sort_name: name }),
  ).rejects.toMatchObject({ status: name === "   " ? 400 : 409 });
});
const empty = { artists: [], artist_aliases: [], album_artists: [], track_artists: [] };
it("restores an unchanged merge snapshot atomically", async () => {
  query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith("SELECT * FROM artist_merges")
      ? [{ source_id: 1, target_id: 2, before_state: empty, after_state: empty }]
      : [],
  }));
  await repo.decide({ action: "unmerge", merge_id: 10 });
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("jsonb_populate_recordset(NULL::track_artists"),
    ["[]"],
  );
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SET undone = true"), [10]);
});
it("rejects stale and missing merges", async () => {
  await expect(repo.decide({ action: "unmerge", merge_id: 99 })).rejects.toMatchObject({
    status: 404,
  });
  query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith("SELECT * FROM artist_merges")
      ? [{ source_id: 1, target_id: 2, before_state: empty, after_state: {} }]
      : [],
  }));
  await expect(repo.decide({ action: "unmerge", merge_id: 10 })).rejects.toMatchObject({
    status: 409,
  });
});
it("propagates database errors", async () => {
  query.mockRejectedValue(new Error("offline"));
  await expect(repo.decide({ action: "accept", artist_id: 1 })).rejects.toThrow("offline");
});

it.each([false, true])("splits using named artists (existing=%s)", async (existing) => {
  query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.startsWith("SELECT id, name FROM artists"))
      return { rows: (args[0] as number[]).map((id) => ({ id, name: "Source" })) };
    if (sql.startsWith("SELECT a.id FROM")) return { rows: existing ? [{ id: 4 }] : [] };
    if (sql.startsWith("INSERT INTO artists")) return { rows: [{ id: 4 }] };
    if (sql.startsWith("INSERT INTO artist_aliases")) return { rows: [{ artist_id: 4 }] };
    return { rows: [] };
  });
  await repo.decide({
    action: "split",
    artist_id: 1,
    credits: [
      {
        name: "New",
        ...(existing ? { sort_name: "New, The" } : {}),
        role: "primary",
        position: 0,
        credited_as: "New",
      },
      { artist_id: 3, role: "featured", position: 1, credited_as: "Guest" },
    ],
  });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SET credit_override"), [
    1,
    expect.stringContaining('"artist_id":4'),
  ]);
});
it("uses an explicit sort name when creating a split artist", async () => {
  query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.startsWith("SELECT id, name FROM artists"))
      return { rows: (args[0] as number[]).map((id) => ({ id, name: "Source" })) };
    if (sql.startsWith("INSERT INTO artists")) return { rows: [{ id: 4 }] };
    if (sql.startsWith("INSERT INTO artist_aliases")) return { rows: [{ artist_id: 4 }] };
    return { rows: [] };
  });
  await repo.decide({
    action: "split",
    artist_id: 1,
    credits: [
      { name: "The New", sort_name: "New, The", role: "primary", position: 0, credited_as: "New" },
      { artist_id: 3, role: "featured", position: 1, credited_as: "Guest" },
    ],
  });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO artists"), [
    "The New",
    "New, The",
    "the-new",
    expect.stringMatching(/^artist-/),
  ]);
});
it.each(["   ", "Unavailable"])("rolls back unusable split name %j", async (name) => {
  query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.startsWith("SELECT id, name FROM artists"))
      return { rows: (args[0] as number[]).map((id) => ({ id, name: "Source" })) };
    if (sql.startsWith("INSERT INTO artists")) return { rows: [{ id: 4 }] };
    return { rows: [] };
  });
  await expect(
    repo.decide({
      action: "split",
      artist_id: 1,
      credits: [
        { name, role: "primary", position: 0, credited_as: "New" },
        { artist_id: 3, role: "featured", position: 1, credited_as: "Guest" },
      ],
    }),
  ).rejects.toMatchObject({ status: name === "   " ? 400 : 409 });
});

it("proposes matched and new credits and rejects missing sources", async () => {
  query
    .mockResolvedValueOnce({ rows: [{ name: "A feat. B" }] })
    .mockResolvedValueOnce({ rows: [{ id: 2 }] })
    .mockResolvedValueOnce({ rows: [] });
  expect(await repo.splitProposal(1)).toEqual({
    credits: [
      { artist_id: 2, credited_as: "A", position: 0, role: "primary" },
      { name: "B", sort_name: "B", credited_as: "B", position: 1, role: "featured" },
    ],
  });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("NOT a.is_placeholder"), [
    ["a", "a", "a"],
    1,
  ]);
  query.mockResolvedValueOnce({ rows: [] });
  await expect(repo.splitProposal(1)).rejects.toMatchObject({ status: 404 });
});

it("matches inverted names using both spellings", async () => {
  query
    .mockResolvedValueOnce({ rows: [{ name: "Strokes, The / Guest" }] })
    .mockResolvedValueOnce({ rows: [{ id: 2 }] })
    .mockResolvedValueOnce({ rows: [] });
  const proposal = await repo.splitProposal(1);
  expect(proposal.credits[0]).toMatchObject({ artist_id: 2, credited_as: "Strokes, The" });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("lower(aa.alias)"), [
    ["the strokes", "strokes, the", "strokes, the"],
    1,
  ]);
});
