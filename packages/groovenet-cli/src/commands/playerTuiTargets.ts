import { upcomingTracks, type GroovenetClient, type SessionView } from "@groovenet/client";
import type { PlaybackSnapshot } from "@groovenet/player";
import { RemotePlayerController, type PlayerController } from "./remotePlayer.js";

export type TargetConnection = {
  control: PlayerController;
  snapshot: PlaybackSnapshot;
  id: string;
};
export const queueIdentity = (snapshot: PlaybackSnapshot) =>
  JSON.stringify([
    snapshot.current?.id,
    snapshot.status === "ended",
    snapshot.queue.map(({ id, track }) => [id, track.track_id, track.friend_id]),
  ]);
export function upcomingLocal(snapshot: PlaybackSnapshot) {
  const index = snapshot.queue.findIndex((entry) => entry.id === snapshot.current?.id);
  return upcomingTracks({
    playlist: snapshot.queue,
    currentTrackIndex: index < 0 ? null : index,
    finishedTrack: snapshot.status === "ended",
  }).map(({ track: { track_id, friend_id } }) => ({ track_id, friend_id }));
}

/** Owns target observers, never server audio. One pending join is bound to a local queue identity. */
export class PlayerTargets {
  private listeners = new Set<() => void>();
  private version = 0;
  private closed = false;
  private generation = 0;
  private pending?: {
    control: RemotePlayerController;
    local: TargetConnection;
    queue: string;
    joined: number;
    entries: string[];
  };
  private candidate?: RemotePlayerController;
  private candidateListener?: () => void;
  private finalizedEntries = new Set<string>();
  private joinRevisions = new Map<string, number>();
  private owned = new Set<PlayerController>();
  busy = false;
  problem = "";
  constructor(
    public active: TargetConnection,
    readonly api: GroovenetClient,
    private local: () => Promise<TargetConnection>,
    private remote: (id: string) => RemotePlayerController,
    ownInitial = false,
  ) {
    if (ownInitial && active.id) this.owned.add(active.control);
    if (active.control instanceof RemotePlayerController) active.control.interactive = true;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  get preview(): SessionView | undefined {
    return this.candidate?.session.getSnapshot();
  }
  get confirmation() {
    return this.candidate?.session.getSnapshot().acknowledgement;
  }
  private async dropCandidate() {
    this.candidateListener?.();
    this.candidateListener = undefined;
    const candidate = this.candidate;
    this.candidate = undefined;
    this.pending = undefined;
    if (candidate && candidate !== this.active.control) {
      this.owned.delete(candidate);
      await candidate.close();
    }
  }
  async previewTarget(id: string) {
    if (this.busy || this.closed) return;
    const generation = ++this.generation;
    await this.dropCandidate();
    this.problem = "";
    this.changed();
    if (!id || id === this.active.id || generation !== this.generation || this.closed) return;
    try {
      const candidate = this.remote(id);
      candidate.interactive = true;
      this.candidate = candidate;
      this.owned.add(candidate);
      this.candidateListener = candidate.session.subscribe(() => this.changed());
      await candidate.refresh();
      if (generation !== this.generation || this.closed) return;
      candidate.startEvents();
    } catch (error) {
      if (generation === this.generation && !this.closed)
        this.problem = String(error instanceof Error ? error.message : error);
    }
    this.changed();
  }
  async cancel() {
    if (this.busy) return false;
    ++this.generation;
    await this.dropCandidate();
    this.problem = "";
    this.changed();
    return true;
  }
  /** No queue is copied when departing a server. Empty local queues only attach an observer. */
  async select(id: string): Promise<boolean> {
    if (this.busy || this.closed) return false;
    if (id === this.active.id) return true;
    this.busy = true;
    this.problem = "";
    this.changed();
    try {
      if (!id) {
        await this.activate(await this.local());
        return true;
      }
      const control = this.candidate;
      if (!control || control.playerId !== id || !control.session.getSnapshot().connected)
        throw new Error("Wait for a fresh target preview before joining.");
      if (!this.active.id) {
        const snapshot = await this.active.control.request<PlaybackSnapshot>("status");
        if (snapshot.queue.some((entry) => this.finalizedEntries.has(entry.id)))
          throw new Error(
            "Previously joined entries remain locally. Remove them before another Join to avoid duplicates.",
          );
        const tracks = upcomingLocal(snapshot);
        if (tracks.length) {
          // As on the web, pause before joining; a refusal keeps the complete local queue.
          if (snapshot.status === "playing" || snapshot.status === "loading")
            await this.active.control.request("pause");
          const paused = await this.active.control.request<PlaybackSnapshot>("status");
          if (queueIdentity(snapshot) !== queueIdentity(paused))
            throw new Error("Local queue changed. Review it before joining.");
          const pending = {
            control,
            local: this.active,
            queue: queueIdentity(paused),
            joined: control.joined,
            entries: paused.queue.map((entry) => entry.id),
          };
          this.pending = pending;
          const attempt = `${id}:${pending.queue}`;
          const revision =
            this.joinRevisions.get(attempt) ?? control.session.getSnapshot().player!.revision;
          this.joinRevisions.set(attempt, revision);
          // Retrying an ambiguous failure keeps its original CAS fence, including after reopening.
          await control.session.command(
            { type: "session.join", tracks, ...control.policy },
            revision,
          );
          if (control.joined === pending.joined) {
            this.problem =
              control.session.getSnapshot().problem ??
              "Join did not complete. Review the target before retrying.";
            return false;
          }
          return await this.finishJoin();
        }
      }
      await this.activate({ control, snapshot: control.snapshot(), id });
      return true;
    } catch (error) {
      this.problem = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async acknowledge(): Promise<boolean> {
    if (!this.pending || this.busy || this.closed) return false;
    this.busy = true;
    this.changed();
    try {
      const pending = this.pending;
      const snapshot = await pending.local.control.request<PlaybackSnapshot>("status");
      if (queueIdentity(snapshot) !== pending.queue || this.active !== pending.local) {
        pending.control.session.dismissAcknowledgement();
        this.pending = undefined;
        throw new Error("Local queue changed. Review it and repeat Join.");
      }
      await pending.control.session.acknowledge();
      if (pending.control.joined === pending.joined) {
        this.problem =
          pending.control.session.getSnapshot().problem ?? "Review the target and repeat Join.";
        return false;
      }
      return await this.finishJoin();
    } catch (error) {
      this.problem = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  private async finishJoin(): Promise<boolean> {
    const pending = this.pending!;
    this.pending = undefined;
    pending.entries.forEach((id) => this.finalizedEntries.add(id));
    // Commit the target first: cleanup failures must never cause the same queue to merge twice.
    await this.activate({
      control: pending.control,
      snapshot: pending.control.snapshot(),
      id: pending.control.playerId,
    });
    try {
      const local = await pending.local.control.request<PlaybackSnapshot>("status");
      if (queueIdentity(local) !== pending.queue)
        throw new Error("Local queue changed after Join; retained for review.");
      await pending.local.control.request("stop");
      for (const entry of local.queue) {
        await pending.local.control.request("queue.remove", { id: entry.id });
        this.finalizedEntries.delete(entry.id);
      }
    } catch (error) {
      this.problem = `Joined. Local cleanup needs review: ${error instanceof Error ? error.message : String(error)}`;
    }
    return true;
  }
  private async activate(next: TargetConnection) {
    if (this.closed) return;
    const old = this.active;
    this.active = next;
    this.candidateListener?.();
    this.candidateListener = undefined;
    this.candidate = undefined;
    if (old.id && old.control !== next.control && this.owned.has(old.control)) {
      this.owned.delete(old.control);
      await old.control.close();
    }
    this.changed();
  }
  async close() {
    this.closed = true;
    ++this.generation;
    this.candidateListener?.();
    this.pending = undefined;
    await Promise.all([...this.owned].map((control) => control.close()));
    this.owned.clear();
    this.listeners.clear();
  }
}
