"use client";

import React from "react";
import {
  Box,
  Heading,
  Text,
  Tabs,
} from "@chakra-ui/react";
import GamdlCookieManager from "./GamdlCookieManager";
import GamdlTestConnection from "./GamdlTestConnection";


export default function GamdlSettingsSection(): React.JSX.Element {
  return (
    <Box>
      <Box mb={6} mt={4}>
        <Heading size="lg" mb={2}>Gamdl Settings</Heading>
        <Text color="gray.500">
          Configure Apple Music downloads using gamdl
        </Text>
      </Box>

      <Tabs.Root defaultValue="cookies" variant="enclosed">
        <Tabs.List>
          <Tabs.Trigger value="cookies">Cookie Management</Tabs.Trigger>
          <Tabs.Trigger value="test">Test Connection</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="cookies">
          <Box pt={4}>
            <GamdlCookieManager />
          </Box>
        </Tabs.Content>

        <Tabs.Content value="test">
          <Box pt={4}>
            <GamdlTestConnection />
          </Box>
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
}
