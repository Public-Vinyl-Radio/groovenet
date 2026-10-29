"use client";

import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";

type PageContainerProps = {
  children: ReactNode;
  size?: "narrow" | "standard" | "wide";
  py?: number | string | Record<string, string | number>;
  mb?: number | string;
};

const SIZE_TO_MAX_WIDTH: Record<NonNullable<PageContainerProps["size"]>, string> = {
  narrow: "960px",
  standard: "1120px",
  wide: "1360px",
};

export default function PageContainer({ children, size = "wide", py, mb }: PageContainerProps) {
  return (
    <Box w="full" maxW={SIZE_TO_MAX_WIDTH[size]} mx="auto" py={py} mb={mb}>
      {children}
    </Box>
  );
}
