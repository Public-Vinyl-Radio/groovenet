---
title: Finding similar tracks
description: Find records that sound alike, or that share artist, era and genre, and search by describing a sound.
sidebar:
  order: 8
---

GrooveNet has two ways to say two tracks are alike, and they answer different questions.

|            | Identity                                      | Vibe                                                |
| ---------- | --------------------------------------------- | --------------------------------------------------- |
| Asks       | Is it the same kind of record?                | Does it feel the same to play?                      |
| Built from | Genre, style, era, country, labels and tags   | Measured audio: BPM, key, mood, danceability        |
| Needs      | Metadata only                                 | The track's [audio analysed](/docs/using/analysis/) |
| Good for   | Digging for more records in a style or period | Choosing what mixes with what you're playing        |

Identity ignores your DJ notes and function tags on purpose, so it describes the music rather than how you use it. Vibe only exists for tracks that have been analysed, so a track with no audio has no vibe neighbours.

Use identity to find more of something, and vibe to find the next track. When you're building a set you usually want both.

## Search by describing a sound

On **Tracks**, the search mode control has three settings:

- **Keyword** matches the words you type.
- **Semantic** finds tracks by a description of the sound, such as "dusty 70s cumbia with brass", not exact words.
- **Hybrid** matches words and also finds a sound you describe.

Semantic and hybrid search need embeddings for your collection. They're generated in the background; `groovenet embeddings status` shows how many tracks are still missing each kind, and `groovenet embeddings backfill` queues the rest. They are created with OpenAI, so set `OPENAI_API_KEY` in your [integration settings](/docs/configuration/integrations/).

## Genre neighbours

**Include similar** in the Tracks filters widens a genre filter to its closest related genres. See [Genres](/docs/using/genres/#related-genres).

## Suggestions for a playlist

Open a playlist's actions menu and choose **AI recommendations** to see tracks that fit it. Each suggestion is badged **Identity**, **Vibe** or **Identity + Vibe**, depending on which kind of similarity found it. A **This library / All libraries** switch sets whether suggestions come from only your collection or from every collection on the server. You can add a suggestion to the playlist or the queue from its menu.

The playlist ordering tools (**Greedy order**, **Genetic order** and **Cohesive blocks**) are a different thing: they reorder the tracks you already have. See [Playlists and the optimiser](/docs/using/playlists/).

## From the terminal and assistants

```bash
groovenet tracks similar-identity <track-id> --era 1970s
groovenet tracks similar-vibe <track-id> --limit 20
groovenet tracks recommend <track-id>        # identity and vibe together
groovenet tracks search "dusty 70s cumbia with brass" --mode semantic
```

Run `groovenet tracks search --help` for the search options. The MCP server has matching tools: `find_similar_identity`, `find_similar_vibe`, `get_recommendations`, and `search_tracks` with a `mode` of `semantic` or `hybrid`. `generate_ai_playlist` reorders a set of tracks for smooth transitions, as the optimiser does. See the [CLI](/docs/cli/) and [MCP](/docs/mcp/) references.
