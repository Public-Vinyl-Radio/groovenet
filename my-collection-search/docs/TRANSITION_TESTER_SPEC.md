# DJ Transition Tester - Implementation Spec

## Overview

Build a dual-deck audio player for testing track transitions in playlists, similar to Logic Pro X's interface.

## Features

### MVP (Phase 1) - 1-2 days

- [x] Dual audio player (Deck A + Deck B)
- [x] Load two consecutive tracks from playlist
- [x] Play/pause controls per deck
- [x] Volume sliders per deck
- [x] Crossfader (master mix control)
- [x] Sync playback positions
- [x] BPM display

### Phase 2 - Add Visualization (1 day)

- [ ] Waveform display for both tracks
- [ ] Playhead position indicator
- [ ] Zoom in/out on waveform
- [ ] Click waveform to seek

### Phase 3 - Advanced Controls (1-2 days)

- [ ] Pitch/tempo slider per deck
- [ ] BPM sync button (auto-match tempo)
- [ ] Key detection and harmonic mixing indicator
- [ ] Cue points (set/jump to position)

### Phase 4 - Polish (1-2 days)

- [ ] Logic X-style dark theme
- [ ] Keyboard shortcuts
- [ ] Save transition points
- [ ] Export transition as audio snippet
- [ ] Integration with playlist editor

## Tech Stack

### Core Audio

- **Web Audio API** - Playback, volume, routing
- **Tone.js** (optional) - Advanced pitch/tempo control
- **Wavesurfer.js** - Waveform visualization

### UI

- **Chakra UI** - Sliders, buttons, layout
- **React hooks** - State management
- **Framer Motion** - Smooth animations

### Data

- Fetch track audio from `/audio/{track_id}.m4a`
- Use existing track metadata (BPM, key, duration)
- Load from playlist context

## Component Structure

```
<TransitionTester>
  ├── <DeckA>
  │   ├── <Waveform>
  │   ├── <TransportControls>
  │   ├── <VolumeSlider>
  │   └── <PitchControl>
  ├── <Crossfader>
  ├── <DeckB>
  │   ├── <Waveform>
  │   ├── <TransportControls>
  │   ├── <VolumeSlider>
  │   └── <PitchControl>
  └── <MasterControls>
      ├── <SyncButton>
      └── <BPMDisplay>
```

## File Organization

```
src/
├── components/
│   └── TransitionTester/
│       ├── TransitionTester.tsx          # Main container
│       ├── Deck.tsx                      # Single deck component
│       ├── Waveform.tsx                  # Waveform visualization
│       ├── Crossfader.tsx                # Master crossfade
│       ├── TransportControls.tsx         # Play/pause/cue
│       └── PitchControl.tsx              # Tempo/pitch slider
├── hooks/
│   ├── useAudioPlayer.ts                 # Web Audio API hook
│   ├── useWaveform.ts                    # Waveform generation
│   └── useCrossfader.ts                  # Crossfade logic
└── lib/
    └── audio/
        ├── audioEngine.ts                # Web Audio setup
        ├── bpmSync.ts                    # BPM matching logic
        └── waveformGenerator.ts          # Audio analysis
```

## Key Implementation Details

### 1. Web Audio API Setup

```typescript
// lib/audio/audioEngine.ts
class AudioEngine {
  context: AudioContext;
  deckA: {
    source: AudioBufferSourceNode | null;
    gainNode: GainNode;
    playbackRate: number;
  };
  deckB: {
    source: AudioBufferSourceNode | null;
    gainNode: GainNode;
    playbackRate: number;
  };
  crossfader: GainNode;

  constructor() {
    this.context = new AudioContext();

    // Deck A chain: source -> gain -> crossfader -> destination
    this.deckA = {
      source: null,
      gainNode: this.context.createGain(),
      playbackRate: 1.0,
    };

    // Deck B chain: source -> gain -> crossfader -> destination
    this.deckB = {
      source: null,
      gainNode: this.context.createGain(),
      playbackRate: 1.0,
    };

    // Connect nodes
    this.deckA.gainNode.connect(this.context.destination);
    this.deckB.gainNode.connect(this.context.destination);
  }

  async loadTrack(deck: "A" | "B", audioUrl: string) {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

    const deckRef = deck === "A" ? this.deckA : this.deckB;

    // Stop existing source
    if (deckRef.source) {
      deckRef.source.stop();
    }

    // Create new source
    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = deckRef.playbackRate;
    source.connect(deckRef.gainNode);

    deckRef.source = source;
    return audioBuffer;
  }

  play(deck: "A" | "B") {
    const deckRef = deck === "A" ? this.deckA : this.deckB;
    if (deckRef.source) {
      deckRef.source.start(0);
    }
  }

  setVolume(deck: "A" | "B", volume: number) {
    const deckRef = deck === "A" ? this.deckA : this.deckB;
    deckRef.gainNode.gain.value = volume;
  }

  setPitch(deck: "A" | "B", rate: number) {
    const deckRef = deck === "A" ? this.deckA : this.deckB;
    if (deckRef.source) {
      deckRef.source.playbackRate.value = rate;
    }
  }

  setCrossfade(position: number) {
    // 0 = full Deck A, 1 = full Deck B
    this.deckA.gainNode.gain.value = 1 - position;
    this.deckB.gainNode.gain.value = position;
  }
}
```

### 2. BPM Sync Logic

```typescript
// lib/audio/bpmSync.ts
export function calculatePlaybackRate(sourceBPM: number, targetBPM: number): number {
  return targetBPM / sourceBPM;
}

export function syncTracks(
  trackA: { bpm: number },
  trackB: { bpm: number },
  masterDeck: "A" | "B",
): { deckARate: number; deckBRate: number } {
  if (masterDeck === "A") {
    return {
      deckARate: 1.0,
      deckBRate: calculatePlaybackRate(trackB.bpm, trackA.bpm),
    };
  } else {
    return {
      deckARate: calculatePlaybackRate(trackA.bpm, trackB.bpm),
      deckBRate: 1.0,
    };
  }
}
```

### 3. React Hook for Audio Player

```typescript
// hooks/useAudioPlayer.ts
import { useRef, useState, useCallback } from "react";
import { AudioEngine } from "@/lib/audio/audioEngine";

export function useAudioPlayer() {
  const engineRef = useRef<AudioEngine | null>(null);
  const [deckAVolume, setDeckAVolume] = useState(1.0);
  const [deckBVolume, setDeckBVolume] = useState(1.0);
  const [crossfade, setCrossfade] = useState(0.5);
  const [isPlaying, setIsPlaying] = useState({ A: false, B: false });

  const initEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
    }
  }, []);

  const loadTrack = useCallback(
    async (deck: "A" | "B", trackId: string) => {
      initEngine();
      const audioUrl = `/api/tracks/${trackId}/audio`; // or direct file path
      await engineRef.current!.loadTrack(deck, audioUrl);
    },
    [initEngine],
  );

  const play = useCallback((deck: "A" | "B") => {
    engineRef.current?.play(deck);
    setIsPlaying((prev) => ({ ...prev, [deck]: true }));
  }, []);

  const pause = useCallback((deck: "A" | "B") => {
    // Would need to implement pause/resume logic
    setIsPlaying((prev) => ({ ...prev, [deck]: false }));
  }, []);

  const setVolume = useCallback((deck: "A" | "B", volume: number) => {
    engineRef.current?.setVolume(deck, volume);
    if (deck === "A") setDeckAVolume(volume);
    else setDeckBVolume(volume);
  }, []);

  const handleCrossfade = useCallback((position: number) => {
    engineRef.current?.setCrossfade(position);
    setCrossfade(position);
  }, []);

  return {
    loadTrack,
    play,
    pause,
    setVolume,
    handleCrossfade,
    deckAVolume,
    deckBVolume,
    crossfade,
    isPlaying,
  };
}
```

### 4. Basic Component Example

```tsx
// components/TransitionTester/TransitionTester.tsx
import { Box, VStack, HStack, Slider, Button, Text } from "@chakra-ui/react";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useEffect } from "react";

interface Props {
  trackA: Track;
  trackB: Track;
}

export function TransitionTester({ trackA, trackB }: Props) {
  const {
    loadTrack,
    play,
    pause,
    setVolume,
    handleCrossfade,
    deckAVolume,
    deckBVolume,
    crossfade,
    isPlaying,
  } = useAudioPlayer();

  useEffect(() => {
    loadTrack("A", trackA.track_id);
    loadTrack("B", trackB.track_id);
  }, [trackA, trackB, loadTrack]);

  return (
    <VStack spacing={8} p={6} bg="gray.900" borderRadius="lg">
      {/* Deck A */}
      <Box w="full" bg="gray.800" p={4} borderRadius="md">
        <Text color="white" mb={2}>
          {trackA.title} - {trackA.artist}
        </Text>
        <Text color="gray.400" fontSize="sm">
          {trackA.bpm} BPM
        </Text>
        <HStack mt={4}>
          <Button onClick={() => play("A")} disabled={isPlaying.A}>
            Play
          </Button>
          <Button onClick={() => pause("A")} disabled={!isPlaying.A}>
            Pause
          </Button>
        </HStack>
        <Box mt={4}>
          <Text color="white" fontSize="sm">
            Volume
          </Text>
          <Slider
            value={deckAVolume}
            onChange={(v) => setVolume("A", v)}
            min={0}
            max={1}
            step={0.01}
          />
        </Box>
      </Box>

      {/* Crossfader */}
      <Box w="full">
        <Text color="white" fontSize="sm" textAlign="center">
          Crossfader
        </Text>
        <Slider value={crossfade} onChange={handleCrossfade} min={0} max={1} step={0.01} />
      </Box>

      {/* Deck B */}
      <Box w="full" bg="gray.800" p={4} borderRadius="md">
        <Text color="white" mb={2}>
          {trackB.title} - {trackB.artist}
        </Text>
        <Text color="gray.400" fontSize="sm">
          {trackB.bpm} BPM
        </Text>
        <HStack mt={4}>
          <Button onClick={() => play("B")} disabled={isPlaying.B}>
            Play
          </Button>
          <Button onClick={() => pause("B")} disabled={!isPlaying.B}>
            Pause
          </Button>
        </HStack>
        <Box mt={4}>
          <Text color="white" fontSize="sm">
            Volume
          </Text>
          <Slider
            value={deckBVolume}
            onChange={(v) => setVolume("B", v)}
            min={0}
            max={1}
            step={0.01}
          />
        </Box>
      </Box>
    </VStack>
  );
}
```

## Waveform Visualization (Phase 2)

Use **wavesurfer.js**:

```bash
npm install wavesurfer.js
```

```typescript
// components/TransitionTester/Waveform.tsx
import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

export function Waveform({ audioUrl }: { audioUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4FD1C5',
      progressColor: '#319795',
      height: 128,
      barWidth: 2,
      responsive: true,
    });

    wavesurfer.load(audioUrl);
    wavesurferRef.current = wavesurfer;

    return () => wavesurfer.destroy();
  }, [audioUrl]);

  return <div ref={containerRef} />;
}
```

## Advanced: Pitch Shifting (Phase 3)

For **independent pitch/tempo control** (change pitch without changing tempo), use **Tone.js**:

```bash
npm install tone
```

```typescript
import * as Tone from "tone";

const pitchShift = new Tone.PitchShift(2).toDestination();
const player = new Tone.Player(audioUrl).connect(pitchShift);
pitchShift.pitch = 3; // Shift up 3 semitones
```

## Integration Points

### Where to Add in Your App

1. **Playlist viewer** - Add "Test Transitions" button
2. Opens modal/full-page with transition tester
3. Loads current track + next track in playlist
4. Navigate through playlist to test all transitions

### API Endpoint Needed

```typescript
// app/api/tracks/[id]/audio/route.ts
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const audioPath = `/app/audio/${params.id}.m4a`;
  // Stream audio file
  const file = await readFile(audioPath);
  return new Response(file, {
    headers: { "Content-Type": "audio/mp4" },
  });
}
```

## Complexity Verdict

**Doable in 3-5 days** with MVP:

- ✅ Day 1: Basic dual player + volume controls
- ✅ Day 2: Waveform visualization
- ✅ Day 3: Pitch/tempo control + BPM sync
- ✅ Day 4-5: UI polish + integration

**Start with Phase 1** and iterate! The Web Audio API makes this much easier than it sounds.

Want me to build the MVP dual-deck player component to get you started?
