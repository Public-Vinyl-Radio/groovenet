import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Button, Flex, Heading, Stack, Text, useBreakpointValue } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FiCheck, FiRefreshCw, FiX } from "react-icons/fi";
import TrackSearchMenu from "@/components/TrackSearchMenu";
import PlaylistMonthDivider from "@/components/PlaylistMonthDivider";
import PageHeader from "@/components/layout/PageHeader";
import HeaderCancelButton from "@/components/layout/HeaderCancelButton";
import {
  HeaderButton,
  ListSearchRow,
  SearchField,
  ViewModeSwitch,
} from "@/components/layout/ListHeader";
import HomeHeader from "@/components/home/HomeHeader";
import AlbumHeader from "@/components/album-detail/AlbumHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import TrackHeader from "@/components/track-detail/TrackHeader";
import { TrackListHeader } from "@/components/TrackResult";
import { TrackStripHeader } from "@/components/TrackActionsModal";
import RetroDialog from "@/components/ui/RetroDialog";
import { SpinDetailPanel } from "@/components/spins/SpinDetail";
import { findSpinSelection } from "@/components/spins/spinSelection";
import { groupListeningLog } from "@/components/spins/spinSummary";
import { EVENING } from "./fixtures/listeningLog";
import { SpinRecapHeader } from "@/components/spins/SpinRecapPage";
import SpinMonthSwitcher from "@/components/spins/SpinMonthSwitcher";
import { MonthCard } from "@/components/home/MonthCard";
import { PlaylistPlayerProvider } from "@/providers/PlaylistPlayerProvider";
import { DisplayTimeZoneProvider } from "@/providers/DisplayTimeZoneProvider";
import { summarizeSides } from "@/lib/albumStats";
import { queryKeys } from "@/lib/queryKeys";
import { sampleAlbum } from "./fixtures/album";
import { sampleTrack } from "./fixtures/track";
import { HOME_COUNTS } from "./fixtures/home";
import { OCTOBER_RECAP } from "./fixtures/spinRecap";
import { palettes } from "@/app/palettes";
import { useColorMode } from "@/components/ui/color-mode";

const noop = () => {};
const track = {
  ...sampleTrack,
  username: "",
  album_thumbnail: undefined,
  audio_file_album_art_url: undefined,
  local_audio_url: undefined,
};

// Reuse preview.tsx's Chakra, fonts, Next router and query decorators. These
// local controls supply palette/mode too; the preview currently has font tools only.
function AuditProviders({
  children,
  palette,
  mode,
}: {
  children: React.ReactNode;
  palette: string;
  mode: "light" | "dark";
}) {
  const { setColorMode } = useColorMode();
  const [selectedPalette, selectPalette] = React.useState(palette);
  const [selectedMode, selectMode] = React.useState(mode);
  React.useEffect(() => selectPalette(palette), [palette]);
  React.useEffect(() => selectMode(mode), [mode]);
  const [client] = React.useState(() => {
    const value = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    value.setQueryData(queryKeys.genreTree(), []);
    for (const item of EVENING) {
      value.setQueryData(["album", item.session.release_id, item.session.friend_id], {
        album: {
          release_id: item.session.release_id,
          friend_id: item.session.friend_id,
          title: item.album?.title ?? "",
          artist: item.album?.artist ?? "",
          library_identifier: `LP-${item.session.id}`,
        },
        tracks: [],
      });
      for (const event of item.track_events)
        value.setQueryData(
          queryKeys.spinTrackStats({ friend_id: event.friend_id, track_id: event.track_id }),
          { play_count: 4, last_played_at: event.played_at },
        );
    }
    return value;
  });
  React.useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.palette;
    root.dataset.palette = selectedPalette;
    setColorMode(selectedMode);
    return () => {
      if (previous) root.dataset.palette = previous;
      else delete root.dataset.palette;
    };
  }, [selectedPalette, selectedMode, setColorMode]);
  return (
    <QueryClientProvider client={client}>
      <DisplayTimeZoneProvider timeZone="America/Los_Angeles">
        <PlaylistPlayerProvider>
          <Flex as="nav" aria-label="Audit appearance" wrap="wrap" gap={2} mb={6}>
            {Object.keys(palettes).map((id) => (
              <Button
                key={id}
                size="xs"
                variant={selectedPalette === id ? "solid" : "outline"}
                onClick={() => selectPalette(id)}
              >
                {id}
              </Button>
            ))}
            <Button
              size="xs"
              onClick={() => selectMode(selectedMode === "light" ? "dark" : "light")}
            >
              Mode: {selectedMode}
            </Button>
          </Flex>
          {children}
        </PlaylistPlayerProvider>
      </DisplayTimeZoneProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Audit/Headers",
  parameters: { layout: "padded" },
  args: { palette: "sleeve", mode: "light" as "light" | "dark" },
  argTypes: {
    palette: { control: "select", options: Object.keys(palettes) },
    mode: { control: "inline-radio", options: ["light", "dark"] },
  },
  decorators: [
    (Story, context) =>
      context.id.endsWith("-phone") ? (
        <Story />
      ) : (
        <AuditProviders palette={context.args.palette} mode={context.args.mode}>
          <Box bg="bg" color="fg" minH="100vh" p={4}>
            <Story />
          </Box>
        </AuditProviders>
      ),
  ],
} satisfies Meta<{ palette: string; mode: "light" | "dark" }>;
export default meta;
type Story = StoryObj<typeof meta>;

function Specimen({
  label,
  source,
  children,
}: {
  label: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <Box as="section" minW={0} pb={5}>
      <Text fontFamily="mono" fontSize="xs" color="fg.muted" mb={3}>
        {label} · {source}
      </Text>
      <Box css={{ containerType: "inline-size" }}>{children}</Box>
    </Box>
  );
}

function PageVariants() {
  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  return (
    <Stack gap={8}>
      <Specimen label="P1 · Plain" source="app/settings/page.tsx:117">
        <PageHeader title="Settings" />
      </Specimen>
      <Specimen
        label="P2 · Count / progress"
        source="components/enrichment/EnrichmentWizard.tsx:289"
      >
        <PageHeader
          title="Enrich"
          count="1 of 12"
          actions={[{ label: "Exit", icon: <FiX />, onClick: noop }]}
        />
      </Specimen>
      <Specimen
        label="P3 · List controls"
        source="components/SearchResults.tsx:449; components/layout/ListHeader.tsx:40"
      >
        <PageHeader
          title="Tracks"
          desktopActions={
            <>
              <HeaderButton quiet>Select</HeaderButton>
              <ViewModeSwitch value="row" onChange={noop} />
            </>
          }
          trailing={
            <TrackSearchMenu
              activeCount={0}
              selectMode={false}
              onOpenOptions={noop}
              onToggleSelect={noop}
            />
          }
        />
        <ListSearchRow
          field={
            <SearchField
              value=""
              onChange={noop}
              label="Search tracks"
              placeholder="Search tracks"
            />
          }
        />
      </Specimen>
      <Specimen label="P3 · Utility actions / overflow" source="app/jobs/page.tsx:276">
        <PageHeader
          title="Downloads"
          actions={[{ label: "Refresh jobs", icon: <FiRefreshCw />, onClick: noop }]}
          overflow={[{ label: "Clear all jobs", onClick: noop }]}
        />
      </Specimen>
      <Specimen label="P4 · Detail trail / phone back" source="app/genres/[slug]/page.tsx:106">
        <PageHeader
          title="Trip Hop"
          breadcrumbs={[
            { label: "Genres", href: "/genres" },
            { label: "Electronic", href: "/genres/electronic" },
            { label: "Trip Hop" },
          ]}
          desktopActions={<Button>Edit genre</Button>}
        />
      </Specimen>
      <Specimen label="P5 · Form cancel / save" source="app/albums/add/page.tsx:177">
        <PageHeader
          title="Add Album"
          leading={<HeaderCancelButton onClick={noop} />}
          actions={[{ label: "Save Album", icon: <FiCheck />, onClick: noop }]}
        />
      </Specimen>
      <Specimen label="P6 · Home summary / search" source="components/home/HomeHeader.tsx:39">
        <HomeHeader counts={HOME_COUNTS} onSearch={noop} />
      </Specimen>
      <Specimen label="P7 · Listening log / month" source="app/spins/page.tsx:175">
        <PageHeader
          title="Spins"
          trailing={<SpinMonthSwitcher month="2026-10" latest="2026-10" onChange={noop} short />}
          desktopActions={
            <>
              <SpinMonthSwitcher month="2026-10" latest="2026-10" onChange={noop} />
              <Button variant="solid" size="sm" h="44px">
                FULL RECAP →
              </Button>
            </>
          }
        />
      </Specimen>
      <Specimen label="P8 · Editorial recap" source="components/spins/SpinRecapPage.tsx:52">
        <SpinRecapHeader month="2026-10" latest="2026-10" onMonthChange={noop} />
      </Specimen>
      <Specimen
        label="P9 · Album identity card (below P4)"
        source="components/album-detail/AlbumHeader.tsx:123"
      >
        <AlbumHeader
          album={{
            ...sampleAlbum,
            username: "",
            album_thumbnail: undefined,
            audio_file_album_art_url: undefined,
          }}
          tracks={[track]}
          sides={summarizeSides([track])}
          spins={null}
          rating={3}
          onRate={noop}
          onPlay={noop}
          onAddToPlaylist={noop}
          onLogSpin={noop}
          onChangeArtwork={noop}
          isMobile={isMobile}
        />
      </Specimen>
      <Specimen
        label="P10 · Track identity card (below P4)"
        source="components/track-detail/TrackHeader.tsx:201"
      >
        <TrackHeader
          trackId={track.track_id}
          friendId={track.friend_id}
          fallbackTrack={track}
          showUsername={false}
          menuInPageHeader={isMobile}
        />
      </Specimen>
    </Stack>
  );
}

function SharedSections() {
  return (
    <Stack gap={6}>
      <Specimen
        label="S7 · Listening session strip"
        source="components/spins/ListeningSessionCard.tsx:30,47"
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          align={{ base: "start", md: "center" }}
          justify="space-between"
          gap={{ base: "2px", md: 3 }}
          minH={{ md: "36px" }}
          px={3}
          py={{ base: 2, md: 1.5 }}
          bg="bg.subtle"
          borderBottomWidth="outline"
          borderColor="border.ink"
          fontFamily="mono"
          fontSize="11px"
          letterSpacing={{ base: "0.06em", md: "0.08em" }}
        >
          <Text fontWeight="semibold">SESSION · 18:00–19:00</Text>
          <Text color="fg.muted">4 RECORDS · 12 SPINS</Text>
        </Flex>
      </Specimen>
      <Specimen label="S14 · Playlist month divider" source="components/PlaylistMonthDivider.tsx:8">
        <PlaylistMonthDivider
          group={{
            key: "2026-10",
            label: "OCT 2026",
            playlists: [],
            playlistCount: 3,
            setCount: 1,
          }}
        />
      </Specimen>
      <Specimen
        label="S15 · Spin detail identity / sections"
        source="components/spins/SpinDetail.tsx:86,349"
      >
        <Box maxW="380px">
          <SpinDetailPanel
            selection={findSpinSelection(
              groupListeningLog(EVENING, "America/Los_Angeles", new Date("2026-10-28T12:00:00Z")),
              `${EVENING[1].session.id}:2`,
            )!}
            onClose={noop}
            onSelect={noop}
            onDeleted={noop}
          />
        </Box>
      </Specimen>
      <Specimen
        label="S3 · Album section (SectionHeading)"
        source="components/ui/SectionHeading.tsx"
      >
        <SectionHeading meta="12 tracks" actions={<Button>Play all</Button>}>
          Tracklist
        </SectionHeading>
        <Text fontSize="sm" color="fg.muted" mt={1}>
          Sides, timing and track actions.
        </Text>
      </Specimen>
      <Specimen
        label="S4 · Ink strip / rule (SectionLabel)"
        source="components/ui/SectionLabel.tsx"
      >
        <SectionLabel variant="strip">GENRE MIX</SectionLabel>
      </Specimen>
      <Specimen label="S5 · Overline (SectionLabel)" source="components/ui/SectionLabel.tsx">
        <SectionLabel variant="overline" level={3}>
          BY WEEK
        </SectionLabel>
      </Specimen>
      <Specimen
        label="S9 · Track columns (container queries)"
        source="components/TrackResult.tsx:126"
      >
        <TrackListHeader />
      </Specimen>
      <Specimen
        label="S12 · Linked month bar"
        source="components/home/MonthCard.tsx:39; components/ui/SectionLabel.tsx"
      >
        <MonthCard month="2026-10" recap={OCTOBER_RECAP} />
      </Specimen>
      <Specimen label="S8 · Phone now-playing title" source="components/QueueDrawer.tsx:262">
        <Text as="h2" fontSize="22px" lineHeight="28px" fontWeight="semibold" lineClamp={2}>
          Cumbia 73
        </Text>
      </Specimen>
      <Specimen
        label="S13 · Top-list heading (SectionLabel)"
        source="components/spins/SpinRecapCharts.tsx"
      >
        <SectionLabel
          variant="strip"
          level={3}
          px={3.5}
          py={2.5}
          meta={<Text as="span">SPINS</Text>}
        >
          TOP RECORDS
        </SectionLabel>
      </Specimen>
    </Stack>
  );
}

// Inline/private Heading specimens: original styling props copied verbatim;
// dynamic content/ids/refs become fixtures. No production exports are added.
function InlineSections() {
  return (
    <Stack gap={6}>
      <Specimen
        label="S16 · Side group / desktop"
        source="components/album-detail/AlbumTracklist.tsx:233"
      >
        <Flex
          alignItems="center"
          justifyContent="space-between"
          gap={3}
          bg="bg.subtle"
          px="16px"
          py="10px"
          borderTopWidth="rule"
          borderBottomWidth="rule"
          borderColor="border"
        >
          <Flex alignItems="baseline" gap={3}>
            <Text fontSize="16px" lineHeight="24px" fontWeight="semibold">
              Side A
            </Text>
            <Text
              fontFamily="label"
              fontSize="12px"
              letterSpacing="0.06em"
              textTransform="uppercase"
              color="fg.muted"
            >
              3 TRACKS · 16:50
            </Text>
          </Flex>
          <Button size="xs">Play side A</Button>
        </Flex>
      </Specimen>
      <Specimen
        label="S16 · Side group / phone"
        source="components/album-detail/AlbumTracklist.tsx:342"
      >
        <Flex alignItems="baseline" gap="10px" minW={0} bg="bg.subtle">
          <Text fontSize="15px" lineHeight="22px" fontWeight="semibold">
            Side A
          </Text>
          <Text
            fontFamily="label"
            fontSize="11px"
            letterSpacing="0.06em"
            textTransform="uppercase"
            color="fg.muted"
            whiteSpace="nowrap"
          >
            3 TRACKS · 16:50
          </Text>
        </Flex>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="app/developer/DeveloperToolsView.tsx:56">
        <Heading size="md">Example heading</Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="app/developer/DeveloperToolsView.tsx:81">
        <Heading size="md">Storybook</Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="app/settings/page.tsx:192">
        <Heading size="lg" mb={1}>
          Example heading
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="app/vinyl/VinylPipelineView.tsx:310">
        <Heading size="sm" mb={2}>
          Recent detections
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/RelatedTracksSection.tsx:185">
        <Heading as="h2" size="lg">
          Related tracks
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/jobs/EmbeddingQueueSection.tsx:126">
        <Heading size={{ base: "sm", md: "md" }}>Embeddings</Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/jobs/EmbeddingQueueSection.tsx:192">
        <Heading size="sm" mb={3}>
          Active backfill runs
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/jobs/EmbeddingQueueSection.tsx:233">
        <Heading size="sm">Failed jobs ( )</Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/AboutSection.tsx:122">
        <Heading size="sm" mb={3}>
          Build
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/AboutSection.tsx:176">
        <Heading size="sm" mb={3}>
          Services
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/AboutSection.tsx:212">
        <Heading size="sm" mb={2}>
          Built with
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/AboutSection.tsx:226">
        <Heading size="sm" mb={2}>
          Links
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/AboutSection.tsx:68">
        <Heading size="lg" lineHeight={1.1}>
          GrooveNet
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/AiPromptSettingsSection.tsx:97"
      >
        <Heading size="lg" mb={2}>
          AI Metadata Prompt
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/AppearanceSettingsSection.tsx:121"
      >
        <Heading size="lg" mb={2}>
          Appearance
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/AppearanceSettingsSection.tsx:125"
      >
        <Heading size="md" mb={1}>
          Palette
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/AppearanceSettingsSection.tsx:230"
      >
        <Heading size="md" mb={1}>
          Typography
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/AppearanceSettingsSection.tsx:242"
      >
        <Heading size="sm" mb={0.5}>
          Example heading
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/AppearanceSettingsSection.tsx:306"
      >
        <Heading size="md" mb={1}>
          Mode
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/BackupPolicySettingsSection.tsx:67"
      >
        <Heading size="md" mb={2}>
          Remote Backup Policy
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/BackupStatusSection.tsx:91">
        <Heading size="md" mb={2}>
          Remote Backup Status
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/CustomPaletteEditor.tsx:210"
      >
        <Heading size="sm" mb={1}>
          Preview ·
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/CustomPaletteEditor.tsx:332"
      >
        <Heading size="md" mb={1}>
          Custom palette
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/DatabaseBackups.tsx:38">
        <Heading size="md">Database Backups</Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/DatabaseRestore.tsx:35">
        <Heading size="md" mb={2}>
          Restore Full Database
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/DefaultLibrarySettingsSection.tsx:17"
      >
        <Heading size="lg" mb={2}>
          Default Library
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/FriendsDiscogsSection.tsx:187"
      >
        <Heading size="md" mb={2}>
          Discogs Collections
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/GamdlCookieManager.tsx:109">
        <Heading size="md">Apple Music Cookie File</Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/GamdlSettingsSection.tsx:12"
      >
        <Heading size="lg" mb={2}>
          Gamdl Settings
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/settings/GamdlTestConnection.tsx:93">
        <Heading size="md">Test Gamdl Connection</Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/settings/SuggestionScopeSettingsSection.tsx:36"
      >
        <Heading size="lg" mb={2}>
          Track Suggestions
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/track-detail/AudioMetadataSection.tsx:34"
      >
        <Heading size="sm">Audio File Metadata (ffprobe)</Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/track-detail/AudioVibeEmbeddingSection.tsx:14"
      >
        <Heading size="sm" mb={3}>
          Audio Vibe Embedding Preview
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/track-detail/ContextEmbeddingSection.tsx:15"
      >
        <Heading size="sm" mb={1}>
          Context Embedding Preview
        </Heading>
      </Specimen>
      <Specimen label="S1 · Recipe heading" source="components/track-detail/EssentiaSection.tsx:14">
        <Heading size="sm" mb={3}>
          Essentia Raw Analysis
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/track-detail/IdentityEmbeddingSection.tsx:14"
      >
        <Heading size="sm" mb={3}>
          Identity Embedding Preview
        </Heading>
      </Specimen>
      <Specimen
        label="S1 · Recipe heading"
        source="components/track-detail/TrackPlaylistsSection.tsx:19"
      >
        <Heading size="sm" mb={3}>
          In Playlists
        </Heading>
      </Specimen>
      <Specimen
        label="S10 · Accessible-only heading"
        source="components/spins/SpinRecapStrip.tsx:60"
      >
        <Heading as="h2" srOnly>
          recap
        </Heading>
      </Specimen>
      <Specimen label="S11 · Now playing strip" source="components/home/NowPlayingCard.tsx:179">
        <Heading
          as="h2"
          m={0}
          w={{ md: "132px" }}
          h={{ base: "32px", md: "auto" }}
          flexShrink={0}
          px={3}
          display="flex"
          flexDirection={{ base: "row", md: "column" }}
          alignItems={{ base: "center", md: "flex-start" }}
          justifyContent={{ base: "space-between", md: "center" }}
          gap="2px"
          bg="fg"
          color="bg"
          fontSize={{ base: "11px", md: "12px" }}
          fontWeight="semibold"
          fontFamily="mono"
          letterSpacing="0.08em"
        >
          NOW PLAYING
        </Heading>
      </Specimen>
      <Specimen label="S16 · Body section label" source="app/tracks/[id]/edit/page.tsx:41">
        <Text
          fontWeight="semibold"
          fontSize="sm"
          color="fg.muted"
          mb={3}
          fontFamily="label"
          textTransform="uppercase"
          letterSpacing="wide"
        >
          Core Info
        </Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/AlbumForm.tsx:110">
        <Text fontSize="lg" fontWeight="semibold" mb={3}>
          Collection Details
        </Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/AlbumForm.tsx:142">
        <Text fontSize="lg" fontWeight="semibold" mb={3}>
          Physical Details
        </Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/AlbumForm.tsx:52">
        <Text fontSize="lg" fontWeight="semibold" mb={3}>
          Album Information
        </Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/AlbumTaxonomyEditor.tsx:24">
        <Text fontWeight="semibold">Album genres and styles</Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/SetDetailsPanel.tsx:189">
        <Text fontWeight="semibold">Set details</Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/SimilarTracks.tsx:148">
        <Text fontSize="sm" fontWeight="bold" mb={1}>
          💡 About Similar Tracks
        </Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/SimilarVibeTracks.tsx:129">
        <Text fontSize="sm" fontWeight="bold" mb={1}>
          🎵 About Similar Vibe Tracks
        </Text>
      </Specimen>
      <Specimen label="S16 · Body section label" source="components/TrackListBuilder.tsx:73">
        <Text fontSize="lg" fontWeight="semibold">
          Tracks
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/enrichment/EnrichmentTrackStep.tsx:259"
      >
        <Text fontWeight="semibold" fontSize="sm">
          AI Metadata
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/enrichment/EnrichmentTrackStep.tsx:336"
      >
        <Text fontWeight="semibold" fontSize="sm">
          Apple Music
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/enrichment/EnrichmentTrackStep.tsx:438"
      >
        <Text fontWeight="semibold" fontSize="sm">
          YouTube
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/enrichment/EnrichmentWizard.tsx:155"
      >
        <Text fontWeight="semibold" mb={4} fontSize="sm">
          Data sources
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/settings/BackupStatusSection.tsx:145"
      >
        <Text fontWeight="semibold" mb={1}>
          Included Paths
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/settings/BackupStatusSection.tsx:164"
      >
        <Text fontWeight="semibold" mb={1}>
          Latest Snapshot
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/settings/BackupStatusSection.tsx:186"
      >
        <Text fontWeight="semibold" mb={1}>
          Backup Storage
        </Text>
      </Specimen>
      <Specimen
        label="S16 · Body section label"
        source="components/settings/BackupStatusSection.tsx:215"
      >
        <Text fontWeight="semibold" mb={1}>
          Recent Snapshot Runs
        </Text>
      </Specimen>
      <Specimen label="S2 · Explicit display size" source="app/genres/[slug]/page.tsx:248">
        <Heading as="h2" fontSize="xl">
          Build this crate
        </Heading>
      </Specimen>
      <Specimen label="S2 · Explicit display size" source="app/genres/[slug]/page.tsx:373">
        <Heading as="h2" fontSize="lg" overflowWrap="anywhere">
          Weekly wantlist picks
        </Heading>
      </Specimen>
      <Specimen label="S2 · Explicit display size" source="components/genres/GenreBpmSpread.tsx:15">
        <Heading as="h2" fontFamily="label" fontSize="xs" textTransform="uppercase" mb={3}>
          BPM spread
        </Heading>
      </Specimen>
      <Specimen label="S2 · Explicit display size" source="components/genres/GenreCrate.tsx:87">
        <Heading tabIndex={-1} as="h3" fontSize="lg" minW={0} overflowWrap="anywhere">
          Example heading
        </Heading>
      </Specimen>
      <Specimen label="S2 · Explicit display size" source="components/spins/SpinDetail.tsx:356">
        <Heading as="h2" fontSize="17px" lineHeight="22px" fontWeight="semibold" truncate>
          Example heading
        </Heading>
      </Specimen>
      <Specimen label="S4 · Reversed strip" source="app/genres/page.tsx:38">
        <Heading
          as="h2"
          fontFamily="label"
          fontSize="xs"
          letterSpacing="0.06em"
          textTransform="uppercase"
          bg="fg"
          color="bg"
          px={2}
          py={1}
        >
          Example heading
        </Heading>
      </Specimen>
      <Specimen label="S4 · Reversed strip" source="app/spins/page.tsx:281">
        <Heading
          as="h2"
          h="26px"
          px={2.5}
          display={{ base: "none", md: "flex" }}
          alignItems="center"
          bg="fg"
          color="bg"
          fontFamily="mono"
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="0.08em"
          flexShrink={0}
        >
          LISTENING LOG
        </Heading>
      </Specimen>
      <Specimen label="S4 · Reversed strip" source="components/home/NeedsAttention.tsx:20">
        <Heading
          as="h2"
          bg="fg"
          color="bg"
          px={2}
          py={1}
          fontFamily="mono"
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="0.08em"
        >
          NEEDS ATTENTION
        </Heading>
      </Specimen>
      <Specimen label="S4 · Reversed strip" source="components/home/NewArrivals.tsx:299">
        <Heading
          as="h2"
          h={{ base: "24px", md: "26px" }}
          px={{ base: "8px", md: "10px" }}
          display="flex"
          alignItems="center"
          bg="fg"
          color="bg"
          fontFamily="mono"
          fontSize={{ base: "11px", md: "xs" }}
          fontWeight="semibold"
          letterSpacing="0.08em"
        >
          NEW ARRIVALS
        </Heading>
      </Specimen>
      <Specimen label="S4 · Reversed strip" source="components/home/PlaylistsSection.tsx:211">
        <Heading
          as="h2"
          h={{ base: "24px", md: "26px" }}
          px={{ base: "8px", md: "10px" }}
          display="flex"
          alignItems="center"
          bg="fg"
          color="bg"
          fontFamily="mono"
          fontSize={{ base: "11px", md: "xs" }}
          fontWeight="semibold"
          letterSpacing="0.08em"
        >
          PLAYLISTS & SETS
        </Heading>
      </Specimen>
      <Specimen label="S5 · Mono overline" source="components/chores/ChoresOverview.tsx:33">
        <Heading
          as="h2"
          fontFamily="mono"
          fontSize={{ base: "11px", md: "xs" }}
          fontWeight="semibold"
          letterSpacing="0.08em"
        >
          LIBRARY CLEANING
        </Heading>
      </Specimen>
      <Specimen label="S5 · Mono overline" source="components/spins/SpinDetail.tsx:136">
        <Heading
          as="h3"
          fontFamily="mono"
          fontSize="11px"
          fontWeight="semibold"
          letterSpacing="0.08em"
          color="fg.muted"
        >
          HOW IT WAS LOGGED
        </Heading>
      </Specimen>
      <Specimen label="S5 · Mono overline" source="components/spins/SpinDetail.tsx:231">
        <Heading
          as="h3"
          fontFamily="mono"
          fontSize="11px"
          fontWeight="semibold"
          letterSpacing="0.08em"
          color="fg.muted"
        >
          SESSION
        </Heading>
      </Specimen>
      <Specimen label="S5 · Mono overline" source="components/spins/SpinDetail.tsx:275">
        <Heading
          as="h3"
          fontFamily="mono"
          fontSize="11px"
          fontWeight="semibold"
          letterSpacing="0.08em"
          color="fg.muted"
        >
          THIS TRACK
        </Heading>
      </Specimen>
      <Specimen label="S6 · Day heading" source="app/spins/page.tsx:51">
        <Flex
          align="baseline"
          justify="space-between"
          wrap="wrap"
          columnGap={3}
          rowGap={1}
          pb={1.5}
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          <Heading
            as="h3"
            fontSize={{ base: "17px", md: "18px" }}
            lineHeight={{ base: "22px", md: "24px" }}
            fontWeight="semibold"
          >
            Today{" "}
            <Text
              as="span"
              fontFamily="mono"
              fontSize={{ base: "11px", md: "xs" }}
              fontWeight="normal"
              letterSpacing="0.06em"
              color="fg.muted"
            >
              2026-10-31
            </Text>
          </Heading>
          <Text
            fontFamily="mono"
            fontSize={{ base: "11px", md: "xs" }}
            letterSpacing={{ base: "0.04em", md: "0.06em" }}
            color="fg.muted"
          >
            12 SPINS · 4 RECORDS
          </Text>
        </Flex>
      </Specimen>
      <Specimen label="S7 · Chore group" source="components/chores/ChoreGroup.tsx:241">
        <Heading
          as="h3"
          fontFamily="mono"
          fontSize="11px"
          fontWeight="semibold"
          letterSpacing={{ base: "0.06em", md: "0.08em" }}
        >
          Example heading
        </Heading>
      </Specimen>
      <Specimen label="S8 · Queue title" source="components/QueueDrawer.tsx:108">
        <Box flex="1" minW={0}>
          <Heading as="h2" m={0} fontSize="18px" lineHeight="24px" fontWeight="semibold">
            Queue
          </Heading>
          <Text fontFamily="mono" fontSize="11px" color="fg.muted">
            12 tracks · 48:12
          </Text>
        </Box>
      </Specimen>
    </Stack>
  );
}

// preview.tsx registers mobile375, but main.ts has no viewport addon. Keep
// its globals and render an actual 375px browsing context as a local fallback.
function PhoneFrame({
  story,
  palette,
  mode,
}: {
  story: string;
  palette: string;
  mode: "light" | "dark";
}) {
  return (
    <iframe
      title={`Headers audit phone: ${story}`}
      src={`./iframe.html?id=audit-headers--${story}&viewMode=story&args=palette:${palette};mode:${mode}`}
      width="375"
      height="1000"
      style={{ border: 0, display: "block" }}
    />
  );
}

export const PageHeaders: Story = { render: () => <PageVariants /> };
export const PageHeadersPhone: Story = {
  globals: { viewport: { value: "mobile375", isRotated: false } },
  render: (args) => <PhoneFrame story="page-headers" {...args} />,
};
export const SectionHeadings: Story = {
  render: () => (
    <>
      <SharedSections />
      <InlineSections />
    </>
  ),
};
export const SectionHeadingsPhone: Story = {
  globals: { viewport: { value: "mobile375", isRotated: false } },
  render: (args) => <PhoneFrame story="section-headings" {...args} />,
};
// Dialogs are outside the inventory scope; keep one real strip as a reference.
export const DialogReference: Story = {
  render: () => (
    <RetroDialog open onOpenChange={noop} header={<TrackStripHeader track={track} />}>
      <Text>
        TrackStripHeader · components/TrackActionsModal.tsx:50; RetroDialogTitle ·
        components/ui/RetroDialog.tsx:9
      </Text>
    </RetroDialog>
  ),
};
