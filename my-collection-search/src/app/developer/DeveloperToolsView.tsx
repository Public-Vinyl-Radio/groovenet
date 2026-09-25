"use client";

import { Box, Button, Card, Heading, HStack, Icon, SimpleGrid, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { FiActivity, FiBookOpen, FiExternalLink, FiFileText } from "react-icons/fi";
import type { IconType } from "react-icons";
import PageContainer from "@/components/layout/PageContainer";

type Tool = { title: string; description: string; href: string; icon: IconType; external?: boolean };

const tools: Tool[] = [
  {
    title: "Swagger console",
    description: "Browse and exercise GrooveNet's API in Swagger UI.",
    href: "/api/docs",
    icon: FiBookOpen,
    external: true,
  },
  {
    title: "OpenAPI specification",
    description: "View the generated OpenAPI 3.1 JSON document.",
    href: "/api/openapi.json",
    icon: FiFileText,
    external: true,
  },
  {
    title: "Vinyl pipeline",
    description: "Index status, ingest health and the live detection timeline (#299).",
    href: "/vinyl",
    icon: FiActivity,
  },
];

export default function DeveloperToolsView({ storybookUrl }: { storybookUrl: string | null }) {
  return (
    <PageContainer size="wide">
      <Box mb={{ base: 8, md: 12 }}>
        <Heading size={{ base: "lg", md: "xl" }} mb={2}>
          Developer tools
        </Heading>
        <Text color="fg.muted">
          API references and component documentation for this GrooveNet instance.
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        {tools.map((tool) => (
          <Card.Root key={tool.href} variant="outline">
            <Card.Body gap={4}>
              <HStack gap={3} align="flex-start">
                <Icon as={tool.icon} boxSize={5} color="blue.500" mt={1} />
                <Box>
                  <Heading size="md">{tool.title}</Heading>
                  <Text color="fg.muted" mt={1}>{tool.description}</Text>
                </Box>
              </HStack>
              <Button asChild alignSelf="flex-start">
                {tool.external ? (
                  <NextLink href={tool.href} target="_blank" rel="noreferrer">
                    Open <FiExternalLink />
                  </NextLink>
                ) : (
                  <NextLink href={tool.href}>Open</NextLink>
                )}
              </Button>
            </Card.Body>
          </Card.Root>
        ))}

        {storybookUrl && (
          <Card.Root variant="outline">
            <Card.Body gap={4}>
              <HStack gap={3} align="flex-start">
                <Icon as={FiBookOpen} boxSize={5} color="blue.500" mt={1} />
                <Box>
                  <Heading size="md">Storybook</Heading>
                  <Text color="fg.muted" mt={1}>
                    Browse isolated UI components and their documented states.
                  </Text>
                </Box>
              </HStack>
              <Button asChild alignSelf="flex-start">
                <a href={storybookUrl} target="_blank" rel="noreferrer">
                  Open <FiExternalLink />
                </a>
              </Button>
            </Card.Body>
          </Card.Root>
        )}
      </SimpleGrid>
    </PageContainer>
  );
}
