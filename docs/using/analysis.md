---
title: Audio analysis
description: Where a track's BPM, key and mood come from, and what to do when the analysis is unsure.
sidebar:
  order: 9
---

BPM, key and danceability aren't copied from Discogs or a streaming service. GrooveNet measures them from the track's own audio, using [Essentia](https://essentia.upf.edu/), an open-source audio analysis library that runs as a service in your stack. A track with no audio has no analysis, which is why a streaming match alone leaves BPM and key empty. See [Downloads and local audio](/docs/using/downloads/).

## What is measured

- **BPM**, rounded to a whole number.
- **Key**, shown on the track with its Camelot code.
- **Danceability**.
- **Mood**: how happy, sad, relaxed and aggressive the track sounds, as scores.
- **Duration**, from the audio file.

BPM, key, mood and danceability also feed the [audio-vibe similarity](/docs/using/similar-tracks/) and the playlist optimiser, so a wrong BPM or key can move a track to the wrong place in a set.

Analysis runs on its own after a download finishes, or straight away when you upload a file. The raw Essentia output for a track is saved; **Track debug** shows it.

## Confidence

Analysis is an estimate, and GrooveNet keeps a confidence for BPM and for key.

**Key confidence** is how strongly Essentia backed the key it picked. Essentia estimates the key three ways (the Krumhansl, Temperley and EDMA profiles). If two or more agree, that key wins and its confidence is the average of the ones that agree. If all three differ, the most confident estimate wins.

**BPM confidence** is how clearly one tempo beat the next-best candidate. It reads low when two tempos are close, such as a track that feels like both 96 and 103, or when the beats are spread across many tempos. A busy, syncopated track can still score well if nothing competes.

Both are shown as a percentage. Under **60%** for key, or **10%** for BPM, the track is flagged:

- On a track card, a marker beside the value opens a note. Below the line it reads "Uncertain key — Essentia's estimate is only N% confident. Worth a listen before trusting it." Above it, the note just gives the confidence.
- On the track's edit page, the field shows an **Uncertain key** or **Uncertain BPM** badge with the percentage.

Tracks analysed before confidence was recorded show nothing, rather than a confident badge.

## What to do about a low-confidence value

1. **Listen.** The flag means "check this", not "this is wrong". Many flagged tracks are right.
2. **Correct it.** Open **Edit track** and change the BPM or key. Your edit is what the optimiser and filters use from then on.
3. **Watch for half and double time.** A BPM at half or twice the tempo you'd count is a common miss.
4. **Re-analyse.** If the audio was wrong (a short preview, or the wrong version), replace it with **Fetch audio** or **Upload audio** from the track's actions and the analysis runs again.

Use the **BPM/key** missing filter on **Tracks** to find tracks with no BPM or key at all.

## Key disagreements

Essentia also guesses a key from the track's chords. When that disagrees with the key GrooveNet chose, or when one of the three estimates disagrees with the winner, the server writes a warning to its log. The app doesn't show these disagreements on the track, so the confidence value and your own ears are the signals to go by.
