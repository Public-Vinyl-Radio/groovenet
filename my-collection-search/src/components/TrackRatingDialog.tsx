"use client";

import React from "react";
import { Button, chakra, Flex } from "@chakra-ui/react";
import { FiStar } from "react-icons/fi";
import RetroDialog from "@/components/ui/RetroDialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current rating, 0 for none. */
  value: number;
  /** Saves a rating (1 to 5, or 0 to clear); the dialog closes after it. */
  onChange: (value: number) => void;
};

/**
 * The phone's one-tap rating (#1119): five 44px stars and "Clear rating", opened
 * from the rating on a track card. It saves on tap, so there is nothing to confirm.
 */
export default function TrackRatingDialog({ open, onOpenChange, value, onChange }: Props) {
  const choose = (next: number) => {
    onChange(next);
    onOpenChange(false);
  };
  return (
    <RetroDialog open={open} onOpenChange={onOpenChange} title="Rate track" maxW="xs">
      <Flex direction="column" align="center" gap={3} p={4}>
        <Flex role="group" aria-label="Rating" gap={1}>
          {[1, 2, 3, 4, 5].map((star) => (
            <chakra.button
              key={star}
              type="button"
              aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
              aria-pressed={star === value}
              onClick={() => choose(star)}
              boxSize="48px"
              minW="44px"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              color={star <= value ? "accent.fg" : "fg.muted"}
              _hover={{ bg: "bg.muted" }}
            >
              <FiStar size={32} fill={star <= value ? "currentColor" : "none"} aria-hidden="true" />
            </chakra.button>
          ))}
        </Flex>
        <Button
          variant="ghost"
          size="sm"
          minH="44px"
          disabled={value === 0}
          onClick={() => choose(0)}
        >
          Clear rating
        </Button>
      </Flex>
    </RetroDialog>
  );
}
