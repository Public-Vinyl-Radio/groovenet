import { Box, Button, Card, Heading, HStack, Icon, SimpleGrid, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { FiBookOpen, FiExternalLink, FiFileText } from "react-icons/fi";
import PageContainer from "@/components/layout/PageContainer";
import { developerToolsEnabled, storybookUrl } from "@/lib/developerTools";

export const dynamic = "force-dynamic";

const tools = [
  {
    title: "Swagger console",
    description: "Browse and exercise GrooveNet's API in Swagger UI.",
    href: "/api/docs",
    icon: FiBookOpen,
  },
  {
    title: "OpenAPI specification",
    description: "View the generated OpenAPI 3.1 JSON document.",
    href: "/api/openapi.json",
    icon: FiFileText,
  },
];

export default function DeveloperPage() {
  if (!developerToolsEnabled()) {
    notFound();
  }

  const configuredStorybookUrl = storybookUrl();

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
                <NextLink href={tool.href} target="_blank" rel="noreferrer">
                  Open <FiExternalLink />
                </NextLink>
              </Button>
            </Card.Body>
          </Card.Root>
        ))}

        {configuredStorybookUrl && (
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
                <a href={configuredStorybookUrl} target="_blank" rel="noreferrer">
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
