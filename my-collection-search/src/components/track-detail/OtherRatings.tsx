import { Text } from "@chakra-ui/react";
import type { Track } from "@/types/track";

const stars = (rating: number) => (rating > 0 ? `★${rating}` : "not rated");

/**
 * Other household profiles' ratings of a track, read-only (#1283):
 * "You ★5 · <other profile> ★3". Rendered only when someone else has rated it, so a
 * single-profile household never sees it. Names are the profiles' display
 * names from `users`.
 */
export default function OtherRatings({
  track,
}: {
  track: Pick<Track, "star_rating" | "other_ratings">;
}) {
  const others = track.other_ratings ?? [];
  if (others.length === 0) return null;
  const own = track.star_rating ?? 0;
  const parts = [`You ${stars(own)}`, ...others.map((o) => `${o.name} ${stars(o.rating)}`)];
  return (
    <Text
      data-testid="other-ratings"
      fontSize="13px"
      lineHeight="18px"
      color="fg.muted"
      aria-label={[
        own > 0 ? `You rated ${own} of 5` : "You have not rated it",
        ...others.map((o) => `${o.name} rated ${o.rating} of 5`),
      ].join(", ")}
    >
      {parts.join(" · ")}
    </Text>
  );
}
