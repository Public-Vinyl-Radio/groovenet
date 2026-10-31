const DEFAULT_TIME_ZONE = "UTC";

/**
 * The IANA time zone that day, month and hour bucketing uses. Read at call
 * time (never build time); an unset or invalid GROOVENET_TIME_ZONE is UTC.
 */
export function getDisplayTimeZone(): string {
  const configured = process.env.GROOVENET_TIME_ZONE?.trim();
  if (!configured) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: configured });
    return configured;
  } catch {
    console.warn(
      `GROOVENET_TIME_ZONE "${configured}" is not a valid IANA time zone, using ${DEFAULT_TIME_ZONE}.`,
    );
    return DEFAULT_TIME_ZONE;
  }
}
