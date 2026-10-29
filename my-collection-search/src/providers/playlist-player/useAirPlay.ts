"use client";

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

type WebKitAudioElement = HTMLAudioElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
  disableRemotePlayback?: boolean;
};

type UseAirPlayArgs = {
  audioRef: RefObject<HTMLAudioElement | null>;
  plVersion: number;
};

export function useAirPlay({ audioRef, plVersion }: UseAirPlayArgs) {
  const [isAirPlayAvailable, setIsAirPlayAvailable] = useState(false);
  const [isAirPlayActive, setIsAirPlayActive] = useState(false);

  const showAirPlayPicker = useCallback((): boolean => {
    const audio = audioRef.current as WebKitAudioElement | null;
    if (!audio || typeof audio.webkitShowPlaybackTargetPicker !== "function") {
      return false;
    }
    try {
      audio.webkitShowPlaybackTargetPicker();
      return true;
    } catch {
      return false;
    }
  }, [audioRef]);

  useEffect(() => {
    const audio = audioRef.current as WebKitAudioElement | null;
    if (!audio) return;

    audio.disableRemotePlayback = false;
    audio.setAttribute("x-webkit-airplay", "allow");
    audio.setAttribute("airplay", "allow");

    const hasPicker = typeof audio.webkitShowPlaybackTargetPicker === "function";
    setIsAirPlayAvailable(hasPicker);
    setIsAirPlayActive(Boolean(audio.webkitCurrentPlaybackTargetIsWireless));

    const onAvailabilityChanged = (event: Event) => {
      const availability = (event as Event & { availability?: string }).availability;
      if (availability === "available") {
        setIsAirPlayAvailable(true);
      } else if (availability === "not-available") {
        setIsAirPlayAvailable(false);
      } else {
        setIsAirPlayAvailable(hasPicker);
      }
      setIsAirPlayActive(Boolean(audio.webkitCurrentPlaybackTargetIsWireless));
    };

    audio.addEventListener("webkitplaybacktargetavailabilitychanged", onAvailabilityChanged);
    const onWirelessChanged = () => {
      setIsAirPlayActive(Boolean(audio.webkitCurrentPlaybackTargetIsWireless));
    };
    audio.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWirelessChanged);

    return () => {
      audio.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvailabilityChanged);
      audio.removeEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWirelessChanged);
    };
  }, [audioRef, plVersion]);

  return {
    isAirPlayAvailable,
    isAirPlayActive,
    showAirPlayPicker,
  };
}
