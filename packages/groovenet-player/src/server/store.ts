import { Pool, type PoolClient } from "pg";
import { serverPlayerSchema, type CreateServerPlayer, type PlayerTrackRef, type ServerPlayer, type ServerPlayerState } from "@groovenet/contracts";
import type { Track } from "@groovenet/client";

export class ServerPlayerError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}
export interface PlayerStore {
  list(): Promise<ServerPlayer[]>;
  create(input: CreateServerPlayer, state: ServerPlayerState): Promise<ServerPlayer>;
  save(player: ServerPlayer, expectedRevision: number): Promise<ServerPlayer>;
  checkpoint(player: ServerPlayer): Promise<void>;
  resolve(ref: PlayerTrackRef): Promise<Track | null>;
}

/** Only the elected worker writes this table; every command also uses CAS. */
export class PostgresPlayerStore implements PlayerStore {
  private lease?: PoolClient;
  private onLost?: () => void;
  constructor(readonly pool: Pool) {}

  async acquire(onLost: () => void): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query("SELECT pg_try_advisory_lock(693, 1) AS acquired");
      if (!result.rows[0]?.acquired) throw new ServerPlayerError("WORKER_ALREADY_RUNNING", "Another player worker owns the engine lifecycles", 503);
      this.lease = client;
      this.onLost = onLost;
      this.pool.on("error", onLost);
      client.once("error", onLost);
      client.once("end", onLost);
    } catch (error) { client.release(); throw error; }
  }

  async heartbeat(): Promise<void> {
    if (!this.lease) throw new ServerPlayerError("WORKER_UNAVAILABLE", "Player worker has no database lease", 503);
    await this.lease.query("SELECT 1");
  }

  async release(): Promise<void> {
    const lease = this.lease;
    this.lease = undefined;
    try {
      if (lease) {
        try { await lease.query("SELECT pg_advisory_unlock(693, 1)"); }
        finally { lease.release(); }
      }
    } finally {
      if (this.onLost) {
        this.pool.off("error", this.onLost);
        lease?.off("error", this.onLost);
        lease?.off("end", this.onLost);
        this.onLost = undefined;
      }
      await this.pool.end();
    }
  }

  private row(row: Record<string, unknown>): ServerPlayer {
    return serverPlayerSchema.parse({ id: row.id, name: row.name, engine_id: row.engine_id, revision: Number(row.revision), assigned_output: row.assigned_output, state: row.state });
  }

  async list(): Promise<ServerPlayer[]> {
    const result = await this.pool.query("SELECT * FROM server_players ORDER BY id");
    return result.rows.map((row) => this.row(row));
  }

  async create(input: CreateServerPlayer, state: ServerPlayerState): Promise<ServerPlayer> {
    try {
      const result = await this.pool.query("INSERT INTO server_players(id, name, engine_id, state) VALUES ($1, $2, $3, $4::jsonb) RETURNING *", [input.id, input.name, input.engine_id, JSON.stringify(state)]);
      return this.row(result.rows[0]);
    } catch (error) { throw this.mapError(error); }
  }

  async save(player: ServerPlayer, expectedRevision: number): Promise<ServerPlayer> {
    try {
      const result = await this.pool.query(`UPDATE server_players SET name=$2, assigned_output=$3, state=$4::jsonb, revision=revision+1, updated_at=now() WHERE id=$1 AND revision=$5 RETURNING *`, [player.id, player.name, player.assigned_output, JSON.stringify(player.state), expectedRevision]);
      if (!result.rows[0]) throw new ServerPlayerError("REVISION_CONFLICT", "Player changed; refresh its state before retrying");
      return this.row(result.rows[0]);
    } catch (error) { throw this.mapError(error); }
  }

  async checkpoint(player: ServerPlayer): Promise<void> {
    // Do not bump the edit revision for elapsed-time updates. CAS prevents a
    // delayed checkpoint from overwriting a newer command or queue transition.
    await this.pool.query("UPDATE server_players SET state=$2::jsonb, updated_at=now() WHERE id=$1 AND revision=$3", [player.id, JSON.stringify(player.state), player.revision]);
  }

  async resolve(ref: PlayerTrackRef): Promise<Track | null> {
    const result = await this.pool.query("SELECT t.* FROM tracks t WHERE track_id=$1 AND friend_id=$2 LIMIT 2", [ref.track_id, ref.friend_id]);
    if (result.rows.length !== 1) return null;
    return result.rows[0] as Track;
  }

  private mapError(error: unknown): unknown {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return new ServerPlayerError("ASSIGNMENT_CONFLICT", "Player ID, engine, or speaker is already assigned");
    return error;
  }
}
