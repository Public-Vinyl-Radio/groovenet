/**
 * Audio Engine for DJ Transition Tester
 * Manages dual-deck audio playback with Web Audio API
 */
import { httpArrayBuffer } from "@/services/http";

export interface DeckState {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  playbackRate: number;
  isPlaying: boolean;
  startTime: number;
  pauseTime: number;
}

export class AudioEngine {
  private context: AudioContext;
  private deckA: DeckState;
  private deckB: DeckState;
  private masterGain: GainNode;

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    // Initialize decks
    this.deckA = this.createDeck();
    this.deckB = this.createDeck();
  }

  private createDeck(): DeckState {
    const gainNode = this.context.createGain();
    gainNode.connect(this.masterGain);

    return {
      buffer: null,
      source: null,
      gainNode,
      playbackRate: 1.0,
      isPlaying: false,
      startTime: 0,
      pauseTime: 0,
    };
  }

  private getDeck(deck: "A" | "B"): DeckState {
    return deck === "A" ? this.deckA : this.deckB;
  }

  /**
   * Load audio file into a deck
   */
  async loadTrack(deck: "A" | "B", audioUrl: string): Promise<void> {
    try {
      const arrayBuffer = await httpArrayBuffer(audioUrl);
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

      const deckState = this.getDeck(deck);

      // Stop existing source if playing
      if (deckState.source) {
        deckState.source.stop();
        deckState.source.disconnect();
      }

      deckState.buffer = audioBuffer;
      deckState.isPlaying = false;
      deckState.startTime = 0;
      deckState.pauseTime = 0;
    } catch (error) {
      console.error(`Error loading track for deck ${deck}:`, error);
      throw error;
    }
  }

  /**
   * Play a deck from current position
   */
  play(deck: "A" | "B"): void {
    const deckState = this.getDeck(deck);

    if (!deckState.buffer) {
      console.warn(`No buffer loaded for deck ${deck}`);
      return;
    }

    if (deckState.isPlaying) {
      return;
    }

    // Create new source
    const source = this.context.createBufferSource();
    source.buffer = deckState.buffer;
    source.playbackRate.value = deckState.playbackRate;
    source.connect(deckState.gainNode);

    // Calculate offset based on pause time
    const offset = deckState.pauseTime;
    deckState.startTime = this.context.currentTime - offset;

    source.start(0, offset);
    deckState.source = source;
    deckState.isPlaying = true;

    // Handle ended event
    source.onended = () => {
      if (deckState.isPlaying) {
        deckState.isPlaying = false;
        deckState.pauseTime = 0;
      }
    };
  }

  /**
   * Pause a deck
   */
  pause(deck: "A" | "B"): void {
    const deckState = this.getDeck(deck);

    if (!deckState.isPlaying || !deckState.source) {
      return;
    }

    // Calculate current position
    const elapsed = this.context.currentTime - deckState.startTime;
    deckState.pauseTime = elapsed;

    deckState.source.stop();
    deckState.source.disconnect();
    deckState.source = null;
    deckState.isPlaying = false;
  }

  /**
   * Stop a deck and reset to beginning
   */
  stop(deck: "A" | "B"): void {
    const deckState = this.getDeck(deck);

    if (deckState.source) {
      deckState.source.stop();
      deckState.source.disconnect();
      deckState.source = null;
    }

    deckState.isPlaying = false;
    deckState.pauseTime = 0;
    deckState.startTime = 0;
  }

  /**
   * Set volume for a deck (0-1)
   */
  setVolume(deck: "A" | "B", volume: number): void {
    const deckState = this.getDeck(deck);
    deckState.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set crossfader position (0 = full A, 1 = full B)
   */
  setCrossfade(position: number): void {
    const normalized = Math.max(0, Math.min(1, position));

    // Constant power crossfade (smoother than linear)
    const aDegree = (normalized * Math.PI) / 2;
    const bDegree = ((1 - normalized) * Math.PI) / 2;

    this.deckA.gainNode.gain.value = Math.cos(aDegree);
    this.deckB.gainNode.gain.value = Math.cos(bDegree);
  }

  /**
   * Set playback rate (pitch/tempo)
   */
  setPlaybackRate(deck: "A" | "B", rate: number): void {
    const deckState = this.getDeck(deck);
    deckState.playbackRate = Math.max(0.5, Math.min(2.0, rate));

    if (deckState.source) {
      deckState.source.playbackRate.value = deckState.playbackRate;
    }
  }

  /**
   * Get current playback position in seconds
   */
  getCurrentTime(deck: "A" | "B"): number {
    const deckState = this.getDeck(deck);

    if (deckState.isPlaying) {
      return this.context.currentTime - deckState.startTime;
    }

    return deckState.pauseTime;
  }

  /**
   * Get deck duration in seconds
   */
  getDuration(deck: "A" | "B"): number {
    const deckState = this.getDeck(deck);
    return deckState.buffer?.duration || 0;
  }

  /**
   * Seek to specific time in seconds
   */
  seek(deck: "A" | "B", time: number): void {
    const deckState = this.getDeck(deck);
    const wasPlaying = deckState.isPlaying;

    if (wasPlaying) {
      this.pause(deck);
    }

    deckState.pauseTime = Math.max(0, Math.min(time, this.getDuration(deck)));

    if (wasPlaying) {
      this.play(deck);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop("A");
    this.stop("B");

    this.deckA.gainNode.disconnect();
    this.deckB.gainNode.disconnect();
    this.masterGain.disconnect();

    if (this.context.state !== "closed") {
      this.context.close();
    }
  }
}
