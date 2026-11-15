"use client";

import React from "react";
import { HStack, NativeSelect, Text } from "@chakra-ui/react";
import type { RankingProfileEntry } from "@groovenet/contracts";

type Props = {
  value: string;
  options: RankingProfileEntry[];
  onChange: (profileId: string) => void;
  /** Distinguishes two pickers on one page. */
  id: string;
  /** The visible label; "Ranking" by default, "Order by" beside the optimisers. */
  label?: string;
};

/**
 * Which ranking profile a suggestion list uses (#1192). Choosing one saves it
 * as the library's choice for that surface, and the list re-ranks at once.
 */
export default function RankingProfilePicker({
  value,
  options,
  onChange,
  id,
  label = "Ranking",
}: Props) {
  const selectId = `${id}-ranking-profile`;
  return (
    <HStack gap={2} w={{ base: "100%", md: "auto" }}>
      <Text asChild fontSize="12px" color="fg.muted" flexShrink={0}>
        <label htmlFor={selectId}>{label}</label>
      </Text>
      <NativeSelect.Root size="xs" w={{ base: "100%", md: "auto" }} minW="140px">
        <NativeSelect.Field
          id={selectId}
          // 16px on phones so iOS doesn't zoom into the field.
          fontSize={{ base: "16px", md: "13px" }}
          minH={{ base: "44px", md: "auto" }}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {options.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </HStack>
  );
}
