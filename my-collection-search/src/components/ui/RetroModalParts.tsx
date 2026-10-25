"use client";

import React from "react";
import { Box, Link, Text, chakra } from "@chakra-ui/react";
import NextLink from "next/link";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";

export type ModalAction = {
  label: string;
  onClick?: () => void;
  /** An internal route (client navigation) or, with `external`, a new tab. */
  href?: string;
  external?: boolean;
  disabled?: boolean;
};

export const overline = {
  fontFamily: "label",
  fontSize: "12px",
  lineHeight: "16px",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};

export function Tile({
  icon,
  label,
  solid,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  solid?: boolean;
  /** Renders the tile as a client-navigation link. */
  href?: string;
  onClick: () => void;
}) {
  return (
    <Box
      {...(href ? { as: NextLink, href } : { as: "button" })}
      onClick={onClick}
      h="68px"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="6px"
      borderWidth="outline"
      borderColor="border.ink"
      bg={solid ? "border.ink" : "bg"}
      color={solid ? "bg" : "fg"}
      boxShadow={solid ? "sm" : "xs"}
      _hover={{ filter: "brightness(1.08)" }}
      _active={{ filter: "brightness(0.94)" }}
    >
      <Box fontSize="20px" aria-hidden="true" display="flex">
        {icon}
      </Box>
      <Text {...overline} lineHeight="14px" fontSize="11px" fontWeight="semibold">
        {label}
      </Text>
    </Box>
  );
}

export function ActionButton({ action, danger, onDone }: { action: ModalAction; danger?: boolean; onDone: () => void }) {
  const style = {
    minH: "44px",
    px: "10px",
    py: "6px",
    lineHeight: "1.2",
    display: "flex",
    alignItems: "center",
    gap: 2,
    borderWidth: "outline",
    borderColor: danger ? "status.missing.border" : "border",
    color: danger ? "danger.fg" : "fg",
    fontFamily: "label",
    fontSize: "13px",
    fontWeight: "semibold",
    letterSpacing: "0.02em",
    textAlign: "left" as const,
    minW: 0,
    _hover: { bg: danger ? "danger.subtle" : "bg.muted", textDecoration: "none" },
    _disabled: { opacity: 0.4, cursor: "not-allowed" },
  };
  const label = (
    <Text as="span" lineClamp={2}>
      {action.label}
    </Text>
  );
  if (action.href && !action.disabled) {
    return action.external ? (
      <Link {...style} href={action.href} target="_blank" rel="noopener noreferrer" onClick={onDone}>
        {label}
      </Link>
    ) : (
      <Link {...style} as={NextLink} href={action.href} onClick={onDone}>
        {label}
      </Link>
    );
  }
  return (
    <chakra.button
      {...style}
      disabled={action.disabled}
      onClick={() => {
        action.onClick?.();
        onDone();
      }}
    >
      {label}
    </chakra.button>
  );
}

export function Group({
  label,
  actions,
  danger,
  onDone,
}: {
  label: string;
  actions: ModalAction[];
  danger?: boolean;
  onDone: () => void;
}) {
  if (actions.length === 0) return null;
  return (
    <Box p="10px 14px 12px 12px" borderTopWidth="rule" borderColor="border" display="flex" flexDirection="column" gap={2}>
      <Text {...overline} color={danger ? "danger.fg" : "fg.muted"}>
        {label}
      </Text>
      <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        {actions.map((action) => (
          <ActionButton key={action.label} action={action} danger={danger} onDone={onDone} />
        ))}
      </Box>
    </Box>
  );
}


export type ModalTile = {
  label: string;
  icon: React.ReactNode;
  solid?: boolean;
  href?: string;
  onClick?: () => void;
};

/** Up to three primary tiles in one row; picking one runs it, then closes. */
export function TileRow({ tiles, onDone }: { tiles: ModalTile[]; onDone: () => void }) {
  return (
    <Box display="grid" gridTemplateColumns={`repeat(${tiles.length}, minmax(0, 1fr))`} gap="10px" p="14px 14px 12px 12px">
      {tiles.map((tile) => (
        <Tile
          key={tile.label}
          icon={tile.icon}
          label={tile.label}
          solid={tile.solid}
          href={tile.href}
          onClick={() => {
            tile.onClick?.();
            onDone();
          }}
        />
      ))}
    </Box>
  );
}

/** A position stepper: up, `NN / total`, down. The arrow at either end is disabled. */
export function PositionStepper({
  index,
  total,
  onMove,
}: {
  index: number;
  total: number;
  onMove: (toIndex: number) => void;
}) {
  const arrow = {
    boxSize: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: "outline",
    borderColor: "border.ink",
    fontSize: "18px",
    _hover: { bg: "bg.muted" },
    _disabled: { opacity: 0.35, cursor: "not-allowed", bg: "transparent" },
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      p="8px 14px 12px 12px"
      borderTopWidth="rule"
      borderColor="border"
    >
      <Text {...overline} color="fg.muted">
        Position
      </Text>
      <Box display="flex" alignItems="center" gap={2}>
        <chakra.button {...arrow} aria-label="Move up" disabled={index <= 0} onClick={() => onMove(index - 1)}>
          <FiArrowUp />
        </chakra.button>
        <Text fontFamily="label" fontSize="14px" minW="64px" textAlign="center" aria-label={`Position ${index + 1} of ${total}`}>
          {pad(index + 1)} / {pad(total)}
        </Text>
        <chakra.button {...arrow} aria-label="Move down" disabled={index >= total - 1} onClick={() => onMove(index + 1)}>
          <FiArrowDown />
        </chakra.button>
      </Box>
    </Box>
  );
}

const sectionPadding = { p: "10px 14px 12px 12px", borderTopWidth: "rule", borderColor: "border" } as const;

/** A ruled block of a filter modal, with an optional overline label. */
export function ModalSection({
  label,
  first,
  children,
}: {
  label?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box {...sectionPadding} borderTopWidth={first ? 0 : "rule"} display="flex" flexDirection="column" gap={3}>
      {label && (
        <Text {...overline} color="fg.muted">
          {label}
        </Text>
      )}
      {children}
    </Box>
  );
}

/** A 44px toggle chip: solid ink while on. */
export function ChipToggle({
  checked,
  disabled,
  onClick,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <chakra.button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
      minH="44px"
      px="12px"
      borderWidth="outline"
      borderColor="border.ink"
      bg={checked ? "border.ink" : "bg"}
      color={checked ? "bg" : "fg"}
      fontFamily="label"
      fontSize="13px"
      fontWeight="semibold"
      _hover={{ bg: checked ? "border.ink" : "bg.muted" }}
      _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
    >
      {children}
    </chakra.button>
  );
}
