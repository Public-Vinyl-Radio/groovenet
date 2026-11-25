import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Box } from "@chakra-ui/react";
import { ProfilePicker } from "@/components/ProfilePicker";
import ProfileMenu from "@/components/ProfileMenu";
import HouseholdSettingsSection from "@/components/settings/HouseholdSettingsSection";
import { HouseholdProvider } from "@/providers/HouseholdProvider";
import { queryKeys } from "@/lib/queryKeys";
const users = [
  {
    id: "12345678-1234-4234-8234-123456789012",
    name: "Adam",
    is_owner: true,
    discogs_username: "adam",
    tailscale_login: null,
  },
  {
    id: "12345678-1234-4234-8234-123456789013",
    name: "Sam",
    is_owner: false,
    discogs_username: null,
    tailscale_login: null,
  },
];
function Preview({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => {
    const q = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    q.setQueryData(queryKeys.household(), { users, current: users[0], selected: true });
    q.setQueryData(queryKeys.householdTokens(), {
      users,
      tokens: [
        {
          id: "token1",
          user_id: users[0].id,
          name: "CLI",
          scope: "read",
          created_at: "2026-11-24T12:00:00Z",
          last_used_at: null,
          revoked_at: null,
        },
        {
          id: "token2",
          user_id: users[1].id,
          name: "Pi listener",
          scope: "ingest",
          created_at: "2026-11-24T12:00:00Z",
          last_used_at: "2026-11-24T13:00:00Z",
          revoked_at: null,
        },
      ],
    });
    return q;
  });
  return (
    <QueryClientProvider client={client}>
      <HouseholdProvider>
        <Box maxW="720px" p={6}>
          {children}
        </Box>
      </HouseholdProvider>
    </QueryClientProvider>
  );
}
const meta = {
  title: "Settings/Household profiles",
  component: ProfilePicker,
  args: { profiles: users, open: true, onSelect: () => {}, onClose: () => {} },
} satisfies Meta<typeof ProfilePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Picker: Story = {};
export const PickerError: Story = { args: { error: "Could not select profile. Try again." } };
export const Switcher: Story = {
  render: () => (
    <Preview>
      <ProfileMenu />
    </Preview>
  ),
};
export const Profiles: Story = {
  render: () => (
    <Preview>
      <HouseholdSettingsSection />
    </Preview>
  ),
};
export const Tokens: Story = {
  render: () => (
    <Preview>
      <HouseholdSettingsSection tokens />
    </Preview>
  ),
};
