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

describe("speaker mapping and sender identity", () => {
  const base = { url: "http://ha", token: "private" };
  const senders = { primary: { client_name: "Groovenet-primary", client_ip: "192.0.2.1" }, secondary: { client_name: "Groovenet-secondary", client_ip: "192.0.2.1" } };
  it("supports exact output names, with IDs taking precedence, and exposes unmapped outputs", async () => {
    const transport = vi.fn(async () => Response.json({ state: "idle" }));
    const observe = homeAssistantObserver({ ...base, entities: { opaque: "media_player.id", Lounge: "media_player.lounge" }, fetch: transport });
    expect(await observe("opaque", { outputName: "Lounge" })).toMatchObject({ entity_id: "media_player.id", availability: "idle" });
    expect(await observe("new-id", { outputName: "Lounge" })).toMatchObject({ entity_id: "media_player.lounge", availability: "idle" });
    expect(await observe("constructor", { outputName: "toString" })).toMatchObject({ entity_id: null, availability: "unknown" });
    expect(await observe("unmapped", {})).toMatchObject({ entity_id: null, availability: "unknown" });
    expect(await observe("unmapped")).toMatchObject({ entity_id: null, source: "unconfigured", availability: "unknown" });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await homeAssistantObserver({ entities: { s: "media_player.room" } })("s")).toMatchObject({ entity_id: "media_player.room", source: "unconfigured" });
    expect(await homeAssistantObserver({ entities: { Lounge: "media_player.lounge" } })("new-id", { outputName: "Lounge" })).toMatchObject({ entity_id: "media_player.lounge", source: "unconfigured" });
  });
  it("resolves names only when necessary and leaves discovery failures unknown", async () => {
    const resolveOutputName = vi.fn(async () => "Lounge");
    const observe = homeAssistantObserver({ ...base, entities: { Lounge: "media_player.lounge" }, fetch: vi.fn(async () => Response.json({ state: "idle" })) });
    expect((await observe("s", { resolveOutputName })).availability).toBe("idle");
    resolveOutputName.mockRejectedValue(new Error("offline"));
    expect((await observe("s", { resolveOutputName })).availability).toBe("unknown");
    expect((await homeAssistantObserver(base)("s", { resolveOutputName })).availability).toBe("unknown");
    expect(resolveOutputName).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["playing", { client_name: "Groovenet-primary", client_ip: "192.0.2.1" }, "groovenet", "primary"],
    ["paused", { client_name: "Groovenet-primary", client_ip: "192.0.2.1" }, "groovenet", "primary"],
    ["buffering", { client_name: "Groovenet-secondary", client_ip: "192.0.2.1" }, "groovenet", "secondary"],
    ["playing", { client_name: "Phone", client_ip: "192.0.2.2" }, "foreign", null],
    ["playing", { client_name: "Groovenet-primary", client_ip: "192.0.2.2" }, "foreign", null],
    ["playing", {}, "unknown", null],
    ["playing", null, "unknown", null],
    ["playing", { client_name: "", client_ip: "" }, "unknown", null],
    ["idle", { client_name: "Groovenet-primary", client_ip: "192.0.2.1" }, "unknown", null],
    ["unavailable", { client_name: "Groovenet-primary", client_ip: "192.0.2.1" }, "unknown", null],
  ])("identifies only active, exact sender matches (%s, %j)", async (state, attributes, identity, engine) => {
    const observe = homeAssistantObserver({ ...base, entities: { s: "media_player.room" }, senders, fetch: vi.fn(async () => Response.json({ state, attributes })) });
    expect(await observe("s")).toMatchObject({ sender_identity: identity, sender_engine_id: engine });
  });
  it("never treats an ambiguous shared host address as an engine identity", async () => {
    const observe = homeAssistantObserver({ ...base, entities: { s: "media_player.room" }, senders: { a: { client_ip: "192.0.2.1" }, b: { client_ip: "192.0.2.1" }, c: {} }, fetch: vi.fn(async () => Response.json({ state: "playing", attributes: { client_ip: "192.0.2.1" } })) });
    expect(await observe("s")).toMatchObject({ availability: "occupied", sender_identity: "unknown", sender_engine_id: null });
  });
  it("refreshes cached idle state before connecting, and returns independent copies", async () => {
    const transport = vi.fn(async () => Response.json({ state: "idle" }));
    const observe = homeAssistantObserver({ ...base, entities: { s: "media_player.room" }, fetch: transport });
    const first = await observe("s"); first.availability = "occupied";
    expect((await observe("s")).availability).toBe("idle");
    transport.mockImplementation(async () => Response.json({ state: "playing" }));
    expect((await observe("s", { fresh: true })).availability).toBe("occupied");
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
