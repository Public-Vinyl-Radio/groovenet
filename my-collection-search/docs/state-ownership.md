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
