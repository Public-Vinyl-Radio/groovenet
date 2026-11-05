"use client";
import { Box, Flex, Grid, Link, Spinner, Table, Text } from "@chakra-ui/react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusTag } from "@/components/ui/RoleTags";
import { useStatusInfo, useUpdateInfo, useVersionInfo } from "@/hooks/useSystemInfo";

export default function SystemStatus() {
  const version = useVersionInfo();
  const status = useStatusInfo();
  const update = useUpdateInfo();
  const services = status.data?.services ?? [];
  const up = services.filter((s) => s.status === "up").length;
  const updates = !update.data
    ? "—"
    : update.data.error
      ? "Unavailable"
      : update.data.updateAvailable
        ? `${update.data.latest} available`
        : !update.data.comparable
          ? "n/a (dev build)"
          : "Up to date";
  const rows = [
    ["Version", version.data?.version ?? "—"],
    [
      "Updates",
      update.data?.updateAvailable && update.data.releaseUrl ? (
        <Link key="release" href={update.data.releaseUrl} target="_blank" rel="noopener noreferrer">
          {updates}
        </Link>
      ) : (
        updates
      ),
    ],
    ["Environment", version.data?.nodeEnv ?? "—"],
    [
      "Commit",
      version.data?.gitSha ? (
        <Link
          key="commit"
          href={`https://github.com/Public-Vinyl-Radio/groovenet/commit/${version.data.gitSha}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {version.data.gitSha}
        </Link>
      ) : (
        "—"
      ),
    ],
    ["Built", version.data?.builtAt ? new Date(version.data.builtAt).toLocaleString() : "—"],
  ];
  return (
    <Box as="section" aria-label="Status">
      <SectionLabel
        variant="strip"
        mb={4}
        meta={
          <Text fontFamily="label" fontSize="xs" fontWeight="bold">
            {up} OF {services.length} SERVICES UP
          </Text>
        }
      >
        STATUS
      </SectionLabel>
      <Grid templateColumns={{ base: "1fr", md: "3fr 2fr" }} gap={6} alignItems="start">
        <Box
          borderWidth="outline"
          borderColor="border.ink"
          boxShadow="md"
          borderRadius="md"
          overflow="clip"
        >
          {status.isLoading ? (
            <Spinner m={4} aria-label="Loading services" />
          ) : status.error ? (
            <Text p={4} color="fg.error" role="alert">
              {status.error.message}
            </Text>
          ) : (
            <Table.Root size="sm">
              <Table.Header display={{ base: "none", md: "table-header-group" }} bg="bg.subtle">
                <Table.Row bg="bg.subtle">
                  {["SERVICE", "RESPONSE", "STATE"].map((label, i) => (
                    <Table.ColumnHeader
                      key={label}
                      p={4}
                      fontFamily="mono"
                      fontSize="xs"
                      width={i === 1 ? "110px" : i === 2 ? "80px" : undefined}
                      textAlign={i ? "right" : "left"}
                    >
                      {label}
                    </Table.ColumnHeader>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {services.map((s) => (
                  <Table.Row key={s.service} title={s.detail}>
                    <Table.Cell px={4} py={3} fontWeight="bold">
                      {s.service}
                      {s.detail && s.status !== "up" ? (
                        <Text fontSize="xs" fontWeight="normal" color="fg.muted">
                          {s.detail}
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell
                      px={2}
                      py={3}
                      textAlign="right"
                      fontFamily="mono"
                      fontSize="xs"
                      whiteSpace="nowrap"
                    >
                      {s.latencyMs != null && s.status === "up" ? `${s.latencyMs} MS` : "—"}
                    </Table.Cell>
                    <Table.Cell pl={0} pr={4} py={3} textAlign="right">
                      <StatusTag
                        tone={
                          s.status === "up"
                            ? "neutral"
                            : s.status === "down"
                              ? "missing"
                              : "analysis"
                        }
                      >
                        {s.status}
                      </StatusTag>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
        <Box
          display={{ base: "none", md: "block" }}
          borderWidth="outline"
          borderRadius="md"
          overflow="clip"
          borderColor="border.ink"
          boxShadow="md"
        >
          <Text
            bg="bg.subtle"
            borderBottomWidth="outline"
            borderColor="border.ink"
            p={4}
            fontFamily="mono"
            fontSize="xs"
            fontWeight="bold"
          >
            BUILD
          </Text>
          {version.isLoading ? (
            <Spinner m={4} />
          ) : version.error ? (
            <Text p={4} role="alert" color="fg.error">
              {version.error.message}
            </Text>
          ) : (
            rows.map(([label, value]) => (
              <Flex
                key={String(label)}
                justify="space-between"
                gap={4}
                p={4}
                borderBottomWidth="rule"
                borderColor="border"
              >
                <Text color="fg.muted" fontSize="sm">
                  {label}
                </Text>
                <Box
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight="bold"
                  textAlign="right"
                  overflowWrap="anywhere"
                >
                  {value}
                </Box>
              </Flex>
            ))
          )}
        </Box>
      </Grid>
      <Text
        display={{ base: "block", md: "none" }}
        fontFamily="mono"
        fontSize="xs"
        color="fg.muted"
        mt={4}
      >
        VERSION {version.data?.version ?? "—"} · {updates.toUpperCase()} ·{" "}
        {version.data?.nodeEnv?.toUpperCase() ?? "—"}
      </Text>
    </Box>
  );
}
