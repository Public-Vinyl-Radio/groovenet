import type { SpeakerObservation } from "@groovenet/contracts";
import { unknownSpeaker, type SpeakerObserver } from "./manager.js";

/** Exact attribute matches must identify one dedicated engine, never a shared host. */
export function homeAssistantObserver(options: { url?: string; token?: string; entities?: Record<string, string>; senders?: Record<string, Record<string, string>>; fetch?: typeof fetch }): SpeakerObserver {
  const transport = options.fetch ?? globalThis.fetch;
  const cache = new Map<string, { until: number; value: SpeakerObservation }>();
  return async (outputId, context) => {
    const mappedEntity = (key: string) => options.entities && Object.hasOwn(options.entities, key) ? options.entities[key] : undefined;
    let entity = mappedEntity(outputId);
    if (!entity && Object.keys(options.entities ?? {}).length > 0) {
      try {
        const name = context?.outputName ?? await context?.resolveOutputName?.();
        entity = name ? mappedEntity(name) : undefined;
      } catch { /* Discovery failure leaves the output unmapped. */ }
    }
    if (!options.url || !options.token || !entity) return { ...unknownSpeaker(), entity_id: entity ?? null };
    const cached = cache.get(entity);
    if (!context?.fresh && cached && cached.until > Date.now()) return structuredClone(cached.value);
    let value: SpeakerObservation = { availability: "unknown", observed_at: null, source: "home_assistant", entity_id: entity, sender_identity: "unknown", sender_engine_id: null };
    try {
      const response = await transport(new URL(`api/states/${encodeURIComponent(entity)}`, options.url.endsWith("/") ? options.url : `${options.url}/`), { headers: { Authorization: `Bearer ${options.token}` }, signal: AbortSignal.timeout(2000), redirect: "error" });
      if (response.ok) {
        const body: unknown = await response.json();
        if (body && typeof body === "object" && "state" in body && typeof body.state === "string") {
          const state = body.state.toLowerCase();
          const attributes = "attributes" in body && body.attributes && typeof body.attributes === "object" ? body.attributes as Record<string, unknown> : {};
          const senders = Object.entries(options.senders ?? {});
          const matches = senders.filter(([, expected]) => Object.keys(expected).length > 0 && Object.entries(expected).every(([key, expectedValue]) => Object.hasOwn(attributes, key) && attributes[key] === expectedValue));
          // Idle/unavailable metadata can outlive a session. Never identify it.
          if (["playing", "paused", "buffering"].includes(state)) {
            if (matches.length === 1) value = { ...value, sender_identity: "groovenet", sender_engine_id: matches[0]![0] };
            else if (matches.length === 0 && senders.some(([, expected]) => Object.keys(expected).some(key => typeof attributes[key] === "string" && attributes[key] !== ""))) value.sender_identity = "foreign";
          }
          value = { ...value, availability: ["unknown", "unavailable"].includes(state) ? "unknown" : ["idle", "off", "standby"].includes(state) ? "idle" : "occupied", observed_at: new Date().toISOString() };
        }
      }
    } catch { /* Missing/stale observation is unknown, never free. */ }
    cache.set(entity, { until: Date.now() + 5000, value });
    return structuredClone(value);
  };
}
