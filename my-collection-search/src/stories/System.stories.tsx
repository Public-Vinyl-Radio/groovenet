import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SystemPage from "@/app/system/page";
import SystemStatus from "@/components/system/SystemStatus";
import SystemBackups from "@/components/system/SystemBackups";
import DatabaseRestore from "@/components/settings/DatabaseRestore";

// All operations are intercepted, including backup and restore. Stories never write to a server.
const meta: Meta<typeof SystemPage> = {
  title: "System/Page",
  component: SystemPage,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => {
      const [client] = React.useState(
        () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      );
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  beforeEach: ({ parameters }) => {
    const original = globalThis.fetch;
    let policy = {
      enabled: true,
      provider: "restic-b2",
      schedule_cron: parameters.customCron ? "0 3 * * *" : "0 */6 * * *",
      retention_preset: "balanced",
      include_database: true,
      include_audio_files: true,
      include_album_covers: true,
      include_discogs_exports: true,
      include_essentia_files: true,
      include_uploads: true,
      updated_at: "2026-11-01T12:00:00Z",
    };
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (!url.includes("/api/")) return original(input, init);
      if (parameters.apiError)
        return Response.json({ error: "Server unavailable. Please try again." }, { status: 503 });
      if (url.endsWith("/api/version"))
        return Response.json({
          version: "0.3.15",
          gitSha: "abc1234",
          builtAt: "2026-11-01T12:00:00Z",
          nodeEnv: "production",
        });
      if (url.endsWith("/api/status"))
        return Response.json({
          services: [
            "app",
            "database",
            "redis",
            "essentia",
            "ga-service",
            "embeddings",
            "embedding_queue",
          ].map((service, i) => ({ service, status: "up", latencyMs: i * 8 })),
          checkedAt: "2026-11-01T12:00:00Z",
        });
      if (url.endsWith("/api/update-check"))
        return Response.json({ comparable: true, updateAvailable: false, error: null });
      if (url.endsWith("/api/settings/backup")) {
        if (init?.method === "PUT") policy = { ...policy, ...JSON.parse(String(init.body)) };
        return Response.json({ policy });
      }
      if (url.includes("/api/settings/backup/"))
        return Response.json({
          status: { status: "success", finished_at: "2026-11-01T12:00:00Z" },
        });
      if (url.endsWith("/api/backups")) return Response.json({ backups: [], files: [] });
      return Response.json({ message: "Demo operation complete" });
    };
    return () => {
      globalThis.fetch = original;
    };
  },
};
export default meta;
type Story = StoryObj<typeof SystemPage>;
export const Desktop: Story = {};
export const Phone: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
export const CustomSchedule: Story = { parameters: { customCron: true } };
export const Errors: Story = { parameters: { apiError: true } };
export const Status: Story = { render: () => <SystemStatus /> };
export const Backups: Story = { render: () => <SystemBackups /> };
export const Restore: Story = { render: () => <DatabaseRestore /> };
