"use client";

import type { ReactNode } from "react";
import { SettingsDialogsProvider } from "@/providers/SettingsDialogProvider";
import { SyncStreamsProvider } from "@/providers/SyncStreamsProvider";
import DiscogsSyncDialog from "@/components/settings/dialogs/DiscogsSyncDialog";
import RemoveFriendDialog from "@/components/settings/dialogs/RemoveFriendDialog";

/** The Discogs sync and remove dialogs, shared by every Settings route so a sync survives moving between sections. */
export default function SettingsProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsDialogsProvider>
      <SyncStreamsProvider>
        {children}
        <DiscogsSyncDialog />
        <RemoveFriendDialog />
      </SyncStreamsProvider>
    </SettingsDialogsProvider>
  );
}
