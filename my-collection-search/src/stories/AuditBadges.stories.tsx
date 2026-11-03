import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Badge, Box, Flex, Heading, Icon, Stack, Tag, Text } from "@chakra-ui/react";
import { FiVolume1 } from "react-icons/fi";
import GenreBadge, { GenreBadgeList, GenreBadgeRow } from "@/components/GenreBadge";
import { KeyChip } from "@/components/TrackResult";
import TrackPlaylistUsage from "@/components/TrackPlaylistUsage";
import FilterChips, { type FilterChip } from "@/components/FilterChips";
import { SelectedGenreTags } from "@/components/GenreFilter";
import { SpinMediumChip } from "@/components/spins/listeningLogParts";
import ChoreGroup from "@/components/chores/ChoreGroup";
import { CareLogEntryCard } from "@/components/chores/ChoresCareLog";
import { logEntryFixture } from "@/components/chores/fixtures";
import { Schemes, schemeControls, type SchemeArgs } from "./support/PaletteSchemes";
import { sampleTrack } from "./fixtures/track";

// The badge audit (#957): every badge, chip and tag variant in the app, grouped
// by how it renders. Real components where they render on their own; an
// inline-only style is copied prop for prop and labelled with its source line.
// The write-up is docs/design/badges-audit.md. Nothing here is a proposal: the
// six roles that replace these looks are Design/Badge roles (#963).

type AuditArgs = SchemeArgs;

/** A rendered example with the source line it came from. */
function Specimen({
  source,
  note,
  children,
}: {
  source: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap={1} align="flex-start" minW={0}>
      <Flex gap={1.5} wrap="wrap" align="center">
        {children}
      </Flex>
      <Text fontFamily="mono" fontSize="10px" color="fg.muted" lineHeight="14px">
        {source}
        {note ? ` — ${note}` : ""}
      </Text>
    </Flex>
  );
}

type Group = {
  id: string;
  name: string;
  /** The look as rendered, after the theme. */
  look: string;
  specimens: () => React.ReactNode;
};

const genre = (label: string, slug: string | null = label.toLowerCase()) => ({ label, slug });

const filterChips: FilterChip[] = [
  { key: "cumbia", label: "Cumbia", active: true, count: 41 },
  { key: "has_bpm", label: "Has BPM", active: true },
  { key: "rated", label: "Rated", active: false },
];

// Inline-only styles, copied from their source.
const careMono = { fontFamily: "mono", letterSpacing: "0.08em" } as const;

function NowPlayingMedium({ label }: { label: string }) {
  // src/components/home/NowPlayingCard.tsx:107
  return (
    <Text
      as="span"
      h="20px"
      px="6px"
      display="inline-flex"
      alignItems="center"
      borderWidth="outline"
      borderColor="border.ink"
      fontSize="10px"
      fontWeight="semibold"
      flexShrink={0}
      {...careMono}
    >
      {label}
    </Text>
  );
}

function RatingChip({
  label,
  rated,
  compact,
}: {
  label: string;
  rated: boolean;
  compact?: boolean;
}) {
  // src/components/home/NewArrivals.tsx:33
  return (
    <Text
      as="span"
      h={compact ? "18px" : "20px"}
      px={compact ? "4px" : "6px"}
      display="inline-flex"
      alignItems="center"
      borderWidth="outline"
      borderColor="border.ink"
      bg={rated ? "transparent" : "fg"}
      color={rated ? "fg" : "bg"}
      fontSize={compact ? "9px" : "10px"}
      fontWeight="semibold"
      flexShrink={0}
      {...careMono}
    >
      {label}
    </Text>
  );
}

function CountBox({ value, strong }: { value: string; strong?: boolean }) {
  // src/components/home/NeedsAttention.tsx:94 (desktop)
  return (
    <Text
      as="span"
      fontFamily="mono"
      fontWeight="semibold"
      fontSize="xs"
      minW="48px"
      textAlign="center"
      px={1}
      borderWidth="outline"
      borderColor="border.ink"
      bg={strong ? "fg" : undefined}
      color={strong ? "bg" : undefined}
    >
      {value}
    </Text>
  );
}

function RankBox({ rank }: { rank: number }) {
  // src/components/spins/SpinRecapCharts.tsx:357
  return (
    <Flex
      as="span"
      w="26px"
      h="22px"
      flexShrink={0}
      align="center"
      justify="center"
      borderWidth="outline"
      borderColor="border.ink"
      bg={rank === 1 ? "fg" : undefined}
      color={rank === 1 ? "bg" : "fg"}
      fontFamily="mono"
      fontSize="11px"
      fontWeight="semibold"
    >
      {rank}
    </Flex>
  );
}

function MonoCaps({ children, icon }: { children: React.ReactNode; icon?: boolean }) {
  // src/components/player/PlaybackOutput.tsx:131 (with icon) and PlayOnPicker.tsx:107
  return (
    <Text
      as="span"
      display="inline-flex"
      alignItems="center"
      gap="4px"
      fontFamily="mono"
      fontSize="10px"
      lineHeight={icon ? "12px" : undefined}
      fontWeight="semibold"
      letterSpacing="0.08em"
      color={icon ? undefined : "fg.muted"}
    >
      {icon && <Icon as={FiVolume1} boxSize="10px" flexShrink={0} />}
      {children}
    </Text>
  );
}

const statusPalettes = ["status.missing", "status.analysis", "status.genre", "status.success"];

const GROUPS: Group[] = [
  {
    id: "B1",
    name: "Status tint",
    look: "Badge subtle + status.*: status tint fill, status fg text, 1px status border. Label face, caps, 0.05em, square. xs 10px / sm 11px.",
    specimens: () => (
      <>
        <Specimen source="TrackResult.tsx:323, :1429" note="missing analysis">
          <Badge colorPalette="status.analysis" variant="subtle" size="sm" whiteSpace="nowrap">
            No BPM
          </Badge>
        </Specimen>
        <Specimen source="AlbumResult.tsx:38 MissingTags" note="missing data">
          <Badge colorPalette="status.missing" variant="subtle" size="sm">
            No identifier
          </Badge>
          <Badge colorPalette="status.missing" variant="subtle" size="sm">
            No local cover
          </Badge>
          <Badge colorPalette="status.analysis" variant="subtle" size="sm">
            No audio
          </Badge>
        </Specimen>
        <Specimen source="TrackResult.tsx:912 (xs), :1080, :1275 (sm)" note="similarity score">
          <Badge colorPalette="status.success" size="xs">
            94%
          </Badge>
          <Badge colorPalette="status.success" size="sm">
            94.2%
          </Badge>
          <Badge colorPalette="status.analysis" size="sm">
            81.0%
          </Badge>
          <Badge colorPalette="status.missing" size="sm">
            62.5%
          </Badge>
        </Specimen>
        <Specimen source="jobs/page.tsx:107" note="job state (waiting = accent, unknown = neutral)">
          <Badge colorPalette="accent" variant="subtle">
            Waiting
          </Badge>
          <Badge colorPalette="status.analysis" variant="subtle">
            Active
          </Badge>
          <Badge colorPalette="status.success" variant="subtle">
            Completed
          </Badge>
          <Badge colorPalette="status.missing" variant="subtle">
            Failed
          </Badge>
        </Specimen>
        <Specimen source="RelatedTrackRows.tsx:56 MixTag" note="key compatibility">
          <Badge size="sm" variant="subtle" colorPalette="status.success">
            Same key
          </Badge>
          <Badge size="sm" variant="subtle" colorPalette="status.success">
            Adjacent
          </Badge>
          <Badge size="sm" variant="subtle" colorPalette="neutral">
            Key clash
          </Badge>
        </Specimen>
        <Specimen source="GenreBadge.tsx via TrackResult.tsx:385, :1488" note="track genre, linked">
          <GenreBadgeList
            items={[genre("Cumbia"), genre("Chicha"), genre("Psychedelic Cumbia", null)]}
            kind="track"
            scope="tracks"
            colorPalette="status.genre"
            variant="subtle"
          />
        </Specimen>
        <Specimen source="TrackPlaylistUsage.tsx:37" note="real component, a button">
          <TrackPlaylistUsage track={sampleTrack} count={3} />
        </Specimen>
        <Specimen source="TrackResult.tsx:673" note="sort position moved">
          <Badge colorPalette="status.genre" size="sm">
            #3 was #7
          </Badge>
        </Specimen>
        <Specimen source="tracks/[id]/edit/page.tsx:244, :257; TrackEditFormFields.tsx:55, :68">
          <Badge colorPalette="status.analysis" variant="subtle" size="sm">
            Uncertain BPM — 42% confident
          </Badge>
        </Specimen>
        <Specimen source="SpinRow.tsx:91" note="spin provenance (Manual = neutral)">
          <Badge size="xs" variant="subtle" colorPalette="status.genre">
            Auto
          </Badge>
          <Badge size="xs" variant="subtle" colorPalette="neutral">
            Manual
          </Badge>
        </Specimen>
        <Specimen source="EnrichmentTrackStep.tsx:264, :341, :443">
          <Badge colorPalette="status.missing" size="xs">
            failed
          </Badge>
        </Specimen>
        <Specimen source="RecordCopyCard.tsx:54, :59">
          <Badge size="sm" colorPalette="status.missing">
            Never cleaned
          </Badge>
          <Badge size="sm" colorPalette="status.missing">
            Overdue
          </Badge>
        </Specimen>
        <Specimen source="SpinFormDialog.tsx:269; VinylPipelineView.tsx:297; albums/artwork/page.tsx:85">
          <Badge colorPalette="status.success">Full album</Badge>
          <Badge colorPalette="status.missing" variant="subtle">
            3×
          </Badge>
          <Badge colorPalette="status.analysis">Looks different · 18/64</Badge>
        </Specimen>
        <Specimen source="AboutSection.tsx:194; BackupStatusSection.tsx:121; GamdlCookieManager.tsx:173; GamdlTestConnection.tsx:136–178; AudioMetadataSection.tsx:52">
          <Badge colorPalette="status.success" variant="subtle">
            up
          </Badge>
          <Badge colorPalette="status.missing" variant="subtle">
            down
          </Badge>
          <Badge colorPalette="status.analysis">running</Badge>
          <Badge colorPalette="status.success" variant="subtle">
            Valid
          </Badge>
          <Badge colorPalette="status.missing" variant="subtle">
            Missing
          </Badge>
          <Badge colorPalette="status.success">Embedded Cover Found</Badge>
        </Specimen>
        <Specimen source="SimilarTracks.tsx:103, :113, :131; SimilarVibeTracks.tsx:102, :110; IdentityEmbeddingSection.tsx:32; PlaylistRecommendations.tsx:55">
          <Badge colorPalette="status.genre" size="sm">
            Era: 1970s
          </Badge>
          <Badge colorPalette="status.success" size="sm">
            Tags: cumbia, chicha
          </Badge>
          <Badge colorPalette="status.success" size="sm">
            Very Similar
          </Badge>
          <Badge colorPalette="status.analysis" size="sm">
            Somewhat Similar
          </Badge>
          <Badge colorPalette="status.genre" size="sm" variant="subtle">
            112 BPM
          </Badge>
          <Badge colorPalette="status.genre">Music Identity</Badge>
          <Badge colorPalette="status.genre" size="sm">
            Identity + Vibe
          </Badge>
        </Specimen>
        <Specimen source="CustomPaletteEditor.tsx:248" note="palette preview swatches">
          {statusPalettes.map((p) => (
            <Badge key={p} size="sm" variant="subtle" colorPalette={p}>
              {p.slice("status.".length)}
            </Badge>
          ))}
        </Specimen>
      </>
    ),
  },
  {
    id: "B2",
    name: "Accent tint",
    look: "Badge subtle + accent: accent tint, accent fg, 1px accent border. Library IDs add bold.",
    specimens: () => (
      <>
        <Specimen
          source="TrackResult.tsx:659; AlbumResult.tsx:365; TrackHeader.tsx:370"
          note="library ID, bold"
        >
          <Badge colorPalette="accent" size="sm" fontWeight="bold" whiteSpace="nowrap">
            LP-347-B1
          </Badge>
        </Specimen>
        <Specimen
          source="TrackPlaylistUsage.tsx:72; TrackPlaylistsSection.tsx:36"
          note="playlist position"
        >
          <Badge size="xs" colorPalette="accent">
            #4
          </Badge>
          <Badge colorPalette="accent">Position 4</Badge>
        </Specimen>
        <Specimen source="SpinFormDialog.tsx:261; EnrichmentWizard.tsx:298" note="counts">
          <Badge colorPalette="accent">2 sides selected</Badge>
          <Badge size="sm" colorPalette="accent">
            12 saved
          </Badge>
        </Specimen>
        <Specimen
          source="PlaylistRecommendations.tsx:60, :65; AudioVibeEmbeddingSection.tsx:32; ContextEmbeddingSection.tsx:36"
          note="embedding / source kind"
        >
          <Badge colorPalette="accent" size="sm">
            Identity
          </Badge>
          <Badge colorPalette="accent" size="sm">
            Vibe
          </Badge>
          <Badge colorPalette="accent">Audio Vibe</Badge>
          <Badge colorPalette="accent">Natural-language search</Badge>
        </Specimen>
        <Specimen
          source="SimilarTracks.tsx:108, :131; SimilarVibeTracks.tsx:115"
          note="filter value, distance, key"
        >
          <Badge colorPalette="accent" size="sm">
            Country: Peru
          </Badge>
          <Badge colorPalette="accent" size="sm">
            Similar
          </Badge>
          <Badge colorPalette="accent" size="sm" variant="subtle">
            8A
          </Badge>
        </Specimen>
      </>
    ),
  },
  {
    id: "B3",
    name: "Neutral tint",
    look: "Badge subtle + neutral: 6% ink tint, ink-muted text, 1px palette border.",
    specimens: () => (
      <>
        <Specimen
          source="TrackResult.tsx:393; GenreBadge.tsx:153; RelatedTrackRows.tsx:131; AlbumResult.tsx:189"
          note="+N overflow"
        >
          <Badge size="sm" variant="subtle" colorPalette="neutral">
            +3
          </Badge>
        </Specimen>
        <Specimen
          source="GenreBadge.tsx:123 GenreBadgeRow"
          note="real component; +N shows below md"
        >
          <GenreBadgeRow
            items={[genre("Cumbia"), genre("Chicha"), genre("Salsa"), genre("Boogaloo")]}
            kind="track"
            scope="tracks"
            colorPalette="status.genre"
            variant="subtle"
            mobileLimit={2}
          />
        </Specimen>
        <Specimen source="SpinRow.tsx:100; RecordCopyCard.tsx:50" note="context type, sleeve">
          <Badge size="xs" variant="subtle" colorPalette="neutral">
            party
          </Badge>
          <Badge size="sm" variant="subtle" colorPalette="neutral">
            Poly-lined
          </Badge>
        </Specimen>
      </>
    ),
  },
  {
    id: "B4",
    name: "Stock-gray tint",
    look: "Badge subtle with no colorPalette: Chakra's own gray.subtle / gray.fg (does not follow the palette), 1px --gn-border.",
    specimens: () => (
      <>
        <Specimen source="jobs/page.tsx:575" note="tab count">
          <Badge size="xs" variant="subtle">
            12
          </Badge>
        </Specimen>
        <Specimen source="PlaylistStatsPanel.tsx:276 (fontSize xs), :392" note="key counts">
          <Badge variant="subtle" fontSize="xs">
            8A (4)
          </Badge>
          <Badge variant="subtle">8A (4)</Badge>
        </Specimen>
        <Specimen source="AlbumArtworkDialog.tsx:215; FriendsDiscogsSection.tsx:223, :258">
          <Badge variant="subtle">Discogs (default)</Badge>
          <Badge>default</Badge>
        </Specimen>
        <Specimen
          source="GenreBadge.tsx:46 via PlaylistStatsPanel.tsx:138"
          note="unreconciled track genre, no palette"
        >
          <GenreBadge item={genre("Psych Cumbia", null)} kind="track" scope="tracks" size="xs" />
        </Specimen>
      </>
    ),
  },
  {
    id: "B5",
    name: "Outline",
    look: "Badge outline: no fill, a 1px inset ring (box-shadow, not a border) in colorPalette.border; default gray.",
    specimens: () => (
      <>
        <Specimen source="GenreBadge.tsx:58 kind=discogs-style" note="Discogs style, linked">
          <GenreBadgeList
            items={[genre("Bossa Nova", "bossa-nova"), genre("Unmapped Style", null)]}
            kind="discogs-style"
            scope="albums"
          />
        </Specimen>
        <Specimen source="jobs/page.tsx:472, :473" note="queue, job name">
          <Badge variant="outline">downloads</Badge>
          <Badge variant="outline">download-track</Badge>
        </Specimen>
        <Specimen
          source="albums/[releaseId]/page.tsx:337; EssentiaSection.tsx:29; AudioMetadataSection.tsx:55"
          note="file path"
        >
          <Badge variant="outline">/audio/lp-347/b1.m4a</Badge>
        </Specimen>
        <Specimen source="AudioVibeEmbeddingSection.tsx:34, :37, :40; IdentityEmbeddingSection.tsx:33, :34; ContextEmbeddingSection.tsx:37">
          <Badge variant="outline">112 BPM</Badge>
          <Badge variant="outline">8A</Badge>
          <Badge variant="outline" colorPalette="status.analysis">
            0.62 energy
          </Badge>
          <Badge variant="outline">1970s</Badge>
          <Badge variant="outline">Peru</Badge>
        </Specimen>
        <Specimen source="RecordCopyCard.tsx:46; EnrichmentWizard.tsx:302; EmbeddingQueueSection.tsx:290; genres/[slug]/page.tsx:120">
          <Badge size="sm" variant="outline">
            Default
          </Badge>
          <Badge size="sm" variant="outline">
            3 skipped
          </Badge>
          <Badge variant="outline" size="sm">
            Identity
          </Badge>
          <Badge variant="outline">Custom</Badge>
        </Specimen>
        <Specimen source="SpinFormDialog.tsx:266, :305; TrackGenresSection.tsx:75 (neutral)">
          <Badge variant="outline">6 track events</Badge>
          <Badge variant="outline">4 tracks</Badge>
          <Badge variant="outline" colorPalette="neutral" size="sm">
            No genres yet
          </Badge>
        </Specimen>
      </>
    ),
  },
  {
    id: "B6",
    name: "Surface",
    look: "Badge surface (Chakra default, no house override): gray.subtle fill, 1px inset ring in gray.muted. Stock gray, not the palette.",
    specimens: () => (
      <>
        <Specimen source="GenreBadge.tsx:58 kind=discogs-genre" note="Discogs genre, linked">
          <GenreBadgeList
            items={[genre("Latin"), genre("Rock")]}
            kind="discogs-genre"
            scope="albums"
          />
        </Specimen>
        <Specimen source="genres/GenreLinkList.tsx:25" note="md, link with count">
          <Badge size="md" variant="surface">
            Cumbia
            <Text as="span" color="fg.muted" ms={1}>
              41
            </Text>
          </Badge>
        </Specimen>
        <Specimen source="spins/AlbumSpinPanel.tsx:53" note="track played × count">
          <Badge size="sm" variant="surface">
            A1 · Sonido Amazonico ×3
          </Badge>
        </Specimen>
      </>
    ),
  },
  {
    id: "B7",
    name: "Solid accent dot",
    look: "Badge xs solid accent, absolutely placed on a menu button: active-filter count.",
    specimens: () => (
      <Specimen source="AlbumSearchMenu.tsx:34; TrackSearchMenu.tsx:40">
        <Box position="relative" w="36px" h="32px" borderWidth="outline" borderColor="border.ink">
          <Badge
            size="xs"
            colorPalette="accent"
            variant="solid"
            position="absolute"
            top="2px"
            right="2px"
          >
            2
          </Badge>
        </Box>
      </Specimen>
    ),
  },
  {
    id: "B8",
    name: "Solid genre fill",
    look: "GenreBadge kind=track uses variant solid: accent fill in dense rows, stock gray.solid (near black) in the playlist stats panel.",
    specimens: () => (
      <>
        <Specimen source="TrackResult.tsx:840, :981 (dense queue rows)" note="accent">
          <GenreBadgeList
            items={[genre("Cumbia")]}
            kind="track"
            scope="tracks"
            size="xs"
            colorPalette="accent"
          />
        </Specimen>
        <Specimen
          source="PlaylistStatsPanel.tsx:138 CountedGenreBadges kind=track"
          note="no palette → stock gray"
        >
          <GenreBadge item={genre("Cumbia · 12", "cumbia")} kind="track" scope="tracks" size="xs" />
        </Specimen>
      </>
    ),
  },
  {
    id: "B9",
    name: "Solid status (falls back to gray)",
    look: "Badge solid + a status.* palette. status.* defines only fg/subtle/border, so colorPalette.solid and .contrast are invalid and inherit the ancestor's palette: Chakra's stock gray.solid (near black) with white text, whatever the status.",
    specimens: () => (
      <>
        <Specimen source="jobs/page.tsx:474" note="downloader (accent fills; status.* doesn't)">
          <Badge colorPalette="accent" variant="solid" size="sm">
            analyze-local
          </Badge>
          <Badge colorPalette="status.genre" variant="solid" size="sm">
            gamdl
          </Badge>
          <Badge colorPalette="status.missing" variant="solid" size="sm">
            yt-dlp
          </Badge>
        </Specimen>
        <Specimen source="EmbeddingQueueSection.tsx:149; AboutSection.tsx:95; PlaylistViewer.tsx:461">
          <Badge colorPalette="status.missing" variant="solid">
            Paused
          </Badge>
          <Badge colorPalette="status.success" variant="solid">
            Update available
          </Badge>
          <Badge colorPalette="status.analysis" variant="solid" size="sm">
            Unsaved changes
          </Badge>
        </Specimen>
      </>
    ),
  },
  {
    id: "B10",
    name: "Medium tag",
    look: "SpinMediumChip: Badge xs neutral with a 2px ink border added; vinyl solid ink, digital outline.",
    specimens: () => (
      <Specimen source="spins/listeningLogParts.tsx:18 SpinMediumChip" note="real component">
        <SpinMediumChip medium="vinyl" />
        <SpinMediumChip medium="digital" />
      </Specimen>
    ),
  },
  {
    id: "T1",
    name: "Removable Tag",
    look: "Chakra Tag surface lg: the badge recipe doesn't reach Tag, so body face, mixed case, 14px, stock-gray surface, close button.",
    specimens: () => (
      <Specimen source="GenrePicker.tsx:84" note="chosen genre, removable">
        <Tag.Root size="lg" variant="surface">
          <Tag.Label>
            Cumbia
            <Text as="span" color="fg.muted">
              {" "}
              · Latin
            </Text>
          </Tag.Label>
          <Tag.EndElement>
            <Tag.CloseTrigger aria-label="Remove Cumbia" />
          </Tag.EndElement>
        </Tag.Root>
      </Specimen>
    ),
  },
  {
    id: "H1",
    name: "Filter chip",
    look: "Hand-built button: 2px border (ink when active, palette border when not), surface fill when active, label face 12px semibold 0.04em caps, 32px (44px on phones), x to remove.",
    specimens: () => (
      <Specimen source="FilterChips.tsx:44" note="real component">
        <FilterChips
          chips={filterChips}
          onToggle={() => {}}
          onClearAll={() => {}}
          summary="81 tracks"
        />
      </Specimen>
    ),
  },
  {
    id: "H2",
    name: "Selected-genre chip",
    look: "Hand-built button: 2px ink border, ground fill, label face 11px semibold caps, 32px, x to remove.",
    specimens: () => (
      <Specimen
        source="GenreFilter.tsx:86 SelectedGenreTags"
        note="real component; names fall back to slugs without the API"
      >
        <SelectedGenreTags selected={["cumbia", "chicha"]} onRemove={() => {}} />
      </Specimen>
    ),
  },
  {
    id: "H3",
    name: "Mono outline tag",
    look: "Hand-built span: 2px border, mono (Plex) 9–10px semibold, 0.08em, caps in the string, 18–22px tall. Border style or an ink fill tells values apart.",
    specimens: () => (
      <>
        <Specimen
          source="chores/ChoresCareLog.tsx:119"
          note="real CareLogEntryCard; VIA WEB/CLI/MCP/API by border style"
        >
          <Stack gap={2} w="100%" maxW="520px">
            {(["web", "cli", "mcp"] as const).map((source) => (
              <CareLogEntryCard
                key={source}
                entry={logEntryFixture({ source })}
                timeZone="America/Los_Angeles"
                justSaved={source === "cli"}
              />
            ))}
          </Stack>
        </Specimen>
        <Specimen source="home/NowPlayingCard.tsx:107" note="medium">
          <NowPlayingMedium label="VINYL" />
          <NowPlayingMedium label="DIGITAL" />
        </Specimen>
        <Specimen source="home/NewArrivals.tsx:33" note="rating; compact in the phone strip">
          <RatingChip label="★★★★☆" rated />
          <RatingChip label="UNRATED" rated={false} />
          <RatingChip label="UNRATED" rated={false} compact />
        </Specimen>
        <Specimen
          source="chores/ChoreGroup.tsx:27 SleeveChip"
          note="real ChoreGroup; dashed, muted"
        >
          <Box w="100%" maxW="520px">
            <ChoreGroup
              id="audit"
              title="SPUN RECENTLY · NEVER CLEANED"
              reason="Played records wear first."
              rows={[
                {
                  key: "1",
                  title: "Innerspeaker",
                  artist: "Tame Impala",
                  thumbnail: null,
                  meta: "SPUN 4× IN OCT",
                  sleeveUnknown: true,
                },
              ]}
              selected={new Set()}
              onToggle={() => {}}
              onToggleSection={() => {}}
            />
          </Box>
        </Specimen>
      </>
    ),
  },
  {
    id: "H4",
    name: "Mono count box",
    look: "Hand-built: 2px ink box around a mono number, inverted (ink fill) for the one that matters.",
    specimens: () => (
      <>
        <Specimen source="home/NeedsAttention.tsx:94" note="attention count">
          <CountBox value="12" strong />
          <CountBox value="3" />
        </Specimen>
        <Specimen source="spins/SpinRecapCharts.tsx:357" note="rank">
          <RankBox rank={1} />
          <RankBox rank={2} />
        </Specimen>
        <Specimen source="chores/LogCareDialog.tsx:86" note="+N on the thumbnail grid">
          <Flex
            boxSize="44px"
            align="center"
            justify="center"
            borderWidth="outline"
            borderColor="border.ink"
            fontFamily="mono"
            fontSize="11px"
            fontWeight="semibold"
          >
            +6
          </Flex>
        </Specimen>
      </>
    ),
  },
  {
    id: "H5",
    name: "Key chip",
    look: "Hand-built Flex: 1px literal border, bg.muted, 24px, body face xs, Camelot code bold, key name muted, coloured dot. Mixed case.",
    specimens: () => (
      <Specimen source="TrackResult.tsx:172 KeyChip" note="real component">
        <KeyChip keyName="A minor" camelot="8A" />
        <KeyChip keyName="D major" camelot="10B" showName={false} />
      </Specimen>
    ),
  },
  {
    id: "H6",
    name: "Keyboard hint",
    look: "Hand-built kbd: 1px rule border, mono 11px, 22px tall, no fill.",
    specimens: () => (
      <Specimen source="home/HomeHeader.tsx:70">
        <Text
          as="kbd"
          h="22px"
          px="6px"
          display="flex"
          alignItems="center"
          borderWidth="rule"
          borderColor="border"
          fontFamily="mono"
          fontSize="11px"
        >
          ⌘K
        </Text>
      </Specimen>
    ),
  },
  {
    id: "H7",
    name: "Unboxed mono caps",
    look: "No box at all: mono 10px semibold 0.08em caps text acting as a status or source tag.",
    specimens: () => (
      <>
        <Specimen source="player/PlaybackOutput.tsx:131 OutputTag" note="output">
          <MonoCaps icon>ON LOUNGE</MonoCaps>
          <MonoCaps icon>AIRPLAY</MonoCaps>
        </Specimen>
        <Specimen source="player/PlayOnPicker.tsx:107" note="output status">
          <MonoCaps>PLAYING</MonoCaps>
        </Specimen>
        <Specimen source="chores/ChoresCareLog.tsx:115" note="voided (inherits the header's mono)">
          <Text
            as="span"
            fontFamily="mono"
            letterSpacing="0.08em"
            fontSize="10px"
            fontWeight="semibold"
            color="fg.muted"
          >
            VOIDED
          </Text>
        </Specimen>
      </>
    ),
  },
];

function GroupSection({ group }: { group: Group }) {
  return (
    <Box as="section" aria-labelledby={`audit-${group.id}`} mb={6}>
      <Heading
        as="h3"
        id={`audit-${group.id}`}
        fontFamily="label"
        fontSize="13px"
        letterSpacing="0.06em"
        mb={1}
      >
        {group.id} · {group.name.toUpperCase()}
      </Heading>
      <Text fontSize="13px" color="fg.muted" mb={3} maxW="72ch">
        {group.look}
      </Text>
      <Stack gap={3}>{group.specimens()}</Stack>
    </Box>
  );
}

function groupStory(id: string): Story {
  const group = GROUPS.find((g) => g.id === id)!;
  return { name: `${group.id} ${group.name}`, render: () => <GroupSection group={group} /> };
}

const meta: Meta<AuditArgs> = {
  title: "Audit/Badges",
  parameters: { layout: "fullscreen" },
  ...schemeControls,
  decorators: [
    (Story, { args }) => (
      <Schemes palette={args.palette} mode={args.mode}>
        <Story />
      </Schemes>
    ),
  ],
};

export default meta;
type Story = StoryObj<AuditArgs>;

/** Every variant group on one page. */
export const AllGroups: Story = {
  name: "All groups",
  render: () => (
    <>
      {GROUPS.map((group) => (
        <GroupSection key={group.id} group={group} />
      ))}
    </>
  ),
};

export const StatusTint = groupStory("B1");
export const AccentTint = groupStory("B2");
export const NeutralTint = groupStory("B3");
export const StockGrayTint = groupStory("B4");
export const Outline = groupStory("B5");
export const Surface = groupStory("B6");
export const SolidAccentDot = groupStory("B7");
export const SolidGenreFill = groupStory("B8");
export const SolidStatus = groupStory("B9");
export const MediumTag = groupStory("B10");
export const RemovableTag = groupStory("T1");
export const FilterChipGroup = groupStory("H1");
export const SelectedGenreChip = groupStory("H2");
export const MonoOutlineTag = groupStory("H3");
export const MonoCountBox = groupStory("H4");
export const KeyChipGroup = groupStory("H5");
export const KeyboardHint = groupStory("H6");
export const UnboxedMonoCaps = groupStory("H7");
