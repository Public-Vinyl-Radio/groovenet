"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, Heading, IconButton, Text } from "@chakra-ui/react";
import { FiChevronLeft } from "react-icons/fi";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import AboutSection from "./AboutSection";
import AiPromptSettingsSection, { AI_METADATA_INTRO } from "./AiPromptSettingsSection";
import AppearanceSettingsSection from "./AppearanceSettingsSection";
import AppleMusicSettingsSection, { APPLE_MUSIC_INTRO } from "./AppleMusicSettingsSection";
import LibrariesSettingsSection, {
  AddLibraryButton,
  AddLibraryHeaderButton,
  AddLibraryProvider,
  LIBRARIES_INTRO,
} from "./LibrariesSettingsSection";
import { SettingsDrillList, SettingsRail } from "./SettingsNav";
import { useSettingsSummaries } from "./settingsSummaries";
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_PATH,
  settingsSectionLabel,
  type SettingsSectionId,
} from "./settingsSections";

const SECTION_CONTENT: Record<SettingsSectionId, () => React.ReactNode> = {
  appearance: () => <AppearanceSettingsSection />,
  libraries: () => <LibrariesSettingsSection />,
  "apple-music": () => <AppleMusicSettingsSection />,
  "ai-metadata": () => <AiPromptSettingsSection />,
  about: () => <AboutSection />,
};

/** What a section adds around its content: a line under the heading, header actions, a provider for them. */
type SectionFrame = {
  intro?: string;
  /** Beside the heading, from `md` up. */
  desktopAction?: React.ReactNode;
  /** At the right of the phone PageHeader. */
  phoneAction?: React.ReactNode;
  Provider?: React.ComponentType<{ children: React.ReactNode }>;
};

const SECTION_FRAMES: Partial<Record<SettingsSectionId, SectionFrame>> = {
  libraries: {
    intro: LIBRARIES_INTRO,
    desktopAction: <AddLibraryButton />,
    phoneAction: <AddLibraryHeaderButton />,
    Provider: AddLibraryProvider,
  },
  "apple-music": { intro: APPLE_MUSIC_INTRO },
  "ai-metadata": { intro: AI_METADATA_INTRO },
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
  const frame = section ? SECTION_FRAMES[active] : undefined;
  // Desktop `/settings` also shows the default section, so it gets its frame too.
  const desktopFrame = SECTION_FRAMES[active];
  const Provider = desktopFrame?.Provider ?? React.Fragment;

  return (
    <Provider>
      <PageContainer mb="120px">
        {section ? (
          <>
            {/* `contents`, so the phone header stays sticky against the page. */}
            <Box display={{ base: "contents", md: "none" }}>
              <PageHeader title={label} leading={backToSettings} trailing={frame?.phoneAction} />
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
            <Flex align="flex-end" gap={6} mb={{ base: desktopFrame?.intro ? 4 : 0, md: 5 }}>
              <Box flex="1" minW={0}>
                <Heading
                  as="h2"
                  id={headingId}
                  display={{ base: "none", md: "block" }}
                  fontFamily="heading"
                  fontSize="28px"
                  lineHeight="34px"
                  fontWeight="semibold"
                >
                  {label}
                </Heading>
                {desktopFrame?.intro ? (
                  <Text
                    mt={{ base: 0, md: "6px" }}
                    fontSize={{ base: "sm", md: "15px" }}
                    lineHeight={{ base: "20px", md: "22px" }}
                    color="fg.muted"
                    maxW="640px"
                  >
                    {desktopFrame.intro}
                  </Text>
                ) : null}
              </Box>
              {desktopFrame?.desktopAction ? (
                <Box display={{ base: "none", md: "block" }} mr="6px" flexShrink={0}>
                  {desktopFrame.desktopAction}
                </Box>
              ) : null}
            </Flex>
            {SECTION_CONTENT[active]()}
          </Box>
        </Flex>
      </PageContainer>
    </Provider>
  );
}
