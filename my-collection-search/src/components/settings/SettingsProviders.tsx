"use client";

import type { ReactNode } from "react";
import DiscogsSyncDialog from "@/components/settings/dialogs/DiscogsSyncDialog";
import RemoveFriendDialog from "@/components/settings/dialogs/RemoveFriendDialog";

/**
 * The Discogs sync and remove dialogs, shared by every Settings route so a sync survives moving
 * between sections. Their providers sit at the root (`app/providers.tsx`), so a sync started from
 * an empty page (#1246) is the same one Settings shows.
 */
export default function SettingsProviders({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <DiscogsSyncDialog />
      <RemoveFriendDialog />
    </>
  );
}
