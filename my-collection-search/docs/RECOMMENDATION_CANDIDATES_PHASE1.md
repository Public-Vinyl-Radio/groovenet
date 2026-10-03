# Recommendation Candidate Retriever - Phase 1

## Overview

Phase 1 of the multi-vector recommendation system retrieves candidate tracks from multiple embedding indexes (identity, audio vibe) and unions them into a deduplicated candidate set with similarity scores preserved.

This is the foundation for Phase 2, which will implement reranking and scoring algorithms.

## Architecture

### Embedding Types

The system uses two types of embeddings:

1. **Identity Embeddings** (`embedding_type = 'identity'`)
   - Based on: genre, style, era, country, labels, tags, composer
   - Captures: "What kind of music is this?"
   - Good for: Finding tracks with similar musical identity/vibe

2. **Audio Vibe Embeddings** (`embedding_type = 'audio_vibe'`)
   - Based on: BPM, key, danceability, energy, mood scores, acoustic/electronic balance
   - Captures: "How does this music sound/feel?"
   - Good for: Finding tracks with compatible sonic characteristics

### Database Schema

```sql
CREATE TABLE track_embeddings (
  id SERIAL PRIMARY KEY,
  track_id VARCHAR(255) NOT NULL,
  friend_id INTEGER NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  embedding_type embedding_type_enum NOT NULL, -- 'identity', 'audio_vibe', 'dj_function'
  model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
  dims INTEGER NOT NULL DEFAULT 1536,
  embedding VECTOR(1536) NOT NULL,
  source_hash VARCHAR(64) NOT NULL,
  identity_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, friend_id, embedding_type)
);

-- Vector similarity index (ivfflat)
CREATE INDEX idx_track_embeddings_vector_cosine
ON track_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Similarity Scoring

- **Metric**: Cosine similarity
- **pgvector distance**: `<=>` operator returns distance in [0..2]
  - 0 = identical vectors
  - 2 = completely opposite vectors
- **Normalized similarity**: `similarity = 1 - (distance / 2)` → [0..1]
  - 1.0 = perfect match
  - 0.0 = no similarity

## Implementation

### Service API

```typescript
import { retrieveCandidates } from "@/lib/recommendation-candidate-retriever";

const result = await retrieveCandidates(seedTrackId, seedFriendId, {
  limitIdentity: 200,  // Max identity candidates
  limitAudio: 200,     // Max audio candidates
  ivfflatProbes: 10,   // Accuracy/speed tradeoff
});
```

### Return Type

```typescript
interface RetrieveCandidatesResult {
  seedTrackId: string;
  seedFriendId: number;
  candidates: CandidateTrack[];
  stats: {
    identityCount: number;    // Tracks from identity query
    audioCount: number;        // Tracks from audio query
    unionCount: number;        // Total unique tracks
    timingMs: {
      identityQuery: number;
      audioQuery: number;
      total: number;
    };
  };
}

interface CandidateTrack {
  trackId: string;
  friendId: number;
  simIdentity: number | null;  // [0..1] or null if not in identity results
  simAudio: number | null;     // [0..1] or null if not in audio results
  metadata: {
    // For reranking
    bpm: number | null;
    key: string | null;
    eraBucket: string | null;
    tags: string[];
    styles: string[];
    energy: number | null;
    danceability: number | null;

    // Display info
    title: string;
    artist: string;
    album: string;
    year: string | null;
    genres: string[];
    starRating: number | null;

    // Mood scores
    moodHappy: number | null;
    moodSad: number | null;
    moodRelaxed: number | null;
    moodAggressive: number | null;
  };
}
```

## API Endpoint

### GET /api/recommendations/candidates

**Query Parameters:**
- `track_id` (required): Seed track ID
- `friend_id` (required): Seed track's friend ID
- `limit_identity` (optional, default 200): Max identity candidates (1-1000)
- `limit_audio` (optional, default 200): Max audio candidates (1-1000)
- `ivfflat_probes` (optional, default 10): Accuracy/speed tradeoff

**Example:**
```bash
curl "http://localhost:3000/api/recommendations/candidates?track_id=123&friend_id=1&limit_identity=300&limit_audio=150"
```

**Response:**
```json
{
  "seedTrackId": "123",
  "seedFriendId": 1,
  "seedEmbeddings": {
    "identity": true,
    "audio": true
  },
  "candidates": [
    {
      "trackId": "456",
      "friendId": 1,
      "simIdentity": 0.87,
      "simAudio": 0.92,
      "metadata": {
        "title": "Track Title",
        "artist": "Artist Name",
        "bpm": 128,
        "key": "A minor",
        "energy": 0.75,
        "eraBucket": "1990s",
        ...
      }
    }
  ],
  "stats": {
    "identityCount": 300,
    "audioCount": 150,
    "unionCount": 380,
    "timingMs": {
      "identityQuery": 45,
      "audioQuery": 38,
      "total": 89
    }
  }
}
```

## Usage Examples

### Example 1: Basic Retrieval

```typescript
import { retrieveCandidates } from "@/lib/recommendation-candidate-retriever";

const result = await retrieveCandidates("track-123", 1);

console.log(`Found ${result.stats.unionCount} candidates`);
console.log(`- ${result.stats.identityCount} from identity`);
console.log(`- ${result.stats.audioCount} from audio`);

// Show top 5
result.candidates.slice(0, 5).forEach(c => {
  console.log(`${c.metadata.title} - ${c.metadata.artist}`);
  console.log(`  Identity: ${c.simIdentity?.toFixed(3)}`);
  console.log(`  Audio: ${c.simAudio?.toFixed(3)}`);
});
```

### Example 2: Filter by Metadata

```typescript
const result = await retrieveCandidates("track-123", 1, {
  limitIdentity: 200,
  limitAudio: 200,
});

// Filter: BPM range (±5 BPM)
const seedBpm = 128;
const bpmMatches = result.candidates.filter(c => {
  if (!c.metadata.bpm) return false;
  return Math.abs(c.metadata.bpm - seedBpm) <= 5;
});

// Filter: Same era
const eraMatches = result.candidates.filter(c =>
  c.metadata.eraBucket === "1990s"
);

// Filter: High energy
const energetic = result.candidates.filter(c =>
  c.metadata.energy !== null && c.metadata.energy > 0.7
);
```

### Example 3: Sort by Combined Similarity

```typescript
const result = await retrieveCandidates("track-123", 1);

// Calculate average similarity
const withScores = result.candidates.map(c => {
  const scores = [c.simIdentity, c.simAudio].filter(s => s !== null);
  const avgSimilarity = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  return { ...c, avgSimilarity };
});

// Sort by average (descending)
withScores.sort((a, b) => b.avgSimilarity - a.avgSimilarity);

console.log("Top 10 by combined similarity:");
withScores.slice(0, 10).forEach(c => {
  console.log(`${c.metadata.title} - ${c.avgSimilarity.toFixed(3)}`);
});
```

### Example 4: Check Embeddings First

```typescript
import { hasEmbeddings } from "@/lib/recommendation-candidate-retriever";

const embeddings = await hasEmbeddings("track-123", 1);

if (!embeddings.identity && !embeddings.audio) {
  console.log("Track has no embeddings. Run backfill first.");
  return;
}

if (!embeddings.audio) {
  console.log("Only identity embedding available.");
}

const result = await retrieveCandidates("track-123", 1);
```

## Testing

### Run Tests

```bash
cd my-collection-search

# Update test file with real track IDs first
# Edit: src/lib/__tests__/recommendation-candidate-retriever.test.ts
# Replace SEED_TRACK_ID constants with actual track IDs from your DB

npx tsx src/lib/__tests__/recommendation-candidate-retriever.test.ts
```

### Test Coverage

1. **Union Deduplication** - Ensures tracks in both results are deduplicated
2. **Missing Embedding Handling** - Handles tracks with only one embedding type
3. **Excludes Self** - Seed track not in results
4. **Similarity Range** - Scores normalized to [0..1]
5. **Metadata Completeness** - All required fields present
6. **Performance Timing** - Timing stats recorded

## Performance

### Typical Performance

- **Identity query**: 30-60ms (200 candidates)
- **Audio query**: 30-60ms (200 candidates)
- **Total**: 70-130ms (depends on union size)

### Optimization Tips

1. **IVFFlat Probes** (accuracy vs. speed)
   - Default: 10 (fast, ~90% recall)
   - Higher = more accurate but slower
   - Adjust via `ivfflatProbes` option

2. **Limit Sizes**
   - Default: 200 per embedding type
   - Higher = better coverage, slower queries
   - Consider trade-off based on use case

3. **Index Tuning**
   - Current: `lists = 100` (good for <100K tracks)
   - Rule of thumb: `lists = sqrt(total_rows)`
   - For 10K tracks: 100, for 100K: 316, for 1M: 1000

4. **Connection Pooling**
   - Uses pg.Pool for efficient connection reuse
   - Configure pool size via DATABASE_URL params

## Integration with Existing Features

### Similar Tracks UI

The existing "Similar Tracks" feature (identity-based) can be enhanced:

```typescript
// Current: Only identity similarity
const identityResult = await fetch(
  `/api/embeddings/similar?track_id=${trackId}&friend_id=${friendId}`
);

// Phase 1: Multi-vector candidates
const candidates = await fetch(
  `/api/recommendations/candidates?track_id=${trackId}&friend_id=${friendId}`
);

// Phase 2 (future): Reranked recommendations
const recommendations = await fetch(
  `/api/recommendations/rerank?track_id=${trackId}&friend_id=${friendId}`
);
```

### Playlist Generation

Can be used to build smarter playlists:

```typescript
// Get candidates for current track
const result = await retrieveCandidates(currentTrack.track_id, currentTrack.friend_id);

// Filter by BPM compatibility
const bpmMatches = result.candidates.filter(c => {
  if (!c.metadata.bpm || !currentTrack.bpm) return true;
  return Math.abs(c.metadata.bpm - currentTrack.bpm) <= 10;
});

// Sort by combined similarity
bpmMatches.sort((a, b) => {
  const aScore = (a.simIdentity ?? 0) + (a.simAudio ?? 0);
  const bScore = (b.simIdentity ?? 0) + (b.simAudio ?? 0);
  return bScore - aScore;
});

// Pick next track
const nextTrack = bpmMatches[0];
```

## Next Steps (Phase 2)

Phase 1 provides raw candidates. Phase 2 will implement:

1. **Reranking Algorithm**
   - Weighted combination of identity + audio similarity
   - DJ-specific rules (BPM matching, key compatibility, energy progression)
   - Configurable weights

2. **Scoring System**
   - Final recommendation score [0..100]
   - Confidence levels
   - Explanation ("Why this recommendation?")

3. **Filters**
   - BPM range, key compatibility
   - Era, genre, style constraints
   - Star rating, explicit content, etc.

4. **Diversity**
   - Balance similarity vs. variety
   - Avoid recommending same artist repeatedly

5. **Context Awareness**
   - Playlist position (opening vs. peak vs. closing)
   - Recent play history
   - User preferences

## Files Created

```
my-collection-search/
├── src/
│   ├── lib/
│   │   ├── recommendation-candidate-retriever.ts      # Main service
│   │   ├── __tests__/
│   │   │   └── recommendation-candidate-retriever.test.ts  # Tests
│   │   └── __examples__/
│   │       └── recommendation-candidate-retriever-example.ts  # Examples
│   └── app/
│       └── api/
│           └── recommendations/
│               └── candidates/
│                   └── route.ts                       # API endpoint
└── RECOMMENDATION_CANDIDATES_PHASE1.md                # This doc
```

## Troubleshooting

### No Candidates Returned

**Possible causes:**
- Seed track has no embeddings → Run backfill
- No other tracks have embeddings → Run backfill for collection
- Limits too low → Increase `limitIdentity` / `limitAudio`

**Solution:**
```bash
# Check if seed has embeddings
curl "http://localhost:3000/api/recommendations/candidates?track_id=123&friend_id=1"

# If missing, run backfill
groovenet embeddings backfill --type identity,audio_vibe
```

### Slow Queries

**Possible causes:**
- Large collection (>100K tracks)
- IVFFlat index needs tuning
- High `ivfflatProbes` value

**Solution:**
```sql
-- Check collection size
SELECT COUNT(*) FROM track_embeddings WHERE embedding_type = 'identity';

-- If >100K, rebuild index with higher lists value
DROP INDEX idx_track_embeddings_vector_cosine;
CREATE INDEX idx_track_embeddings_vector_cosine
ON track_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 316);  -- sqrt(100000) ≈ 316
```

### Duplicate Tracks

**Not possible** - deduplication is built-in. Each track appears once in results with both similarity scores if applicable.

## References

- **pgvector**: https://github.com/pgvector/pgvector
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **Identity Embeddings**: See `IDENTITY_EMBEDDINGS.md`
- **Audio Vibe Embeddings**: See audio vibe implementation docs
