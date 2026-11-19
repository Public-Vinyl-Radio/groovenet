"use client";

import React from "react";
import { Box, Flex, IconButton, Text } from "@chakra-ui/react";
import { FiSliders } from "react-icons/fi";
import type { RankingProfileEntry } from "@groovenet/contracts";
import RetroDialog from "@/components/ui/RetroDialog";
import RankingProfilePicker from "@/components/RankingProfilePicker";
import SuggestionScopeToggle from "@/components/SuggestionScopeToggle";
import type { RecommendationScope } from "@/types/recommendations";

export type SuggestionRankingSetting = {
  value: string;
  options: RankingProfileEntry[];
  onChange: (profileId: string) => void;
};

export type SuggestionScopeSetting = {
  value: RecommendationScope;
  onChange: (scope: RecommendationScope) => void;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Distinguishes the picker's field when two lists are on one page. */
  id: string;
  /** The Ranking setting; leave it out where the list has no ranking choice. */
  ranking?: SuggestionRankingSetting;
  /** The Libraries setting (`This library / All libraries`). */
  scope?: SuggestionScopeSetting;
  title?: string;
};

const SCOPE_LABELS: Record<RecommendationScope, string> = {
  library: "This library",
  all: "All libraries",
};

/**
 * A suggestion list's settings on phones (#1231): Ranking and Libraries in a
 * `RetroDialog`, kept out of the space above the list. Each change applies at
 * once through the caller's own setter, so its stored value and analytics are
 * the list's; the dialog has a close button and no Save. A list passes only
 * the settings it has.
 */
export default function SuggestionSettingsDialog({
  open,
  onOpenChange,
  id,
  ranking,
  scope,
  title = "Suggestion settings",
}: Props) {
  return (
    <RetroDialog open={open} onOpenChange={onOpenChange} title={title}>
      <Flex direction="column">
        {ranking && (
          <Box p="14px" data-testid="suggestion-settings-ranking">
            <RankingProfilePicker
              id={`${id}-settings`}
              value={ranking.value}
              options={ranking.options}
              onChange={ranking.onChange}
            />
          </Box>
        )}
        {scope && (
          <Flex
            direction="column"
            gap={2}
            p="14px"
            borderTopWidth={ranking ? "rule" : 0}
            borderColor="border"
          >
            {/* Styled as the picker's own "Ranking" label above it. */}
            <Text fontSize="12px" color="fg.muted">
              Libraries
            </Text>
            <SuggestionScopeToggle
              value={scope.value}
              onChange={scope.onChange}
              size="sm"
              align="start"
            />
          </Flex>
        )}
      </Flex>
    </RetroDialog>
  );
}

/** The settings button for a suggestion list's heading row on phones: 44px, sliders icon. */
export function SuggestionSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton
      aria-label="Suggestion settings"
      variant="ghost"
      size="sm"
      boxSize="44px"
      minW="44px"
      flexShrink={0}
      onClick={onClick}
    >
      <FiSliders />
    </IconButton>
  );
}

/**
 * The current settings as plain text for the summary line, so a choice made in
 * the dialog is never hidden: both named every time ("Selector · This library").
 */
export function suggestionSettingsSummary({
  rankingName,
  scope,
}: {
  rankingName?: string;
  scope?: RecommendationScope;
}): string {
  return [rankingName, scope && SCOPE_LABELS[scope]].filter(Boolean).join(" · ");
}
