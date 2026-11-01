import { expect, it, vi } from "vitest";
import { dbQuery } from "@/lib/serverDb";
import {
  recordCareQueueRepository,
  recordCareQueueSql,
  cleaningHistorySql,
  openStackCopiesSql,
  careThisMonthSql,
} from "../recordCareQueueRepository";
import { CARE_SCOPE_SQL } from "../recordCopyRepository";
import { newArrivalsPredicate } from "../homeRepository";
vi.mock("@/lib/serverDb", () => ({ dbQuery: vi.fn() }));
it("binds scope, calendar month, zone, paging and open-stack exclusions", async () => {
  const result = { items: [], backlog_total: 0 };
  const now = new Date();
  vi.mocked(dbQuery).mockResolvedValue({ rows: [result] } as never);
  const excluded = [
    { copy_id: null, release_id: "implicit" },
    { copy_id: 2, release_id: "explicit" },
  ];
  expect(
    await recordCareQueueRepository.queue(
      7,
      "2026-10",
      "America/Los_Angeles",
      now,
      5,
      10,
      excluded,
    ),
  ).toBe(result);
  expect(dbQuery).toHaveBeenLastCalledWith(recordCareQueueSql, [
    7,
    "2026-10-01",
    "America/Los_Angeles",
    now,
    5,
    10,
    JSON.stringify(excluded),
  ]);
  expect(await recordCareQueueRepository.history(7, now, "UTC")).toBe(result);
  expect(dbQuery).toHaveBeenLastCalledWith(cleaningHistorySql, [7, now, "UTC"]);
});
it("uses exactly the summary scope for implicit, multiple, deleted and removed copies", () => {
  expect(recordCareQueueSql).toContain(CARE_SCOPE_SQL);
  expect(cleaningHistorySql).toContain(CARE_SCOPE_SQL);
  expect(CARE_SCOPE_SQL).toContain("LEFT JOIN record_copies");
  expect(CARE_SCOPE_SQL).toContain("c.deleted_at IS NULL");
});
it("groups once by precedence, ignores voided cleanings, and shares Home's import window", () => {
  expect(recordCareQueueSql).toContain("WHERE c.first_cleaned IS NULL");
  expect(recordCareQueueSql).toContain("ra.action_type = 'cleaned' AND ra.voided_at IS NULL");
  expect(recordCareQueueSql).toContain("CASE WHEN s.spin_count > 0 THEN 'spun_recently'");
  expect(recordCareQueueSql).toContain(
    `WHEN ${newArrivalsPredicate("c", "$4")} THEN 'new_arrivals'`,
  );
  expect(recordCareQueueSql).toContain("ELSE 'backlog' END");
});
it("counts vinyl events only in a half-open local calendar month, including DST changes", () => {
  expect(recordCareQueueSql).toContain(
    "JOIN spin_sessions s ON s.id = e.session_id AND s.medium = 'vinyl'",
  );
  expect(recordCareQueueSql).toContain("e.played_at >= ($2::date::timestamp AT TIME ZONE $3)");
  expect(recordCareQueueSql).toContain(
    "e.played_at < (($2::date + interval '1 month') AT TIME ZONE $3)",
  );
  expect(recordCareQueueSql).toContain("e.friend_id = $1");
});
it("excludes open-stack refs by copy identity, including implicit defaults", () => {
  expect(recordCareQueueSql).toContain("NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($7::jsonb)");
  expect(recordCareQueueSql).toContain("excluded.copy_id IS NOT DISTINCT FROM c.copy_id");
});
it("ranks spins by count and recency, pages only backlog A–Z and keeps unpaged total", () => {
  expect(recordCareQueueSql).toContain("THEN spin_count END DESC");
  expect(recordCareQueueSql).toContain("THEN last_spin_at END DESC");
  expect(recordCareQueueSql).toContain(
    "artist ASC, title ASC, release_id ASC, copy_id ASC NULLS FIRST",
  );
  expect(recordCareQueueSql).toContain("group_name <> 'backlog' OR (position > $6");
  expect(recordCareQueueSql).toContain(
    "count(*) FILTER (WHERE group_name = 'backlog')::int AS backlog_total",
  );
});
it("pace counts each live copy's first non-voided cleaning once in 28 days", () => {
  expect(cleaningHistorySql).toContain("min(ra.occurred_at)");
  expect(cleaningHistorySql).toContain("count(first_cleaned)::int AS cleaned");
  expect(cleaningHistorySql).toContain("interval '28 days'");
  expect(cleaningHistorySql).toContain("first_cleaned <= $2");
});

it("reads open stack items, resolving implicit refs to a newly materialized default", async () => {
  const rows = [{ copy_id: 4, release_id: "r" }];
  vi.mocked(dbQuery).mockResolvedValue({ rows } as never);
  expect(await recordCareQueueRepository.openStackCopies(7)).toBe(rows);
  expect(dbQuery).toHaveBeenLastCalledWith(openStackCopiesSql, [7]);
  expect(openStackCopiesSql).toContain("coalesce(i.copy_id, c.id)");
  expect(openStackCopiesSql).toContain("c.is_default AND c.deleted_at IS NULL");
  expect(openStackCopiesSql).toContain("s.friend_id = $1 AND s.status = 'open'");
});
it("counts distinct live records/sessions by logged time inside local month bounds", async () => {
  const result = { records: 5, sessions: 2 };
  vi.mocked(dbQuery).mockResolvedValue({ rows: [result] } as never);
  expect(await recordCareQueueRepository.thisMonth(7, "2026-10", "America/Los_Angeles")).toBe(
    result,
  );
  expect(dbQuery).toHaveBeenLastCalledWith(careThisMonthSql, [
    7,
    "2026-10-01",
    "America/Los_Angeles",
  ]);
  expect(careThisMonthSql).toContain("count(DISTINCT ra.copy_id)");
  expect(careThisMonthSql).toContain("count(DISTINCT s.id)");
  expect(careThisMonthSql).toContain("ra.voided_at IS NULL");
  expect(careThisMonthSql).toContain("s.voided_at IS NULL");
  expect(careThisMonthSql).toContain("s.logged_at >= ($2::date::timestamp AT TIME ZONE $3)");
});
