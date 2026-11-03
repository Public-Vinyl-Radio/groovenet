import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import AddLibraryDialog from "@/components/settings/AddLibraryDialog";
import LibrariesSettingsSection, {
  AddLibraryButton,
  AddLibraryProvider,
} from "@/components/settings/LibrariesSettingsSection";
import { queryKeys } from "@/lib/queryKeys";
import { SettingsDialogsProvider } from "@/providers/SettingsDialogProvider";
import { SyncStreamsProvider } from "@/providers/SyncStreamsProvider";
import { UsernameProvider } from "@/providers/UsernameProvider";
import type { DiscogsUserLookupResponse } from "@/services/internalApi/discogs";
import type { LibrariesListResponse } from "@/services/internalApi/friends";

// Settings → Libraries (#969) and its add-library modal. The query cache is
// seeded, so nothing reaches the network; Make default and the Suggestions
// toggle still try to save, and fail quietly here. Toggle the theme and
// palette in the toolbar for Mono and Sleeve, light and dark.

const LIBRARIES: LibrariesListResponse = {
  account_username: "collector-1",
  results: [
    {
      id: 1,
      username: "collector-1",
      is_account: true,
      release_count: 412,
      last_synced_at: "2026-10-28T09:12:00.000Z",
    },
    {
      id: 2,
      username: "collector-2",
      is_account: false,
      release_count: 1233,
      last_synced_at: "2026-10-30T18:40:00.000Z",
    },
    {
      id: 3,
      username: "collector-3",
      is_account: false,
      release_count: 584,
      last_synced_at: "2026-09-02T11:05:00.000Z",
    },
    { id: 4, username: "collector-4", is_account: false, release_count: 45, last_synced_at: null },
  ],
};

const LOOKUPS: Record<string, DiscogsUserLookupResponse> = {
  "collector-5": { username: "collector-5", found: true, release_count: 2071 },
  "collectr-5": { username: "collectr-5", found: false },
};

function Seeded({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => {
    const seeded = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    seeded.setQueryData(queryKeys.libraries(), LIBRARIES);
    seeded.setQueryData(
      queryKeys.friends(),
      LIBRARIES.results.map(({ id, username }) => ({ id, username })),
    );
    seeded.setQueryData(queryKeys.defaultLibrary(), { friend_id: 2 });
    for (const { id } of LIBRARIES.results) {
      seeded.setQueryData(queryKeys.recommendationSettings(id), {
        friend_id: id,
        scope: "library",
        isDefault: true,
      });
    }
    for (const [name, result] of Object.entries(LOOKUPS)) {
      seeded.setQueryData(queryKeys.discogsUserLookup(name), result);
    }
    return seeded;
  });
  return (
    <QueryClientProvider client={client}>
      <UsernameProvider initialFriend={{ id: 2, username: "collector-2" }}>
        <SettingsDialogsProvider>
          <SyncStreamsProvider>{children}</SyncStreamsProvider>
        </SettingsDialogsProvider>
      </UsernameProvider>
    </QueryClientProvider>
  );
}

const meta: Meta = {
  title: "Settings/Libraries",
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <Seeded>
        <Story />
      </Seeded>
    ),
  ],
};
export default meta;
type Story = StoryObj;

const phone = { viewport: { defaultViewport: "mobile1" } };

function Section() {
  return (
    <AddLibraryProvider>
      <Box maxW="920px">
        <Box display={{ base: "none", md: "flex" }} justifyContent="flex-end" mb={4} mr="6px">
          <AddLibraryButton />
        </Box>
        <LibrariesSettingsSection />
      </Box>
    </AddLibraryProvider>
  );
}

export const Desktop: Story = { render: () => <Section /> };

export const Phone: Story = { parameters: phone, render: () => <Section /> };

function modal(initialUsername?: string) {
  function AddLibraryModal() {
    return (
      <AddLibraryDialog
        open
        onOpenChange={() => {}}
        onAdd={async () => {}}
        existing={LIBRARIES.results.map((library) => library.username)}
        initialUsername={initialUsername}
      />
    );
  }
  return AddLibraryModal;
}

export const AddLibraryFound: Story = { name: "Add library · found", render: modal("collector-5") };

export const AddLibraryNotFound: Story = {
  name: "Add library · not found",
  render: modal("collectr-5"),
};

export const AddLibraryNotLookedUp: Story = {
  name: "Add library · not looked up",
  render: modal(),
};

export const AddLibraryPhone: Story = {
  name: "Add library · found, phone",
  parameters: phone,
  render: modal("collector-5"),
};
