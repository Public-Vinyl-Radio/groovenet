import axios, { type AxiosInstance } from "axios";
import { Agent as HttpsAgent } from "https";
import type {
  Track,
  Playlist,
  Friend,
  Album,
  AlbumSearchQuery,
  AlbumSearchResponse,
  AlbumDetail,
  AlbumPlayableStructure,
  AlbumUpdate,
  AlbumDownloadResult,
  SpinCreateInput,
  SpinCreateResponse,
  SpinDeleteResponse,
  SpinListQuery,
  SpinListResponse,
  SpinTopTracksQuery,
  SpinTopTracksResponse,
  TrackSearchQuery,
  TrackSearchResponse,
  TrackUpdate,
  PlaybackStatus,
  SimilarIdentityResponse,
  SimilarVibeResponse,
  IdentitySimilarityQuery,
  SimilarityQuery,
  RecommendationCandidatesResponse,
  RecommendationCandidatesQuery,
} from "./types.js";

export interface GroovenetClientConfig {
  baseUrl: string;
  apiKey?: string;
  /** Skip TLS certificate verification (internal CA / self-signed hosts). */
  insecureTls?: boolean;
}

export class GroovenetClient {
  private http: AxiosInstance;

  constructor(config: GroovenetClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {}),
      },
      ...(config.insecureTls
        ? { httpsAgent: new HttpsAgent({ rejectUnauthorized: false }) }
        : {}),
    });
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    try {
      const res = await this.http.request<T>({ method, url: path, data, params });
      return res.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const msg =
          (error.response?.data as Record<string, string>)?.error ||
          (error.response?.data as Record<string, string>)?.message ||
          error.message;
        throw new Error(`API Error: ${msg}`);
      }
      throw error;
    }
  }

  // ── Tracks ─────────────────────────────────────────────────────────────────

  async searchTracks(query: TrackSearchQuery): Promise<TrackSearchResponse> {
    const params: Record<string, string | number | undefined> = {
      q: query.query ?? "",
      limit: query.limit ?? 10,
      offset: query.offset ?? 0,
      friend_id: query.filters?.friend_id,
    };
    const result = await this.request<{
      hits: Track[];
      estimatedTotalHits: number;
      offset: number;
      limit: number;
      processingTimeMs: number;
    }>("GET", "/tracks/search", undefined, params);

    return {
      tracks: result.hits,
      estimatedTotalHits: result.estimatedTotalHits,
      offset: result.offset,
      limit: result.limit,
      processingTimeMs: result.processingTimeMs,
    };
  }

  async getTrack(trackId: string, friendId: number): Promise<Track> {
    return this.request<Track>("GET", `/tracks/${trackId}`, undefined, { friend_id: friendId });
  }

  async updateTrack(
    trackId: string,
    updates: TrackUpdate,
    friendId = 1
  ): Promise<Track> {
    return this.request<Track>("PATCH", "/tracks", {
      track_id: trackId,
      friend_id: friendId,
      ...updates,
    });
  }

  async getMissingAppleMusic(
    page = 1,
    pageSize = 50,
    username?: string
  ): Promise<{ tracks: Track[]; total: number }> {
    const result = await this.request<{
      hits: Track[];
      estimatedTotalHits: number;
    }>(
      "GET",
      "/tracks/search",
      undefined,
      {
        q: "",
        limit: pageSize,
        offset: Math.max(0, page - 1) * pageSize,
        filter: "apple_music_url IS NULL",
      }
    );
    // The current API does not expose a username filter. Keep the parameter
    // for backward compatibility while using the supported collection search.
    void username;
    return { tracks: result.hits, total: result.estimatedTotalHits };
  }

  async batchGetTracks(
    refs: { track_id: string; friend_id: number; position?: number }[],
    options?: { include_vectors?: boolean }
  ): Promise<Track[]> {
    return this.request<Track[]>("POST", "/tracks/batch", {
      tracks: refs,
      ...(options?.include_vectors ? { include_vectors: true } : {}),
    });
  }

  async listDeletedTracks(
    friendId?: number,
    options?: { limit?: number; offset?: number }
  ): Promise<{ tracks: Track[]; total: number }> {
    const params: Record<string, string | number | undefined> = {
      friend_id: friendId,
      limit: options?.limit,
      offset: options?.offset,
    };
    return this.request<{ tracks: Track[]; total: number }>(
      "GET",
      "/tracks/deleted",
      undefined,
      params
    );
  }

  async restoreTrack(
    trackId: string,
    friendId: number
  ): Promise<{ success: boolean; track_id: string; friend_id: number; track: Track }> {
    return this.request<{
      success: boolean;
      track_id: string;
      friend_id: number;
      track: Track;
    }>("POST", `/tracks/${trackId}/restore`, undefined, { friend_id: friendId });
  }

  // ── Albums ──────────────────────────────────────────────────────────────────

  async searchAlbums(query: AlbumSearchQuery = {}): Promise<AlbumSearchResponse> {
    const params: Record<string, string | number> = {
      q: query.q ?? "",
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      sort: query.sort ?? "created_at:desc",
    };
    if (query.friend_id != null) params.friend_id = query.friend_id;
    return this.request<AlbumSearchResponse>("GET", "/albums", undefined, params);
  }

  async getAlbum(releaseId: string, friendId: number): Promise<AlbumDetail> {
    return this.request<AlbumDetail>(
      "GET",
      `/albums/${releaseId}`,
      undefined,
      { friend_id: friendId }
    );
  }

  async getAlbumPlayableStructure(
    releaseId: string,
    friendId: number
  ): Promise<AlbumPlayableStructure> {
    return this.request<AlbumPlayableStructure>(
      "GET",
      `/albums/${releaseId}/playable-structure`,
      undefined,
      { friend_id: friendId }
    );
  }

  async updateAlbum(
    releaseId: string,
    friendId: number,
    updates: AlbumUpdate
  ): Promise<{ success: boolean; album: Album; tracksUpdated?: number }> {
    return this.request("PATCH", "/albums", {
      release_id: releaseId,
      friend_id: friendId,
      ...updates,
    });
  }

  async downloadAlbum(releaseId: string, friendId: number): Promise<AlbumDownloadResult> {
    return this.request<AlbumDownloadResult>(
      "POST",
      `/albums/${releaseId}/download`,
      undefined,
      { friend_id: friendId }
    );
  }

  // ── Spins ──────────────────────────────────────────────────────────────────

  async listSpins(query: SpinListQuery): Promise<SpinListResponse> {
    const params: Record<string, string | number | boolean | undefined> = {
      friend_id: query.friend_id,
      release_id: query.release_id,
      track_id: query.track_id,
      from: query.from,
      to: query.to,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
    return this.request<SpinListResponse>("GET", "/spins", undefined, params);
  }

  async createSpin(input: SpinCreateInput): Promise<SpinCreateResponse> {
    return this.request<SpinCreateResponse>("POST", "/spins", input);
  }

  async deleteSpin(id: number, friendId: number): Promise<SpinDeleteResponse> {
    return this.request<SpinDeleteResponse>(
      "DELETE",
      `/spins/${id}`,
      undefined,
      { friend_id: friendId }
    );
  }

  async listTopSpinTracks(query: SpinTopTracksQuery): Promise<SpinTopTracksResponse> {
    const params: Record<string, string | number | boolean | undefined> = {
      friend_id: query.friend_id,
      release_id: query.release_id,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    };
    return this.request<SpinTopTracksResponse>(
      "GET",
      "/spins/top-tracks",
      undefined,
      params
    );
  }

  // ── Playlists ───────────────────────────────────────────────────────────────

  async listPlaylists(): Promise<Playlist[]> {
    return this.request<Playlist[]>("GET", "/playlists");
  }

  async getPlaylistTracks(
    playlistId: number | string
  ): Promise<{ track_refs: { track_id: string; friend_id: number; position?: number }[] }> {
    const result = await this.request<{
      playlist_id: number;
      playlist_name?: string | null;
      tracks: { track_id: string; friend_id?: number | null; position?: number }[];
    }>("GET", `/playlists/${playlistId}/tracks`);
    return {
      track_refs: result.tracks.map((t) => ({
        track_id: t.track_id,
        friend_id: t.friend_id ?? 1,
        position: t.position,
      })),
    };
  }

  async createPlaylist(name: string, tracks: string[] = []): Promise<Playlist> {
    return this.request<Playlist>("POST", "/playlists", { name, tracks });
  }

  async generatePlaylist(tracks: Track[]): Promise<Track[]> {
    const result = await this.request<{ result: Track[] | Record<string, Track> }>(
      "POST",
      "/playlists/genetic",
      { playlist: tracks }
    );
    const raw = result.result;
    if (Array.isArray(raw)) return raw;
    return Object.values(raw);
  }

  // ── Playback (proxied via Next.js API → MPD) ────────────────────────────────

  async play(filename: string): Promise<void> {
    void filename;
    throw new Error("Server-side playback is not supported by this Groovenet API.");
  }

  async pause(): Promise<void> {
    throw new Error("Server-side playback is not supported by this Groovenet API.");
  }

  async resume(): Promise<void> {
    throw new Error("Server-side playback is not supported by this Groovenet API.");
  }

  async stop(): Promise<void> {
    throw new Error("Server-side playback is not supported by this Groovenet API.");
  }

  async getPlaybackStatus(): Promise<PlaybackStatus> {
    throw new Error("Server-side playback is not supported by this Groovenet API.");
  }

  // ── Friends ─────────────────────────────────────────────────────────────────

  async getFriends(): Promise<Friend[]> {
    const result = await this.request<{ friends?: string[]; results?: Friend[] }>(
      "GET",
      "/friends"
    );
    if (result.results) return result.results;
    if (result.friends) {
      return result.friends.map((username, i) => ({ id: i + 1, username }));
    }
    return [];
  }

  async addFriend(username: string): Promise<void> {
    await this.request("POST", "/friends", { username });
  }

  // ── External search helpers (delegate to Next.js AI routes) ─────────────────

  async searchAppleMusic(opts: {
    title?: string;
    artist?: string;
    album?: string;
    isrc?: string;
  }): Promise<{ results: unknown[] }> {
    return this.request<{ results: unknown[] }>(
      "POST",
      "/providers/apple-music/search",
      opts
    );
  }

  async searchYoutube(opts: {
    title?: string;
    artist?: string;
  }): Promise<{ results: unknown[] }> {
    return this.request<{ results: unknown[] }>(
      "POST",
      "/providers/youtube/music-search",
      opts
    );
  }

  // ── Similarity / Recommendations ─────────────────────────────────────────────

  async findSimilarIdentity(
    trackId: string,
    friendId: number,
    opts?: IdentitySimilarityQuery
  ): Promise<SimilarIdentityResponse> {
    if (opts?.era || opts?.country || opts?.tags) {
      throw new Error("Identity search filters are not supported by the current Groovenet API.");
    }
    const params: Record<string, string | number> = {
      track_id: trackId,
      friend_id: friendId,
      mode: "identity",
      limit_identity: opts?.limit ?? 10,
      limit_audio: 0,
    };
    if (opts?.ivfflat_probes != null) params.ivfflat_probes = opts.ivfflat_probes;
    const result = await this.request<RecommendationCandidatesResponse>(
      "GET",
      "/recommendations/candidates",
      undefined,
      params
    );
    return {
      source_track_id: trackId,
      source_friend_id: friendId,
      filters: {},
      count: result.candidates.length,
      tracks: result.candidates.map((candidate) => ({
        track_id: candidate.trackId,
        friend_id: candidate.friendId,
        title: candidate.metadata.title,
        artist: candidate.metadata.artist,
        album: candidate.metadata.album,
        distance: 1 - (candidate.simIdentity ?? 0),
        bpm: candidate.metadata.bpm,
        key: candidate.metadata.key,
        danceability: candidate.metadata.danceability,
        mood_happy: candidate.metadata.moodHappy,
        mood_sad: candidate.metadata.moodSad,
        mood_relaxed: candidate.metadata.moodRelaxed,
        mood_aggressive: candidate.metadata.moodAggressive,
      })),
    };
  }

  async getRecommendationCandidates(
    trackId: string,
    friendId: number,
    opts?: RecommendationCandidatesQuery
  ): Promise<RecommendationCandidatesResponse> {
    const params: Record<string, string | number> = {
      track_id: trackId,
      friend_id: friendId,
    };
    if (opts?.limit_identity != null) params.limit_identity = opts.limit_identity;
    if (opts?.limit_audio != null) params.limit_audio = opts.limit_audio;
    if (opts?.ivfflat_probes != null) params.ivfflat_probes = opts.ivfflat_probes;
    return this.request<RecommendationCandidatesResponse>(
      "GET",
      "/recommendations/candidates",
      undefined,
      params
    );
  }

  async findSimilarVibe(
    trackId: string,
    friendId: number,
    opts?: SimilarityQuery
  ): Promise<SimilarVibeResponse> {
    const params: Record<string, string | number> = {
      track_id: trackId,
      friend_id: friendId,
      mode: "audio",
      limit_identity: 0,
      limit_audio: opts?.limit ?? 10,
    };
    if (opts?.ivfflat_probes != null) params.ivfflat_probes = opts.ivfflat_probes;
    const result = await this.request<RecommendationCandidatesResponse>(
      "GET",
      "/recommendations/candidates",
      undefined,
      params
    );
    return {
      source_track_id: trackId,
      source_friend_id: friendId,
      count: result.candidates.length,
      tracks: result.candidates.map((candidate) => ({
        track_id: candidate.trackId,
        friend_id: candidate.friendId,
        title: candidate.metadata.title,
        artist: candidate.metadata.artist,
        album: candidate.metadata.album,
        distance: 1 - (candidate.simAudio ?? 0),
        bpm: candidate.metadata.bpm,
        key: candidate.metadata.key,
        danceability: candidate.metadata.danceability,
        mood_happy: candidate.metadata.moodHappy,
        mood_sad: candidate.metadata.moodSad,
        mood_relaxed: candidate.metadata.moodRelaxed,
        mood_aggressive: candidate.metadata.moodAggressive,
      })),
    };
  }
}
