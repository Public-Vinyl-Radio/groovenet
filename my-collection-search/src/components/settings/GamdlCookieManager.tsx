"use client";

import React, { useRef } from "react";
import {
  Box,
  Card,
  Stack,
  Heading,
  Text,
  Button,
  Alert,
  Badge,
  VStack,
  HStack,
  List,
  Icon,
  Spinner,
  Menu,
  Flex,
} from "@chakra-ui/react";
import { LuUpload, LuTrash2, LuCheck, LuX, LuRefreshCw, LuInfo } from "react-icons/lu";
import { FiMoreVertical } from "react-icons/fi";
import { toaster } from "@/components/ui/toaster";
import { useCookieStatus, useUploadCookie, useDeleteCookie } from "@/hooks/useCookieManagement";

export default function GamdlCookieManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: cookieInfo, isLoading, refetch } = useCookieStatus();
  const uploadMutation = useUploadCookie();
  const deleteMutation = useDeleteCookie();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.txt')) {
      toaster.create({
        title: "Invalid File Type",
        description: "Please select a .txt cookie file",
        type: "error",
      });
      return;
    }

    uploadMutation.mutate(file, {
      onSuccess: (data) => {
        toaster.create({
          title: "Cookie File Uploaded",
          description: data.message,
          type: "success",
        });
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      onError: (error) => {
        toaster.create({
          title: "Upload Failed",
          description: error.message,
          type: "error",
        });
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: (data) => {
        toaster.create({
          title: "Cookie File Deleted",
          description: data.message,
          type: "success",
        });
      },
      onError: (error) => {
        toaster.create({
          title: "Delete Failed",
          description: error.message,
          type: "error",
        });
      },
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleString();
  };

  return (
    <Card.Root>
      <Card.Header>
        <Flex justify="space-between" align="flex-start">
          <Box>
            <Heading size="md">Apple Music Cookie File</Heading>
            <Text color="gray.500" fontSize="sm">
              Upload your Apple Music cookies to enable gamdl downloads
            </Text>
          </Box>
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button size="sm" variant="outline">
                <FiMoreVertical />
                <Box ml={2}>Actions</Box>
              </Button>
            </Menu.Trigger>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item
                  value="upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  <LuUpload />
                  {cookieInfo?.exists ? "Replace" : "Upload"} Cookie File
                </Menu.Item>

                {cookieInfo?.exists && (
                  <Menu.Item
                    value="delete"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    color="fg.error"
                    _hover={{ bg: "bg.error", color: "fg.error" }}
                  >
                    <LuTrash2 />
                    Delete Cookie File
                  </Menu.Item>
                )}

                <Menu.Separator />

                <Menu.Item
                  value="refresh"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <LuRefreshCw />
                  Refresh Status
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>
        </Flex>
      </Card.Header>

      <Card.Body>
        <Stack gap={4}>
          {/* Status Section */}
          <Box>
            {isLoading ? (
              <HStack>
                <Spinner size="sm" />
                <Text>Checking cookie file status...</Text>
              </HStack>
            ) : cookieInfo?.exists ? (
              <VStack align="start" gap={3}>
                <HStack>
                  <Icon color="green.500">
                    <LuCheck />
                  </Icon>
                  <Text fontWeight="medium">Cookie file active</Text>
                  <Badge colorScheme={cookieInfo.isValid ? "green" : "red"} variant="subtle">
                    {cookieInfo.isValid ? "Valid" : "Invalid"}
                  </Badge>
                </HStack>

                <Box fontSize="sm" color="gray.600">
                  <Text><strong>File:</strong> {cookieInfo.filename}</Text>
                  <Text><strong>Size:</strong> {formatFileSize(cookieInfo.size)}</Text>
                  <Text><strong>Last Modified:</strong> {formatDate(cookieInfo.lastModified?.toString())}</Text>
                  <Text><strong>Cookies:</strong> {cookieInfo.cookieCount || 0}</Text>
                  <Text><strong>Apple Music:</strong> {cookieInfo.hasAppleMusic ? "✓ Found" : "✗ Not found"}</Text>
                </Box>

                {/* Validation Errors */}
                {cookieInfo.validationErrors && cookieInfo.validationErrors.length > 0 && (
                  <Alert.Root status="warning">
                    <VStack align="start" gap={1}>
                      <Text fontWeight="medium">Issues found:</Text>
                      <List.Root>
                        {cookieInfo.validationErrors.map((error, index) => (
                          <List.Item key={index}>{error}</List.Item>
                        ))}
                      </List.Root>
                    </VStack>
                  </Alert.Root>
                )}

                {/* Domain Information */}
                {cookieInfo.domains && cookieInfo.domains.length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={1}>Domains ({cookieInfo.domains.length}):</Text>
                    <Text fontSize="xs" color="gray.500">
                      {cookieInfo.domains.slice(0, 5).join(", ")}
                      {cookieInfo.domains.length > 5 && ` and ${cookieInfo.domains.length - 5} more...`}
                    </Text>
                  </Box>
                )}
              </VStack>
            ) : (
              <HStack>
                <Icon color="red.500">
                  <LuX />
                </Icon>
                <Text>No cookie file found</Text>
              </HStack>
            )}
          </Box>

          {/* Help Information */}
          <Alert.Root status="info">
            <Icon>
              <LuInfo />
            </Icon>
            <VStack align="start" gap={1}>
              <Text fontWeight="medium">How to get Apple Music cookies:</Text>
              <List.Root>
                <List.Item>1. Open your browser and go to music.apple.com</List.Item>
                <List.Item>2. Sign in to your Apple Music account</List.Item>
                <List.Item>3. Export cookies using a browser extension (e.g., &quot;Get cookies.txt&quot;)</List.Item>
                <List.Item>4. Upload the cookies.txt file here</List.Item>
              </List.Root>
            </VStack>
          </Alert.Root>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
