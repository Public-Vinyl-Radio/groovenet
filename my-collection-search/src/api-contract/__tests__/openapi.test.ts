import { describe, it, expect } from "vitest";
import { getOpenApiDocument, inlineComponentRefs } from "../openapi";

type Operation = { tags?: string[]; summary?: string };

function getOperation(path: string, method: string): Operation | undefined {
  const doc = getOpenApiDocument();
  const pathItem = doc.paths[path] as Record<string, Operation> | undefined;
  return pathItem?.[method];
}

// Endpoints that were previously only surfaced via the AutoDiscovered stub and
// now have real contract entries. Auto-discovery silently masks missing
// contracts, so this guards against them regressing to generic stubs.
const CONTRACTED: Array<[method: string, path: string]> = [
  ["get", "/api/tracks/deleted"],
  ["post", "/api/tracks/{id}/restore"],
  ["post", "/api/tracks/fix-duration"],
  ["get", "/api/backups"],
  ["get", "/api/backups/{filename}"],
  ["delete", "/api/backups/{filename}"],
  ["post", "/api/restore"],
  ["post", "/api/settings/backup/run"],
  ["get", "/api/health/backup"],
  ["get", "/api/playlists/{id}/set"],
  ["post", "/api/playlists/{id}/set"],
  ["put", "/api/playlists/{id}/set"],
  ["delete", "/api/playlists/{id}/set"],
  // Set derivation (#282).
  ["get", "/api/set-recordings/{sha256}"],
  ["put", "/api/set-recordings/{sha256}"],
  ["post", "/api/set-derivations"],
  ["get", "/api/set-derivations/{id}"],
  ["post", "/api/set-derivations/{id}/claim"],
  ["post", "/api/set-derivations/{id}/result"],
  // Record copies and care (#262).
  ["get", "/api/record-copies"],
  ["post", "/api/record-copies"],
  ["patch", "/api/record-copies/default"],
  ["patch", "/api/record-copies/{id}"],
  ["delete", "/api/record-copies/{id}"],
  ["get", "/api/record-copies/{id}/actions"],
  ["get", "/api/record-copies/care"],
  ["get", "/api/record-copies/care/summary"],
  ["post", "/api/record-actions"],
  ["delete", "/api/record-actions/{id}"],
  ["post", "/api/record-care/stacks"],
  ["get", "/api/record-care/stacks"],
  ["get", "/api/record-care/stacks/{id}"],
  ["delete", "/api/record-care/stacks/{id}"],
  ["post", "/api/record-care/sessions"],
  ["get", "/api/record-care/sessions"],
  ["post", "/api/record-care/sessions/{id}/void"],
  // Album artwork (#494).
  ["get", "/api/albums/{releaseId}/artwork"],
  ["put", "/api/albums/{releaseId}/artwork"],
  ["post", "/api/albums/{releaseId}/artwork/preview"],
  ["post", "/api/albums/{releaseId}/artwork/upload"],
  ["post", "/api/albums/{releaseId}/artwork/match"],
  ["post", "/api/albums/artwork/backfill"],
  ["get", "/api/albums/artwork/review"],
  // Settings → Libraries (#969).
  ["get", "/api/friends/libraries"],
  ["get", "/api/discogs/users/{username}"],
];

describe("OpenAPI contract coverage", () => {
  it("documents the player availability enum and bearer-only administration", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components?.schemas as Record<
      string,
      { properties?: Record<string, { enum?: string[] }> }
    >;
    expect(schemas.ServerPlayer.properties?.availability_policy?.enum).toEqual([
      "ask",
      "allow_unknown",
      "always",
    ]);
    const operation = (
      doc.paths["/api/players/{playerId}/commands"] as Record<
        string,
        { summary?: string; responses?: Record<string, unknown> }
      >
    ).post;
    expect(operation.summary).toContain("bearer-only availability policy");
    expect(operation.responses).toHaveProperty("403");
  });
  it.each([
    ["/api/providers/discogs/release-lookup", "get", "DiscogsLookupResponse"],
    ["/api/providers/youtube/music-search", "post", "ProviderYouTubeMusicSearchResponse"],
    ["/api/providers/apple-music/search", "post", "ProviderAppleMusicSearchResponse"],
    ["/api/providers/openai/track-metadata", "post", "ProviderTrackMetadataResponse"],
    ["/api/discogs/delete-releases", "post", "DiscogsDeleteReleasesResponse"],
    ["/api/discogs/users/{username}", "get", "DiscogsUserLookupResponse"],
    ["/api/discogs/verify-manifests", "get", "ManifestVerificationResponse"],
    ["/api/discogs/verify-manifests", "post", "ManifestCleanupResponse"],
  ])("references the shared component for %s %s", (path, method, component) => {
    const op = getOperation(path, method as "get" | "post") as unknown as {
      responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }>;
    };
    expect(op.responses["200"].content["application/json"].schema.$ref).toBe(
      `#/components/schemas/${component}`,
    );
  });

  it.each(CONTRACTED)("documents %s %s with a real contract entry", (method, path) => {
    const op = getOperation(path, method);
    expect(op, `${method} ${path} should be present`).toBeTruthy();
    expect(op?.tags ?? [], `${method} ${path} should not be auto-discovered`).not.toContain(
      "AutoDiscovered",
    );
    expect(op?.summary ?? "").not.toMatch(/^Auto-discovered/);
  });

  it("builds a valid 3.1.0 document with a success response for each new path", () => {
    const doc = getOpenApiDocument();
    expect(doc.openapi).toBe("3.1.0");
    for (const [method, path] of CONTRACTED) {
      const op = (doc.paths[path] as Record<string, { responses?: Record<string, unknown> }>)[
        method
      ];
      expect(op.responses, `${method} ${path} responses`).toBeTruthy();
      const codes = Object.keys(op.responses ?? {});
      expect(
        codes.some((code) => code === "200" || code === "201"),
        `${method} ${path} success`,
      ).toBe(true);
    }
  });

  it("documents live-set enums and the shared update contract", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<string, { enum?: string[] }>;
    expect(schemas.LiveSetStatus.enum).toEqual(["draft", "performed", "archived"]);
    expect(schemas.LiveSetMediaType.enum).toEqual(["image", "flyer", "audio", "youtube", "link"]);

    const update = getOperation("/api/playlists/{id}/set", "put") as {
      requestBody?: { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    };
    expect(update.requestBody?.content?.["application/json"]?.schema?.$ref).toBe(
      "#/components/schemas/LiveSetUpdate",
    );
  });

  it("references shared playlist components and documents the optimizer modes", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<
      string,
      { enum?: string[]; required?: string[] }
    >;
    expect(schemas.PlaylistOptimizerMode.enum).toEqual(["genetic", "greedy", "cohesive_blocks"]);
    expect(schemas.Playlist.required).toEqual(["id", "name", "created_at", "tracks"]);
    expect(schemas.PlaylistSpinsInput).toBeDefined();

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) => c?.content?.["application/json"]?.schema?.$ref;
    const op = (path: string, method: string) =>
      getOperation(path, method) as {
        requestBody?: Content;
        responses: Record<string, Content>;
      };

    expect(ref(op("/api/playlists", "post").requestBody)).toBe(
      "#/components/schemas/PlaylistCreate",
    );
    expect(ref(op("/api/playlists", "post").responses["201"])).toBe(
      "#/components/schemas/Playlist",
    );
    expect(ref(op("/api/playlists", "patch").requestBody)).toBe(
      "#/components/schemas/PlaylistUpdate",
    );
    expect(ref(op("/api/playlists", "delete").responses["200"])).toBe(
      "#/components/schemas/PlaylistDeleteResponse",
    );
    expect(ref(op("/api/playlists/{id}/tracks", "get").responses["200"])).toBe(
      "#/components/schemas/PlaylistDetail",
    );
    expect(ref(op("/api/playlists/{id}/spins", "post").requestBody)).toBe(
      "#/components/schemas/PlaylistSpinsInput",
    );
    expect(ref(op("/api/playlists/{id}/spins", "post").responses["200"])).toBe(
      "#/components/schemas/PlaylistSpinsResult",
    );
    expect(ref(op("/api/playlists/genetic", "post").requestBody)).toBe(
      "#/components/schemas/PlaylistGeneticRequest",
    );
    expect(ref(op("/api/playlists/genetic", "post").responses["400"])).toBe(
      "#/components/schemas/PlaylistGeneticValidationError",
    );
  });

  it("references shared track and album components", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<
      string,
      { enum?: string[]; required?: string[]; additionalProperties?: unknown }
    >;
    expect(schemas.TrackSearchMode.enum).toEqual(["lexical", "semantic", "hybrid"]);
    expect(schemas.AlbumArtSource.enum).toEqual(["discogs", "apple_music", "upload"]);
    expect(schemas.AlbumArtMatchStatus.enum).toEqual([
      "matched",
      "mismatch",
      "no_reference",
      "no_candidate",
    ]);
    expect(schemas.Track.required).toEqual(["track_id", "friend_id", "title", "artist", "album"]);
    expect(schemas.Album.required).toEqual(["release_id", "friend_id", "title", "artist"]);
    expect(schemas.TrackSearchResponse).toBeDefined();
    expect(schemas.AlbumPlayableStructure).toBeDefined();

    type Content = {
      content?: { "application/json"?: { schema?: { $ref?: string; items?: { $ref?: string } } } };
    };
    const op = (path: string, method: string) =>
      getOperation(path, method) as { responses: Record<string, Content> };
    const schemaOf = (c?: Content) => c?.content?.["application/json"]?.schema;

    expect(schemaOf(op("/api/tracks/{id}", "get").responses["200"])).toMatchObject({
      $ref: "#/components/schemas/Track",
    });
    expect(schemaOf(op("/api/albums/{releaseId}/artwork", "get").responses["200"])?.$ref).toBe(
      "#/components/schemas/AlbumArtworkState",
    );
    const search = schemaOf(op("/api/tracks/search", "get").responses["200"]) as unknown as {
      properties?: { hits?: { items?: { $ref?: string } } };
    };
    expect(search?.properties?.hits?.items?.$ref).toBe("#/components/schemas/Track");
  });

  it("references shared friend and default-library components", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<
      string,
      { required?: string[]; additionalProperties?: unknown }
    >;
    expect(schemas.Friend.required).toEqual(["id", "username"]);
    // Request bodies strip unknown fields; the spec must not claim they are rejected.
    expect(schemas.FriendCreate.additionalProperties).toBeUndefined();
    expect(schemas.DefaultLibrarySettingsUpdate.additionalProperties).toBeUndefined();

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) => c?.content?.["application/json"]?.schema?.$ref;
    const op = (path: string, method: string) =>
      getOperation(path, method) as { requestBody?: Content; responses: Record<string, Content> };

    expect(ref(op("/api/friends", "get").responses["200"])).toBe(
      "#/components/schemas/FriendListResponse",
    );
    expect(ref(op("/api/friends", "post").requestBody)).toBe("#/components/schemas/FriendCreate");
    expect(ref(op("/api/friends", "post").responses["200"])).toBe(
      "#/components/schemas/FriendCreateResponse",
    );
    expect(ref(op("/api/settings/default-library", "get").responses["200"])).toBe(
      "#/components/schemas/DefaultLibrarySettings",
    );
    expect(ref(op("/api/settings/default-library", "put").requestBody)).toBe(
      "#/components/schemas/DefaultLibrarySettingsUpdate",
    );
    expect(ref(op("/api/settings/default-library", "put").responses["200"])).toBe(
      "#/components/schemas/DefaultLibrarySettingsUpdateResponse",
    );
  });

  it("references shared settings components", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<
      string,
      { required?: string[]; additionalProperties?: unknown; properties?: Record<string, unknown> }
    >;
    // The prompt and GAMDL routes strip unknown fields; appearance really rejects them.
    expect(schemas.AiPromptSettingsUpdate.additionalProperties).toBeUndefined();
    expect(schemas.GamdlSettingsUpdate.additionalProperties).toBeUndefined();
    expect(schemas.AppearanceSettingsUpdate.additionalProperties).toBe(false);
    expect(schemas.GamdlSettings.properties?.audio_format).toMatchObject({
      enum: ["m4a", "mp3", "aac", "flac"],
    });

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) => c?.content?.["application/json"]?.schema?.$ref;
    const op = (path: string, method: string) =>
      getOperation(path, method) as { requestBody?: Content; responses: Record<string, Content> };
    const component = (name: string) => `#/components/schemas/${name}`;

    const cases: [string, string, string | null, string | null][] = [
      ["/api/settings/ai-prompt", "get", null, "AiPromptSettings"],
      [
        "/api/settings/ai-prompt",
        "put",
        "AiPromptSettingsUpdate",
        "AiPromptSettingsUpdateResponse",
      ],
      ["/api/settings/appearance", "get", null, "AppearanceSettings"],
      ["/api/settings/appearance", "put", "AppearanceSettingsUpdate", "AppearanceSettings"],
      ["/api/settings/recommendations", "get", null, "RecommendationSettings"],
      [
        "/api/settings/recommendations",
        "put",
        "RecommendationSettingsUpdate",
        "RecommendationSettings",
      ],
      ["/api/settings/gamdl", "get", null, "GamdlSettingsResponse"],
      ["/api/settings/gamdl", "put", "GamdlSettingsUpdate", "GamdlSettingsUpdateResponse"],
      ["/api/settings/gamdl-cookies", "put", null, "GamdlCookieUploadResponse"],
      ["/api/settings/gamdl/actions", "post", "GamdlActionRequest", "GamdlActionResponse"],
    ];
    for (const [path, method, request, response] of cases) {
      const operation = op(path, method);
      if (request) expect(ref(operation.requestBody)).toBe(component(request));
      if (response) expect(ref(operation.responses["200"])).toBe(component(response));
    }
  });

  it("references shared album components for every album operation", () => {
    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) => c?.content?.["application/json"]?.schema?.$ref;
    const op = (path: string, method: string) =>
      getOperation(path, method) as { requestBody?: Content; responses: Record<string, Content> };
    const component = (name: string) => `#/components/schemas/${name}`;
    const cases: [string, string, string | null, string][] = [
      ["/api/albums", "get", null, "AlbumSearchResponse"],
      ["/api/albums", "patch", "AlbumUpdateRequest", "AlbumUpdateResponse"],
      ["/api/albums/{releaseId}", "get", null, "AlbumDetail"],
      ["/api/albums/{releaseId}", "delete", null, "AlbumDeleteResponse"],
      ["/api/albums/{releaseId}/artwork/match", "post", null, "AlbumArtMatchResult"],
      ["/api/albums/{releaseId}/artwork/preview", "post", null, "AlbumAppleMusicArtPreview"],
      ["/api/albums/{releaseId}/discogs-raw", "get", null, "AlbumDiscogsRawResponse"],
      ["/api/albums/{releaseId}/download", "post", null, "AlbumDownloadResult"],
      ["/api/albums/{releaseId}/playable-structure", "get", null, "AlbumPlayableStructure"],
      [
        "/api/albums/artwork/backfill",
        "post",
        "AlbumArtworkBackfillRequest",
        "AlbumArtworkBackfillResponse",
      ],
      ["/api/albums/artwork/review", "get", null, "AlbumArtworkReviewResponse"],
      ["/api/albums/create", "post", null, "AlbumCreateResponse"],
      ["/api/albums/upsert", "post", null, "AlbumUpsertResponse"],
    ];
    for (const [path, method, request, response] of cases) {
      const operation = op(path, method);
      if (request) expect(ref(operation.requestBody)).toBe(component(request));
      expect(ref(operation.responses["200"])).toBe(component(response));
    }

    const schemas = getOpenApiDocument().components.schemas as Record<
      string,
      { required?: string[]; additionalProperties?: unknown; properties?: Record<string, unknown> }
    >;
    // The route strips unknown fields rather than rejecting them.
    expect(schemas.AlbumUpdateRequest.additionalProperties).toBeUndefined();
    expect(schemas.AlbumUpdateRequest.required).toEqual(["release_id", "friend_id"]);
    expect(schemas.AlbumArtMatchResult.properties?.status).toMatchObject({
      enum: ["matched", "mismatch", "no_reference", "no_candidate"],
    });
  });

  it("references shared record-care components and documents their enums", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<
      string,
      { enum?: string[]; required?: string[] }
    >;
    expect(schemas.SleeveType.enum).toEqual(["original", "paper", "poly-rice-paper-poly", "poly"]);
    expect(schemas.RecordActionType.enum).toEqual(["cleaned", "sleeved", "inspected", "repaired"]);
    expect(schemas.CleaningMethod.enum).toEqual([
      "dry-brush",
      "wet-manual",
      "vacuum",
      "ultrasonic",
      "other",
    ]);
    expect(schemas.RecordCareStatus.enum).toEqual(["never_cleaned", "overdue", "needs_sleeve"]);
    expect(schemas.RecordActionCreate.required).toEqual(["friend_id", "action_type"]);

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) =>
      c?.content?.["application/json"]?.schema?.$ref?.replace("#/components/schemas/", "");
    const op = (path: string, method: string) =>
      getOperation(path, method) as {
        requestBody?: Content;
        responses: Record<string, Content>;
        parameters?: Array<{ name: string; schema?: { $ref?: string } }>;
      };

    expect(ref(op("/api/record-copies", "get").responses["200"])).toBe("RecordCopyListResponse");
    expect(ref(op("/api/record-copies", "post").requestBody)).toBe("RecordCopyCreate");
    expect(ref(op("/api/record-copies", "post").responses["201"])).toBe("RecordCopyResponse");
    expect(ref(op("/api/record-copies/default", "patch").requestBody)).toBe(
      "RecordCopyDefaultUpdate",
    );
    expect(ref(op("/api/record-copies/{id}", "patch").requestBody)).toBe("RecordCopyUpdate");
    expect(ref(op("/api/record-copies/{id}", "delete").responses["200"])).toBe(
      "RecordCopyDeleteResponse",
    );
    expect(ref(op("/api/record-copies/{id}/actions", "get").responses["200"])).toBe(
      "RecordActionListResponse",
    );
    expect(ref(op("/api/record-copies/care", "get").responses["200"])).toBe("RecordCareResponse");
    expect(ref(op("/api/record-copies/care/summary", "get").responses["200"])).toBe(
      "RecordCareSummary",
    );
    expect(ref(op("/api/record-actions", "post").requestBody)).toBe("RecordActionCreate");
    expect(ref(op("/api/record-actions", "post").responses["201"])).toBe(
      "RecordActionMutationResponse",
    );
    expect(ref(op("/api/record-actions/{id}", "delete").responses["200"])).toBe(
      "RecordActionVoidResponse",
    );
    expect(ref(op("/api/record-care/stacks", "post").requestBody)).toBe("RecordCareStackPull");
    expect(ref(op("/api/record-care/sessions", "post").requestBody)).toBe(
      "RecordCareSessionCreate",
    );
    expect(ref(op("/api/record-care/sessions/{id}/void", "post").responses["200"])).toBe(
      "RecordCareSessionVoidResponse",
    );

    const param = (path: string, name: string) =>
      op(path, "get").parameters?.find((p) => p.name === name)?.schema?.$ref;
    expect(param("/api/record-copies/care", "status")).toBe(
      "#/components/schemas/RecordCareStatus",
    );
    expect(param("/api/record-copies/{id}/actions", "action_type")).toBe(
      "#/components/schemas/RecordActionType",
    );
  });

  it("references shared spin components and documents their enums", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<
      string,
      {
        enum?: string[];
        required?: string[];
        additionalProperties?: unknown;
        properties?: Record<string, { $ref?: string; enum?: string[]; format?: string }>;
      }
    >;
    expect(schemas.SpinSelectionMode.enum).toEqual(["sides", "tracks", "automatic", "playlist"]);
    expect(schemas.SpinProvenance.enum).toEqual(["manual", "automatic", "playlist"]);
    expect(schemas.SpinSelectionType.enum).toEqual(["side", "track"]);
    expect(schemas.SpinSession.properties?.selection_mode.enum).toEqual([
      "sides",
      "tracks",
      "automatic",
      "playlist",
    ]);
    expect(schemas.SpinSession.properties?.played_at.format).toBe("date-time");
    expect(schemas.SpinCreateInput.required).toEqual(["friend_id", "release_id", "played_at"]);
    expect(schemas.SpinUpdateInput.required).toEqual(["friend_id"]);
    // Request bodies strip unknown fields; the spec must not claim they are rejected.
    expect(schemas.SpinCreateInput.additionalProperties).toBeUndefined();
    expect(schemas.SpinUpdateInput.additionalProperties).toBeUndefined();
    expect(schemas.SpinAggregateRequest.additionalProperties).toBeUndefined();

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) =>
      c?.content?.["application/json"]?.schema?.$ref?.replace("#/components/schemas/", "");
    const op = (path: string, method: string) =>
      getOperation(path, method) as { requestBody?: Content; responses: Record<string, Content> };

    expect(ref(op("/api/spins", "get").responses["200"])).toBe("SpinListResponse");
    expect(ref(op("/api/spins", "post").requestBody)).toBe("SpinCreateInput");
    expect(ref(op("/api/spins", "post").responses["200"])).toBe("SpinCreateResponse");
    expect(ref(op("/api/spins/aggregate", "post").requestBody)).toBe("SpinAggregateRequest");
    expect(ref(op("/api/spins/aggregate", "post").responses["200"])).toBe("SpinAggregateResult");
    expect(ref(op("/api/spins/top-tracks", "get").responses["200"])).toBe("SpinTopTracksResponse");
    expect(ref(op("/api/home", "get").responses["200"])).toBe("HomeResponse");
    expect(ref(op("/api/spins/recap", "get").responses["200"])).toBe("SpinRecapResponse");
    expect(ref(op("/api/spins/track-stats", "get").responses["200"])).toBe(
      "SpinTrackStatsResponse",
    );
    expect(ref(op("/api/spins/{id}", "patch").requestBody)).toBe("SpinUpdateInput");
    expect(ref(op("/api/spins/{id}", "patch").responses["200"])).toBe("SpinSessionDetail");
    expect(ref(op("/api/spins/{id}", "delete").responses["200"])).toBe("SpinDeleteResponse");
    for (const [method, path] of [
      ["get", "/api/spins"],
      ["post", "/api/spins"],
      ["post", "/api/spins/aggregate"],
      ["get", "/api/spins/top-tracks"],
      ["patch", "/api/spins/{id}"],
      ["delete", "/api/spins/{id}"],
    ]) {
      expect(ref(op(path, method).responses["400"]), `${method} ${path} 400`).toBeUndefined();
      expect(Object.keys(op(path, method).responses)).toContain("400");
    }
  });

  it("builds response examples from the shared component a $ref points at", () => {
    type Example = { content?: { "application/json"?: { example?: unknown } } };
    const example = (path: string, method: string) =>
      (getOperation(path, method) as { responses: Record<string, Example> }).responses["200"]
        ?.content?.["application/json"]?.example;

    expect(example("/api/friends", "get")).toEqual({
      results: [expect.objectContaining({ username: expect.any(String) })],
    });
    expect(example("/api/playlists", "delete")).toEqual(
      expect.objectContaining({ success: expect.anything() }),
    );
    expect(example("/api/tracks/{id}", "get")).toEqual(
      expect.objectContaining({ track_id: expect.any(String) }),
    );
  });

  it("stops inlining at a self-referencing or unknown component", () => {
    const components = {
      Node: {
        type: "object",
        properties: { children: { type: "array", items: { $ref: "#/components/schemas/Node" } } },
      },
    };
    expect(inlineComponentRefs({ $ref: "#/components/schemas/Node" }, components)).toEqual({
      type: "object",
      properties: { children: { type: "array", items: { type: "object" } } },
    });
    expect(inlineComponentRefs({ $ref: "#/components/schemas/Missing" }, components)).toEqual({
      type: "object",
    });
    expect(inlineComponentRefs([{ $ref: "https://elsewhere/x" }, 3], components)).toEqual([
      { $ref: "https://elsewhere/x" },
      3,
    ]);
  });
});

describe("shared backup components", () => {
  it("references shared components for every JSON backup operation", () => {
    const doc = getOpenApiDocument();
    type JsonContent = { schema?: { $ref?: string } };
    type JsonOperation = {
      responses: Record<string, { content?: Record<string, JsonContent> }>;
      requestBody?: { content?: Record<string, JsonContent> };
    };
    const operation = (path: string, method: string) =>
      (doc.paths[path] as Record<string, JsonOperation>)[method];
    const ref = (path: string, method: string, status = "200") =>
      operation(path, method).responses[status]?.content?.["application/json"]?.schema?.$ref;
    const cases = [
      ["/api/backups", "get", "BackupListResponse"],
      ["/api/backups/{filename}", "delete", "BackupDeleteResponse"],
      ["/api/restore", "post", "RestoreResponse"],
      ["/api/settings/backup/run", "post", "BackupStatusRunResponse"],
      ["/api/settings/backup/status", "get", "BackupStatusGetResponse"],
      ["/api/settings/backup", "get", "BackupPolicyGetResponse"],
      ["/api/settings/backup", "put", "BackupPolicyPutResponse"],
      ["/api/backup", "post", "BackupCreateResponse"],
      ["/api/backup-custom", "post", "BackupCreateResponse"],
      ["/api/health/backup", "get", "BackupHealthResponse"],
    ] as const;
    for (const [path, method, name] of cases) {
      expect(ref(path, method)).toBe(`#/components/schemas/${name}`);
    }
    expect(
      operation("/api/settings/backup", "put").requestBody?.content?.["application/json"]?.schema
        ?.$ref,
    ).toBe("#/components/schemas/BackupPolicyUpdate");
    expect(doc.components.schemas.BackupFile).toMatchObject({
      properties: { modified_at: { format: "date-time" } },
    });
  });
});

describe("shared background job components", () => {
  it("references shared components for every JSON job operation", () => {
    const doc = getOpenApiDocument();
    type Op = {
      responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
    };
    const ref = (path: string, method: string) =>
      (doc.paths[path] as Record<string, Op>)[method].responses["200"]?.content?.[
        "application/json"
      ]?.schema?.$ref;
    const cases = [
      ["/api/jobs", "get", "JobsListResponse"],
      ["/api/jobs", "delete", "JobsClearResponse"],
      ["/api/jobs/{jobId}", "get", "JobDetails"],
      ["/api/jobs/{jobId}/logs", "get", "JobLogsResponse"],
      ["/api/jobs/{jobId}/outcome", "post", "JobOutcomeResponse"],
    ] as const;
    for (const [path, method, name] of cases) {
      expect(ref(path, method)).toBe(`#/components/schemas/${name}`);
    }
    expect(doc.components.schemas.JobEvent).toMatchObject({
      properties: { type: { enum: ["job_completed", "error"] } },
    });
    expect(doc.components.schemas.JobDetails).toMatchObject({
      properties: { state: { enum: ["waiting", "active", "completed", "failed"] } },
    });
  });
});

describe("shared embedding and recommendation components", () => {
  it("references shared components for every embedding and recommendation operation", () => {
    const doc = getOpenApiDocument();
    type Content = Record<string, { schema?: { $ref?: string } }>;
    type Op = {
      requestBody?: { content?: Content };
      responses: Record<string, { content?: Content }>;
    };
    const op = (path: string, method: string) => (doc.paths[path] as Record<string, Op>)[method];
    const ref = (c?: Content) => c?.["application/json"]?.schema?.$ref;
    const response = [
      ["/api/embeddings/backfill", "post", "200", "EmbeddingBackfillDryRun"],
      ["/api/embeddings/backfill", "post", "202", "EmbeddingBackfillRun"],
      ["/api/embeddings/backfill/{runId}", "get", "200", "EmbeddingBackfillRun"],
      ["/api/embeddings/queue", "get", "200", "EmbeddingQueueStatus"],
      ["/api/embeddings/queue/retry", "post", "200", "EmbeddingQueueRetryResponse"],
      ["/api/embeddings/status", "get", "200", "EmbeddingStatus"],
      ["/api/recommendations/candidates", "get", "200", "RecommendationsResponse"],
      ["/api/recommendations/candidates", "post", "200", "RecommendationsResponse"],
      ["/api/settings/embedding-model", "get", "200", "EmbeddingModelSettingsList"],
      ["/api/settings/embedding-model", "patch", "200", "EmbeddingModelSettings"],
    ] as const;
    for (const [path, method, status, name] of response) {
      expect(ref(op(path, method).responses[status].content)).toBe(`#/components/schemas/${name}`);
    }
    const request = [
      ["/api/embeddings/backfill", "post", "EmbeddingBackfillRequest"],
      ["/api/embeddings/queue/retry", "post", "EmbeddingQueueRetryRequest"],
      ["/api/recommendations/candidates", "post", "RecommendationsBatchRequest"],
      ["/api/settings/embedding-model", "patch", "EmbeddingModelUpdateRequest"],
    ] as const;
    for (const [path, method, name] of request) {
      expect(ref(op(path, method).requestBody?.content)).toBe(`#/components/schemas/${name}`);
    }
    expect(doc.components.schemas.EmbeddingKind).toMatchObject({
      enum: ["identity", "audio_vibe", "context"],
    });
    expect(doc.components.schemas.EmbeddingBackfillRequest).toMatchObject({
      properties: { scope: { enum: ["missing", "all", "release", "track"] } },
    });
  });
});

describe("shared system components", () => {
  it.each([
    ["/api/health", "HealthResponse"],
    ["/api/status", "StatusResponse"],
    ["/api/version", "VersionResponse"],
    ["/api/update-check", "UpdateCheckResponse"],
    ["/api/friends/libraries", "LibrariesListResponse"],
  ])("references a shared component for GET %s", (path, name) => {
    const doc = getOpenApiDocument();
    expect(doc.paths[path].get).toMatchObject({
      responses: {
        "200": {
          content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
        },
      },
    });
    expect((doc.paths[path].get as { tags: string[] }).tags).not.toContain("AutoDiscovered");
  });

  it("publishes the service status enum", () => {
    expect(getOpenApiDocument().components.schemas.ServiceHealth).toMatchObject({
      properties: { status: { enum: ["up", "down", "unknown"] } },
    });
  });
});

describe("shared genre taxonomy components", () => {
  it.each([
    ["/api/genres", "get", "200", "GenreTreeResponse", undefined],
    ["/api/genres", "post", "201", "Genre", "GenreCreateInput"],
    ["/api/genres/{id}", "get", "200", "GenrePageResponse", undefined],
    ["/api/genres/{id}", "patch", "200", "Genre", "GenreUpdateInput"],
    ["/api/genres/{id}/aliases", "post", "201", "GenreAliasResponse", "GenreAliasInput"],
    ["/api/genres/{id}/merge", "post", "200", "GenreMergeResponse", "GenreMergeInput"],
    ["/api/genres/{id}/similar", "get", "200", "GenreSimilarResponse", undefined],
  ])("references shared components for %s %s", (path, method, status, response, body) => {
    const doc = getOpenApiDocument();
    expect(doc.paths[path!][method!]).toMatchObject({
      responses: {
        [status!]: {
          content: { "application/json": { schema: { $ref: `#/components/schemas/${response}` } } },
        },
      },
      ...(body
        ? {
            requestBody: {
              content: { "application/json": { schema: { $ref: `#/components/schemas/${body}` } } },
            },
          }
        : {}),
    });
  });

  it("exports the source enum, signal bounds and recursive tree references", () => {
    const schemas = getOpenApiDocument().components.schemas;
    expect(schemas.GenreSource).toMatchObject({ enum: ["discogs", "custom"] });
    expect(schemas.GenreSimilaritySignals).toMatchObject({
      properties: {
        taxonomy: { enum: ["sibling", "parent", "child"] },
        npmi: { minimum: -1, maximum: 1 },
        shared_albums: { minimum: 0 },
      },
    });
    expect(schemas.GenreTreeNode).toMatchObject({
      properties: {
        source: { $ref: "#/components/schemas/GenreSource" },
        children: { items: { $ref: "#/components/schemas/GenreTreeNode" } },
      },
    });
  });

  it("documents the 400s of the track and album routes validated in #596", () => {
    const paths = getOpenApiDocument().paths as Record<
      string,
      Record<string, { responses: Record<string, unknown> }>
    >;
    expect(paths["/api/albums"].get.responses["400"]).toBeDefined();
    expect(paths["/api/albums"].patch.responses["400"]).toBeDefined();
    expect(paths["/api/tracks"].patch.responses["400"]).toBeDefined();
    // Lenient by design: bad refs are dropped, so there is no 400 to document.
    expect(paths["/api/tracks/playlist_counts"].post.responses["400"]).toBeUndefined();
  });

  describe("track operations migrated in #606", () => {
    type Content = { content: { "application/json": { schema: { $ref?: string } } } };
    type TrackOperation = {
      parameters?: Array<{ name: string; schema: Record<string, unknown> }>;
      requestBody?: Content;
      responses: Record<string, Content>;
    };
    const trackOp = (path: string, method: string) =>
      (getOpenApiDocument().paths as Record<string, Record<string, TrackOperation>>)[path][method];
    const ref = (c: Content | undefined) => c?.content["application/json"].schema.$ref;

    it.each([
      ["/api/tracks/{id}", "delete", "TrackDeleteResponse", undefined],
      ["/api/tracks/{id}/audio-metadata", "get", "TrackAudioMetadata", undefined],
      [
        "/api/tracks/{id}/audio-metadata",
        "post",
        "TrackExtractEmbeddedCoverResponse",
        "TrackExtractEmbeddedCoverRequest",
      ],
      ["/api/tracks/{id}/embedding-preview", "get", "TrackEmbeddingPreview", undefined],
      ["/api/tracks/{id}/essentia", "get", "TrackEssentia", undefined],
      ["/api/tracks/{id}/playlists", "get", "TrackPlaylistsResponse", undefined],
      ["/api/tracks/{id}/restore", "post", "TrackRestoreResponse", undefined],
      [
        "/api/tracks/analyze-async",
        "post",
        "TrackAnalyzeAsyncResponse",
        "TrackAnalyzeAsyncRequest",
      ],
      ["/api/tracks/fix-duration", "post", "TrackFixDurationResponse", "TrackFixDurationRequest"],
      [
        "/api/tracks/playlist_counts",
        "post",
        "TrackPlaylistCountsResponse",
        "TrackPlaylistCountsRequest",
      ],
      ["/api/tracks/search/facets", "get", "TrackGenreFacetsResponse", undefined],
    ] as const)("references shared components for %s %s", (path, method, response, body) => {
      const operation = trackOp(path, method);
      expect(ref(operation.responses["200"])).toBe(`#/components/schemas/${response}`);
      if (body) expect(ref(operation.requestBody)).toBe(`#/components/schemas/${body}`);
    });

    it("exports the preview types, downloaders and facet ids", () => {
      const schemas = getOpenApiDocument().components.schemas as Record<
        string,
        Record<string, unknown>
      >;
      expect(schemas.TrackEmbeddingPreviewType).toMatchObject({
        enum: ["identity", "audio_vibe", "context"],
      });
      expect(schemas.TrackEmbeddingPreview.oneOf).toHaveLength(3);
      expect(schemas.TrackAnalyzeAsyncRequest).toMatchObject({
        properties: { preferred_downloader: { enum: ["freyr", "spotdl", "yt-dlp", "scdl"] } },
        required: ["track_id", "friend_id"],
      });
      expect(schemas.TrackAnalyzeAsyncRequest.additionalProperties).toBeUndefined();
      expect(schemas.TrackGenreFacetsResponse).toMatchObject({
        properties: { genres: { items: { properties: { id: { format: "uuid" } } } } },
      });
    });

    it("keeps the embedding preview type default on the query parameter", () => {
      const type = trackOp("/api/tracks/{id}/embedding-preview", "get").parameters?.find(
        (parameter) => parameter.name === "type",
      );
      expect(type?.schema).toEqual({
        $ref: "#/components/schemas/TrackEmbeddingPreviewType",
        default: "identity",
      });
    });

    it("leaves the multipart upload as an inline operation", () => {
      const upload = trackOp("/api/tracks/upload", "post");
      expect(upload.requestBody?.content).toHaveProperty("multipart/form-data");
    });
  });
});

describe("shared vinyl ingest, fingerprint and set derivation components", () => {
  type JsonContent = { schema?: { $ref?: string } };
  type JsonOperation = {
    responses: Record<string, { content?: Record<string, JsonContent> }>;
    requestBody?: { content?: Record<string, JsonContent> };
  };
  const operation = (path: string, method: string) =>
    (getOpenApiDocument().paths[path] as Record<string, JsonOperation>)[method];
  const responseRef = (path: string, method: string, status: string) =>
    operation(path, method).responses[status]?.content?.["application/json"]?.schema?.$ref;
  const requestRef = (path: string, method: string) =>
    operation(path, method).requestBody?.content?.["application/json"]?.schema?.$ref;

  it.each([
    ["/api/audio/ingest", "post", "202", "AcceptedIngest"],
    ["/api/audio/ingest", "post", "400", undefined],
    ["/api/audio/ingest/{ingestId}/claim", "post", "200", "IngestClaimResponse"],
    ["/api/audio/ingest/{ingestId}/result", "post", "200", "IngestResultResponse"],
    ["/api/audio/ingest/recent", "get", "200", "IngestListResponse"],
    ["/api/audio/ingest/retention", "get", "200", "IngestRetentionStatus"],
    ["/api/audio/ingest/stats", "get", "200", "IngestPipelineStats"],
    ["/api/detections/recent", "get", "200", "DetectionListResponse"],
    ["/api/fingerprints", "get", "200", "FingerprintListResponse"],
    ["/api/fingerprints", "patch", "200", "FingerprintFileStatsResponse"],
    ["/api/fingerprints", "post", "200", "FingerprintUpsertResponse"],
    ["/api/tracks/audio-metadata/backfill", "post", "202", "AudioMetadataBackfillRun"],
    ["/api/tracks/audio-metadata/backfill/{runId}", "get", "200", "AudioMetadataBackfillRun"],
    ["/api/fingerprints/index", "post", "202", "FingerprintIndexRun"],
    ["/api/fingerprints/index/{runId}", "get", "200", "FingerprintIndexRun"],
    ["/api/set-derivations", "post", "202", "SetDerivationCreateResponse"],
    ["/api/set-derivations/{id}", "get", "200", "SetDerivationView"],
    ["/api/set-derivations/{id}/claim", "post", "200", "SetDerivationClaimResponse"],
    ["/api/set-derivations/{id}/result", "post", "200", "SetDerivationResultResponse"],
    ["/api/set-recordings/{sha256}", "put", "201", "SetRecording"],
  ] as const)("%s %s %s references %s", (path, method, status, name) => {
    const ref = responseRef(path, method, status);
    if (name) expect(ref).toBe(`#/components/schemas/${name}`);
    else expect(ref).toBe("#/components/schemas/IngestError");
  });

  it.each([
    ["/api/audio/ingest/{ingestId}/result", "post", "IngestResultBody"],
    ["/api/fingerprints", "post", "FingerprintUpsertBody"],
    ["/api/fingerprints", "patch", "FingerprintFileStatsBody"],
    ["/api/tracks/audio-metadata/backfill", "post", "AudioMetadataBackfillRequest"],
    ["/api/fingerprints/index", "post", "FingerprintIndexRequest"],
    ["/api/set-derivations", "post", "SetDerivationRequest"],
    ["/api/set-derivations/{id}/result", "post", "SetDerivationResultBody"],
  ] as const)("%s %s takes %s", (path, method, name) => {
    expect(requestRef(path, method)).toBe(`#/components/schemas/${name}`);
  });

  it("keeps the listener upload multipart and publishes optional candidates", () => {
    expect(operation("/api/audio/ingest", "post").requestBody?.content).toHaveProperty(
      "multipart/form-data",
    );
    const doc = getOpenApiDocument();
    expect(doc.components.schemas.IngestResultBody).toMatchObject({ required: ["status"] });
    expect(doc.components.schemas.IngestPipelineStats).toMatchObject({
      properties: { since: { format: "date-time" } },
    });
  });
});
