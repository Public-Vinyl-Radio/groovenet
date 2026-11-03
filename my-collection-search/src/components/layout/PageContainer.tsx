"use client";

import { Box } from "@chakra-ui/react";
import type { ReactNode } from "react";

type PageContainerProps = {
  children: ReactNode;
  py?: number | string | Record<string, string | number>;
  mb?: number | string;
};

export default function PageContainer({ children, py, mb }: PageContainerProps) {
  return (
    <Box w="full" maxW="1360px" mx="auto" py={py} mb={mb}>
      {children}
    </Box>
  );
}
