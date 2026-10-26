import type { ServerPlayer, ServerPlayerCommandInput, ServerPlayerDevice, serverPlayerStreamEventSchema } from "@groovenet/contracts";
import { playerApi } from "@/services/internalApi/players";

type WithoutRevision<T> = T extends unknown ? Omit<T, "expected_revision"> : never;
export type PlayerEdit = WithoutRevision<ServerPlayerCommandInput>;
export type ConnectingEdit = Extract<PlayerEdit, { type: "play" | "resume" | "next" | "previous" | "output.select" | "output.transfer" | "queue.replace" }>;
function connects(command: PlayerEdit): command is ConnectingEdit {
  return (command.type === "queue.replace" && command.play === true) || ["play", "resume", "next", "previous", "output.select", "output.transfer"].includes(command.type);
}
type Event = ReturnType<typeof serverPlayerStreamEventSchema.parse>;
export type RemoteView = {
  player: ServerPlayer | null; devices: ServerPlayerDevice[]; connected: boolean; busy: boolean;
  problem: string | null; acknowledgement: { command: ConnectingEdit; code: string; revision: number } | null;
};
const message = (error: unknown) => error instanceof Error ? error.message : "Player request failed";
const code = (error: unknown) => (error as { data?: { code?: string } })?.data?.code;

/** Owns remote observations only. Closing it never sends an audio command. */
export class ServerPlayerController {
  private view: RemoteView = { player: null, devices: [], connected: false, busy: false, problem: null, acknowledgement: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private worker?: string;
  private sequence = -1;
  private reconnecting = false;
  constructor(readonly id: string, private api = playerApi) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<RemoteView>) { this.view = { ...this.view, ...patch }; this.listeners.forEach(listener => listener()); }

  start = () => {
    this.closed = false;
    this.update({ connected: false, busy: false });
    this.connect();
    return () => this.close();
  };
  close() { this.closed = true; ++this.generation; this.unsubscribe?.(); clearTimeout(this.timer); }
  private connect() {
    const generation = ++this.generation;
    this.unsubscribe?.();
    let first = true;
    const current = () => !this.closed && generation === this.generation;
    const disconnected = () => {
      if (!current()) return;
      ++this.generation;
      this.reconnecting = true;
      this.unsubscribe?.();
      this.update({ connected: false, busy: false, acknowledgement: null, problem: "Connection lost. Reconnecting for fresh state; server audio continues." });
      this.timer = setTimeout(() => this.connect(), 1500);
    };
    this.unsubscribe = this.api.subscribe(this.id, (event: Event) => {
      if (!current()) return;
      if (first) {
        if (event.type !== "snapshot" || event.player.id !== this.id) return;
        if (this.worker !== event.worker_instance) this.update({ player: null });
        this.worker = event.worker_instance; this.sequence = -1; first = false;
      }
      if (event.worker_instance !== this.worker || event.sequence <= this.sequence) return;
      this.sequence = event.sequence;
      const player = this.view.player;
      if (event.type === "snapshot") {
        if (event.player.id !== this.id || (player && event.player.revision < player.revision)) return;
        this.update({ player: event.player, connected: true, ...(this.reconnecting ? { problem: null } : {}) });
        this.reconnecting = false;
        void this.refreshDevices(generation);
      } else {
        if (!player || event.player_id !== this.id || event.revision !== player.revision || event.current_entry_id !== player.state.current_entry_id) return;
        this.update({ player: { ...player, state: { ...player.state, position: event.position, duration: event.duration } } });
      }
    }, disconnected);
  }
  private async refreshDevices(generation: number) {
    try {
      const devices = await this.api.devices(this.id);
      if (!this.closed && generation === this.generation) this.update({ devices });
    } catch (error) {
      if (!this.closed && generation === this.generation) this.update({ problem: `Outputs unavailable: ${message(error)}` });
    }
  }
  refresh = async () => {
    const generation = this.generation;
    try {
      const player = await this.api.get(this.id);
      if (!this.closed && generation === this.generation && (!this.view.player || player.revision >= this.view.player.revision)) this.update({ player });
      await this.refreshDevices(generation);
    } catch (error) {
      if (!this.closed && generation === this.generation) this.update({ problem: `Refresh failed: ${message(error)}` });
    }
  };
  dismissAcknowledgement = () => this.update({ acknowledgement: null });
  acknowledge = async () => {
    const acknowledgement = this.view.acknowledgement;
    if (!acknowledgement) return;
    if (this.view.player?.revision !== acknowledgement.revision) {
      this.update({ acknowledgement: null, problem: "Player changed while awaiting acknowledgement. Review its output and repeat the action." });
      return;
    }
    await this.command({ ...acknowledgement.command, ...(acknowledgement.code === "AVAILABILITY_UNKNOWN" ? { allow_unknown: true } : { takeover: true }) });
  };
  async command(command: PlayerEdit): Promise<ServerPlayer | null> {
    if (!this.view.connected || !this.view.player || this.closed) { this.update({ problem: "Wait for a fresh server snapshot before trying the action again." }); return null; }
    if (this.view.busy) { this.update({ problem: "A command is in progress. Try again when it finishes." }); return null; }
    const generation = this.generation;
    const revision = this.view.player.revision;
    this.update({ busy: true, problem: null, acknowledgement: null });
    try {
      const result = await this.api.command(this.id, { ...command, expected_revision: revision });
      if (this.closed || generation !== this.generation) return null;
      if (result.player.revision >= this.view.player!.revision) this.update({ player: result.player });
      if (result.transfer?.error || (result.transfer?.detached && command.type === "output.transfer" && command.play && !result.transfer.attached)) {
        this.update({ problem: `Transfer partially completed: source detached=${result.transfer!.detached}, destination attached=${result.transfer!.attached}. ${result.transfer!.error?.message ?? "Playback did not attach."} Review both players before another action.` });
      }
      void this.refreshDevices(generation);
      return result.player;
    } catch (error) {
      if (this.closed || generation !== this.generation) return null;
      const errorCode = code(error);
      if ((errorCode === "AVAILABILITY_UNKNOWN" || errorCode === "SPEAKER_OCCUPIED") && connects(command)) this.update({ acknowledgement: { command, code: errorCode, revision } });
      this.update({ problem: errorCode === "REVISION_CONFLICT" ? "Player changed elsewhere. State refreshed; review it and repeat your action if still appropriate." : message(error) });
      await this.refresh();
      return null;
    } finally {
      if (!this.closed && generation === this.generation) this.update({ busy: false });
    }
  }
}
