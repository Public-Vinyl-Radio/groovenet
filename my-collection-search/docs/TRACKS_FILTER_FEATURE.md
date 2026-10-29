# Tracks Filter Feature

## Overview

The tracks page (`/`) now includes a powerful filter modal that allows you to filter tracks by missing data. This is useful for data cleanup, finding tracks that need metadata enrichment, or identifying tracks that need streaming URLs added.

## How to Use

### Opening the Filter Modal

1. Navigate to the tracks page (`/`)
2. Click the **Filter** button (funnel icon) in the toolbar
3. The filter modal will open with checkboxes for various filter options

### Filter Options

#### Missing Data

- **Missing local audio** - Tracks without downloaded audio files (`local_audio_url IS NULL`)
- **Missing metadata** - Tracks missing BPM or Key information (`bpm IS NULL OR key IS NULL`)

#### Missing Streaming URLs

- **Missing all streaming URLs** - Tracks with NO streaming URLs at all (no Apple Music, YouTube, or SoundCloud)
  - When checked, individual URL filters are disabled (this is an "all or nothing" filter)
- **Missing Apple Music URL** - Tracks without Apple Music links
- **Missing YouTube URL** - Tracks without YouTube links
- **Missing SoundCloud URL** - Tracks without SoundCloud links

### Applying Filters

1. Select one or more filter options
2. Click **Apply Filters**
3. The modal closes and results are filtered
4. The filter button shows a blue badge with the count of active filters
5. Results text shows "(X filters active)" next to the result count

### Clearing Filters

**Option 1: Clear All in Modal**

- Open the filter modal
- Click **Clear All** button
- Click **Apply Filters**

**Option 2: Quick Clear**

- Click the filter button (shows active count)
- Click **Clear All**
- Filters are immediately removed

## Visual Indicators

- **Filter button** - Turns blue when filters are active
- **Badge** - Shows count of active filters (appears on filter button)
- **Results text** - Shows "(X filters active)" inline with result count

## Use Cases

### Data Cleanup

```
Filter: Missing metadata
→ Find all tracks that need BPM/Key analysis
→ Bulk analyze or manually add metadata
```

### Audio Download Queue

```
Filter: Missing local audio + Missing all streaming URLs
→ Find tracks that can't be downloaded (no source URLs)
→ Search for and add streaming URLs first
```

### Platform-Specific Gaps

```
Filter: Missing Apple Music URL
→ Find tracks that need Apple Music links
→ Use AI search to find and add URLs
```

### Offline Availability

```
Filter: Missing local audio
→ Find tracks that aren't downloaded yet
→ Queue for download
```

## Technical Details

### Search API Filters

The filters are converted to Search API filter strings:

```typescript
// Missing local audio
"local_audio_url IS NULL";

// Missing metadata
"(bpm IS NULL OR key IS NULL)";

// Missing all streaming URLs
"(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)";

// Individual URL filters (combined with AND)
"apple_music_url IS NULL";
"youtube_url IS NULL";
```

### Filter Combination

Multiple filters are combined with **AND** logic:

- All selected filters must match
- Example: "Missing audio" + "Missing Apple Music URL" = tracks missing BOTH

### Performance

- Filters use Search API's database-backed filtering
- Indexed fields: all URL fields, bpm, key, local_audio_url
- No performance impact on large collections

## Components

### Files Created

- `src/components/TracksFilterModal.tsx` - Filter modal UI
- `src/lib/trackFilters.ts` - Filter utilities and Search API conversion
- `src/components/SearchResults.tsx` - Updated with filter integration

### Key Functions

**buildSearch APIFilters(filters: TracksFilter): string[]**

- Converts filter state to Search API filter strings
- Handles special logic (e.g., "all streaming URLs" disables individual filters)

**createEmptyFilters(): TracksFilter**

- Returns empty filter state
- Used for initialization and clearing

**getActiveFilterCount(filters: TracksFilter): number**

- Returns count of active filters
- Used for badge display

## Future Enhancements

Potential additions:

- **Filter by BPM range** (e.g., 120-130 BPM)
- **Filter by key** (e.g., only tracks in C major)
- **Filter by star rating** (e.g., 4+ stars)
- **Filter by date added** (e.g., last 7 days)
- **Save filter presets** (e.g., "Needs Work", "Ready to Download")
- **URL params** (persist filters in URL for sharing)
- **Combine with text search** (already works - filters + search query)

## Troubleshooting

### Filters not working?

- Check Search API index has filter handling supports requested fields
- Run: `/api/admin/reindex` if needed
- Verify fields exist in database

### No results with filters?

- Try fewer filters (might be too restrictive)
- Check if data actually exists with these missing fields
- Use "Clear All" to reset

### Filter badge not showing?

- Hard refresh the page (Ctrl+F5 / Cmd+Shift+R)
- Check browser console for errors
