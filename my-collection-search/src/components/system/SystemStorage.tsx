"use client";
import { Box, Flex, Grid, Spinner, Text } from "@chakra-ui/react";
import type { StorageResponse } from "@groovenet/contracts";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SourceTag } from "@/components/ui/RoleTags";
import { fileSources } from "@/components/player/audioQuality";
import { useStorageInfo } from "@/hooks/useSystemInfo";

export function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

const outlined = {
  borderWidth: "outline",
  borderColor: "border.ink",
  boxShadow: "md",
  borderRadius: "md",
  overflow: "clip",
} as const;

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Box p={4} borderBottomWidth={{ base: "rule", md: 0 }} borderColor="border">
      <Text fontFamily="mono" fontSize="xs" color="fg.muted">
        {label}
      </Text>
      <Text fontFamily="mono" fontSize="xl" fontWeight="bold">
        {value}
      </Text>
      {detail ? (
        <Text fontSize="xs" color="fg.muted">
          {detail}
        </Text>
      ) : null}
    </Box>
  );
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <Box
      role="img"
      aria-label={`${label}: ${pct.toFixed(0)}%`}
      h="2"
      bg="bg.subtle"
      borderWidth="rule"
      borderColor="border"
    >
      <Box h="full" w={`${pct}%`} bg="border.ink" />
    </Box>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: {
    key: string;
    label: React.ReactNode;
    files: number;
    size: number;
    tag?: React.ReactNode;
  }[];
}) {
  const max = Math.max(0, ...rows.map((r) => r.size));
  return (
    <Box {...outlined}>
      <Text
        bg="bg.subtle"
        borderBottomWidth="outline"
        borderColor="border.ink"
        p={4}
        fontFamily="mono"
        fontSize="xs"
        fontWeight="bold"
      >
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text p={4} color="fg.muted" fontSize="sm">
          No local files yet.
        </Text>
      ) : (
        rows.map((r) => (
          <Box key={r.key} p={4} borderBottomWidth="rule" borderColor="border">
            <Flex justify="space-between" align="center" gap={4} mb={2}>
              <Flex align="center" gap={2}>
                {r.label}
                {r.tag}
              </Flex>
              <Text fontFamily="mono" fontSize="xs" fontWeight="bold" whiteSpace="nowrap">
                {r.files} {r.files === 1 ? "FILE" : "FILES"} · {formatBytes(r.size)}
              </Text>
            </Flex>
            <Bar value={r.size} max={max} label={title} />
          </Box>
        ))
      )}
    </Box>
  );
}

export function sourceRows(rows: StorageResponse["by_source"]) {
  return rows.map((r) => {
    const meta = r.source ? fileSources[r.source] : null;
    return {
      key: r.source ?? "not-probed",
      label: meta ? (
        <SourceTag stroke={meta.stroke}>{meta.label}</SourceTag>
      ) : (
        <SourceTag stroke="dotted">Not probed</SourceTag>
      ),
      files: r.files,
      size: r.size_bytes,
    };
  });
}

export function codecRows(rows: StorageResponse["by_codec"]) {
  return rows.map((r) => ({
    key: r.codec ?? "not-probed",
    label: <Text fontWeight="bold">{r.codec ? r.codec.toUpperCase() : "Not probed"}</Text>,
    tag:
      r.lossless === null ? null : (
        <SourceTag stroke={r.lossless ? "fill" : "dashed"}>
          {r.lossless ? "Lossless" : "Lossy"}
        </SourceTag>
      ),
    files: r.files,
    size: r.size_bytes,
  }));
}

export default function SystemStorage() {
  const storage = useStorageInfo();
  const data = storage.data;
  const disk = data?.disk;
  return (
    <Box as="section" aria-label="Storage" mt={10}>
      <SectionLabel variant="strip" mb={4}>
        STORAGE
      </SectionLabel>
      {storage.isLoading ? (
        <Spinner aria-label="Loading storage" />
      ) : storage.error || !data ? (
        <Text color="fg.error" role="alert">
          {storage.error?.message ?? "Storage is unavailable."}
        </Text>
      ) : (
        <Flex direction="column" gap={6}>
          <Grid templateColumns={{ base: "1fr", md: "repeat(4, 1fr)" }} {...outlined}>
            <Tile
              label="LOCAL FILES"
              value={String(data.totals.files)}
              detail={`of ${data.totals.tracks} tracks`}
            />
            <Tile label="TOTAL SIZE" value={formatBytes(data.totals.size_bytes)} />
            <Tile label="LOSSLESS FILES" value={String(data.totals.lossless_files)} />
            <Tile label="LOSSLESS SIZE" value={formatBytes(data.totals.lossless_size_bytes)} />
          </Grid>
          <Box {...outlined} p={4}>
            <Text fontFamily="mono" fontSize="xs" fontWeight="bold" mb={3}>
              FREE SPACE
            </Text>
            {disk ? (
              <>
                <Flex
                  role="img"
                  aria-label="Disk usage"
                  h="3"
                  borderWidth="rule"
                  borderColor="border"
                  overflow="clip"
                >
                  <Box w={`${(disk.audio_bytes / disk.total_bytes) * 100}%`} bg="border.ink" />
                  <Box w={`${(disk.other_bytes / disk.total_bytes) * 100}%`} bg="fg.muted" />
                </Flex>
                <Flex wrap="wrap" gap={4} mt={3} fontFamily="mono" fontSize="xs">
                  <Text>AUDIO {formatBytes(disk.audio_bytes)}</Text>
                  <Text>OTHER {formatBytes(disk.other_bytes)}</Text>
                  <Text>FREE {formatBytes(disk.free_bytes)}</Text>
                  <Text color="fg.muted">TOTAL {formatBytes(disk.total_bytes)}</Text>
                </Flex>
              </>
            ) : (
              <Text color="fg.muted" fontSize="sm">
                The audio volume could not be read.
              </Text>
            )}
          </Box>
          {data.totals.unprobed_files > 0 ? (
            <Text color="fg.muted" fontSize="sm">
              {data.totals.unprobed_files} files have no stored metadata yet. Run the audio metadata
              backfill (<code>POST /api/tracks/audio-metadata/backfill</code>) to probe them.
            </Text>
          ) : null}
          <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6} alignItems="start">
            <Breakdown title="BY SOURCE" rows={sourceRows(data.by_source)} />
            <Breakdown title="BY CODEC" rows={codecRows(data.by_codec)} />
          </Grid>
        </Flex>
      )}
    </Box>
  );
}
