import type { SpeakerObservation } from "@groovenet/contracts";
import { unknownSpeaker, type SpeakerObserver } from "./manager.js";

/** Read-only observation. Neither a room state nor sender IP proves app identity. */
export function homeAssistantObserver(options: { url?: string; token?: string; entities?: Record<string, string>; fetch?: typeof fetch }): SpeakerObserver {
  const transport = options.fetch ?? globalThis.fetch;
  const cache = new Map<string, { until: number; value: SpeakerObservation }>();
  return async (outputId) => {
    const entity = options.entities?.[outputId];
    if (!options.url || !options.token || !entity) return unknownSpeaker();
    const cached = cache.get(outputId);
    if (cached && cached.until > Date.now()) return structuredClone(cached.value);
    let value: SpeakerObservation = { availability: "unknown", observed_at: null, source: "home_assistant", sender_identity: "unknown" };
    try {
      const response = await transport(new URL(`api/states/${encodeURIComponent(entity)}`, options.url.endsWith("/") ? options.url : `${options.url}/`), { headers: { Authorization: `Bearer ${options.token}` }, signal: AbortSignal.timeout(2000), redirect: "error" });
      if (response.ok) {
        const body: unknown = await response.json();
        if (body && typeof body === "object" && "state" in body && typeof body.state === "string") {
          const state = body.state.toLowerCase();
          value = { ...value, availability: ["unknown", "unavailable"].includes(state) ? "unknown" : ["idle", "off", "standby"].includes(state) ? "idle" : "occupied", observed_at: new Date().toISOString() };
        }
      }
    } catch { /* Missing/stale observation is unknown, never free. */ }
    cache.set(outputId, { until: Date.now() + 5000, value });
    return structuredClone(value);
  };
}
