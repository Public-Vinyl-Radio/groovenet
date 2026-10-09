import React, { useState } from "react";
import {
  Box,
  Heading,
  Text,
  HStack,
  Button,
  FileUpload,
  CloseButton,
  Alert,
} from "@chakra-ui/react";
import { HiUpload } from "react-icons/hi";
import { useRestoreDatabaseMutation } from "@/hooks/useRestoreDatabaseMutation";

const DatabaseRestore: React.FC = () => {
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const { mutateAsync: restoreMutation, isPending: isRestoring } =
    useRestoreDatabaseMutation();

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoreResult(null);
    setRestoreError(null);
    try {
      const data = await restoreMutation(restoreFile);
      setRestoreResult((data?.message as string) || "Restore complete");
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Box mt={{ base: 6, md: 10 }} mb={8} p={4} borderWidth={1} borderRadius="md">
      <Heading size="md" mb={2}>
        Restore Full Database
      </Heading>
      <Text mb={2}>
        Upload a PostgreSQL backup file (`.sql` or `.dump`) to fully restore
        schema and data. This will overwrite the current database.
      </Text>
      {restoreError && (
        <Alert.Root status="error" title="Error" mb={4}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Restore Error</Alert.Title>
            <Alert.Description>{restoreError}</Alert.Description>
          </Alert.Content>
          <CloseButton
            pos="relative"
            top="-2"
            insetEnd="-2"
            onClick={() => setRestoreError(null)}
          />
        </Alert.Root>
      )}
      {restoreResult && (
        <Alert.Root status="success" title="Restore Complete" mb={4}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Restore Complete</Alert.Title>
            <Alert.Description>{restoreResult}</Alert.Description>
          </Alert.Content>
          <CloseButton
            pos="relative"
            top="-2"
            insetEnd="-2"
            onClick={() => setRestoreResult(null)}
          />
        </Alert.Root>
      )}
      <HStack mb={4} align="stretch" flexDirection={{ base: "column", md: "row" }}>
        <FileUpload.Root
          accept=".sql,.dump,.backup"
          onChange={(event) => {
            const input = event.target as HTMLInputElement;
            const fileList = input.files;
            if (fileList && fileList[0]) setRestoreFile(fileList[0]);
          }}
          disabled={isRestoring}
        >
          <FileUpload.HiddenInput />
          <FileUpload.Trigger asChild>
            <Button variant="outline" size="sm" width={{ base: "full", md: "auto" }}>
              <HiUpload /> Upload file
            </Button>
          </FileUpload.Trigger>
          <FileUpload.List />
        </FileUpload.Root>
        <Button
          colorPalette="red"
          onClick={handleRestore}
          disabled={!restoreFile || isRestoring}
          loading={isRestoring}
          width={{ base: "full", md: "auto" }}
        >
          Restore Database
        </Button>
      </HStack>
    </Box>
  );
};

export default DatabaseRestore;
