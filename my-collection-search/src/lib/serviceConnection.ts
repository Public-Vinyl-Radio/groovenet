// Node fetch wraps connection errors in a TypeError's cause.
export function serviceNotRunning(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = error.cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause.code === "ECONNREFUSED" || cause.code === "ENOTFOUND")
  );
}
