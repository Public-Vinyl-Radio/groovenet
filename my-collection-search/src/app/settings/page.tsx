// app/(pages)/settings/page.tsx
"use client";
import { Suspense, useMemo } from "react";
import { Box, Flex, Heading, Spinner, Tabs, Text } from "@chakra-ui/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

const SECTION_PARAM = "section";

function SettingsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  // The URL is the source of truth, so a reload or a shared link lands on the
  // same section; an unknown or missing value falls back to the first one.
  const requestedSectionId = searchParams.get(SECTION_PARAM);
  const activeSectionId = sections.some((section) => section.id === requestedSectionId)
    ? (requestedSectionId as string)
    : sections[0].id;
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  const setActiveSectionId = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(SECTION_PARAM, id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <SettingsDialogsProvider>
      <SyncStreamsProvider>
        <PageContainer size="wide">
          <Box mb="120px">
            <Flex
              direction={{ base: "column", sm: "row" }}
              align={{ base: "flex-start", sm: "center" }}
              justify="space-between"
              gap={4}
              mb={4}
            >
              <Box flex="1" minW={0}>
                <Heading size={{ base: "lg", md: "xl" }} mb={1}>
                  Settings
                </Heading>
                <Text color="fg.muted" fontSize={{ base: "sm", md: "md" }}>
                  Configure GrooveNET by area, without the long one-page scroll.
                </Text>
              </Box>
              <Box flexShrink={0} minW={{ base: "auto", md: "220px" }}>
                <ActionsGrid showTitle={false} />
              </Box>
            </Flex>

            <Tabs.Root
              value={activeSectionId}
              onValueChange={(details) => setActiveSectionId(details.value)}
              variant="line"
            >
              <Box display={{ base: "block", md: "none" }} mb={4}>
                <Text
                  fontSize="xs"
                  fontWeight="semibold"
                  letterSpacing="wide"
                  textTransform="uppercase"
                  color="fg.muted"
                  mb={2}
                >
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

              <Tabs.List
                display={{ base: "none", md: "flex" }}
                overflowX="auto"
                mb={4}
              >
                {sections.map((section) => (
                  <Tabs.Trigger key={section.id} value={section.id} flexShrink={0} whiteSpace="nowrap">
                    {section.label}
                  </Tabs.Trigger>
                ))}
                <Tabs.Indicator />
              </Tabs.List>

              <Box
                borderWidth={{ base: 0, md: 1 }}
                borderRadius={{ base: "none", md: "lg" }}
                p={{ base: 0, md: 6 }}
                bg="bg"
              >
                <Tabs.Content value={activeSection.id}>
                  <Heading size="lg" mb={1}>
                    {activeSection.label}
                  </Heading>
                  <Text color="fg.muted" mb={4}>
                    {activeSection.description}
                  </Text>
                  {activeSection.content}
                </Tabs.Content>
              </Box>
            </Tabs.Root>
          </Box>
        </PageContainer>

        {/* dialogs */}
        <DiscogsSyncDialog />
        <RemoveFriendDialog />
      </SyncStreamsProvider>
    </SettingsDialogsProvider>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SettingsPageContent />
    </Suspense>
  );
}
