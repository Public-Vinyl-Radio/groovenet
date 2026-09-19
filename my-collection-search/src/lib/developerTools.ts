const ENABLED_VALUES = new Set(["1", "true", "yes"]);

export function developerToolsEnabled(): boolean {
  return ENABLED_VALUES.has(process.env.ENABLE_DEVELOPER_TOOLS?.toLowerCase() ?? "");
}

export function storybookUrl(): string | null {
  const value = process.env.STORYBOOK_URL?.trim();
  if (!value) return null;

  // Root-relative path (e.g. "/storybook/index.html") — served same-origin by the app.
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
