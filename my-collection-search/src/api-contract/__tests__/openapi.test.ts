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
  // Album artwork (#494).
  ["get", "/api/albums/{releaseId}/artwork"],
  ["put", "/api/albums/{releaseId}/artwork"],
  ["post", "/api/albums/{releaseId}/artwork/preview"],
  ["post", "/api/albums/{releaseId}/artwork/upload"],
  ["post", "/api/albums/{releaseId}/artwork/match"],
  ["post", "/api/albums/artwork/backfill"],
  ["get", "/api/albums/artwork/review"],
];

describe("OpenAPI contract coverage", () => {
  it("documents the player availability enum and bearer-only administration", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, { enum?: string[] }> }>;
    expect(schemas.ServerPlayer.properties?.availability_policy?.enum).toEqual(["ask", "allow_unknown", "always"]);
    const operation = (doc.paths["/api/players/{playerId}/commands"] as Record<string, { summary?: string; responses?: Record<string, unknown> }>).post;
    expect(operation.summary).toContain("bearer-only availability policy");
    expect(operation.responses).toHaveProperty("403");
  });
  it.each(CONTRACTED)("documents %s %s with a real contract entry", (method, path) => {
    const op = getOperation(path, method);
    expect(op, `${method} ${path} should be present`).toBeTruthy();
    expect(op?.tags ?? [], `${method} ${path} should not be auto-discovered`).not.toContain(
      "AutoDiscovered"
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
        `${method} ${path} success`
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
    expect(update.requestBody?.content?.["application/json"]?.schema?.$ref)
      .toBe("#/components/schemas/LiveSetUpdate");
  });

  it("references shared playlist components and documents the optimizer modes", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<string, { enum?: string[]; required?: string[] }>;
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

    expect(ref(op("/api/playlists", "post").requestBody)).toBe("#/components/schemas/PlaylistCreate");
    expect(ref(op("/api/playlists", "post").responses["201"])).toBe("#/components/schemas/Playlist");
    expect(ref(op("/api/playlists", "patch").requestBody)).toBe("#/components/schemas/PlaylistUpdate");
    expect(ref(op("/api/playlists", "delete").responses["200"])).toBe("#/components/schemas/PlaylistDeleteResponse");
    expect(ref(op("/api/playlists/{id}/tracks", "get").responses["200"])).toBe("#/components/schemas/PlaylistDetail");
    expect(ref(op("/api/playlists/{id}/spins", "post").requestBody)).toBe("#/components/schemas/PlaylistSpinsInput");
    expect(ref(op("/api/playlists/{id}/spins", "post").responses["200"])).toBe("#/components/schemas/PlaylistSpinsResult");
    expect(ref(op("/api/playlists/genetic", "post").requestBody)).toBe("#/components/schemas/PlaylistGeneticRequest");
    expect(ref(op("/api/playlists/genetic", "post").responses["400"])).toBe(
      "#/components/schemas/PlaylistGeneticValidationError"
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
    expect(schemas.AlbumArtMatchStatus.enum).toEqual(["matched", "mismatch", "no_reference", "no_candidate"]);
    expect(schemas.Track.required).toEqual(["track_id", "friend_id", "title", "artist", "album"]);
    expect(schemas.Album.required).toEqual(["release_id", "friend_id", "title", "artist"]);
    expect(schemas.TrackSearchResponse).toBeDefined();
    expect(schemas.AlbumPlayableStructure).toBeDefined();

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string; items?: { $ref?: string } } } } };
    const op = (path: string, method: string) =>
      getOperation(path, method) as { responses: Record<string, Content> };
    const schemaOf = (c?: Content) => c?.content?.["application/json"]?.schema;

    expect(schemaOf(op("/api/tracks/{id}", "get").responses["200"])).toMatchObject({
      $ref: "#/components/schemas/Track",
    });
    expect(schemaOf(op("/api/albums/{releaseId}/artwork", "get").responses["200"])?.$ref).toBe(
      "#/components/schemas/AlbumArtworkState"
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

    expect(ref(op("/api/friends", "get").responses["200"])).toBe("#/components/schemas/FriendListResponse");
    expect(ref(op("/api/friends", "post").requestBody)).toBe("#/components/schemas/FriendCreate");
    expect(ref(op("/api/friends", "post").responses["200"])).toBe("#/components/schemas/FriendCreateResponse");
    expect(ref(op("/api/settings/default-library", "get").responses["200"])).toBe(
      "#/components/schemas/DefaultLibrarySettings"
    );
    expect(ref(op("/api/settings/default-library", "put").requestBody)).toBe(
      "#/components/schemas/DefaultLibrarySettingsUpdate"
    );
    expect(ref(op("/api/settings/default-library", "put").responses["200"])).toBe(
      "#/components/schemas/DefaultLibrarySettingsUpdateResponse"
    );
  });

  it("references shared record-care components and documents their enums", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components.schemas as Record<string, { enum?: string[]; required?: string[] }>;
    expect(schemas.SleeveType.enum).toEqual(["original", "paper", "poly-rice-paper-poly", "poly"]);
    expect(schemas.RecordActionType.enum).toEqual(["cleaned", "sleeved", "inspected", "repaired"]);
    expect(schemas.CleaningMethod.enum).toEqual(["dry-brush", "wet-manual", "vacuum", "ultrasonic", "other"]);
    expect(schemas.RecordCareStatus.enum).toEqual(["never_cleaned", "overdue", "needs_sleeve"]);
    expect(schemas.RecordActionCreate.required).toEqual(["friend_id", "action_type"]);

    type Content = { content?: { "application/json"?: { schema?: { $ref?: string } } } };
    const ref = (c?: Content) => c?.content?.["application/json"]?.schema?.$ref?.replace("#/components/schemas/", "");
    const op = (path: string, method: string) =>
      getOperation(path, method) as {
        requestBody?: Content;
        responses: Record<string, Content>;
        parameters?: Array<{ name: string; schema?: { $ref?: string } }>;
      };

    expect(ref(op("/api/record-copies", "get").responses["200"])).toBe("RecordCopyListResponse");
    expect(ref(op("/api/record-copies", "post").requestBody)).toBe("RecordCopyCreate");
    expect(ref(op("/api/record-copies", "post").responses["201"])).toBe("RecordCopyResponse");
    expect(ref(op("/api/record-copies/default", "patch").requestBody)).toBe("RecordCopyDefaultUpdate");
    expect(ref(op("/api/record-copies/{id}", "patch").requestBody)).toBe("RecordCopyUpdate");
    expect(ref(op("/api/record-copies/{id}", "delete").responses["200"])).toBe("RecordCopyDeleteResponse");
    expect(ref(op("/api/record-copies/{id}/actions", "get").responses["200"])).toBe("RecordActionListResponse");
    expect(ref(op("/api/record-copies/care", "get").responses["200"])).toBe("RecordCareResponse");
    expect(ref(op("/api/record-copies/care/summary", "get").responses["200"])).toBe("RecordCareSummary");
    expect(ref(op("/api/record-actions", "post").requestBody)).toBe("RecordActionCreate");
    expect(ref(op("/api/record-actions", "post").responses["201"])).toBe("RecordActionMutationResponse");
    expect(ref(op("/api/record-actions/{id}", "delete").responses["200"])).toBe("RecordActionVoidResponse");

    const param = (path: string, name: string) =>
      op(path, "get").parameters?.find((p) => p.name === name)?.schema?.$ref;
    expect(param("/api/record-copies/care", "status")).toBe("#/components/schemas/RecordCareStatus");
    expect(param("/api/record-copies/{id}/actions", "action_type")).toBe("#/components/schemas/RecordActionType");
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
      (getOperation(path, method) as { responses: Record<string, Example> }).responses["200"]?.content?.[
        "application/json"
      ]?.example;

    expect(example("/api/friends", "get")).toEqual({ results: [expect.objectContaining({ username: expect.any(String) })] });
    expect(example("/api/playlists", "delete")).toEqual(expect.objectContaining({ success: expect.anything() }));
    expect(example("/api/tracks/{id}", "get")).toEqual(expect.objectContaining({ track_id: expect.any(String) }));
  });

  it("stops inlining at a self-referencing or unknown component", () => {
    const components = {
      Node: { type: "object", properties: { children: { type: "array", items: { $ref: "#/components/schemas/Node" } } } },
    };
    expect(inlineComponentRefs({ $ref: "#/components/schemas/Node" }, components)).toEqual({
      type: "object",
      properties: { children: { type: "array", items: { type: "object" } } },
    });
    expect(inlineComponentRefs({ $ref: "#/components/schemas/Missing" }, components)).toEqual({ type: "object" });
    expect(inlineComponentRefs([{ $ref: "https://elsewhere/x" }, 3], components)).toEqual([
      { $ref: "https://elsewhere/x" },
      3,
    ]);
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
      responses: { [status!]: { content: { "application/json": { schema: { $ref: `#/components/schemas/${response}` } } } } },
      ...(body ? { requestBody: { content: { "application/json": { schema: { $ref: `#/components/schemas/${body}` } } } } } : {}),
    });
  });

  it("exports the source enum, signal bounds and recursive tree references", () => {
    const schemas = getOpenApiDocument().components.schemas;
    expect(schemas.GenreSource).toMatchObject({ enum: ["discogs", "custom"] });
    expect(schemas.GenreSimilaritySignals).toMatchObject({ properties: {
      taxonomy: { enum: ["sibling", "parent", "child"] },
      npmi: { minimum: -1, maximum: 1 }, shared_albums: { minimum: 0 },
    } });
    expect(schemas.GenreTreeNode).toMatchObject({ properties: {
      source: { $ref: "#/components/schemas/GenreSource" },
      children: { items: { $ref: "#/components/schemas/GenreTreeNode" } },
    } });
  });
});
