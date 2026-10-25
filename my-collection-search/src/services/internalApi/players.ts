import { serverPlayerSchema, serverPlayerListSchema, serverPlayerDeviceListSchema, serverPlayerCommandResultSchema, serverPlayerStreamEventSchema, type ServerPlayerCommandInput } from "@groovenet/contracts";
import { playerWebSessionSchema } from "@/api-contract/schemas";
import { http } from "@/services/http";

const path = (id: string) => `/api/players/${encodeURIComponent(id)}`;
export const playerApi = {
  list: async () => serverPlayerListSchema.parse(await http("/api/players", { cache: "no-store" })).players,
  get: async (id: string) => serverPlayerSchema.parse(await http(path(id), { cache: "no-store" })),
  devices: async (id: string) => serverPlayerDeviceListSchema.parse(await http(`${path(id)}/devices`, { cache: "no-store" })).devices,
  command: async (id: string, command: ServerPlayerCommandInput) => serverPlayerCommandResultSchema.parse(await http(`${path(id)}/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) })),
  session: async () => playerWebSessionSchema.parse(await http("/api/players/browser/session", { cache: "no-store" })),
  unlock: async (passphrase: string) => playerWebSessionSchema.parse(await http("/api/players/browser/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase }) })),
  lock: () => http("/api/players/browser/session", { method: "DELETE" }),
  subscribe(id: string, onEvent: (event: ReturnType<typeof serverPlayerStreamEventSchema.parse>) => void, onDisconnect: () => void) {
    const source = new EventSource(`${path(id)}/events`);
    const receive = (event: MessageEvent<string>) => {
      try { onEvent(serverPlayerStreamEventSchema.parse(JSON.parse(event.data))); }
      catch { source.close(); onDisconnect(); }
    };
    source.addEventListener("snapshot", receive);
    source.addEventListener("position", receive);
    source.onerror = () => { source.close(); onDisconnect(); };
    return () => source.close();
  },
};
