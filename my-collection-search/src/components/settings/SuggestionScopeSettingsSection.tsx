"use client";

import React from "react";
import { Box, Flex, Heading, Spinner, Text } from "@chakra-ui/react";
import { useUsername } from "@/providers/UsernameProvider";
import { toaster } from "@/components/ui/toaster";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import {
  useRecommendationSettingsQuery,
  useUpdateRecommendationSettings,
} from "@/hooks/useSuggestionScope";
import { DEFAULT_RECOMMENDATION_SCOPE, type RecommendationScope } from "@/types/recommendations";

/** The saved suggestion scope for the selected library. */
export default function SuggestionScopeSettingsSection(): React.JSX.Element {
  const { friend } = useUsername();
  const settings = useRecommendationSettingsQuery(friend?.id);
  const update = useUpdateRecommendationSettings();

  const save = (friendId: number, scope: RecommendationScope) => {
    update.mutate(
      { friend_id: friendId, scope },
      {
        onError: (err) =>
          toaster.create({
            title: "Failed to save suggestion scope",
            description: err instanceof Error ? err.message : String(err),
            type: "error",
          }),
      }
    );
  };

  return (
    <Box mt={8}>
      <Heading size="lg" mb={2}>
        Track Suggestions
      </Heading>
      <Text color="gray.600" mb={4}>
        Where related tracks, similar tracks and playlist suggestions come from for this library.
        Each suggestions list can still be switched for that view.
      </Text>

      {!friend ? (
        <Text color="fg.muted">Select a library first.</Text>
      ) : settings.isPending ? (
        <Spinner size="sm" />
      ) : settings.error ? (
        <Text color="red.500">Failed to load the suggestion scope.</Text>
      ) : (
        <Flex gap={3} align="center" flexWrap="wrap">
          <SuggestionScopeToggle
            size="sm"
            value={settings.data?.scope ?? DEFAULT_RECOMMENDATION_SCOPE}
            onChange={(scope) => save(friend.id, scope)}
          />
          {update.isPending ? <Spinner size="sm" /> : null}
          <Text fontSize="sm" color="gray.500">
            {settings.data?.isDefault ? "Default for every library." : `Saved for ${friend.username}.`}
          </Text>
        </Flex>
      )}
    </Box>
  );
}
