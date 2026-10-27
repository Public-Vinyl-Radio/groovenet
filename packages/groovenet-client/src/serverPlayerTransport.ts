import type { GroovenetClient } from "./client.js";
import type { ServerPlayerTransport } from "./serverPlayerSession.js";

/** Node transport for a session: requests through `GroovenetClient`, events off its SSE stream. */
export function clientTransport(client: GroovenetClient): ServerPlayerTransport {
  return {
    get: (id) => client.getServerPlayer(id),
    devices: (id) => client.listServerPlayerDevices(id),
    command: (id, command) => client.commandServerPlayer(id, command),
    subscribe(id, onEvent, onDisconnect) {
      const abort = new AbortController();
      void (async () => {
        try {
          for await (const event of client.serverPlayerEvents(id, abort.signal)) onEvent(event);
          onDisconnect(new Error("Remote event connection lost."));
        } catch (error) { onDisconnect(error); }
      })();
      return () => abort.abort();
    },
  };
}
