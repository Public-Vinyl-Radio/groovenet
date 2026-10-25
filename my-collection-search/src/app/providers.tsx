"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Provider as ChakraProvider } from "@/components/ui/provider";
import { UsernameProvider } from "@/providers/UsernameProvider";
import PlaylistPlayer from "@/components/PlaylistPlayer";
import { PlaylistPlayerProvider } from "@/providers/PlaylistPlayerProvider";
import TrackEditProvider from "@/providers/TrackEditProvider";
import PlaylistsProvider from "@/providers/PlaylistsProvider";
import { JobWatcherProvider } from "@/providers/JobWatcherProvider";
import ThemeColorSync from "@/components/ThemeColorSync";
import { CommandPaletteProvider } from "@/providers/CommandPaletteProvider";

const ReactQueryDevtools: React.ComponentType<{ initialIsOpen?: boolean }> =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () =>
          import("@tanstack/react-query-devtools").then((m) => ({
            default: m.ReactQueryDevtools,
          })),
        { ssr: false }
      )
    : () => null;

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client] = useState(() => new QueryClient());
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768);
  }, []);

  return (
    <ChakraProvider>
      <ThemeColorSync />
      <QueryClientProvider client={client}>
        <CommandPaletteProvider>
        <JobWatcherProvider>
          <UsernameProvider>
            <TrackEditProvider>
              <PlaylistsProvider>
                <PlaylistPlayerProvider>
                  {children}
                  <PlaylistPlayer />
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
