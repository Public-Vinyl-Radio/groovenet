export const SCHEDULE_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily", cron: "0 0 * * *" },
  { label: "Weekly", cron: "0 0 * * 0" },
];
export function schedulePreset(cron: string): string {
  return (
    SCHEDULE_PRESETS.find((p) => p.cron === cron.trim().replace(/\s+/g, " "))?.cron ?? "custom"
  );
}

function fieldValues(field: string, min: number, max: number): number[] {
  // Match the existing runner's supported fields: wildcard, wildcard steps and number lists.
  return Array.from({ length: max - min + 1 }, (_, i) => min + i).filter((value) =>
    field.split(",").some((part) => {
      if (part === "*") return true;
      if (part.startsWith("*/")) {
        const step = Number(part.slice(2));
        return Number.isInteger(step) && step > 0 && value % step === 0;
      }
      return part !== "" && Number(part) === value;
    }),
  );
}

/** Predict in UTC, as the existing backup runner does. Unsupported expressions and
 * schedules with no occurrence in the next four years have no predicted date. */
export function nextScheduledRun(cron: string, now = new Date()): Date | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minutes, hours, days, months, weekdays] = fields.map((field, index) =>
    fieldValues(field, [0, 0, 1, 1, 0][index], [59, 23, 31, 12, 6][index]),
  );
  if ([minutes, hours, days, months, weekdays].some((values) => values.length === 0)) return null;
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset <= 1461; offset++, day.setUTCDate(day.getUTCDate() + 1)) {
    if (
      !days.includes(day.getUTCDate()) ||
      !months.includes(day.getUTCMonth() + 1) ||
      !weekdays.includes(day.getUTCDay())
    )
      continue;
    for (const hour of hours)
      for (const minute of minutes) {
        const candidate = new Date(day);
        candidate.setUTCHours(hour, minute);
        if (candidate > now) return candidate;
      }
  }
  return null;
}
