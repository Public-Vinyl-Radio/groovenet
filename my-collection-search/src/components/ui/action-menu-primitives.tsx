"use client";

import React from "react";
import { Box } from "@chakra-ui/react";

export const menuDivider = (
  <Box
    as="hr"
    my={1}
    borderColor="border"
    _dark={{ borderColor: "border" }}
    borderWidth={0}
    borderTopWidth={1}
  />
);
