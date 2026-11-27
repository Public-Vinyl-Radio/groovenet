"use client";

import React from "react";
import { Box, Link, Text, VStack } from "@chakra-ui/react";
import { StatusTag } from "@/components/ui/RoleTags";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";
import {
  EMBEDDING_CUTOVER_URL,
  INTEGRATION_KEYS,
  embeddingGuidance,
  integrationKeyIds,
  type EmbeddingGuidance,
  type IntegrationKeyId,
  type IntegrationStatus,
} from "@/lib/integrationKeys";
import SettingsRow from "./SettingsRow";

export const INTEGRATIONS_INTRO =
  "Optional API keys and what each one unlocks. Keys are set in your install’s .env, never here; this page only shows whether they are configured.";

const EMBEDDING_COPY: Record<EmbeddingGuidance, string> = {
  local:
    "Suggestions and semantic search use the bundled local embedding model. No OpenAI key is needed.",
  upgrade:
    "An OpenAI key is set, but this library still serves local embeddings. Adding a key never switches vectors on its own. To upgrade, set the target model, re-embed, then switch serving.",
  cutover:
    "The target model is already OpenAI, but suggestions still serve the previous embeddings. Finish the re-embed, then switch serving.",
  openai: "Suggestions and semantic search use OpenAI embeddings.",
  "openai-key-missing":
    "This library uses OpenAI embeddings, but no OpenAI key is configured, so new tracks cannot be embedded. Set OPENAI_API_KEY again, or switch back to the local model.",
};

const needsCutoverLink = (guidance: EmbeddingGuidance) =>
  guidance === "upgrade" || guidance === "cutover" || guidance === "openai-key-missing";

function KeyRow({ id, status }: { id: IntegrationKeyId; status: IntegrationStatus }) {
  const info = INTEGRATION_KEYS[id];
  const configured = status.keys[id].configured;
  return (
    <SettingsRow
      label={`${info.label} API key`}
      help={
        <>
          {info.unlocks}{" "}
          {configured ? null : (
            <>
              Set <code>{info.envVar}</code> in your install’s <code>.env</code> and restart the
              app.
            </>
          )}
        </>
      }
      divider
    >
      <StatusTag tone={configured ? "neutral" : "missing"}>
        {configured ? "Configured" : "Not configured"}
      </StatusTag>
    </SettingsRow>
  );
}

/** Settings → Integrations (#1279): which optional keys are set, what they unlock, and the OpenAI cutover. */
export default function IntegrationsSettingsSection(): React.JSX.Element {
  const { isOwner, status, error } = useIntegrationStatus();

  if (!isOwner) return <Text>Only the owner profile can see integration settings.</Text>;
  if (!status) {
    return <Text role={error ? "alert" : "status"}>{error?.message ?? "Loading…"}</Text>;
  }

  const guidance = embeddingGuidance(status);
  return (
    <VStack align="stretch" gap={0}>
      {integrationKeyIds.map((id) => (
        <KeyRow key={id} id={id} status={status} />
      ))}
      <Box borderTopWidth="rule" borderColor="border" py={4} data-testid="embedding-guidance">
        <Text fontSize="md" lineHeight="24px" fontWeight="semibold">
          Embeddings
        </Text>
        <Text mt={1} fontSize="sm" lineHeight="20px" color="fg.muted" maxW="620px">
          {EMBEDDING_COPY[guidance]}
          {needsCutoverLink(guidance) ? (
            <>
              {" "}
              <Link
                href={EMBEDDING_CUTOVER_URL}
                target="_blank"
                rel="noreferrer"
                color="fg"
                textDecoration="underline"
              >
                Switching a kind’s model
              </Link>
            </>
          ) : null}
        </Text>
      </Box>
    </VStack>
  );
}
