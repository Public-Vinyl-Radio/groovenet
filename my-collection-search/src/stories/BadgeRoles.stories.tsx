import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import NextLink from "next/link";
import { genreHref } from "@/lib/genres/links";
import { Box, Flex, Grid, Heading, Stack, Text, chakra } from "@chakra-ui/react";
import { LuEllipsisVertical } from "react-icons/lu";
import {
  CategoryTag,
  CountTag,
  MetaTag,
  SourceTag,
  StatusTag,
  type SourceStroke,
  type StatusTone,
  type TagSize,
} from "@/components/ui/RoleTags";
import { FilterChip } from "@/components/ui/FilterChip";
import { Schemes, schemeControls, type SchemeArgs } from "./support/PaletteSchemes";

// The six badge roles (#963), every variant at both sizes, in any palette and
// mode. These replace the eighteen looks recorded in Audit/Badges (#957); the
// Migration map story says which old group became which role.

const sizes: TagSize[] = ["sm", "xs"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Grid templateColumns={{ base: "1fr", md: "160px minmax(0, 1fr)" }} gap={2} alignItems="center">
      <Text fontFamily="mono" fontSize="11px" color="fg.muted">
        {label}
      </Text>
      <Flex gap={1.5} wrap="wrap" align="center" minW={0}>
        {children}
      </Flex>
    </Grid>
  );
}

function Role({
  n,
  name,
  purpose,
  children,
}: {
  n: number;
  name: string;
  purpose: string;
  children: React.ReactNode;
}) {
  return (
    <Box as="section" aria-labelledby={`role-${n}`} mb={6}>
      <Flex align="baseline" gap={2} mb={1}>
        <CountTag variant="strong">{n}</CountTag>
        <Heading as="h3" id={`role-${n}`} fontFamily="label" fontSize="13px" letterSpacing="0.06em">
          {name.toUpperCase()}
        </Heading>
      </Flex>
      <Text fontSize="13px" color="fg.muted" mb={3} maxW="72ch">
        {purpose}
      </Text>
      <Stack gap={2}>{children}</Stack>
    </Box>
  );
}

const tones: [StatusTone, string[]][] = [
  ["missing", ["No audio", "Never cleaned", "Failed", "Paused"]],
  ["analysis", ["No BPM", "Uncertain key", "Unsaved changes"]],
  ["success", ["Completed", "Up", "Same key"]],
  ["neutral", ["Sleeve unknown", "Voided", "Unrated"]],
];

function StatusRole() {
  return (
    <Role n={1} name="Status" purpose="A state to notice or act on. Always a word; never solid.">
      {sizes.map((size) =>
        tones.map(([tone, labels]) => (
          <Row key={`${size}-${tone}`} label={`${tone} · ${size}`}>
            {labels.map((label) => (
              <StatusTag key={label} tone={tone} size={size}>
                {label}
              </StatusTag>
            ))}
          </Row>
        )),
      )}
    </Role>
  );
}

function CategoryRole() {
  return (
    <Role
      n={2}
      name="Category"
      purpose="What a record is: genre, style, mood. Track genres, Discogs genres and styles look the same; an unreconciled value is dashed."
    >
      {sizes.map((size) => (
        <React.Fragment key={size}>
          <Row label={`linked · ${size}`}>
            {["Cumbia", "Chicha", "Bossa nova"].map((label) => (
              <CategoryTag key={label} asChild size={size}>
                <NextLink href={genreHref(label.toLowerCase())}>{label}</NextLink>
              </CategoryTag>
            ))}
          </Row>
          <Row label={`static · ${size}`}>
            <CategoryTag size={size}>Rock</CategoryTag>
            <CategoryTag size={size} count={12}>
              Latin
            </CategoryTag>
            <CategoryTag size={size} unreconciled title="Not in the genre taxonomy yet">
              Psych cumbia
            </CategoryTag>
          </Row>
        </React.Fragment>
      ))}
    </Role>
  );
}

function KeyDot() {
  return (
    <Box
      as="span"
      aria-hidden="true"
      boxSize="8px"
      borderRadius="full"
      bg="status.success.border"
    />
  );
}

function MetadataRole() {
  return (
    <Role
      n={3}
      name="Metadata"
      purpose="A value: ID, key, BPM, era, a count with its noun, a path. No fill. The library ID is the one accent tag."
    >
      {sizes.map((size) => (
        <React.Fragment key={size}>
          <Row label={`id · ${size}`}>
            <MetaTag variant="id" size={size}>
              LP-347-B1
            </MetaTag>
          </Row>
          <Row label={`plain · ${size}`}>
            <MetaTag size={size}>
              <KeyDot />
              <b>8A</b> A minor
            </MetaTag>
            <MetaTag size={size}>112 BPM</MetaTag>
            <MetaTag size={size}>1970s</MetaTag>
            <MetaTag size={size}>3 playlists</MetaTag>
            <MetaTag size={size} asChild>
              <chakra.button type="button">2 playlists</chakra.button>
            </MetaTag>
          </Row>
          <Row label={`raw · ${size}`}>
            <MetaTag variant="raw" size={size}>
              /audio/lp-347/b1.m4a
            </MetaTag>
          </Row>
        </React.Fragment>
      ))}
    </Role>
  );
}

const strokes: [SourceStroke, string][] = [
  ["fill", "Vinyl"],
  ["solid", "Digital"],
  ["dotted", "Via web"],
  ["solid", "Via CLI"],
  ["dashed", "Via MCP"],
  ["double", "Via API"],
];

function SourceRole() {
  return (
    <Role
      n={4}
      name="Source · medium"
      purpose="Provenance and output. The value is the border style or an ink fill, so it reads without colour."
    >
      {sizes.map((size) => (
        <Row key={size} label={`strokes · ${size}`}>
          {strokes.map(([stroke, label]) => (
            <SourceTag key={label} stroke={stroke} size={size}>
              {label}
            </SourceTag>
          ))}
        </Row>
      ))}
      <Row label="inverted">
        <Flex gap={1.5} wrap="wrap" bg="fg" p={2}>
          {strokes.map(([stroke, label]) => (
            <SourceTag key={label} stroke={stroke} inverted>
              {label}
            </SourceTag>
          ))}
        </Flex>
      </Row>
    </Role>
  );
}

function CountRole() {
  return (
    <Role
      n={5}
      name="Count"
      purpose="A bare number. Strong is the one that matters; the dot is a notification, the only other accent."
    >
      {sizes.map((size) => (
        <Row key={size} label={`plain / strong / dot · ${size}`}>
          <CountTag size={size}>+3</CountTag>
          <CountTag size={size}>12</CountTag>
          <CountTag size={size} variant="strong">
            91
          </CountTag>
          <CountTag size={size} variant="dot">
            2
          </CountTag>
        </Row>
      ))}
      <Row label="on a menu button">
        <Box
          as="span"
          position="relative"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          w="40px"
          h="32px"
          borderWidth="outline"
          borderColor="border.ink"
          aria-label="Menu, 2 active filters"
        >
          <LuEllipsisVertical aria-hidden="true" />
          <CountTag size="xs" variant="dot" position="absolute" top="-8px" right="-8px">
            2
          </CountTag>
        </Box>
      </Row>
    </Role>
  );
}

function FilterChipRole() {
  return (
    <Role
      n={6}
      name="Filter chip"
      purpose="Pressable and removable: filters, chosen genres, pickers. 32px tall, 44px on phones."
    >
      <Row label="active / inactive">
        <FilterChip label="Cumbia" count={467} active />
        <FilterChip label="Has BPM" active />
        <FilterChip label="Rated" />
        <FilterChip label="Has notes" />
      </Row>
    </Role>
  );
}

const roles = [StatusRole, CategoryRole, MetadataRole, SourceRole, CountRole, FilterChipRole];

// The canvas's "18 groups → 6 roles" board: each audit group, the role it
// becomes and an example after the move. A group that carried several meanings
// splits; the note says where the rest go.
const migration: {
  id: string;
  name: string;
  role: string;
  after: React.ReactNode;
  note: string;
}[] = [
  {
    id: "B1",
    name: "Status tint",
    role: "Status",
    after: <StatusTag tone="analysis">No BPM</StatusTag>,
    note: "States stay. Genre uses go to Category; era, BPM and “3 playlists” go to Metadata.",
  },
  {
    id: "B2",
    name: "Accent tint",
    role: "Metadata · ID",
    after: <MetaTag variant="id">LP-347-B1</MetaTag>,
    note: "Only the library ID keeps the accent. Counts → Count, Identity/Vibe → Source, Waiting → Status.",
  },
  {
    id: "B3",
    name: "Neutral tint",
    role: "Count",
    after: <CountTag>+3</CountTag>,
    note: "Context type and sleeve type → Metadata.",
  },
  {
    id: "B4",
    name: "Stock-gray tint",
    role: "Metadata",
    after: <MetaTag>8A · 4</MetaTag>,
    note: "Off the palette before. The job log tab count → Count.",
  },
  {
    id: "B5",
    name: "Outline",
    role: "Metadata",
    after: <MetaTag>112 BPM</MetaTag>,
    note: "Discogs styles → Category. File paths → raw Metadata (case kept).",
  },
  {
    id: "B6",
    name: "Surface",
    role: "Category",
    after: <CategoryTag>Rock</CategoryTag>,
    note: "Discogs genres join track genres. GenreLinkList is dead code: removed.",
  },
  {
    id: "B7",
    name: "Solid accent dot",
    role: "Count · dot",
    after: (
      <CountTag size="xs" variant="dot">
        2
      </CountTag>
    ),
    note: "Keeps the accent: it signals an active state.",
  },
  {
    id: "B8",
    name: "Solid genre fill",
    role: "Category",
    after: (
      <CategoryTag size="xs" count={12}>
        Cumbia
      </CategoryTag>
    ),
    note: "The heaviest badge, used for the calmest content.",
  },
  {
    id: "B9",
    name: "Solid status",
    role: "Status",
    after: <StatusTag tone="missing">Paused</StatusTag>,
    note: "Bug: every state rendered the same near-black chip.",
  },
  {
    id: "B10",
    name: "Medium tag",
    role: "Source · medium",
    after: <SourceTag>Digital</SourceTag>,
    note: "Bug: a 2px border plus a 1px inset ring.",
  },
  {
    id: "T1",
    name: "Removable Tag",
    role: "Filter chip",
    after: <FilterChip label="Cumbia" active aria-label="Remove genre Cumbia" />,
    note: "GenrePicker moves off Chakra Tag; the parent genre goes in the title.",
  },
  {
    id: "H1",
    name: "Filter chip",
    role: "Filter chip",
    after: <FilterChip label="Cumbia" count={467} active />,
    note: "The spec the role is built on. Unchanged.",
  },
  {
    id: "H2",
    name: "Selected-genre chip",
    role: "Filter chip",
    after: <FilterChip label="Cumbia" active aria-label="Remove genre Cumbia" />,
    note: "12px, 0.04em tracking, 44px on phones, like H1.",
  },
  {
    id: "H3",
    name: "Mono outline tag",
    role: "Source · medium",
    after: <SourceTag>Via CLI</SourceTag>,
    note: "Rating stars → Metadata; Unrated and SLEEVE ? → Status neutral.",
  },
  {
    id: "H4",
    name: "Mono count box",
    role: "Count · strong",
    after: <CountTag variant="strong">91</CountTag>,
    note: "One size instead of three.",
  },
  {
    id: "H5",
    name: "Key chip",
    role: "Metadata · key",
    after: (
      <MetaTag>
        <KeyDot />
        <b>8A</b> A minor
      </MetaTag>
    ),
    note: "Keeps the wheel dot. Body face → Labels face.",
  },
  {
    id: "H6",
    name: "Keyboard hint",
    role: "Unchanged",
    after: (
      <Text as="kbd" fontFamily="mono" fontSize="11px">
        ⌘K
      </Text>
    ),
    note: "A kbd, not a badge.",
  },
  {
    id: "H7",
    name: "Unboxed mono caps",
    role: "Source · medium",
    after: <SourceTag>On Lounge</SourceTag>,
    note: "VOIDED and output status → Status neutral.",
  },
];

function MigrationMap() {
  return (
    <Box
      borderWidth="outline"
      borderColor="border.ink"
      boxShadow="md"
      role="table"
      aria-label="Migration map"
    >
      <Grid
        role="row"
        templateColumns="200px 160px 200px minmax(0, 1fr)"
        gap={4}
        px={4}
        py={2}
        bg="bg.subtle"
        borderBottomWidth="outline"
        borderColor="border.ink"
      >
        {["Group", "Becomes", "After", "Note"].map((head) => (
          <Text key={head} role="columnheader" fontFamily="label" fontSize="11px" color="fg.muted">
            {head.toUpperCase()}
          </Text>
        ))}
      </Grid>
      {migration.map((row) => (
        <Grid
          key={row.id}
          role="row"
          templateColumns="200px 160px 200px minmax(0, 1fr)"
          gap={4}
          px={4}
          py={3}
          alignItems="center"
          borderTopWidth="rule"
          borderColor="border"
        >
          <Text role="cell" fontSize="13px">
            <Text as="b" fontFamily="label" fontSize="12px" mr={2}>
              {row.id}
            </Text>
            {row.name}
          </Text>
          <Text role="cell" fontSize="13px" fontWeight="semibold">
            {row.role}
          </Text>
          <Box role="cell">{row.after}</Box>
          <Text role="cell" fontSize="13px" color="fg.muted">
            {row.note}
          </Text>
        </Grid>
      ))}
    </Box>
  );
}

const meta: Meta<SchemeArgs> = {
  title: "Design/Badge roles",
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
type Story = StoryObj<SchemeArgs>;

export const AllRoles: Story = {
  name: "All roles",
  render: () => (
    <>
      {roles.map((RoleStory) => (
        <RoleStory key={RoleStory.name} />
      ))}
    </>
  ),
};

export const Status: Story = { render: () => <StatusRole /> };
export const Category: Story = { render: () => <CategoryRole /> };
export const Metadata: Story = { render: () => <MetadataRole /> };
export const SourceMedium: Story = { name: "Source · medium", render: () => <SourceRole /> };
export const Count: Story = { render: () => <CountRole /> };
export const FilterChipRoleStory: Story = { name: "Filter chip", render: () => <FilterChipRole /> };

export const Migration: Story = { name: "Migration map", render: () => <MigrationMap /> };
