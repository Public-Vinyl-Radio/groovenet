"use client";

import React, { useRef } from "react";
import { Box, Button, Flex, List, Spinner, Text } from "@chakra-ui/react";
import { useMutation } from "@tanstack/react-query";
import { StatusTag } from "@/components/ui/RoleTags";
import { toaster } from "@/components/ui/toaster";
import { useCookieStatus, useUploadCookie, useDeleteCookie } from "@/hooks/useCookieManagement";
import {
  testGamdlConnection,
  type GamdlConnectionTestResponse,
} from "@/services/internalApi/settings";
import SettingsRow from "./SettingsRow";

export const APPLE_MUSIC_INTRO =
  "Downloads from Apple Music feed audio analysis and vinyl play tracking. They need a cookie file from your signed-in browser.";

const HELP_STEPS = [
  "Open music.apple.com in your browser and sign in.",
  "Export your cookies with a browser extension such as “Get cookies.txt”.",
  "Upload the cookies.txt file above.",
];

const formatDate = (value: Date | string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Settings → Apple Music (#971): the cookie file and a connection test. */
export default function AppleMusicSettingsSection(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: cookieInfo, isLoading } = useCookieStatus();
  const uploadMutation = useUploadCookie();
  const deleteMutation = useDeleteCookie();
  const [lastResult, setLastResult] = React.useState<GamdlConnectionTestResponse | null>(null);

  const testMutation = useMutation({
    mutationFn: testGamdlConnection,
    onSuccess: setLastResult,
    onError: (error) =>
      setLastResult({
        success: false,
        message: error.message,
        details: {
          gamdl_available: false,
          cookie_file_exists: false,
          cookie_file_valid: false,
          test_download_attempted: false,
          test_download_success: false,
          error_type: "request_error",
        },
      }),
  });

  const hasCookies = Boolean(cookieInfo?.exists);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const clear = () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    if (!file.name.endsWith(".txt")) {
      toaster.create({
        title: "Invalid file type",
        description: "Please select a .txt cookie file",
        type: "error",
      });
      clear();
      return;
    }
    uploadMutation.mutate(file, {
      onSuccess: (data) => {
        setLastResult(null);
        toaster.create({
          title: "Cookie file uploaded",
          description: data.message,
          type: "success",
        });
        clear();
      },
      onError: (error) => {
        toaster.create({ title: "Upload failed", description: error.message, type: "error" });
        clear();
      },
    });
  };

  const handleDelete = () =>
    deleteMutation.mutate(undefined, {
      onSuccess: (data) => {
        setLastResult(null);
        toaster.create({
          title: "Cookie file removed",
          description: data.message,
          type: "success",
        });
      },
      onError: (error) =>
        toaster.create({ title: "Remove failed", description: error.message, type: "error" }),
    });

  const chip = isLoading ? (
    <Spinner size="sm" />
  ) : hasCookies ? (
    <StatusTag tone={cookieInfo?.isValid ? "success" : "missing"}>
      {cookieInfo?.isValid === false
        ? "Invalid cookie file"
        : cookieInfo?.lastModified
          ? `Uploaded ${formatDate(cookieInfo.lastModified)}`
          : "Uploaded"}
    </StatusTag>
  ) : (
    <StatusTag tone="missing">No cookie file</StatusTag>
  );

  return (
    <Flex direction="column" gap={6}>
      <Box borderWidth="outline" borderColor="border.ink" borderRadius="md" px={{ base: 4, md: 5 }}>
        <SettingsRow
          label="Cookie file"
          help="Your Apple Music session, exported from the browser."
        >
          <Flex align="center" gap={3} flexWrap="wrap">
            {chip}
            <Button
              size="sm"
              variant="outline"
              loading={uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {hasCookies ? "Replace cookies.txt" : "Upload cookies.txt"}
            </Button>
            {hasCookies ? (
              <Button
                size="sm"
                variant="ghost"
                colorPalette="danger"
                loading={deleteMutation.isPending}
                onClick={handleDelete}
              >
                Remove
              </Button>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              aria-label="Cookie file"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
          </Flex>
          {hasCookies && cookieInfo?.validationErrors?.length ? (
            <Text mt={2} fontSize="sm" color="fg.error">
              {cookieInfo.validationErrors.join(" ")}
            </Text>
          ) : null}
        </SettingsRow>

        <SettingsRow
          divider
          label="Connection"
          help="Checks that downloads can sign in with the uploaded cookies."
        >
          <Flex align="center" gap={3} flexWrap="wrap">
            <Button
              size="sm"
              variant="outline"
              disabled={!hasCookies}
              loading={testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              Test connection
            </Button>
            {lastResult ? (
              <Box role="status" aria-live="polite" minW={0}>
                <StatusTag tone={lastResult.success ? "success" : "missing"}>
                  {lastResult.success ? "Connected" : "Failed"}
                </StatusTag>{" "}
                <Text as="span" fontSize="sm" color="fg.muted">
                  {lastResult.message}
                </Text>
              </Box>
            ) : null}
          </Flex>
        </SettingsRow>
      </Box>

      <Box>
        <Text
          fontFamily="label"
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="0.06em"
          textTransform="uppercase"
          mb={2}
        >
          Get your cookies
        </Text>
        <List.Root as="ol" ps={5} gap={1} fontSize="sm" color="fg.muted" listStyleType="decimal">
          {HELP_STEPS.map((step) => (
            <List.Item key={step}>{step}</List.Item>
          ))}
        </List.Root>
        <Text mt={3} fontSize="sm" color="fg.muted">
          Cookies expire. If downloads start failing, export a fresh file and upload it again.
        </Text>
      </Box>
    </Flex>
  );
}
