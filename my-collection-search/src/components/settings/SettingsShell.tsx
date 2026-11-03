"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Heading, IconButton } from "@chakra-ui/react";
import { FiChevronLeft } from "react-icons/fi";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import AboutSection from "./AboutSection";
import AiPromptSettingsSection from "./AiPromptSettingsSection";
import AppearanceSettingsSection from "./AppearanceSettingsSection";
import DefaultLibrarySettingsSection from "./DefaultLibrarySettingsSection";
import FriendsDiscogsSection from "./FriendsDiscogsSection";
import GamdlSettingsSection from "./GamdlSettingsSection";
import SuggestionScopeSettingsSection from "./SuggestionScopeSettingsSection";
import { SettingsDrillList, SettingsRail } from "./SettingsNav";
import { useSettingsSummaries } from "./settingsSummaries";
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_PATH,
  settingsSectionLabel,
  type SettingsSectionId,
} from "./settingsSections";

// The sections are moved in as they were; #969 (Libraries), #970 (Appearance)
// and #971 (Apple Music, AI metadata, About) restyle them.
const SECTION_CONTENT: Record<SettingsSectionId, () => React.ReactNode> = {
  appearance: () => <AppearanceSettingsSection />,
  libraries: () => (
    <>
      <DefaultLibrarySettingsSection />
      <SuggestionScopeSettingsSection />
      <FriendsDiscogsSection />
    </>
  ),
  "apple-music": () => <GamdlSettingsSection />,
  "ai-metadata": () => <AiPromptSettingsSection />,
  about: () => <AboutSection />,
};

function SettingsIndexList() {
  return <SettingsDrillList summaries={useSettingsSummaries()} />;
}

const backToSettings = (
  <IconButton asChild aria-label="Back to Settings" variant="ghost" boxSize="44px" minW="44px">
    <NextLink href={SETTINGS_PATH} aria-label="Back to Settings">
      <FiChevronLeft />
    </NextLink>
  </IconButton>
);

/**
 * Settings (#968). Desktop: the page title, then the grouped rail beside the
 * open section. Phone: `/settings` is the drill-in list, and each section is
 * its own screen titled with its name and a back button.
 *
 * `section` is null on `/settings`, which shows the list on a phone and the
 * default section on desktop. Phone and desktop differ by CSS alone, so the
 * server renders the right one with no flash.
 */
export default function SettingsShell({ section }: { section: SettingsSectionId | null }) {
  const active = section ?? DEFAULT_SETTINGS_SECTION;
  const label = settingsSectionLabel(active);
  const headingId = `settings-section-${active}`;

  return (
    <PageContainer mb="120px">
      {section ? (
        <>
          {/* `contents`, so the phone header stays sticky against the page. */}
          <Box display={{ base: "contents", md: "none" }}>
            <PageHeader title={label} leading={backToSettings} />
          </Box>
          <Box display={{ base: "none", md: "contents" }}>
            <PageHeader title="Settings" />
          </Box>
        </>
      ) : (
        <PageHeader title="Settings" />
      )}

      {section ? null : (
        <Box display={{ base: "block", md: "none" }}>
          <SettingsIndexList />
        </Box>
      )}

      <Flex
        data-testid="settings-layout"
        display={{ base: section ? "block" : "none", md: "flex" }}
        gap={10}
        align="flex-start"
        mt={{ base: 0, md: 3 }}
      >
        <Box display={{ base: "none", md: "block" }}>
          <SettingsRail current={active} />
        </Box>
        <Box as="section" aria-labelledby={headingId} flex="1" minW={0} maxW="920px">
          <Heading
            as="h2"
            id={headingId}
            display={{ base: "none", md: "block" }}
            fontFamily="heading"
            fontSize="28px"
            lineHeight="34px"
            fontWeight="semibold"
            mb={5}
          >
            {label}
          </Heading>
          {SECTION_CONTENT[active]()}
        </Box>
      </Flex>
    </PageContainer>
  );
}
