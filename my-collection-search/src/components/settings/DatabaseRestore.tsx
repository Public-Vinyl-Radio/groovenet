"use client";
import React from "react";
import { Box, Button, Flex, Heading, Input, Text } from "@chakra-ui/react";
import { FiUpload } from "react-icons/fi";
import RetroDialog from "@/components/ui/RetroDialog";
import { DIGITAL_HATCH } from "@/components/spins/recapParts";
import { useRestoreDatabaseMutation } from "@/hooks/useRestoreDatabaseMutation";

export default function DatabaseRestore() {
  const [file, setFile] = React.useState<File | null>(null);
  const [open, setOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [result, setResult] = React.useState("");
  const [error, setError] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  const cancel = React.useRef<HTMLButtonElement>(null);
  const { mutateAsync, isPending } = useRestoreDatabaseMutation();
  const restore = async () => {
    if (!file || confirmation !== "RESTORE") return;
    setError("");
    setResult("");
    try {
      const data = await mutateAsync(file);
      setResult(data.message || "Restore complete");
      setOpen(false);
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Box as="section" aria-label="Danger zone" mt={8}>
      <Flex align="center" gap={3} mb={4}>
        <Box
          bgImage={DIGITAL_HATCH}
          p="3px"
          borderWidth="outline"
          borderColor="border.ink"
          borderRadius="md"
        >
          <Heading as="h2" bg="bg" fontFamily="mono" fontSize="xs" px={2}>
            DANGER ZONE
          </Heading>
        </Box>
        <Box flex="1" h="2px" bg="fg" />
      </Flex>
      <Box
        borderWidth="outline"
        borderStyle="dashed"
        borderColor="border.ink"
        p={4}
        borderRadius="md"
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          gap={5}
          align={{ base: "stretch", md: "center" }}
        >
          <Box w={{ base: "full", md: "30%" }}>
            <Heading as="h3" fontSize="md">
              Restore the database
            </Heading>
            <Text color="fg.muted" fontSize="sm" mt={1}>
              Replaces everything in the database with a .sql or .dump backup file. This can’t be
              undone.
            </Text>
          </Box>
          <input
            ref={input}
            type="file"
            accept=".sql,.dump,.backup"
            aria-label="Choose restore file"
            hidden
            disabled={isPending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            borderWidth="outline"
            borderRadius="md"
            borderColor="border.ink"
            onClick={() => input.current?.click()}
            disabled={isPending}
          >
            <FiUpload /> CHOOSE FILE
          </Button>
          <Text
            color="fg.muted"
            fontSize="sm"
            overflowWrap="anywhere"
            display={{ base: file ? "block" : "none", md: "block" }}
          >
            {file?.name ?? "No file chosen"}
          </Text>
          <Button
            ml={{ base: 0, md: "auto" }}
            variant="outline"
            borderWidth="outline"
            borderRadius="md"
            borderColor="border.ink"
            borderStyle="dashed"
            disabled={!file || isPending}
            onClick={() => {
              setConfirmation("");
              setError("");
              setOpen(true);
            }}
          >
            RESTORE…
          </Button>
        </Flex>
      </Box>
      <Text mt={3} fontSize="xs" color="fg.muted">
        Restoring asks you to type RESTORE before it starts.
      </Text>
      {result && (
        <Text role="status" mt={3}>
          {result}
        </Text>
      )}
      <RetroDialog
        open={open}
        onOpenChange={setOpen}
        role="alertdialog"
        title="Restore the database"
        dismissible={!isPending}
        initialFocusEl={() => cancel.current}
      >
        <Box p={4}>
          <Text mb={4}>
            This will overwrite the current database with {file?.name}. This can’t be undone.
          </Text>
          <label htmlFor="restore-confirmation">Type RESTORE to confirm</label>
          <Input
            id="restore-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            mt={2}
          />
          {error && (
            <Text role="alert" color="fg.error" mt={3}>
              {error}
            </Text>
          )}
          <Flex gap={3} mt={4}>
            <Button ref={cancel} flex={1} onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              flex={1}
              variant="solid"
              colorPalette="danger"
              disabled={confirmation !== "RESTORE" || isPending}
              loading={isPending}
              onClick={() => void restore()}
            >
              Restore database
            </Button>
          </Flex>
        </Box>
      </RetroDialog>
    </Box>
  );
}
