import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Schemes, schemeControls, type SchemeArgs } from "./support/PaletteSchemes";

// The two section components (#991). SectionHeading is the display face at
// 18/24 (17/22 on phones); SectionLabel is the Labels face in four variants.
// Both replace the sixteen looks recorded in Audit/Headers (#958).

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontFamily="mono" fontSize="11px" color="fg.muted" mb={2}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

function Headings() {
  return (
    <Stack gap={6} p={4} maxW="720px">
      <Row label="level 2: a page section">
        <SectionHeading>Related tracks</SectionHeading>
      </Row>
      <Row label="level 3: nested, the same size">
        <SectionHeading level={3}>Palette</SectionHeading>
      </Row>
      <Row label="meta">
        <SectionHeading meta="12 tracks">Tracklist</SectionHeading>
      </Row>
      <Row label="meta and actions">
        <SectionHeading
          meta="3 copies"
          actions={
            <>
              <Button size="sm" variant="ghost">
                Add copy
              </Button>
              <Button size="sm" variant="outline">
                Log care
              </Button>
            </>
          }
        >
          Copies & care
        </SectionHeading>
      </Row>
      <Row label="day heading: meta, actions and a rule">
        <SectionHeading
          level={3}
          meta="Tue 28 Oct"
          actions={
            <Text fontFamily="label" fontSize="xs" color="fg.muted">
              4 SPINS · 3 RECORDS
            </Text>
          }
          pb={1.5}
          borderBottomWidth="outline"
          borderColor="border.ink"
        >
          Today
        </SectionHeading>
      </Row>
    </Stack>
  );
}

function Labels() {
  return (
    <Stack gap={6} p={4} maxW="720px">
      <Row label="strip">
        <SectionLabel variant="strip">Genre mix</SectionLabel>
      </Row>
      <Row label="strip with meta">
        <SectionLabel
          variant="strip"
          meta={
            <Text as="span" fontFamily="label" fontSize="xs" color="fg.muted">
              All playlists →
            </Text>
          }
        >
          Playlists & sets
        </SectionLabel>
      </Row>
      <Row label="overline">
        <SectionLabel variant="overline" level={3}>
          By week
        </SectionLabel>
      </Row>
      <Row label="bar (linked)">
        <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" mr="6px">
          <SectionLabel variant="bar" href="/spins/recap/2026-10" meta="Full recap →">
            October so far
          </SectionLabel>
        </Box>
      </Row>
      <Row label="header (card header row)">
        <Box borderWidth="outline" borderColor="border.ink" boxShadow="md" mr="6px">
          <SectionLabel
            variant="header"
            meta="last 30 days · least played first · 3 unrated"
            link={{ href: "/albums", label: "All →" }}
          >
            New arrivals
          </SectionLabel>
          <Box p={3}>Card content</Box>
        </Box>
      </Row>
    </Stack>
  );
}

const meta: Meta<SchemeArgs> = {
  title: "Design/Section headings",
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

export const SectionHeadingStory: Story = { name: "SectionHeading", render: () => <Headings /> };
export const SectionLabelStory: Story = { name: "SectionLabel", render: () => <Labels /> };
export const SectionHeadingPhone: Story = {
  name: "SectionHeading · phone",
  parameters: { viewport: { defaultViewport: "mobile375" } },
  render: () => <Headings />,
};
export const SectionLabelPhone: Story = {
  name: "SectionLabel · phone",
  parameters: { viewport: { defaultViewport: "mobile375" } },
  render: () => <Labels />,
};
