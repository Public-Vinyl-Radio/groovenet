"use client";

import React from "react";
import { Box, Tabs } from "@chakra-ui/react";
import GamdlCookieManager from "./GamdlCookieManager";
import GamdlTestConnection from "./GamdlTestConnection";

export default function GamdlSettingsSection(): React.JSX.Element {
  return (
    <Box>
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
