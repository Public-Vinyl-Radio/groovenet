"use client";

import React from "react";
import { IconButton } from "@chakra-ui/react";
import { FiX } from "react-icons/fi";

/** Cancel as a PageHeader `leading` control on form pages. Phones only: md+ keeps its inline buttons. */
export default function HeaderCancelButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <IconButton
      aria-label="Cancel"
      variant="ghost"
      boxSize="44px"
      minW="44px"
      ms={-2}
      display={{ base: "inline-flex", md: "none" }}
      onClick={onClick}
      disabled={disabled}
    >
      <FiX />
    </IconButton>
  );
}
