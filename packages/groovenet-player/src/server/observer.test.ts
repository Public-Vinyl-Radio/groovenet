import { afterEach, describe, expect, it, vi } from "vitest";
import { homeAssistantObserver } from "./observer.js";
describe("read-only HA observations", () => {
  afterEach(() => vi.useRealTimers());
  it("reports unconfigured and inaccessible entities as unknown", async () => {
    expect((await homeAssistantObserver({})("speaker")).availability).toBe("unknown");
    const transport = vi.fn(async () => new Response(null, { status: 401 }));
    const observe = homeAssistantObserver({ url: "http://ha", token: "private", entities: { speaker: "media_player.lounge" }, fetch: transport });
    expect(await observe("speaker")).toMatchObject({ availability: "unknown", sender_identity: "unknown", source: "home_assistant" });
    expect(transport.mock.calls[0]![0].toString()).toBe("http://ha/api/states/media_player.lounge");
  });
  it.each([["idle", "idle"], ["off", "idle"], ["standby", "idle"], ["playing", "occupied"], ["paused", "occupied"], ["vinyl", "occupied"], ["unknown", "unknown"], ["unavailable", "unknown"]])("maps %s to %s without identifying a sender", async (state, availability) => {
    const transport = vi.fn(async () => Response.json({ state }));
    const observe = homeAssistantObserver({ url: "http://ha/", token: "private", entities: { s: "media_player.room" }, fetch: transport });
    expect(await observe("s")).toMatchObject({ availability, sender_identity: "unknown" });
    expect(transport).toHaveBeenCalledTimes(1);
    await observe("s"); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("expires observations and treats failures as unknown", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async () => Response.json({ state: "idle" }));
    const observe = homeAssistantObserver({ url: "http://ha", token: "private", entities: { s: "media_player.room" }, fetch: transport });
    expect((await observe("s")).availability).toBe("idle");
    transport.mockRejectedValue(new Error("offline"));
    vi.advanceTimersByTime(5001);
    expect((await observe("s")).availability).toBe("unknown");
  });
  it("does not infer availability from malformed HA responses", async () => {
    const observe = homeAssistantObserver({ url: "http://ha/", token: "private", entities: { s: "media_player.room" }, fetch: vi.fn(async () => Response.json(null)) });
    expect((await observe("s")).availability).toBe("unknown");
  });

});
