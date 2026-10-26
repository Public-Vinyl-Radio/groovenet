# @groovenet/contracts

Shared runtime schemas and TypeScript types for Groovenet API resources. It is
the source of truth for the wire enums, entities, and request/response payloads
of live sets (`liveSets.ts`), playlists (`playlists.ts`), tracks (`tracks.ts`),
albums (`albums.ts`), friends with the default-library setting (`friends.ts`)
physical-copy record care (`recordCare.ts`) and genre taxonomy (`genres.ts`).

[`INVENTORY.md`](INVENTORY.md) lists every published API operation with its
family and migration status, and the order the remaining families follow.

## Adding or migrating a contract

1. Define the Zod schema in this package and export its inferred type with
   `z.infer<typeof schema>`.
2. Use the schema in the app route to validate incoming JSON. Keep the route's
   existing HTTP status and error response behavior when adding validation.
3. Import the inferred type in the app's repository/service layer and re-export
   it from `@groovenet/client` when client methods return or accept the resource.
   The CLI consumes client types and does not maintain a parallel declaration.
4. Export JSON Schema forms for OpenAPI components and reference those
   components from the route contract. Add an OpenAPI test for the resource's
   shape and enum values.

Migrate one resource family at a time: live sets, playlists, tracks, albums,
friends, record care, spins and genre taxonomy are done; `INVENTORY.md` orders the rest. Preserve permissive response fields where
the database returns additional wire fields; make request schemas strict only
when the endpoint already rejects unknown fields.

## Pattern for endpoints with route-specific coercion

Playlist endpoints showed three cases the live-set migration did not need:

- **Text-coerced ids stay in the app.** Path and query ids arrive as strings, so
  the app keeps `intFromInputSchema` for `params`/`query` schemas. The shared
  schema declares the wire type (`id: z.number().int()`); the app derives its
  route schema with `.extend({ id: intFromInputSchema })`. Do not move
  `z.preprocess` into this package: it has no JSON Schema form.
- **Schemas with defaults or refinements publish their input shape.** Pass
  `{ io: "input" }` to `z.toJSONSchema` for those (`PlaylistCreate`,
  `PlaylistSpinsInput`) so OpenAPI documents what a client sends, not what the
  parser produces. Refinements such as "not both `performed_at` and
  `performance_id`" run at runtime but are not expressible in JSON Schema;
  describe them in the route description.
- **Keep the app's schema names as aliases.** `api-contract/schemas.ts` re-exports
  shared schemas under the names routes and `internalApi/*` already import, so a
  migration changes where a schema is defined without touching every caller.

Name wire types after the resource, not the endpoint (`Playlist`,
`PlaylistDetail`, `PlaylistSpinsResult`), and reference them from
`openapi.ts` via the exported `*JsonSchemas` object. Cover new shapes with a
test in this package and an OpenAPI `$ref` assertion in
`my-collection-search/src/api-contract/__tests__/openapi.test.ts`.

## Pattern for large entities (tracks and albums)

Track and album rows carry dozens of database columns, which raised conventions
the smaller resources did not need:

- **Export the entity type from a non-passthrough shape.** `.passthrough()` adds
  an index signature (`[x: string]: unknown`) that collapses `Omit`/`Pick` and
  makes every key `unknown`. Declare `const trackShape = z.object({...})`, export
  `trackSchema = trackShape.passthrough()` for parsing and OpenAPI, and infer
  `TrackEntity` from `trackShape`.
- **The wire schema is honest about nulls; consumers narrow.** `Track` and
  `Album` allow `null` on columns the database can return null for. The app's
  `types/track.ts` narrows the handful of fields its UI never sees null
  (`discogs_url`, `album_thumbnail`, ...) with `Omit<> & {...}` instead of
  loosening the contract.
- **Entities in list/search responses stay opaque at runtime.** The shared
  `TrackSearchResponse` documents `hits` as `Track`, but the search route's
  runtime schema overrides `hits` to `z.array(z.unknown())` because raw SQL rows
  have never been rejected. Do not parse whole entities in a route unless a
  real-database test shows they conform (timestamps and numerics arrive in
  driver-specific types).
- **Query schemas stay in the app.** `trackSearchQuerySchema` and
  `albumSearchQuerySchema` here describe the coerced wire values; the app's
  `*GetQuerySchema` keeps `intFromInputSchema`/`booleanFlagSchema` coercion.
  The client's `trackSearchGetQuerySchema` is still a coercing copy (deferred).
- **Add response validation only to flat payloads.** Routes that return a small
  fixed object (`essentia`, `playlists`, `DELETE`, extract-cover) parse their
  response with the shared schema; lenient request handling (e.g.
  `playlist_counts` silently dropping malformed refs) is preserved.

## Pattern for the remaining families (#552)

Friends and the default-library setting were the first of #552's slices, and
fixed the conventions the rest follow:

- **Update `INVENTORY.md` in the same PR.** `contractInventory.test.ts` in the
  app fails when an OpenAPI operation has no row, a row names an operation that
  no longer exists, an `exception` has no reason, or a row marked `contracts`
  references no shared component. Add the family's `*JsonSchemas` to that test's
  `SHARED_COMPONENTS` when you register them in `openapi.ts`.
- **Request bodies publish their input shape.** A plain `z.object` strips
  unknown keys at runtime, but its default (output) JSON Schema says
  `additionalProperties: false`, which tells clients the server rejects them.
  Publish request bodies with `{ io: "input" }` unless the route really rejects
  unknown fields (`.strict()`).
- **Keep the route's own coercion when the app helper would change it.**
  `intFromInputSchema` uses `parseInt`, so it accepts `"3abc"`; the
  default-library `PUT` has always coerced with `Number()` and rejected that.
  The route keeps `Number()` and validates the result with the shared wire
  schema, so only already-broken input changes (`2.5` is now a 400, where it
  used to reach Postgres and come back a 500).
- **Reference components with `componentRef(name)`** in `routes.ts`.
  `openapi.ts` inlines `$ref`s before generating response examples, so a
  migrated response keeps a realistic example instead of the literal
  `"example"`, which every `$ref`'d response produced until this fix.
- **Streams and binaries are exceptions, not gaps.** An operation whose body is
  not JSON (the friend-removal progress stream, audio and dump downloads, SSE)
  stays `exception` in the inventory with its reason, even when its query is
  validated with a shared schema.
- **Refined request bodies export their object and their refinement.** Zod
  will not `.extend()` an object that carries a `.refine`/`.superRefine`, and
  the app must swap ids for its coercing versions. Export the plain
  `*ObjectSchema`, the refinement (`requireLabelOrNotes`,
  `refineRecordActionCreate`) and the refined wire schema; the app rebuilds
  `object.extend({...coercion}).superRefine(refinement)`. Where the refinement
  enforces "exactly one of", export a TypeScript union for callers
  (`RecordActionCreate`) built from the inferred base type.
- **Documentation travels with the schema.** Put OpenAPI descriptions,
  examples and `format: "date-time"` on the field with `.meta({...})`, which
  `z.toJSONSchema` copies through, instead of keeping them in a hand-written
  schema object in `routes.ts`. Use `format` rather than `z.iso.datetime()` on
  responses, so the parser stays as lenient as it was.
- **Enum tuples come from the schema.** Export `SLEEVE_TYPES =
  sleeveTypeSchema.options` and have app modules (`lib/recordCare.ts`)
  re-export it, so UI, SQL helpers and analytics share one list. Database row
  types that differ only in timestamp types derive from the wire type with
  `Omit<> & {...}` rather than repeating every column.
- **The client's own Zod copy is replaced, not kept.** `groovenet-client`
  exports Zod schemas from `schemas.ts` as well as types. When a family has
  both, re-export the shared shapes there and rebuild only the coercing
  bodies and queries with the same `.extend()` + exported refinement the app
  uses (spins). A hand-copied enum can lag the database: the client's spin
  schema had no `playlist` selection mode or provenance until it was replaced.
- **Wire queries omit defaults.** Shared query schemas describe what a client
  may send (`limit?: number`); the app adds `.default(50)` after coercion and
  the OpenAPI `parameters` list documents the default.
