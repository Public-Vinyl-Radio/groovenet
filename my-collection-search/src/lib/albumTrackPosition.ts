export type TrackPositionValue = string | number | null | undefined;

export type ParsedTrackPosition = {
  raw: string;
  normalized: string;
  side: string;
  sideLabel: string | null;
  num: number;
  rest: string;
  sortGroup: string;
  sortMajor: number;
  sortMinor: number;
  classification:
    | "side-number"
    | "multi-letter-side"
    | "disc-track"
    | "numeric"
    | "freeform"
    | "empty";
};

export type NormalizedSideGroup<TTrack> = {
  side_key: string;
  side_label: string;
  ordinal: number;
  track_count: number;
  tracks: TTrack[];
};

function parseNormalizedPosition(rawValue: TrackPositionValue): ParsedTrackPosition {
  const raw = String(rawValue ?? "").trim();
  const normalized = raw.toUpperCase();

  if (!normalized) {
    return {
      raw,
      normalized,
      side: "",
      sideLabel: null,
      num: 0,
      rest: "",
      sortGroup: "ZZZ",
      sortMajor: Number.MAX_SAFE_INTEGER,
      sortMinor: Number.MAX_SAFE_INTEGER,
      classification: "empty",
    };
  }

  const simpleSideMatch = normalized.match(/^([A-Z])\s*(\d+)([A-Z]*)$/);
  if (simpleSideMatch) {
    const side = simpleSideMatch[1];
    const num = Number.parseInt(simpleSideMatch[2], 10);
    const rest = simpleSideMatch[3] ?? "";
    return {
      raw,
      normalized,
      side,
      sideLabel: `Side ${side}`,
      num,
      rest,
      sortGroup: `SIDE:${side}`,
      sortMajor: 0,
      sortMinor: num,
      classification: "side-number",
    };
  }

  const multiLetterSideMatch = normalized.match(/^([A-Z]{2,})\s*(\d+)([A-Z]*)$/);
  if (multiLetterSideMatch) {
    const side = multiLetterSideMatch[1];
    const num = Number.parseInt(multiLetterSideMatch[2], 10);
    const rest = multiLetterSideMatch[3] ?? "";
    return {
      raw,
      normalized,
      side,
      sideLabel: `Side ${side}`,
      num,
      rest,
      sortGroup: `SIDE:${side}`,
      sortMajor: 1,
      sortMinor: num,
      classification: "multi-letter-side",
    };
  }

  const discTrackMatch = normalized.match(/^(\d+)\s*[-.]\s*(\d+)([A-Z]*)$/);
  if (discTrackMatch) {
    const discNumber = Number.parseInt(discTrackMatch[1], 10);
    const trackNumber = Number.parseInt(discTrackMatch[2], 10);
    const rest = discTrackMatch[3] ?? "";
    const side = `DISC-${discNumber}`;
    return {
      raw,
      normalized,
      side,
      sideLabel: `Disc ${discNumber}`,
      num: trackNumber,
      rest,
      sortGroup: side,
      sortMajor: 2,
      sortMinor: trackNumber,
      classification: "disc-track",
    };
  }

  const numericMatch = normalized.match(/^(\d+)$/);
  if (numericMatch) {
    const trackNumber = Number.parseInt(numericMatch[1], 10);
    return {
      raw,
      normalized,
      side: "",
      sideLabel: null,
      num: trackNumber,
      rest: "",
      sortGroup: "NUMERIC",
      sortMajor: 3,
      sortMinor: trackNumber,
      classification: "numeric",
    };
  }

  const fallbackMatch = normalized.match(/^([A-Z]+)?\s*(\d+)?(.*)$/);
  const side = fallbackMatch?.[1] ?? "";
  const num = fallbackMatch?.[2] ? Number.parseInt(fallbackMatch[2], 10) : 0;
  const rest = (fallbackMatch?.[3] ?? "").trim();

  return {
    raw,
    normalized,
    side,
    sideLabel: side ? `Side ${side}` : null,
    num,
    rest,
    sortGroup: side ? `FALLBACK:${side}` : `FREEFORM:${normalized}`,
    sortMajor: side ? 4 : 5,
    sortMinor: num,
    classification: "freeform",
  };
}

export function parseTrackPosition(position: TrackPositionValue): ParsedTrackPosition {
  return parseNormalizedPosition(position);
}

export function compareTrackPositions(a: TrackPositionValue, b: TrackPositionValue): number {
  const parsedA = parseTrackPosition(a);
  const parsedB = parseTrackPosition(b);

  if (parsedA.sortMajor !== parsedB.sortMajor) {
    return parsedA.sortMajor - parsedB.sortMajor;
  }
  if (parsedA.sortGroup !== parsedB.sortGroup) {
    return parsedA.sortGroup.localeCompare(parsedB.sortGroup);
  }
  if (parsedA.sortMinor !== parsedB.sortMinor) {
    return parsedA.sortMinor - parsedB.sortMinor;
  }
  if (parsedA.rest !== parsedB.rest) {
    return parsedA.rest.localeCompare(parsedB.rest);
  }
  return parsedA.normalized.localeCompare(parsedB.normalized);
}

export function getTrackSideLabel(position: TrackPositionValue): string | null {
  return parseTrackPosition(position).sideLabel;
}

export function normalizeAlbumTrackSides<TTrack extends { position: TrackPositionValue }>(
  tracks: TTrack[]
): NormalizedSideGroup<TTrack>[] {
  const orderedTracks = [...tracks].sort((a, b) =>
    compareTrackPositions(a.position, b.position)
  );

  const groups: NormalizedSideGroup<TTrack>[] = [];
  const byKey = new Map<string, NormalizedSideGroup<TTrack>>();

  for (const track of orderedTracks) {
    const parsed = parseTrackPosition(track.position);

    let sideKey: string;
    if (parsed.side) {
      sideKey = parsed.side;
    } else if (parsed.classification === "numeric") {
      sideKey = "TRACKLIST";
    } else if (parsed.classification === "empty") {
      sideKey = "TRACKLIST";
    } else {
      sideKey = parsed.normalized || "TRACKLIST";
    }

    // parseTrackPosition already derived the display label ("Side A", "Disc 1",
    // "Side BONUS"), so reuse it rather than re-deriving one from the key —
    // that kept the two disagreeing, and made a side's heading depend on which
    // of its tracks happened to be grouped first. Sideless freeform positions
    // have no label, so they fall back to their own key.
    let label: string;
    if (sideKey === "TRACKLIST") {
      label = "Tracklist";
    } else {
      label = parsed.sideLabel ?? sideKey;
    }

    let group = byKey.get(sideKey);
    if (!group) {
      group = {
        side_key: sideKey,
        side_label: label,
        ordinal: groups.length,
        track_count: 0,
        tracks: [],
      };
      groups.push(group);
      byKey.set(sideKey, group);
    }

    group.tracks.push(track);
    group.track_count = group.tracks.length;
  }

  return groups;
}
