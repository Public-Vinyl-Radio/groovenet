import {
  compareTrackPositions,
  normalizeAlbumTrackSides,
} from "@/lib/albumTrackPosition";
import { withDbTransaction } from "@/lib/serverDb";
import { albumRepository } from "@/server/repositories/albumRepository";
import { trackRepository } from "@/server/repositories/trackRepository";
import {
  spinSessionRepository,
  type CreateSpinSessionSelectionInput,
  type SpinSessionRow,
  type SpinSessionSelectionRow,
} from "@/server/repositories/spinSessionRepository";
import {
  trackSpinEventRepository,
  type TrackSpinEventRow,
  type TopTrackSpinEventRow,
} from "@/server/repositories/trackSpinEventRepository";
import type { Album, Track } from "@/types/track";

export type SpinTrackRef = {
  track_id: string;
  friend_id: number;
};

export type CreateSpinSessionInput = {
  friend_id: number;
  release_id: string;
  played_at: string | Date;
  note?: string | null;
  context_type?: string | null;
  provenance?: "manual" | "automatic";
  source_id?: string | null;
  detection_id?: string | null;
  confidence?: number | null;
} & (
  | {
      side_keys: string[];
      track_refs?: never;
    }
  | {
      side_keys?: never;
      track_refs: SpinTrackRef[];
    }
);

export type SpinSessionDetail = {
  session: SpinSessionRow;
  selections: SpinSessionSelectionRow[];
  track_events: TrackSpinEventRow[];
  derived: {
    is_full_album_spin: boolean;
    selected_side_count: number;
    album_side_count: number;
    track_count: number;
  };
};

export type SpinTopTrackSummary = Omit<TopTrackSpinEventRow, "last_played_at"> & {
  last_played_at: string;
};

type ExpandedTrack = {
  track: Track;
  side_key: string | null;
};

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeSessionRow<T extends { played_at: Date | string; created_at: Date | string; updated_at: Date | string }>(
  row: T
): T & { played_at: string; created_at: string; updated_at: string } {
  return {
    ...row,
    played_at: normalizeTimestamp(row.played_at),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };
}

function normalizeSelectionRow<T extends { created_at: Date | string }>(
  row: T
): T & { created_at: string } {
  return {
    ...row,
    created_at: normalizeTimestamp(row.created_at),
  };
}

function normalizeTrackEventRow<T extends { played_at: Date | string; created_at: Date | string }>(
  row: T
): T & { played_at: string; created_at: string } {
  return {
    ...row,
    played_at: normalizeTimestamp(row.played_at),
    created_at: normalizeTimestamp(row.created_at),
  };
}

function normalizeTopTrackRow<T extends { last_played_at: Date | string }>(
  row: T
): T & { last_played_at: string } {
  return {
    ...row,
    last_played_at: normalizeTimestamp(row.last_played_at),
  };
}

function toIsoStringIfDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : undefined;
}

function normalizeAlbumRow(album: Album): Album {
  return {
    ...album,
    date_added: toIsoStringIfDate(album.date_added),
    date_changed: toIsoStringIfDate(album.date_changed),
    created_at: toIsoStringIfDate(album.created_at),
    updated_at: toIsoStringIfDate(album.updated_at),
  };
}

export class SpinLoggingService {
  async getAlbumPlayableStructure(
    releaseId: string,
    friendId: number
  ): Promise<
    | null
    | {
        album: Album;
        sides: Array<{
          side_key: string;
          side_label: string;
          ordinal: number;
          track_count: number;
          tracks: Array<{
            track_id: string;
            friend_id: number;
            position: string | number | null | undefined;
            title: string;
            artist: string;
          }>;
        }>;
      }
  > {
    const album = await albumRepository.getAlbumByReleaseAndFriend(releaseId, friendId);
    if (!album) return null;

    const tracks = await albumRepository.getTracksByReleaseAndFriend(releaseId, friendId);
    const sides = normalizeAlbumTrackSides(tracks).map((side) => ({
      side_key: side.side_key,
      side_label: side.side_label,
      ordinal: side.ordinal,
      track_count: side.track_count,
      tracks: side.tracks.map((track) => ({
        track_id: track.track_id,
        friend_id: track.friend_id,
        position: track.position,
        title: track.title,
        artist: track.artist,
      })),
    }));

    return {
      album: normalizeAlbumRow(album),
      sides,
    };
  }

  async createSpinSession(input: CreateSpinSessionInput): Promise<SpinSessionDetail> {
    const album = await albumRepository.getAlbumByReleaseAndFriend(
      input.release_id,
      input.friend_id
    );
    if (!album) {
      throw new Error("Album not found");
    }

    const albumTracks = await albumRepository.getTracksByReleaseAndFriend(
      input.release_id,
      input.friend_id
    );
    if (albumTracks.length === 0) {
      throw new Error("Album has no tracks to log");
    }

    const orderedTracks = [...albumTracks].sort((a, b) =>
      compareTrackPositions(a.position, b.position)
    );
    const normalizedSides = normalizeAlbumTrackSides(orderedTracks);

    let selectionExpansion:
      | ReturnType<SpinLoggingService["expandSideSelections"]>
      | ReturnType<SpinLoggingService["expandTrackSelections"]>;

    if (Array.isArray(input.side_keys)) {
      selectionExpansion = this.expandSideSelections(input.side_keys, normalizedSides);
    } else if (Array.isArray(input.track_refs)) {
      selectionExpansion = this.expandTrackSelections(
        input.track_refs,
        orderedTracks,
        normalizedSides
      );
    } else {
      throw new Error("Provide exactly one of side_keys or track_refs");
    }

    const {
      selectionMode,
      selections,
      expandedTracks,
      selectedSideCount,
      albumSideCount,
      isFullAlbumSpin,
    } = selectionExpansion;

    const result = await withDbTransaction(async (client) => {
      const session = await spinSessionRepository.createSession(client, {
        friend_id: input.friend_id,
        release_id: input.release_id,
        selection_mode: input.provenance === "automatic" ? "automatic" : selectionMode,
        played_at: input.played_at,
        note: input.note ?? null,
        context_type: input.context_type ?? null,
        provenance: input.provenance,
        source_id: input.source_id,
        detection_id: input.detection_id,
        confidence: input.confidence,
      });

      const insertedSelections = await spinSessionRepository.insertSelections(
        client,
        session.id,
        selections
      );

      const insertedTrackEvents = await trackSpinEventRepository.insertEvents(
        client,
        session.id,
        expandedTracks.map((expanded, ordinal) => ({
          friend_id: input.friend_id,
          release_id: input.release_id,
          track_id: expanded.track.track_id,
          played_at: input.played_at,
          ordinal,
          side_key: expanded.side_key,
          position_snapshot:
            expanded.track.position == null ? null : String(expanded.track.position),
          title_snapshot: expanded.track.title,
          artist_snapshot: expanded.track.artist,
          album_snapshot: expanded.track.album,
        }))
      );

      return {
        session,
        selections: insertedSelections,
        track_events: insertedTrackEvents,
        derived: {
          is_full_album_spin: isFullAlbumSpin,
          selected_side_count: selectedSideCount,
          album_side_count: albumSideCount,
          track_count: insertedTrackEvents.length,
        },
      };
    });

    return {
      session: normalizeSessionRow(result.session),
      selections: result.selections.map(normalizeSelectionRow),
      track_events: result.track_events.map(normalizeTrackEventRow),
      derived: result.derived,
    };
  }

  async findAutomaticSessionByDetectionId(detectionId: string): Promise<SpinSessionRow | null> {
    return spinSessionRepository.findAutomaticSessionByDetectionId(detectionId);
  }

  /** Create one provenance-stamped, single-track session from a confirmed window. */
  async createAutomaticSpinSession(input: {
    detection_id: string;
    source_id: string;
    track_id: string;
    friend_id: number;
    played_at: string | Date;
    confidence: number;
  }): Promise<SpinSessionDetail> {
    const track = await trackRepository.findTrackByTrackIdAndFriendId(
      input.track_id,
      input.friend_id
    );
    if (!track?.release_id) throw new Error("Detected track has no release");
    return this.createSpinSession({
      friend_id: input.friend_id,
      release_id: track.release_id,
      played_at: input.played_at,
      track_refs: [{ track_id: input.track_id, friend_id: input.friend_id }],
      provenance: "automatic",
      source_id: input.source_id,
      detection_id: input.detection_id,
      confidence: input.confidence,
    });
  }

  async listSpinSessions(filters: {
    friend_id: number;
    release_id?: string;
    track_id?: string;
    limit?: number;
    offset?: number;
    from?: string | Date;
    to?: string | Date;
  }): Promise<
    Array<
      SpinSessionDetail & {
        derived: SpinSessionDetail["derived"];
      }
    >
  > {
    const sessions = await spinSessionRepository.listSessions(filters);
    const sessionIds = sessions.map((session) => session.id);
    const selections = await spinSessionRepository.listSelectionsBySessionIds(sessionIds);
    const trackEvents = await trackSpinEventRepository.listEventsBySessionIds(sessionIds);

    const selectionsBySessionId = new Map<number, SpinSessionSelectionRow[]>();
    const trackEventsBySessionId = new Map<number, TrackSpinEventRow[]>();

    for (const selection of selections) {
      const group = selectionsBySessionId.get(selection.session_id) ?? [];
      group.push(normalizeSelectionRow(selection));
      selectionsBySessionId.set(selection.session_id, group);
    }
    for (const event of trackEvents) {
      const group = trackEventsBySessionId.get(event.session_id) ?? [];
      group.push(normalizeTrackEventRow(event));
      trackEventsBySessionId.set(event.session_id, group);
    }

    return sessions.map((session) => {
      const sessionSelections = selectionsBySessionId.get(session.id) ?? [];
      const sessionTrackEvents = trackEventsBySessionId.get(session.id) ?? [];
      const selectedSideCount = new Set(
        sessionSelections
          .filter((selection) => selection.selection_type === "side")
          .map((selection) => selection.side_key)
          .filter((sideKey): sideKey is string => Boolean(sideKey))
      ).size;

      return {
        session: normalizeSessionRow(session),
        selections: sessionSelections,
        track_events: sessionTrackEvents,
        derived: {
          is_full_album_spin: false,
          selected_side_count: selectedSideCount,
          album_side_count: 0,
          track_count: sessionTrackEvents.length,
        },
      };
    });
  }

  async deleteSpinSession(
    sessionId: number,
    friendId: number
  ): Promise<SpinSessionRow | null> {
    const deleted = await withDbTransaction(async (client) => {
      return await spinSessionRepository.deleteSession(client, sessionId, friendId);
    });

    return deleted ? normalizeSessionRow(deleted) : null;
  }

  async listTopTracks(filters: {
    friend_id: number;
    release_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<SpinTopTrackSummary[]> {
    const rows = await trackSpinEventRepository.listTopTracks(filters);
    return rows.map(normalizeTopTrackRow);
  }

  private expandSideSelections(
    sideKeys: string[],
    normalizedSides: Array<{ side_key: string; tracks: Track[] }>
  ): {
    selectionMode: "sides";
    selections: CreateSpinSessionSelectionInput[];
    expandedTracks: ExpandedTrack[];
    selectedSideCount: number;
    albumSideCount: number;
    isFullAlbumSpin: boolean;
  } {
    const normalizedRequestedSides = sideKeys.map((sideKey) => sideKey.trim().toUpperCase());
    if (normalizedRequestedSides.length === 0) {
      throw new Error("At least one side must be selected");
    }
    if (new Set(normalizedRequestedSides).size !== normalizedRequestedSides.length) {
      throw new Error("Duplicate side keys are not allowed");
    }

    const expandedTracks: ExpandedTrack[] = [];
    const selectedSideSet = new Set(normalizedRequestedSides);

    for (const requestedSide of normalizedRequestedSides) {
      const tracksForSide = normalizedSides.find(
        (normalizedSide) => normalizedSide.side_key === requestedSide
      )?.tracks;
      if (!tracksForSide) {
        throw new Error(`Invalid side key: ${requestedSide}`);
      }
      for (const track of tracksForSide) {
        expandedTracks.push({
          track,
          side_key: requestedSide,
        });
      }
    }

    const selections = normalizedRequestedSides.map((sideKey, ordinal) => ({
      ordinal,
      selection_type: "side" as const,
      side_key: sideKey,
    }));

    return {
      selectionMode: "sides",
      selections,
      expandedTracks,
      selectedSideCount: selectedSideSet.size,
      albumSideCount: normalizedSides.length,
      isFullAlbumSpin:
        selectedSideSet.size > 0 && selectedSideSet.size === normalizedSides.length,
    };
  }

  private expandTrackSelections(
    trackRefs: SpinTrackRef[],
    orderedTracks: Track[],
    normalizedSides: Array<{ side_key: string; tracks: Track[] }>
  ): {
    selectionMode: "tracks";
    selections: CreateSpinSessionSelectionInput[];
    expandedTracks: ExpandedTrack[];
    selectedSideCount: number;
    albumSideCount: number;
    isFullAlbumSpin: boolean;
  } {
    if (trackRefs.length === 0) {
      throw new Error("At least one track must be selected");
    }

    const trackByCompositeKey = new Map<string, Track>();
    const sideByTrackCompositeKey = new Map<string, string | null>();

    for (const track of orderedTracks) {
      const key = `${track.track_id}:${track.friend_id}`;
      trackByCompositeKey.set(key, track);
    }
    for (const normalizedSide of normalizedSides) {
      for (const track of normalizedSide.tracks) {
        sideByTrackCompositeKey.set(
          `${track.track_id}:${track.friend_id}`,
          normalizedSide.side_key
        );
      }
    }

    const seenKeys = new Set<string>();
    const selections: CreateSpinSessionSelectionInput[] = [];
    const expandedTracks: ExpandedTrack[] = [];
    const selectedSides = new Set<string>();

    trackRefs.forEach((trackRef, ordinal) => {
      if (trackRef.friend_id !== orderedTracks[0]?.friend_id) {
        throw new Error("Track friend_id must match the owning album friend_id");
      }
      const compositeKey = `${trackRef.track_id}:${trackRef.friend_id}`;
      if (seenKeys.has(compositeKey)) {
        throw new Error(`Duplicate track selection: ${trackRef.track_id}`);
      }
      seenKeys.add(compositeKey);

      const track = trackByCompositeKey.get(compositeKey);
      if (!track) {
        throw new Error(`Track does not belong to album: ${trackRef.track_id}`);
      }
      const sideKey = sideByTrackCompositeKey.get(compositeKey) ?? null;
      if (sideKey) selectedSides.add(sideKey);

      selections.push({
        ordinal,
        selection_type: "track",
        track_id: track.track_id,
        friend_id: track.friend_id,
        position_snapshot: track.position == null ? null : String(track.position),
      });
      expandedTracks.push({
        track,
        side_key: sideKey,
      });
    });

    return {
      selectionMode: "tracks",
      selections,
      expandedTracks,
      selectedSideCount: selectedSides.size,
      albumSideCount: normalizedSides.length,
      isFullAlbumSpin: false,
    };
  }
}

export const spinLoggingService = new SpinLoggingService();
