import { describe, expect, it } from "vitest";
import { albumUpdateBodySchema, albumEntitySchema, albumTaxonomyOverrideFields } from "../schemas";
import { getOpenApiDocument } from "../openapi";
const ID = "00000000-0000-4000-8000-000000000001";

describe("album override contracts", () => {
  it("distinguishes missing, empty and reset update fields", () => {
    const base = { release_id: "r", friend_id: 7 };
    expect(albumUpdateBodySchema.safeParse(base).success).toBe(false);
    for (const override of [
      { genre_override_ids: [] },
      { style_override_ids: null },
      { genre_override_ids: [ID] },
    ]) {
      expect(albumUpdateBodySchema.parse({ ...base, ...override })).toEqual({
        ...base,
        ...override,
      });
    }
    expect(albumTaxonomyOverrideFields.safeParse({ style_override_ids: ["Fusion"] }).success).toBe(
      false,
    );
    expect(
      albumEntitySchema.parse({
        ...base,
        title: "Album",
        artist: "Artist",
        genres: ["Latin"],
        effective_genres: [],
        genre_override_ids: [],
      }),
    ).toMatchObject({ genres: ["Latin"], effective_genres: [], genre_override_ids: [] });
  });
  it("documents nullable UUID replacements and effective read values for generated clients", () => {
    const paths = getOpenApiDocument().paths;
    const doc = getOpenApiDocument();
    const patch = paths["/api/albums"].patch as {
      requestBody: { content: { "application/json": { schema: { $ref: string } } } };
    };
    const request = patch.requestBody.content["application/json"].schema;
    expect(request.$ref).toBe("#/components/schemas/AlbumUpdateRequest");
    const properties = (
      doc.components.schemas as Record<string, { properties: Record<string, unknown> }>
    ).AlbumUpdateRequest.properties;
    for (const field of ["genre_override_ids", "style_override_ids"]) {
      expect(properties[field]).toMatchObject({
        anyOf: [
          { type: "array", items: { type: "string", format: "uuid" }, maxItems: 100 },
          { type: "null" },
        ],
        description: expect.stringContaining("null: reset to latest Discogs"),
      });
    }
    const detail = paths["/api/albums/{releaseId}"].get as {
      responses: Record<string, { content: { "application/json": { schema: { $ref: string } } } }>;
    };
    expect(detail.responses["200"].content["application/json"].schema).toMatchObject({
      $ref: "#/components/schemas/AlbumDetail",
    });
    expect(
      (doc.components.schemas as Record<string, { properties: { album: unknown } }>).AlbumDetail
        .properties.album,
    ).toMatchObject({
      properties: { effective_genres: { type: "array" }, effective_styles: { type: "array" } },
    });
  });
});
