import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { Agent as HttpsAgent } from "https";
import type {
  Track,
  Playlist,
  PlaylistSpinsInput,
  PlaylistSpinsResult,
  LiveSet,
  Friend,
  GenreTreeResponse,
  Genre, GenreCreateInput, GenreUpdateInput, GenreAliasResponse, GenreMergeResponse,
  GenreReconciliationRequest, GenreReconciliationRun, GenreReconciliationCoverage,
  GenreProposal, GenreProposalQuery, GenreProposalListResponse, GenreProposalUpdate,
  GenreProposalApplyResult,
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
  SpinUpdateInput,
  SpinUpdateResponse,
  SpinListQuery,
  SpinListResponse,
  SpinTopTracksQuery,
  SpinTopTracksResponse,
  TrackSearchMode,
  TrackSearchQuery,
  TrackSearchResponse,
  TrackUpdate,
  SimilarIdentityResponse,
  SimilarVibeResponse,
  IdentitySimilarityQuery,
  SimilarityQuery,
  RecommendationCandidatesResponse,
  RecommendationCandidatesQuery,
  FingerprintIndexRequest,
  FingerprintIndexRun,
  EmbeddingBackfillRequest,
  EmbeddingBackfillRun,
  EmbeddingBackfillDryRun,
  EmbeddingStatus,
  DetectionListResponse,
  DetectionQuery,
  IngestListResponse,
  IngestPipelineStats,
  SpinAggregateRequest,
  SpinAggregateResult,
  SetRecording,
  SetDerivation,
  SetDerivationRequest,
  SetDerivationView,
  SetDerivationViewQuery,
  RecordActionInput,
  RecordActionListQuery,
  RecordActionListResponse,
  RecordActionResult,
  RecordCareQuery,
  RecordCareResponse,
  RecordCareSummary,
  RecordCareSummaryQuery,
  RecordCopy,
  RecordCopyCreateInput,
  RecordCopyDefaultUpdateInput,
  RecordCopyListItem,
  RecordCopyUpdateInput,
} from "./types.js";

export interface GroovenetClientConfig {
  baseUrl: string;
  apiKey?: string;
  /** Skip TLS certificate verification (internal CA / self-signed hosts). */
  insecureTls?: boolean;
  /**
   * Which tool is calling, sent as `X-Groovenet-Client`. The server tags its
   * analytics events with it, so CLI and agent traffic is told apart from the
   * web app's.
   */
  clientName?: "cli" | "mcp";
}

export class GroovenetClient {
  private http: AxiosInstance;

  constructor(config: GroovenetClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        "Content-Type": "application/json",
        ...(config.clientName ? { "X-Groovenet-Client": config.clientName } : {}),
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
    return (await this.send<T>({ method, url: path, data, params })).data;
  }

  /**
   * `request`, for calls that need more of axios than a method and a body — a
   * status to branch on, headers, a streamed upload. Same error unwrapping.
   */
  private async send<T>(config: AxiosRequestConfig): Promise<{ status: number; data: T }> {
    try {
      const res = await this.http.request<T>(config);
      return { status: res.status, data: res.data };
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
      bpm_min: query.filters?.bpm_min,
      bpm_max: query.filters?.bpm_max,
      key: query.filters?.key,
      star_rating: query.filters?.star_rating,
      mode: query.mode && query.mode !== "lexical" ? query.mode : undefined,
    };
    const result = await this.request<{
      hits: Track[];
      estimatedTotalHits: number;
      offset: number;
      limit: number;
      processingTimeMs: number;
      mode?: TrackSearchMode;
      degraded?: boolean;
    }>("GET", "/tracks/search", undefined, params);

    return {
      tracks: result.hits,
      estimatedTotalHits: result.estimatedTotalHits,
      offset: result.offset,
      limit: result.limit,
      processingTimeMs: result.processingTimeMs,
      ...(result.mode ? { mode: result.mode } : {}),
      ...(result.degraded ? { degraded: true } : {}),
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

  async updateSpin(id: number, input: SpinUpdateInput): Promise<SpinUpdateResponse> {
    return this.request<SpinUpdateResponse>("PATCH", `/spins/${id}`, input);
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

  /**
   * Replace a playlist's tracks with this ordered list. Bare references are
   * enough: the app only overwrites a track's metadata with values actually
   * sent, so this never blanks a title or artist.
   */
  async setPlaylistTracks(
    playlistId: number,
    tracks: Array<{ track_id: string; friend_id: number }>
  ): Promise<Playlist> {
    return this.request<Playlist>("PATCH", "/playlists", { id: playlistId, tracks });
  }

  async logPlaylistSpins(
    playlistId: number | string,
    input: PlaylistSpinsInput = {}
  ): Promise<PlaylistSpinsResult> {
    return this.request<PlaylistSpinsResult>("POST", `/playlists/${playlistId}/spins`, input);
  }

  async getLiveSet(playlistId: number | string): Promise<LiveSet> {
    return this.request<LiveSet>("GET", `/playlists/${playlistId}/set`);
  }

  async createLiveSet(playlistId: number | string): Promise<{ id: number; playlist_id: number }> {
    return this.request("POST", `/playlists/${playlistId}/set`);
  }

  async updateLiveSet(playlistId: number | string, set: Partial<LiveSet>): Promise<void> {
    await this.request("PUT", `/playlists/${playlistId}/set`, set);
  }

  async deleteLiveSet(playlistId: number | string): Promise<void> {
    await this.request("DELETE", `/playlists/${playlistId}/set`);
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

  // ── Genres / Friends ───────────────────────────────────────────────────────

  async createGenre(input: GenreCreateInput): Promise<Genre> {
    return this.request<Genre>("POST", "/genres", input);
  }

  async updateGenre(id: string, input: GenreUpdateInput): Promise<Genre> {
    return this.request<Genre>("PATCH", `/genres/${encodeURIComponent(id)}`, input);
  }

  async addGenreAlias(id: string, alias: string): Promise<GenreAliasResponse> {
    return this.request<GenreAliasResponse>("POST", `/genres/${encodeURIComponent(id)}/aliases`, { alias });
  }

  async mergeGenres(id: string, target_id: string): Promise<GenreMergeResponse> {
    return this.request<GenreMergeResponse>("POST", `/genres/${encodeURIComponent(id)}/merge`, { target_id });
  }

  async getGenres(): Promise<GenreTreeResponse> {
    return this.request<GenreTreeResponse>("GET", "/genres");
  }

  /**
   * Start a local_tags reconciliation run. Returns once the run exists, not
   * when it finishes: poll `getGenreReconciliationRun` until it is no longer
   * `running`. Fails with a 409 while another run is in progress.
   */
  async startGenreReconciliation(request: GenreReconciliationRequest = {}): Promise<GenreReconciliationRun> {
    return this.request<GenreReconciliationRun>("POST", "/genres/reconciliation/runs", request);
  }

  async getGenreReconciliationRun(id: string): Promise<GenreReconciliationRun> {
    return this.request<GenreReconciliationRun>("GET", `/genres/reconciliation/runs/${encodeURIComponent(id)}`);
  }

  async getGenreReconciliationCoverage(): Promise<GenreReconciliationCoverage> {
    return this.request<GenreReconciliationCoverage>("GET", "/genres/reconciliation/coverage");
  }

  async listGenreProposals(query: GenreProposalQuery = {}): Promise<GenreProposalListResponse> {
    return this.request<GenreProposalListResponse>("GET", "/genres/proposals", undefined, { ...query });
  }

  async updateGenreProposal(id: string, update: GenreProposalUpdate): Promise<GenreProposal> {
    return this.request<GenreProposal>("PATCH", `/genres/proposals/${encodeURIComponent(id)}`, update);
  }

  /** Apply accepted and edited proposals: all of them, or just `ids`. */
  async applyGenreProposals(ids?: string[]): Promise<GenreProposalApplyResult> {
    return this.request<GenreProposalApplyResult>("POST", "/genres/proposals/apply", ids ? { ids } : {});
  }

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

  // ── Fingerprints ───────────────────────────────────────────────────────────

  /**
   * Queue a reference-library indexing run (#277).
   *
   * Returns as soon as the work is queued — the run itself happens in
   * `fingerprint-service`. Poll `getFingerprintIndexRun` for progress.
   */
  async startFingerprintIndex(
    request: FingerprintIndexRequest
  ): Promise<FingerprintIndexRun> {
    return this.request<FingerprintIndexRun>("POST", "/fingerprints/index", request);
  }

  /** Progress and final counters for one indexing run. */
  async getFingerprintIndexRun(runId: string): Promise<FingerprintIndexRun> {
    return this.request<FingerprintIndexRun>(
      "GET",
      `/fingerprints/index/${encodeURIComponent(runId)}`
    );
  }

  // ── Embeddings (#388) ──────────────────────────────────────────────────────

  /**
   * Queue a backfill run for missing embeddings.
   *
   * Always enqueues onto the same background queue #385 built, so a backfill
   * gets the same retry/backoff/pause protection as any other embedding job —
   * returns as soon as the work is queued. Poll `getEmbeddingBackfillRun` for
   * progress. `dry_run: true` reports counts and enqueues nothing.
   */
  async startEmbeddingBackfill(
    request: EmbeddingBackfillRequest = {}
  ): Promise<EmbeddingBackfillRun | EmbeddingBackfillDryRun> {
    return this.request<EmbeddingBackfillRun | EmbeddingBackfillDryRun>(
      "POST",
      "/embeddings/backfill",
      request
    );
  }

  /** Progress and final counters for one backfill run. */
  async getEmbeddingBackfillRun(runId: string): Promise<EmbeddingBackfillRun> {
    return this.request<EmbeddingBackfillRun>(
      "GET",
      `/embeddings/backfill/${encodeURIComponent(runId)}`
    );
  }

  /** How many tracks are missing each embedding type right now. */
  async getEmbeddingStatus(friendId?: number): Promise<EmbeddingStatus> {
    return this.request<EmbeddingStatus>("GET", "/embeddings/status", undefined, {
      friend_id: friendId,
    });
  }

  // ── Vinyl pipeline debug (#299) ────────────────────────────────────────────

  /** Recent matcher windows, including the ones that matched nothing. */
  async listDetections(query: DetectionQuery = {}): Promise<DetectionListResponse> {
    const params: Record<string, string | number | boolean | undefined> = {
      source_id: query.source_id,
      session_id: query.session_id,
      since: query.since,
      limit: query.limit ?? 30,
      offset: query.offset,
    };
    if (query.matched !== undefined) params.matched = query.matched;
    return this.request<DetectionListResponse>(
      "GET",
      "/detections/recent",
      undefined,
      params
    );
  }

  /** Recent audio chunks and what became of them. */
  async listIngests(
    query: { source_id?: string; status?: string; limit?: number } = {}
  ): Promise<IngestListResponse> {
    return this.request<IngestListResponse>("GET", "/audio/ingest/recent", undefined, {
      source_id: query.source_id,
      status: query.status,
      limit: query.limit ?? 30,
    });
  }

  /** Whether the pipeline is working, index included. */
  async getIngestStats(
    query: { minutes?: number; source_id?: string } = {}
  ): Promise<IngestPipelineStats> {
    return this.request<IngestPipelineStats>("GET", "/audio/ingest/stats", undefined, {
      minutes: query.minutes,
      source_id: query.source_id,
    });
  }

  /**
   * Manually aggregate detections into spin sessions, from an explicit date
   * (#304). Both automatic triggers only look back
   * `PLAY_AGGREGATION_LOOKBACK_MINUTES` (default 60), so this is the escape
   * hatch for a backlog older than that.
   */
  async aggregateSpins(request: SpinAggregateRequest): Promise<SpinAggregateResult> {
    return this.request<SpinAggregateResult>("POST", "/spins/aggregate", request);
  }

  // ── Set derivation (#282) ──────────────────────────────────────────────────

  /**
   * Does the server already hold this recording? Asked before uploading, so a
   * recording is never sent twice.
   */
  async hasSetRecording(sha256: string): Promise<boolean> {
    const { status } = await this.send({
      method: "HEAD",
      url: `/set-recordings/${encodeURIComponent(sha256)}`,
      validateStatus: (code) => code === 200 || code === 404,
    });
    return status === 200;
  }

  /**
   * Stream a recording to the server under its sha256.
   *
   * `body` is sent as-is — pass a file stream, not a buffer, for a real set.
   * The server keeps it only if it hashes to `sha256`, so a transfer cut short
   * fails loudly rather than storing half a night. `onProgress` gets the bytes
   * sent so far.
   */
  async uploadSetRecording(
    sha256: string,
    body: NodeJS.ReadableStream | Uint8Array,
    opts: { size: number; filename?: string; onProgress?: (sent: number) => void }
  ): Promise<SetRecording> {
    const { data } = await this.send<SetRecording>({
      method: "PUT",
      url: `/set-recordings/${encodeURIComponent(sha256)}`,
      data: body,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(opts.size),
        // Headers are Latin-1; a filename like "Díaz.mp3" is not.
        ...(opts.filename ? { "X-Filename": encodeURIComponent(opts.filename) } : {}),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      // No redirects. With them, axios writes through follow-redirects, which
      // keeps a copy of the whole body to replay after a redirect — for a
      // 250 MB set, the file in memory. Measured on #271's 253 MB recording:
      // +234 MB with redirects, +78 MB without (a bare Node pipe: +46 MB).
      maxRedirects: 0,
      onUploadProgress: (event) => opts.onProgress?.(event.loaded),
    });
    return data;
  }

  /**
   * Start deriving a tracklist, or get back the equivalent run already done
   * or in progress (`reused: true`). Poll `getSetDerivation` for the result.
   */
  async createSetDerivation(
    request: SetDerivationRequest
  ): Promise<SetDerivation & { reused: boolean }> {
    return this.request("POST", "/set-derivations", request);
  }

  /**
   * A run's tracklist, unidentified stretches and — given a playlist or live
   * set — its diff against the plan. Empty until the run is processed.
   */
  async getSetDerivation(
    id: string,
    query: SetDerivationViewQuery = {}
  ): Promise<SetDerivationView> {
    return this.request("GET", `/set-derivations/${encodeURIComponent(id)}`, undefined, {
      playlist_id: query.playlist_id,
      live_set_id: query.live_set_id,
    });
  }

  // ── Record copies and care (#262) ──────────────────────────────────────────

  /**
   * A friend's live copies, optionally of one release. A release with no copy
   * rows lists its implicit default copy, `id: null`.
   */
  async listRecordCopies(friendId: number, releaseId?: string): Promise<RecordCopyListItem[]> {
    const { items } = await this.request<{ items: RecordCopyListItem[] }>(
      "GET",
      "/record-copies",
      undefined,
      { friend_id: friendId, release_id: releaseId }
    );
    return items;
  }

  /**
   * Add one more physical copy of a release. A release with no copy rows has
   * its implicit default made real first, so this always adds a copy.
   */
  async createRecordCopy(input: RecordCopyCreateInput): Promise<RecordCopy> {
    const { copy } = await this.request<{ copy: RecordCopy }>("POST", "/record-copies", input);
    return copy;
  }

  /** Label or annotate a release's default copy, making it real if implicit. */
  async updateDefaultRecordCopy(input: RecordCopyDefaultUpdateInput): Promise<RecordCopy> {
    const { copy } = await this.request<{ copy: RecordCopy }>(
      "PATCH",
      "/record-copies/default",
      input
    );
    return copy;
  }

  async updateRecordCopy(id: number, input: RecordCopyUpdateInput): Promise<RecordCopy> {
    const { copy } = await this.request<{ copy: RecordCopy }>(
      "PATCH",
      `/record-copies/${id}`,
      input
    );
    return copy;
  }

  /**
   * Soft-delete a copy; its history stays. Refused for a default copy while
   * the release has other copies.
   */
  async deleteRecordCopy(id: number, friendId: number): Promise<RecordCopy> {
    const { copy } = await this.request<{ copy: RecordCopy }>(
      "DELETE",
      `/record-copies/${id}`,
      undefined,
      { friend_id: friendId }
    );
    return copy;
  }

  /** A copy's care history, newest first. */
  async listRecordActions(
    copyId: number,
    query: RecordActionListQuery
  ): Promise<RecordActionListResponse> {
    return this.request<RecordActionListResponse>(
      "GET",
      `/record-copies/${copyId}/actions`,
      undefined,
      {
        friend_id: query.friend_id,
        action_type: query.action_type,
        include_voided: query.include_voided,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      }
    );
  }

  /**
   * Log a care action against a copy or a release. Returns the action and the
   * copy's care state after it.
   */
  async logRecordAction(input: RecordActionInput): Promise<RecordActionResult> {
    return this.request<RecordActionResult>("POST", "/record-actions", input);
  }

  /** Void a mistaken action. It stays in the history; care state is recomputed. */
  async voidRecordAction(id: number, friendId: number): Promise<RecordActionResult> {
    const { action, copy } = await this.request<RecordActionResult & { success: boolean }>(
      "DELETE",
      `/record-actions/${id}`,
      undefined,
      { friend_id: friendId }
    );
    return { action, copy };
  }

  /**
   * Copies never cleaned, overdue, or not in the wanted sleeve. An album with
   * no copy rows appears as its implicit default copy, `copy_id: null`.
   */
  async listRecordCare(query: RecordCareQuery): Promise<RecordCareResponse> {
    return this.request<RecordCareResponse>("GET", "/record-copies/care", undefined, {
      friend_id: query.friend_id,
      status: query.status,
      overdue_days: query.overdue_days,
      needs_sleeve: query.needs_sleeve,
      sleeve_type: query.sleeve_type,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  async getRecordCareSummary(query: RecordCareSummaryQuery): Promise<RecordCareSummary> {
    return this.request<RecordCareSummary>("GET", "/record-copies/care/summary", undefined, {
      friend_id: query.friend_id,
      overdue_days: query.overdue_days,
      needs_sleeve: query.needs_sleeve,
    });
  }
}
