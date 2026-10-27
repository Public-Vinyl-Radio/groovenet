import { describe, expect, it, vi } from "vitest";
import type { GroovenetClient } from "./client.js";
import { clientTransport } from "./serverPlayerTransport.js";

describe("clientTransport", () => {
  it("forwards requests to the client", async () => {
    const client = { getServerPlayer: vi.fn(async () => "player"), listServerPlayerDevices: vi.fn(async () => ["device"]), commandServerPlayer: vi.fn(async () => "result") };
    const transport = clientTransport(client as unknown as GroovenetClient);
    expect(await transport.get("lounge")).toBe("player");
    expect(await transport.devices("lounge")).toEqual(["device"]);
    expect(await transport.command("lounge", { type: "pause", expected_revision: 1 })).toBe("result");
    expect(client.commandServerPlayer).toHaveBeenCalledWith("lounge", { type: "pause", expected_revision: 1 });
  });

  it("relays stream events, reports an ended or failed stream, and aborts on unsubscribe", async () => {
    let signal!: AbortSignal;
    const streams = [async function* () { yield 1; yield 2; }, async function* () { yield 3; throw "boom"; }, async function* () { await new Promise(() => {}); }];
    const client = { serverPlayerEvents: vi.fn((_id: string, s: AbortSignal) => { signal = s; return streams.shift()!(); }) };
    const transport = clientTransport(client as unknown as GroovenetClient);
    const events: unknown[] = []; const lost = vi.fn();
    transport.subscribe("lounge", event => events.push(event), lost);
    await new Promise(resolve => setImmediate(resolve));
    expect(events).toEqual([1, 2]);
    expect(lost).toHaveBeenCalledWith(expect.objectContaining({ message: "Remote event connection lost." }));
    transport.subscribe("lounge", event => events.push(event), lost);
    await new Promise(resolve => setImmediate(resolve));
    expect(events).toEqual([1, 2, 3]);
    expect(lost).toHaveBeenLastCalledWith("boom");
    const stop = transport.subscribe("lounge", () => {}, lost);
    stop();
    expect(signal.aborted).toBe(true);
  });
});
