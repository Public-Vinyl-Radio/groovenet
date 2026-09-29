import type { AnalyticsProperties, AnalyticsProvider } from "../types";

export type RecordedEvent = {
  event: string;
  properties: AnalyticsProperties;
  distinctId?: string;
};

/** Records events in memory, for tests to assert on. */
export class MemoryAnalyticsProvider implements AnalyticsProvider {
  readonly name = "memory";
  events: RecordedEvent[] = [];
  identified: { distinctId: string; traits?: AnalyticsProperties }[] = [];
  /** Set in a test to simulate a backend that can identify a request. */
  distinctIdFromRequest?: (request: Request) => string | undefined;

  track(event: string, properties: AnalyticsProperties, distinctId?: string) {
    this.events.push({ event, properties, distinctId });
  }

  identify(distinctId: string, traits?: AnalyticsProperties) {
    this.identified.push({ distinctId, traits });
  }

  reset() {
    this.events = [];
    this.identified = [];
  }

  async flush() {}

  async shutdown() {}
}
