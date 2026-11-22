"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Provider as ChakraProvider } from "@/components/ui/provider";
import { UsernameProvider } from "@/providers/UsernameProvider";
import PlaylistPlayer from "@/components/PlaylistPlayer";
import { PlaylistPlayerProvider } from "@/providers/PlaylistPlayerProvider";
import { PlaybackTargetProvider } from "@/providers/PlaybackTargetProvider";
import TrackEditProvider from "@/providers/TrackEditProvider";
import PlaylistsProvider from "@/providers/PlaylistsProvider";
import { JobWatcherProvider } from "@/providers/JobWatcherProvider";
import ThemeColorSync from "@/components/ThemeColorSync";
import { InAppNavigationProvider } from "@/providers/InAppNavigationProvider";
import { CommandPaletteProvider } from "@/providers/CommandPaletteProvider";
import { useSyncAppearance } from "@/hooks/useAppearanceSettings";
import { queryKeys } from "@/lib/queryKeys";
import type { AppearanceSettingsResponse } from "@/services/internalApi/settings";

const ReactQueryDevtools: React.ComponentType<{ initialIsOpen?: boolean }> =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then((m) => ({
            default: m.ReactQueryDevtools,
          })),
        { ssr: false },
      )
    : () => null;

/** Keeps <html> on this device's appearance; renders nothing. */
function AppearanceSync() {
  useSyncAppearance();
  return null;
}

export default function ClientProviders({
  children,
  appearance,
}: {
  children: React.ReactNode;
  /** The saved appearance the layout rendered, so the first render knows the default. */
  appearance?: AppearanceSettingsResponse;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient();
    if (appearance) queryClient.setQueryData(queryKeys.appearance(), appearance);
    return queryClient;
  });
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768);
  }, []);

  return (
    <ChakraProvider>
      <ThemeColorSync />
      <QueryClientProvider client={client}>
        <AppearanceSync />
        <CommandPaletteProvider>
          <JobWatcherProvider>
            <UsernameProvider>
              <TrackEditProvider>
                <PlaylistsProvider>
                  <PlaylistPlayerProvider>
                    <PlaybackTargetProvider>
                      <InAppNavigationProvider>{children}</InAppNavigationProvider>
                      <PlaylistPlayer />
                    </PlaybackTargetProvider>
                  </PlaylistPlayerProvider>
                </PlaylistsProvider>
              </TrackEditProvider>
            </UsernameProvider>
          </JobWatcherProvider>
        </CommandPaletteProvider>
        {process.env.NODE_ENV === "development" && isDesktop && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </ChakraProvider>
  );
}
