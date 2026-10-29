import React from "react";
import { Box, Text } from "@chakra-ui/react";

type Props = {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
};

export default function LabeledSelect({ label, value, onChange, children }: Props) {
  return (
    <Box flex="1">
      <Text mb={1} fontSize="sm">
        {label}
      </Text>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%",
          height: "var(--chakra-sizes-10)",
          padding: "0 var(--chakra-spacing-3)",
          borderRadius: "var(--chakra-radii-md)",
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: "var(--chakra-colors-border)",
          backgroundColor: "var(--chakra-colors-bg)",
          color: "inherit",
          fontSize: "16px",
        }}
      >
        {children}
      </select>
    </Box>
  );
}
