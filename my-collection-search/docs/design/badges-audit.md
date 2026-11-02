# Badge, chip and tag audit

Issue #957. An inventory of every badge-like element in `my-collection-search/src`, with how
each one renders today. **This is an audit, not a redesign.** Nothing in the app was changed.
The proposal at the end is a suggestion for the designer and the owner to accept or reject.

- Live page: Storybook → **Audit/Badges** (`src/stories/AuditBadges.stories.tsx`). Each
  variant group is its own story. The `palette` control picks Sleeve, Riso, Midnight or Mono,
  and the `mode` control shows light, dark, or both side by side.
- Screenshots: cropped from a stack restored from the production seed, at 2x, in the Sleeve
  palette, light mode. They are hosted on the `pr-assets/957` branch and are not committed here.
  B9 and H7 never appear on the seeded data, so their crops come from Storybook and are labelled
  as such.
- Styling was measured, not read off the props. The theme changes how a variant looks, so every
  group below was checked with `getComputedStyle` in Storybook (all four palettes, both modes)
  and spot-checked on the live stack.

## Summary

|                       |                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Element sites         | **125** in 57 files: 91 direct `<Badge>`, 1 `<Tag.Root>`, 19 `GenreBadge` call sites and 14 hand-built look-alikes                                            |
| Visual variant groups | **18** in all: 10 from the `<Badge>` recipe, 1 Chakra `Tag` and 7 hand-built                                                                                  |
| Distinct meanings     | about 15: status, missing data, genre, library ID, key, count, medium, source and others                                                                      |
| Contrast              | **No failures.** Every recipe badge's text-on-fill pair is at least 4.5:1 in all 4 palettes in both modes. The lowest is Riso light's solid accent, at 4.52:1 |
| Dead code             | 8 sites in 3 files that render on no page: `SimilarTracks`, `SimilarVibeTracks` and `GenreLinkList` are imported only by tests                                |

**Correction to the issue:** a badge recipe _does_ exist, at `src/app/houseStyle.ts:156`. It
gives every `<Badge>` the label face, uppercase, 0.05em tracking and square corners, and gives
`subtle` a ruled 1px border. Chakra's `Tag` has no recipe, so the one Tag in the app looks like
neither the badges nor the chips.

### Worst offenders

1. **A solid status badge loses its status (B9, 4 sites).** `variant="solid"` with a
   `status.*` palette asks for `colorPalette.solid`/`.contrast`, but `status.*` only defines
   `fg`/`subtle`/`border`. The invalid variables inherit the default gray, so _Paused_,
   _Update available_, _Unsaved changes_ and the downloader names `gamdl`/`yt-dlp` all render
   as the same near-black chip, and as a white chip in dark mode. This is a bug: the colour
   the code asks for never appears.
2. **Stock-gray leaks past the palettes (B4, B6, T1, part of B5 and B8; 38 sites).** A
   `<Badge>` or `<Tag>` with no `colorPalette` falls back to Chakra's own `gray` scale (zinc),
   and the theme remaps only `gray.border` and `gray.focusRing`. Every Discogs genre, the key
   counts, "default" and the GenrePicker tags are cold zinc in Sleeve's cream, Riso's paper and
   Midnight's navy alike.
3. **A genre has 8 looks.** A track genre is a `status.genre` tint (rows and cards), a solid
   accent (the dense rows on `/jobs`) or solid near-black (the playlist stats). A Discogs genre
   is a gray surface, and a Discogs style is a gray outline. A chosen genre is a Chakra Tag in
   the body face (GenrePicker), a 2px ink chip (SelectedGenreTags) or a filter chip
   (FilterChips).
4. **The status colours are overloaded.** `status.genre` (purple) means genre, but also
   playlist count, sort move, automatic spin, "Era: 1970s", a vibe track's BPM, the gamdl
   downloader and "Music Identity". `status.success` covers similarity, key compatibility,
   "Full album", "Embedded cover found" and service up. `accent` covers library IDs, counts,
   the job state _Waiting_, the distance _Similar_ and a key.
5. **One meaning, two builds.** Medium is `SpinMediumChip` (a Badge, xs) on `/spins` but a
   hand-built mono tag on Home. "Sleeve unknown" is a neutral _Unknown sleeve_ Badge on the
   album page but a dashed `SLEEVE ?` chip on Chores. "+N more" is a neutral Badge on track
   rows but a mono ink box on the Log care dialog.
6. **Type roles split.** A recipe badge uses the **label** face, which the user can change in
   Settings. The hand-built tags (H3, H4, H7) hard-code **mono** (Plex), so changing the Labels
   font changes half the tags. The Tag and the key chip use the **body** face in mixed case.
7. **The digital medium chip has a double outline (B10).** It takes the 2px ink border from its
   props and the outline variant's 1px inset ring, and both show (see the screenshot).

## Inventory

`site` is the JSX element. A computed style (palette from a map) is one row, with its values
listed. Group IDs refer to [Variant groups](#variant-groups); the group gives the resolved CSS,
and the row gives only the props and any overrides. "No page" marks dead code.

**Pages:** tracks = `/tracks`; track = `/tracks/[id]`; edit = `/tracks/[id]/edit`; albums =
`/albums`; album = `/albums/[releaseId]`; playlist = `/playlists/[id]`; home = `/`; chores =
`/chore`; spins = `/spins`; recap = `/spins/recap`; jobs = `/jobs`; settings = `/settings`;
genres = `/genres`.

### Chakra `<Badge>` and `<Tag>`

All files are under `src/`. Unless noted, the variant is `subtle` (recipe default) and the size
is `sm` (recipe default).

| Site                                                       | Component            | Meaning                 | Group | Props                                                                                                                    | Overrides / interactive                               | Pages                                  |
| ---------------------------------------------------------- | -------------------- | ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------- |
| `app/jobs/page.tsx:107`                                    | `getStateBadge`      | job state               | B1    | subtle · `accent` waiting, `status.analysis` active, `status.success` completed, `status.missing` failed, `neutral` else | casing set in JS, then uppercased by the recipe       | jobs                                   |
| `app/jobs/page.tsx:472`                                    | jobs list            | queue name              | B5    | outline · gray                                                                                                           |                                                       | jobs                                   |
| `app/jobs/page.tsx:473`                                    | jobs list            | job name                | B5    | outline · gray                                                                                                           |                                                       | jobs                                   |
| `app/jobs/page.tsx:474`                                    | jobs list            | downloader              | B9    | solid · sm · `accent` / `status.genre` / `status.missing`                                                                | status.* values render gray (B9)                      | jobs                                   |
| `app/jobs/page.tsx:575`                                    | job details tabs     | log count               | B4    | subtle · xs · gray                                                                                                       | `ml=1`, inside a tab trigger                          | jobs                                   |
| `app/albums/[releaseId]/page.tsx:337`                      | Discogs raw panel    | file path               | B5    | outline · gray                                                                                                           |                                                       | album                                  |
| `app/albums/artwork/page.tsx:85`                           | artwork review       | art match status        | B1    | subtle · `status.analysis` (mismatch) / `neutral`                                                                        |                                                       | `/albums/artwork`                      |
| `app/genres/[slug]/page.tsx:120`                           | genre header         | custom genre            | B5    | outline · gray                                                                                                           | `title` tooltip                                       | genres                                 |
| `app/tracks/[id]/edit/page.tsx:244`                        | edit form            | uncertain BPM           | B1    | subtle · sm · `status.analysis`                                                                                          | `mt=1`                                                | edit                                   |
| `app/tracks/[id]/edit/page.tsx:257`                        | edit form            | uncertain key           | B1    | subtle · sm · `status.analysis`                                                                                          |                                                       | edit                                   |
| `app/vinyl/VinylPipelineView.tsx:297`                      | vinyl pipeline       | failure count           | B1    | subtle · `status.missing`                                                                                                |                                                       | `/vinyl` (dev)                         |
| `components/AlbumArtworkDialog.tsx:215`                    | artwork dialog       | art source              | B4    | subtle · gray                                                                                                            |                                                       | album, track                           |
| `components/AlbumResult.tsx:38`                            | `MissingTags`        | missing data            | B1    | subtle · sm · `status.missing` (identifier, cover) / `status.analysis` (audio)                                           | nowrap                                                | albums                                 |
| `components/AlbumResult.tsx:189`                           | album card           | +N genres               | B3    | subtle · sm · `neutral`                                                                                                  | `title` + `aria-label`                                | albums                                 |
| `components/AlbumResult.tsx:365`                           | album card           | library ID              | B2    | subtle · sm · `accent`                                                                                                   | **bold**                                              | albums                                 |
| `components/AlbumSearchMenu.tsx:34`                        | phone menu           | active filter count     | B7    | solid · xs · `accent`                                                                                                    | absolutely positioned at 2px/2px                      | albums (phone)                         |
| `components/enrichment/EnrichmentTrackStep.tsx:264`        | enrichment           | step failed             | B1    | subtle · xs · `status.missing`                                                                                           |                                                       | `/enrich`                              |
| `components/enrichment/EnrichmentTrackStep.tsx:341`        | enrichment           | step failed             | B1    | subtle · xs · `status.missing`                                                                                           |                                                       | `/enrich`                              |
| `components/enrichment/EnrichmentTrackStep.tsx:443`        | enrichment           | step failed             | B1    | subtle · xs · `status.missing`                                                                                           |                                                       | `/enrich`                              |
| `components/enrichment/EnrichmentWizard.tsx:298`           | enrichment           | saved count             | B2    | subtle · sm · `accent`                                                                                                   |                                                       | `/enrich`                              |
| `components/enrichment/EnrichmentWizard.tsx:302`           | enrichment           | skipped count           | B5    | outline · sm · gray                                                                                                      |                                                       | `/enrich`                              |
| `components/GenreBadge.tsx:153`                            | `GenreBadgeRow`      | +N genres (phone)       | B3    | subtle · `neutral` · caller's size                                                                                       |                                                       | tracks (phone)                         |
| `components/GenrePicker.tsx:84`                            | `GenrePicker`        | chosen genre            | T1    | **Tag** surface · lg · gray                                                                                              | removable (`Tag.CloseTrigger`), body face, mixed case | edit, album taxonomy editor, `/enrich` |
| `components/genres/GenreLinkList.tsx:25`                   | `GenreLinkList`      | genre + count           | B6    | surface · md · gray                                                                                                      | link, underline on hover                              | **no page**                            |
| `components/jobs/EmbeddingQueueSection.tsx:149`            | embedding queue      | paused                  | B9    | solid · `status.missing`                                                                                                 | renders gray                                          | jobs                                   |
| `components/jobs/EmbeddingQueueSection.tsx:290`            | embedding queue      | job kind                | B5    | outline · sm · gray                                                                                                      |                                                       | jobs                                   |
| `components/PlaylistRecommendations.tsx:55`                | recommendations      | source: identity + vibe | B1    | subtle · sm · `status.genre`                                                                                             |                                                       | playlist                               |
| `components/PlaylistRecommendations.tsx:60`                | recommendations      | source: identity        | B2    | subtle · sm · `accent`                                                                                                   |                                                       | playlist                               |
| `components/PlaylistRecommendations.tsx:65`                | recommendations      | source: vibe            | B2    | subtle · sm · `accent`                                                                                                   |                                                       | playlist                               |
| `components/PlaylistStatsPanel.tsx:276`                    | stats (compact)      | key count               | B4    | subtle · gray                                                                                                            | `fontSize="xs"` (12px, over the recipe's 11px)        | playlist                               |
| `components/PlaylistStatsPanel.tsx:392`                    | stats (full)         | key count               | B4    | subtle · gray                                                                                                            |                                                       | playlist                               |
| `components/PlaylistViewer.tsx:461`                        | playlist header      | unsaved changes         | B9    | solid · sm · `status.analysis`                                                                                           | renders gray; hidden below md                         | playlist                               |
| `components/records/RecordCopyCard.tsx:46`                 | care panel           | default copy            | B5    | outline · sm · gray                                                                                                      |                                                       | album                                  |
| `components/records/RecordCopyCard.tsx:50`                 | care panel           | sleeve type             | B3    | subtle · sm · `neutral`                                                                                                  | "Unknown sleeve" conflicts with H3 `SLEEVE ?`         | album                                  |
| `components/records/RecordCopyCard.tsx:54`                 | care panel           | never cleaned           | B1    | subtle · sm · `status.missing`                                                                                           |                                                       | album                                  |
| `components/records/RecordCopyCard.tsx:59`                 | care panel           | overdue                 | B1    | subtle · sm · `status.missing`                                                                                           |                                                       | album                                  |
| `components/RelatedTrackRows.tsx:56`                       | `MixTag`             | key compatibility       | B1    | subtle · sm · `status.success` (same, adjacent) / `neutral` (clash)                                                      | nowrap                                                | track                                  |
| `components/RelatedTrackRows.tsx:131`                      | related rows         | +N genres               | B3    | subtle · sm · `neutral`                                                                                                  |                                                       | track                                  |
| `components/settings/AboutSection.tsx:95`                  | About                | update available        | B9    | solid · `status.success`                                                                                                 | renders gray                                          | settings                               |
| `components/settings/AboutSection.tsx:194`                 | About                | service status          | B1    | subtle · `status.success` up / `status.missing` down / `neutral`                                                         |                                                       | settings                               |
| `components/settings/BackupStatusSection.tsx:121`          | backups              | backup status           | B1    | subtle · `status.success` / `status.missing` / `status.analysis`                                                         |                                                       | settings                               |
| `components/settings/CustomPaletteEditor.tsx:248`          | palette preview      | status swatch           | B1    | subtle · sm · each `status.*`                                                                                            |                                                       | settings                               |
| `components/settings/FriendsDiscogsSection.tsx:223`        | Discogs              | default library         | B4    | subtle · gray                                                                                                            |                                                       | settings                               |
| `components/settings/FriendsDiscogsSection.tsx:258`        | Discogs              | default library         | B4    | subtle · gray                                                                                                            |                                                       | settings                               |
| `components/settings/GamdlCookieManager.tsx:173`           | gamdl                | cookie valid            | B1    | subtle · `status.success` / `status.missing`                                                                             |                                                       | settings                               |
| `components/settings/GamdlTestConnection.tsx:136`          | gamdl test           | binary found            | B1    | subtle · `status.success` / `status.missing` / `neutral`                                                                 |                                                       | settings                               |
| `components/settings/GamdlTestConnection.tsx:149`          | gamdl test           | cookie file             | B1    | as above                                                                                                                 |                                                       | settings                               |
| `components/settings/GamdlTestConnection.tsx:163`          | gamdl test           | cookie valid            | B1    | as above                                                                                                                 |                                                       | settings                               |
| `components/settings/GamdlTestConnection.tsx:178`          | gamdl test           | test download           | B1    | as above                                                                                                                 |                                                       | settings                               |
| `components/SimilarTracks.tsx:103`                         | similar tracks       | era filter              | B1    | subtle · sm · `status.genre`                                                                                             |                                                       | **no page**                            |
| `components/SimilarTracks.tsx:108`                         | similar tracks       | country filter          | B2    | subtle · sm · `accent`                                                                                                   |                                                       | **no page**                            |
| `components/SimilarTracks.tsx:113`                         | similar tracks       | tags filter             | B1    | subtle · sm · `status.success`                                                                                           |                                                       | **no page**                            |
| `components/SimilarTracks.tsx:131`                         | similar tracks       | distance                | B1    | subtle · sm · `status.success` / `accent` / `status.analysis` / `neutral`                                                | `title`                                               | **no page**                            |
| `components/SimilarVibeTracks.tsx:102`                     | similar vibe         | distance                | B1    | as above                                                                                                                 |                                                       | **no page**                            |
| `components/SimilarVibeTracks.tsx:110`                     | similar vibe         | BPM                     | B1    | subtle · sm · `status.genre`                                                                                             |                                                       | **no page**                            |
| `components/SimilarVibeTracks.tsx:115`                     | similar vibe         | key                     | B2    | subtle · sm · `accent`                                                                                                   |                                                       | **no page**                            |
| `components/spins/AlbumSpinPanel.tsx:53`                   | album spins          | track × plays           | B6    | surface · sm · gray                                                                                                      |                                                       | album                                  |
| `components/spins/listeningLogParts.tsx:20`                | `SpinMediumChip`     | medium                  | B10   | solid (vinyl) / outline (digital) · xs · `neutral`                                                                       | `borderWidth="outline"` `borderColor="border.ink"`    | spins                                  |
| `components/spins/SpinFormDialog.tsx:261`                  | spin form            | selection count         | B2    | subtle · `accent`                                                                                                        |                                                       | album, spins                           |
| `components/spins/SpinFormDialog.tsx:266`                  | spin form            | track events            | B5    | outline · gray                                                                                                           |                                                       | album, spins                           |
| `components/spins/SpinFormDialog.tsx:269`                  | spin form            | full album              | B1    | subtle · `status.success`                                                                                                |                                                       | album, spins                           |
| `components/spins/SpinFormDialog.tsx:305`                  | spin form            | side track count        | B5    | outline · gray                                                                                                           |                                                       | album, spins                           |
| `components/spins/SpinRow.tsx:91`                          | album spin row       | provenance              | B1    | subtle · xs · `status.genre` (auto) / `neutral` (manual)                                                                 | inside a tooltip trigger                              | album                                  |
| `components/spins/SpinRow.tsx:100`                         | album spin row       | context type            | B3    | subtle · xs · `neutral`                                                                                                  |                                                       | album                                  |
| `components/track-detail/AudioMetadataSection.tsx:52`      | audio metadata       | embedded cover          | B1    | subtle · `status.success` / `neutral`                                                                                    |                                                       | track                                  |
| `components/track-detail/AudioMetadataSection.tsx:55`      | audio metadata       | file path               | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/AudioVibeEmbeddingSection.tsx:32` | embedding            | embedding kind          | B2    | subtle · `accent`                                                                                                        |                                                       | track                                  |
| `components/track-detail/AudioVibeEmbeddingSection.tsx:34` | embedding            | BPM                     | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/AudioVibeEmbeddingSection.tsx:37` | embedding            | key                     | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/AudioVibeEmbeddingSection.tsx:40` | embedding            | energy                  | B5    | outline · `status.analysis`                                                                                              |                                                       | track                                  |
| `components/track-detail/ContextEmbeddingSection.tsx:36`   | embedding            | embedding kind          | B2    | subtle · `accent`                                                                                                        |                                                       | track                                  |
| `components/track-detail/ContextEmbeddingSection.tsx:37`   | embedding            | era                     | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/EssentiaSection.tsx:29`           | Essentia             | file path               | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/IdentityEmbeddingSection.tsx:32`  | embedding            | embedding kind          | B1    | subtle · `status.genre`                                                                                                  |                                                       | track                                  |
| `components/track-detail/IdentityEmbeddingSection.tsx:33`  | embedding            | era                     | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/IdentityEmbeddingSection.tsx:34`  | embedding            | country                 | B5    | outline · gray                                                                                                           |                                                       | track                                  |
| `components/track-detail/TrackGenresSection.tsx:75`        | track genres         | no genres yet           | B5    | outline · sm · `neutral`                                                                                                 | empty state drawn as a badge                          | track                                  |
| `components/track-detail/TrackHeader.tsx:370`              | track header         | library ID              | B2    | subtle · sm · `accent`                                                                                                   | **bold**                                              | track                                  |
| `components/track-detail/TrackPlaylistsSection.tsx:36`     | track playlists      | position                | B2    | subtle · `accent`                                                                                                        |                                                       | track                                  |
| `components/track-edit/TrackEditFormFields.tsx:55`         | edit modal           | uncertain BPM           | B1    | subtle · sm · `status.analysis`                                                                                          |                                                       | tracks (edit modal)                    |
| `components/track-edit/TrackEditFormFields.tsx:68`         | edit modal           | uncertain key           | B1    | subtle · sm · `status.analysis`                                                                                          |                                                       | tracks (edit modal)                    |
| `components/TrackPlaylistUsage.tsx:37`                     | `TrackPlaylistUsage` | playlist count          | B1    | subtle · xs · `status.genre`                                                                                             | **a button** (`as="button"`) that opens a popover     | tracks, playlist                       |
| `components/TrackPlaylistUsage.tsx:72`                     | popover list         | playlist position       | B2    | subtle · xs · `accent`                                                                                                   |                                                       | tracks, playlist                       |
| `components/TrackResult.tsx:323`                           | `BpmValue`           | no BPM                  | B1    | subtle · sm · `status.analysis`                                                                                          | nowrap                                                | tracks, playlist                       |
| `components/TrackResult.tsx:393`                           | `GenreList`          | +N genres               | B3    | subtle · sm · `neutral`                                                                                                  |                                                       | tracks, playlist                       |
| `components/TrackResult.tsx:659`                           | meta extras          | library ID              | B2    | subtle · sm · `accent`                                                                                                   | **bold**, nowrap                                      | tracks, playlist                       |
| `components/TrackResult.tsx:673`                           | meta extras          | sort position moved     | B1    | subtle · sm · `status.genre`                                                                                             |                                                       | playlist                               |
| `components/TrackResult.tsx:912`                           | dense card           | similarity score        | B1    | subtle · **xs** · `status.success` (>90) / `status.analysis` (>75) / `status.missing`                                    | `toFixed(0)`                                          | jobs                                   |
| `components/TrackResult.tsx:1080`                          | row                  | similarity score        | B1    | subtle · **sm** · same map                                                                                               | `toFixed(1)`, unlike the card                         | tracks (semantic search)               |
| `components/TrackResult.tsx:1275`                          | card                 | similarity score        | B1    | subtle · sm · same map                                                                                                   | `toFixed(1)`                                          | tracks (semantic search)               |
| `components/TrackResult.tsx:1429`                          | card                 | no BPM                  | B1    | subtle · sm · `status.analysis`                                                                                          |                                                       | tracks                                 |
| `components/TrackSearchMenu.tsx:40`                        | phone menu           | active filter count     | B7    | solid · xs · `accent`                                                                                                    | absolute                                              | tracks (phone)                         |

### `GenreBadge` call sites

`GenreBadge` (`components/GenreBadge.tsx:36`) picks the variant from `kind`: track is `solid`,
discogs-genre `surface` and discogs-style `outline`. An unreconciled track genre (no slug) is
`subtle` and plain text. A badge with a slug is a **link** (underline on hover, focus ring).
The callers pass the palette, so one component gives five looks.

| Site                                                                   | Kind                  | Props                                | Group                                  | Pages            |
| ---------------------------------------------------------------------- | --------------------- | ------------------------------------ | -------------------------------------- | ---------------- |
| `components/TrackResult.tsx:385` (`GenreList`, rows)                   | track or discogs      | `status.genre`, subtle               | B1                                     | tracks, playlist |
| `components/TrackResult.tsx:1488` (`GenreBadgeRow`, cards)             | track or discogs      | `status.genre`, subtle, xs→sm        | B1                                     | tracks           |
| `components/RelatedTrackRows.tsx:123`                                  | track or discogs      | `status.genre`, subtle               | B1                                     | track            |
| `components/track-detail/TrackGenresSection.tsx:67`                    | track                 | `status.genre`, subtle               | B1                                     | track            |
| `components/TrackResult.tsx:828` (dense row)                           | discogs-genre         | xs, gray                             | B6                                     | jobs             |
| `components/TrackResult.tsx:834` (dense row)                           | discogs-style         | xs, gray                             | B5                                     | jobs             |
| `components/TrackResult.tsx:840` (dense row)                           | track                 | xs, `accent`, solid                  | B8                                     | jobs             |
| `components/TrackResult.tsx:969` (dense card)                          | discogs-genre         | xs, gray                             | B6                                     | jobs             |
| `components/TrackResult.tsx:975` (dense card)                          | discogs-style         | xs, gray                             | B5                                     | jobs             |
| `components/TrackResult.tsx:981` (dense card)                          | track                 | xs, `accent`, solid                  | B8                                     | jobs             |
| `components/AlbumResult.tsx:165`                                       | discogs-genre         | gray                                 | B6                                     | albums           |
| `components/AlbumResult.tsx:166`                                       | discogs-style         | gray                                 | B5                                     | albums           |
| `components/AlbumResult.tsx:180`                                       | discogs-genre / style | gray, sm                             | B6 (B5 for styles)                     | albums           |
| `components/AlbumResult.tsx:315`                                       | discogs-genre         | gray, sm                             | B6                                     | albums           |
| `components/album-detail/AlbumHeader.tsx:158`                          | discogs-genre         | gray                                 | B6                                     | album            |
| `components/album-detail/AlbumHeader.tsx:163`                          | discogs-style         | gray                                 | B5                                     | album            |
| `components/track-detail/TrackGenresSection.tsx:92`                    | discogs-genre         | gray                                 | B6                                     | track            |
| `components/track-detail/TrackGenresSection.tsx:93`                    | discogs-style         | gray                                 | B5                                     | track            |
| `components/PlaylistStatsPanel.tsx:138` (`CountedGenreBadges`, 6 uses) | all three             | gray, xs or sm, label carries " (N)" | B8 for track; B6 and B5 for the others | playlist         |

### Hand-built look-alikes

Found by reading the components that render small bordered or caps text in `components/home`,
`components/spins`, `components/chores`, `components/player` and their neighbours.

| Site                                       | Component              | Meaning                          | Group | Styling as written                                                                                                                                                                                                                   | Interactive                                     | Pages                           |
| ------------------------------------------ | ---------------------- | -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------- |
| `components/FilterChips.tsx:44`            | `FilterChips` › `Chip` | active filter                    | H1    | `chakra.button`; 2px border (`border.ink` active, `border` inactive); `bg.subtle` active, transparent inactive; label face 12px semibold, 0.04em, uppercase; min-h 44px (phone) / 32px; pl 10px, pr 6/10px; max-w 280px; x icon 14px | toggle / remove; `aria-label="Remove filter …"` | tracks, albums                  |
| `components/GenreFilter.tsx:86`            | `SelectedGenreTags`    | chosen genre                     | H2    | `chakra.button`; 2px `border.ink`; `bg`; label face 11px semibold, uppercase, no tracking; min-h 32px; pl 8px, pr 4px; x icon 12px                                                                                                   | remove                                          | tracks and albums filter modals |
| `components/chores/ChoresCareLog.tsx:119`  | `CareLogEntryCard`     | logged via web / CLI / MCP / API | H3    | `Flex`; 2px border, **style varies** (dotted / solid / dashed / double) in `currentColor`; mono 10px semibold, 0.08em (from the header); caps in the string; h 22px, px 6px; inverted on the just-saved card                         | no                                              | chores, `/chore/history`        |
| `components/home/NowPlayingCard.tsx:107`   | Now playing            | medium                           | H3    | `Text`; 2px `border.ink`; mono 10px semibold, 0.08em; caps in the string; h 20px, px 6px; hidden below md                                                                                                                            | no                                              | home                            |
| `components/home/NewArrivals.tsx:33`       | `Chip`                 | album rating / unrated           | H3    | `Text`; 2px `border.ink`; mono 10px (9px compact) semibold, 0.08em; h 20px (18px compact); px 6px (4px); **ink fill** when unrated; stars announced with `role="img"`                                                                | no                                              | home                            |
| `components/chores/ChoreGroup.tsx:27`      | `SleeveChip`           | sleeve unknown                   | H3    | `Text`; 2px **dashed** `border`; mono 10px, 0.08em, `fg.muted`; h 22px, px 7px; visual "SLEEVE ?" plus visually hidden "Sleeve unknown"                                                                                              | no                                              | chores                          |
| `components/home/NeedsAttention.tsx:94`    | Needs attention        | count                            | H4    | `Text`; 2px `border.ink` (none on phones, where it becomes a 2xl number); mono xs semibold; min-w 48px; **ink fill** for the strong item                                                                                             | part of a link                                  | home                            |
| `components/spins/SpinRecapCharts.tsx:357` | top charts             | rank                             | H4    | `Flex`; 2px `border.ink`; 26×22px; mono 11px semibold; **ink fill** for #1                                                                                                                                                           | part of a link                                  | recap                           |
| `components/chores/LogCareDialog.tsx:86`   | Log care dialog        | +N records                       | H4    | `Flex`; 2px `border.ink`; square (aspect 1) in the thumbnail grid; mono 11px semibold                                                                                                                                                | no                                              | chores                          |
| `components/TrackResult.tsx:172`           | `KeyChip`              | musical key                      | H5    | `Flex`; **1px literal** `border`; `bg.muted`; h 24px, px 2; body face xs, Camelot bold, name `fg.muted`, mixed case; 8px dot coloured by wheel position                                                                              | `title` when the name is hidden                 | tracks, track, album            |
| `components/home/HomeHeader.tsx:70`        | search trigger         | ⌘K hint                          | H6    | `kbd`; 1px `rule`, `border`; mono 11px; h 22px, px 6px                                                                                                                                                                               | no                                              | home                            |
| `components/player/PlaybackOutput.tsx:131` | `OutputTag`            | playing on another output        | H7    | `Text`; no border; mono 10px semibold, 0.08em; 10px speaker icon; caps in the string                                                                                                                                                 | no                                              | mini player (every page)        |
| `components/player/PlayOnPicker.tsx:107`   | Play on picker         | output status                    | H7    | `Text`; no border; mono 10px semibold, 0.08em, `fg.muted`                                                                                                                                                                            | no                                              | Play on dialog                  |
| `components/chores/ChoresCareLog.tsx:115`  | `CareLogEntryCard`     | voided                           | H7    | `Text`; no border; 10px semibold `fg.muted`, mono from the header                                                                                                                                                                    | no                                              | chores                          |

**Looked at and left out** (not badge-like): section-heading ink strips ("NEW ARRIVALS", the
genres page `h2`), the mono table overlines and meta lines (`PlaylistTable`, `AlbumTracklist`,
`/jobs` stat labels, `SectionCard`), dashed empty-state notices (`Notice`, `RecapStatus`,
`SpinDetail`), segmented toggle cells (`LogCareDialog` care types) and the progress bars and
swatches in `recapParts`.

## Variant groups

Every recipe `<Badge>` shares the base from `houseStyle.ts:156`: `--gn-font-label` (the user's
Labels face), weight 500, uppercase, 0.05em, radius 0, nowrap, tabular numerals. The sizes are
**xs** 10px / px 4px / min-h 16px, **sm** 11px / px 6px / min-h 20px (the default) and **md**
12px / px 8px / min-h 24px.

Counts are element sites (a `GenreBadge` call site counts once). Swatches are measured values
for Sleeve light → dark.

### B1 · Status tint · 43 sites

`subtle` + `status.{missing,analysis,genre,success}`: a fill in `status.*.subtle`, text in
`status.*.fg` and a **real 1px border** in `status.*.border`. For example, missing is
`#f5c6c0`/`#9b1c1c`/`#b54a44` in Sleeve light and `#4a1a1a`/`#ff8a86`/`#c4605c` in dark.
Sizes xs (6 sites) and sm. This is the group CLAUDE.md describes.

![B1 in context: Unknown sleeve (B3) beside Never cleaned (B1) on the album page](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B1-status-tint.png?raw=true)

### B2 · Accent tint · 13 sites

`subtle` + `accent`: `accent.subtle` fill (`#f6d9cf`), `accent.fg` text (`#b02a14`) and a 1px
`accent.border`. Library IDs (3 sites) add **bold**. In Sleeve, accent is the same red-orange
family as `status.missing`, so a library ID and a "No identifier" warning sit one shade apart.

![B2: library ID LP-350-B5 on a track row](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B2-accent-tint.png?raw=true)

### B3 · Neutral tint · 6 sites

`subtle` + `neutral`: a 6% ink-over-ground fill, `--gn-ink-muted` text and a 1px `--gn-border`.
Mostly "+N" overflow, plus the context type and sleeve label. Several computed palettes in B1
fall back to it (Key clash, Manual, unknown service state).

![B3: +2 overflow after a genre on a related-track row](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B3-neutral-tint.png?raw=true)

### B4 · Stock-gray tint · 6 sites

`subtle` with **no** `colorPalette`, so Chakra's own `gray`: zinc-100 fill `#f4f4f5`, zinc-800
text `#27272a` and the remapped `--gn-border` border. Dark is zinc-900 / zinc-200. It doesn't
follow the palette; it is near-identical to B3 but cold.

![B4: key counts in the playlist stats panel](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B4-stock-gray-tint.png?raw=true)

### B5 · Outline · 23 sites

`outline`: no fill and **no border**. A 1px _inset box-shadow_ in `colorPalette.border` draws
the ring, so its box is 2px smaller than a B1 badge's at the same size. The text is
`colorPalette.fg`: zinc-800 for gray (21 sites), `--gn-ink-muted` for neutral (1) and
`status.analysis.fg` (1). It is used for Discogs styles, file paths, era/country, BPM/key and
counts.

![B5: Discogs styles Jazz-Rock, Prog Rock (outline) after genres Jazz, Rock (surface)](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B5-outline.png?raw=true)

### B6 · Surface · 9 sites

`surface` (the Chakra default; houseStyle doesn't override it): a zinc-100 fill and a 1px
**inset** ring in zinc-200 (`gray.muted`), so the ring almost vanishes on the cream ground. It
is used for Discogs genres, the album-spin track lines and `GenreLinkList` (md, dead code).

![B6: Discogs genres Rock, Latin on an album row](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B6-surface.png?raw=true)

### B7 · Solid accent dot · 2 sites

`solid` xs `accent`: `accent.solid` fill, `accent.contrast` text, no border, absolutely placed
at the top-right of the phone kebab. The only notification-style count.

![B7: active filter count on the phone menu](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B7-solid-accent-dot.png?raw=true)

### B8 · Solid genre fill · 3 sites

`GenreBadge kind="track"` keeps its `solid` variant where the caller doesn't override it. With
`accent` (dense rows on `/jobs`) it is an accent fill; with no palette (playlist stats) it is
Chakra's `gray.solid`: **zinc-900 with white text in light, white with zinc-950 text in dark**.
It is the heaviest badge in the app and is used for the least urgent content.

![B8: track genres in the playlist stats panel, solid near-black](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B8-solid-genre-fill.png?raw=true)

### B9 · Solid status, falls back to gray · 4 sites · bug

`solid` + `status.*`. The palette defines no `solid`/`contrast`, so they inherit the ancestor's
`gray`, and the result is the B8 near-black chip whatever the status. `accent` (one value of
the jobs downloader map) fills correctly, so the same badge is red for one job and black for the
next. None of these occur on the seeded stack (no Redis jobs, no paused queue, no update
available), so this crop is from Storybook.

![B9 (Storybook): Paused, Update available and Unsaved changes all render the same](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B9-solid-status-storybook.png?raw=true)

### B10 · Medium tag · 1 site

`SpinMediumChip`: Badge xs `neutral` plus a 2px `border.ink` from its props. VINYL is `solid`
(an ink fill with ground text); DIGITAL is `outline`, so it carries **both** the 2px border and
the variant's 1px inset ring, a visible double outline.

![B10: DIGITAL medium on a spin row, showing the double outline](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/B10-medium-tag.png?raw=true)

### T1 · Removable Tag · 1 site

Chakra `Tag.Root` surface lg. No recipe reaches it: the **body** face, 14px label, **mixed
case**, stock-gray surface fill with an inset zinc ring, min-h 24px, and a close button.
It is the only element in the app that removes a genre with Chakra's own close trigger.

![T1: GenrePicker tags on the track edit page](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/T1-removable-tag.png?raw=true)

### H1 · Filter chip · 1 site

The house-style chip: a 2px border (ink when active, palette border when inactive), surface fill
when active, label face 12px semibold, 0.04em, uppercase, 32px tall (44px on phones) and an x.
It is the best-specified chip in the app and is documented in CLAUDE.md.

![H1: Cumbia · 467 filter chip with Clear all](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H1-filter-chip.png?raw=true)

### H2 · Selected-genre chip · 1 site

A near-duplicate of H1: a 2px ink border, ground fill, label face 11px (not 12px) semibold,
uppercase with **no letter spacing**, 32px on phones too (H1 is 44px), and a 12px x (H1's is
14px).

![H2: Cumbia chip in the phone filter modal](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H2-selected-genre-chip.png?raw=true)

### H3 · Mono outline tag · 4 sites

A hand-built 2px outline around mono (Plex) 9–10px semibold with 0.08em tracking, 18–22px tall,
caps written into the string. Values are told apart without colour: the care-log source by
border _style_ (dotted, solid, dashed, double), the rating by an ink fill when unrated, the
sleeve by a dashed muted border.

![H3: VIA API source tag on a care-log card, with SLEEVE ? on the left](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H3-mono-outline-tag.png?raw=true)

![H3: UNRATED and star rating chips in New arrivals](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H3-rating-chip.png?raw=true)

### H4 · Mono count box · 3 sites

A 2px ink box around a mono number; the one that matters is inverted to an ink fill. The sizes
differ (min-w 48px, 26×22px, a square grid cell).

![H4: 91 Tracks missing audio, inverted count box on Home](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H4-mono-count-box.png?raw=true)

### H5 · Key chip · 1 site (used in 4 places)

The only chip with a 1px _literal_ border (`borderWidth="1px"`, not the `rule` token), a
`bg.muted` fill and the **body** face in mixed case, plus a coloured dot. CLAUDE.md says "the key
is never a badge" on track cards. That holds there, but on rows and the album tracklist it is
this chip.

![H5: 11B A major key chip on an album tracklist row](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H5-key-chip.png?raw=true)

### H6 · Keyboard hint · 1 site

A 1px `rule` border, mono 11px, 22px tall, no fill.

![H6: ⌘K hint in the Home search trigger](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H6-keyboard-hint.png?raw=true)

### H7 · Unboxed mono caps · 3 sites

No box at all: mono 10px semibold, 0.08em, caps in the string, used as a status or source tag
(ON LOUNGE / AIRPLAY in the mini player, an output status, VOIDED). The output tag needs a
server player, which the seed doesn't have, so this crop is from Storybook.

![H7 (Storybook): output tag, output status and VOIDED](https://github.com/Public-Vinyl-Radio/groovenet/blob/pr-assets/957/H7-unboxed-mono-caps-storybook.png?raw=true)

## Near-duplicates and conflicts

### Near-duplicates (differ by 1–2px, a colour or casing)

| Pair                                              | The difference                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| B3 neutral tint ↔ B4 stock-gray tint              | Only the fill and text colour (palette ink vs zinc). The same job: plain or count badge                |
| B4 ↔ B6                                           | Same zinc fill; B4 has a real 1px palette border, B6 a pale inset ring                                 |
| B5 outline ↔ B1/B2 subtle                         | The same 1px ring, but B5 draws it with an inset shadow (no layout box) and has no fill                |
| H1 filter chip ↔ H2 selected-genre chip           | 12px vs 11px, 0.04em vs no tracking, 44px vs 32px phone target, 14px vs 12px x, surface vs ground fill |
| H3 tags among themselves                          | 18, 20 or 22px tall; px 4, 6 or 7px; 9 or 10px text                                                    |
| H4 boxes among themselves                         | Three box sizes for one pattern                                                                        |
| Score badge: dense xs `94%` ↔ row/card sm `94.2%` | Size and decimal places differ for the same number                                                     |
| `PlaylistStatsPanel.tsx:276` ↔ `:392`             | The same key-count badge, 12px in one and 11px in the other                                            |
| B10 `SpinMediumChip` ↔ H3 Now playing medium      | 16px tall label-face Badge ↔ 20px mono hand-built tag; the same two words                              |

### Conflicts: the same meaning, different looks

| Meaning                            | Looks                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genre (track)                      | B1 purple tint (rows, cards, track page) · B8 accent solid (dense) · B8 gray solid (stats)                                                                  |
| Genre (Discogs)                    | B6 gray surface (genre) · B5 gray outline (style), which also stands in for "kind"                                                                          |
| Genre chosen in a filter or editor | H1 filter chip · H2 selected-genre chip · T1 Chakra Tag (body face, mixed case)                                                                             |
| Medium                             | B10 Badge (`/spins`) · H3 hand-built (Home)                                                                                                                 |
| Sleeve unknown                     | B3 "Unknown sleeve" (album care panel) · H3 dashed "SLEEVE ?" (Chores)                                                                                      |
| "+N more"                          | B3 neutral Badge (rows, cards) · H4 mono ink box (Log care)                                                                                                 |
| A count                            | B1 purple "3 playlists" · B2 "12 saved" · B5 "3 skipped", "4 tracks" · B4 log count · B7 accent dot · H4 ink box                                            |
| Status of a job, service or check  | B1 subtle (jobs state, services, gamdl) · B9 solid (paused, update available, downloader) · H7 unboxed (output status, VOIDED)                              |
| Library ID                         | B2 bold accent Badge (rows, album cards, track header) · plain label-face `accent.fg` text on track cards (`TrackResult.tsx:1389`, by design per CLAUDE.md) |
| Key                                | H5 key chip (rows, tracklist) · B5 outline "8A" (embedding section) · B2 accent "8A" (similar vibe, dead) · B4 "D minor (2)" (stats)                        |
| BPM                                | B1 "No BPM" · B5 "112 BPM" (embedding) · B1 purple "112 BPM" (similar vibe, dead)                                                                           |
| Source / provenance                | H3 border styles (care log) · B1 purple Auto / B3 Manual (spins) · B2/B1 Identity / Vibe (recommendations)                                                  |
| Emptiness                          | B5 badge "No genres yet" · plain text "None" / "No genre tags" (playlist stats)                                                                             |

### Conflicts: the same look, different meanings

| Look                         | Meanings it carries                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| B1 `status.genre` purple     | genre · playlist count · sort move · automatic spin · era filter · BPM · "Music Identity" · "Identity + Vibe" |
| B1 `status.success` green    | similarity > 90 · key compatible · full album · cover found · service up · valid / found / success            |
| B2 accent                    | library ID · playlist position · counts · embedding kind · job _Waiting_ · distance _Similar_ · key           |
| B5 gray outline              | Discogs style · file path · job queue · era · BPM · "Default" copy · custom genre · counts                    |
| B9 near-black solid          | paused · update available · unsaved changes · downloader, and B8's track genres                               |
| Ink-filled mono box (H3, H4) | unrated · top rank · the most urgent attention count · the just-saved care log header                         |

### Other inconsistencies

- **Type roles.** Recipe badges, H1 and H2 use the **label** face; H3, H4, H6 and H7 hard-code
  **mono**; T1 and H5 use **body**. Changing Settings → Typography → Labels restyles B1–B10 and
  the filter chips, but not the chores, home or player tags.
- **Casing.** The recipe uppercases with CSS, so the DOM text stays mixed case (Waiting,
  Never cleaned). The hand-built tags write capitals into the string ("VIA CLI", "UNRATED"),
  which screen readers spell or shout. T1 and H5 are mixed case.
- **Border mechanics.** There are three ways to draw a ring: a real 1px border (subtle), a 1px
  inset shadow (outline, surface) and a 2px border (hand-built). They give 1–2px differences in
  height and inner padding for the same visual weight.
- **Height.** 16px (xs), 18, 20 (sm), 22, 24 (md, key chip), 32 and 44px (chips).
- **Interactivity.** `GenreBadge` links and `TrackPlaylistUsage` (a `<button>` drawn as a B1
  badge) look exactly like static badges. Only an underline on hover tells them apart.
- **Undefined tokens fail silently.** B9 is the case CLAUDE.md warns about ("an undefined
  [token] compiles to an invalid value the browser drops"), here for `colorPalette.solid` on
  `status.*`. `surface` and `outline` with `status.*` would hit the same gap for `muted`.

### Bugs found, not fixed

1. **B9:** `variant="solid"` with `status.*` renders gray, not the status colour, at
   `jobs/page.tsx:474`, `EmbeddingQueueSection.tsx:149`, `AboutSection.tsx:95` and
   `PlaylistViewer.tsx:461`.
2. **B10:** the DIGITAL medium chip draws a 2px border and a 1px inset ring together.
3. **Palette leak:** 38 sites (B4, B6, T1, the gray part of B5 and B8) render Chakra's
   zinc rather than the active palette.
4. **Dead code:** `SimilarTracks.tsx`, `SimilarVibeTracks.tsx` and `genres/GenreLinkList.tsx`
   are only imported by tests.

There were no contrast failures: every measured pair passes AA in all four palettes and both
modes.

## Proposal: roles to consolidate into

> **Suggestion only.** A first cut to start the conversation, not a decision. Names, colours and
> sizes are for the designer.

| Role                | What it is for                                                                             | Suggested look                                                                                                                                                          | Replaces                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Status**          | A state the user may need to act on: missing data, failed, paused, healthy                 | The B1 recipe (subtle tint, 1px status border, label caps); `status.*` and `neutral` only; never solid                                                                  | B1 (status uses), B9, the status part of H7 (output status, VOIDED), the job states now in accent |
| **Category**        | What something _is_: genre, style, embedding kind                                          | One look for every genre, told apart by kind with a border style rather than a palette (for example solid = taxonomy, dashed = unreconciled); a link when it has a slug | B8, B6, B5 Discogs styles, the B1 genre uses, `status.genre` on non-genre content                 |
| **Metadata**        | A value: library ID, key, BPM, era, position, file path, counts with a noun                | Outline, no fill, the mono or label face (to decide); the library ID keeps bold                                                                                         | B2 (except selection), B5 (non-genre), B4, H5 (the key chip could become this role with its dot)  |
| **Source / medium** | Where something came from or plays on: vinyl/digital, web/CLI/MCP/API, auto/manual, output | H3: a mono 2px outline with the value carried by border style or an ink fill, so it reads without colour                                                                | B10, H3, OutputTag (H7), spin provenance (B1/B3)                                                  |
| **Count**           | A bare number: +N overflow, active filters, attention counts, ranks, tab counts            | One small box, with neutral and inverted (ink fill) states and a solid accent dot for notifications                                                                     | B3 (+N), B7, H4, the B4 log count                                                                 |
| **Filter chip**     | Interactive and removable                                                                  | H1 as the single spec, with H2 and T1 folded in                                                                                                                         | H1, H2, T1                                                                                        |

H6 (⌘K) is a keyboard hint rather than a badge; it could stay as is or become `Kbd`.

### Open questions for the designer

1. Should status ever be **solid**? If yes, `status.*` needs `solid`/`contrast` tokens in every
   palette, and `palettes.test.ts` must check them. If no, B9 becomes subtle.
2. Should every badge follow the **Labels** font choice, or should tags be fixed **mono** like
   IDs? Today it is split down the middle.
3. Should the casing be **CSS uppercase** (recipe) or **literal** (hand-built)? CSS keeps screen
   readers reading words; literal caps survive copy-paste.
4. What is the one **ring**: a 1px border, 2px border or inset shadow? And the one **height** at
   each density?
5. Should the **Discogs genre vs style** distinction stay visible on the badge, or move to its
   label or position?
6. Should `accent` stay reserved for the library ID and primary actions, per CLAUDE.md's "one
   accent"? That would move counts, _Waiting_ and _Similar_ elsewhere.
7. Should the **key** be a badge on rows (H5) when the card says it never is?
8. Should a **linked** badge (genre, playlist count) look different from a static one before
   hover?
9. Should the dead `SimilarTracks`/`SimilarVibeTracks`/`GenreLinkList` be removed before the
   migration, rather than migrated?

Follow-up issues for the redesign and migration are for the owner to file.
