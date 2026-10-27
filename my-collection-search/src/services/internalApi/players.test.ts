import { afterEach, describe, expect, it, vi } from "vitest";
import { playerApi } from "./players";
import { player, device, workerA } from "@/test/serverPlayerFixtures";
const fetcher = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("same-origin player transport", () => {
  it("validates responses and uses the shared JSON helper without worker credentials", async () => {
    const p = player();
    vi.stubGlobal("fetch", fetcher.mockImplementation(async (url: string) => Response.json(url.endsWith("/commands") ? { player: p } : url.endsWith("/devices") ? { devices: [device] } : url === "/api/players" ? { players: [p] } : p)));
    expect(await playerApi.list()).toEqual([p]); expect(await playerApi.get("lounge")).toEqual(p); expect(await playerApi.devices("lounge")).toEqual([device]);
    expect(await playerApi.command("lounge", { type: "pause", expected_revision: 3 })).toEqual({ player: p });
    expect(fetcher).toHaveBeenLastCalledWith("/api/players/lounge/commands", expect.objectContaining({ body: '{"type":"pause","expected_revision":3}', headers: { "Content-Type": "application/json" } }));
    fetcher.mockImplementation(async () => Response.json({ authorized: true }));
    await playerApi.session(); await playerApi.unlock("web-only-passphrase"); await playerApi.lock();
    expect(fetcher).toHaveBeenLastCalledWith("/api/players/browser/session", { method: "DELETE" });
    fetcher.mockImplementation(async () => Response.json({ invalid: true })); await expect(playerApi.get("lounge")).rejects.toThrow();
  });
  it.each([false, true])("owns an EventSource and closes on malformed data or disconnect (all=%s)", all => {
    const listeners: Record<string, (event: { data: string }) => void> = {};
    const source = { addEventListener: vi.fn((name, listener) => { listeners[name] = listener; }), close: vi.fn(), onerror: null as (() => void) | null };
    const constructor = vi.fn(function () { return source; }); vi.stubGlobal("EventSource", constructor);
    const receive = vi.fn(); const disconnected = vi.fn(); const close = all ? playerApi.subscribeAll(receive, disconnected) : playerApi.subscribe("lounge", receive, disconnected);
    expect(constructor).toHaveBeenCalledWith(all ? "/api/players/events" : "/api/players/lounge/events");
    const event = { type: "snapshot", player: player(), worker_instance: workerA, sequence: 1 };
    listeners.snapshot!({ data: JSON.stringify(event) }); expect(receive).toHaveBeenCalledWith(event);
    if (all) {
      const initial = { type: "players", players: [], worker_instance: workerA, sequence: 0 };
      listeners.players!({ data: JSON.stringify(initial) }); expect(receive).toHaveBeenLastCalledWith(initial);
    }
    listeners.snapshot!({ data: "invalid" }); expect(disconnected).toHaveBeenCalledTimes(1); expect(source.close).toHaveBeenCalled();
    source.onerror!(); expect(disconnected).toHaveBeenCalledTimes(2); close(); expect(source.close).toHaveBeenCalledTimes(3);
  });
});
