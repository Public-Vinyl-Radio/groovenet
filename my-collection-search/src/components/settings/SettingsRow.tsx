"use client";

import React from "react";
import { Box, Grid, Text } from "@chakra-ui/react";

type SettingsRowProps = {
  label: string;
  /** One or two sentences under the label: what the setting does, where it applies. */
  help?: React.ReactNode;
  /** The control: a segment group, a switch, a select, a button. */
  children: React.ReactNode;
  /** A rule above the row, for a row that follows another inside one block. */
  divider?: boolean;
};

/**
 * One setting: label and help on the left, the control on the right from `md`
 * up, stacked on a phone. The row is a named group, so the control it holds is
 * announced with its label and help.
 */
export default function SettingsRow({ label, help, children, divider = false }: SettingsRowProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  return (
    <Grid
      role="group"
      aria-labelledby={labelId}
      aria-describedby={help ? helpId : undefined}
      data-testid="settings-row"
      templateColumns={{ base: "minmax(0, 1fr)", md: "minmax(0, 1fr) auto" }}
      gap={{ base: 2.5, md: 6 }}
      alignItems={{ base: "stretch", md: "center" }}
      py={4}
      borderTopWidth={divider ? "rule" : 0}
      borderColor="border"
    >
      <Box minW={0}>
        <Text id={labelId} fontSize="md" lineHeight="24px" fontWeight="semibold">
          {label}
        </Text>
        {help ? (
          <Text id={helpId} mt={1} fontSize="sm" lineHeight="20px" color="fg.muted" maxW="520px">
            {help}
          </Text>
        ) : null}
      </Box>
      <Box minW={0}>{children}</Box>
    </Grid>
  );
}
