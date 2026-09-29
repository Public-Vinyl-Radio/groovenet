// Analytics must never break the thing being measured. Provider errors are
// swallowed; the first one is logged so a misconfiguration is still visible.

let warned = false;

export function safely(action: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    warnOnce(action, error);
  }
}

export async function safelyAsync(
  action: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    warnOnce(action, error);
  }
}

function warnOnce(action: string, error: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    `[analytics] ${action} failed; further analytics errors are suppressed:`,
    error
  );
}

/** Test helper: let the next error be logged again. */
export function resetWarnedForTests() {
  warned = false;
}
