import { z } from "zod";

const toInt = (value: unknown): unknown => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};

export const intFromInputSchema = z.preprocess(toInt, z.number().int());
export const nonNegativeIntFromInputSchema = z.preprocess(
  toInt,
  z.number().int().min(0)
);

export const apiErrorSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .passthrough();

export const discogsLookupQuerySchema = z.object({
  track_id: z.string().min(1),
  username: z.string().optional(),
  friend_id: intFromInputSchema.optional(),
});

export const discogsLookupTrackSchema = z
  .object({
    position: z.string(),
    title: z.string(),
    duration: z.string(),
    artists: z.array(z.object({ name: z.string() })).optional(),
  })
  .passthrough();

export const discogsLookupReleaseSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    artists: z.array(z.object({ name: z.string() })).optional(),
    artists_sort: z.string().optional(),
    year: z.number().nullable().optional(),
    styles: z.array(z.string()).optional(),
    genres: z.array(z.string()).optional(),
    uri: z.string().nullable().optional(),
    thumb: z.string().nullable().optional(),
    videos: z.array(z.object({}).passthrough()).optional(),
    video: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

export const discogsLookupResponseSchema = z
  .object({
    releaseId: z.string().optional(),
    filePath: z.string().optional(),
    release: discogsLookupReleaseSchema.nullable().optional(),
    matchedTrack: discogsLookupTrackSchema.nullable().optional(),
  })
  .passthrough();

export const discogsDeleteReleasesBodySchema = z.object({
  username: z.string().min(1),
  releaseIds: z.array(z.string().min(1)),
});

export const discogsDeleteReleasesResponseSchema = z.object({
  message: z.string(),
  deletedFiles: z.array(z.string()),
  failedDeletes: z.array(z.string()),
  deletedTrackIds: z.array(z.string()),
  deletedFromDb: z.number().int(),
});

export const providerTrackMetadataBodySchema = z.object({
  prompt: z.string().min(1),
  friend_id: intFromInputSchema.optional(),
});

export const providerTrackMetadataResponseSchema = z
  .object({
    genre: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const providerYouTubeMusicSearchBodySchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
});

export const providerYouTubeMusicSearchItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  channel: z.string(),
  thumbnail: z.string().optional(),
});

export const providerYouTubeMusicSearchResponseSchema = z.object({
  results: z.array(providerYouTubeMusicSearchItemSchema),
});

export const providerAppleMusicSearchBodySchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  isrc: z.string().optional(),
});

export const providerAppleMusicSearchItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  album: z.string().optional(),
  url: z.string().optional(),
  artwork: z.string().optional(),
  duration: z.number().optional(),
  isrc: z.string().optional(),
});

export const providerAppleMusicSearchResponseSchema = z.object({
  results: z.array(providerAppleMusicSearchItemSchema),
});

export const gamdlCookieFileInfoSchema = z
  .object({
    exists: z.boolean(),
    filename: z.string().optional(),
    size: z.number().optional(),
    lastModified: z.string().optional(),
    domains: z.array(z.string()).optional(),
    cookieCount: z.number().int().optional(),
    hasAppleMusic: z.boolean().optional(),
    expiryDates: z.array(z.string()).optional(),
    isValid: z.boolean().optional(),
    validationErrors: z.array(z.string()).optional(),
  })
  .passthrough();

export const gamdlCookieUploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cookieInfo: gamdlCookieFileInfoSchema,
});

export const gamdlCookieDeleteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const gamdlAudioQualitySchema = z.enum([
  "best",
  "high",
  "standard",
  "lossless",
]);

export const gamdlAudioFormatSchema = z.enum(["m4a", "mp3", "aac", "flac"]);
export const gamdlCoverFormatSchema = z.enum(["jpg", "png", "raw"]);
export const gamdlLyricsFormatSchema = z.enum(["lrc", "srt", "ttml"]);

export const gamdlSettingsSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  audio_quality: gamdlAudioQualitySchema,
  audio_format: gamdlAudioFormatSchema,
  save_cover: z.boolean(),
  cover_format: gamdlCoverFormatSchema,
  save_lyrics: z.boolean(),
  lyrics_format: gamdlLyricsFormatSchema,
  overwrite_existing: z.boolean(),
  skip_music_videos: z.boolean(),
  max_retries: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const gamdlSettingsQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const gamdlSettingsGetResponseSchema = z.object({
  settings: gamdlSettingsSchema,
});

export const gamdlSettingsPutBodySchema = z
  .object({
    friend_id: intFromInputSchema,
    audio_quality: gamdlAudioQualitySchema.optional(),
    audio_format: gamdlAudioFormatSchema.optional(),
    save_cover: z.boolean().optional(),
    cover_format: gamdlCoverFormatSchema.optional(),
    save_lyrics: z.boolean().optional(),
    lyrics_format: gamdlLyricsFormatSchema.optional(),
    overwrite_existing: z.boolean().optional(),
    skip_music_videos: z.boolean().optional(),
    max_retries: intFromInputSchema.optional(),
  })
  .strict();

export const gamdlSettingsPutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  settings: gamdlSettingsSchema,
});

export const gamdlSettingsResetBodySchema = z.object({
  friend_id: intFromInputSchema,
});

export const gamdlSettingsResetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  settings: gamdlSettingsSchema,
});

export const gamdlConnectionTestDetailsSchema = z.object({
  gamdl_available: z.boolean(),
  cookie_file_exists: z.boolean(),
  cookie_file_valid: z.boolean(),
  test_download_attempted: z.boolean(),
  test_download_success: z.boolean(),
  error_type: z.string().optional(),
});

export const backupProviderSchema = z.enum(["restic-b2"]);
export const backupRetentionPresetSchema = z.enum([
  "aggressive",
  "balanced",
  "archive",
]);

export const backupPolicySchema = z.object({
  enabled: z.boolean(),
  provider: backupProviderSchema,
  schedule_cron: z.string().min(1),
  retention_preset: backupRetentionPresetSchema,
  include_database: z.boolean(),
  include_audio_files: z.boolean(),
  include_album_covers: z.boolean(),
  include_discogs_exports: z.boolean(),
  include_essentia_files: z.boolean(),
  include_uploads: z.boolean(),
  updated_at: z.string(),
});

export const backupPolicyGetResponseSchema = z.object({
  policy: backupPolicySchema,
});

export const backupPolicyPutBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: backupProviderSchema.optional(),
    schedule_cron: z.string().min(1).optional(),
    retention_preset: backupRetentionPresetSchema.optional(),
    include_database: z.boolean().optional(),
    include_audio_files: z.boolean().optional(),
    include_album_covers: z.boolean().optional(),
    include_discogs_exports: z.boolean().optional(),
    include_essentia_files: z.boolean().optional(),
    include_uploads: z.boolean().optional(),
  })
  .strict();

export const backupPolicyPutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  policy: backupPolicySchema,
});

export const backupSnapshotSummarySchema = z.object({
  id: z.string(),
  short_id: z.string().nullable(),
  time: z.string(),
  hostname: z.string().nullable(),
  paths: z.array(z.string()),
  tags: z.array(z.string()),
});

export const backupStatusSchema = z.object({
  started_at: z.string(),
  finished_at: z.string(),
  stored_at: z.string(),
  status: z.enum(["success", "failed", "skipped"]),
  reason: z.string(),
  backed_up_paths: z.array(z.string()),
  snapshot: backupSnapshotSummarySchema.nullable(),
  error: z.string().optional(),
  missing_env: z.array(z.string()).optional(),
});

export const backupMetricsSchema = z.object({
  captured_at: z.string(),
  local_source_bytes: z.number().nonnegative(),
  snapshot_count: z.number().int().nonnegative().nullable(),
  remote_repository_bytes: z.number().nonnegative().nullable(),
  recent_snapshots: z.array(backupSnapshotSummarySchema),
  error: z.string().optional(),
});

export const backupStatusGetResponseSchema = z.object({
  status: backupStatusSchema.nullable(),
  metrics: backupMetricsSchema.optional(),
});

export const defaultLibrarySettingsGetResponseSchema = z.object({
  friend_id: z.number().int().nullable(),
});

export const defaultLibrarySettingsPutBodySchema = z.object({
  friend_id: intFromInputSchema,
});

export const defaultLibrarySettingsPutResponseSchema = z.object({
  friend_id: z.number().int(),
});

export const backupCreateResponseSchema = z.object({
  message: z.string(),
});

export const backupCreateCustomResponseSchema = z.object({
  message: z.string(),
  filename: z.string(),
  format: z.literal("custom"),
});

export const gamdlConnectionTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: gamdlConnectionTestDetailsSchema,
});

export const jobsListQuerySchema = z.object({
  limit: nonNegativeIntFromInputSchema.optional().default(100),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  state: z
    .enum(["all", "waiting", "active", "completed", "failed"])
    .optional()
    .default("all"),
});

export const jobDataSchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int(),
    release_id: z.string().nullable().optional(),
    job_type: z.string().optional(),
    apple_music_url: z.string().optional(),
    youtube_url: z.string().optional(),
    soundcloud_url: z.string().optional(),
    title: z.string().nullable().optional(),
    artist: z.string().nullable().optional(),
    album: z.string().nullable().optional(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    album_thumbnail: z.string().nullable().optional(),
    discogs_url: z.string().nullable().optional(),
    local_audio_url: z.string().nullable().optional(),
    library_identifier: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
  })
  .passthrough();

export const jobInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.enum(["waiting", "active", "completed", "failed"]),
    progress: z.number(),
    data: jobDataSchema,
    returnvalue: z.unknown().optional(),
    finishedOn: z.number().optional(),
    failedReason: z.string().optional(),
    attemptsMade: z.number().int(),
    processedOn: z.number().optional(),
    queue: z.string(),
  })
  .passthrough();

export const jobsSummarySchema = z.object({
  total: z.number().int(),
  waiting: z.number().int(),
  active: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
});

export const jobsPaginationSchema = z.object({
  limit: z.number().int(),
  offset: z.number().int(),
  total_filtered: z.number().int(),
  has_more: z.boolean(),
});

export const jobsListResponseSchema = z.object({
  jobs: z.array(jobInfoSchema),
  summary: jobsSummarySchema,
  pagination: jobsPaginationSchema.optional(),
});

export const jobsClearResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const jobsEventsSseEnvelopeSchema = z.object({
  type: z.enum(["job_completed", "error"]),
  job_id: z.string().optional(),
  track_id: z.string().optional(),
  friend_id: z.number().int().optional(),
  result: z.unknown().optional(),
  message: z.string().optional(),
  timestamp: z.number().int(),
});

export const jobsEventsSseResponseSchema = z.object({
  stream: z.string(),
  events: z.array(jobsEventsSseEnvelopeSchema),
});

export const jobDetailsResponseSchema = jobInfoSchema.extend({
  delay: z.number().optional(),
  timestamp: z.number().optional(),
  opts: z.record(z.unknown()).optional(),
  logs: z.array(z.unknown()).optional(),
});

export const friendSchema = z.object({
  id: z.number().int(),
  username: z.string(),
});

export const friendsListQuerySchema = z.object({
  showCurrentUser: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional(),
});

export const friendsListResponseSchema = z.object({
  results: z.array(friendSchema),
});

export const friendMutationBodySchema = z.object({
  username: z.string().min(1),
});

export const friendMutationResponseSchema = z.object({
  message: z.string(),
});

export const friendDeleteQuerySchema = z.object({
  username: z.string().min(1),
});

export const playlistTrackRefSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int().nullable().optional(),
  position: z.number().int().optional(),
});

export const playlistTrackInputSchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int().optional(),
    username: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    artist: z.string().nullable().optional(),
    album: z.string().nullable().optional(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    styles: z.array(z.string()).nullable().optional(),
    genres: z.array(z.string()).nullable().optional(),
    duration: z.string().nullable().optional(),
    duration_seconds: z.number().nullable().optional(),
    position: z.union([z.string(), z.number()]).nullable().optional(),
    discogs_url: z.string().nullable().optional(),
    apple_music_url: z.string().nullable().optional(),
    youtube_url: z.string().nullable().optional(),
    soundcloud_url: z.string().nullable().optional(),
    album_thumbnail: z.string().nullable().optional(),
    local_tags: z.string().nullable().optional(),
    bpm: z.union([z.number(), z.string()]).nullable().optional(),
    key: z.string().nullable().optional(),
    danceability: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    star_rating: z.number().nullable().optional(),
    release_id: z.string().nullable().optional(),
    mood_happy: z.number().nullable().optional(),
    mood_sad: z.number().nullable().optional(),
    mood_relaxed: z.number().nullable().optional(),
    mood_aggressive: z.number().nullable().optional(),
    local_audio_url: z.string().nullable().optional(),
  })
  .passthrough();
export type PlaylistTrackInput = z.infer<typeof playlistTrackInputSchema>;

export const playlistSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    created_at: z.string(),
    total_duration_seconds: z.number().optional(),
    tracks: z.array(playlistTrackRefSchema),
    set: z
      .object({
        id: z.number().int(),
        title: z.string().nullable(),
        status: z.enum(["draft", "performed", "archived"]),
        cover_image_url: z.string().nullable(),
        last_performed_at: z.string().nullable(),
        venue_name: z.string().nullable(),
        location_city: z.string().nullable(),
        collaborators: z.array(
          z.object({
            friend_id: z.number().int(),
            username: z.string(),
            role: z.string(),
          })
        ),
      })
      .optional(),
  })
  .passthrough();

export const playlistCreateBodySchema = z
  .object({
    name: z.string(),
    tracks: z.array(playlistTrackInputSchema).optional().default([]),
    default_friend_id: z.number().int().optional(),
  })
  .passthrough();

export const playlistPatchBodySchema = z
  .object({
    id: intFromInputSchema,
    name: z.string().optional(),
    tracks: z
      .array(z.union([z.string(), playlistTrackInputSchema]))
      .optional(),
    default_friend_id: z.number().int().optional(),
  })
  .passthrough();

export const playlistDeleteQuerySchema = z.object({
  id: intFromInputSchema,
});

export const playlistDetailParamsSchema = z.object({
  id: intFromInputSchema,
});

export const playlistDetailResponseSchema = z.object({
  playlist_id: z.number().int(),
  playlist_name: z.string().nullable().optional(),
  tracks: z.array(playlistTrackRefSchema),
});

export const playlistGeneticTrackSchema = z
  .object({
    track_id: z.string().min(1),
    friend_id: z.number().int().optional(),
    bpm: z.union([z.number(), z.string()]).nullable().optional(),
    embedding: z.union([z.string(), z.array(z.number())]).nullable().optional(),
    _vectors: z
      .object({
        default: z.array(z.number()).optional(),
      })
      .optional(),
  })
  .passthrough();

export const playlistGeneticBodySchema = z.object({
  playlist: z.array(playlistGeneticTrackSchema).min(1),
  mode: z.enum(["genetic", "greedy", "cohesive_blocks"]).optional(),
});

export const playlistGeneticResultTrackSchema = z
  .object({
    track_id: z.string().min(1),
  })
  .passthrough();

export const playlistGeneticResponseSchema = z
  .object({
    mode: z.enum(["genetic", "greedy", "cohesive_blocks"]).optional(),
    result: z.union([
      z.array(playlistGeneticResultTrackSchema),
      z.record(playlistGeneticResultTrackSchema),
    ]),
  })
  .passthrough();

export const playlistGeneticInvalidItemSchema = z.object({
  track_id: z.string().optional(),
  reason: z.string(),
});

export const playlistGeneticValidationErrorSchema = z.object({
  error: z.string(),
  invalid: z.array(playlistGeneticInvalidItemSchema),
  invalid_count: z.number().int(),
});

export const trackSearchGetQuerySchema = z.object({
  q: z.string().optional().default(""),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  friend_id: intFromInputSchema.optional(),
  filter: z.string().optional(),
});

const searchMetaSchema = z.object({
  estimatedTotalHits: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  processingTimeMs: z.number().int(),
});

export const trackSearchGetResponseSchema = searchMetaSchema.extend({
  hits: z.array(z.unknown()),
});

export const trackPlaylistCountRefSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
});

export const trackPlaylistCountsBodySchema = z.object({
  track_refs: z.array(trackPlaylistCountRefSchema),
});

export const trackPlaylistCountsResponseSchema = z.record(z.number().int());

export const trackPlaylistMembershipSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  position: z.number().int(),
});

export const trackPlaylistsResponseSchema = z.object({
  playlists: z.array(trackPlaylistMembershipSchema).optional(),
});

export const trackAudioMetadataEmbeddedCoverSchema = z
  .object({
    index: z.number().int(),
    codec_name: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    pix_fmt: z.string().optional(),
  })
  .passthrough();

export const trackAudioMetadataResponseSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  local_audio_url: z.string(),
  audio_file_album_art_url: z.string().nullable().optional(),
  has_embedded_cover: z.boolean(),
  embedded_cover: trackAudioMetadataEmbeddedCoverSchema.nullable().optional(),
  probe: z.unknown(),
});

export const trackExtractEmbeddedCoverResponseSchema = z
  .object({
    success: z.boolean(),
    audio_file_album_art_url: z.string(),
    message: z.string(),
  })
  .passthrough();

export const trackEssentiaResponseSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  file_path: z.string(),
  data: z.unknown(),
});

export const trackEmbeddingPreviewResponseSchema = z.object({
  type: z.literal("prompt").optional(),
  track_id: z.string(),
  friend_id: z.number().int(),
  isDefaultTemplate: z.boolean(),
  template: z.string(),
  prompt: z.string(),
});

export const trackDeleteResponseSchema = z.object({
  success: z.boolean(),
  track_id: z.string(),
  friend_id: z.number().int(),
});

export const embeddingPreviewTypeSchema = z.enum(["identity", "audio_vibe"]);

export const identityEmbeddingDataSchema = z.object({
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  era: z.string(),
  country: z.string(),
  labels: z.array(z.string()),
  composers: z.array(z.string()),
  genres: z.array(z.string()),
  styles: z.array(z.string()),
  tags: z.array(z.string()),
});

export const audioVibeEmbeddingDataSchema = z.object({
  bpm: z.string(),
  bpmRange: z.string(),
  key: z.string(),
  camelot: z.string(),
  danceability: z.string(),
  energy: z.string(),
  dominantMood: z.string(),
  moodProfile: z.string(),
  vibeDescriptors: z.array(z.string()),
  acoustic: z.string().optional(),
  vocalPresence: z.string().optional(),
  percussiveness: z.string().optional(),
  partyMood: z.string().optional(),
});

export const embeddingIdentityPreviewApiResponseSchema = z.object({
  type: z.literal("identity"),
  text: z.string(),
  data: identityEmbeddingDataSchema,
});

export const embeddingAudioVibePreviewApiResponseSchema = z.object({
  type: z.literal("audio_vibe"),
  text: z.string(),
  data: audioVibeEmbeddingDataSchema,
});

export const embeddingPreviewResponseSchema = z.discriminatedUnion("type", [
  embeddingIdentityPreviewApiResponseSchema,
  embeddingAudioVibePreviewApiResponseSchema,
]);

export const identityEmbeddingPreviewResponseSchema = z.object({
  identityText: z.string(),
  identityData: identityEmbeddingDataSchema,
});

export const audioVibeEmbeddingPreviewResponseSchema = z.object({
  vibeText: z.string(),
  vibeData: audioVibeEmbeddingDataSchema,
});

export const legacyEmbeddingPreviewResponseSchema = z.object({
  type: embeddingPreviewTypeSchema,
  text: z.string(),
  data: z.unknown(),
});

export const bulkNotesUpdateSchema = z
  .object({
    track_id: z.string().min(1),
    local_tags: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const bulkNotesBodySchema = z.object({
  updates: z.array(bulkNotesUpdateSchema),
});

export const bulkNotesResponseSchema = z
  .object({
    success: z.boolean(),
    updated: z.number().int().optional(),
    tracks: z.array(z.object({}).passthrough()).optional(),
  })
  .passthrough();

export const recommendationsQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  mode: z.enum(["combined", "identity", "audio"]).optional().default("combined"),
  limit_identity: intFromInputSchema.optional().default(200),
  limit_audio: intFromInputSchema.optional().default(200),
  ivfflat_probes: intFromInputSchema.optional().default(10),
});

export const recommendationSeedTrackSchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
});

export const recommendationsBatchBodySchema = z.object({
  tracks: z.array(recommendationSeedTrackSchema).min(1).max(100),
  limit_identity: intFromInputSchema.optional().default(200),
  limit_audio: intFromInputSchema.optional().default(200),
  ivfflat_probes: intFromInputSchema.optional().default(10),
});

export const seedEmbeddingsSchema = z.object({
  identity: z.boolean(),
  audio: z.boolean(),
});

export const recommendationCandidateSchema = z.object({
  trackId: z.string(),
  friendId: z.number().int(),
  simIdentity: z.number().nullable(),
  simAudio: z.number().nullable(),
  metadata: z
    .object({
      bpm: z.number().nullable(),
      key: z.string().nullable(),
      keyConfidence: z.number().nullable(),
      tempoConfidence: z.number().nullable(),
      eraBucket: z.string().nullable(),
      tags: z.array(z.string()),
      styles: z.array(z.string()),
      energy: z.number().nullable(),
      danceability: z.number().nullable(),
      title: z.string(),
      artist: z.string(),
      album: z.string(),
      year: z.string().nullable(),
      genres: z.array(z.string()),
      starRating: z.number().nullable(),
      albumThumbnail: z.string().nullable(),
      moodHappy: z.number().nullable(),
      moodSad: z.number().nullable(),
      moodRelaxed: z.number().nullable(),
      moodAggressive: z.number().nullable(),
    })
    .passthrough(),
});

export const recommendationsResponseSchema = z.object({
  seedTrackId: z.string(),
  seedFriendId: z.number().int(),
  seedEmbeddings: seedEmbeddingsSchema,
  candidates: z.array(recommendationCandidateSchema),
  stats: z.object({
    identityCount: z.number().int(),
    audioCount: z.number().int(),
    unionCount: z.number().int(),
    timingMs: z.object({
      identityQuery: z.number().int(),
      audioQuery: z.number().int(),
      total: z.number().int(),
    }),
  }),
});

export const durationBackfillQueueErrorSchema = z.object({
  track_id: z.string(),
  error: z.string(),
});

export const durationBackfillResponseSchema = z.object({
  queued: z.number().int(),
  jobIds: z.array(z.string()),
  errors: z.array(durationBackfillQueueErrorSchema),
});

export const coverArtBackfillBodySchema = z.object({
  friend_id: intFromInputSchema.nullable().optional(),
});

export const coverArtBackfillQueueErrorSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  release_id: z.string().nullable(),
  error: z.string(),
});

export const coverArtBackfillResponseSchema = z.object({
  queued: z.number().int(),
  queuedAlbums: z.number().int(),
  tracksImpacted: z.number().int(),
  jobIds: z.array(z.string()),
  errors: z.array(coverArtBackfillQueueErrorSchema),
});

export const essentiaBackfillBodySchema = z.object({
  friend_id: intFromInputSchema.nullable().optional(),
  force: z.boolean().optional().default(false),
});

export const essentiaBackfillQueueErrorSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  error: z.string(),
});

export const essentiaBackfillResponseSchema = z.object({
  queued: z.number().int(),
  skipped_existing: z.number().int(),
  total_candidates: z.number().int(),
  force: z.boolean(),
  jobIds: z.array(z.string()),
  errors: z.array(essentiaBackfillQueueErrorSchema),
});

export const manifestVerificationResultSchema = z.object({
  username: z.string(),
  totalReleaseIds: z.number().int(),
  missingFiles: z.array(z.string()),
  validFiles: z.array(z.string()),
});

export const manifestVerificationResponseSchema = z.object({
  message: z.string(),
  results: z.array(manifestVerificationResultSchema),
  summary: z.object({
    totalManifests: z.number().int(),
    totalMissingFiles: z.number().int(),
    totalValidFiles: z.number().int(),
  }),
});

export const manifestCleanupResultSchema = z.object({
  username: z.string(),
  before: z.number().int(),
  after: z.number().int(),
  removed: z.array(z.string()),
});

export const manifestCleanupResponseSchema = z.object({
  message: z.string(),
  results: z.array(manifestCleanupResultSchema),
  summary: z.object({
    totalManifests: z.number().int(),
    totalRemoved: z.number().int(),
    totalKept: z.number().int(),
  }),
});

export const aiPromptSettingsQuerySchema = z.object({
  friend_id: intFromInputSchema.optional(),
});

export const aiPromptSettingsPutBodySchema = z.object({
  friend_id: intFromInputSchema,
  prompt: z.string().optional().default(""),
});

export const aiPromptSettingsGetResponseSchema = z.object({
  prompt: z.string(),
  defaultPrompt: z.string(),
  isDefault: z.boolean(),
});

export const aiPromptSettingsPutResponseSchema = z.object({
  prompt: z.string(),
  isDefault: z.boolean(),
});

export const embeddingPromptSettingsQuerySchema = z.object({
  friend_id: intFromInputSchema.optional(),
});

export const embeddingPromptSettingsPutBodySchema = z.object({
  friend_id: intFromInputSchema,
  template: z.string().optional().default(""),
});

export const embeddingPromptSettingsGetResponseSchema = z.object({
  template: z.string(),
  defaultTemplate: z.string(),
  isDefault: z.boolean(),
});

export const embeddingPromptSettingsPutResponseSchema = z.object({
  template: z.string(),
  isDefault: z.boolean(),
});

export const albumReleaseParamsSchema = z.object({
  releaseId: z.string().min(1),
});

export const albumFriendQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const albumDiscogsRawResponseSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  username: z.string(),
  file_path: z.string(),
  data: z.unknown(),
});

export const albumEntitySchema = z
  .object({
    release_id: z.string(),
    friend_id: z.number().int(),
    title: z.string(),
    artist: z.string(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    genres: z.array(z.string()).optional(),
    styles: z.array(z.string()).optional(),
    album_thumbnail: z.string().nullable().optional(),
    track_count: z.number().int().optional(),
    date_added: z.string().optional(),
    date_changed: z.string().optional(),
    library_identifier: z.string().nullable().optional(),
  })
  .passthrough();

export const trackEntitySchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int(),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    year: z.union([z.string(), z.number()]).nullable().optional(),
    duration: z.string().optional(),
    duration_seconds: z.number().nullable().optional(),
    position: z.union([z.string(), z.number()]).optional(),
    release_id: z.string().nullable().optional(),
    library_identifier: z.string().nullable().optional(),
    hasVectors: z.boolean().optional(),
  })
  .passthrough();

export const similarVibeQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  limit: intFromInputSchema.optional().default(50),
  ivfflat_probes: intFromInputSchema.optional().default(10),
});

export const similarVibeTrackSchema = trackEntitySchema.extend({
  distance: z.number(),
  identity_text: z.string(),
  danceability: z.union([z.number(), z.string()]).nullable().optional(),
  mood_happy: z.number().nullable().optional(),
  mood_sad: z.number().nullable().optional(),
  mood_relaxed: z.number().nullable().optional(),
  mood_aggressive: z.number().nullable().optional(),
});

export const similarVibeResponseSchema = z.object({
  source_track_id: z.string(),
  source_friend_id: z.number().int(),
  count: z.number().int(),
  tracks: z.array(similarVibeTrackSchema),
});

export const similarIdentityQuerySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  limit: intFromInputSchema.optional().default(50),
  ivfflat_probes: intFromInputSchema.optional().default(10),
  era: z.string().optional(),
  country: z.string().optional(),
  tags: z.string().optional(),
});

export const similarIdentityFiltersSchema = z.object({
  era: z.string().optional(),
  country: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const similarIdentityTrackSchema = trackEntitySchema.extend({
  distance: z.number(),
  identity_text: z.string(),
});

export const similarIdentityResponseSchema = z.object({
  source_track_id: z.string(),
  source_friend_id: z.number().int(),
  filters: similarIdentityFiltersSchema,
  count: z.number().int(),
  tracks: z.array(similarIdentityTrackSchema),
});

export const albumCreateResponseSchema = z.object({
  album: albumEntitySchema,
  tracks: z.array(trackEntitySchema),
});

export const queueAlbumDownloadsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  jobIds: z.array(z.string()),
  tracksQueued: z.number().int(),
});

export const albumCleanupSampleSchema = z.object({
  release_id: z.string(),
  friend_id: z.number().int(),
  title: z.string(),
  artist: z.string(),
  track_count: z.number().int().optional(),
});

export const albumsCleanupSummaryResponseSchema = z.object({
  totalAlbumsToClean: z.number().int(),
  emptyTrackCount: z.number().int(),
  orphanedAlbums: z.number().int(),
  sample: z.array(albumCleanupSampleSchema),
});

export const albumUpsertWithTracksResponseSchema = z.object({
  album: z.object({}).passthrough(),
  tracks: z.array(z.object({}).passthrough()),
  deletedTracks: z.number().int(),
});

export const albumSearchQuerySchema = z.object({
  q: z.string().optional().default(""),
  sort: z.string().optional().default("created_at:desc"),
  friend_id: intFromInputSchema.optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
  missing_library_identifier: z.boolean().optional(),
  missing_local_cover_art_url: z.boolean().optional(),
  missing_audio: z.boolean().optional(),
});

export const albumSearchResponseSchema = z.object({
  hits: z.array(z.object({}).passthrough()),
  estimatedTotalHits: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
  query: z.string(),
  sort: z.string(),
});

export const albumDetailResponseSchema = z.object({
  album: z.object({}).passthrough(),
  tracks: z.array(z.object({}).passthrough()),
});

export const albumPlayableStructureTrackSchema = z
  .object({
    track_id: z.string(),
    friend_id: z.number().int(),
    position: z.union([z.string(), z.number()]).nullable().optional(),
    title: z.string(),
    artist: z.string(),
  })
  .passthrough();

export const albumPlayableStructureSideSchema = z.object({
  side_key: z.string(),
  side_label: z.string(),
  ordinal: z.number().int(),
  track_count: z.number().int(),
  tracks: z.array(albumPlayableStructureTrackSchema),
});

export const albumPlayableStructureResponseSchema = z.object({
  album: albumEntitySchema,
  sides: z.array(albumPlayableStructureSideSchema),
});

export const spinTrackRefSchema = z.object({
  track_id: z.string().min(1),
  friend_id: z.number().int(),
});

export const spinSessionSchema = z.object({
  id: z.number().int(),
  friend_id: z.number().int(),
  release_id: z.string(),
  medium: z.literal("vinyl"),
  selection_mode: z.enum(["sides", "tracks"]),
  played_at: z.string(),
  note: z.string().nullable().optional(),
  context_type: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const spinSelectionSchema = z.object({
  id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  ordinal: z.number().int(),
  selection_type: z.enum(["side", "track"]),
  side_key: z.string().nullable().optional(),
  track_id: z.string().nullable().optional(),
  friend_id: z.number().int().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const trackSpinEventSchema = z.object({
  id: z.number().int().optional(),
  session_id: z.number().int().optional(),
  friend_id: z.number().int(),
  release_id: z.string(),
  track_id: z.string(),
  played_at: z.string(),
  ordinal: z.number().int(),
  side_key: z.string().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  title_snapshot: z.string().optional(),
  artist_snapshot: z.string().optional(),
  album_snapshot: z.string().optional(),
  created_at: z.string().optional(),
});

export const spinDerivedSchema = z.object({
  is_full_album_spin: z.boolean(),
  selected_side_count: z.number().int(),
  album_side_count: z.number().int(),
  track_count: z.number().int(),
});

export const spinCreateBodySchema = z
  .object({
    friend_id: intFromInputSchema,
    release_id: z.string().min(1),
    played_at: z.string().min(1),
    note: z.string().nullable().optional(),
    context_type: z.string().nullable().optional(),
    side_keys: z.array(z.string().min(1)).optional(),
    track_refs: z.array(spinTrackRefSchema).optional(),
  })
  .superRefine((value, ctx) => {
    const hasSides = Array.isArray(value.side_keys) && value.side_keys.length > 0;
    const hasTracks = Array.isArray(value.track_refs) && value.track_refs.length > 0;

    if (hasSides === hasTracks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of side_keys or track_refs",
      });
    }
  });

export const spinCreateResponseSchema = z.object({
  session: spinSessionSchema,
  selections: z.array(spinSelectionSchema),
  track_events: z.array(trackSpinEventSchema).optional(),
  expanded_tracks: z.array(trackSpinEventSchema),
  derived: spinDerivedSchema,
});

export const spinListQuerySchema = z.object({
  friend_id: intFromInputSchema,
  release_id: z.string().optional(),
  track_id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(50),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const spinListItemSchema = z.object({
  session: spinSessionSchema,
  selections: z.array(spinSelectionSchema),
  track_events: z.array(trackSpinEventSchema),
  derived: spinDerivedSchema,
});

export const spinListResponseSchema = z.object({
  items: z.array(spinListItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const spinTopTracksQuerySchema = z.object({
  friend_id: intFromInputSchema,
  release_id: z.string().optional(),
  limit: nonNegativeIntFromInputSchema.optional().default(20),
  offset: nonNegativeIntFromInputSchema.optional().default(0),
});

export const spinTopTrackItemSchema = z.object({
  friend_id: z.number().int(),
  release_id: z.string(),
  track_id: z.string(),
  play_count: z.number().int(),
  last_played_at: z.string(),
  title_snapshot: z.string(),
  artist_snapshot: z.string(),
  album_snapshot: z.string(),
  side_key: z.string().nullable().optional(),
  position_snapshot: z.string().nullable().optional(),
  album_thumbnail: z.string().nullable().optional(),
  audio_file_album_art_url: z.string().nullable().optional(),
  local_audio_url: z.string().nullable().optional(),
  bpm: z.union([z.number(), z.string()]).nullable().optional(),
  key: z.string().nullable().optional(),
  star_rating: z.number().nullable().optional(),
  library_identifier: z.string().nullable().optional(),
  hasVectors: z.boolean().optional(),
});

export const spinTopTracksResponseSchema = z.object({
  items: z.array(spinTopTrackItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const spinSessionParamsSchema = z.object({
  id: intFromInputSchema,
});

export const spinDeleteQuerySchema = z.object({
  friend_id: intFromInputSchema,
});

export const spinDeleteResponseSchema = z.object({
  success: z.boolean(),
  session: spinSessionSchema,
});

export const albumUpdateBodySchema = z
  .object({
    release_id: z.string().min(1),
    friend_id: intFromInputSchema,
    album_rating: z.number().optional(),
    album_notes: z.string().optional(),
    purchase_price: z.number().optional(),
    condition: z.string().optional(),
    library_identifier: z.string().max(50).nullable().optional(),
  })
  .refine(
    (value) =>
      value.album_rating !== undefined ||
      value.album_notes !== undefined ||
      value.purchase_price !== undefined ||
      value.condition !== undefined ||
      value.library_identifier !== undefined,
    {
      message: "No fields to update",
    }
  );

export const albumUpdateResponseSchema = z.object({
  success: z.boolean(),
  album: z.object({}).passthrough(),
  tracksUpdated: z.number().int().optional(),
});

// ─── Fingerprints (#277) ──────────────────────────────────────────────────────

/**
 * One reference fingerprint, as `fingerprint-service` posts it after indexing a
 * library track. `fingerprint_data` is base64 because JSON has no bytes, and
 * null when the engine stores no payload — which is what the stub does.
 */
export const fingerprintUpsertBodySchema = z.object({
  track_id: z.string().min(1),
  friend_id: intFromInputSchema,
  fingerprint_type: z.string().min(1).max(50),
  fingerprint_version: z.string().min(1).max(50),
  fingerprint_data: z.string().base64().nullable().optional(),
  audio_sha256: z.string().regex(/^[0-9a-f]{64}$/, "must be a hex sha256"),
  audio_duration_seconds: z.number().positive().nullable().optional(),
});

export const fingerprintUpsertResponseSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  audio_sha256: z.string(),
  audio_duration_seconds: z.number().nullable(),
  updated_at: z.string(),
});

/**
 * Which slice of the library to index. Exactly one scope, so `--missing --all`
 * is rejected rather than silently resolved to one of them.
 */
export const fingerprintIndexBodySchema = z
  .object({
    scope: z.enum(["missing", "changed", "all", "track", "release"]),
    track_id: z.string().min(1).optional(),
    release_id: z.string().min(1).optional(),
    friend_id: intFromInputSchema.optional(),
    force: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "track" && !value.track_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'track' requires track_id",
      });
    }
    if (value.scope === "release" && !value.release_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scope 'release' requires release_id",
      });
    }
  });

export const fingerprintIndexRunSchema = z.object({
  run_id: z.string(),
  scope: z.string(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  queued: z.number().int(),
  unindexable: z.number().int(),
  indexed: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  errors: z.array(z.string()),
  started_at: z.number().int(),
  updated_at: z.number().int(),
  complete: z.boolean(),
});

// ─── Audio ingest retention (#269) ────────────────────────────────────────────

export const ingestRetentionPolicySchema = z.object({
  maxAgeHours: z.number().positive(),
  maxBytes: z.number().positive(),
  orphanGraceMinutes: z.number().positive(),
  sweepIntervalMinutes: z.number().positive(),
});

export const ingestRetentionStatusSchema = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sweepable: z.number().int().nonnegative(),
  orphans: z.number().int().nonnegative(),
  inFlight: z.number().int().nonnegative(),
  lastSweptAt: z.string().nullable(),
  policy: ingestRetentionPolicySchema,
});

/** One reference fingerprint as the matcher loads it (#278). */
export const fingerprintListItemSchema = z.object({
  track_id: z.string(),
  friend_id: z.number().int(),
  fingerprint_type: z.string(),
  fingerprint_version: z.string(),
  fingerprint_data: z.string().nullable(),
  audio_sha256: z.string(),
  audio_duration_seconds: z.number().nullable(),
});

export const fingerprintListResponseSchema = z.object({
  fingerprints: z.array(fingerprintListItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});

// ─── Audio ingest endpoint (#275) ─────────────────────────────────────────────

export const acceptedIngestSchema = z.object({
  status: z.literal("accepted"),
  ingest_id: z.string(),
  source_id: z.string(),
  duration_seconds: z.number(),
  sample_rate: z.number().nullable(),
  channels: z.number().nullable(),
  captured_at: z.string().nullable(),
});

/**
 * The rejection vocabulary, as the listener device reads it. These strings are
 * part of the contract — a Pi with no screen uses them to tell "this chunk is
 * bad, drop it" from "retry later", so they must not be reworded.
 */
export const ingestErrorSchema = z.object({
  error: z.enum([
    "missing_audio_file",
    "missing_source_id",
    "unsupported_audio_format",
    "invalid_audio_stream",
    "audio_too_large",
    "audio_too_short",
    "audio_too_long",
    "internal_error",
  ]),
  message: z.string(),
});
