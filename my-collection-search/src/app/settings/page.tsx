// app/(pages)/settings/page.tsx
"use client";
import { useMemo, useState } from "react";
import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";

import { SettingsDialogsProvider } from "@/providers/SettingsDialogProvider";
import { SyncStreamsProvider } from "@/providers/SyncStreamsProvider";
import ActionsGrid from "@/components/settings/ActionsGrid";
import FriendsDiscogsSection from "@/components/settings/FriendsDiscogsSection";
import DatabaseBackups from "@/components/settings/DatabaseBackups";
import DatabaseRestore from "@/components/settings/DatabaseRestore";
import BackupStatusSection from "@/components/settings/BackupStatusSection";
import BackupPolicySettingsSection from "@/components/settings/BackupPolicySettingsSection";
import GamdlSettingsSection from "@/components/settings/GamdlSettingsSection";
import AiPromptSettingsSection from "@/components/settings/AiPromptSettingsSection";
import DefaultLibrarySettingsSection from "@/components/settings/DefaultLibrarySettingsSection";
import SuggestionScopeSettingsSection from "@/components/settings/SuggestionScopeSettingsSection";
import AboutSection from "@/components/settings/AboutSection";
import PageContainer from "@/components/layout/PageContainer";
import DiscogsSyncDialog from "@/components/settings/dialogs/DiscogsSyncDialog";
import RemoveFriendDialog from "@/components/settings/dialogs/RemoveFriendDialog"; // your streamed removal dialog

type SettingsSection = {
  id: string;
  label: string;
  description: string;
  content: React.ReactNode;
};

export default function SettingsPage() {
  const sections: SettingsSection[] = useMemo(
    () => [
      {
        id: "defaults",
        label: "Defaults",
        description: "global library selection and app-wide scope",
        content: (
          <>
            <DefaultLibrarySettingsSection />
            <SuggestionScopeSettingsSection />
          </>
        ),
      },
      {
        id: "downloads",
        label: "Downloads",
        description: "gamdl, cookies, and download connectivity",
        content: <GamdlSettingsSection />,
      },
      {
        id: "ai",
        label: "AI Metadata",
        description: "metadata prompt",
        content: <AiPromptSettingsSection />,
      },
      {
        id: "library",
        label: "Library Data",
        description: "friends and Discogs import settings",
        content: <FriendsDiscogsSection />,
      },
      {
        id: "disaster-recovery",
        label: "Disaster Recovery",
        description: "remote policy, local backups, and restore",
        content: (
          <>
            <BackupStatusSection />
            <BackupPolicySettingsSection />
            <DatabaseBackups />
            <DatabaseRestore />
          </>
        ),
      },
      {
        id: "about",
        label: "About",
        description: "version, services, and project info",
        content: <AboutSection />,
      },
    ],
    []
  );

  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "downloads");
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  return (
    <SettingsDialogsProvider>
      <SyncStreamsProvider>
        <PageContainer size="wide">
          <Box mb="120px">
            <Flex
              align={{ base: "flex-start", md: "center" }}
              justify="space-between"
              gap={4}
              mb={4}
            >
              <Box>
                <Heading size={{ base: "lg", md: "xl" }} mb={{ base: 1, md: 1 }}>
                  Settings
                </Heading>
                <Text color="gray.600" display={{ base: "block", md: "block" }} fontSize={{ base: "sm", md: "md" }}>
                  Configure GrooveNET by area, without the long one-page scroll.
                </Text>
              </Box>
              <Box minW={{ base: "auto", md: "220px" }}>
                <ActionsGrid showTitle={false} />
              </Box>
            </Flex>

            <Box display={{ base: "block", md: "none" }} mb={4}>
              <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" textTransform="uppercase" color="gray.500" mb={2}>
                Section
              </Text>
              <select
                value={activeSectionId}
                onChange={(e) => setActiveSectionId(e.target.value)}
                style={{
                  width: "100%",
                  height: "var(--chakra-sizes-12)",
                  padding: "0 var(--chakra-spacing-4)",
                  borderRadius: "var(--chakra-radii-lg)",
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: "var(--chakra-colors-border)",
                  backgroundColor: "var(--chakra-colors-bg)",
                  color: "inherit",
                  fontSize: "1rem",
                }}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </Box>

            <Flex gap={6} align="start">
              <Box
                display={{ base: "none", md: "block" }}
                w="260px"
                flexShrink={0}
                position="sticky"
                top="20px"
              >
                <Box borderWidth={1} borderRadius="lg" p={3}>
                  {sections.map((section) => {
                    const isActive = section.id === activeSectionId;
                    return (
                      <Button
                        key={section.id}
                        variant={isActive ? "solid" : "ghost"}
                        colorScheme={isActive ? "blue" : undefined}
                        justifyContent="start"
                        h="auto"
                        py={3}
                        px={3}
                        mb={2}
                        w="full"
                        minW={0}
                        whiteSpace="normal"
                        onClick={() => setActiveSectionId(section.id)}
                      >
                        <Box textAlign="left" w="full" minW={0}>
                          <Text fontWeight="semibold" whiteSpace="normal">
                            {section.label}
                          </Text>
                          <Text
                            fontSize="xs"
                            color={isActive ? "blue.100" : "gray.500"}
                            whiteSpace="normal"
                            overflowWrap="anywhere"
                          >
                            {section.description}
                          </Text>
                        </Box>
                      </Button>
                    );
                  })}
                </Box>
              </Box>

              <Box
                flex={1}
                minW={0}
                borderWidth={{ base: 0, md: 1 }}
                borderRadius={{ base: "none", md: "lg" }}
                p={{ base: 0, md: 6 }}
                bg="bg"
              >
                <Heading size="lg" mb={1} display={{ base: "none", md: "block" }}>
                  {activeSection.label}
                </Heading>
                <Text color="gray.500" mb={4} display={{ base: "none", md: "block" }}>
                  {activeSection.description}
                </Text>
                {activeSection.content}
              </Box>
            </Flex>
          </Box>
        </PageContainer>

        {/* dialogs */}
        <DiscogsSyncDialog />
        <RemoveFriendDialog />
      </SyncStreamsProvider>
    </SettingsDialogsProvider>
  );
}
