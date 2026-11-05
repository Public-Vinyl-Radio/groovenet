import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Box, Grid, Stack, Tabs, Text } from "@chakra-ui/react";
import { FiCheck, FiX } from "react-icons/fi";
import {
  LuChevronLeft,
  LuChevronRight,
  LuListChecks,
  LuListPlus,
  LuPencil,
  LuPlus,
  LuRefreshCw,
  LuSearch,
  LuSlidersHorizontal,
  LuTrash2,
} from "react-icons/lu";
import PageHeader, { type HeaderAction } from "@/components/layout/PageHeader";
import HeaderCancelButton from "@/components/layout/HeaderCancelButton";
import {
  FiltersButton,
  HeaderButton,
  ListSearchRow,
  SearchField,
  ViewModeSwitch,
} from "@/components/layout/ListHeader";
import { Schemes, schemeControls, type SchemeArgs } from "./support/PaletteSchemes";

// The composable page header (#990, epic #995): each part on its own, then the
// six shapes from the "Unified page headers" canvas. Every route is one of
// them. Resize below 768px (or open a Phone story) for the bar.

const noop = () => {};

const meta: Meta<SchemeArgs> = {
  title: "Design/Page header",
  parameters: { layout: "fullscreen" },
  // One mode at a time, full width: side by side, each half would still get
  // the desktop layout from the viewport, which reads wrong.
  args: { ...schemeControls.args, mode: "light" },
  argTypes: {
    ...schemeControls.argTypes,
    mode: { control: "inline-radio", options: ["light", "dark"] },
  },
};

export default meta;
type Story = StoryObj<SchemeArgs>;

/** A stand-in for the page under the header, so the rule and spacing read. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <Box maxW="1100px">
      {children}
      <Box h="96px" borderWidth="outline" borderColor="border.ink" boxShadow="md" bg="bg.subtle" />
    </Box>
  );
}

function render(Composition: () => React.ReactElement) {
  return function Render(args: SchemeArgs) {
    return (
      <Schemes palette={args.palette} mode={args.mode}>
        <Page>
          <Composition />
        </Page>
      </Schemes>
    );
  };
}

const albumTrail = [
  { label: "Albums", href: "/albums" },
  { label: "Massive Attack", href: "/albums?q=Massive%20Attack" },
  { label: "Mezzanine" },
];

// ---- Parts --------------------------------------------------------------

function ContextPart() {
  return (
    <PageHeader>
      <PageHeader.Context
        crumbs={[
          { label: "Genres", href: "/genres" },
          { label: "Electronic", href: "/genres/electronic" },
          { label: "Downtempo", href: "/genres/downtempo" },
          { label: "Trip hop" },
        ]}
      />
      <PageHeader.Title>Trip hop</PageHeader.Title>
    </PageHeader>
  );
}

/** The trail from `md` up; on phones, a back button to the last linked parent. */
export const Context: Story = { render: render(ContextPart) };

function TitlePart() {
  return (
    <Stack gap={0}>
      <PageHeader>
        <PageHeader.Title meta="4,044 results">Tracks</PageHeader.Title>
      </PageHeader>
      <PageHeader>
        <PageHeader.Title meta="LP-322 · 11 tracks · 1:03:43" metaOnPhone={false}>
          District Maryland Virginia: Compilation Of The Rarest Synth Funk Go Go Boogie 1983-1985
        </PageHeader.Title>
      </PageHeader>
    </Stack>
  );
}

/** The h1 with its meta. Long titles truncate, with the full text as a tooltip. */
export const Title: Story = { render: render(TitlePart) };

const manyActions: HeaderAction[] = [
  { label: "Refresh", icon: <LuRefreshCw />, onClick: noop },
  { label: "Edit", icon: <LuPencil />, onClick: noop },
  { label: "Add to playlist", icon: <LuListPlus />, onClick: noop },
  { label: "Delete", icon: <LuTrash2 />, onClick: noop, desktop: "menu" },
  { label: "Add album", icon: <LuPlus />, onClick: noop, primary: true },
];

function ActionsPart() {
  return (
    <PageHeader>
      <PageHeader.Title meta="5 actions">Actions</PageHeader.Title>
      <PageHeader.Actions actions={manyActions} />
    </PageHeader>
  );
}

/**
 * One list, both widths. Desktop: outline buttons, the primary one solid,
 * `desktop: "menu"` in ⋯. Phones: the first two icons, the rest in ⋯.
 */
export const Actions: Story = { render: render(ActionsPart) };

function TabsPart() {
  return (
    <Tabs.Root defaultValue="todo">
      <PageHeader>
        <PageHeader.Title meta="412 copies">Chores</PageHeader.Title>
        <PageHeader.Tabs>
          <Tabs.List>
            <Tabs.Trigger value="todo">To do · 402</Tabs.Trigger>
            <Tabs.Trigger value="log">Care log</Tabs.Trigger>
          </Tabs.List>
        </PageHeader.Tabs>
      </PageHeader>
    </Tabs.Root>
  );
}

/** Tabs close the header in place of the rule. */
export const TabsSlot: Story = { name: "Tabs", render: render(TabsPart) };

function ToolbarPart() {
  return (
    <>
      <PageHeader>
        <PageHeader.Title meta="612 albums">Albums</PageHeader.Title>
      </PageHeader>
      <PageHeader.Toolbar>
        <ListSearchRow
          mb={0}
          field={
            <SearchField label="Search albums" placeholder="Search" value="" onChange={noop} />
          }
          controls={<FiltersButton activeCount={2} onClick={noop} />}
        />
      </PageHeader.Toolbar>
    </>
  );
}

/** Under the rule: the search row, filters. */
export const Toolbar: Story = { render: render(ToolbarPart) };

// ---- Compositions ---------------------------------------------------------

function IndexComposition() {
  return (
    <PageHeader>
      <PageHeader.Title meta="4,052 tracks · 412 albums · 35 playlists" metaOnPhone={false}>
        Home
      </PageHeader.Title>
      <PageHeader.Actions
        actions={[{ label: "Search", icon: <LuSearch />, onClick: noop, desktop: "hidden" }]}
        desktop={
          <HeaderButton quiet w="320px" justifyContent="flex-start" onClick={noop}>
            <LuSearch aria-hidden="true" />
            Search · ⌘K
          </HeaderButton>
        }
      />
    </PageHeader>
  );
}

/** Home: meta and a search trigger. */
export const Index: Story = { render: render(IndexComposition) };

function ListComposition() {
  const [view, setView] = React.useState<"row" | "card">("row");
  return (
    <>
      <PageHeader>
        <PageHeader.Title meta="4,044 results">Tracks</PageHeader.Title>
        <PageHeader.Actions
          actions={[
            {
              label: "Filters",
              icon: <LuSlidersHorizontal />,
              onClick: noop,
              desktop: "hidden",
            },
            { label: "Select", icon: <LuListChecks />, onClick: noop, phone: "menu" },
          ]}
          desktop={<ViewModeSwitch value={view} onChange={setView} />}
        />
      </PageHeader>
      <PageHeader.Toolbar>
        <ListSearchRow
          mb={0}
          field={
            <SearchField label="Search tracks" placeholder="Search" value="" onChange={noop} />
          }
          controls={<FiltersButton activeCount={0} onClick={noop} />}
        />
      </PageHeader.Toolbar>
    </>
  );
}

/** Tracks: the count joins the title; search sits in the toolbar. */
export const List: Story = { render: render(ListComposition) };

function EntityComposition() {
  return (
    <PageHeader>
      <PageHeader.Context crumbs={albumTrail} />
      <PageHeader.Title meta="LP-322 · 11 tracks · 1:03:43" metaOnPhone={false}>
        Mezzanine
      </PageHeader.Title>
      <PageHeader.Actions
        actions={[
          { label: "Edit", icon: <LuPencil />, onClick: noop },
          { label: "Add to playlist", icon: <LuListPlus />, onClick: noop, desktop: "menu" },
          { label: "Delete album", onClick: noop, desktop: "menu" },
        ]}
      />
    </PageHeader>
  );
}

/** Album: trail, title, Edit and a ⋯ menu. */
export const Entity: Story = { render: render(EntityComposition) };

function FormComposition() {
  return (
    <PageHeader>
      <PageHeader.Context
        crumbs={[
          ...albumTrail.slice(0, 1),
          { label: "Mezzanine", href: "/albums/1" },
          { label: "Edit" },
        ]}
        leading={<HeaderCancelButton onClick={noop} />}
      />
      <PageHeader.Title>Edit album</PageHeader.Title>
      <PageHeader.Actions
        actions={[
          { label: "Cancel", icon: <FiX />, onClick: noop, phone: "hidden" },
          { label: "Save changes", icon: <FiCheck />, onClick: noop, primary: true },
        ]}
      />
    </PageHeader>
  );
}

/** Edit album: Cancel and Save in the header at both widths. */
export const Form: Story = { render: render(FormComposition) };

function EditorialComposition() {
  return (
    <PageHeader>
      <PageHeader.Context crumbs={[{ label: "Spins", href: "/spins" }, { label: "Recap" }]} />
      <PageHeader.Title meta="so far · 358 spins" metaOnPhone={false}>
        October 2026
      </PageHeader.Title>
      <PageHeader.Actions
        actions={[
          { label: "September 2026", icon: <LuChevronLeft />, onClick: noop, desktop: "hidden" },
          {
            label: "November 2026",
            icon: <LuChevronRight />,
            onClick: noop,
            disabled: true,
            desktop: "hidden",
          },
          { label: "Listening log", onClick: noop, phone: "menu" },
        ]}
        desktop={
          <>
            <HeaderButton aria-label="September 2026" px={0} w="40px" onClick={noop}>
              <LuChevronLeft aria-hidden="true" />
            </HeaderButton>
            <Text fontFamily="label" fontSize="12px" fontWeight="semibold">
              OCT 2026
            </Text>
            <HeaderButton aria-label="November 2026" px={0} w="40px" disabled>
              <LuChevronRight aria-hidden="true" />
            </HeaderButton>
          </>
        }
      />
    </PageHeader>
  );
}

/** Recap: the month is a page title like any other. */
export const Editorial: Story = { render: render(EditorialComposition) };

function TabbedComposition() {
  return (
    <Tabs.Root defaultValue="todo">
      <PageHeader>
        <PageHeader.Title meta="412 copies · 402 to do" metaOnPhone={false}>
          Chores
        </PageHeader.Title>
        <PageHeader.Actions
          actions={[
            { label: "Pull next stack of 10", icon: <LuPlus />, onClick: noop, primary: true },
          ]}
        />
        <PageHeader.Tabs>
          <Tabs.List>
            <Tabs.Trigger value="todo">To do · 402</Tabs.Trigger>
            <Tabs.Trigger value="log">Care log</Tabs.Trigger>
          </Tabs.List>
        </PageHeader.Tabs>
      </PageHeader>
    </Tabs.Root>
  );
}

/** Chores: tabs close the header in place of the rule. */
export const Tabbed: Story = { render: render(TabbedComposition) };

// The viewport addon isn't installed (see Audit/Headers), so phones get each
// composition in a real 390px browsing context.
const compositions = ["index", "list", "entity", "form", "editorial", "tabbed"];

export const Phone: Story = {
  render: (args) => (
    <Grid templateColumns="repeat(auto-fill, 390px)" gap={6} p={4}>
      {compositions.map((id) => (
        <Stack key={id} gap={1}>
          <Text fontFamily="mono" fontSize="11px" color="fg.muted">
            {id.toUpperCase()} · 390
          </Text>
          <iframe
            title={`Page header phone: ${id}`}
            src={`./iframe.html?id=design-page-header--${id}&viewMode=story&args=palette:${args.palette};mode:${args.mode}`}
            width="390"
            height="260"
            style={{ border: "2px solid", display: "block" }}
          />
        </Stack>
      ))}
    </Grid>
  ),
};
