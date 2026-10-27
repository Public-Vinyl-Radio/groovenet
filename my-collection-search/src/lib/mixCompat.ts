import { camelotOf, parseBpm } from "@groovenet/client/player-session";
import { camelotDistance } from "@/lib/playlistOrder";

export { camelotOf, parseBpm };

export type KeyRelation = "same" | "adjacent" | "clash";

export type MixDescription = {
  /** `other` minus `base`, in whole BPM; null when either tempo is unknown. */
  bpmDelta: number | null;
  /** How `other`'s key sits against `base`'s on the Camelot wheel; null when either is unknown. */
  keyRelation: KeyRelation | null;
};

type MixSide = { bpm?: number | string | null; key?: string | null };

export const KEY_RELATION_LABEL: Record<KeyRelation, string> = {
  same: "Same key",
  adjacent: "Adjacent",
  clash: "Key clash",
};

/**
 * How well `other` mixes after `base`. Same key is wheel distance 0, Adjacent
 * is 1 (one step round the wheel, or the relative major/minor), anything
 * further is a clash. No relation is claimed when either key is unknown.
 */
export function describeMix(base: MixSide, other: MixSide): MixDescription {
  const baseBpm = parseBpm(base.bpm);
  const otherBpm = parseBpm(other.bpm);
  const delta = baseBpm !== null && otherBpm !== null ? Math.round(otherBpm - baseBpm) : null;

  const baseKey = camelotOf(base.key);
  const otherKey = camelotOf(other.key);
  let keyRelation: KeyRelation | null = null;
  if (baseKey && otherKey) {
    const distance = camelotDistance(baseKey, otherKey);
    keyRelation = distance === 0 ? "same" : distance === 1 ? "adjacent" : "clash";
  }

  // `|| 0` turns a rounded -0 into 0.
  return { bpmDelta: delta === null ? null : delta || 0, keyRelation };
}

/** `+2`, `−3` (a true minus sign) or `0`. */
export function formatBpmDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

/** The key dot's colour: one hue per position on the Camelot wheel. */
export function camelotDotColor(camelot: string): string {
  const hue = ((parseInt(camelot, 10) || 0) * 30 + 150) % 360;
  return `hsl(${hue}, 70%, 62%)`;
}
