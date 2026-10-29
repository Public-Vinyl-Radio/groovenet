import React from "react";

const noop = () => {};

const stub = {
  isPlaying: false,
  currentTrackIndex: null as number | null,
  currentTrack: null,
  playlist: [] as never[],
  playlistLength: 0,
  seek: noop,
  play: noop,
  pause: noop,
  stop: noop,
  playNext: noop,
  playPrev: noop,
  playTrack: noop,
  replacePlaylist: noop,
  volume: 1,
  setVolume: noop,
  muted: false,
  setMuted: noop,
  currentTime: 0,
  duration: 0,
  airPlayAvailable: false,
  startAirPlay: noop,
};

export function usePlaylistPlayer() {
  return stub;
}

export function usePlaylistPlayerTime() {
  return { currentTime: 0, duration: 0 };
}

export function PlaylistPlayerProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
