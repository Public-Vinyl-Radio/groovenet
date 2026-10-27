"use client";

import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import type { GenrePageResponse } from "@/api-contract/schemas";

/** Position bins by their actual BPM interval, leaving genuine gaps visible. */
export default function GenreBpmSpread({ stats }: { stats: GenrePageResponse["stats"] }) {
  const bins = stats.bpm_histogram;
  const first = bins[0]?.min ?? 0;
  const last = bins.at(-1)?.max ?? 10;
  const span = last - first;
  const peak = Math.max(1, ...bins.map((bin) => bin.count));
  return (
    <Box as="section" aria-label="BPM spread">
      <Heading as="h2" fontFamily="label" fontSize="xs" textTransform="uppercase" mb={3}>BPM spread</Heading>
      {bins.length === 0 ? <Text color="fg.muted" fontSize="sm">No BPM data for this genre yet.</Text> : <>
        <Box role="img" aria-label={bins.map((bin) => `${bin.min}–${bin.max} BPM: ${bin.count} tracks`).join("; ")} h="120px" position="relative" borderBottomWidth="outline" borderColor="border.ink">
          {bins.map((bin) => <Box key={bin.min} title={`${bin.min}–${bin.max} BPM: ${bin.count} tracks`} position="absolute" bottom={0} left={`${(bin.min - first) / span * 100}%`} w={`${(bin.max - bin.min) / span * 100}%`} h={`${bin.count / peak * 100}%`} borderInlineEndWidth="outline" borderColor="bg" bg="fg" />)}
        </Box>
        <Flex justify="space-between" fontFamily="label" fontSize="xs" color="fg.muted" mt={2}><Text>{first}</Text><Text>{last} BPM</Text></Flex>
      </>}
    </Box>
  );
}
