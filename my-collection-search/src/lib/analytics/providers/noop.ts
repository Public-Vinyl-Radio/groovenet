import type { AnalyticsProvider } from "../types";

export const noopProvider: AnalyticsProvider = {
  name: "none",
  track() {},
  identify() {},
  reset() {},
  async flush() {},
  async shutdown() {},
};
