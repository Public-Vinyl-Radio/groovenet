"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Flex, IconButton, Link, Text } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";
import {
  INTEGRATION_KEYS,
  missingKeys,
  missingSignature,
  readDismissedSignature,
  shouldShowNotice,
  writeDismissedSignature,
  type IntegrationKeyId,
} from "@/lib/integrationKeys";
import { settingsHref } from "./settingsSections";

/**
 * A short, dismissible pointer to Settings → Integrations (#1279), shown where
 * a missing optional key is felt. It is owner-only (the status route is), and
 * dismissal is per device: it holds until the set of missing keys changes, and
 * is forgotten once every key is configured.
 *
 * `keys` is what this surface needs; the notice names only those, but the
 * dismissal is keyed on the full missing set so every surface agrees.
 */
export default function ApiKeyNotice({ keys }: { keys: readonly IntegrationKeyId[] }) {
  const { status } = useIntegrationStatus();
  // null until read on the client, so the server markup and first paint agree.
  const [dismissed, setDismissed] = React.useState<string | null | undefined>(undefined);

  const missing = status ? missingKeys(status.keys) : [];
  const signature = missingSignature(missing);

  React.useEffect(() => {
    setDismissed(readDismissedSignature());
  }, []);

  React.useEffect(() => {
    if (status && missing.length === 0 && readDismissedSignature() !== null) {
      writeDismissedSignature(null);
      setDismissed(null);
    }
    // `signature` stands for `missing`, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, signature]);

  const relevant = missing.filter((id) => keys.includes(id));
  if (!status || dismissed === undefined || relevant.length === 0) return null;
  if (!shouldShowNotice(missing, dismissed)) return null;

  const dismiss = () => {
    writeDismissedSignature(signature);
    setDismissed(signature);
  };

  const names = relevant.map((id) => INTEGRATION_KEYS[id].label).join(" and ");
  return (
    <Box
      role="status"
      data-testid="api-key-notice"
      borderWidth="outline"
      borderColor="border.ink"
      p={3}
      mb={4}
    >
      <Flex align="flex-start" gap={3}>
        <Text flex="1" fontSize="sm" lineHeight="20px">
          No {names} API key is configured.{" "}
          {relevant.map((id) => INTEGRATION_KEYS[id].unlocks).join(" ")}{" "}
          <Link asChild fontWeight="semibold">
            <NextLink href={settingsHref("integrations")}>See how to add it</NextLink>
          </Link>
        </Text>
        <IconButton
          aria-label="Dismiss"
          variant="ghost"
          size="xs"
          onClick={dismiss}
          data-testid="api-key-notice-dismiss"
        >
          <FiX />
        </IconButton>
      </Flex>
    </Box>
  );
}
