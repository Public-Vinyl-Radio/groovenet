"use client";
import React from "react";
import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusTag } from "@/components/ui/RoleTags";
import {
  fetchStorageOrphans,
  startStorageOrphanScan,
  type OrphansResponse,
} from "@/services/internalApi/system";
import SystemRow from "./SystemRow";
import StorageOverview from "./StorageOverview";

const PREVIEW = 5;
const ALL = 500;
const POLL_MS = 2000;

export function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? amount : amount.toFixed(1)} ${units[unit]}`;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** System › Storage. Orphans only lists; nothing here deletes or re-links (#1052). */
export default function SystemStorage() {
  const [data, setData] = React.useState<OrphansResponse | null>(null);
  const [all, setAll] = React.useState(false);
  const [error, setError] = React.useState("");
  const running = Boolean(data?.running);
  const limit = all ? ALL : PREVIEW;

  const load = React.useCallback(async () => {
    try {
      setData(await fetchStorageOrphans(limit));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, [limit]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // While a scan runs, poll until the server says it has finished.
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const scan = async () => {
    setError("");
    try {
      await startStorageOrphanScan();
      await load();
    } catch (e) {
      setError(message(e));
    }
  };

  const last = data?.last_scan ?? null;
  return (
    <Box as="section" aria-label="Storage" mt={8}>
      <SectionLabel variant="strip" mb={4}>
        STORAGE
      </SectionLabel>
      <StorageOverview />
      <SystemRow
        label="Orphans"
        help="Audio files no track points at, and tracks pointing at missing files. Listing only: nothing is deleted."
      >
        <Flex align="center" gap={3} wrap="wrap" mb={3}>
          <Button size="sm" onClick={() => void scan()} disabled={running}>
            {running ? <Spinner size="xs" /> : null}
            {running ? "Scanning…" : "Scan now"}
          </Button>
          <Text fontSize="sm" color="fg.muted">
            {last
              ? `Last scan ${new Date(last.scanned_at).toLocaleString()} · ${(last.duration_ms / 1000).toFixed(1)}s`
              : data
                ? "Not scanned yet"
                : "Loading…"}
          </Text>
        </Flex>
        {error ? (
          <Text role="alert" color="fg.error" fontSize="sm" mb={2}>
            {error}
          </Text>
        ) : null}
        {data?.last_error ? (
          <Text role="alert" color="fg.error" fontSize="sm" mb={2}>
            Last scan failed: {data.last_error}
          </Text>
        ) : null}
        {last && data ? (
          <Box>
            <Text fontWeight="semibold">
              Files with no track: {last.orphan_file_count} · {formatBytes(last.orphan_file_bytes)}
            </Text>
            {data.files.items.map((file) => (
              <Flex key={file.path} justify="space-between" gap={3} fontSize="sm">
                <Text truncate>{file.path}</Text>
                <Text color="fg.muted" flexShrink={0}>
                  {formatBytes(file.size_bytes)}
                </Text>
              </Flex>
            ))}
            <Text fontWeight="semibold" mt={4}>
              Tracks pointing at missing files: {last.missing_track_count}
            </Text>
            {data.tracks.items.map((track) => (
              <Flex
                key={`${track.username ?? ""}:${track.track_id}`}
                align="center"
                gap={3}
                fontSize="sm"
              >
                <Text truncate>
                  {track.artist} — {track.title}
                </Text>
                <StatusTag tone="missing" size="xs">
                  Missing file
                </StatusTag>
              </Flex>
            ))}
            {!all && (last.orphan_file_count > PREVIEW || last.missing_track_count > PREVIEW) ? (
              <Button size="xs" variant="outline" mt={3} onClick={() => setAll(true)}>
                View all
              </Button>
            ) : null}
          </Box>
        ) : null}
      </SystemRow>
    </Box>
  );
}
