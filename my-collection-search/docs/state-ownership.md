# State Ownership: Zustand vs React Query

This project uses both Zustand and React Query. To prevent drift and stale UI bugs, ownership is explicit.

## Canonical Ownership

- Zustand is the source of truth for entity data:
  - `Track` entities (`trackStore`)
  - `Album` entities (`albumStore`)
- React Query is the source of truth for request lifecycle and non-entity query metadata:
  - loading/error/retry states
  - pagination cursors and query params
  - lightweight refs (IDs), playlist metadata, and server response timing

## Core Rule

Never keep parallel authoritative copies of the same `Track` or `Album` entity in both Zustand and React Query.

## Practical Rules

1. Query hooks fetch from API, then hydrate entities into Zustand.
2. UI renders `Track`/`Album` entity fields from Zustand selectors/hooks.
3. Mutations update Zustand entities directly on success (and optimistic paths when needed).
4. React Query cache writes (`setQueryData`/`setQueriesData`) are allowed only for:
  - non-entity metadata
  - ID/reference lists
  - pagination/query control state
5. Prefer targeted `invalidateQueries` for refetching server-backed lists after mutations.

## Hydration Semantics

To avoid ambiguous states ("empty because not loaded" vs "empty because no data"), stores track hydration:

- Album store: `hydratedAlbumKeys` (`release_id:friend_id`)
- Track store: `hydratedReleaseKeys` (`release_id:friend_id`) and release index

Pages should gate rendering on hydration flags, then read entity data from store.

## Current Patterns

- Tracks:
  - canonical map: `trackStore.tracks`
  - release index: `trackStore.trackKeysByRelease`
  - selector hook: `useTracksByRelease(releaseId, friendId)`
- Albums:
  - canonical map: `albumStore.albums`
  - selector hook: `useAlbum(releaseId, friendId)`

## Do / Don’t

Do:

- Use React Query to fetch and seed stores.
- Render entity fields from Zustand hooks/selectors.
- Add store indexes/selectors for high-frequency filtered reads.

Don’t:

- Return entity arrays directly from query cache as primary UI data.
- Patch entity objects in both React Query and Zustand in the same flow.
- Build fresh arrays/objects inside Zustand selectors (can cause `getSnapshot` loop warnings).

## Selector Stability

When using Zustand:

- Subscribe to stable structures (`Map`, `Set`, primitive flags).
- Derive filtered arrays with `useMemo` outside the selector.

Avoid:

- `useStore((state) => Array.from(state.map.values()).filter(...))`

Prefer:

- `const map = useStore((state) => state.map);`
- `const rows = useMemo(() => ..., [map, ...])`

## Migration Checklist for New/Refactored Features

1. Define entity owner (`Track`/`Album` => Zustand).
2. Add/extend store selectors/indexes needed for performant reads.
3. Query hook hydrates store in `useEffect` from `query.data`.
4. Component reads entities from store; query controls only loading/error/refetch.
5. Mutation writes store and invalidates affected query keys.
6. No duplicate entity patching in React Query cache.

## Genre detail reads

Genre detail caches taxonomy, counts and full-set statistics as React Query
metadata. Album and track searches are paginated: each page hydrates Zustand and
caches only entity refs plus pagination metadata. The API's `top_albums` and
`top_tracks` remain limited previews for existing consumers; the detail UI does
not use them for browsing, statistics or playback. Play all and Shuffle collect
all matching search pages before replacing the selected output's playable queue.

“Added this year” counts matching live tracks by `tracks.date_added`, the date
added to the Discogs collection preserved by collection imports, rather than
`created_at` (when GrooveNet imported the row). The interval is January 1 inclusive
to the following January 1 exclusive, using the current UTC calendar year and
the stored collection timestamps. Missing collection dates do not count.
BPM statistics include finite positive values only; histogram bins are 10 BPM
intervals `[min, max)`, and missing or invalid values contribute to neither the
range nor the histogram. All these reads use the search genre filter, including
descendants, and the selected friend's collection.
