"use client";

import React from "react";
import NextLink from "next/link";
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useStatusInfo } from "@/hooks/useSystemInfo";
import { readFirstImportFlag, writeFirstImportFlag } from "@/lib/firstImport";
import { checklistSteps } from "./firstImportSteps";

/**
 * Shown on Home once an import started from an empty library has put records in it (#1246): what
 * to try next, each step naming the profile or key it needs. Per device and dismissible; it
 * never shows for a library that was already filled.
 */
export default function FirstImportChecklist() {
  // Read after mount: the server render has no localStorage.
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => setVisible(readFirstImportFlag() === "pending"), []);
  const status = useStatusInfo();
  if (!visible) return null;

  const dismiss = () => {
    writeFirstImportFlag("dismissed");
    setVisible(false);
  };

  return (
    <Box
      as="section"
      aria-labelledby="first-import-heading"
      borderWidth="outline"
      borderColor="border.ink"
      borderRadius="md"
      boxShadow="md"
      bg="bg.panel"
      mr="6px"
      p={{ base: 4, md: 5 }}
    >
      <SectionHeading
        id="first-import-heading"
        actions={
          <Button
            variant="ghost"
            size="sm"
            minH="44px"
            minW="44px"
            aria-label="Dismiss"
            onClick={dismiss}
          >
            <LuX aria-hidden="true" />
          </Button>
        }
      >
        Your library is in. What next?
      </SectionHeading>
      <Box as="ol" listStyleType="none" m={0} p={0} mt={2}>
        {checklistSteps(status.data?.services).map((step) => (
          <Flex
            as="li"
            key={step.id}
            direction="column"
            gap="2px"
            py={2}
            borderTopWidth="rule"
            borderColor="border"
          >
            <Link
              asChild
              minH="44px"
              display="inline-flex"
              alignItems="center"
              alignSelf="flex-start"
              fontWeight="semibold"
            >
              <NextLink href={step.href}>{step.title}</NextLink>
            </Link>
            <Text color="fg.muted">{step.detail}</Text>
            {step.needs && (
              <Text color="fg.muted" fontSize="sm">
                Needs {step.needs}.
              </Text>
            )}
          </Flex>
        ))}
      </Box>
    </Box>
  );
}
