import type { ReactNode } from "react";
import { Box, Grid, Heading, Text } from "@chakra-ui/react";

export default function SystemRow({
  label,
  help,
  children,
  surface = false,
}: {
  label: string;
  help: string;
  children: ReactNode;
  surface?: boolean;
}) {
  return (
    <Grid
      position="relative"
      templateColumns={{ base: "1fr", md: "30% minmax(0, 1fr)" }}
      gap={{ base: 2, md: 5 }}
      p={4}
      borderTopWidth="rule"
      borderColor="border"
      bg={surface ? "bg.subtle" : "bg"}
    >
      <Box>
        <Heading as="h3" fontSize="md" pr={{ base: label === "Remote backups" ? 14 : 0, md: 0 }}>
          {label}
        </Heading>
        <Text display={{ base: "none", md: "block" }} color="fg.muted" fontSize="sm" mt={1}>
          {help}
        </Text>
      </Box>
      <Box minW={0}>{children}</Box>
    </Grid>
  );
}
