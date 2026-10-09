"use client";

import React from "react";
import {
  Box,
  Card,
  Stack,
  Heading,
  Text,
  Button,
  Alert,
  VStack,
  HStack,
  List,
  Badge,
  Menu,
  Flex,
} from "@chakra-ui/react";
import { LuPlay, LuCheck, LuX, LuClock } from "react-icons/lu";
import { FiMoreVertical } from "react-icons/fi";
import { toaster } from "@/components/ui/toaster";
import { useMutation } from "@tanstack/react-query";
import {
  testGamdlConnection,
  type GamdlConnectionTestResponse,
} from "@/services/internalApi/settings";

export default function GamdlTestConnection() {
  const [lastResult, setLastResult] =
    React.useState<GamdlConnectionTestResponse | null>(null);

  const testMutation = useMutation({
    mutationFn: testGamdlConnection,
    onSuccess: (result) => {
      setLastResult(result);
      if (result.success) {
        toaster.create({
          title: "Connection Test Passed",
          description: result.message,
          type: "success",
        });
      } else {
        toaster.create({
          title: "Connection Test Failed",
          description: result.message,
          type: "error",
        });
      }
    },
    onError: (error) => {
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
      });
      toaster.create({
        title: "Test Failed",
        description: error.message,
        type: "error",
      });
    },
  });

  const handleTest = () => {
    testMutation.mutate();
  };

  const getStatusIcon = (status?: boolean) => {
    if (status === undefined) return <LuClock />;
    return status ? <LuCheck color="green" /> : <LuX color="red" />;
  };

  const getStatusColor = (status?: boolean) => {
    if (status === undefined) return "gray";
    return status ? "green" : "red";
  };

  return (
    <Card.Root>
      <Card.Header>
        <Flex justify="space-between" align="flex-start">
          <Box>
            <Heading size="md">Test Gamdl Connection</Heading>
            <Text color="fg.muted" fontSize="sm">
              Verify that gamdl is properly configured and working
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
                  value="test"
                  onClick={handleTest}
                  disabled={testMutation.isPending}
                >
                  <LuPlay />
                  Test Connection
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>
        </Flex>
      </Card.Header>

      <Card.Body>
        <Stack gap={4}>
          {/* Test Results */}
          {lastResult && (
            <Alert.Root status={lastResult.success ? "success" : "error"}>
              <VStack align="start" gap={2}>
                <Text fontWeight="medium">{lastResult.message}</Text>

                {/* Detailed Results */}
                {lastResult.details && (
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={2}>Test Details:</Text>
                    <List.Root listStyleType="none">
                      <List.Item>
                        <HStack>
                          {getStatusIcon(lastResult.details.gamdl_available)}
                          <Text>Gamdl executable available</Text>
                          <Badge colorPalette={getStatusColor(lastResult.details.gamdl_available)} variant="subtle">
                            {lastResult.details.gamdl_available ? "Found" : "Missing"}
                          </Badge>
                        </HStack>
                      </List.Item>

                      <List.Item>
                        <HStack>
                          {getStatusIcon(lastResult.details.cookie_file_exists)}
                          <Text>Cookie file exists</Text>
                          <Badge colorPalette={getStatusColor(lastResult.details.cookie_file_exists)} variant="subtle">
                            {lastResult.details.cookie_file_exists ? "Found" : "Missing"}
                          </Badge>
                        </HStack>
                      </List.Item>

                      {lastResult.details.cookie_file_exists && (
                        <List.Item>
                          <HStack>
                            {getStatusIcon(lastResult.details.cookie_file_valid)}
                            <Text>Cookie file valid</Text>
                            <Badge colorPalette={getStatusColor(lastResult.details.cookie_file_valid)} variant="subtle">
                              {lastResult.details.cookie_file_valid ? "Valid" : "Invalid"}
                            </Badge>
                          </HStack>
                        </List.Item>
                      )}

                      {lastResult.details.test_download_attempted && (
                        <List.Item>
                          <HStack>
                            {getStatusIcon(lastResult.details.test_download_success)}
                            <Text>Test download</Text>
                            <Badge colorPalette={getStatusColor(lastResult.details.test_download_success)} variant="subtle">
                              {lastResult.details.test_download_success ? "Success" : "Failed"}
                            </Badge>
                          </HStack>
                        </List.Item>
                      )}
                    </List.Root>

                    {lastResult.details.error_type && (
                      <Text fontSize="sm" color="red.500" mt={2}>
                        <strong>Error Type:</strong> {lastResult.details.error_type}
                      </Text>
                    )}
                  </Box>
                )}
              </VStack>
            </Alert.Root>
          )}

          {/* Information */}
          <Alert.Root status="info">
            <VStack align="start" gap={1}>
              <Text fontWeight="medium">What this test checks:</Text>
              <List.Root listStyleType="none">
                <List.Item>• Gamdl is installed and accessible</List.Item>
                <List.Item>• Cookie file exists and contains Apple Music cookies</List.Item>
                <List.Item>• Cookie file is properly formatted</List.Item>
                <List.Item>• Test authentication with Apple Music (optional)</List.Item>
              </List.Root>
            </VStack>
          </Alert.Root>

          {!lastResult && (
            <Box textAlign="center" py={4}>
              <Text color="fg.muted">
                Click &quot;Test Connection&quot; to verify your gamdl setup
              </Text>
            </Box>
          )}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
