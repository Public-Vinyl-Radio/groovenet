import type { AppleMusicResult as AppleMusicResultWire } from "@groovenet/contracts";

/**
 * The wire type leaves everything but `id` optional (the route maps Apple's
 * attributes through unchecked); the UI only ever sees songs that carry them.
 */
export type AppleMusicResult = Omit<AppleMusicResultWire, "title" | "artist" | "album" | "url"> & {
  title: string;
  artist: string;
  album: string;
  url: string;
};
