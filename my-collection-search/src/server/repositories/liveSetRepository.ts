import type { PoolClient } from "pg";
import { dbQuery } from "@/lib/serverDb";

export type LiveSetStatus = "draft" | "performed" | "archived";
export type LiveSetMediaType = "image" | "flyer" | "audio" | "youtube" | "link";
export type LiveSetUpdate = {
  title?: string | null;
  status?: LiveSetStatus;
  notes?: string | null;
  location_name?: string | null;
  location_city?: string | null;
  cover_image_url?: string | null;
  collaborators?: Array<{ friend_id: number; role?: string }>;
  performances?: Array<{ performed_at: string; venue_name?: string | null; location_city?: string | null; notes?: string | null }>;
  media?: Array<{ media_type: LiveSetMediaType; url: string; filename?: string | null; caption?: string | null }>;
};

export type LiveSetRecord = {
  id: number;
  playlist_id: number;
  title: string | null;
  status: LiveSetStatus;
  notes: string | null;
  location_name: string | null;
  location_city: string | null;
  cover_image_url: string | null;
};

export class LiveSetRepository {
  async deleteByPlaylistId(playlistId: number): Promise<boolean> {
    const result = await dbQuery("DELETE FROM live_sets WHERE playlist_id = $1", [playlistId]);
    return (result.rowCount ?? 0) > 0;
  }
  async findByPlaylistId(playlistId: number): Promise<LiveSetRecord | null> {
    const result = await dbQuery<LiveSetRecord>(
      "SELECT id, playlist_id, title, status, notes, location_name, location_city, cover_image_url FROM live_sets WHERE playlist_id = $1",
      [playlistId]
    );
    return result.rows[0] ?? null;
  }

  async findDetailByPlaylistId(playlistId: number) {
    const set = await this.findByPlaylistId(playlistId);
    if (!set) return null;
    const [collaborators, performances, media] = await Promise.all([
      dbQuery("SELECT c.friend_id, f.username, c.role FROM live_set_collaborators c JOIN friends f ON f.id = c.friend_id WHERE c.live_set_id = $1 ORDER BY f.username", [set.id]),
      dbQuery("SELECT id, performed_at, venue_name, location_city, notes FROM live_set_performances WHERE live_set_id = $1 ORDER BY performed_at DESC", [set.id]),
      dbQuery("SELECT id, media_type, url, filename, caption, position FROM live_set_media WHERE live_set_id = $1 ORDER BY position, id", [set.id]),
    ]);
    return { ...set, collaborators: collaborators.rows, performances: performances.rows, media: media.rows };
  }

  async ensureForPlaylist(client: PoolClient, playlistId: number): Promise<LiveSetRecord> {
    const result = await client.query<LiveSetRecord>(
      "INSERT INTO live_sets (playlist_id) VALUES ($1) ON CONFLICT (playlist_id) DO UPDATE SET updated_at = live_sets.updated_at RETURNING id, playlist_id, title, status, notes, location_name, location_city, cover_image_url",
      [playlistId]
    );
    return result.rows[0];
  }

  async update(client: PoolClient, setId: number, update: LiveSetUpdate): Promise<void> {
    await client.query(
      "UPDATE live_sets SET title = COALESCE($1, title), status = COALESCE($2, status), notes = COALESCE($3, notes), location_name = COALESCE($4, location_name), location_city = COALESCE($5, location_city), cover_image_url = COALESCE($6, cover_image_url), updated_at = current_timestamp WHERE id = $7",
      [update.title, update.status, update.notes, update.location_name, update.location_city, update.cover_image_url, setId]
    );
  }

  async replaceRelatedRecords(client: PoolClient, setId: number, update: LiveSetUpdate): Promise<void> {
    if (update.collaborators) {
      await client.query("DELETE FROM live_set_collaborators WHERE live_set_id = $1", [setId]);
      for (const item of update.collaborators) await client.query("INSERT INTO live_set_collaborators (live_set_id, friend_id, role) VALUES ($1, $2, $3)", [setId, item.friend_id, item.role || "collaborator"]);
    }
    if (update.performances) {
      await client.query("DELETE FROM live_set_performances WHERE live_set_id = $1", [setId]);
      for (const item of update.performances) await client.query("INSERT INTO live_set_performances (live_set_id, performed_at, venue_name, location_city, notes) VALUES ($1, $2, $3, $4, $5)", [setId, item.performed_at, item.venue_name || null, item.location_city || null, item.notes || null]);
    }
    if (update.media) {
      await client.query("DELETE FROM live_set_media WHERE live_set_id = $1", [setId]);
      for (const [position, item] of update.media.entries()) await client.query("INSERT INTO live_set_media (live_set_id, media_type, url, filename, caption, position) VALUES ($1, $2, $3, $4, $5, $6)", [setId, item.media_type, item.url, item.filename || null, item.caption || null, position]);
    }
  }
}

export const liveSetRepository = new LiveSetRepository();
