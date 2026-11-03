import { expect, it } from "vitest";
import { nextScheduledRun, schedulePreset, SCHEDULE_PRESETS } from "./backupSchedule";
it.each(SCHEDULE_PRESETS)("maps $label to its cron", ({ cron }) =>
  expect(schedulePreset(cron)).toBe(cron),
);
it("normalizes spacing and maps nonpresets to Custom", () => {
  expect(schedulePreset(" 0  */6 * * * ")).toBe("0 */6 * * *");
  expect(schedulePreset("0 3 * * *")).toBe("custom");
});
it.each([
  ["0 * * * *", "2026-11-02T03:00:00Z", "2026-11-02T04:00:00Z"],
  ["0 * * * *", "2026-11-02T03:59:00Z", "2026-11-02T04:00:00Z"],
  ["0 */6 * * *", "2026-11-02T23:30:00Z", "2026-11-03T00:00:00Z"],
  ["0 */6 * * *", "2026-11-02T05:59:00Z", "2026-11-02T06:00:00Z"],
  ["0 0 * * *", "2026-11-02T03:00:00Z", "2026-11-03T00:00:00Z"],
  ["0 0 * * *", "2026-11-02T23:59:00Z", "2026-11-03T00:00:00Z"],
  ["0 0 * * 0", "2026-11-02T03:00:00Z", "2026-11-08T00:00:00Z"],
])("predicts the next UTC run for %s at %s", (cron, now, next) =>
  expect(nextScheduledRun(cron, new Date(now))?.toISOString()).toBe(next.replace("Z", ".000Z")),
);
it("does not guess for unsupported custom schedules", () =>
  expect(nextScheduledRun("not a cron")).toBeNull());
it("accepts the current time by default", () =>
  expect(nextScheduledRun("0 * * * *")).toBeInstanceOf(Date));

it.each([
  ["0 3 * * *", "2026-11-02T03:00:00Z", "2026-11-03T03:00:00.000Z"],
  ["*/15 1,3 * * *", "2026-11-02T01:31:00Z", "2026-11-02T01:45:00.000Z"],
  ["0 0 29 2 *", "2026-11-02T03:00:00Z", "2028-02-29T00:00:00.000Z"],
])("predicts a supported custom cron %s", (cron, now, next) =>
  expect(nextScheduledRun(cron, new Date(now))?.toISOString()).toBe(next),
);
it.each(["0 0 31 2 *", "0 0 * * MON", "0 0 1-3 * *", "*/0 * * * *", ", 0 * * *"])(
  "does not predict an impossible or unsupported schedule %s",
  (cron) => expect(nextScheduledRun(cron)).toBeNull(),
);
it.each(["*/1.5 * * * *", "*/invalid * * * *"])("rejects a noninteger wildcard step %s", (cron) =>
  expect(nextScheduledRun(cron)).toBeNull(),
);
